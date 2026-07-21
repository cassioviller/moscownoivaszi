import { Router, type IRouter } from "express";
import {
  db,
  comissaoRegrasTable,
  comissaoFaixasTable,
  comissaoFechamentosTable,
  contasPagarTable,
  contratosTable,
  leadsTable,
  usuariosTable,
  usuariosLojasTable,
} from "@workspace/db";
import { eq, and, gte, lt, lte, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { alias as aliasedTable } from "drizzle-orm/pg-core";
import { ehViolacaoUnica } from "../lib/erros";
import { registrarAuditoria } from "../lib/auditoria";
import {
  ListComissaoRegrasResponse,
  CreateComissaoRegraBody,
  CreateComissaoRegraResponse,
  UpdateComissaoRegraBody,
  UpdateComissaoRegraResponse,
  ListComissaoFechamentosResponse,
  ListComissaoFechamentosQueryParams,
  PreviewComissaoQueryParams,
  PreviewComissaoResponse,
  GerarComissaoFechamentoBody,
  GerarComissaoFechamentoResponse,
  BaixarEstornoComissaoBody,
  BaixarEstornoComissaoResponse,
  ListBaixasEstornoComissaoResponse,
  GetMinhaComissaoQueryParams,
  GetMinhaComissaoResponse,
  SimularComissaoBody,
  SimularComissaoResponse,
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import {
  calcularComissao,
  competenciaDe,
  competenciaValida,
  limitesCompetencia,
  ordenarFaixas,
  proximoDegrau,
  projetarCompetencia,
  validarFaixas,
  vencimentoComissao,
  type FaixaCalc,
} from "../lib/comissao";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/comissao", requireModulo("comissao"));

// O motor trabalha em CENTAVOS; o banco e o contrato falam reais.
const cent = (reais: number) => Math.round(reais * 100);
const real = (centavos: number) => centavos / 100;

/**
 * `db` ou a transação em curso. As leituras que decidem QUANTO pagar precisam
 * enxergar o mesmo instante das escritas que gravam o pagamento — por isso o
 * fechamento passa o seu `tx` em vez de ler pelo `db` global.
 */
type Cliente = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type FaixaRow = typeof comissaoFaixasTable.$inferSelect;

/**
 * Vale para a linha do banco (`number | null`) e para o corpo da requisição,
 * onde o campo pode vir AUSENTE — omitir `maxAcumulado` é como se diz "topo
 * aberto". Ausente e nulo significam a mesma coisa aqui, e tratar só o nulo
 * mandaria `undefined` para `cent()`, que devolve NaN e faz a validação recusar
 * uma escada perfeitamente válida com o motivo errado.
 */
type FaixaCrua = {
  minAcumulado: number;
  maxAcumulado?: number | null;
  percentual?: number | null;
  bonusFixo?: number | null;
};

function paraCalc(f: FaixaCrua | Pick<FaixaRow, "minAcumulado" | "maxAcumulado" | "percentual" | "bonusFixo">): FaixaCalc {
  const centOuNulo = (v: number | null | undefined) => (v == null ? null : cent(v));
  return {
    minAcumulado: cent(f.minAcumulado),
    maxAcumulado: centOuNulo(f.maxAcumulado),
    percentual: f.percentual ?? null,
    bonusFixo: centOuNulo(f.bonusFixo),
  };
}

/** Regra + faixas de uma loja, agrupadas. As faixas vêm ordenadas pela escada. */
async function carregarRegras(lojaId: string, vendedoraIds?: string[]) {
  const filtros = [eq(comissaoRegrasTable.lojaId, lojaId)];
  if (vendedoraIds) filtros.push(inArray(comissaoRegrasTable.vendedoraId, vendedoraIds));

  const regras = await db
    .select({
      regra: comissaoRegrasTable,
      vendedoraNome: usuariosTable.nome,
    })
    .from(comissaoRegrasTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, comissaoRegrasTable.vendedoraId))
    .where(and(...filtros))
    .orderBy(comissaoRegrasTable.vendedoraId, desc(comissaoRegrasTable.vigenciaInicio));

  if (regras.length === 0) return [];

  const faixas = await db
    .select()
    .from(comissaoFaixasTable)
    .where(inArray(comissaoFaixasTable.regraId, regras.map((r) => r.regra.id)));

  const porRegra = new Map<string, FaixaRow[]>();
  for (const f of faixas) {
    const lista = porRegra.get(f.regraId) ?? [];
    lista.push(f);
    porRegra.set(f.regraId, lista);
  }

  return regras.map(({ regra, vendedoraNome }) => ({
    ...regra,
    vendedoraNome,
    faixas: (porRegra.get(regra.id) ?? [])
      .sort((a, b) => a.minAcumulado - b.minAcumulado)
      .map((f) => ({
        id: f.id,
        minAcumulado: f.minAcumulado,
        maxAcumulado: f.maxAcumulado,
        percentual: f.percentual,
        bonusFixo: f.bonusFixo,
      })),
  }));
}

/**
 * A regra vigente de cada vendedora numa competência: a mais recente, ATIVA,
 * cuja vigência começou até o FIM da competência. É o que faz fechar um mês
 * antigo usar a regra que valia naquele mês, e não a de hoje.
 */
async function regrasVigentes(
  cliente: Cliente,
  lojaId: string,
  vendedoraIds: string[],
  competencia: string,
): Promise<Map<string, { regraId: string; bonusAcumulaFaixas: boolean; faixas: FaixaCalc[] }>> {
  const mapa = new Map<string, { regraId: string; bonusAcumulaFaixas: boolean; faixas: FaixaCalc[] }>();
  if (vendedoraIds.length === 0) return mapa;
  const { fim } = limitesCompetencia(competencia);

  const regras = await cliente
    .select()
    .from(comissaoRegrasTable)
    .where(and(
      eq(comissaoRegrasTable.lojaId, lojaId),
      inArray(comissaoRegrasTable.vendedoraId, vendedoraIds),
      eq(comissaoRegrasTable.ativo, true),
      lt(comissaoRegrasTable.vigenciaInicio, fim),
    ))
    .orderBy(desc(comissaoRegrasTable.vigenciaInicio));
  if (regras.length === 0) return mapa;

  const faixas = await cliente
    .select()
    .from(comissaoFaixasTable)
    .where(inArray(comissaoFaixasTable.regraId, regras.map((r) => r.id)));
  const porRegra = new Map<string, FaixaCalc[]>();
  for (const f of faixas) {
    const lista = porRegra.get(f.regraId) ?? [];
    lista.push(paraCalc(f));
    porRegra.set(f.regraId, lista);
  }

  // orderBy desc → a primeira de cada vendedora é a vigente.
  for (const r of regras) {
    if (mapa.has(r.vendedoraId)) continue;
    mapa.set(r.vendedoraId, {
      regraId: r.id,
      bonusAcumulaFaixas: r.bonusAcumulaFaixas,
      faixas: porRegra.get(r.id) ?? [],
    });
  }
  return mapa;
}

type EstornoPendente = { totalC: number; contratoIds: string[] };

/**
 * Estorno §6.4: contratos CANCELADOS que já foram pagos numa competência
 * FECHADA e ainda não foram reconciliados (`comissaoEstornadaEm IS NULL`).
 *
 * A comissão daquele mês já foi paga sobre uma venda que deixou de existir, e o
 * dinheiro volta abatendo o mês seguinte. Cancelamento dentro de uma
 * competência ainda ABERTA não entra aqui: ele já some da base naturalmente,
 * porque a base só soma contratos ATIVO.
 */
async function estornosPendentes(
  cliente: Cliente,
  lojaId: string,
  vendedoraIds: string[],
  competenciaLimite: string,
): Promise<Map<string, EstornoPendente>> {
  const mapa = new Map<string, EstornoPendente>();
  for (const id of vendedoraIds) mapa.set(id, { totalC: 0, contratoIds: [] });
  if (vendedoraIds.length === 0) return mapa;

  const [fechs, cancelados] = await Promise.all([
    cliente
      .select({
        vendedoraId: comissaoFechamentosTable.vendedoraId,
        competencia: comissaoFechamentosTable.competencia,
      })
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, lojaId),
        inArray(comissaoFechamentosTable.vendedoraId, vendedoraIds),
      )),
    cliente
      .select({
        id: contratosTable.id,
        vendedoraId: contratosTable.vendedoraId,
        valorTotal: contratosTable.valorTotal,
        fechadoEm: contratosTable.fechadoEm,
      })
      .from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, lojaId),
        inArray(contratosTable.vendedoraId, vendedoraIds),
        eq(contratosTable.status, "CANCELADO"),
        isNull(contratosTable.comissaoEstornadaEm),
      )),
  ]);

  const fechadasPor = new Map<string, Set<string>>();
  for (const f of fechs) {
    const set = fechadasPor.get(f.vendedoraId) ?? new Set<string>();
    set.add(f.competencia);
    fechadasPor.set(f.vendedoraId, set);
  }

  for (const c of cancelados) {
    const comp = competenciaDe(c.fechadoEm);
    // Só abate o que já foi pago: competência anterior E já fechada.
    if (comp >= competenciaLimite) continue;
    if (!fechadasPor.get(c.vendedoraId)?.has(comp)) continue;
    const e = mapa.get(c.vendedoraId)!;
    e.totalC += cent(c.valorTotal);
    e.contratoIds.push(c.id);
  }
  return mapa;
}

