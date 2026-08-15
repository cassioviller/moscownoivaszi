import { Router, type IRouter } from "express";
import {
  db,
  parcelasTable,
  contasPagarTable,
  pagamentosTable,
  pagamentoItensTable,
  recorrenciasTable,
  saldosReferenciaTable,
  auditLogTable,
  indicesMonetariosTable,
  conciliacaoDeRecebimentosTable,
} from "@workspace/db";
import { eq, and, or, inArray, gte, lt, lte, desc, isNull, isNotNull, count, sql } from "drizzle-orm";
import {
  alertaDeCaixa,
  ancoraDeNegocio,
  diaLocal,
  hojeLocal,
  resolverIntervalo,
  competenciaAtual,
  intervaloDaCompetencia,
  ultimasCompetencias,
  ultimoDiaDoMes,
  primeiroDiaDoMes,
  resumoCaixa,
  tendenciaCaixa,
  horizonteAberto,
  entradasPorMeio,
  dreDoIntervalo,
  STATUS_ABERTO,
} from "@workspace/financeiro-core";
import {
  PagarContaPagarBody,
  PagarContaPagarResponse,
  ListAuditoriaResponse,
  MarcarConciliadoBody,
  MarcarConciliadoResponse,
  ListMovimentosConciliacaoQueryParams,
  ListMovimentosConciliacaoResponse,
  ListIndicesMonetariosResponse,
  GravarIndiceMonetarioBody,
  GravarIndiceMonetarioResponse,
  ListAuditoriaQueryParams,
  ListAutoresAuditoriaResponse,
  ExportarAuditoriaQueryParams,
  ListPagamentosQueryParams,
  ListPagamentosResponse,
  CreatePagamentoBody,
  CreatePagamentoResponse,
  CreateRecorrenciaBody,
  UpdateRecorrenciaBody,
  CreateSaldoReferenciaBody,
  GetAlertaCaixaResponse,
  ListParcelasResponse,
  ListParcelasQueryParams,
  ListContasPagarResponse,
  ListContasPagarQueryParams,
  CreateContaPagarBody,
  CreateContaPagarResponse,
  ListRecorrenciasResponse,
  CreateRecorrenciaResponse,
  UpdateRecorrenciaResponse,
  ListSaldoReferenciaResponse,
  CreateSaldoReferenciaResponse,
  GerarRecorrenciasBody,
  GerarRecorrenciasResponse,
  ExportarFolhaQueryParams,
  ExportarContasPagarQueryParams,
  ExportarParcelasQueryParams,
  ExportarFluxoQueryParams,
  EnviarContabilidadeBody,
  EnviarContabilidadeResponse,
  GetFluxoCaixaQueryParams,
  GetFluxoCaixaResponse,
  GetDreQueryParams,
  GetDreResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { moraDe } from "../lib/mora-da-parcela";
import { ipcaDaLoja } from "../lib/indices-monetarios";
import { usuarioNaLoja } from "../lib/escopo-loja";
import { ultimoContatoPorLead } from "../lib/ultimo-contato";
// C10/E104: `addDias`/`inicioDoDia` são régua de DATA DE NEGÓCIO e moram no
// financeiro-core. Vinham do módulo de disponibilidade de VESTIDOS, que é outro
// assunto — a duplicação sobreviveu porque as duas cópias estavam certas.
import { addDias, inicioDoDia } from "@workspace/financeiro-core";
import { registrarAuditoria, acaoValida, quandoLocalSP, ROTULO_ACAO } from "../lib/auditoria";
import {
  competenciaValida,
  montarCsvContabilidade,
  diaLocalSP,
  type ItemContabil,
} from "../lib/folha";
import { montarContasDaCompetencia, TIPOS_RECORRENCIA } from "../lib/recorrencias";
import { montarCsv, responderCsv } from "../lib/csv";
import { intervaloValidado } from "../lib/intervalo";
import { movimentosDoFluxo, linhasCsvFluxo } from "../lib/fluxo";
// S-C31 — o caixa realizado data cada recebimento pelo dia dele, e o dia de
// cada ato mora na trilha desde o E221. A régua está em
// `lib/recebimentos-do-caixa.ts`; a leitura é a mesma do recibo da cláusula 7ª.
// (o `porRecebimento` é chamado por `realizadoPorRecebimento`, na lib)
import { realizadoPorRecebimento, recebidasNaJanela, trilhaDosRecebimentos } from "../lib/recibos-do-banco";
import { movimentosDoSistema } from "../lib/conciliacao-do-sistema";
import { recibosDaParcela } from "../lib/recibo-do-papel";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

/**
 * Meio-dia de São Paulo do dia LOCAL de um instante. Âncora de data de negócio:
 * o dia UTC do resultado já é o dia certo, e é o mesmo instante para qualquer
 * hora do mesmo dia local — o que faz o dedup por (loja, dia) funcionar.
 *
 * É a COMPOSIÇÃO de duas funções do core, e era reimplementada à mão aqui com
 * um `-3h` cravado — `diaLocal` já estava importado neste mesmo arquivo. O
 * offset à mão é pior que redundante: ele repete a premissa "São Paulo não tem
 * DST" num lugar a mais, e o dia em que ela mudar é o dia em que o repo tem de
 * achar todas as cópias.
 */
function ancorarMeioDiaSP(instante: Date | string): Date {
  return ancoraDeNegocio(diaLocal(instante));
}

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/financeiro", requireModulo("financeiro"));
router.use("/lojas/:lojaId/contas-pagar", requireModulo("financeiro"));

// `de`/`ate` recortam por vencimento (dia local, inclusivo nas duas pontas),
// no mesmo padrão do GET /pagamentos. O join contrato→lead existe para a
// cobrança saber quem cobrar sem rebuscar todos os contratos — o `.parse`
// reduz o contrato inteiro ao `{leadId, lead}` do schema, e o lead ao recorte
// `ParcelaLead` (S-D37): nome, WhatsApp e o último contato. O agregado
// `ultimoContatoPorLead` (S-D13) é o que deixa a marca de "cobrada hoje" da
// fila de mensagens sobreviver ao F5 — a tela compara o instante contra o dia
// no fuso da loja.
router.get("/lojas/:lojaId/financeiro/parcelas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ListParcelasQueryParams.safeParse(req.query));
  if (!q) return;
  const { de, ate, status, recebidasDe } = q;

  const parcelas = await db.query.parcelasTable.findMany({
    where: and(
      eq(parcelasTable.lojaId, lojaId),
      ...(de ? [gte(parcelasTable.vencimento, inicioDoDia(de))] : []),
      ...(ate ? [lt(parcelasTable.vencimento, inicioDoDia(addDias(ate, 1)))] : []),
      // E79: "aberta" é a régua única do estaAberta (PREVISTA/PARCIAL, E49).
      ...(status === "abertas" ? [inArray(parcelasTable.status, ["PREVISTA", "PARCIAL"])] : []),
      // E79: o realizado desde a âncora — quem recebeu a partir do dia.
      ...(recebidasDe
        ? [isNotNull(parcelasTable.recebidoEm), gte(parcelasTable.recebidoEm, inicioDoDia(recebidasDe))]
        : []),
    ),
    with: { contrato: { with: { lead: true } } },
    orderBy: parcelasTable.vencimento,
  });
  const contatos = await ultimoContatoPorLead(
    [...new Set(parcelas.map((p) => p.contrato?.leadId).filter((id): id is string => !!id))],
  );
  const comContato = parcelas.map((p) =>
    p.contrato?.lead
      ? {
          ...p,
          contrato: {
            ...p.contrato,
            lead: { ...p.contrato.lead, ultimoContatoEm: contatos.get(p.contrato.leadId) ?? null },
          },
        }
      : p,
  );
  // E213 — a multa e os juros da cláusula 9ª entram DERIVADOS, pelo mesmo
  // helper que o carnê, o portal e o recebimento usam. Esta é a fila de
  // cobrança: é aqui que a vendedora vê que a parcela de R$ 500,00 já deve
  // R$ 515,00 antes de mandar a mensagem.
  const ipca = await ipcaDaLoja(lojaId); // P4
  res.json(ListParcelasResponse.parse(comContato.map((p) => ({ ...p, mora: moraDe(p, ipca) }))));
});

router.post("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  // B4 — o `colaboradorId` vem do CORPO. Sem esta checagem, a loja A lança uma
  // conta a pagar nominal a alguém da loja B (e o extrato/folha passam a listar
  // uma pessoa que não é da equipe). A FK só garante que o id existe.
  if (parsed.data.colaboradorId && !(await usuarioNaLoja(parsed.data.colaboradorId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "Colaborador não é desta loja" });
    return;
  }
  const [conta] = await db.insert(contasPagarTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateContaPagarResponse.parse(conta));
});

