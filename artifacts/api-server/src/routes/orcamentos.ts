import { Router } from "express";
import { requireSessaoComLoja } from "../middlewares/auth.js";
import { query, queryOne, execute, getPool } from "../lib/db.js";
import { podeNoModulo } from "../lib/permissoes.js";

const router = Router();

// ── Dinheiro: aritmética em CENTAVOS inteiros (sem float), igual à camada legada. ──
function paraCentavos(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("valor inválido");
  return Math.round(n * 100);
}
function deCentavos(c: number): string {
  return (c / 100).toFixed(2);
}

// subtotal − desconto, tudo em centavos. Espelha lib/orcamentos/orcamentos.ts.
function calcularTotais(
  itens: { valorUnitario: string | number; quantidade: number }[],
  descontoTipo: string | null,
  descontoValor: string | number | null,
): { subtotal: number; desconto: number; total: number } {
  const subtotal = itens.reduce((s, it) => s + paraCentavos(it.valorUnitario) * it.quantidade, 0);
  let desconto = 0;
  if (descontoTipo === "PERCENTUAL" && descontoValor != null) {
    desconto = Math.round((subtotal * Number(descontoValor)) / 100);
  } else if (descontoTipo === "VALOR" && descontoValor != null) {
    desconto = paraCentavos(descontoValor);
  }
  desconto = Math.max(0, Math.min(desconto, subtotal));
  return { subtotal, desconto, total: subtotal - desconto };
}

const TIPOS_ITEM = new Set(["VESTIDO", "SERVICO", "AJUSTE"]);
const EDITAVEIS = new Set(["RASCUNHO", "ENVIADO"]);
const FORMAS = new Set(["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"]);
const COMISSAO_PCT_PADRAO = 5; // % do total → conta a pagar (comissão da vendedora)

let _seq = 0;
function genId(prefix: string): string {
  _seq = (_seq + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

async function podeVer(req: any): Promise<boolean> {
  return podeNoModulo(req.usuario.id, req.loja.id, "leads", "ver");
}
async function podeCriar(req: any): Promise<boolean> {
  return podeNoModulo(req.usuario.id, req.loja.id, "leads", "criar");
}

// ── Listar orçamentos da loja ───────────────────────────────────────────────
router.get("/loja/:lojaId/orcamentos", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeVer(req))) return res.status(403).json({ erro: "Sem permissão" });
  const orcamentos = await query(
    `SELECT o.*, ld."noivaNome", u.nome AS "vendedoraNome",
       COALESCE((SELECT SUM(i."valorUnitario" * i.quantidade) FROM "OrcamentoItem" i WHERE i."orcamentoId" = o.id), 0) AS subtotal
     FROM "Orcamento" o
     JOIN "Lead" ld ON ld.id = o."leadId"
     JOIN "Usuario" u ON u.id = o."vendedoraId"
     WHERE o."lojaId" = $1 ORDER BY o."createdAt" DESC`,
    [l.id],
  );
  res.json({ orcamentos });
});

// ── Criar orçamento (abre o carrinho) ───────────────────────────────────────
router.post("/loja/:lojaId/orcamentos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeCriar(req))) return res.status(403).json({ erro: "Sem permissão" });
  const { leadId, vendedoraId } = req.body ?? {};
  if (!leadId) return res.status(400).json({ erro: "leadId é obrigatório" });
  const lead = await queryOne(`SELECT id FROM "Lead" WHERE id = $1 AND "lojaId" = $2`, [leadId, l.id]);
  if (!lead) return res.status(400).json({ erro: "Noiva inválida" });
  const vend = vendedoraId || u.id;
  const vinc = await queryOne(`SELECT 1 FROM "UsuarioLoja" WHERE "usuarioId" = $1 AND "lojaId" = $2`, [vend, l.id]);
  if (!vinc) return res.status(400).json({ erro: "Vendedora inválida" });
  const id = genId("orc");
  await execute(
    `INSERT INTO "Orcamento" (id, "lojaId", "leadId", "vendedoraId", status, "updatedAt")
     VALUES ($1, $2, $3, $4, 'RASCUNHO', NOW())`,
    [id, l.id, leadId, vend],
  );
  res.json({ orcamentoId: id });
});