/**
 * Quem TALVEZ tenha estorno pendente — candidatas, não veredito.
 *
 * O preview lista as vendedoras a partir das vendas do mês, e quem parou de
 * vender sumiria da tela levando o estorno junto: a loja nunca saberia que
 * aquele dinheiro não voltou. Aqui a busca é pelo cancelamento, sem passar
 * pelas vendas. Quem decide de fato é `estornosPendentes` (só conta o que veio
 * de competência anterior JÁ fechada) — este conjunto só garante que ela seja
 * perguntada.
 */
async function candidatasComEstorno(cliente: Cliente, lojaId: string): Promise<string[]> {
  const linhas = await cliente
    .selectDistinct({ vendedoraId: contratosTable.vendedoraId })
    .from(contratosTable)
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "CANCELADO"),
      isNull(contratosTable.comissaoEstornadaEm),
    ));
  return linhas.map((l) => l.vendedoraId);
}

/** Acumulado bruto por vendedora: contratos ATIVO fechados na competência. */
async function vendasDaCompetencia(cliente: Cliente, lojaId: string, competencia: string) {
  const { inicio, fim } = limitesCompetencia(competencia);
  const contratos = await cliente
    .select({ vendedoraId: contratosTable.vendedoraId, valorTotal: contratosTable.valorTotal })
    .from(contratosTable)
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "ATIVO"),
      gte(contratosTable.fechadoEm, inicio),
      lt(contratosTable.fechadoEm, fim),
    ));

  const porVendedora = new Map<string, number>();
  for (const c of contratos) {
    porVendedora.set(c.vendedoraId, (porVendedora.get(c.vendedoraId) ?? 0) + cent(c.valorTotal));
  }
  return porVendedora;
}