// E93/D2: `de`/`ate` recortam por vencimento (dia local, inclusivo nas duas
// pontas) e `status=abertas` devolve só as PREVISTA — a mesma forma que
// `listParcelas` já tinha. Sem parâmetro a resposta continua sendo a carteira
// inteira, para não quebrar quem ainda a pede assim.
//
// O `with: pagamentoItens` existe para que a conta PAGA carregue a saída que a
// quitou: sem ele, a tela de contas a pagar baixava `listPagamentos` INTEIRO
// (a carteira de saídas de todos os tempos) só para achar o `pagamentoId` que
// torna a saída estornável e a fatia rateada que de fato saiu do caixa.
router.get("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ListContasPagarQueryParams.safeParse(req.query));
  if (!q) return;
  const { de, ate, status } = q;

  const contas = await db.query.contasPagarTable.findMany({
    where: and(
      eq(contasPagarTable.lojaId, lojaId),
      ...(de ? [gte(contasPagarTable.vencimento, inicioDoDia(de))] : []),
      ...(ate ? [lt(contasPagarTable.vencimento, inicioDoDia(addDias(ate, 1)))] : []),
      ...(status === "abertas" ? [eq(contasPagarTable.status, "PREVISTA")] : []),
    ),
    with: { pagamentoItens: { with: { pagamento: { with: { itens: true } } } } },
    orderBy: contasPagarTable.vencimento,
  });

  res.json(
    ListContasPagarResponse.parse(
      contas.map(({ pagamentoItens, ...conta }) => {
        // contaPagarId é UNIQUE em pagamento_itens — no máximo um item por conta.
        const item = pagamentoItens[0];
        return {
          ...conta,
          pagamento: item
            ? {
                id: item.pagamento.id,
                data: item.pagamento.data,
                forma: item.pagamento.forma,
                valor: item.valor,
                contas: item.pagamento.itens.length,
              }
            : null,
        };
      }),
    ),
  );
});

// Pagamento auditável: valor, data e forma persistem em pagamentos +
// pagamento_itens (contaPagarId é UNIQUE — cinto de segurança contra pagamento
// duplo no nível do banco); a conta só muda de status.

type ContaPagar = typeof contasPagarTable.$inferSelect;

/**
 * A quitação de contas — o ÚNICO caminho pelo qual uma conta a pagar vira PAGA.
 *
 * A2/E94: existiam duas portas para o mesmo fato. A single-conta gravava
 * `CONTA_PAGA` em `entidade: "conta_pagar"`; a multi-conta gravava
 * `PAGAMENTO_REGISTRADO` em `entidade: "pagamento"`. Quem consultasse a trilha
 * "por conta a pagar" só encontrava metade dos pagamentos — o histórico de quem
 * pagou o quê dependia de por qual porta se entrou. E a divisão era pior do que
 * parecia: a UI usa exclusivamente a multi-conta (`usePagarContaPagar` não
 * aparece em nenhum arquivo do front, e `pagar.tsx` documenta a escolha), mas a
 * suíte testava sobretudo a single. A porta viva era a menos exercitada.
 *
 * Agora as duas chamam isto, e a trilha é uma só: `PAGAMENTO_REGISTRADO`
 * indexado pelo pagamento, que é o fato de caixa. `CONTA_PAGA` continua na
 * união de ações porque as linhas antigas existem e a tela precisa saber
 * rotulá-las — só não nasce mais nenhuma.
 *
 * Pagar uma conta sozinha é `contas` de tamanho 1: o rateio de uma conta só
 * devolve o valor inteiro, então não há caso especial a manter.
 */
async function quitarContas(params: {
  lojaId: string;
  contas: readonly ContaPagar[];
  usuario: { id: string; nome: string };
  /** Instante do movimento — as duas rotas o recebem já convertido pelo Zod. */
  data: Date;
  /** Ausente = a saída vale a soma das contas. */
  valorPago?: number;
  forma?: string | null;
  observacoes?: string | null;
}): Promise<string> {
  const { lojaId, contas, usuario } = params;

  const previstoCentavos = contas.map((c) => Math.round(c.valorPrevisto * 100));
  const somaCentavos = previstoCentavos.reduce((s, v) => s + v, 0);
  const pagoCentavos =
    params.valorPago !== undefined ? Math.round(params.valorPago * 100) : somaCentavos;
  const valorPago = pagoCentavos / 100;

  // O item guarda o que a conta REALMENTE consumiu da saída, não o previsto:
  // sum(itens.valor) === pagamento.valorPago é o invariante que o fluxo e o DRE
  // dependem. Num pagamento com desconto o abatimento rateia proporcional ao
  // previsto, em centavos, e a última conta absorve o resto da divisão — mesma
  // convenção do gerar-plano de parcelas.
  const rateioCentavos = previstoCentavos.map((v) =>
    somaCentavos === 0 ? 0 : Math.round((v * pagoCentavos) / somaCentavos),
  );
  const distribuido = rateioCentavos.reduce((s, v) => s + v, 0);
  if (rateioCentavos.length > 0) rateioCentavos[rateioCentavos.length - 1] += pagoCentavos - distribuido;

  // Colaborador da saída só quando TODAS as contas são do mesmo — uma saída
  // que mistura pessoas não pertence a ninguém.
  const colaboradores = new Set(contas.map((c) => c.colaboradorId));
  const colaboradorId = colaboradores.size === 1 ? (contas[0].colaboradorId ?? null) : null;

  const pagamentoId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(pagamentosTable).values({
      id: pagamentoId,
      lojaId,
      colaboradorId,
      data: params.data,
      valorPago,
      forma: params.forma ?? null,
      observacoes: params.observacoes ?? null,
    });
    await tx.insert(pagamentoItensTable).values(
      contas.map((c, i) => ({
        id: randomUUID(),
        lojaId,
        pagamentoId,
        contaPagarId: c.id,
        valor: rateioCentavos[i] / 100,
      })),
    );
    await tx.update(contasPagarTable)
      .set({ status: "PAGA" })
      .where(inArray(contasPagarTable.id, contas.map((c) => c.id)));
    await registrarAuditoria(tx, {
      lojaId,
      usuario,
      acao: "PAGAMENTO_REGISTRADO",
      entidade: "pagamento",
      entidadeId: pagamentoId,
      detalhe: {
        valorPago,
        forma: params.forma ?? null,
        contas: contas.map((c) => ({ id: c.id, descricao: c.descricao })),
      },
    });
  });
  return pagamentoId;
}

router.post("/lojas/:lojaId/contas-pagar/:contaId/pagar", requireModulo("financeiro", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contaId = req.params.contaId as string;
  const parsed = PagarContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [conta] = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.id, contaId), eq(contasPagarTable.lojaId, lojaId)));
  if (!conta) {
    res.status(404).json({ error: "CONTA_NAO_ENCONTRADA", detalhe: "Esta conta não existe nesta loja." });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Esta conta já foi paga" });
    return;
  }

  // A2/E94: uma porta só. Ver `quitarContas`.
  await quitarContas({
    lojaId,
    contas: [conta],
    usuario: req.usuario!,
    data: parsed.data.data,
    valorPago: parsed.data.valorPago,
    forma: parsed.data.forma ?? null,
    observacoes: parsed.data.observacoes ?? null,
  });

  const [contaPaga] = await db.select().from(contasPagarTable)
    .where(eq(contasPagarTable.id, conta.id));
  res.json(PagarContaPagarResponse.parse(contaPaga));
});