// ── Detalhe do orçamento (carrinho) com itens + totais ──────────────────────
router.get("/loja/:lojaId/orcamentos/:id", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeVer(req))) return res.status(403).json({ erro: "Sem permissão" });
  const orcamento = await queryOne<any>(
    `SELECT o.*, ld."noivaNome", ld."casamentoData", u.nome AS "vendedoraNome"
     FROM "Orcamento" o JOIN "Lead" ld ON ld.id = o."leadId" JOIN "Usuario" u ON u.id = o."vendedoraId"
     WHERE o.id = $1 AND o."lojaId" = $2`,
    [req.params.id, l.id],
  );
  if (!orcamento) return res.status(404).json({ erro: "Orçamento não encontrado" });
  const itens = await query<any>(
    `SELECT * FROM "OrcamentoItem" WHERE "orcamentoId" = $1 ORDER BY "createdAt"`,
    [req.params.id],
  );
  const t = calcularTotais(itens, orcamento.descontoTipo, orcamento.descontoValor);
  const contrato = await queryOne(`SELECT id FROM "Contrato" WHERE "orcamentoId" = $1`, [req.params.id]);
  res.json({
    orcamento,
    itens,
    totais: { subtotal: deCentavos(t.subtotal), desconto: deCentavos(t.desconto), total: deCentavos(t.total) },
    contratoId: (contrato as any)?.id ?? null,
    editavel: EDITAVEIS.has(orcamento.status),
  });
});

// ── Adicionar item ao carrinho ──────────────────────────────────────────────
router.post("/loja/:lojaId/orcamentos/:id/itens", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeCriar(req))) return res.status(403).json({ erro: "Sem permissão" });
  const orc = await queryOne<any>(`SELECT status FROM "Orcamento" WHERE id = $1 AND "lojaId" = $2`, [req.params.id, l.id]);
  if (!orc) return res.status(404).json({ erro: "Orçamento não encontrado" });
  if (!EDITAVEIS.has(orc.status)) return res.status(400).json({ erro: "Orçamento não é mais editável" });
  const { tipo, vestidoId, descricao, valorUnitario, quantidade } = req.body ?? {};
  if (!TIPOS_ITEM.has(tipo)) return res.status(400).json({ erro: "Tipo inválido" });
  if (!descricao?.trim()) return res.status(400).json({ erro: "Descrição é obrigatória" });
  let centavos: number;
  try { centavos = paraCentavos(valorUnitario); } catch { return res.status(400).json({ erro: "Valor inválido" }); }
  if (centavos < 0) return res.status(400).json({ erro: "Valor inválido" });
  const qtd = Math.trunc(Number(quantidade ?? 1));
  if (!Number.isInteger(qtd) || qtd < 1) return res.status(400).json({ erro: "Quantidade inválida" });
  if (vestidoId) {
    const v = await queryOne(`SELECT 1 FROM "Vestido" WHERE id = $1 AND "lojaId" = $2`, [vestidoId, l.id]);
    if (!v) return res.status(400).json({ erro: "Vestido inválido" });
  }
  const id = genId("oi");
  await execute(
    `INSERT INTO "OrcamentoItem" (id, "lojaId", "orcamentoId", tipo, "vestidoId", descricao, "valorUnitario", quantidade)
     VALUES ($1, $2, $3, $4::"OrcamentoItemTipo", $5, $6, $7, $8)`,
    [id, l.id, req.params.id, tipo, vestidoId || null, descricao.trim(), deCentavos(centavos), qtd],
  );
  await execute(`UPDATE "Orcamento" SET "updatedAt" = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ itemId: id });
});

// ── Remover item ────────────────────────────────────────────────────────────
router.delete("/loja/:lojaId/orcamentos/:id/itens/:itemId", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeCriar(req))) return res.status(403).json({ erro: "Sem permissão" });
  const orc = await queryOne<any>(`SELECT status FROM "Orcamento" WHERE id = $1 AND "lojaId" = $2`, [req.params.id, l.id]);
  if (!orc) return res.status(404).json({ erro: "Orçamento não encontrado" });
  if (!EDITAVEIS.has(orc.status)) return res.status(400).json({ erro: "Orçamento não é mais editável" });
  await execute(`DELETE FROM "OrcamentoItem" WHERE id = $1 AND "orcamentoId" = $2`, [req.params.itemId, req.params.id]);
  await execute(`UPDATE "Orcamento" SET "updatedAt" = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// ── Atualizar desconto / status ─────────────────────────────────────────────
router.put("/loja/:lojaId/orcamentos/:id", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeCriar(req))) return res.status(403).json({ erro: "Sem permissão" });
  const orc = await queryOne<any>(`SELECT status FROM "Orcamento" WHERE id = $1 AND "lojaId" = $2`, [req.params.id, l.id]);
  if (!orc) return res.status(404).json({ erro: "Orçamento não encontrado" });
  const { descontoTipo, descontoValor } = req.body ?? {};
  if (descontoTipo !== undefined) {
    if (descontoTipo !== null && !["PERCENTUAL", "VALOR"].includes(descontoTipo)) {
      return res.status(400).json({ erro: "Tipo de desconto inválido" });
    }
    await execute(
      `UPDATE "Orcamento" SET "descontoTipo" = $1::"DescontoTipo", "descontoValor" = $2, "updatedAt" = NOW() WHERE id = $3`,
      [descontoTipo, descontoTipo == null ? null : Number(descontoValor || 0), req.params.id],
    );
  }
  res.json({ ok: true });
});

