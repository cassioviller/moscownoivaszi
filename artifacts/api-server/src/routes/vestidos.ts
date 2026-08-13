import { Router, type IRouter } from "express";
import {
  db,
  vestidosTable,
  vestidoFotosTable,
  vestidoAtributosTable,
  atendimentosTable,
  bloqueioVestidosTable,
  contratosTable,
  contratoItensTable,
  itensEstoqueTable,
  orcamentoItensTable,
  avariasTable,
} from "@workspace/db";
import { eq, and, gte, lt, isNull, isNotNull, inArray, count, sql } from "drizzle-orm";
import { FOTO_MAX_BYTES, THUMB_MAX_BYTES } from "../lib/limites";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  ListVestidosResponse,
  CreateVestidoBody,
  CreateVestidoResponse,
  GetVestidoResponse,
  UpdateVestidoBody,
  UpdateVestidoResponse,
  SetVestidoFotoBody,
  SetVestidoFotoResponse,
  GetVestidoFotoQueryParams,
  CheckDisponibilidadeVestidosQueryParams,
  CheckDisponibilidadeVestidosResponse,
  GetProximaJanelaVestidoResponse,
  GetUtilizacaoVestidosQueryParams,
  GetUtilizacaoVestidosResponse,
  ListItensEstoqueResponse,
  CreateItemEstoqueBody,
  CreateItemEstoqueResponse,
  UpdateItemEstoqueBody,
  UpdateItemEstoqueResponse,
  GetComprometimentoEstoqueQueryParams,
  GetComprometimentoEstoqueResponse,
  VestidoStatus
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { registrarAuditoria } from "../lib/auditoria";
import { randomUUID } from "node:crypto";
import {
  buscarRegra,
  buscarBloqueiosAtivos,
  janelasDoBloqueio,
  conflitos,
  detalharConflitos,
  diaLocal,
  proximaDataLivre,
  inicioDoDia,
  addDias,
  type BloqueioJanelasInput,
  type BloqueioAtivoComContexto,
  type ConflitoDetalhe,
  type Janela,
} from "../lib/disponibilidade";
import { comprometidoNoDia } from "../lib/estoque";
import { identificarImagem } from "../lib/imagem";
import { atributosDaLoja, vestidoNaLoja, confeccaoPodeVirarPeca } from "../lib/escopo-loja";
import { erroDeValidacao } from "../lib/erros";
import { intervaloValidado } from "../lib/intervalo";
import { ancoraDeNegocio } from "@workspace/financeiro-core";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/vestidos", requireModulo("vestidos"));
// E154: o gate é montado por PREFIXO, e `itens-estoque` não é `vestidos` — sem
// esta linha o estoque ficava só com a sessão, aberto a quem não tem o módulo
// do acervo. Quem cuida das peças cuida das duas naturezas.
router.use("/lojas/:lojaId/itens-estoque", requireModulo("vestidos"));

// Fotos nas respostas de vestido: só a META (nunca bytes — `fotos: true`
// arrastava o bytea inteiro do banco para o zod descartar). `updatedAt` sai
// como `atualizadaEm`: é a versão que alimenta o cache-busting das URLs.
const FOTOS_META = {
  columns: { ordem: true, mime: true, largura: true, altura: true, updatedAt: true },
} as const;

type FotoMetaRow = { ordem: number; mime: string; largura: number; altura: number; updatedAt: Date };

function comFotosMeta<V extends { fotos: FotoMetaRow[] }>(vestido: V) {
  return {
    ...vestido,
    fotos: vestido.fotos.map(({ updatedAt, ...f }) => ({ ...f, atualizadaEm: updatedAt })),
  };
}

router.get("/lojas/:lojaId/vestidos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const vestidos = await db.query.vestidosTable.findMany({
    where: eq(vestidosTable.lojaId, lojaId),
    with: {
      atributos: true,
      fotos: FOTOS_META
    },
    orderBy: vestidosTable.nome,
  });

  res.json(ListVestidosResponse.parse(vestidos.map(comFotosMeta)));
});