// ── Regras ──

router.get("/lojas/:lojaId/comissao/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  res.json(ListComissaoRegrasResponse.parse(await carregarRegras(lojaId)));
});

/**
 * Define a regra de uma vendedora numa vigência. A regra é substituída INTEIRA
 * (as faixas antigas caem): uma escada meio-editada é uma escada inválida, e
 * validá-la só no fim é o que impede gravar uma sobreposição.
 */
router.post("/lojas/:lojaId/comissao/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateComissaoRegraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { vendedoraId, faixas, bonusAcumulaFaixas = false } = parsed.data;

  const [membro] = await db
    .select({ usuarioId: usuariosLojasTable.usuarioId })
    .from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.lojaId, lojaId), eq(usuariosLojasTable.usuarioId, vendedoraId)));
  if (!membro) {
    res.status(422).json({ error: "VENDEDORA_INVALIDA", detalhe: "A vendedora não é da loja" });
    return;
  }

  const validacao = validarFaixas(faixas.map(paraCalc));
  if (!validacao.ok) {
    res.status(422).json({ error: "FAIXAS_INVALIDAS", detalhe: validacao.motivo });
    return;
  }

  // Sem vigência explícita (o caso da TELA, que não a envia), a regra vale do
  // PRÓXIMO mês — não de "agora". O default `new Date()` fazia toda escada
  // criada pela tela reprecificar RETROATIVAMENTE o mês corrente, porque a
  // comissão é retroativa por faixa. Quem quer valer para um mês passado manda
  // a vigência explícita (e assume a reprecificação daquele mês).
  const vigenciaInicio = parsed.data.vigenciaInicio
    ? new Date(parsed.data.vigenciaInicio)
    : limitesCompetencia(competenciaDe(new Date())).fim;

  const regraId = await db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: comissaoRegrasTable.id })
      .from(comissaoRegrasTable)
      .where(and(
        eq(comissaoRegrasTable.lojaId, lojaId),
        eq(comissaoRegrasTable.vendedoraId, vendedoraId),
        eq(comissaoRegrasTable.vigenciaInicio, vigenciaInicio),
      ));

    let id: string;
    if (existente) {
      // Redefinir a mesma vigência é corrigir a regra, não versionar de novo.
      await tx
        .update(comissaoRegrasTable)
        .set({ bonusAcumulaFaixas, ativo: true, updatedAt: new Date() })
        .where(eq(comissaoRegrasTable.id, existente.id));
      await tx.delete(comissaoFaixasTable).where(eq(comissaoFaixasTable.regraId, existente.id));
      id = existente.id;
    } else {
      id = randomUUID();
      await tx.insert(comissaoRegrasTable).values({
        id,
        lojaId,
        vendedoraId,
        vigenciaInicio,
        bonusAcumulaFaixas,
      });
    }

    await tx.insert(comissaoFaixasTable).values(
      faixas.map((f) => ({
        id: randomUUID(),
        lojaId,
        regraId: id,
        minAcumulado: f.minAcumulado,
        maxAcumulado: f.maxAcumulado ?? null,
        percentual: f.percentual ?? null,
        bonusFixo: f.bonusFixo ?? null,
      })),
    );
    return id;
  });

  const [regra] = await carregarRegras(lojaId, [vendedoraId]).then((rs) => rs.filter((r) => r.id === regraId));
  res.status(201).json(CreateComissaoRegraResponse.parse(regra));
});

