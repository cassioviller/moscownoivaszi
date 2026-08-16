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
import { eq, and, count, gt, gte, lt, lte, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { alias as aliasedTable } from "drizzle-orm/pg-core";
import { erroDeValidacao } from "../lib/erros";
import { registrarAuditoria } from "../lib/auditoria";
import {
  ListComissaoRegrasResponse,
  CreateComissaoRegraBody,
  CreateComissaoRegraResponse,
  UpdateComissaoRegraBody,
  UpdateComissaoRegraResponse,
  ListComissaoFechamentosResponse,
  ListComissaoFechamentosQueryParams,
  ListPendenciasComissaoResponse,
  ReabrirComissaoFechamentoResponse,
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
  competenciasAnteriores,
  pendenciasDeFechamento,
  validarFaixas,
  vencimentoComissao,
  type FaixaCalc,
} from "../lib/comissao";
import { diaLocal } from "@workspace/financeiro-core";

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
/**
 * S-O32 — **as três portas que escrevem `contratos.comissao_estornada_em`
 * trancam a linha do CONTRATO antes.**
 *
 * `comissao.ts` era **a única tabela quente que as Faixas A e B da trilha não
 * abriram**, e a varredura do E171 a achou por isso: as três escritas — reabrir
 * fechamento (`:1035`, que trancava a CONTA A PAGAR e não o contrato), fechar
 * competência (`:1301`) e baixar estorno à mão (`:1407`) — decidiam sobre a
 * mesma coluna sem segurar a linha.
 *
 * O modo de falha é o de sempre nesta casa, e aqui ele custa dinheiro de
 * verdade: reabrir × fechar no mesmo segundo decidem em ordens diferentes. O
 * estorno volta a `PENDENTE` pela reabertura e é **recarimbado pelo
 * fechamento sem ter sido abatido** — a loja paga comissão sobre venda
 * desfeita, que é exatamente o que o E54 existe para impedir.
 *
 * A tranca vai **ORDENADA por id**, como em `contratos.ts:643` e
 * `reservas.ts:65`: duas portas segurando os mesmos contratos em ordens
 * diferentes se serializariam num deadlock em vez de numa fila.
 */
async function trancarContratos(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lojaId: string,
  ids: readonly string[],
): Promise<void> {
  for (const id of [...ids].sort()) {
    await tx
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, id), eq(contratosTable.lojaId, lojaId)))
      .for("update");
  }
}

/**
 * E238 (S-O106, S-O107) — **a linha do FECHAMENTO também se tranca, e é a
 * primeira da fila.**
 *
 * A S-O79 trancou o CONTRATO e releu o carimbo sob a tranca — e deixou de fora
 * a outra tabela que decide o fechamento: `comissao_fechamentos`. Duas leituras
 * dela decidiam sem ninguém segurar a linha:
 *
 * - **S-O107** — `jaFechadas` (quem já fechou nesta competência) saía de um
 *   `select` solto. Reabrir apaga a linha; se o fechamento a lê antes de o
 *   DELETE commitar, ele conta a vendedora como já fechada, não fecha ninguém e
 *   responde **409 "Todas as vendedoras de 2025-07 já foram fechadas"** sobre
 *   uma competência que acabou de voltar a estar aberta. A dona clica em
 *   fechar logo depois de reabrir e ouve que já fechou.
 * - **S-O106** — `estornosPendentes` subtrai do pendente o que fechamentos
 *   PARCIAIS já absorveram (`estorno_absorvido`, E102/C5). Reabrir um parcial
 *   devolve o valor ao pendente **apagando a linha**; o fechamento que a leu
 *   antes carrega o pendente velho, e a releitura da S-O79 não o alcança —
 *   ela relê o contrato, não o fechamento. E o reabrir de um parcial **não
 *   tranca contrato nenhum** (a lista dele é vazia por definição), então a
 *   tranca do contrato não serializa os dois. Medido: pendente de R$ 10.000,00
 *   com R$ 4.000,00 já absorvidos por 2025-07; reabrir 07 × fechar 08 (venda de
 *   R$ 20.000,00) no mesmo segundo dava base de **R$ 14.000,00 em vez de
 *   R$ 10.000,00** — R$ 4.000,00 de estorno perdidos, R$ 400,00 pagos a mais.
 *
 * O `FOR UPDATE` cobre TODAS as linhas de fechamento das vendedoras em jogo,
 * de todas as competências: é o conjunto que `estornosPendentes` lê. Quem
 * chega segundo espera; quem acorda relê depois — as duas leituras acima
 * passam a acontecer DEPOIS desta tranca. O reabrir não precisa de tranca
 * própria: o `DELETE … RETURNING` dele já segura a linha, e é contra ela que
 * este `FOR UPDATE` faz fila.
 *
 * Ordem: fechamento ANTES de contrato, nas duas portas que tomam os dois
 * (fechar e baixar à mão) — o reabrir toma a conta a pagar, apaga o fechamento
 * e só então tranca contratos, na mesma direção. `DEGRAUS_DA_ORDEM` declara o
 * degrau.
 */
async function trancarFechamentosDasVendedoras(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lojaId: string,
  vendedoraIds: readonly string[],
): Promise<{ vendedoraId: string; competencia: string }[]> {
  if (vendedoraIds.length === 0) return [];
  return tx
    .select({
      vendedoraId: comissaoFechamentosTable.vendedoraId,
      competencia: comissaoFechamentosTable.competencia,
    })
    .from(comissaoFechamentosTable)
    .where(and(
      eq(comissaoFechamentosTable.lojaId, lojaId),
      inArray(comissaoFechamentosTable.vendedoraId, [...vendedoraIds]),
    ))
    .for("update");
}