// Remover conta: só PREVISTA. Uma conta PAGA é rastro de caixa — o caminho é
// estornar o pagamento primeiro (senão o DELETE em cascata levaria junto o
// pagamento_item e a saída ficaria sem contrapartida).
router.delete("/lojas/:lojaId/contas-pagar/:contaId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contaId = req.params.contaId as string;

  const [conta] = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.id, contaId), eq(contasPagarTable.lojaId, lojaId)));
  if (!conta) {
    res.status(404).json({ error: "CONTA_NAO_ENCONTRADA", detalhe: "Esta conta não existe nesta loja." });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Estorne o pagamento antes de remover a conta" });
    return;
  }

  /**
   * B8/E94 — a conta que NASCEU de um fechamento de comissão não se apaga por
   * aqui; ela se desfaz reabrindo o fechamento que a criou.
   *
   * O dano era silencioso e completo. A FK é
   * `comissao_fechamentos.conta_pagar_id → contas_pagar.id` com **ON DELETE SET
   * NULL**: apagar a conta zerava o vínculo sem erro nenhum. Depois disso a Ana
   * não recebe; `pendencias` não acusa, porque o fechamento continua existindo
   * e a competência segue "fechada" para aquela vendedora; e reabrir não repara,
   * porque as duas guardas do reabrir (a que recusa comissão já paga e a que
   * apaga a conta) dependem de `contaPagarId` não ser nulo. Não sobrava nem o
   * caminho de conserto.
   *
   * A régua é a ORIGEM, não o tipo: uma despesa que alguém classificou à mão
   * como COMISSAO continua removível — o que não se remove é o que outra parte
   * do sistema está segurando pela mão.
   */
  if (conta.origemComissaoFechamentoId) {
    res.status(409).json({
      error: "CONTA_DE_COMISSAO",
      detalhe:
        "Esta conta veio de um fechamento de comissão — reabra o fechamento para desfazê-la.",
    });
    return;
  }

  /**
   * S4/E107 — apagar uma conta prevista deixa rastro.
   *
   * As duas guardas acima recusam o que não pode sumir (conta paga, conta de
   * fechamento). O que restava era o caso legítimo: uma obrigação **prevista**
   * some do sistema e ninguém consegue reconstituir que ela existiu — nem
   * quanto era, nem para quem, nem quem a apagou. Não move caixa realizado, e
   * por isso é um degrau abaixo do B3; mas é da mesma classe, e o B3 existe
   * porque "dinheiro que muda sem rastro" foi o achado da rodada.
   *
   * A trilha guarda o VALOR e o vencimento no detalhe, não só o id: depois do
   * DELETE a linha não existe mais para ser consultada, então o que não estiver
   * aqui está perdido.
   */
  /**
   * S-M22 (rodada 2, achado 3#1): as guardas acima leram no POOL — entre a
   * leitura e o delete cabe um POST /pagar inteiro, e o pagar concorrente
   * commitando na janela deixava uma saída de R$ 500,00 no caixa cuja conta
   * (e o pagamento_item, pela cascata) este DELETE levava embora. A forma é a
   * da S-M7: `FOR UPDATE` na linha e a reconferência como statement novo,
   * dentro da transação — o `quitarContas` atualiza esta mesma linha, então a
   * tranca serializa os dois.
   */
  const usuario = req.usuario!;
  const resultado = await db.transaction(async (tx) => {
    const [atual] = await tx.select().from(contasPagarTable)
      .where(and(eq(contasPagarTable.id, conta.id), eq(contasPagarTable.lojaId, lojaId)))
      .for("update");
    if (!atual) return { corrida: "sumiu" as const };
    if (atual.status === "PAGA") return { corrida: "paga" as const };
    await registrarAuditoria(tx, {
      lojaId,
      usuario,
      acao: "CONTA_PAGAR_REMOVIDA",
      entidade: "conta_pagar",
      entidadeId: atual.id,
      detalhe: {
        descricao: atual.descricao,
        valorPrevisto: atual.valorPrevisto,
        vencimento: atual.vencimento.toISOString(),
        tipo: atual.tipo,
        colaboradorId: atual.colaboradorId,
      },
    });
    await tx.delete(contasPagarTable).where(eq(contasPagarTable.id, atual.id));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    if (resultado.corrida === "sumiu") {
      res.status(404).json({ error: "CONTA_NAO_ENCONTRADA", detalhe: "Esta conta não existe nesta loja." });
    } else {
      res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Estorne o pagamento antes de remover a conta" });
    }
    return;
  }
  res.status(204).end();
});

// O caixa realizado. `de`/`ate` são dias locais inclusivos: o fim vira o
// início do dia seguinte (exclusivo) para pegar o dia inteiro.
router.get("/lojas/:lojaId/financeiro/pagamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // O corpo do parse recusado é o histórico DESTA rota — preservado à letra.
  const q = intervaloValidado(res, ListPagamentosQueryParams.safeParse(req.query), {
    error: "FILTRO_INVALIDO",
    detalhe: "Filtro inválido: de/ate esperam YYYY-MM-DD.",
  });
  if (!q) return;
  const { de, ate, colaboradorId } = q;

  const pagamentos = await db.query.pagamentosTable.findMany({
    where: and(
      eq(pagamentosTable.lojaId, lojaId),
      ...(de ? [gte(pagamentosTable.data, inicioDoDia(de))] : []),
      ...(ate ? [lt(pagamentosTable.data, inicioDoDia(addDias(ate, 1)))] : []),
      ...(colaboradorId ? [eq(pagamentosTable.colaboradorId, colaboradorId)] : []),
    ),
    with: { colaborador: true, itens: { with: { contaPagar: true } } },
    orderBy: desc(pagamentosTable.data),
  });
  res.json(ListPagamentosResponse.parse(pagamentos));
});

// Uma saída de caixa que quita N contas. Sem valorPago, a saída vale a soma
// das contas; o rateio por conta vai em pagamento_itens (contaPagarId é UNIQUE
// — cinto de segurança do banco contra pagar a mesma conta duas vezes).
router.post("/lojas/:lojaId/financeiro/pagamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreatePagamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const contaIds = [...new Set(parsed.data.contaIds)];

  const contas = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.lojaId, lojaId), inArray(contasPagarTable.id, contaIds)));
  if (contas.length !== contaIds.length) {
    res.status(404).json({ error: "CONTA_NAO_ENCONTRADA", detalhe: "Alguma conta não existe nesta loja" });
    return;
  }
  const jaPagas = contas.filter((c) => c.status === "PAGA");
  if (jaPagas.length > 0) {
    res.status(409).json({
      error: "CONTA_JA_PAGA",
      detalhe: `Já paga(s): ${jaPagas.map((c) => c.descricao).join(", ")}`,
    });
    return;
  }

  // A2/E94: o rateio, a saída e a trilha moram em `quitarContas` — esta rota e
  // a `/contas-pagar/:id/pagar` são a MESMA operação vista por duas portas.
  const pagamentoId = await quitarContas({
    lojaId,
    contas,
    usuario: req.usuario!,
    data: parsed.data.data,
    valorPago: parsed.data.valorPago,
    forma: parsed.data.forma ?? null,
    observacoes: parsed.data.observacoes ?? null,
  });

  const criado = await db.query.pagamentosTable.findFirst({
    where: eq(pagamentosTable.id, pagamentoId),
    with: { colaborador: true, itens: { with: { contaPagar: true } } },
  });
  res.status(201).json(CreatePagamentoResponse.parse(criado));
});

// Estornar a saída: as contas voltam a PREVISTA e o pagamento some do caixa
// (os itens caem por cascata do FK).
router.post("/lojas/:lojaId/financeiro/pagamentos/:pagamentoId/estornar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const pagamentoId = req.params.pagamentoId as string;

  const pagamento = await db.query.pagamentosTable.findFirst({
    where: and(eq(pagamentosTable.id, pagamentoId), eq(pagamentosTable.lojaId, lojaId)),
    with: { itens: true },
  });
  if (!pagamento) {
    res.status(404).json({ error: "PAGAMENTO_NAO_ENCONTRADO", detalhe: "Este pagamento não existe nesta loja." });
    return;
  }

  const contaIds = pagamento.itens.map((i) => i.contaPagarId);
  await db.transaction(async (tx) => {
    if (contaIds.length > 0) {
      await tx.update(contasPagarTable)
        .set({ status: "PREVISTA" })
        .where(and(eq(contasPagarTable.lojaId, lojaId), inArray(contasPagarTable.id, contaIds)));
    }
    await tx.delete(pagamentosTable).where(eq(pagamentosTable.id, pagamento.id));
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "PAGAMENTO_ESTORNADO",
      entidade: "pagamento",
      entidadeId: pagamento.id,
      // O pagamento é DELETADO no estorno — a trilha vira o único rastro dele.
      detalhe: { valorPago: pagamento.valorPago, data: pagamento.data, contaIds },
    });
  });
  res.status(204).end();
});

/**
 * P4/E237 — o IPCA informado por competência. A dona digita; a mora
 * (`financeiro-core/mora.ts`) corrige pelos meses cheios entre o vencimento e
 * hoje; mês sem índice fica DITO na frase. O PUT é UPSERT por (loja, índice,
 * competência): corrigir um número errado é gravar de novo — e a trilha guarda
 * quem e quando (`INDICE_GRAVADO`), porque o índice muda dinheiro cobrado.
 */
router.get("/lojas/:lojaId/financeiro/indices", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const linhas = await db
    .select()
    .from(indicesMonetariosTable)
    .where(eq(indicesMonetariosTable.lojaId, lojaId))
    .orderBy(desc(indicesMonetariosTable.competencia));
  res.json(ListIndicesMonetariosResponse.parse(linhas.map((l) => ({ ...l, variacaoPct: Number(l.variacaoPct) }))));
});

router.put("/lojas/:lojaId/financeiro/indices", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = GravarIndiceMonetarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { competencia, variacaoPct } = parsed.data;
  const indice = parsed.data.indice ?? "IPCA";
  const [mes] = competencia.split("-").map(Number).slice(1);
  if (!mes || mes < 1 || mes > 12) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA", detalhe: "Use o formato AAAA-MM, com o mês de 01 a 12." });
    return;
  }
  const linha = await db.transaction(async (tx) => {
    const [gravada] = await tx
      .insert(indicesMonetariosTable)
      .values({
        id: randomUUID(),
        lojaId,
        indice,
        competencia,
        variacaoPct,
        atualizadoEm: new Date(),
        atualizadoPor: req.usuario!.nome ?? null,
      })
      .onConflictDoUpdate({
        target: [indicesMonetariosTable.lojaId, indicesMonetariosTable.indice, indicesMonetariosTable.competencia],
        set: { variacaoPct, atualizadoEm: new Date(), atualizadoPor: req.usuario!.nome ?? null },
      })
      .returning();
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "INDICE_GRAVADO",
      entidade: "indice_monetario",
      entidadeId: `${indice}:${competencia}`,
      detalhe: { indice, competencia, variacaoPct },
    });
    return gravada!;
  });
  res.json(GravarIndiceMonetarioResponse.parse({ ...linha, variacaoPct: Number(linha.variacaoPct) }));
});

