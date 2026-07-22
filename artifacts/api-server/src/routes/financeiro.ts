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
} from "@workspace/db";
import { eq, and, or, inArray, gte, lt, lte, desc, isNull, isNotNull, count, sql } from "drizzle-orm";
import {
  alertaDeCaixa,
  diaLocal,
  hojeLocal,
  resolverIntervalo,
  competenciaAtual,
  ultimasCompetencias,
  ultimoDiaDoMes,
  resumoCaixa,
  tendenciaCaixa,
  horizonteAberto,
  entradasDoIntervalo,
  saidasDoIntervalo,
  centavos,
  reais,
} from "@workspace/financeiro-core";
import {
  PagarContaPagarBody,
  PagarContaPagarResponse,
  ListAuditoriaResponse,
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
  EnviarContabilidadeBody,
  EnviarContabilidadeResponse,
  GetFluxoCaixaQueryParams,
  GetFluxoCaixaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { addDias, inicioDoDia } from "../lib/disponibilidade";
import { registrarAuditoria, acaoValida, quandoLocalSP, ROTULO_ACAO } from "../lib/auditoria";
import {
  competenciaValida,
  montarCsvContabilidade,
  diaLocalSP,
  type ItemContabil,
} from "../lib/folha";
import { montarContasDaCompetencia, TIPOS_RECORRENCIA } from "../lib/recorrencias";
import { montarCsv } from "../lib/csv";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

/**
 * Meio-dia de São Paulo do dia LOCAL de um instante. Âncora de data de negócio:
 * o dia UTC do resultado já é o dia certo, e é o mesmo instante para qualquer
 * hora do mesmo dia local — o que faz o dedup por (loja, dia) funcionar.
 */
function ancorarMeioDiaSP(instante: Date | string): Date {
  const dia = new Date(new Date(instante).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  return new Date(`${dia}T12:00:00-03:00`);
}

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/financeiro", requireModulo("financeiro"));
router.use("/lojas/:lojaId/contas-pagar", requireModulo("financeiro"));

// `de`/`ate` recortam por vencimento (dia local, inclusivo nas duas pontas),
// no mesmo padrão do GET /pagamentos. O join contrato→lead existe para a
// cobrança saber quem cobrar sem rebuscar todos os contratos — o `.parse`
// reduz o contrato inteiro ao `{leadId, lead}` do schema.
router.get("/lojas/:lojaId/financeiro/parcelas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListParcelasQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" });
    return;
  }
  const { de, ate } = parsed.data;
  if (de && ate && de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const parcelas = await db.query.parcelasTable.findMany({
    where: and(
      eq(parcelasTable.lojaId, lojaId),
      ...(de ? [gte(parcelasTable.vencimento, inicioDoDia(de))] : []),
      ...(ate ? [lt(parcelasTable.vencimento, inicioDoDia(addDias(ate, 1)))] : []),
    ),
    with: { contrato: { with: { lead: true } } },
    orderBy: parcelasTable.vencimento,
  });
  res.json(ListParcelasResponse.parse(parcelas));
});

router.post("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conta] = await db.insert(contasPagarTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateContaPagarResponse.parse(conta));
});

router.get("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contas = await db.select().from(contasPagarTable).where(eq(contasPagarTable.lojaId, lojaId)).orderBy(contasPagarTable.vencimento);
  res.json(ListContasPagarResponse.parse(contas));
});

// Pagamento auditável: valor, data e forma persistem em pagamentos +
// pagamento_itens (contaPagarId é UNIQUE — cinto de segurança contra pagamento
// duplo no nível do banco); a conta só muda de status.
router.post("/lojas/:lojaId/contas-pagar/:contaId/pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contaId = req.params.contaId as string;
  const parsed = PagarContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conta] = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.id, contaId), eq(contasPagarTable.lojaId, lojaId)));
  if (!conta) {
    res.status(404).json({ error: "Conta not found" });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Esta conta já foi paga" });
    return;
  }

  const contaPaga = await db.transaction(async (tx) => {
    const pagamentoId = randomUUID();
    await tx.insert(pagamentosTable).values({
      id: pagamentoId,
      lojaId,
      colaboradorId: conta.colaboradorId,
      data: parsed.data.data,
      valorPago: parsed.data.valorPago,
      forma: parsed.data.forma ?? null,
      observacoes: parsed.data.observacoes ?? null,
    });
    await tx.insert(pagamentoItensTable).values({
      id: randomUUID(),
      lojaId,
      pagamentoId,
      contaPagarId: conta.id,
      valor: parsed.data.valorPago,
    });
    const [atualizada] = await tx.update(contasPagarTable)
      .set({ status: "PAGA" })
      .where(eq(contasPagarTable.id, conta.id))
      .returning();
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "CONTA_PAGA",
      entidade: "conta_pagar",
      entidadeId: conta.id,
      detalhe: {
        pagamentoId,
        descricao: conta.descricao,
        valorPago: parsed.data.valorPago,
        forma: parsed.data.forma ?? null,
      },
    });
    return atualizada;
  });

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
    res.status(404).json({ error: "Conta not found" });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Estorne o pagamento antes de remover a conta" });
    return;
  }

  await db.delete(contasPagarTable).where(eq(contasPagarTable.id, conta.id));
  res.status(204).end();
});