/** O que a tranca precisa reler para a decisão continuar valendo. */
type EstornoSobATranca = {
  valorC: number;
  estornadaEm: Date | null;
  baixaPor: string | null;
};

/**
 * S-O79 — **a guarda RELIDA depois da tranca, nas três portas.**
 *
 * O E176 pôs `trancarContratos` nas três (S-O32) e parou aí, e a varredura do
 * E186 mostrou que trancar sem repreguntar não decide nada: a lista de
 * contratos que cada porta carimba nascia ANTES do `FOR UPDATE` — no POOL em
 * `:1071` (reabrir) e dentro da transação, mas antes da tranca, em `:1340`
 * (fechar) e `:1449` (baixar à mão). Quem chega segundo espera na fila,
 * acorda com a lista velha na mão e escreve por cima da decisão de quem
 * chegou primeiro.
 *
 * **O modo de falha custa dinheiro, e as duas direções estão medidas em
 * `so79-corrida-estorno-comissao-api.test.ts`, com corrida determinística:**
 *
 * - Fechar 2025-07 × baixar o estorno à mão, no mesmo segundo. Os dois leem o
 *   mesmo contrato cancelado (R$ 10.000,00) como pendente. A baixa carimba com
 *   quem baixou e por quê; o fechamento acordava e carimbava por cima,
 *   absorvendo os mesmos R$ 10.000,00 na base do mês. Com bruto de
 *   R$ 20.000,00 e faixa de 10%, a base saía **R$ 10.000,00 em vez de
 *   R$ 20.000,00** e a vendedora recebia **R$ 1.000,00 em vez de
 *   R$ 2.000,00** — o mesmo estorno consumido duas vezes.
 * - Reabrir o mesmo fechamento duas vezes. O segundo apagava uma linha que já
 *   não existia e devolvia `comissaoEstornadaEm` a NULL num contrato que, no
 *   intervalo, tinha recebido uma BAIXA MANUAL — o `comissaoEstornoBaixaPor`
 *   fica, a data some, e os mesmos R$ 10.000,00 voltam a descontar a vendedora
 *   no fechamento seguinte, com a lista de baixas dizendo que já saíram.
 *
 * A releitura é uma só, chamada logo DEPOIS de `trancarContratos` nas três
 * portas — é a forma que o E158 deu a `contratos.ts` e o E176 deixou pela
 * metade aqui. Cada chamadora decide o que fazer com o que leu, porque o
 * estado que cada uma espera é diferente: fechar e baixar querem o contrato
 * ainda PENDENTE (`comissaoEstornadaEm IS NULL`); reabrir quer o contrato
 * ainda carimbado POR FECHAMENTO (carimbo presente, sem baixa manual).
 */
async function relerEstornosSobATranca(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lojaId: string,
  ids: readonly string[],
): Promise<Map<string, EstornoSobATranca>> {
  if (ids.length === 0) return new Map();
  const linhas = await tx
    .select({
      id: contratosTable.id,
      valorTotal: contratosTable.valorTotal,
      estornadaEm: contratosTable.comissaoEstornadaEm,
      baixaPor: contratosTable.comissaoEstornoBaixaPor,
    })
    .from(contratosTable)
    .where(and(eq(contratosTable.lojaId, lojaId), inArray(contratosTable.id, [...ids])));
  return new Map(
    linhas.map((l) => [
      l.id,
      { valorC: cent(l.valorTotal), estornadaEm: l.estornadaEm, baixaPor: l.baixaPor },
    ]),
  );
}

/**
 * O recorte que fechar e baixar-à-mão fazem com o que a releitura trouxe:
 * some da lista quem deixou de estar pendente, e o valor dele sai da soma.
 *
 * A subtração é a conta certa porque `totalC` é a soma dos cancelados
 * pendentes MENOS o que fechamentos parciais já absorveram (E102/C5) — tirar
 * um contrato da lista tira o valor dele, não recalcula a absorção.
 */