/**
 * E235 (S-C51) — os movimentos do sistema, um por PAGAMENTO, montados no
 * servidor pela mesma leitura do caixa. A tela comparava por PARCELA e produzia
 * três divergências falsas de um pagamento em dois PIX; ver
 * `lib/conciliacao-do-sistema.ts`.
 */
router.get("/lojas/:lojaId/financeiro/conciliacao/movimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListMovimentosConciliacaoQueryParams.safeParse(req.query);
  if (!query.success || query.data.de > query.data.ate) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const movimentos = await movimentosDoSistema(lojaId, query.data.de, query.data.ate);
  res.json(ListMovimentosConciliacaoResponse.parse(movimentos));
});

/**
 * F32/E103 — a conciliação passa a ter memória.
 *
 * Ela era uma FOTOGRAFIA: a tela não tinha uma única mutation, o resultado
 * morria com a aba, e todo mês se refazia o mesmo trabalho — com as divergências
 * já olhadas e perdoadas voltando indistinguíveis das novas.
 *
 * **Três listas, e não uma.** O que a tela chama de "movimento do sistema" é
 * montado de `parcelas`, de `pagamentos` e — desde o E235 — dos ATOS de
 * recebimento, com ids sintéticos (`parcela:<id>`, `pagamento:<id>`,
 * `recibo:<atoId>`). Não existe entidade "movimento" para receber um PATCH;
 * inventá-la seria criar um recurso para caber num verbo.
 *
 * **Idempotente por construção:** o `WHERE` exige `conciliadoEm IS NULL` (e o
 * `INSERT` do ato é `onConflictDoNothing`), então remarcar o mesmo lote devolve
 * zero e não mexe no carimbo antigo — a mesma forma do `enviarContabilidade`.
 * E o `lojaId` vai no WHERE, não numa conferência posterior: id de outra loja
 * simplesmente não é marcado (E91). Para o ato, a prova de loja é a própria
 * trilha: só existe carimbo para uma linha `PARCELA_RECEBIDA` desta loja.
 *
 * **O carimbo da parcela é DERIVADO do carimbo dos atos (E235):** quando o
 * último ato válido de uma parcela dividida é carimbado, `parcelas.conciliado_em`
 * recebe o mesmo instante — a coluna fica, para o filtro "só o não conciliado"
 * (o índice parcial) e para a parcela sem ato, que continua sendo carimbada
 * direto. Carimbar UM pedaço não carimba a parcela: é isso que a S-C51 pedia.
 */
router.post(
  "/lojas/:lojaId/financeiro/conciliacao/marcar",
  async (req, res): Promise<void> => {
    const lojaId = req.params.lojaId as string;
    const parsed = MarcarConciliadoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(erroDeValidacao(parsed.error));
      return;
    }
    const { parcelaIds = [], pagamentoIds = [], reciboIds = [] } = parsed.data;
    const agora = new Date();

    const { pcs, pgs, atos, derivadas } = await db.transaction(async (tx) => {
      const pcs = parcelaIds.length
        ? await tx.update(parcelasTable)
            .set({ conciliadoEm: agora })
            .where(and(
              eq(parcelasTable.lojaId, lojaId),
              inArray(parcelasTable.id, parcelaIds),
              isNull(parcelasTable.conciliadoEm),
              // E115 — só o que TEM recebimento pode "bater com o extrato":
              // uma PREVISTA conferida seria um movimento que o banco nunca
              // viu carimbado como visto, e o carimbo é de mão única.
              isNotNull(parcelasTable.recebidoEm),
            ))
            .returning({ id: parcelasTable.id })
        : [];
      const pgs = pagamentoIds.length
        ? await tx.update(pagamentosTable)
            .set({ conciliadoEm: agora })
            .where(and(
              eq(pagamentosTable.lojaId, lojaId),
              inArray(pagamentosTable.id, pagamentoIds),
              isNull(pagamentosTable.conciliadoEm),
            ))
            .returning({ id: pagamentosTable.id })
        : [];

      // E235 — o ato só é carimbável se for uma linha PARCELA_RECEBIDA DESTA
      // loja: a trilha é a prova de loja e o `entidadeId` é a parcela dona.
      const linhasDoAto = reciboIds.length
        ? await tx
            .select({ id: auditLogTable.id, parcelaId: auditLogTable.entidadeId })
            .from(auditLogTable)
            .where(and(
              eq(auditLogTable.lojaId, lojaId),
              eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
              inArray(auditLogTable.id, reciboIds),
            ))
        : [];
      const atos = linhasDoAto.length
        ? await tx
            .insert(conciliacaoDeRecebimentosTable)
            .values(linhasDoAto.map((l) => ({
              atoId: l.id,
              lojaId,
              parcelaId: l.parcelaId,
              conciliadoEm: agora,
              conciliadoPor: req.usuario!.nome ?? null,
            })))
            .onConflictDoNothing()
            .returning({ atoId: conciliacaoDeRecebimentosTable.atoId, parcelaId: conciliacaoDeRecebimentosTable.parcelaId })
        : [];

      // A derivação: para cada parcela tocada, todos os atos VÁLIDOS (depois do
      // corte do estorno — a mesma leitura do recibo) estão carimbados?
      const derivadas: string[] = [];
      const parcelasTocadas = [...new Set(atos.map((a) => a.parcelaId))];
      if (parcelasTocadas.length > 0) {
        const parcelas = await tx.query.parcelasTable.findMany({
          where: and(eq(parcelasTable.lojaId, lojaId), inArray(parcelasTable.id, parcelasTocadas), isNull(parcelasTable.conciliadoEm)),
        });
        if (parcelas.length > 0) {
          const trilha = await trilhaDosRecebimentos(lojaId, parcelas.flatMap((p) => [p.id, p.contratoId]));
          const carimbados = await tx
            .select({ atoId: conciliacaoDeRecebimentosTable.atoId })
            .from(conciliacaoDeRecebimentosTable)
            .where(and(eq(conciliacaoDeRecebimentosTable.lojaId, lojaId), inArray(conciliacaoDeRecebimentosTable.parcelaId, parcelas.map((p) => p.id))));
          const temCarimbo = new Set(carimbados.map((c) => c.atoId));
          for (const p of parcelas) {
            const { recibos } = recibosDaParcela(p, trilha);
            if (recibos.length > 0 && recibos.every((r) => temCarimbo.has(r.id))) derivadas.push(p.id);
          }
          if (derivadas.length > 0) {
            await tx.update(parcelasTable)
              .set({ conciliadoEm: agora })
              .where(and(eq(parcelasTable.lojaId, lojaId), inArray(parcelasTable.id, derivadas), isNull(parcelasTable.conciliadoEm)));
          }
        }
      }

      // E115 — o carimbo irmão (`contabilidade/enviar`, mesmo épico E103)
      // audita e este não auditava: dar um movimento por conferido é escrita
      // de mão única sem rota que desfaça, e "quem conferiu, e quando?" ficava
      // sem resposta. Clique que não carimbou nada não é um fato — não grava.
      if (pcs.length + pgs.length + atos.length > 0) {
        await registrarAuditoria(tx, {
          lojaId,
          usuario: req.usuario!,
          acao: "CONCILIACAO_MARCADA",
          entidade: "conciliacao",
          entidadeId: hojeLocal(),
          detalhe: {
            parcelas: pcs.length,
            pagamentos: pgs.length,
            recibos: atos.length,
            parcelaIds: pcs.map((p) => p.id),
            pagamentoIds: pgs.map((p) => p.id),
            reciboIds: atos.map((a) => a.atoId),
            parcelasDerivadas: derivadas,
          },
        });
      }
      return { pcs, pgs, atos, derivadas };
    });

    res.json(MarcarConciliadoResponse.parse({ parcelas: pcs.length, pagamentos: pgs.length, recibos: atos.length }));
  },
);

// Trilha de auditoria (E10): a linha do tempo do que mexeu em dinheiro —
// quem recebeu, estornou, pagou, baixou. Só leitura; a escrita vive nas
// próprias ações (registrarAuditoria dentro das transações).

const LIMITE_TRILHA = 200;

/**
 * Os filtros da trilha (E47), compartilhados pela lista e pelo CSV — é o que
 * garante que a planilha traga a MESMA seleção que a tela mostra. Combináveis
 * (E, não OU); ausente é "não filtra por isso".
 *
 * `de`/`ate` são dias LOCAIS inclusivos sobre um INSTANTE (`criadoEm`), o
 * mesmo padrão do GET /pagamentos: o fim vira o início do dia seguinte, senão
 * tudo que aconteceu depois da meia-noite do último dia ficaria de fora.
 */
type FiltroTrilha = { acao?: string; usuarioId?: string; de?: string; ate?: string };