// O caixa realizado. `de`/`ate` são dias locais inclusivos: o fim vira o
// início do dia seguinte (exclusivo) para pegar o dia inteiro.
router.get("/lojas/:lojaId/financeiro/pagamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListPagamentosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtro inválido (de/ate esperam YYYY-MM-DD)" });
    return;
  }
  const { de, ate, colaboradorId } = parsed.data;
  if (de && ate && de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

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
    res.status(400).json({ error: parsed.error.message });
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

  const previstoCentavos = contas.map((c) => Math.round(c.valorPrevisto * 100));
  const somaCentavos = previstoCentavos.reduce((s, v) => s + v, 0);
  const pagoCentavos =
    parsed.data.valorPago !== undefined ? Math.round(parsed.data.valorPago * 100) : somaCentavos;
  const valorPago = pagoCentavos / 100;

  // O item guarda o que a conta REALMENTE consumiu da saída, não o previsto:
  // sum(itens.valor) === pagamento.valorPago é o invariante que o fluxo e o DRE
  // dependem (a rota single-conta já o mantém). Num pagamento com desconto o
  // abatimento rateia proporcional ao previsto, em centavos, e a última conta
  // absorve o resto da divisão — mesma convenção do gerar-plano de parcelas.
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
      data: parsed.data.data,
      valorPago,
      forma: parsed.data.forma ?? null,
      observacoes: parsed.data.observacoes ?? null,
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
      .where(inArray(contasPagarTable.id, contaIds));
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "PAGAMENTO_REGISTRADO",
      entidade: "pagamento",
      entidadeId: pagamentoId,
      detalhe: {
        valorPago,
        forma: parsed.data.forma ?? null,
        contas: contas.map((c) => ({ id: c.id, descricao: c.descricao })),
      },
    });
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
    res.status(404).json({ error: "Pagamento not found" });
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
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="auditoria${sufixo}.csv"`);
  // BOM: sem ele o Excel lê UTF-8 como latin-1 e "comissão" vira "comissÃ£o".
  res.send("﻿" + montarCsv(csv));
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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(404).json({ error: "Recorrencia not found" });
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
    res.status(400).json({ error: parsed.error.message });
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
      where: and(
        eq(parcelasTable.lojaId, lojaId),
        isNotNull(parcelasTable.recebidoEm),
        gte(parcelasTable.recebidoEm, inicioDoDia(janelaIni)),
        lt(parcelasTable.recebidoEm, inicioDoDia(addDias(janelaFim, 1))),
      ),
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
    db.select().from(parcelasTable)
      .where(and(eq(parcelasTable.lojaId, lojaId), inArray(parcelasTable.status, ["PREVISTA", "PARCIAL"]))),
    db.select().from(contasPagarTable)
      .where(and(eq(contasPagarTable.lojaId, lojaId), eq(contasPagarTable.status, "PREVISTA"))),
  ]);

  const resumo = resumoCaixa(parcelasRecebidas, pagamentos, intervalo);

  // Por MEIO (E50): as MESMAS entradas do resumo, agrupadas — soma em centavos
  // inteiros, então `porMeio.total === resumo.entradas` por construção.
  const entradas = entradasDoIntervalo(parcelasRecebidas, intervalo);
  const porForma = new Map<string | null, { totalC: number; qtd: number }>();
  let totalEntradasC = 0;
  for (const p of entradas) {
    const c = centavos(p.valorRecebido ?? 0);
    totalEntradasC += c;
    const chave = p.formaRecebimento ?? null;
    const atual = porForma.get(chave) ?? { totalC: 0, qtd: 0 };
    atual.totalC += c;
    atual.qtd += 1;
    porForma.set(chave, atual);
  }
  const linhasPorMeio = [...porForma.entries()]
    .map(([forma, agg]) => ({ forma, total: reais(agg.totalC), qtd: agg.qtd }))
    .sort((a, b) => {
      if (a.forma === null) return 1;
      if (b.forma === null) return -1;
      return b.total - a.total;
    });

  const descricaoParcela = (p: (typeof parcelasRecebidas)[number]): string =>
    p.descricao || (p.numero === 0 ? "Entrada/sinal" : `Parcela ${p.numero}`);

  const movimentos = [
    ...entradas.map((p) => ({
      id: `parcela-${p.id}`,
      tipo: "ENTRADA" as const,
      data: p.recebidoEm!,
      valor: p.valorRecebido ?? 0,
      descricao: descricaoParcela(p),
      rotulo: p.contrato?.lead?.noivaNome ?? null,
      contratoId: p.contratoId,
    })),
    ...saidasDoIntervalo(pagamentos, intervalo).map((pg) => {
      const contas = (pg.itens ?? [])
        .map((i) => i.contaPagar)
        .filter((c): c is NonNullable<typeof c> => !!c);
      return {
        id: `pagamento-${pg.id}`,
        tipo: "SAIDA" as const,
        data: pg.data,
        valor: pg.valorPago,
        descricao: contas.length > 0 ? contas.map((c) => c.descricao).join(" · ") : "Pagamento",
        rotulo:
          pg.colaborador?.nome ??
          contas.find((c) => c.fornecedor)?.fornecedor ??
          contas.find((c) => c.categoria)?.categoria ??
          null,
        contratoId: null,
      };
    }),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  res.json(
    GetFluxoCaixaResponse.parse({
      intervalo,
      resumo,
      porMeio: { total: reais(totalEntradasC), linhas: linhasPorMeio },
      tendencia: tendenciaCaixa(parcelasRecebidas, pagamentos, {
        meses: MESES_TENDENCIA_FLUXO,
        ate: compHoje,
      }),
      horizonte: horizonteAberto(parcelasAbertas, contasAbertas),
      movimentos,
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
    // As duas pernas da parcela numa consulta só — as PAGAS alimentam o saldo,
    // as PREVISTAS alimentam a curva, e cada motor aplica o próprio filtro.
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
            and(
              eq(parcelasTable.status, "PAGA"),
              gte(parcelasTable.recebidoEm, saldoDe),
              lt(parcelasTable.recebidoEm, saldoAte),
            ),
            and(
              eq(parcelasTable.status, "PREVISTA"),
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
  const parsed = ExportarFolhaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" });
    return;
  }
  // Sem intervalo, o mês corrente — o período que a contabilidade fecha.
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const de = parsed.data.de ?? `${hoje.slice(0, 7)}-01`;
  const ate = parsed.data.ate ?? hoje;
  if (de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const csv = montarCsvContabilidade(await itensContabeis(lojaId, de, ate));
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="contabilidade-${de}-a-${ate}.csv"`);
  // BOM: sem ele o Excel lê UTF-8 como latin-1 e "Salário" vira "SalÃ¡rio".
  res.send("﻿" + csv);
});