function descartarJaCarimbados(
  mapa: Map<string, EstornoPendente>,
  sobATranca: Map<string, EstornoSobATranca>,
): void {
  for (const e of mapa.values()) {
    const vivos: string[] = [];
    for (const id of e.contratoIds) {
      const sob = sobATranca.get(id);
      if (sob && sob.estornadaEm === null) {
        vivos.push(id);
        continue;
      }
      e.totalC = Math.max(0, e.totalC - (sob?.valorC ?? 0));
    }
    e.contratoIds = vivos;
  }
}

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
        estornoAbsorvido: comissaoFechamentosTable.estornoAbsorvido,
        estornoContratoIds: comissaoFechamentosTable.estornoContratoIds,
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

  /**
   * E102/C5 — desconta o que fechamentos ANTERIORES já absorveram em parte.
   *
   * A absorção proporcional (decisão do dono em 2026-07-25) faz um mês abater
   * `min(bruto, pendente)` sem reconciliar contrato nenhum, porque abater
   * metade de um cancelamento não é "meio contrato reconciliado". Esses
   * fechamentos ficam com `estornoContratoIds` vazio e `estornoAbsorvido > 0`.
   *
   * Só os PARCIAIS entram aqui: quem absorveu tudo carimbou os contratos, e
   * eles já saíram da soma acima (`comissaoEstornadaEm IS NULL`). Somar os dois
   * descontaria duas vezes.
   *
   * A conta é DERIVADA, não acumulada — e é por isso que reabrir um fechamento
   * parcial devolve o valor ao pendente sem uma linha de código: a linha some,
   * a soma muda.
   */
  for (const f of fechs) {
    if ((f.estornoContratoIds?.length ?? 0) > 0) continue;
    const absorvidoC = cent(f.estornoAbsorvido ?? 0);
    if (absorvidoC <= 0) continue;
    const e = mapa.get(f.vendedoraId);
    if (e) e.totalC = Math.max(0, e.totalC - absorvidoC);
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
    res.status(400).json(erroDeValidacao(parsed.error));
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

  /**
   * E102/C7 — a escada é POR MÊS, e o sistema passa a recusar o meio dele.
   *
   * **Decisão do dono em 2026-07-25.** A vigência sempre foi resolvida por
   * competência inteira: uma escada criada dia 20 reprecificava os 19 dias
   * anteriores, e o preview saltava de R$ 2.000 para R$ 6.400 no instante em
   * que ela era salva. O docstring prometia "a regra que valia naquele mês", e
   * o único teste usava virada de mês — o caso do meio nunca foi exercitado.
   *
   * Recusar é mais honesto que documentar: o campo se chama `vigenciaInicio` e
   * agora ele significa exatamente isso, sem ambiguidade. Quem quer valer para
   * um mês manda o primeiro dia dele.
   */
  // A pergunta é sobre o DIA, não sobre o instante: `2020-01-01T12:00-03:00` e
  // `2020-01-01T00:00-03:00` são o mesmo primeiro dia, e comparar `getTime()`
  // reprovaria o segundo. Mesma régua de `competenciaDe`: `diaLocal` do
  // financeiro-core (S35 — o `-3h` à mão saiu; equivalência provada em teste).
  const diaDoMesSP = Number(diaLocal(vigenciaInicio).slice(8, 10));
  if (diaDoMesSP !== 1) {
    res.status(422).json({
      error: "VIGENCIA_FORA_DA_COMPETENCIA",
      detalhe: "A escada de comissão vale por mês inteiro — informe o primeiro dia da competência",
      campos: [
        {
          campo: "vigenciaInicio",
          motivo: `Use o primeiro dia de ${competenciaDe(vigenciaInicio)}`,
        },
      ],
    });
    return;
  }

  const regraId = await db.transaction(async (tx) => {
    /**
     * S-M25 (rodada 2, achado 2#1): a validação acima pergunta pelo DIA
     * ("dois instantes do mesmo primeiro dia são a mesma vigência") e este
     * dedup perguntava pelo INSTANTE — a correção enviada com a âncora
     * canônica (meio-dia SP) não casava com a regra nascida da tela
     * (meia-noite SP) e virava SEGUNDA regra da mesma competência: o `find`
     * escolhia pela hora, o fechamento pagava R$ 500,00 onde a correção dizia
     * R$ 300,00, e a linha do tempo desenhava um período invertido. A régua é
     * a da própria validação: mesmo DIA local = mesma vigência.
     */
    const [existente] = await tx
      .select({ id: comissaoRegrasTable.id })
      .from(comissaoRegrasTable)
      .where(and(
        eq(comissaoRegrasTable.lojaId, lojaId),
        eq(comissaoRegrasTable.vendedoraId, vendedoraId),
        sql`(${comissaoRegrasTable.vigenciaInicio} at time zone 'America/Sao_Paulo')::date = ${diaLocal(vigenciaInicio)}::date`,
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
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [atualizada] = await db
    .update(comissaoRegrasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(comissaoRegrasTable.id, regraId), eq(comissaoRegrasTable.lojaId, lojaId)))
    .returning();
  if (!atualizada) {
    res.status(404).json({ error: "REGRA_NAO_ENCONTRADA", detalhe: "Esta regra não existe nesta loja." });
    return;
  }
  const [regra] = await carregarRegras(lojaId, [atualizada.vendedoraId]).then((rs) =>
    rs.filter((r) => r.id === regraId),
  );
  res.json(UpdateComissaoRegraResponse.parse(regra));
});

/**
 * S-M16 — era um dos três deletes crus que sobraram fora da régua do E115.
 * As faixas caem por cascade — elas não existem fora da regra —, e o
 * fechamento já feito não é tocado (ele congela os valores na hora do fecho).
 * O que faltava: 404 em vez de 204 sobre o nada, e o rastro — a escada de
 * comissão de uma vendedora é regra de DINHEIRO, e sumia sem uma linha
 * dizendo quem a levou.
 */
router.delete("/lojas/:lojaId/comissao/regras/:regraId", async (req, res): Promise<void> => {
  const { lojaId, regraId } = req.params as { lojaId: string; regraId: string };
  const [regra] = await db.select().from(comissaoRegrasTable)
    .where(and(eq(comissaoRegrasTable.id, regraId), eq(comissaoRegrasTable.lojaId, lojaId)));
  if (!regra) {
    res.status(404).json({ error: "REGRA_NAO_ENCONTRADA", detalhe: "Esta regra de comissão não existe nesta loja." });
    return;
  }
  const [faixas] = await db.select({ n: count() }).from(comissaoFaixasTable)
    .where(eq(comissaoFaixasTable.regraId, regraId));
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "COMISSAO_REGRA_REMOVIDA",
      entidade: "comissao_regra",
      entidadeId: regraId,
      detalhe: { vendedoraId: regra.vendedoraId, faixas: faixas!.n },
    });
    await tx.delete(comissaoRegrasTable)
      .where(and(eq(comissaoRegrasTable.id, regraId), eq(comissaoRegrasTable.lojaId, lojaId)));
  });
  res.status(204).send();
});