function condicoesTrilha(lojaId: string, f: FiltroTrilha) {
  const condicoes = [eq(auditLogTable.lojaId, lojaId)];
  if (f.acao) condicoes.push(eq(auditLogTable.acao, f.acao));
  if (f.usuarioId) condicoes.push(eq(auditLogTable.usuarioId, f.usuarioId));
  if (f.de) condicoes.push(gte(auditLogTable.criadoEm, inicioDoDia(f.de)));
  if (f.ate) condicoes.push(lt(auditLogTable.criadoEm, inicioDoDia(addDias(f.ate, 1))));
  return and(...condicoes);
}

/** `de` depois de `ate` é engano de digitação, não uma busca vazia. */
function intervaloInvertido(f: FiltroTrilha): boolean {
  return !!f.de && !!f.ate && f.de > f.ate;
}

router.get("/lojas/:lojaId/financeiro/auditoria", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListAuditoriaQueryParams.safeParse(req.query);
  if (!parsed.success || intervaloInvertido(parsed.data)) {
    res.status(400).json({ error: "FILTRO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD, com 'de' antes de 'ate'" });
    return;
  }

  const linhas = await db.select()
    .from(auditLogTable)
    .where(condicoesTrilha(lojaId, parsed.data))
    .orderBy(desc(auditLogTable.criadoEm))
    .limit(LIMITE_TRILHA);
  res.json(ListAuditoriaResponse.parse(linhas));
});

/**
 * Os autores da trilha — as opções do filtro. Saem daqui e não da equipe
 * porque `usuarioId` é ON DELETE SET NULL: quem saiu da loja continua tendo
 * agido, e some da equipe sem sumir da trilha. Autor já anônimo (id nulo) fica
 * de fora: não dá para filtrar por quem não tem id, e oferecer a opção seria
 * prometer um filtro que não filtra.
 */
router.get("/lojas/:lojaId/financeiro/auditoria/autores", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  // Agrupa por (id, nome) porque o nome é desnormalizado e pode ter mudado
  // entre duas ações da mesma pessoa; o dedup abaixo fica com o mais recente.
  const linhas = await db
    .select({
      usuarioId: auditLogTable.usuarioId,
      nome: auditLogTable.usuarioNome,
      total: count(),
      ultima: sql<string>`max(${auditLogTable.criadoEm})`,
    })
    .from(auditLogTable)
    .where(and(eq(auditLogTable.lojaId, lojaId), isNotNull(auditLogTable.usuarioId)))
    .groupBy(auditLogTable.usuarioId, auditLogTable.usuarioNome)
    .orderBy(desc(sql`max(${auditLogTable.criadoEm})`));

  const porAutor = new Map<string, { usuarioId: string; nome: string; total: number }>();
  for (const l of linhas) {
    const id = l.usuarioId!;
    const jaVisto = porAutor.get(id);
    // A ordem é da ação mais recente para a mais antiga: o primeiro nome que
    // aparece é o atual; os seguintes só somam o total.
    if (jaVisto) jaVisto.total += Number(l.total);
    else porAutor.set(id, { usuarioId: id, nome: l.nome, total: Number(l.total) });
  }
  res.json(ListAutoresAuditoriaResponse.parse([...porAutor.values()]));
});

/**
 * O CSV da trilha (E47) — a última visão de dinheiro sem exportação.
 *
 * SEM o corte de 200 de propósito: a tela pode mostrar uma janela e dizer que
 * é uma janela, mas planilha truncada em silêncio é pior que planilha nenhuma
 * — a contadora concilia o que recebeu e não tem como saber do que faltou.
 */
router.get("/lojas/:lojaId/financeiro/auditoria/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ExportarAuditoriaQueryParams.safeParse(req.query);
  if (!parsed.success || intervaloInvertido(parsed.data)) {
    res.status(400).json({ error: "FILTRO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD, com 'de' antes de 'ate'" });
    return;
  }

  const linhas = await db.select()
    .from(auditLogTable)
    .where(condicoesTrilha(lojaId, parsed.data))
    .orderBy(desc(auditLogTable.criadoEm));

  const csv = [["Quando", "Ação", "Autor", "Entidade", "ID da entidade", "Detalhe"]];
  for (const l of linhas) {
    csv.push([
      quandoLocalSP(l.criadoEm),
      acaoValida(l.acao) ? ROTULO_ACAO[l.acao] : l.acao,
      l.usuarioNome,
      l.entidade,
      l.entidadeId,
      // O detalhe cru, não um resumo: quem audita quer o contexto inteiro, e
      // `escaparCsv` já neutraliza o que a planilha interpretaria como fórmula.
      l.detalhe ? JSON.stringify(l.detalhe) : "",
    ]);
  }

  const sufixo = parsed.data.de && parsed.data.ate ? `-${parsed.data.de}-a-${parsed.data.ate}` : "";
  responderCsv(res, `auditoria${sufixo}`, montarCsv(csv));
});

// ───────────────────────── Recorrências (E48) ─────────────────────────

router.get("/lojas/:lojaId/financeiro/recorrencias", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const recorrencias = await db.select().from(recorrenciasTable).where(eq(recorrenciasTable.lojaId, lojaId));
  res.json(ListRecorrenciasResponse.parse(recorrencias));
});

router.post("/lojas/:lojaId/financeiro/recorrencias", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateRecorrenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { tipo, usuarioId, descricao, categoria, fornecedor, valor, diaVencimento } = parsed.data;

  // O `tipo` decide quais campos fazem sentido, e o contrato sozinho não sabe
  // dizer isso (é o mesmo corpo para três formas). Recusar aqui é o que impede
  // uma DESPESA sem descrição de virar "undefined 2026-07" na conta gerada, e
  // um SALARIO sem colaborador de nunca gerar nada — falhando em silêncio.
  if (tipo === "SALARIO" && !usuarioId) {
    res.status(400).json({ error: "RECORRENCIA_INVALIDA", detalhe: "Salário exige o colaborador." });
    return;
  }
  if (tipo !== "SALARIO" && !descricao) {
    res.status(400).json({ error: "RECORRENCIA_INVALIDA", detalhe: "Despesa recorrente exige uma descrição." });
    return;
  }

  // Um salário ativo por pessoa: dois gerariam duas contas na mesma
  // competência. O índice parcial (recorrencias_salario_ativo_unico) é o
  // backstop; aqui damos o 409 legível em vez de deixar a violação virar 500.
  // Para trocar o valor, é editar o existente (ou desativá-lo e criar outro),
  // não empilhar. Despesa não tem esse limite de propósito: a loja com duas
  // salas tem dois aluguéis, e o motor não tem como saber que não são o mesmo.
  if (tipo === "SALARIO") {
    // B4 — o colaborador do salário vem do CORPO: sem esta prova, a loja A cria
    // uma recorrência de SALÁRIO para alguém da loja B e passa a gerar conta a
    // pagar todo mês em nome de quem não é da equipe.
    if (!(await usuarioNaLoja(usuarioId!, lojaId))) {
      res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "Colaborador não é desta loja" });
      return;
    }
    const jaAtivo = await db.select({ id: recorrenciasTable.id })
      .from(recorrenciasTable)
      .where(and(
        eq(recorrenciasTable.lojaId, lojaId),
        eq(recorrenciasTable.usuarioId, usuarioId!),
        eq(recorrenciasTable.ativo, true),
      ));
    if (jaAtivo.length > 0) {
      res.status(409).json({ error: "SALARIO_ATIVO_EXISTE", detalhe: "Este colaborador já tem salário ativo — edite o existente." });
      return;
    }
  }

  const [recorrencia] = await db.insert(recorrenciasTable).values({
    id: randomUUID(),
    lojaId,
    tipo,
    usuarioId: tipo === "SALARIO" ? usuarioId! : null,
    descricao: tipo === "SALARIO" ? null : descricao!,
    categoria: categoria ?? null,
    fornecedor: tipo === "SALARIO" ? null : (fornecedor ?? null),
    valor,
    diaVencimento,
  }).returning();
  res.status(201).json(CreateRecorrenciaResponse.parse(recorrencia));
});

router.patch("/lojas/:lojaId/financeiro/recorrencias/:recorrenciaId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const recorrenciaId = req.params.recorrenciaId as string;
  const parsed = UpdateRecorrenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  // `tipo` e `usuarioId` ficam de fora do update de propósito: virar o tipo de
  // uma recorrência que já gerou contas deixaria o histórico dizendo uma coisa
  // e a origem dizendo outra. Desative e crie a nova.
  const [recorrencia] = await db.update(recorrenciasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(recorrenciasTable.id, recorrenciaId), eq(recorrenciasTable.lojaId, lojaId)))
    .returning();
  if (!recorrencia) {
    res.status(404).json({ error: "RECORRENCIA_NAO_ENCONTRADA", detalhe: "Esta recorrência não existe nesta loja." });
    return;
  }
  res.json(UpdateRecorrenciaResponse.parse(recorrencia));
});