/**
 * A janela de exportação: de/ate opcionais (dia local inclusivo, padrão do GET
 * /parcelas); sem intervalo, o mês corrente — o período que a contadora fecha.
 */
function janelaExportacao(de?: string, ate?: string): { de: string; ate: string } | null {
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const d = de ?? `${hoje.slice(0, 7)}-01`;
  const a = ate ?? hoje;
  return d > a ? null : { de: d, ate: a };
}

// CSV das contas a pagar por vencimento. SÓ LÊ — mesmo racional do exportar
// da folha: um GET tem de ser seguro para refresh/prefetch.
router.get("/lojas/:lojaId/financeiro/contas-pagar/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ExportarContasPagarQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" });
    return;
  }
  const janela = janelaExportacao(parsed.data.de, parsed.data.ate);
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
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="contas-pagar-${janela.de}-a-${janela.ate}.csv"`);
  res.send("﻿" + montarCsv(linhas));
});

// CSV das parcelas (a receber) por vencimento, com a noiva na linha — o
// mapa da inadimplência que a contadora importa sem redigitar.
router.get("/lojas/:lojaId/financeiro/parcelas/exportar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ExportarParcelasQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" });
    return;
  }
  const janela = janelaExportacao(parsed.data.de, parsed.data.ate);
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
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="parcelas-${janela.de}-a-${janela.ate}.csv"`);
  res.send("﻿" + montarCsv(linhas));
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
  const parsed = EnviarContabilidadeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" });
    return;
  }
  const { de, ate } = parsed.data;
  if (de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const marcados = await db.update(pagamentosTable)
    .set({ enviadoContabilidadeEm: new Date() })
    .where(and(
      eq(pagamentosTable.lojaId, lojaId),
      gte(pagamentosTable.data, inicioDoDia(de)),
      lt(pagamentosTable.data, inicioDoDia(addDias(ate, 1))),
      isNull(pagamentosTable.enviadoContabilidadeEm),
    ))
    .returning({ id: pagamentosTable.id });
  res.json(EnviarContabilidadeResponse.parse({ marcados: marcados.length }));
});

export default router;