// ── Simulador de escada (E23) ──
// S35: havia aqui uma `competenciaAnterior(comp, n)` reimplementando, mês a
// mês, o que `competenciasAnteriores` (importada deste MESMO arquivo desde o
// E53) já devolve de uma vez — o mesmo `Date.UTC(ano, mes - 1 - n, 1)`.

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
    res.status(400).json(erroDeValidacao(parsed.error));
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
  const comps = competenciasAnteriores(atual, meses);

  const fechamentos = await db
    .select()
    .from(comissaoFechamentosTable)
    .where(and(
      eq(comissaoFechamentosTable.lojaId, lojaId),
      eq(comissaoFechamentosTable.vendedoraId, vendedoraId),
      inArray(comissaoFechamentosTable.competencia, comps),
    ));
  const fechadaPor = new Map(fechamentos.map((f) => [f.competencia, f]));

  /**
   * S35 — o laço abaixo rodava DUAS buscas por competência aberta
   * (`vendasDaCompetencia` + `regrasVigentes`, esta em dois selects): com os 3
   * meses do padrão sem fechamento eram 9 consultas dentro do laço. Agora as
   * competências abertas se agregam ANTES: uma consulta de contratos cobrindo
   * o intervalo inteiro e uma de regras (+ uma de faixas), particionadas em
   * memória pelas MESMAS réguas dos helpers (`competenciaDe` para o balde do
   * contrato, `vigenciaInicio < fim` na ordem desc para a regra vigente).
   */
  const abertas = comps.filter((c) => !fechadaPor.has(c));
  const vendasAbertasC = new Map<string, number>();
  const regraPorAberta = new Map<string, { bonusAcumulaFaixas: boolean; faixas: FaixaCalc[] }>();
  if (abertas.length > 0) {
    const { inicio } = limitesCompetencia(abertas[0]);
    const { fim } = limitesCompetencia(abertas[abertas.length - 1]);
    const contratos = await db
      .select({ valorTotal: contratosTable.valorTotal, fechadoEm: contratosTable.fechadoEm })
      .from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, lojaId),
        eq(contratosTable.vendedoraId, vendedoraId),
        eq(contratosTable.status, "ATIVO"),
        gte(contratosTable.fechadoEm, inicio),
        lt(contratosTable.fechadoEm, fim),
      ));
    for (const c of contratos) {
      const comp = competenciaDe(c.fechadoEm!);
      if (!fechadaPor.has(comp)) {
        vendasAbertasC.set(comp, (vendasAbertasC.get(comp) ?? 0) + cent(c.valorTotal));
      }
    }

    const regras = await db
      .select()
      .from(comissaoRegrasTable)
      .where(and(
        eq(comissaoRegrasTable.lojaId, lojaId),
        eq(comissaoRegrasTable.vendedoraId, vendedoraId),
        eq(comissaoRegrasTable.ativo, true),
        lt(comissaoRegrasTable.vigenciaInicio, fim),
      ))
      .orderBy(desc(comissaoRegrasTable.vigenciaInicio));
    const faixasRows = regras.length > 0
      ? await db
          .select()
          .from(comissaoFaixasTable)
          .where(inArray(comissaoFaixasTable.regraId, regras.map((r) => r.id)))
      : [];
    const faixasPorRegra = new Map<string, FaixaCalc[]>();
    for (const f of faixasRows) {
      const lista = faixasPorRegra.get(f.regraId) ?? [];
      lista.push(paraCalc(f));
      faixasPorRegra.set(f.regraId, lista);
    }
    for (const comp of abertas) {
      // desc → a primeira cuja vigência começou antes do fim do mês é a
      // vigente naquele mês: o MESMO critério de `regrasVigentes`.
      const fimComp = limitesCompetencia(comp).fim;
      const vigente = regras.find((r) => r.vigenciaInicio < fimComp);
      if (vigente) {
        regraPorAberta.set(comp, {
          bonusAcumulaFaixas: vigente.bonusAcumulaFaixas,
          faixas: faixasPorRegra.get(vigente.id) ?? [],
        });
      }
    }
  }

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
      baseC = vendasAbertasC.get(competencia) ?? 0;
      const regra = regraPorAberta.get(competencia);
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

  const [vendas, estornos, regras, fechamentos, ranking] = await Promise.all([
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
    // A MESMA ordenação do preview (E55): daqui sai só o ordinal, mas a
    // posição tem de ser a mesma que a gestão vê — duas ordens divergiriam.
    linhasDaCompetencia(lojaId, competencia, new Date()),
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
    // Só o ordinal: onde a pessoa está, nunca quanto as colegas ganham.
    colocacao: colocacaoDe(ranking.linhas, vendedoraId, !!regra),
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

/**
 * As linhas da competência, ORDENADAS — a fonte única do ranking (E55).
 *
 * Nasceu dentro da rota de preview e saiu quando o extrato pessoal passou a
 * precisar da mesma ordem para dizer "3º de 8": duas implementações de
 * ordenação acabariam discordando, e a vendedora veria uma posição no extrato
 * dela e outra no ranking da gestão.
 *
 * `imutavel` diz se veio da memória do fechamento (competência fechada) ou de
 * cálculo ao vivo — é o que autoriza o cache longo na resposta do preview.
 */
async function linhasDaCompetencia(lojaId: string, competencia: string, agora: Date) {
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

  /**
   * A imutabilidade é por (competência, VENDEDORA) — não por competência.
   *
   * O `if (fechamentosDaComp.length > 0)` decidia pelo MÊS: bastava UMA
   * vendedora fechada para a resposta virar a lista de fechamentos, e quem
   * vendeu naquele mês sem ter fechamento sumia do preview e do ranking,
   * levando o estorno pendente junto — o mesmo caso que
   * `lib/comissao.ts:249-263` já documenta como o erro dessa granularidade,
   * e que a `pendenciasDeFechamento` resolve do outro lado.
   *
   * Aqui o cálculo ao vivo passa a rodar para quem FALTA, e a memória do
   * fechamento continua mandando em quem já fechou. `imutavel` só vale quando
   * não sobrou ninguém de fora — é ele que autoriza o cache longo.
   */
  const jaFechadas = new Set(fechamentosDaComp.map((f) => f.fechamento.vendedoraId));
  const [vendasDoMes, candidatasDoMes] = await Promise.all([
    vendasDaCompetencia(db, lojaId, competencia),
    candidatasComEstorno(db, lojaId),
  ]);
  const faltantes = [...new Set([...vendasDoMes.keys(), ...candidatasDoMes])].filter(
    (id) => !jaFechadas.has(id),
  );

  if (fechamentosDaComp.length > 0 && faltantes.length === 0) {
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
    return { linhas, imutavel: true };
  }

  // Quem vendeu no mês MAIS quem deve estorno: uma vendedora que parou de
  // vender ainda precisa aparecer, senão o estorno dela some da tela e carrega
  // para sempre sem ninguém saber. Com a competência parcialmente fechada, são
  // só as que faltam — as fechadas entram pela memória, logo abaixo.
  const vendas = vendasDoMes;
  const vendedoraIds = faltantes;
  if (vendedoraIds.length === 0) return { linhas: [], imutavel: false };

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
      projecao: projecaoDaLinha(brutoC, estorno.totalC, competencia, regra, agora),
    };
  });
  // Candidata sem estorno qualificado (cancelou, mas de um mês que nunca
  // fechou — a comissão nunca chegou a ser paga) não tem o que mostrar: entrou
  // na pergunta, não na resposta.
  const visiveis = linhas.filter((l) => vendas.has(l.vendedoraId) || l.estornoPendente > 0);

  // Competência parcialmente fechada: a memória de quem fechou entra junto do
  // cálculo ao vivo de quem faltou, na mesma lista e na mesma ordem.
  const daMemoria = fechamentosDaComp.map(({ fechamento, vendedoraNome }) => ({
    vendedoraId: fechamento.vendedoraId,
    vendedoraNome,
    totalVendas: fechamento.totalVendas,
    estornoPendente: 0,
    percentualAplicado: fechamento.percentualAplicado,
    valorComissao: fechamento.valorComissao,
    valorBonus: fechamento.valorBonus,
    valorTotal: fechamento.valorTotal,
    faltaProximoDegrau: null,
    projecao: null,
  }));

  const todas = [...daMemoria, ...visiveis];
  todas.sort((a, b) => b.valorTotal - a.valorTotal || b.estornoPendente - a.estornoPendente);
  return { linhas: todas, imutavel: false };
}