router.post("/lojas/:lojaId/vestidos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateVestidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const { atributos, ...vestidoData } = parsed.data;
  // Mesma prova do PATCH: a FK garante que o atributo EXISTE, não de que loja
  // ele é. Sem isto, a loja A cadastra um vestido com a cor da loja B e o GET
  // enriquecido puxa o vocabulário da outra loja para dentro dela.
  if (atributos && !(await atributosDaLoja(atributos, lojaId))) {
    res.status(422).json({
      error: "REFERENCIA_INVALIDA",
      detalhe: "Atributo ou opção não é desta loja",
      campos: [{ campo: "atributos", motivo: "Atributo ou opção de outra loja" }],
    });
    return;
  }

  // E156 — a peça que nasce de uma CONFECÇÃO da fila da costureira (P4).
  // O gesto é da loja e o preço é digitado; o que o servidor prova é que o
  // trabalho citado é desta loja e que ele já existe como peça — a manga não
  // vira acervo enquanto a costureira não termina.
  if (vestidoData.origemAjusteId) {
    const veredicto = await confeccaoPodeVirarPeca(vestidoData.origemAjusteId, lojaId);
    if (veredicto === "FORA_DA_LOJA") {
      res.status(422).json({
        error: "REFERENCIA_INVALIDA",
        detalhe: "Este trabalho da fila não é desta loja",
        campos: [{ campo: "origemAjusteId", motivo: "Trabalho de outra loja" }],
      });
      return;
    }
    if (veredicto === "NAO_ESTA_PRONTA") {
      res.status(422).json({
        error: "CONFECCAO_INVALIDA",
        detalhe: "Só uma confecção já concluída vira peça do acervo",
        campos: [{ campo: "origemAjusteId", motivo: "Não é confecção, ou ainda não está pronta" }],
      });
      return;
    }
    // S-M8 — "uma vez só" vivia só no botão da tela. Este 409 é a resposta
    // amigável; o unique `vestidos_origem_ajuste_id_unique` é o cinto do
    // banco, que fecha a corrida entre duas requisições na mesma janela.
    if (veredicto === "JA_VIROU_PECA") {
      res.status(409).json({
        error: "CONFECCAO_JA_VIROU_PECA",
        detalhe: "Este trabalho já virou uma peça do acervo — a peça existe, não há o que criar de novo.",
        campos: [{ campo: "origemAjusteId", motivo: "A confecção já tem peça no acervo" }],
      });
      return;
    }
  }

  const vestidoId = randomUUID();

  const insertData = { ...vestidoData };

  await db.transaction(async (tx) => {
    await tx.insert(vestidosTable).values({
      id: vestidoId,
      lojaId,
      ...insertData,
    });

    if (atributos && atributos.length > 0) {
      await tx.insert(vestidoAtributosTable).values(
        atributos.map(a => ({
          vestidoId,
          atributoId: a.atributoId,
          opcaoId: a.opcaoId,
        }))
      );
    }
  });

  const vestido = await db.query.vestidosTable.findFirst({
    where: eq(vestidosTable.id, vestidoId),
    with: { atributos: true, fotos: FOTOS_META }
  });

  res.status(201).json(CreateVestidoResponse.parse(comFotosMeta(vestido!)));
});

// ── Disponibilidade em lote ──
// ATENÇÃO de roteamento: esta rota PRECISA vir antes de
// /lojas/:lojaId/vestidos/:vestidoId, senão "disponibilidade" casa como id.