router.patch("/lojas/:lojaId/comissao/regras/:regraId", async (req, res): Promise<void> => {
  const { lojaId, regraId } = req.params as { lojaId: string; regraId: string };
  const parsed = UpdateComissaoRegraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [atualizada] = await db
    .update(comissaoRegrasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(comissaoRegrasTable.id, regraId), eq(comissaoRegrasTable.lojaId, lojaId)))
    .returning();
  if (!atualizada) {
    res.status(404).json({ error: "Regra not found" });
    return;
  }
  const [regra] = await carregarRegras(lojaId, [atualizada.vendedoraId]).then((rs) =>
    rs.filter((r) => r.id === regraId),
  );
  res.json(UpdateComissaoRegraResponse.parse(regra));
});

router.delete("/lojas/:lojaId/comissao/regras/:regraId", async (req, res): Promise<void> => {
  const { lojaId, regraId } = req.params as { lojaId: string; regraId: string };
  // As faixas caem por cascade — elas não existem fora da regra.
  await db
    .delete(comissaoRegrasTable)
    .where(and(eq(comissaoRegrasTable.id, regraId), eq(comissaoRegrasTable.lojaId, lojaId)));
  res.status(204).send();
});

// ── Simulador de escada (E23) ──

/** A competência `n` meses antes de `comp` ("2026-07", 1 → "2026-06"). */
function competenciaAnterior(comp: string, n: number): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const d = new Date(Date.UTC(ano, mes - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * "Se a faixa fosse Y%, quanto teria pago?" — a escada hipotética aplicada às
 * bases REAIS dos últimos meses, pelo MESMO motor do fechamento. Mês fechado
 * usa a base do fechamento (líquida, a que pagou de verdade) e o pago
 * registrado; mês sem fechamento usa as vendas brutas e recalcula o "real"
 * com a regra vigente da época. Não grava nada.
 */
router.post("/lojas/:lojaId/comissao/simular", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = SimularComissaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { vendedoraId, faixas, bonusAcumulaFaixas = false, meses = 3 } = parsed.data;

  const [membro] = await db
    .select({ usuarioId: usuariosLojasTable.usuarioId })
    .from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.lojaId, lojaId), eq(usuariosLojasTable.usuarioId, vendedoraId)));
  if (!membro) {
    res.status(422).json({ error: "VENDEDORA_INVALIDA", detalhe: "A vendedora não é da loja" });
    return;
  }
  const faixasCalc = faixas.map(paraCalc);
  const validacao = validarFaixas(faixasCalc);
  if (!validacao.ok) {
    res.status(422).json({ error: "FAIXAS_INVALIDAS", detalhe: validacao.motivo });
    return;
  }

  // As N competências ANTERIORES à corrente — mês em curso não responde
  // "quanto teria pago" (a base ainda cresce).
  const atual = competenciaDe(new Date());
  const comps = Array.from({ length: meses }, (_, i) => competenciaAnterior(atual, meses - i));

  const fechamentos = await db
    .select()
    .from(comissaoFechamentosTable)
    .where(and(
      eq(comissaoFechamentosTable.lojaId, lojaId),
      eq(comissaoFechamentosTable.vendedoraId, vendedoraId),
      inArray(comissaoFechamentosTable.competencia, comps),
    ));
  const fechadaPor = new Map(fechamentos.map((f) => [f.competencia, f]));

  const linhas = [];
  for (const competencia of comps) {
    const fechamento = fechadaPor.get(competencia);
    let baseC: number;
    let pagoRealC: number;
    let pagoRealPercentual: number | null;
    if (fechamento) {
      baseC = cent(fechamento.totalVendas);
      pagoRealC = cent(fechamento.valorTotal);
      pagoRealPercentual = fechamento.percentualAplicado;
    } else {
      baseC = (await vendasDaCompetencia(db, lojaId, competencia)).get(vendedoraId) ?? 0;
      const regra = (await regrasVigentes(db, lojaId, [vendedoraId], competencia)).get(vendedoraId);
      const r = regra ? calcularComissao(baseC, regra.faixas, regra.bonusAcumulaFaixas) : null;
      pagoRealC = r?.valorTotal ?? 0;
      pagoRealPercentual = r?.percentualAplicado ?? null;
    }

    const sim = calcularComissao(baseC, faixasCalc, bonusAcumulaFaixas);
    linhas.push({
      competencia,
      base: real(baseC),
      fechada: !!fechamento,
      pagoReal: real(pagoRealC),
      pagoRealPercentual,
      simulado: real(sim.valorTotal),
      simuladoPercentual: sim.percentualAplicado,
      diferenca: real(sim.valorTotal - pagoRealC),
    });
  }

  const totalPagoRealC = linhas.reduce((s, l) => s + cent(l.pagoReal), 0);
  const totalSimuladoC = linhas.reduce((s, l) => s + cent(l.simulado), 0);
  res.json(SimularComissaoResponse.parse({
    vendedoraId,
    linhas,
    totalPagoReal: real(totalPagoRealC),
    totalSimulado: real(totalSimuladoC),
    totalDiferenca: real(totalSimuladoC - totalPagoRealC),
  }));
});