/**
 * A colocação da pessoa dentro da competência (E55), SEM os valores das
 * colegas.
 *
 * O ranking já existia no preview, atrás do gate de gestão — a vendedora não
 * podia ver onde está sem ganhar acesso a quanto todo mundo ganha. Aqui sai
 * só o ordinal: posição e total de pessoas.
 *
 * Empate compartilha a posição (1224, não 1223): duas pessoas com o mesmo
 * total são a mesma colocação, e desempatar por um critério invisível faria a
 * segunda achar que perdeu por algum motivo que ninguém sabe explicar.
 *
 * Menos de duas pessoas não é ranking — "1º de 1" é ruído, e some.
 *
 * E quem NÃO tem escada vigente fica de fora. O ranking é de comissão, e sem
 * escada a comissão é zero por definição: a pessoa apareceria em último tendo
 * vendido mais que todo mundo, sem nada na tela que explicasse por quê. Para
 * ela o extrato já diz o que importa — "sem escada vigente, fale com a
 * administração" —, e uma colocação ali só somaria uma injustiça aparente.
 */
function colocacaoDe(
  linhas: readonly { vendedoraId: string; valorTotal: number }[],
  vendedoraId: string,
  temRegra: boolean,
): { posicao: number; de: number } | null {
  if (!temRegra || linhas.length < 2) return null;
  const minha = linhas.find((l) => l.vendedoraId === vendedoraId);
  if (!minha) return null;
  const acima = linhas.filter((l) => l.valorTotal > minha.valorTotal).length;
  return { posicao: acima + 1, de: linhas.length };
}

router.get("/lojas/:lojaId/comissao/preview", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = PreviewComissaoQueryParams.safeParse(req.query);
  if (!q.success || !competenciaValida(q.data.competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA" });
    return;
  }

  const { linhas, imutavel } = await linhasDaCompetencia(lojaId, q.data.competencia, new Date());
  // Imutável de verdade: o navegador pode segurar por uma hora sem risco.
  if (imutavel) res.setHeader("Cache-Control", "private, max-age=3600");
  res.json(PreviewComissaoResponse.parse(linhas));
});

/**
 * Reabrir um fechamento errado (E54).
 *
 * Fechar cria conta a pagar e reconcilia estorno; até aqui, desfazer isso só
 * pelo SQL — o que significa que ninguém desfazia, ou desfazia pela metade.
 * A reversão é TRANSACIONAL e desfaz as três coisas que o fechamento fez:
 * apaga a conta gerada, apaga o fechamento e devolve `comissaoEstornadaEm` a
 * NULL nos contratos que ESTE fechamento reconciliou.
 *
 * A guarda que protege o dinheiro: conta já PAGA recusa (409). Reabrir deixaria
 * uma saída de caixa sem contrapartida — mesma régua do DELETE de conta a
 * pagar, e o caminho é estornar o pagamento antes.
 *
 * DELETE, e não POST /reabrir: reabrir É apagar o fechamento, e o guard deriva
 * a ação do método (DELETE → editar) sem precisar de exceção.
 */