router.get("/lojas/:lojaId/financeiro/saldos-referencia", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const saldos = await db.select().from(saldosReferenciaTable).where(eq(saldosReferenciaTable.lojaId, lojaId));
  res.json(ListSaldoReferenciaResponse.parse(saldos));
});

router.post("/lojas/:lojaId/financeiro/saldos-referencia", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateSaldoReferenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  // Conferir de novo o mesmo dia é corrigir o número, não empilhar outro saldo.
  // Ancora ao MEIO-DIA SP do dia local: a leitura (saldo.ts) usa dia local SP,
  // então a escrita tem que casar. Gravar o instante cru fazia duas conferências
  // do mesmo dia (instantes diferentes) NÃO conflitarem — viravam duas âncoras
  // em vez de uma correção; e um `2026-07-14` cru (meia-noite UTC) escorregava
  // um dia para trás na leitura.
  const [saldo] = await db.insert(saldosReferenciaTable)
    .values({
      id: randomUUID(),
      lojaId,
      dataReferencia: ancorarMeioDiaSP(parsed.data.dataReferencia),
      valor: parsed.data.valor,
    })
    .onConflictDoUpdate({
      target: [saldosReferenciaTable.lojaId, saldosReferenciaTable.dataReferencia],
      set: { valor: parsed.data.valor },
    })
    .returning();
  res.json(CreateSaldoReferenciaResponse.parse(saldo));
});

/**
 * O alerta de caixa (E46): o veredito da projeção, para quem nunca abre a
 * projeção. A conta é a mesma da tela — saldo de hoje + curva do previsto —,
 * mas roda AQUI porque o dashboard e o hub de fluxo precisariam, cada um,
 * baixar parcelas, contas, saldos e pagamentos inteiros só para chegar nela.
 * Uma conta, um lugar, duas telas: sem over-fetch e sem risco de divergirem.
 */
const HORIZONTE_ALERTA = 30;

// E79: o fluxo agregado no banco. A tela baixava TODAS as parcelas da
// história; aqui os MESMOS motores (financeiro-core, E25) rodam sobre linhas
// já filtradas por data — o SQL entrega um superconjunto da janela e os
// motores recortam com a régua exata (instante no fuso da loja).
const MESES_TENDENCIA_FLUXO = 6;

// S-C31 / E235 — `recebidasNaJanela` e `realizadoPorRecebimento` moram em
// `lib/recibos-do-banco.ts`: a conciliação (E235) passou a montar os movimentos
// do sistema pela MESMA leitura do caixa, uma linha por recebimento.

router.get("/lojas/:lojaId/financeiro/fluxo", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = GetFluxoCaixaQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const intervalo = resolverIntervalo(query.data.ini ?? null, query.data.fim ?? null);
  const compHoje = competenciaAtual();
  const comps = ultimasCompetencias(compHoje, MESES_TENDENCIA_FLUXO);
  const iniTendencia = `${comps[0]}-01`;
  const fimTendencia = ultimoDiaDoMes(`${comps[comps.length - 1]}-01`);
  const janelaIni = intervalo.iniYMD < iniTendencia ? intervalo.iniYMD : iniTendencia;
  const janelaFim = intervalo.fimYMD > fimTendencia ? intervalo.fimYMD : fimTendencia;

  const [parcelasRecebidas, pagamentos, parcelasAbertas, contasAbertas] = await Promise.all([
    db.query.parcelasTable.findMany({
      where: await recebidasNaJanela(lojaId, janelaIni, janelaFim),
      with: { contrato: { with: { lead: true } } },
    }),
    db.query.pagamentosTable.findMany({
      where: and(
        eq(pagamentosTable.lojaId, lojaId),
        gte(pagamentosTable.data, inicioDoDia(janelaIni)),
        lt(pagamentosTable.data, inicioDoDia(addDias(janelaFim, 1))),
      ),
      with: { colaborador: true, itens: { with: { contaPagar: true } } },
    }),
    // Horizonte é previsão pelo vencimento — só o ABERTO importa, sem janela.
    // A lista vem do core (C4): esta query estava certa e a do alerta não, o
    // que só era possível porque cada uma escrevia a sua.
    db.select().from(parcelasTable)
      .where(and(eq(parcelasTable.lojaId, lojaId), inArray(parcelasTable.status, [...STATUS_ABERTO]))),
    db.select().from(contasPagarTable)
      .where(and(eq(contasPagarTable.lojaId, lojaId), eq(contasPagarTable.status, "PREVISTA"))),
  ]);

  // S-C31 — uma linha por RECEBIMENTO, e não por parcela: os quatro números
  // desta resposta (resumo, porMeio, tendência e movimentos) datam cada pedaço
  // pelo dia em que ele entrou. O total do período não muda.
  const recebimentos = await realizadoPorRecebimento(lojaId, parcelasRecebidas);

  const resumo = resumoCaixa(recebimentos, pagamentos, intervalo);
  // S21: a montagem morava inline aqui; foi para lib/fluxo.ts para o export
  // CSV derivar da MESMA linha do tempo em vez de copiá-la.
  const movimentos = movimentosDoFluxo(recebimentos, pagamentos, intervalo);

  res.json(
    GetFluxoCaixaResponse.parse({
      intervalo,
      resumo,
      // Por MEIO (E50): as MESMAS entradas do resumo — soma em centavos
      // inteiros no core, então `porMeio.total === resumo.entradas` por construção.
      porMeio: entradasPorMeio(recebimentos, intervalo),
      tendencia: tendenciaCaixa(recebimentos, pagamentos, {
        meses: MESES_TENDENCIA_FLUXO,
        ate: compHoje,
      }),
      horizonte: horizonteAberto(parcelasAbertas, contasAbertas),
      movimentos,
    }),
  );
});

/**
 * S21/F34 — o pacote da contabilidade, derivado do fluxo. Os quatro exports
 * recortam por réguas diferentes (parcelas por VENCIMENTO, folha por data de
 * pagamento); juntá-los daria regime misto. Este sai dos MESMOS motores da
 * rota do fluxo (`movimentosDoFluxo` + `resumoCaixa`), com as MESMAS duas
 * consultas recortadas ao intervalo — entradas e saídas pela data REAL, no dia
 * local da loja — e por isso fecha com a tela e com o DRE por construção.
 *
 * SÓ LÊ, como os outros exports: um GET tem de ser seguro para
 * refresh/prefetch. `ini`/`fim` são os params da tela do fluxo (a URL dela é a
 * fonte do intervalo), e ausente/invertido resolve como lá: `resolverIntervalo`
 * cai no mês corrente e troca pontas trocadas.
 */
router.get("/lojas/:lojaId/financeiro/fluxo/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ExportarFluxoQueryParams.safeParse(req.query), {
    error: "FILTRO_INVALIDO",
  });
  if (!q) return;
  const intervalo = resolverIntervalo(q.ini ?? null, q.fim ?? null);

  const [parcelasRecebidas, pagamentos] = await Promise.all([
    db.query.parcelasTable.findMany({
      where: await recebidasNaJanela(lojaId, intervalo.iniYMD, intervalo.fimYMD),
      with: { contrato: { with: { lead: true } } },
    }),
    db.query.pagamentosTable.findMany({
      where: and(
        eq(pagamentosTable.lojaId, lojaId),
        gte(pagamentosTable.data, inicioDoDia(intervalo.iniYMD)),
        lt(pagamentosTable.data, inicioDoDia(addDias(intervalo.fimYMD, 1))),
      ),
      with: { colaborador: true, itens: { with: { contaPagar: true } } },
    }),
  ]);

  // S-C31 — a MESMA divisão da rota do fluxo: o pacote da contabilidade fecha
  // com a tela por construção, e agora as duas datam cada pedaço pelo dia dele.
  const recebimentos = await realizadoPorRecebimento(lojaId, parcelasRecebidas);
  const movimentos = movimentosDoFluxo(recebimentos, pagamentos, intervalo);
  const resumo = resumoCaixa(recebimentos, pagamentos, intervalo);
  responderCsv(
    res,
    `fluxo-${intervalo.iniYMD}-a-${intervalo.fimYMD}`,
    montarCsv(linhasCsvFluxo(movimentos, resumo)),
  );
});

