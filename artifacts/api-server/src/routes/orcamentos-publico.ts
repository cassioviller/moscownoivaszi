import { Router, type IRouter } from "express";
import { db, orcamentosTable, lojasTable, leadsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  GetOrcamentoPublicoQueryParams,
  GetOrcamentoPublicoResponse,
  AceitarOrcamentoPublicoQueryParams,
  AceitarOrcamentoPublicoResponse,
} from "@workspace/api-zod";
import { aceitarOrcamentoEnviado } from "../lib/aceite-orcamento";
import { montarOrcamentoPublico } from "../lib/visao-noiva";
import { erroDeValidacao } from "../lib/erros";

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

router.get("/orcamentos/publico", async (req, res): Promise<void> => {
  const parsed = GetOrcamentoPublicoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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

  // E75/E78: a montagem (última versão ENVIADA ou conteúdo vivo) mora em
  // lib/visao-noiva — o portal exibe a MESMA proposta por outra porta.
  res.json(
    GetOrcamentoPublicoResponse.parse(await montarOrcamentoPublico(orcamento, lojaNome, noivaNome)),
  );
});

// E74: o aceite — "ela viu" vira "ela concordou com ESTA versão". Sem sessão:
// o token É a capability, e o autor na trilha é a própria noiva, desnormalizado.
router.post("/orcamentos/publico/aceite", async (req, res): Promise<void> => {
  const parsed = AceitarOrcamentoPublicoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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

  /**
   * C8 — a pré-condição morava aqui E lá dentro, e as duas divergiam.
   *
   * Esta rota conferia `aceitoEm` e `status` lendo o POOL, e a rotina gravava
   * sem reconferir nada: a janela entre as duas guardas é exatamente onde o C1
   * vive. Agora a pergunta é feita UMA vez, sob a tranca, e esta rota só
   * traduz o desfecho para HTTP — que é o trabalho dela.
   */
  const desfecho = await aceitarOrcamentoEnviado(orcamento, noivaNome, parsed.data.versao);
  if (!desfecho.ok) {
    if (desfecho.motivo === "SUMIU") {
      res.status(404).json({ error: "LINK_INVALIDO" });
      return;
    }
    if (desfecho.motivo === "VERSAO_MUDOU") {
      res.status(409).json({
        error: "PROPOSTA_MUDOU",
        detalhe:
          "Esta proposta foi atualizada depois que você abriu a página. Recarregue para ver a versão nova antes de aceitar.",
      });
      return;
    }
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${desfecho.status}` });
    return;
  }
  res.json(AceitarOrcamentoPublicoResponse.parse({ aceitoEm: desfecho.aceitoEm }));
});

export default router;