router.delete("/lojas/:lojaId/comissao/fechamentos/:fechamentoId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const fechamentoId = req.params.fechamentoId as string;

  const [fechamento] = await db
    .select()
    .from(comissaoFechamentosTable)
    .where(and(
      eq(comissaoFechamentosTable.id, fechamentoId),
      eq(comissaoFechamentosTable.lojaId, lojaId),
    ));
  if (!fechamento) {
    res.status(404).json({ error: "FECHAMENTO_NAO_ENCONTRADO" });
    return;
  }

  if (fechamento.contaPagarId) {
    const [conta] = await db
      .select({ status: contasPagarTable.status })
      .from(contasPagarTable)
      .where(eq(contasPagarTable.id, fechamento.contaPagarId));
    if (conta?.status === "PAGA") {
      res.status(409).json({
        error: "COMISSAO_JA_PAGA",
        detalhe: "A comissão já foi paga — estorne o pagamento antes de reabrir o fechamento.",
      });
      return;
    }
  }

  const resultado = await db.transaction(async (tx) => {
    /**
     * S-M22 (rodada 2, achado 3#3): a guarda de COMISSAO_JA_PAGA acima leu no
     * POOL — entre ela e o delete cabe o POST de pagamento que quita a conta
     * da comissão. Sem a reconferência sob tranca, o pagamento concorrente
     * commitava e o reabrir apagava a conta: saída de R$ 800,00 sem
     * contrapartida, e o próximo fechamento gerava conta NOVA — a loja pagava
     * R$ 1.600,00 por R$ 800,00 devidos. `FOR UPDATE` na conta serializa com
     * o `quitarContas`, que atualiza esta mesma linha.
     */
    if (fechamento.contaPagarId) {
      const [conta] = await tx
        .select({ status: contasPagarTable.status })
        .from(contasPagarTable)
        .where(eq(contasPagarTable.id, fechamento.contaPagarId))
        .for("update");
      if (conta?.status === "PAGA") return { corrida: true as const };
    }
    /**
     * S-O79 — **o DELETE é a guarda relida, e o `returning()` é quem responde.**
     *
     * A lista de estornos saía de `fechamento`, lido no POOL lá em cima: dois
     * cliques no botão "Reabrir" liam a MESMA linha e os dois entravam. O
     * segundo apagava zero linhas em silêncio, respondia 200 com
     * `estornosReabertos: 1` e ainda devolvia `comissaoEstornadaEm` a NULL —
     * num contrato que, no intervalo, podia ter recebido uma BAIXA MANUAL. O
     * `comissaoEstornoBaixaPor` ficava, a data sumia, e R$ 5.000,00 já dados
     * como perdidos voltavam a descontar a vendedora no fechamento seguinte.
     *
     * Agora quem decide é a linha que ESTA transação removeu: o `returning()`
     * vazio é a corrida perdida (404, a mesma resposta do segundo clique
     * sequencial), e a lista de estornos vem de lá, não do pool.
     *
     * A ordem importa: o fechamento sai primeiro porque `conta_pagar_id` é
     * UNIQUE e referencia a conta — apagar a conta antes deixaria a FK
     * (ON DELETE SET NULL) mexendo numa linha que já vai embora.
     */
    /**
     * S-O121 — **só o ÚLTIMO fechamento da vendedora pode ser reaberto**
     * (decisão da dona, 15/08/2026). Reabrir um mês no meio da série muda a
     * base de todos os que vieram depois e nada os recalcula: o parcial de
     * julho que agosto absorveu levava os R$ 4.000,00 sem devolvê-los. A
     * leitura é SOB TRANCA das linhas posteriores desta vendedora — é contra
     * elas que o `FOR UPDATE` do fechar (E238) faz fila, então "não há
     * posterior" continua verdade até esta transação commitar.
     */
    const posteriores = await tx
      .select({ id: comissaoFechamentosTable.id, competencia: comissaoFechamentosTable.competencia })
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, lojaId),
        eq(comissaoFechamentosTable.vendedoraId, fechamento.vendedoraId),
        gt(comissaoFechamentosTable.competencia, fechamento.competencia),
      ))
      .orderBy(desc(comissaoFechamentosTable.competencia))
      .for("update");
    if (posteriores.length > 0) return { naoEOUltimo: true as const, posteriores };

    const [removido] = await tx
      .delete(comissaoFechamentosTable)
      .where(eq(comissaoFechamentosTable.id, fechamentoId))
      .returning();
    if (!removido) return { jaReaberto: true as const };

    if (removido.contaPagarId) {
      await tx.delete(contasPagarTable).where(and(
        eq(contasPagarTable.id, removido.contaPagarId),
        eq(contasPagarTable.lojaId, lojaId),
      ));
    }

    // O estorno volta a PENDENTE: ele não foi absorvido, porque o mês que o
    // absorveu deixou de existir. Sem isto, o valor cancelado sumiria da
    // próxima apuração e a loja pagaria comissão sobre venda desfeita.
    const estornos = removido.estornoContratoIds ?? [];
    let reabertos: string[] = [];
    if (estornos.length > 0) {
      // S-O32: a linha do CONTRATO é a que se tranca — a conta a pagar já era.
      await trancarContratos(tx, lojaId, estornos);
      // S-O79: e a guarda relida sob ela. Reabrir desfaz o que ESTE fechamento
      // fez, então só volta a PENDENTE o contrato que ainda está carimbado e
      // cujo carimbo não é de uma baixa manual — a decisão da dona, com quem
      // baixou e por quê, não se desfaz por tabela.
      const sobATranca = await relerEstornosSobATranca(tx, lojaId, estornos);
      reabertos = estornos.filter((id) => {
        const sob = sobATranca.get(id);
        return sob !== undefined && sob.estornadaEm !== null && sob.baixaPor === null;
      });
      if (reabertos.length > 0) {
        await tx
          .update(contratosTable)
          .set({ comissaoEstornadaEm: null })
          .where(and(
            eq(contratosTable.lojaId, lojaId),
            inArray(contratosTable.id, reabertos),
          ));
      }
    }

    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "COMISSAO_FECHAMENTO_REABERTO",
      entidade: "comissao_fechamento",
      entidadeId: fechamentoId,
      detalhe: {
        competencia: removido.competencia,
        vendedoraId: removido.vendedoraId,
        // O que o fechamento pagava — some da tabela, fica na trilha.
        valorTotal: removido.valorTotal,
        totalVendas: removido.totalVendas,
        contaPagarId: removido.contaPagarId,
        estornosReabertos: reabertos.length,
      },
    });
    return {
      ok: true as const,
      contaPagarRemovida: !!removido.contaPagarId,
      estornosReabertos: reabertos.length,
    };
  });
  if ("corrida" in resultado) {
    res.status(409).json({
      error: "COMISSAO_JA_PAGA",
      detalhe: "A comissão já foi paga — estorne o pagamento antes de reabrir o fechamento.",
    });
    return;
  }
  if ("jaReaberto" in resultado) {
    res.status(404).json({ error: "FECHAMENTO_NAO_ENCONTRADO" });
    return;
  }
  if ("naoEOUltimo" in resultado && resultado.posteriores) {
    const posteriores = resultado.posteriores;
    const meses = posteriores.map((p) => p.competencia).join(", ");
    res.status(422).json({
      error: "FECHAMENTO_NAO_E_O_ULTIMO",
      detalhe: `Esta vendedora tem fechamento posterior (${meses}) — reabra do mais recente para o mais antigo: primeiro ${posteriores[0]!.competencia}.`,
      reabraAntes: posteriores.map((p) => ({ fechamentoId: p.id, competencia: p.competencia })),
    });
    return;
  }

  res.json(ReabrirComissaoFechamentoResponse.parse({
    fechamentoId,
    competencia: fechamento.competencia,
    vendedoraId: fechamento.vendedoraId,
    contaPagarRemovida: resultado.contaPagarRemovida,
    estornosReabertos: resultado.estornosReabertos,
  }));
});