// E79: o DRE agregado no banco — o MESMO `dreDoIntervalo` que a tela rodava
// sobre a história inteira, agora sobre a competência recortada no SQL. Fluxo
// e DRE fecham entre si porque saem do mesmo motor (cuidado (a) da proposta).
router.get("/lojas/:lojaId/financeiro/dre", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = GetDreQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const competencia =
    query.data.competencia && competenciaValida(query.data.competencia)
      ? query.data.competencia
      : competenciaAtual();
  const intervalo = intervaloDaCompetencia(competencia);

  const [parcelasRecebidas, pagamentos] = await Promise.all([
    db.select().from(parcelasTable).where(
      await recebidasNaJanela(lojaId, intervalo.iniYMD, intervalo.fimYMD),
    ),
    db.query.pagamentosTable.findMany({
      where: and(
        eq(pagamentosTable.lojaId, lojaId),
        gte(pagamentosTable.data, inicioDoDia(intervalo.iniYMD)),
        lt(pagamentosTable.data, inicioDoDia(addDias(intervalo.fimYMD, 1))),
      ),
      with: { itens: { with: { contaPagar: true } } },
    }),
  ]);

  // S-C31 — o pedaço que entrou em 28/02 fica em FEVEREIRO. Sem isto o DRE de
  // março ganhava os R$ 1.000,00 inteiros e o de fevereiro fechava R$ 300,00
  // a menos, porque `recebido_em` é o dia do último pedaço.
  const recebimentos = await realizadoPorRecebimento(lojaId, parcelasRecebidas);
  const dre = dreDoIntervalo(recebimentos, pagamentos, intervalo);

  res.json(
    GetDreResponse.parse({
      competencia,
      intervalo,
      ...dre,
      // A régua do E50: `porMeio.total === receitas` por construção.
      porMeio: entradasPorMeio(recebimentos, intervalo),
    }),
  );
});

router.get("/lojas/:lojaId/financeiro/alerta-caixa", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const hoje = hojeLocal();

  // A âncora vem sozinha e primeiro: sem saldo conferido não há alerta a dar, e
  // as três consultas seguintes seriam trabalho jogado fora. O índice único por
  // (loja, dia) garante uma linha por dia, então "a mais recente" é exata.
  const [ancora] = await db
    .select({ dataReferencia: saldosReferenciaTable.dataReferencia, valor: saldosReferenciaTable.valor })
    .from(saldosReferenciaTable)
    .where(
      and(
        eq(saldosReferenciaTable.lojaId, lojaId),
        lte(saldosReferenciaTable.dataReferencia, inicioDoDia(addDias(hoje, 1))),
      ),
    )
    .orderBy(desc(saldosReferenciaTable.dataReferencia))
    .limit(1);

  if (!ancora) {
    // Pelo próprio motor, não por um objeto escrito à mão aqui: o formato do
    // "não sei" é decisão dele.
    res.json(
      GetAlertaCaixaResponse.parse(
        alertaDeCaixa([], [], [], [], { horizonteDias: HORIZONTE_ALERTA, hoje }),
      ),
    );
    return;
  }

  const ancoraDia = diaLocal(ancora.dataReferencia);
  // Duas janelas, dois eixos: o saldo olha para TRÁS pelo instante do
  // recebimento/pagamento; a curva olha para FRENTE pelo vencimento.
  const saldoDe = inicioDoDia(ancoraDia);
  const saldoAte = inicioDoDia(addDias(hoje, 1));
  const curvaDe = inicioDoDia(hoje);
  const curvaAte = inicioDoDia(addDias(hoje, HORIZONTE_ALERTA + 1));

  const [parcelas, contas, pagamentos] = await Promise.all([
    // As duas pernas da parcela numa consulta só — o que TEVE RECEBIMENTO
    // alimenta o saldo (pela data em que o dinheiro entrou) e o que segue
    // ABERTO alimenta a curva (pelo vencimento), e cada motor aplica o próprio
    // filtro.
    //
    // C4/E94: aqui estava escrito `eq(status,'PAGA')` e `eq(status,'PREVISTA')`,
    // e a PARCIAL não é nenhuma das duas — uma parcela meio recebida não
    // chegava ao motor NEM como dinheiro que entrou NEM como dinheiro que vai
    // entrar. O motor sempre soube tratá-la; ele só nunca recebia a linha, e o
    // sino anunciava um furo que a projeção (que já usava as duas listas) não
    // via. Uma PARCIAL pode casar as duas pernas ao mesmo tempo: o `or` a traz
    // uma vez e cada motor decide o que fazer com ela.
    db
      .select({
        status: parcelasTable.status,
        recebidoEm: parcelasTable.recebidoEm,
        valorRecebido: parcelasTable.valorRecebido,
        vencimento: parcelasTable.vencimento,
        valorPrevisto: parcelasTable.valorPrevisto,
      })
      .from(parcelasTable)
      .where(
        and(
          eq(parcelasTable.lojaId, lojaId),
          or(
            // O recebimento é `recebido_em IS NOT NULL`, não uma lista de
            // status (E115/S5): a CANCELADA de um cancelamento "manter" guarda
            // dinheiro que entrou e ficou, e o motor (`teveRecebimento`) é quem
            // recorta — este WHERE só entrega o superconjunto da janela.
            and(
              gte(parcelasTable.recebidoEm, saldoDe),
              lt(parcelasTable.recebidoEm, saldoAte),
            ),
            and(
              inArray(parcelasTable.status, [...STATUS_ABERTO]),
              gte(parcelasTable.vencimento, curvaDe),
              lt(parcelasTable.vencimento, curvaAte),
            ),
          ),
        ),
      ),
    db
      .select({
        status: contasPagarTable.status,
        vencimento: contasPagarTable.vencimento,
        valorPrevisto: contasPagarTable.valorPrevisto,
      })
      .from(contasPagarTable)
      .where(
        and(
          eq(contasPagarTable.lojaId, lojaId),
          eq(contasPagarTable.status, "PREVISTA"),
          gte(contasPagarTable.vencimento, curvaDe),
          lt(contasPagarTable.vencimento, curvaAte),
        ),
      ),
    db
      .select({ data: pagamentosTable.data, valorPago: pagamentosTable.valorPago })
      .from(pagamentosTable)
      .where(
        and(
          eq(pagamentosTable.lojaId, lojaId),
          gte(pagamentosTable.data, saldoDe),
          lt(pagamentosTable.data, saldoAte),
        ),
      ),
  ]);

  res.json(
    GetAlertaCaixaResponse.parse(
      alertaDeCaixa([ancora], parcelas, contas, pagamentos, {
        horizonteDias: HORIZONTE_ALERTA,
        hoje,
      }),
    ),
  );
});

// ───────────────────────── Folha / contabilidade ─────────────────────────

/**
 * Gera as contas da competência: cada recorrência ATIVA vira uma conta a pagar
 * — salário, aluguel, assinatura, fornecedor fixo (E48). IDEMPOTENTE: o que já
 * tem conta naquela competência é pulado (regra no núcleo puro,
 * ../lib/recorrencias.ts), então rodar de novo devolve `geradas: 0` em vez de
 * dobrar a conta de alguém. Isso não é só higiene: é o que permite reexecutar
 * sem medo depois de um erro de rede.
 */
router.post("/lojas/:lojaId/financeiro/recorrencias/gerar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = GerarRecorrenciasBody.safeParse(req.body);
  if (!parsed.success || !competenciaValida(parsed.data.competencia)) {
    res.status(400).json({ error: "COMPETENCIA_INVALIDA", detalhe: "Use AAAA-MM" });
    return;
  }
  const { competencia } = parsed.data;

  const [recorrencias, jaFeitas] = await Promise.all([
    db.select().from(recorrenciasTable).where(eq(recorrenciasTable.lojaId, lojaId)),
    // COMISSAO fica FORA de propósito: ela também tem `colaboradorId`, e o
    // dedup largo do salário (por colaborador) leria a comissão da vendedora
    // como "salário já feito" e a deixaria sem folha — em silêncio.
    db.select().from(contasPagarTable).where(and(
      eq(contasPagarTable.lojaId, lojaId),
      inArray(contasPagarTable.tipo, TIPOS_RECORRENCIA),
      eq(contasPagarTable.competencia, competencia),
    )),
  ]);

  const aCriar = montarContasDaCompetencia(competencia, recorrencias, jaFeitas);
  if (aCriar.length === 0) {
    res.json(GerarRecorrenciasResponse.parse({ geradas: 0, contas: [] }));
    return;
  }

  // O check-then-insert acima decide O QUE gerar; o índice único parcial
  // (contas_pagar_recorrencia_unica) é a rede sob concorrência.
  // `onConflictDoNothing` faz o POST perdedor de uma corrida inserir nada e
  // reportar `geradas: 0`, em vez de estourar — e `returning()` só devolve o
  // que ENTROU de fato.
  const contas = await db.insert(contasPagarTable)
    .values(aCriar.map((c) => ({ id: randomUUID(), lojaId, ...c })))
    .onConflictDoNothing({
      target: [contasPagarTable.lojaId, contasPagarTable.competencia, contasPagarTable.recorrenciaId],
      // O índice é PARCIAL — o Postgres só o casa se o predicado for repetido aqui.
      where: sql`${contasPagarTable.recorrenciaId} is not null`,
    })
    .returning();
  res.json(GerarRecorrenciasResponse.parse({ geradas: contas.length, contas }));
});