function ddMM(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function fraseMotivo(conflito: ConflitoDetalhe): string {
  const periodo = conflito.fim
    ? `${ddMM(conflito.inicio)}–${ddMM(conflito.fim)}`
    : `a partir de ${ddMM(conflito.inicio)}`;
  if (conflito.tipo === "MANUTENCAO") {
    return `Em manutenção ${periodo}`;
  }
  return conflito.noivaNome
    ? `Reservado ${periodo} — noiva ${conflito.noivaNome}`
    : `Reservado ${periodo}`;
}

router.get("/lojas/:lojaId/vestidos/disponibilidade", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsedQuery = CheckDisponibilidadeVestidosQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({
      error: "FILTRO_INVALIDO",
      detalhe: "Parâmetro 'data' inválido: esperado YYYY-MM-DD.",
    });
    return;
  }
  const { data } = parsedQuery.data;

  const hojeDia = diaLocal(new Date());

  // 3 queries fixas — nunca N+1 (bloqueios de TODOS os vestidos em 1 query,
  // com noivaNome do lead via JOIN).
  const [vestidos, regra, ativos] = await Promise.all([
    db.select({ id: vestidosTable.id, status: vestidosTable.status })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, lojaId))
      .orderBy(vestidosTable.nome),
    buscarRegra(lojaId),
    buscarBloqueiosAtivos({ lojaId }),
  ]);

  // "Se eu criar uma RESERVA_CASAMENTO com casamentoData = data, quais
  // vestidos conflitam?" — meio-dia São Paulo, pela âncora da casa (S-O117:
  // este `T12:00:00-03:00` escrito à mão era a quinta grafia de
  // `ancoraDeNegocio`, e a única fora dela).
  const candidato: BloqueioJanelasInput = {
    id: "__candidato__",
    tipo: "RESERVA_CASAMENTO",
    casamentoData: ancoraDeNegocio(data),
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    lavagemConcluidaEm: null,
    inicio: null,
    fim: null,
  };
  const janelasCandidato = janelasDoBloqueio(candidato, regra, hojeDia);

  const porVestido = new Map<
    string,
    { janelas: Janela[]; contexto: Map<string, BloqueioAtivoComContexto> }
  >();
  for (const ativo of ativos) {
    let grupo = porVestido.get(ativo.bloqueio.vestidoId);
    if (!grupo) {
      grupo = { janelas: [], contexto: new Map() };
      porVestido.set(ativo.bloqueio.vestidoId, grupo);
    }
    grupo.janelas.push(...janelasDoBloqueio(ativo.bloqueio, regra, hojeDia));
    grupo.contexto.set(ativo.bloqueio.id, ativo);
  }

  const itens = vestidos.map((vestido) => {
    // S-A26: a régua de estado é o enum do contrato (`VestidoStatus`), não uma
    // grafia solta — e a borda do PATCH agora recusa qualquer valor fora dele.
    if (vestido.status !== VestidoStatus.ativo) {
      return {
        vestidoId: vestido.id,
        disponivel: false,
        status: "INATIVO" as const,
        motivo: "Vestido inativo",
        conflito: null,
      };
    }
    const grupo = porVestido.get(vestido.id);
    const pares = grupo ? conflitos(janelasCandidato, grupo.janelas) : [];
    if (!grupo || pares.length === 0) {
      return {
        vestidoId: vestido.id,
        disponivel: true,
        status: "DISPONIVEL" as const,
        motivo: null,
        conflito: null,
      };
    }
    const [principal] = detalharConflitos(pares, grupo.contexto);
    return {
      vestidoId: vestido.id,
      disponivel: false,
      status: principal.tipo === "MANUTENCAO" ? ("MANUTENCAO" as const) : ("RESERVADO" as const),
      motivo: fraseMotivo(principal),
      conflito: principal,
    };
  });

  res.json(CheckDisponibilidadeVestidosResponse.parse({ data, itens }));
});

