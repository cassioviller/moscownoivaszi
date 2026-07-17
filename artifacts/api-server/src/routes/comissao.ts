import { Router, type IRouter } from "express";
import {
  db,
  comissaoRegrasTable,
  comissaoFaixasTable,
  comissaoFechamentosTable,
  contasPagarTable,
  contratosTable,
  usuariosTable,
  usuariosLojasTable,
} from "@workspace/db";
import { eq, and, gte, lt, lte, inArray, isNull, desc } from "drizzle-orm";
import { ehViolacaoUnica } from "../lib/erros";
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

// ── Preview (ranking ao vivo) ──

router.get("/lojas/:lojaId/comissao/preview", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = PreviewComissaoQueryParams.safeParse(req.query);
  if (!q.success || !competenciaValida(q.data.competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
    return;
  }
  const { competencia } = q.data;

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

export default router;