// ── Minha comissão (E11) ──
// Fora do prefixo /comissao DE PROPÓSITO: o requireModulo("comissao") da linha
// de cima é o gate da GESTÃO (ver todo mundo, editar escadas, fechar). Aqui a
// pessoa vê só o próprio extrato — o filtro é a sessão, não um id do cliente.
router.get("/lojas/:lojaId/minha-comissao", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = GetMinhaComissaoQueryParams.safeParse(req.query);
  if (!q.success || !competenciaValida(q.data.competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
    return;
  }
  const { competencia } = q.data;
  const vendedoraId = req.usuario!.id;

  const [vendas, estornos, regras, fechamentos] = await Promise.all([
    vendasDaCompetencia(db, lojaId, competencia),
    estornosPendentes(db, lojaId, [vendedoraId], competencia),
    regrasVigentes(db, lojaId, [vendedoraId], competencia),
    db.select()
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, lojaId),
        eq(comissaoFechamentosTable.vendedoraId, vendedoraId),
      ))
      .orderBy(desc(comissaoFechamentosTable.competencia))
      .limit(12),
  ]);

  const brutoC = vendas.get(vendedoraId) ?? 0;
  const estorno = estornos.get(vendedoraId) ?? { totalC: 0, contratoIds: [] };
  const netC = brutoC - estorno.totalC;
  const regra = regras.get(vendedoraId);
  const r = regra ? calcularComissao(netC, regra.faixas, regra.bonusAcumulaFaixas) : null;
  const degrau = regra ? proximoDegrau(netC, regra.faixas) : null;

  res.json(GetMinhaComissaoResponse.parse({
    competencia,
    temRegra: !!regra,
    totalVendas: real(Math.max(0, netC)),
    estornoPendente: real(estorno.totalC),
    percentualAplicado: r?.percentualAplicado ?? null,
    valorComissao: real(r?.valorComissao ?? 0),
    valorBonus: real(r?.valorBonus ?? 0),
    valorTotal: real(r?.valorTotal ?? 0),
    faltaProximoDegrau: degrau ? real(degrau.faltam) : null,
    proximoDegrauPercentual: degrau?.percentual ?? null,
    projecao: projecaoDaLinha(brutoC, estorno.totalC, competencia, regra, new Date()),
    fechamentos: fechamentos.map((f) => ({
      competencia: f.competencia,
      totalVendas: f.totalVendas,
      percentualAplicado: f.percentualAplicado,
      valorComissao: f.valorComissao,
      valorBonus: f.valorBonus,
      valorTotal: f.valorTotal,
      fechadoEm: f.fechadoEm,
    })),
  }));
});


/**
 * A projeção da competência (E51), pronta para o contrato. Nasce do MESMO
 * `calcularComissao` que calcula o realizado — se a escada mudar, as duas
 * respostas mudam juntas, e a projeção nunca vira uma segunda implementação
 * da regra de comissão.
 */
function projecaoDaLinha(
  brutoC: number,
  estornoC: number,
  competencia: string,
  regra: { faixas: FaixaCalc[]; bonusAcumulaFaixas: boolean } | undefined,
  agora: Date,
) {
  const proj = projetarCompetencia(brutoC, estornoC, competencia, agora);
  if (!proj || !regra) return null;
  const r = calcularComissao(proj.baseProjetadaC, regra.faixas, regra.bonusAcumulaFaixas);
  return {
    diasDecorridos: proj.diasDecorridos,
    diasNoMes: proj.diasNoMes,
    baseProjetada: real(Math.max(0, proj.baseProjetadaC)),
    percentualProjetado: r.percentualAplicado,
    valorTotalProjetado: real(r.valorTotal),
  };
}

// ── Preview (ranking ao vivo) ──