// ── Utilização por vestido (E15) ──
// O relatório de encalhe e de estrela: TODOS os vestidos, cada um com quantas
// provas, reservas e contratos gerou no período — zeros incluídos de
// propósito, porque o vestido sem uso é a resposta de "o que sai de linha".
// Três agregações no banco (nunca as linhas) + costura em memória.
router.get("/lojas/:lojaId/vestidos/utilizacao", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const q = intervaloValidado(res, GetUtilizacaoVestidosQueryParams.safeParse(req.query));
  if (!q) return;
  const { de, ate } = q;
  const inicio = de ? inicioDoDia(de) : null;
  const fim = ate ? inicioDoDia(addDias(ate, 1)) : null;
  // Vale para qualquer coluna de instante (inicio, casamentoData, fechadoEm).
  const recorte = (coluna: AnyPgColumn) => [
    ...(inicio ? [gte(coluna, inicio)] : []),
    ...(fim ? [lt(coluna, fim)] : []),
  ];

  const receitaSql = sql`sum(${contratoItensTable.valorUnitario} * ${contratoItensTable.quantidade})`
    .mapWith(Number);

  const [vestidos, provas, reservas, contratos] = await Promise.all([
    db
      .select({
        vestidoId: vestidosTable.id,
        codigo: vestidosTable.codigo,
        nome: vestidosTable.nome,
        status: vestidosTable.status,
        precoBase: vestidosTable.precoBase,
        // E157: desce junto com a contagem — quem lê a utilização é quem
        // decide se a peça já se pagou e quanto cobrar da próxima saída.
        precoRealuguel: vestidosTable.precoRealuguel,
        // E216 (cláusula 12ª): pelo mesmo motivo. O predicado da 12ª é
        // `exclusiva && contratos === 0`, e as duas metades estão nesta linha.
        exclusiva: vestidosTable.exclusiva,
      })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, lojaId))
      .orderBy(vestidosTable.nome),
    // Provas agendadas no período (FALTOU conta: a demanda existiu).
    db
      .select({ vestidoId: bloqueioVestidosTable.vestidoId, qtd: count() })
      .from(atendimentosTable)
      .innerJoin(bloqueioVestidosTable, eq(bloqueioVestidosTable.id, atendimentosTable.bloqueioId))
      .where(and(
        eq(atendimentosTable.lojaId, lojaId),
        eq(atendimentosTable.tipo, "PROVA"),
        ...recorte(atendimentosTable.inicio),
      ))
      .groupBy(bloqueioVestidosTable.vestidoId),
    // Reservas de casamento ativas com data no período.
    db
      .select({ vestidoId: bloqueioVestidosTable.vestidoId, qtd: count() })
      .from(bloqueioVestidosTable)
      .where(and(
        eq(bloqueioVestidosTable.lojaId, lojaId),
        eq(bloqueioVestidosTable.tipo, "RESERVA_CASAMENTO"),
        isNull(bloqueioVestidosTable.canceladoEm),
        ...recorte(bloqueioVestidosTable.casamentoData),
      ))
      .groupBy(bloqueioVestidosTable.vestidoId),
    // Itens de PEÇA de contratos ATIVOS fechados no período — e a receita.
    // E150: ACESSORIO entra aqui junto com VESTIDO. As duas são peça do acervo,
    // com código e reserva próprios, e a utilização é por PEÇA — deixar o
    // acessório de fora faria o bolero circular sem nunca aparecer no giro nem
    // na receita da peça que o gerou.
    db
      .select({ vestidoId: contratoItensTable.vestidoId, qtd: count(), receita: receitaSql })
      .from(contratoItensTable)
      .innerJoin(contratosTable, eq(contratosTable.id, contratoItensTable.contratoId))
      .where(and(
        eq(contratoItensTable.lojaId, lojaId),
        inArray(contratoItensTable.tipo, ["VESTIDO", "ACESSORIO"]),
        isNotNull(contratoItensTable.vestidoId),
        eq(contratosTable.status, "ATIVO"),
        ...recorte(contratosTable.fechadoEm),
      ))
      .groupBy(contratoItensTable.vestidoId),
  ]);

  const provasPor = new Map(provas.map((p) => [p.vestidoId, p.qtd]));
  const reservasPor = new Map(reservas.map((r) => [r.vestidoId, r.qtd]));
  const contratosPor = new Map(contratos.map((c) => [c.vestidoId, c]));

  res.json(GetUtilizacaoVestidosResponse.parse(vestidos.map((v) => ({
    ...v,
    provas: provasPor.get(v.vestidoId) ?? 0,
    reservas: reservasPor.get(v.vestidoId) ?? 0,
    contratos: contratosPor.get(v.vestidoId)?.qtd ?? 0,
    receita: Math.round((contratosPor.get(v.vestidoId)?.receita ?? 0) * 100) / 100,
  }))));
});

// ── Próxima janela livre (E9) ──
// "Quando posso ter esse vestido para um casamento?" — a resposta que a
// vendedora tentava achar data por data no batch acima.
const HORIZONTE_PROXIMA_JANELA = 365;

router.get("/lojas/:lojaId/vestidos/:vestidoId/proxima-janela", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const vestido = await db.query.vestidosTable.findFirst({
    columns: { id: true, status: true },
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
  });
  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }

  const hojeDia = diaLocal(new Date());
  if (vestido.status !== VestidoStatus.ativo) {
    res.json(GetProximaJanelaVestidoResponse.parse({
      proximaData: null,
      aPartirDe: hojeDia,
      horizonteDias: HORIZONTE_PROXIMA_JANELA,
    }));
    return;
  }

  const [regra, ativos] = await Promise.all([
    buscarRegra(lojaId as string),
    buscarBloqueiosAtivos({ lojaId: lojaId as string, vestidoId: vestidoId as string }),
  ]);
  const janelasExistentes = ativos.flatMap(({ bloqueio }) =>
    janelasDoBloqueio(bloqueio, regra, hojeDia),
  );
  const proximaData = proximaDataLivre({
    janelasExistentes,
    regra,
    aPartirDe: hojeDia,
    horizonteDias: HORIZONTE_PROXIMA_JANELA,
  });

  res.json(GetProximaJanelaVestidoResponse.parse({
    proximaData,
    aPartirDe: hojeDia,
    horizonteDias: HORIZONTE_PROXIMA_JANELA,
  }));
});

