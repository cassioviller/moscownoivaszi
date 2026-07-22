import { Router, type IRouter } from "express";
import {
  db,
  orcamentosTable,
  lojasTable,
  leadsTable,
  orcamentoItensTable,
  orcamentoVersoesTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, isNull, asc, desc } from "drizzle-orm";
import {
  GetOrcamentoPublicoQueryParams,
  GetOrcamentoPublicoResponse,
  AceitarOrcamentoPublicoQueryParams,
  AceitarOrcamentoPublicoResponse,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";

/**
 * Rota PÚBLICA do orçamento (E13) — sem sessão: quem tem o token (256 bits
 * aleatórios) é a capability, mesmo modelo do convite E6. Token em QUERY,
 * nunca no path: o pino-http loga `req.url.split("?")[0]` e o token jamais
 * cai em log.
 *
 * Montado antes dos routers de domínio em routes/index.ts — eles aplicam
 * requireSessaoComLoja sem path e esta rota morreria num 401.
 */
const router: IRouter = Router();

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

router.get("/orcamentos/publico", async (req, res): Promise<void> => {
  const parsed = GetOrcamentoPublicoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [linha] = await db
    .select({ orcamento: orcamentosTable, lojaNome: lojasTable.nome, noivaNome: leadsTable.noivaNome })
    .from(orcamentosTable)
    .innerJoin(lojasTable, eq(lojasTable.id, orcamentosTable.lojaId))
    .innerJoin(leadsTable, eq(leadsTable.id, orcamentosTable.leadId))
    .where(eq(orcamentosTable.publicoToken, parsed.data.token));
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  const { orcamento, lojaNome, noivaNome } = linha;
  if (!orcamento.publicoExpiraEm || orcamento.publicoExpiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // Primeira abertura carimba o aviso à loja. UPDATE condicional em vez de
  // check-then-set: duas abas abertas ao mesmo tempo não regravam o instante.
  await db.update(orcamentosTable)
    .set({ publicoAbertoEm: new Date() })
    .where(and(eq(orcamentosTable.id, orcamento.id), isNull(orcamentosTable.publicoAbertoEm)));

  // E75: a noiva vê a última versão ENVIADA — a edição posterior não muda o
  // que está sob os olhos dela. Orçamento anterior ao versionamento (sem
  // versão gravada) cai no conteúdo vivo, como sempre foi.
  const [versao] = await db
    .select()
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  if (versao) {
    res.json(GetOrcamentoPublicoResponse.parse({
      lojaNome,
      noivaNome,
      status: orcamento.status,
      validade: orcamento.validade,
      observacoes: orcamento.observacoes,
      descontoTipo: versao.descontoTipo,
      descontoValor: versao.descontoValor,
      totalBruto: versao.totalBruto,
      totalLiquido: versao.totalLiquido,
      versaoNumero: versao.numero,
      aceitoEm: orcamento.aceitoEm,
      itens: versao.itens,
    }));
    return;
  }

  const itens = await db
    .select()
    .from(orcamentoItensTable)
    .where(eq(orcamentoItensTable.orcamentoId, orcamento.id))
    .orderBy(asc(orcamentoItensTable.createdAt));

  // O mesmo cálculo da tela de gestão — a noiva e a vendedora precisam ver o
  // MESMO número.
  const totalBruto = round2(itens.reduce((acc, it) => acc + it.quantidade * it.valorUnitario, 0));
  let totalLiquido = totalBruto;
  if (orcamento.descontoTipo === "PERCENTUAL" && orcamento.descontoValor) {
    totalLiquido = round2(totalBruto * (1 - orcamento.descontoValor / 100));
  } else if (orcamento.descontoTipo === "VALOR" && orcamento.descontoValor) {
    totalLiquido = round2(totalBruto - orcamento.descontoValor);
  }

  res.json(GetOrcamentoPublicoResponse.parse({
    lojaNome,
    noivaNome,
    status: orcamento.status,
    validade: orcamento.validade,
    observacoes: orcamento.observacoes,
    descontoTipo: orcamento.descontoTipo,
    descontoValor: orcamento.descontoValor,
    totalBruto,
    totalLiquido: Math.max(0, totalLiquido),
    versaoNumero: null,
    aceitoEm: orcamento.aceitoEm,
    itens: itens.map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    })),
  }));
});

// E74: o aceite — "ela viu" vira "ela concordou com ESTA versão". Sem sessão:
// o token É a capability, e o autor na trilha é a própria noiva, desnormalizado.
router.post("/orcamentos/publico/aceite", async (req, res): Promise<void> => {
  const parsed = AceitarOrcamentoPublicoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [linha] = await db
    .select({ orcamento: orcamentosTable, noivaNome: leadsTable.noivaNome })
    .from(orcamentosTable)
    .innerJoin(leadsTable, eq(leadsTable.id, orcamentosTable.leadId))
    .where(eq(orcamentosTable.publicoToken, parsed.data.token));
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  const { orcamento, noivaNome } = linha;
  if (!orcamento.publicoExpiraEm || orcamento.publicoExpiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // Idempotente: o clique duplo devolve o aceite que já existe.
  if (orcamento.aceitoEm) {
    res.json(AceitarOrcamentoPublicoResponse.parse({ aceitoEm: orcamento.aceitoEm }));
    return;
  }
  if (orcamento.status !== "ENVIADO") {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${orcamento.status}` });
    return;
  }

  const [versao] = await db
    .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  const agora = new Date();
  const aceito = await db.transaction(async (tx) => {
    // UPDATE condicional: duas abas aceitando ao mesmo tempo gravam UM aceite.
    const [atualizado] = await tx
      .update(orcamentosTable)
      .set({
        aceitoEm: agora,
        aceiteVersao: versao?.numero ?? null,
        aceiteHash: versao?.hash ?? null,
        status: "APROVADO",
        aprovadoEm: agora,
        updatedAt: agora,
      })
      .where(and(eq(orcamentosTable.id, orcamento.id), isNull(orcamentosTable.aceitoEm)))
      .returning();
    if (!atualizado) return null;

    // Direto na tabela, não pelo helper: o aceite não tem sessão — o autor é
    // a noiva, com usuarioId nulo e o nome desnormalizado, como o schema (E10)
    // sempre permitiu.
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: orcamento.lojaId,
      usuarioId: null,
      usuarioNome: `${noivaNome} (link público)`,
      acao: "ORCAMENTO_ACEITO",
      entidade: "orcamento",
      entidadeId: orcamento.id,
      detalhe: { versao: versao?.numero ?? null, hash: versao?.hash ?? null },
    });
    return atualizado;
  });

  res.json(
    AceitarOrcamentoPublicoResponse.parse({ aceitoEm: aceito?.aceitoEm ?? agora }),
  );
});

export default router;