/**
 * Quantas competências para trás a varredura olha. Um ano: pendência mais
 * antiga que isso não é esquecimento, é decisão — e continuar gritando sobre
 * ela treinaria o alerta a ser ignorado.
 */
const MESES_VARREDURA_PENDENCIAS = 12;

// A competência esquecida (E53). Uma consulta para as vendas da janela e outra
// para os fechamentos dela — não uma por mês: `vendasDaCompetencia` é por
// competência, e chamá-la 12 vezes faria 12 idas ao banco para responder uma
// pergunta só.
router.get("/lojas/:lojaId/comissao/pendencias", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const janela = competenciasAnteriores(competenciaDe(new Date()), MESES_VARREDURA_PENDENCIAS);
  const { inicio } = limitesCompetencia(janela[0]);
  const { fim } = limitesCompetencia(janela[janela.length - 1]);

  const [contratos, fechados] = await Promise.all([
    db
      .select({
        vendedoraId: contratosTable.vendedoraId,
        valorTotal: contratosTable.valorTotal,
        fechadoEm: contratosTable.fechadoEm,
      })
      .from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, lojaId),
        eq(contratosTable.status, "ATIVO"),
        gte(contratosTable.fechadoEm, inicio),
        lt(contratosTable.fechadoEm, fim),
      )),
    db
      .select({
        competencia: comissaoFechamentosTable.competencia,
        vendedoraId: comissaoFechamentosTable.vendedoraId,
      })
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, lojaId),
        inArray(comissaoFechamentosTable.competencia, janela),
      )),
  ]);

  // A competência do contrato vem do MESMO `competenciaDe` que o fechamento
  // usa — derivar aqui de outro jeito colocaria uma venda da virada do mês num
  // mês para a varredura e noutro para o fechamento.
  const vendas = contratos.map((c) => ({
    competencia: competenciaDe(c.fechadoEm),
    vendedoraId: c.vendedoraId,
    totalC: cent(c.valorTotal),
  }));

  const pendencias = pendenciasDeFechamento(vendas, fechados, janela);
  res.json(ListPendenciasComissaoResponse.parse(
    pendencias.map((p) => ({
      competencia: p.competencia,
      vendedoras: p.vendedoras,
      totalVendas: real(p.totalC),
    })),
  ));
});

// ── Fechamentos ──