router.get("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
    with: {
      atributos: true,
      fotos: FOTOS_META
    },
  });

  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }

  res.json(GetVestidoResponse.parse(comFotosMeta(vestido)));
});

router.patch("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const parsed = UpdateVestidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const { atributos, ...vestidoData } = parsed.data;
  const updateData = { ...vestidoData, updatedAt: new Date() };

  /**
   * O 404 vem ANTES da transação, e não é cosmético — é o mesmo padrão B1 que
   * o E91 consertou no `PATCH /equipe`, repetido aqui.
   *
   * O `tx.update` é escopado por loja e não fazia nada num vestido de outra
   * loja; o `tx.delete` de `vestido_atributos` filtrava SÓ por `vestidoId`, e
   * destruía. Medido nesta árvore: `PATCH /api/lojas/<A>/vestidos/<de-B>` com
   * `{"atributos": []}` respondia 404 **e deixava o vestido de B com zero
   * atributos** — a ficha de tamanho, cor e categoria vazia, sem trilha e sem
   * ninguém a quem perguntar. O 404 saía da consulta pós-commit.
   */
  if (!(await vestidoNaLoja(vestidoId as string, lojaId as string))) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }
  if (atributos !== undefined && !(await atributosDaLoja(atributos, lojaId as string))) {
    res.status(422).json({
      error: "REFERENCIA_INVALIDA",
      detalhe: "Atributo ou opção não é desta loja",
      campos: [{ campo: "atributos", motivo: "Atributo ou opção de outra loja" }],
    });
    return;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(vestidoData).length > 0) {
      await tx.update(vestidosTable)
        .set(updateData)
        .where(and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)));
    }

    if (atributos !== undefined) {
      await tx.delete(vestidoAtributosTable).where(eq(vestidoAtributosTable.vestidoId, vestidoId as string));
      if (atributos.length > 0) {
        await tx.insert(vestidoAtributosTable).values(
          atributos.map(a => ({
            vestidoId: vestidoId as string,
            atributoId: a.atributoId,
            opcaoId: a.opcaoId,
          }))
        );
      }
    }
  });

  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
    with: { atributos: true, fotos: FOTOS_META }
  });

  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }

  res.json(UpdateVestidoResponse.parse(comFotosMeta(vestido)));
});

/**
 * S-A25 — apagar peça do acervo era cinco linhas sem guarda nenhuma, e a
 * cascata do banco é mais funda do que parece ao ler esta rota.
 *
 * `bloqueio_vestidos.vestido_id` é CASCADE, e dele descem outras três: os
 * `atendimentos` (a prova marcada da noiva), as `avarias` (o reparo COBRADO) e
 * os `contrato_bloqueios`. Um DELETE aqui levava a reserva, a prova e a
 * cobrança junto, em silêncio e com 204. Medido no banco de dev: 334 peças têm
 * bloqueio, com 14 atendimentos e 124 avarias pendurados neles — **R$
 * 43.400,00 em reparos que sumiriam com as peças**. E `contrato_itens` /
 * `orcamento_itens` são `set null` (S-A14): a peça vendida vira descrição
 * livre, e a guarda do E150 deixa de valer para aquele contrato.
 *
 * A régua é a mesma que o E91 fixou para gente e que a migração da S-A13
 * respeitou para o acervo: **o que tem história não se apaga**. O 409 sai antes
 * de o banco decidir por nós — e diz QUEM depende, no molde do `PERFIL_EM_USO`
 * do `admin.ts`, porque "há registros dependendo deste" não dá próximo passo a
 * ninguém.
 */
