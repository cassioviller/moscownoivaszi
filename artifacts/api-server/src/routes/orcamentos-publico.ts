import { Router, type IRouter } from "express";
import { db, orcamentosTable, lojasTable, leadsTable, orcamentoItensTable } from "@workspace/db";
import { eq, and, isNull, asc } from "drizzle-orm";
import { GetOrcamentoPublicoQueryParams, GetOrcamentoPublicoResponse } from "@workspace/api-zod";

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
    itens: itens.map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    })),
  }));
});

export default router;