router.get("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = ListComissaoFechamentosQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json(erroDeValidacao(q.error));
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
    res.status(400).json(erroDeValidacao(parsed.error));
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

  /**
   * Tudo que decide quanto pagar é lido DENTRO da transação, no mesmo instante
   * das escritas: vendas, estorno e regra. `null` distingue "não havia venda"
   * (422) de "todas já fechadas" (409) — os dois devolvem lista vazia.
   *
   * **S-O80 — o `catch` local saiu, e o 409 continua sendo o mesmo.**
   *
   * Havia aqui um `if (ehViolacaoUnica(err))` que respondia
   * `409 COMPETENCIA_JA_FECHADA` para QUALQUER violação de unicidade desta
   * transação — e ela escreve em três tabelas: `contas_pagar`,
   * `comissao_fechamentos` e `contratos`. Um 23505 de qualquer outro índice
   * sairia com a frase do fechamento, dizendo à dona que a competência já
   * fechou quando o problema é outro. Desde o E180 a tradução é por ÍNDICE:
   * `comissao_fechamentos_loja_id_vendedora_id_competencia_unique` já tem
   * entrada em `DUPLICADO_POR_INDICE`, com este mesmo código, e o `catch` era
   * a segunda grafia da mesma recusa (regra 26). A prova de equivalência é o
   * teste que já existia — *"fechar concorrente devolve 409, não 500, e paga
   * uma vez só (I8)"*, em `lote9-comissao-api.test.ts`.
   */
  const criados = await fecharTransacao();

  async function fecharTransacao() {
   return db.transaction(async (tx) => {
    const vendas = await vendasDaCompetencia(tx, lojaId, competencia);
    if (vendas.size === 0) return null;
    const vendedoraIds = [...vendas.keys()];

    // E238 (S-O107): quem já fechou é lido SOB a tranca dos fechamentos — o
    // reabrir concorrente que ainda não commitou segura a linha, e este select
    // espera por ele em vez de contar como fechada uma competência que já
    // voltou a estar aberta. E o `estornosPendentes` logo abaixo (S-O106)
    // passa a ler os fechamentos parciais depois da mesma tranca.
    const jaFechadas = new Set(
      (await trancarFechamentosDasVendedoras(tx, lojaId, vendedoraIds))
        .filter((f) => f.competencia === competencia)
        .map((f) => f.vendedoraId),
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
    /**
     * S-O79 — **a tranca sobe para cá, e a guarda é relida sob ela.**
     *
     * `estornosPendentes` já lia dentro da transação, e isso não bastava: em
     * READ COMMITTED o `SELECT` enxerga o commit de quem passou no intervalo, e
     * a lista era usada para decidir a base do mês SEM que ninguém segurasse as
     * linhas. Baixar o estorno à mão no mesmo segundo carimbava os mesmos
     * contratos, e este fechamento os carimbava de novo, absorvendo na base um
     * valor que a dona já tinha dado como perdido — R$ 10.000,00 descontados
     * duas vezes, R$ 1.000,00 a menos no bolso da vendedora a 10%.
     *
     * A tranca vem antes de qualquer conta e cobre os candidatos de TODAS as
     * vendedoras de uma vez, ordenada por id: uma passada só, na ordem que o
     * `trancarContratos` garante, em vez de uma por vendedora dentro do laço.
     */
    const candidatos = [...new Set([...estornos.values()].flatMap((e) => e.contratoIds))];
    await trancarContratos(tx, lojaId, candidatos);
    descartarJaCarimbados(estornos, await relerEstornosSobATranca(tx, lojaId, candidatos));

    const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
    const venc = vencimentoComissao(competencia);
    const saida = [];

    for (const vendedoraId of aFechar) {
      const brutoC = vendas.get(vendedoraId) ?? 0;
      const estorno = estornos.get(vendedoraId) ?? { totalC: 0, contratoIds: [] };
      /**
       * E102/C5 — o mês absorve o que cabe, e o resto carrega.
       *
       * Antes: `netC = brutoC − estorno.totalC`, que ficava NEGATIVO quando o
       * estorno não cabia — e como a reconciliação era tudo-ou-nada, o valor
       * CHEIO voltava no mês seguinte com a base deste mês já consumida. Três
       * meses assim descontaram R$ 20.000 três vezes.
       */
      const absorvidoC = Math.min(brutoC, estorno.totalC);
      const netC = brutoC - absorvidoC;
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

      // §6.4: os contratos só são carimbados quando o mês absorveu o estorno
      // INTEIRO — abater metade de um cancelamento não é "meio contrato
      // reconciliado". Na absorção parcial, o valor absorvido fica na coluna e
      // `estornosPendentes` o desconta do que carrega.
      const reconciliados = absorvidoC >= estorno.totalC ? estorno.contratoIds : [];
      const [fechamento] = await tx.insert(comissaoFechamentosTable).values({
        id: fechamentoId,
        lojaId,
        vendedoraId,
        competencia,
        totalVendas: real(netC),
        estornoAbsorvido: real(absorvidoC),
        percentualAplicado: r.percentualAplicado,
        valorComissao: real(r.valorComissao),
        valorBonus: real(r.valorBonus),
        valorTotal: real(r.valorTotal),
        contaPagarId,
        // A lista do que ESTE fechamento reconciliou (E54) — é ela que deixa a
        // reabertura desfazer exatamente o que este mês fez, e não o do vizinho.
        estornoContratoIds: reconciliados,
      }).returning();

      if (reconciliados.length > 0) {
        // S-O32/S-O79: a tranca e a releitura destas linhas já aconteceram lá
        // em cima, antes de a base do mês ser calculada. Sem elas, a reabertura
        // concorrente devolve o estorno a PENDENTE e este UPDATE o recarimba
        // sem que ele tenha sido abatido.
        await tx
          .update(contratosTable)
          .set({ comissaoEstornadaEm: new Date() })
          .where(and(
            eq(contratosTable.lojaId, lojaId),
            inArray(contratosTable.id, reconciliados),
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
      res.status(400).json(erroDeValidacao(parsed.error));
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
      // E238 (S-O106): a mesma tranca do fechamento, pela mesma razão — o que
      // está pendente depende dos fechamentos da vendedora, e o reabrir apaga
      // linhas dessa tabela sem trancar contrato nenhum.
      await trancarFechamentosDasVendedoras(tx, lojaId, [vendedoraId]);
      const pend = await estornosPendentes(tx, lojaId, [vendedoraId], competencia);
      const e = pend.get(vendedoraId);
      if (!e || e.contratoIds.length === 0) return null;

      // S-O32: a lista já nasce dentro da transação; a tranca é o que impede
      // que ela envelheça entre o cálculo e a escrita.
      await trancarContratos(tx, lojaId, e.contratoIds);
      /**
       * S-O79 — **e a guarda é relida sob a tranca.**
       *
       * Trancar depois de perguntar não decide nada: em READ COMMITTED quem
       * espera na fila acorda com a lista velha na mão. O fechamento da
       * competência seguinte, rodando no mesmo segundo, absorve os mesmos
       * contratos; esta baixa os carimbava por cima, e a lista de baixas
       * passava a reivindicar um estorno que um mês já tinha abatido. Baixado
       * tudo por outro, não sobra o que baixar: **422 SEM_ESTORNO_PENDENTE**,
       * que é o que a tela mostraria se a corrida não existisse.
       */
      descartarJaCarimbados(pend, await relerEstornosSobATranca(tx, lojaId, e.contratoIds));
      if (e.contratoIds.length === 0) return null;

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