router.delete("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;

  const [alvo] = await db.select({ id: vestidosTable.id }).from(vestidosTable)
    .where(and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)));
  if (!alvo) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Esta peça não existe nesta loja." });
    return;
  }

  const [[emContrato], [emOrcamento], [bloqueios], [provas], [avarias]] = await Promise.all([
    db.select({ n: count() }).from(contratoItensTable)
      .where(eq(contratoItensTable.vestidoId, alvo.id)),
    db.select({ n: count() }).from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.vestidoId, alvo.id)),
    db.select({ n: count() }).from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.vestidoId, alvo.id)),
    // Prova e avaria descem do bloqueio, não do vestido — quem lê a rota não
    // vê que elas estão em jogo, e são as duas que doem.
    db.select({ n: count() }).from(atendimentosTable)
      .innerJoin(bloqueioVestidosTable, eq(atendimentosTable.bloqueioId, bloqueioVestidosTable.id))
      .where(eq(bloqueioVestidosTable.vestidoId, alvo.id)),
    db.select({ n: count() }).from(avariasTable)
      .innerJoin(bloqueioVestidosTable, eq(avariasTable.bloqueioId, bloqueioVestidosTable.id))
      .where(eq(bloqueioVestidosTable.vestidoId, alvo.id)),
  ]);

  const historia = [
    emContrato!.n > 0 ? `${emContrato!.n} item(ns) de contrato` : null,
    emOrcamento!.n > 0 ? `${emOrcamento!.n} item(ns) de orçamento` : null,
    bloqueios!.n > 0 ? `${bloqueios!.n} reserva(s)` : null,
    provas!.n > 0 ? `${provas!.n} atendimento(s)` : null,
    avarias!.n > 0 ? `${avarias!.n} avaria(s)` : null,
  ].filter(Boolean);

  if (historia.length > 0) {
    res.status(409).json({
      error: "VESTIDO_COM_HISTORIA",
      detalhe: `Esta peça tem ${historia.join(", ")} e não pode ser apagada — apagá-la levaria essa história junto. Marque-a como indisponível se ela saiu do acervo.`,
    });
    return;
  }

  await db.delete(vestidosTable).where(and(eq(vestidosTable.id, alvo.id), eq(vestidosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Serve o bytea da foto como imagem binária (consumido por <img src>).
// Escopo de loja garantido pelo JOIN com o vestido (404 se a foto for de
// outra loja). `variante=thumb` serve a miniatura quando existe (fallback na
// cheia — nunca 404 por falta de thumb). Com `?v=` a URL é versionada por
// updatedAt e o cache pode ser immutable; sem, revalidação barata por ETag.
router.get("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  if (Number.isNaN(ordem)) {
    res.status(400).json({ error: "ORDEM_INVALIDA", detalhe: "Ordem de foto inválida." });
    return;
  }
  const query = GetVestidoFotoQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json(erroDeValidacao(query.error));
    return;
  }
  const { variante = "cheia", v } = query.data;

  const foto = await db.query.vestidoFotosTable.findFirst({
    where: and(eq(vestidoFotosTable.vestidoId, vestidoId as string), eq(vestidoFotosTable.ordem, ordem)),
    with: { vestido: { columns: { lojaId: true } } },
  });

  if (!foto || foto.vestido.lojaId !== lojaId) {
    res.status(404).json({ error: "FOTO_NAO_ENCONTRADA", detalhe: "Esta foto não existe nesta loja." });
    return;
  }

  const servirThumb = variante === "thumb" && foto.thumbBytes != null;
  // A variante entra no ETag: thumb e cheia da mesma foto não podem trocar 304.
  const etag = `"${vestidoId}-${ordem}-${servirThumb ? "t" : "c"}-${foto.updatedAt.getTime()}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader("Content-Type", servirThumb ? foto.thumbMime ?? foto.mime : foto.mime);
  res.setHeader(
    "Cache-Control",
    v ? "private, max-age=31536000, immutable" : "private, max-age=60, must-revalidate",
  );
  res.setHeader("ETag", etag);
  res.send(servirThumb ? foto.thumbBytes : foto.bytes);
});

// Limites da foto: o que o cliente DEVERIA mandar depois do downscale por
// canvas. Acima disso é bug do cliente ou má-fé — recusa, não acomoda.
// S-O19: `FOTO_MAX_BYTES` mora em `lib/limites.ts` (importado no topo) — eram
// três declarações independentes, iguais por coincidência.
// S-O62/E186: e eram QUATRO — o `THUMB_MAX_BYTES` ficou aqui, literal, três
// linhas abaixo deste comentário. Ele mora em `lib/limites.ts` junto dos
// outros, e é ele que responde por 67% da folga do teto de CORPO: a tela manda
// foto e miniatura no MESMO corpo.

router.put("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  const parsed = SetVestidoFotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
  });
  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }

  // Mime e dimensões saem do BINÁRIO, nunca da palavra do cliente — um mime
  // mentiroso viraria o Content-Type servido de volta (stored-XSS).
  const buffer = Buffer.from(parsed.data.base64, "base64");
  if (buffer.length > FOTO_MAX_BYTES) {
    res.status(422).json({ error: "FOTO_MUITO_GRANDE", detalhe: "Máximo 2MB — a foto deveria ter sido reduzida antes do envio" });
    return;
  }
  const info = identificarImagem(buffer);
  if (!info) {
    res.status(422).json({ error: "FOTO_INVALIDA", detalhe: "Use JPEG, PNG ou WebP" });
    return;
  }

  let thumbBuffer: Buffer | null = null;
  let thumbInfo: ReturnType<typeof identificarImagem> = null;
  if (parsed.data.thumbBase64) {
    thumbBuffer = Buffer.from(parsed.data.thumbBase64, "base64");
    if (thumbBuffer.length > THUMB_MAX_BYTES) {
      res.status(422).json({ error: "FOTO_MUITO_GRANDE", detalhe: "Miniatura acima de 512KB" });
      return;
    }
    thumbInfo = identificarImagem(thumbBuffer);
    if (!thumbInfo) {
      res.status(422).json({ error: "FOTO_INVALIDA", detalhe: "Miniatura precisa ser JPEG, PNG ou WebP" });
      return;
    }
  }

  // Sem thumb no corpo, as colunas são ANULADAS: nunca servir a miniatura de
  // uma foto que já não existe.
  const valores = {
    mime: info.mime,
    largura: info.largura,
    altura: info.altura,
    bytes: buffer,
    thumbBytes: thumbBuffer,
    thumbMime: thumbInfo?.mime ?? null,
  };
  const [foto] = await db.insert(vestidoFotosTable)
    .values({ id: randomUUID(), vestidoId: vestidoId as string, ordem, ...valores })
    .onConflictDoUpdate({
      target: [vestidoFotosTable.vestidoId, vestidoFotosTable.ordem],
      set: { ...valores, updatedAt: new Date() },
    })
    .returning();

  res.json(SetVestidoFotoResponse.parse({
    ordem: foto.ordem,
    mime: foto.mime,
    largura: foto.largura,
    altura: foto.altura,
    atualizadaEm: foto.updatedAt,
  }));
});

router.delete("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
  });
  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }
  await db.delete(vestidoFotosTable).where(and(eq(vestidoFotosTable.vestidoId, vestidoId as string), eq(vestidoFotosTable.ordem, ordem)));
  res.status(204).send();
});

// ── Itens de ESTOQUE (E154) ──────────────────────────────────────────────────
//
// A peça que se CONTA, ao lado da peça que se RESERVA. Saiote, crinol, anágua:
// existem dez iguais, e reservar "o nº 7" não significa nada porque ninguém vai
// atrás daquele. Ficam fora de `vestidos` para não encher de anágua a lista que
// a vendedora abre com a noiva na cabine.
//
// Gate: o mesmo módulo `vestidos` do acervo — quem cuida das peças cuida das
// duas naturezas.

router.get("/lojas/:lojaId/itens-estoque", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itens = await db.select().from(itensEstoqueTable)
    .where(eq(itensEstoqueTable.lojaId, lojaId))
    .orderBy(itensEstoqueTable.nome);
  res.json(ListItensEstoqueResponse.parse(itens));
});

router.post("/lojas/:lojaId/itens-estoque", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateItemEstoqueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [item] = await db.insert(itensEstoqueTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateItemEstoqueResponse.parse(item));
});

/**
 * Quantas unidades de cada item saem no dia — a conta que faz o aviso.
 *
 * Vem dos contratos ATIVOS cuja janela de USO cobre o dia, somando a
 * `quantidade` dos itens de estoque do snapshot. Nunca de um contador gravado:
 * o estoque diz quantas a loja TEM, e o comprometimento é sempre derivado.
 *
 * Contrato CANCELADO não conta (a peça voltou ao mercado), e contrato sem
 * nenhuma data não conta em dia nenhum — `janelaDeUsoDoContrato` explica por
 * quê.
 *
 * `disponivel` pode vir NEGATIVO, e é o ponto do épico: a tela avisa e deixa
 * fechar. Recusar uma venda de R$ 4.000 por causa de uma anágua seria um
 * defeito, não uma proteção — saiote é substituível, o bolero que a noiva
 * escolheu pela foto não é (e por isso ele é peça do acervo, e bloqueia).
 */
router.get("/lojas/:lojaId/itens-estoque/comprometimento", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const params = GetComprometimentoEstoqueQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const dia = params.data.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    res.status(400).json({
      error: "DATA_INVALIDA",
      detalhe: "Informe o dia no formato AAAA-MM-DD.",
      campos: [{ campo: "data", motivo: "Formato esperado: AAAA-MM-DD" }],
    });
    return;
  }

  const [itens, linhas, regra] = await Promise.all([
    db.select().from(itensEstoqueTable)
      .where(and(eq(itensEstoqueTable.lojaId, lojaId), eq(itensEstoqueTable.ativo, true)))
      .orderBy(itensEstoqueTable.nome),
    db.select({
      itemEstoqueId: contratoItensTable.itemEstoqueId,
      quantidade: contratoItensTable.quantidade,
      dataCasamento: contratosTable.dataCasamento,
      dataRetirada: contratosTable.dataRetirada,
      dataDevolucao: contratosTable.dataDevolucao,
    })
      .from(contratoItensTable)
      .innerJoin(contratosTable, eq(contratosTable.id, contratoItensTable.contratoId))
      .where(and(
        eq(contratoItensTable.lojaId, lojaId),
        eq(contratosTable.status, "ATIVO"),
        isNotNull(contratoItensTable.itemEstoqueId),
      )),
    buscarRegra(lojaId),
  ]);

  const comprometido = comprometidoNoDia(
    linhas.map((l) => ({ ...l, itemEstoqueId: l.itemEstoqueId! })),
    dia,
    regra,
  );

  res.json(GetComprometimentoEstoqueResponse.parse({
    data: dia,
    itens: itens.map((it) => {
      const comprometida = comprometido.get(it.id) ?? 0;
      return {
        itemEstoqueId: it.id,
        nome: it.nome,
        tamanho: it.tamanho,
        quantidade: it.quantidade,
        comprometida,
        disponivel: it.quantidade - comprometida,
      };
    }),
  }));
});

router.patch("/lojas/:lojaId/itens-estoque/:itemEstoqueId", async (req, res): Promise<void> => {
  const { lojaId, itemEstoqueId } = req.params as { lojaId: string; itemEstoqueId: string };
  const parsed = UpdateItemEstoqueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [item] = await db.update(itensEstoqueTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(itensEstoqueTable.id, itemEstoqueId), eq(itensEstoqueTable.lojaId, lojaId)))
    .returning();
  if (!item) {
    res.status(404).json({
      error: "ITEM_ESTOQUE_NAO_ENCONTRADO",
      detalhe: "Este item de estoque não existe nesta loja.",
    });
    return;
  }
  res.json(UpdateItemEstoqueResponse.parse(item));
});

/**
 * S-M16 — era um dos três deletes crus que sobraram fora da régua do E115
 * ("nada some sem 404, contagem e rastro"). O item some do cadastro; os itens
 * de contrato/orçamento que o citam ficam com `item_estoque_id` nulo (set
 * null) e a descrição em texto preservada — decisão ESCRITA, o mesmo
 * tratamento da peça vendida (S-A14). O que faltava era o resto: 204 sobre o
 * nada virou 404, e o rastro guarda o nome e quantos itens o citavam, porque
 * depois do DELETE não sobra linha de onde reconstituir nada disso.
 */
router.delete("/lojas/:lojaId/itens-estoque/:itemEstoqueId", async (req, res): Promise<void> => {
  const { lojaId, itemEstoqueId } = req.params as { lojaId: string; itemEstoqueId: string };
  const [item] = await db.select().from(itensEstoqueTable)
    .where(and(eq(itensEstoqueTable.id, itemEstoqueId), eq(itensEstoqueTable.lojaId, lojaId)));
  if (!item) {
    res.status(404).json({
      error: "ITEM_ESTOQUE_NAO_ENCONTRADO",
      detalhe: "Este item de estoque não existe nesta loja.",
    });
    return;
  }
  const [[emContratos], [emOrcamentos]] = await Promise.all([
    db.select({ n: count() }).from(contratoItensTable)
      .where(eq(contratoItensTable.itemEstoqueId, itemEstoqueId)),
    db.select({ n: count() }).from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.itemEstoqueId, itemEstoqueId)),
  ]);
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "ITEM_ESTOQUE_REMOVIDO",
      entidade: "item_estoque",
      entidadeId: itemEstoqueId,
      detalhe: {
        nome: item.nome,
        tamanho: item.tamanho,
        quantidade: item.quantidade,
        itensDeContrato: emContratos!.n,
        itensDeOrcamento: emOrcamentos!.n,
      },
    });
    await tx.delete(itensEstoqueTable)
      .where(and(eq(itensEstoqueTable.id, itemEstoqueId), eq(itensEstoqueTable.lojaId, lojaId)));
  });
  res.status(204).send();
});

export default router;