router.get("/lojas/:lojaId/comissao/preview", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = PreviewComissaoQueryParams.safeParse(req.query);
  if (!q.success || !competenciaValida(q.data.competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
    return;
  }
  const { competencia } = q.data;

  // E26: competência FECHADA é imutável — a resposta é a memória do
  // fechamento (a mesma que respondeu "quanto pagar"), não um recálculo ao
  // vivo que revisita contratos, estornos e regras a cada F5. Também blinda a
  // tela contra dado novo fora de época: um contrato lançado retroativamente
  // depois do fecho mudaria o preview recalculado, mas não muda o que foi
  // PAGO. Só o mês aberto merece cálculo ao vivo.
  const fechamentosDaComp = await db
    .select({ fechamento: comissaoFechamentosTable, vendedoraNome: usuariosTable.nome })
    .from(comissaoFechamentosTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, comissaoFechamentosTable.vendedoraId))
    .where(and(
      eq(comissaoFechamentosTable.lojaId, lojaId),
      eq(comissaoFechamentosTable.competencia, competencia),
    ));
  if (fechamentosDaComp.length > 0) {
    const linhas = fechamentosDaComp
      .map(({ fechamento, vendedoraNome }) => ({
        vendedoraId: fechamento.vendedoraId,
        vendedoraNome,
        totalVendas: fechamento.totalVendas,
        // O estorno que existia foi abatido no próprio fechamento; o que
        // surgiu depois pertence ao mês seguinte — aqui é sempre zero.
        estornoPendente: 0,
        percentualAplicado: fechamento.percentualAplicado,
        valorComissao: fechamento.valorComissao,
        valorBonus: fechamento.valorBonus,
        valorTotal: fechamento.valorTotal,
        // Mês fechado não tem degrau a perseguir — nem ritmo a projetar: o
        // total já é o total, e projetar ali seria inventar futuro para o que
        // acabou.
        faltaProximoDegrau: null,
        projecao: null,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal);
    // Imutável de verdade: o navegador pode segurar por uma hora sem risco.
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.json(PreviewComissaoResponse.parse(linhas));
    return;
  }

  // Quem vendeu no mês MAIS quem deve estorno: uma vendedora que parou de
  // vender ainda precisa aparecer, senão o estorno dela some da tela e carrega
  // para sempre sem ninguém saber.
  const [vendas, candidatas] = await Promise.all([
    vendasDaCompetencia(db, lojaId, competencia),
    candidatasComEstorno(db, lojaId),
  ]);
  const vendedoraIds = [...new Set([...vendas.keys(), ...candidatas])];
  if (vendedoraIds.length === 0) {
    res.json(PreviewComissaoResponse.parse([]));
    return;
  }

  const [nomes, estornos, regras] = await Promise.all([
    db.select({ id: usuariosTable.id, nome: usuariosTable.nome })
      .from(usuariosTable)
      .where(inArray(usuariosTable.id, vendedoraIds)),
    estornosPendentes(db, lojaId, vendedoraIds, competencia),
    regrasVigentes(db, lojaId, vendedoraIds, competencia),
  ]);
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
  // Um instante só para o ranking inteiro: virar o dia no meio do map faria
  // duas vendedoras serem projetadas com denominadores diferentes.
  const agora = new Date();

  const linhas = vendedoraIds.map((vendedoraId) => {
    const brutoC = vendas.get(vendedoraId) ?? 0;
    const estorno = estornos.get(vendedoraId) ?? { totalC: 0, contratoIds: [] };
    const netC = brutoC - estorno.totalC;
    const regra = regras.get(vendedoraId);
    const r = regra ? calcularComissao(netC, regra.faixas, regra.bonusAcumulaFaixas) : null;
    const degrau = regra ? proximoDegrau(netC, regra.faixas) : null;
    return {
      vendedoraId,
      vendedoraNome: nomePorId.get(vendedoraId) ?? null,
      totalVendas: real(Math.max(0, netC)),
      estornoPendente: real(estorno.totalC),
      percentualAplicado: r?.percentualAplicado ?? null,
      valorComissao: real(r?.valorComissao ?? 0),
      valorBonus: real(r?.valorBonus ?? 0),
      valorTotal: real(r?.valorTotal ?? 0),
      faltaProximoDegrau: degrau ? real(degrau.faltam) : null,
      projecao: projecaoDaLinha(brutoC, estorno.totalC, competencia, regra, agora),
    };
  });
  // Candidata sem estorno qualificado (cancelou, mas de um mês que nunca
  // fechou — a comissão nunca chegou a ser paga) não tem o que mostrar: entrou
  // na pergunta, não na resposta.
  const visiveis = linhas.filter((l) => vendas.has(l.vendedoraId) || l.estornoPendente > 0);
  visiveis.sort((a, b) => b.valorTotal - a.valorTotal || b.estornoPendente - a.estornoPendente);
  res.json(PreviewComissaoResponse.parse(visiveis));
});

// ── Fechamentos ──

router.get("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = ListComissaoFechamentosQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const filtros = [eq(comissaoFechamentosTable.lojaId, lojaId)];
  if (q.data.competencia) filtros.push(eq(comissaoFechamentosTable.competencia, q.data.competencia));

  const rows = await db
    .select({ f: comissaoFechamentosTable, vendedoraNome: usuariosTable.nome })
    .from(comissaoFechamentosTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, comissaoFechamentosTable.vendedoraId))
    .where(and(...filtros))
    .orderBy(desc(comissaoFechamentosTable.competencia), desc(comissaoFechamentosTable.valorTotal));

  res.json(ListComissaoFechamentosResponse.parse(rows.map(({ f, vendedoraNome }) => ({ ...f, vendedoraNome }))));
});

/**
 * Fecha a competência: por vendedora com vendas, grava o fechamento e gera a
 * ContaPagar COMISSAO.
 *
 * IDEMPOTENTE: quem já fechou é pulado, não pago de novo. Isso é o que torna
 * seguro reexecutar depois de um erro no meio — e o unique(loja, vendedora,
 * competência) é a rede embaixo, caso duas requisições corram juntas.
 *
 * Só fecha competência PASSADA: o mês corrente ainda pode receber vendas, e a
 * faixa é retroativa — fechar hoje pagaria pela faixa errada.
 */