// ── FECHAR CONTRATO: cria contrato + parcelas (a receber) + comissão (a pagar) ──
router.post("/loja/:lojaId/orcamentos/:id/fechar-contrato", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeCriar(req))) return res.status(403).json({ erro: "Sem permissão" });

  const orc = await queryOne<any>(
    `SELECT * FROM "Orcamento" WHERE id = $1 AND "lojaId" = $2`,
    [req.params.id, l.id],
  );
  if (!orc) return res.status(404).json({ erro: "Orçamento não encontrado" });
  if (orc.status === "APROVADO") return res.status(400).json({ erro: "Este orçamento já virou contrato" });
  if (!EDITAVEIS.has(orc.status)) return res.status(400).json({ erro: "Orçamento não pode ser fechado neste status" });
  const itens = await query<any>(`SELECT * FROM "OrcamentoItem" WHERE "orcamentoId" = $1`, [req.params.id]);
  if (itens.length === 0) return res.status(400).json({ erro: "Adicione ao menos um item antes de fechar" });

  const { entrada, numParcelas, primeiroVencimento, formaPagamento, cpf, comissaoPct } = req.body ?? {};

  // Validação do plano (espelha gerarPlanoDePagamento)
  const n = Math.trunc(Number(numParcelas));
  if (!Number.isInteger(n) || n < 1 || n > 360) return res.status(400).json({ erro: "Número de parcelas inválido (1–360)" });
  if (!primeiroVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) {
    return res.status(400).json({ erro: "Primeiro vencimento inválido (use AAAA-MM-DD)" });
  }
  if (formaPagamento != null && formaPagamento !== "" && !FORMAS.has(formaPagamento)) {
    return res.status(400).json({ erro: "Forma de pagamento inválida" });
  }

  const { total } = calcularTotais(itens, orc.descontoTipo, orc.descontoValor);
  let entradaC = 0;
  if (entrada != null && String(entrada).trim() !== "") {
    try { entradaC = paraCentavos(entrada); } catch { return res.status(400).json({ erro: "Entrada inválida" }); }
  }
  if (entradaC < 0) return res.status(400).json({ erro: "Entrada inválida" });
  if (entradaC > total) return res.status(400).json({ erro: "Entrada maior que o valor total" });

  const pct = comissaoPct != null && comissaoPct !== "" ? Number(comissaoPct) : COMISSAO_PCT_PADRAO;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ erro: "Percentual de comissão inválido" });

  // Plano de parcelas: entrada (nº 0) + n parcelas; última absorve o resto.
  const DIA_MS = 86_400_000;
  const venc0 = new Date(`${primeiroVencimento}T00:00:00.000Z`);
  const restante = total - entradaC;
  const base = Math.floor(restante / n);
  const resto = restante - base * n;
  const startMonth = entradaC > 0 ? 1 : 0;
  const parcelas: { numero: number; descricao: string; valor: number; vencimento: Date }[] = [];
  if (entradaC > 0) parcelas.push({ numero: 0, descricao: "Entrada", valor: entradaC, vencimento: venc0 });
  for (let i = 1; i <= n; i++) {
    const valor = base + (i === n ? resto : 0);
    const vencimento = new Date(venc0.getTime() + (startMonth + (i - 1)) * 30 * DIA_MS);
    parcelas.push({ numero: i, descricao: `Parcela ${i}/${n}`, valor, vencimento });
  }

  const comissaoC = Math.round((total * pct) / 100);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Contrato (a VENDA) — valorTotal = total do orçamento
    const contratoId = genId("ct");
    await client.query(
      `INSERT INTO "Contrato" (id, "lojaId", "leadId", "orcamentoId", "vendedoraId", status, cpf,
         "vestidoDescricao", "valorTotal", "formaPagamento", "dataCasamento", "fechadoEm", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,'ATIVO',$6,$7,$8,$9::"FormaPagamento",
         (SELECT "casamentoData" FROM "Lead" WHERE id = $3), NOW(), NOW())`,
      [
        contratoId, l.id, orc.leadId, orc.id, orc.vendedoraId,
        cpf?.trim() || null,
        itens.find((i) => i.tipo === "VESTIDO")?.descricao ?? null,
        deCentavos(total),
        formaPagamento || null,
      ],
    );

    // 2) Parcelas (CONTAS A RECEBER) — geradas automaticamente
    for (const p of parcelas) {
      await client.query(
        `INSERT INTO "Parcela" (id, "lojaId", "contratoId", numero, descricao, "valorPrevisto", vencimento, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PREVISTA')`,
        [genId("pc"), l.id, contratoId, p.numero, p.descricao, deCentavos(p.valor), p.vencimento.toISOString()],
      );
    }

    // 3) Comissão da vendedora (CONTA A PAGAR) — gerada automaticamente
    if (comissaoC > 0) {
      const vendNome = await client.query(`SELECT nome FROM "Usuario" WHERE id = $1`, [orc.vendedoraId]);
      await client.query(
        `INSERT INTO "ContaPagar" (id, "lojaId", tipo, "colaboradorId", competencia, descricao, categoria,
           "valorPrevisto", vencimento, status)
         VALUES ($1,$2,'COMISSAO',$3,to_char(NOW(),'YYYY-MM'),$4,'Comissão',$5, NOW() + interval '30 day','PREVISTA')`,
        [
          genId("cp"), l.id, orc.vendedoraId,
          `Comissão ${pct}% — ${vendNome.rows[0]?.nome ?? "vendedora"} (contrato ${contratoId})`,
          deCentavos(comissaoC),
        ],
      );
    }

    // 4) Orçamento → APROVADO; Lead → CONTRATO_FECHADO
    await client.query(
      `UPDATE "Orcamento" SET status = 'APROVADO', "aprovadoEm" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      [orc.id],
    );
    await client.query(
      `UPDATE "Lead" SET etapa = 'CONTRATO_FECHADO', "contratoFechadoEm" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      [orc.leadId],
    );

    await client.query("COMMIT");
    res.json({
      contratoId,
      parcelasGeradas: parcelas.length,
      comissao: deCentavos(comissaoC),
      total: deCentavos(total),
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ erro: err.message });
  } finally {
    client.release();
  }
});

export default router;