/** Os itens pagos no intervalo, achatados para o extrato contábil. */
async function itensContabeis(lojaId: string, de: string, ate: string): Promise<ItemContabil[]> {
  const pagamentos = await db.query.pagamentosTable.findMany({
    where: and(
      eq(pagamentosTable.lojaId, lojaId),
      gte(pagamentosTable.data, inicioDoDia(de)),
      lt(pagamentosTable.data, inicioDoDia(addDias(ate, 1))),
    ),
    with: { itens: { with: { contaPagar: { with: { colaborador: true } } } } },
    orderBy: pagamentosTable.data,
  });
  // Uma linha por ITEM, não por pagamento: é o item que carrega a conta, a
  // competência e a fatia rateada — o pagamento inteiro pode quitar N contas.
  return pagamentos.flatMap((p) =>
    p.itens.map((i) => ({
      dataPagamento: p.data,
      colaborador: i.contaPagar.colaborador?.nome ?? null,
      descricao: i.contaPagar.descricao,
      competencia: i.contaPagar.competencia,
      valor: i.valor,
      forma: p.forma,
    })),
  );
}

/**
 * Export CSV do período. SÓ LÊ — de propósito.
 *
 * A rota da origem era um GET que ESCREVIA: baixava a planilha e, no mesmo
 * request, carimbava `enviadoContabilidadeEm` nos pagamentos. Um GET tem que
 * ser SEGURO: o navegador dá refresh, prefetch e retry sozinho, e qualquer um
 * deles remarcaria o envio (ou pior, reescreveria o carimbo). Pior ainda, era
 * impossível só CONFERIR o arquivo antes de mandar — olhar já era enviar.
 *
 * Por isso a operação foi partida em duas: aqui se BAIXA (idempotente, seguro,
 * repetível) e no POST …/contabilidade/enviar se MARCA (explícito, uma
 * decisão do usuário). O gate também fica honesto: GET→ver, POST→criar.
 */
router.get("/lojas/:lojaId/financeiro/folha/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ExportarFolhaQueryParams.safeParse(req.query));
  if (!q) return;
  // S35: a janela-padrão (sem intervalo, o mês corrente) estava escrita inline
  // aqui, ao lado da `janelaExportacao` que já dizia a mesma coisa — e que as
  // outras duas exportações usam. Agora é ela nas três.
  const janela = janelaExportacao(q.de, q.ate);
  if (!janela) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const csv = montarCsvContabilidade(await itensContabeis(lojaId, janela.de, janela.ate));
  responderCsv(res, `contabilidade-${janela.de}-a-${janela.ate}`, csv);
});

/**
 * A janela de exportação: de/ate opcionais (dia local inclusivo, padrão do GET
 * /parcelas); sem intervalo, o mês corrente — o período que a contadora fecha.
 */
function janelaExportacao(de?: string, ate?: string): { de: string; ate: string } | null {
  const hoje = hojeLocal();
  const d = de ?? primeiroDiaDoMes(hoje);
  const a = ate ?? hoje;
  return d > a ? null : { de: d, ate: a };
}

// CSV das contas a pagar por vencimento. SÓ LÊ — mesmo racional do exportar
// da folha: um GET tem de ser seguro para refresh/prefetch.
router.get("/lojas/:lojaId/financeiro/contas-pagar/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ExportarContasPagarQueryParams.safeParse(req.query));
  if (!q) return;
  const janela = janelaExportacao(q.de, q.ate);
  if (!janela) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const contas = await db.query.contasPagarTable.findMany({
    where: and(
      eq(contasPagarTable.lojaId, lojaId),
      gte(contasPagarTable.vencimento, inicioDoDia(janela.de)),
      lt(contasPagarTable.vencimento, inicioDoDia(addDias(janela.ate, 1))),
    ),
    with: { colaborador: { columns: { nome: true } } },
    orderBy: contasPagarTable.vencimento,
  });

  const linhas = [["Vencimento", "Descrição", "Tipo", "Categoria", "Fornecedor", "Colaborador", "Competência", "Valor", "Status"]];
  for (const c of contas) {
    linhas.push([
      diaLocalSP(c.vencimento),
      c.descricao,
      c.tipo,
      c.categoria ?? "",
      c.fornecedor ?? "",
      c.colaborador?.nome ?? "",
      c.competencia ?? "",
      c.valorPrevisto.toFixed(2),
      c.status,
    ]);
  }
  responderCsv(res, `contas-pagar-${janela.de}-a-${janela.ate}`, montarCsv(linhas));
});

// CSV das parcelas (a receber) por vencimento, com a noiva na linha — o
// mapa da inadimplência que a contadora importa sem redigitar.
router.get("/lojas/:lojaId/financeiro/parcelas/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, ExportarParcelasQueryParams.safeParse(req.query));
  if (!q) return;
  const janela = janelaExportacao(q.de, q.ate);
  if (!janela) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const parcelas = await db.query.parcelasTable.findMany({
    where: and(
      eq(parcelasTable.lojaId, lojaId),
      gte(parcelasTable.vencimento, inicioDoDia(janela.de)),
      lt(parcelasTable.vencimento, inicioDoDia(addDias(janela.ate, 1))),
    ),
    with: { contrato: { columns: {}, with: { lead: { columns: { noivaNome: true } } } } },
    orderBy: parcelasTable.vencimento,
  });

  const linhas = [["Vencimento", "Noiva", "Nº", "Descrição", "Valor Previsto", "Status", "Valor Recebido", "Recebido Em", "Forma"]];
  for (const p of parcelas) {
    linhas.push([
      diaLocalSP(p.vencimento),
      p.contrato?.lead?.noivaNome ?? "",
      String(p.numero),
      p.descricao ?? "",
      p.valorPrevisto.toFixed(2),
      p.status,
      p.valorRecebido != null ? p.valorRecebido.toFixed(2) : "",
      p.recebidoEm ? diaLocalSP(p.recebidoEm) : "",
      p.formaRecebimento ?? "",
    ]);
  }
  responderCsv(res, `parcelas-${janela.de}-a-${janela.ate}`, montarCsv(linhas));
});

/**
 * Marca os pagamentos do intervalo como enviados à contabilidade. É POST
 * porque ESCREVE (ver o porquê da separação no GET …/folha/exportar acima).
 *
 * Só carimba quem ainda não tem carimbo: remarcar não sobrescreve a data do
 * envio original — a data em que a contabilidade recebeu aquele pagamento é
 * um fato, não um estado que se atualiza.
 */
router.post("/lojas/:lojaId/financeiro/contabilidade/enviar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // Aqui `de`/`ate` são OBRIGATÓRIOS no corpo; o helper compara igual.
  const q = intervaloValidado(res, EnviarContabilidadeBody.safeParse(req.body));
  if (!q) return;
  const { de, ate } = q;

  /**
   * F34/E103 — carimba os DOIS lados, e deixa rastro.
   *
   * Até aqui só as SAÍDAS eram carimbadas: o lado das entradas não tinha onde,
   * porque `parcelas.enviado_contabilidade_em` não existia. Declarar metade do
   * mês e chamar isso de fechado é o defeito que o F34 nomeia.
   *
   * A régua de cada lado é a do CAIXA, que é o que a contadora recebe:
   * `pagamentos.data` e `parcelas.recebido_em`. Recortar a entrada por
   * VENCIMENTO (como o CSV de parcelas faz) produziria um pacote em regime
   * misto, que não fecha com o DRE nem com o fluxo.
   *
   * E a ação passa a AUDITAR. Fechar o mês é a segunda escrita mais irreversível
   * do financeiro — o carimbo é de mão única, não há rota que o limpe — e era a
   * única sem autor. É a tese do E107 aplicada onde ela ainda não valia.
   */
  const agora = new Date();
  const { pcs, pgs } = await db.transaction(async (tx) => {
    const pgs = await tx.update(pagamentosTable)
      .set({ enviadoContabilidadeEm: agora })
      .where(and(
        eq(pagamentosTable.lojaId, lojaId),
        gte(pagamentosTable.data, inicioDoDia(de)),
        lt(pagamentosTable.data, inicioDoDia(addDias(ate, 1))),
        isNull(pagamentosTable.enviadoContabilidadeEm),
      ))
      .returning({ id: pagamentosTable.id });

    const pcs = await tx.update(parcelasTable)
      .set({ enviadoContabilidadeEm: agora })
      .where(and(
        eq(parcelasTable.lojaId, lojaId),
        isNotNull(parcelasTable.recebidoEm),
        gte(parcelasTable.recebidoEm, inicioDoDia(de)),
        lt(parcelasTable.recebidoEm, inicioDoDia(addDias(ate, 1))),
        isNull(parcelasTable.enviadoContabilidadeEm),
      ))
      .returning({ id: parcelasTable.id });

    // Só audita se algo mudou: um clique que não carimbou nada não é um fato.
    if (pcs.length + pgs.length > 0) {
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "CONTABILIDADE_ENVIADA",
        entidade: "pagamento",
        // Não há UMA entidade: o fato é o PERÍODO. O id carrega a janela, que é
        // o que alguém vai procurar ao perguntar "quem declarou junho?".
        entidadeId: `${de}..${ate}`,
        detalhe: { de, ate, parcelas: pcs.length, pagamentos: pgs.length },
      });
    }
    return { pcs, pgs };
  });

  res.json(EnviarContabilidadeResponse.parse({
    marcados: pcs.length + pgs.length,
    parcelas: pcs.length,
    pagamentos: pgs.length,
  }));
});

export default router;