router.post("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = GerarComissaoFechamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { competencia } = parsed.data;
  if (!competenciaValida(competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
    return;
  }
  if (competencia >= competenciaDe(new Date())) {
    res.status(422).json({
      error: "COMPETENCIA_CORRENTE",
      detalhe: "Só competências passadas fecham — o mês corrente ainda pode receber vendas",
    });
    return;
  }

  // Tudo que decide quanto pagar é lido DENTRO da transação, no mesmo instante
  // das escritas: vendas, estorno e regra. `null` distingue "não havia venda"
  // (422) de "todas já fechadas" (409) — os dois devolvem lista vazia.
  let criados: Awaited<ReturnType<typeof fecharTransacao>>;
  try {
    criados = await fecharTransacao();
  } catch (err) {
    // Dois fechamentos simultâneos: a unique(loja,vendedora,competencia) protege
    // o dinheiro (a 2ª transação faz rollback), mas a violação vinha embrulhada
    // e escapava como 500. Aqui vira o 409 idempotente pretendido.
    if (ehViolacaoUnica(err)) {
      res.status(409).json({
        error: "COMPETENCIA_JA_FECHADA",
        detalhe: `Fechamento de ${competencia} já estava em curso`,
      });
      return;
    }
    throw err;
  }

  async function fecharTransacao() {
   return db.transaction(async (tx) => {
    const vendas = await vendasDaCompetencia(tx, lojaId, competencia);
    if (vendas.size === 0) return null;
    const vendedoraIds = [...vendas.keys()];

    const jaFechadas = new Set(
      (await tx
        .select({ vendedoraId: comissaoFechamentosTable.vendedoraId })
        .from(comissaoFechamentosTable)
        .where(and(
          eq(comissaoFechamentosTable.lojaId, lojaId),
          eq(comissaoFechamentosTable.competencia, competencia),
        ))).map((f) => f.vendedoraId),
    );
    const aFechar = vendedoraIds.filter((id) => !jaFechadas.has(id));
    if (aFechar.length === 0) return [];

    const [estornos, regras, nomes] = await Promise.all([
      estornosPendentes(tx, lojaId, aFechar, competencia),
      regrasVigentes(tx, lojaId, aFechar, competencia),
      tx.select({ id: usuariosTable.id, nome: usuariosTable.nome })
        .from(usuariosTable)
        .where(inArray(usuariosTable.id, aFechar)),
    ]);
    const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
    const venc = vencimentoComissao(competencia);
    const saida = [];

    for (const vendedoraId of aFechar) {
      const brutoC = vendas.get(vendedoraId) ?? 0;
      const estorno = estornos.get(vendedoraId) ?? { totalC: 0, contratoIds: [] };
      const netC = brutoC - estorno.totalC;
      const regra = regras.get(vendedoraId);
      const r = regra
        ? calcularComissao(netC, regra.faixas, regra.bonusAcumulaFaixas)
        : { percentualAplicado: null, valorComissao: 0, valorBonus: 0, valorTotal: 0 };

      const fechamentoId = randomUUID();
      let contaPagarId: string | null = null;
      if (r.valorTotal > 0) {
        contaPagarId = randomUUID();
        await tx.insert(contasPagarTable).values({
          id: contaPagarId,
          lojaId,
          tipo: "COMISSAO",
          colaboradorId: vendedoraId,
          competencia,
          descricao: `Comissão ${competencia} — ${nomePorId.get(vendedoraId) ?? "vendedora"}`,
          valorPrevisto: real(r.valorTotal),
          vencimento: venc,
          origemComissaoFechamentoId: fechamentoId,
        });
      }

      const [fechamento] = await tx.insert(comissaoFechamentosTable).values({
        id: fechamentoId,
        lojaId,
        vendedoraId,
        competencia,
        totalVendas: real(Math.max(0, netC)),
        percentualAplicado: r.percentualAplicado,
        valorComissao: real(r.valorComissao),
        valorBonus: real(r.valorBonus),
        valorTotal: real(r.valorTotal),
        contaPagarId,
      }).returning();

      // §6.4: só marca os cancelados como reconciliados se o mês absorveu o
      // estorno INTEIRO. Se não absorveu, o saldo segue pendente e carrega para
      // a competência seguinte — senão a diferença sumiria sem ninguém pagar.
      if (netC >= 0 && estorno.contratoIds.length > 0) {
        await tx
          .update(contratosTable)
          .set({ comissaoEstornadaEm: new Date() })
          .where(and(
            eq(contratosTable.lojaId, lojaId),
            inArray(contratosTable.id, estorno.contratoIds),
          ));
      }

      saida.push({ ...fechamento, vendedoraNome: nomePorId.get(vendedoraId) ?? null });
    }
    return saida;
   });
  }

  if (criados === null) {
    res.status(422).json({ error: "SEM_MOVIMENTO", detalhe: `Nenhuma venda em ${competencia}` });
    return;
  }
  if (criados.length === 0) {
    res.status(409).json({
      error: "COMPETENCIA_JA_FECHADA",
      detalhe: `Todas as vendedoras de ${competencia} já foram fechadas`,
    });
    return;
  }
  res.status(201).json(GerarComissaoFechamentoResponse.parse(criados));
});

/**
 * O outro lado do I10: as baixas manuais já feitas, com quem baixou, quando e
 * por quê. Reconciliação automática (estorno absorvido por um fechamento) não
 * entra — não tem autor nem motivo; o filtro é justamente `baixa_por IS NOT
 * NULL`. Sem este relatório o rastro existe no banco mas ninguém o vê.
 */
router.get("/lojas/:lojaId/comissao/estornos/baixas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const autor = aliasedTable(usuariosTable, "autor_baixa");
  const linhas = await db
    .select({
      contratoId: contratosTable.id,
      vendedoraId: contratosTable.vendedoraId,
      vendedoraNome: usuariosTable.nome,
      noivaNome: leadsTable.noivaNome,
      valor: contratosTable.valorTotal,
      motivo: contratosTable.comissaoEstornoBaixaMotivo,
      baixadoPorNome: autor.nome,
      baixadoEm: contratosTable.comissaoEstornadaEm,
    })
    .from(contratosTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, contratosTable.vendedoraId))
    .leftJoin(leadsTable, eq(leadsTable.id, contratosTable.leadId))
    .leftJoin(autor, eq(autor.id, contratosTable.comissaoEstornoBaixaPor))
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      isNotNull(contratosTable.comissaoEstornoBaixaPor),
    ))
    .orderBy(desc(contratosTable.comissaoEstornadaEm));
  res.json(ListBaixasEstornoComissaoResponse.parse(linhas));
});

/**
 * Baixa MANUAL do estorno pendente de uma vendedora (I10) — só admin.
 *
 * O estorno de uma venda cancelada só é reconciliado quando UM mês o absorve
 * (`fecharTransacao`, §6.4). Se a vendedora parou de vender, nenhum mês absorve
 * e o valor carrega para sempre — visível, mas sem saída pela tela. Esta é a
 * saída: uma decisão humana, gateada por admin, que carimba `comissaoEstornadaEm`
 * (o estorno para de carregar) e registra QUEM baixou e por quê. Nunca é
 * automática de propósito — uma baixa silenciosa esconderia um lançamento errado
 * ou uma fraude.
 */
router.post("/lojas/:lojaId/comissao/estornos/baixa",
  requireModulo("admin", "editar"),
  async (req, res): Promise<void> => {
    const lojaId = req.params.lojaId as string;
    const parsed = BaixarEstornoComissaoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { vendedoraId, competencia, motivo } = parsed.data;
    if (!competenciaValida(competencia)) {
      res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
      return;
    }

    const [membro] = await db
      .select({ usuarioId: usuariosLojasTable.usuarioId })
      .from(usuariosLojasTable)
      .where(and(eq(usuariosLojasTable.lojaId, lojaId), eq(usuariosLojasTable.usuarioId, vendedoraId)));
    if (!membro) {
      res.status(422).json({ error: "VENDEDORA_INVALIDA", detalhe: "A vendedora não é da loja" });
      return;
    }

    const baixadoPor = req.usuario!.id;
    const resultado = await db.transaction(async (tx) => {
      // O pendente é recalculado DENTRO da transação, como no fechamento: a lista
      // a baixar nasce do estado do banco no instante da escrita, não de ids que
      // o cliente mandou (que poderiam baixar o que já não está pendente, ou uma
      // pendência nascida entre o preview e o clique).
      const pend = await estornosPendentes(tx, lojaId, [vendedoraId], competencia);
      const e = pend.get(vendedoraId);
      if (!e || e.contratoIds.length === 0) return null;

      await tx
        .update(contratosTable)
        .set({
          comissaoEstornadaEm: new Date(),
          comissaoEstornoBaixaPor: baixadoPor,
          comissaoEstornoBaixaMotivo: motivo ?? null,
        })
        .where(and(eq(contratosTable.lojaId, lojaId), inArray(contratosTable.id, e.contratoIds)));

      // E10: além das colunas do I10 (acopladas ao contrato), a linha na
      // trilha transversal — uma baixa cobre N contratos, uma linha só.
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "ESTORNO_COMISSAO_BAIXADO",
        entidade: "contrato",
        entidadeId: e.contratoIds[0],
        detalhe: {
          vendedoraId,
          competencia,
          motivo: motivo ?? null,
          contratoIds: e.contratoIds,
          valorBaixado: e.totalC / 100,
        },
      });

      return { contratosBaixados: e.contratoIds.length, valorBaixadoC: e.totalC };
    });

    if (!resultado) {
      res.status(422).json({
        error: "SEM_ESTORNO_PENDENTE",
        detalhe: `Nenhum estorno pendente para a vendedora em ${competencia}`,
      });
      return;
    }

    res.status(200).json(
      BaixarEstornoComissaoResponse.parse({
        vendedoraId,
        contratosBaixados: resultado.contratosBaixados,
        valorBaixado: real(resultado.valorBaixadoC),
      }),
    );
  },
);

export default router;
