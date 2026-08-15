/**
 * Serviço de disponibilidade de vestidos (Lote 3).
 *
 * Núcleo puro (sem IO): diaLocal, addDias, janelasDoBloqueio, conflitos,
 * ocupacaoFisica. Orquestração com IO: verificarDisponibilidade.
 *
 * Convenções:
 * - Janelas são intervalos de DIAS INCLUSIVOS [inicio, fim] em "YYYY-MM-DD"
 *   no fuso America/Sao_Paulo. `fim = null` = janela aberta.
 * - Janelas encostadas NÃO conflitam.
 * - Duas janelas conflitam se sobrepõem E pelo menos uma é FISICA
 *   (PROVA × PROVA é permitido — o vestido está na loja).
 * - "Hoje" é SEMPRE parâmetro injetado, nunca `new Date()` interno.
 * - Há DOIS tipos de data aqui, e confundi-los é erro de um dia (S-O117):
 *   `inicio`/`fim` da manutenção e as datas REAIS (prova, retirada, devolução,
 *   lavagem) são INSTANTES — o dia delas é o dia local, `diaLocal`.
 *   `casamentoData` é data de NEGÓCIO — o dia dela é o dia UTC do que foi
 *   gravado, `diaDeNegocio`, a mesma régua de `financeiro-core/datas.ts`.
 */
import { and, eq, gte, isNotNull, isNull, lt, ne, not, or, type SQL } from "drizzle-orm";
import { diaDeNegocio } from "@workspace/financeiro-core";
import { janelaDeProvaDoDia } from "@workspace/agenda-core";
import {
  db,
  bloqueioVestidosTable,
  reservasTable,
  regraDisponibilidadeTable,
  leadsTable,
  type BloqueioVestido,
} from "@workspace/db";

// ───────────────────────── Tipos ─────────────────────────

export type BloqueioTipo = BloqueioVestido["tipo"];

export interface RegraJanelas {
  provaDiasAntes: number;
  usoDiasAntes: number;
  usoDiasDepois: number;
  lavagemDiasDepois: number;
  /** S-A16: a lavagem da peça de ESTOQUE, separada da do vestido — quem a lê é
   *  `estoque.ts`; 0 = estoque sem lavagem na conta (o comportamento antigo). */
  estoqueLavagemDiasDepois: number;
}

/** Defaults do schema — loja sem regra cadastrada nunca falha. */
export const REGRA_DEFAULT: RegraJanelas = {
  provaDiasAntes: 14,
  usoDiasAntes: 3,
  usoDiasDepois: 2,
  lavagemDiasDepois: 7,
  estoqueLavagemDiasDepois: 0,
};

/**
 * E228/S-C60 — decisão da dona (14/08/2026): a loja PODE segurar um vestido
 * antes de saber de qual noiva é, **por este prazo**. O bloqueio órfão
 * (RESERVA_CASAMENTO sem `leadId` e sem `reservaId`) expira sozinho: vencido,
 * a régua de disponibilidade o solta e a tela o mostra vencido. MANUTENCAO
 * não conta — é da loja por natureza, não órfã.
 */
export const VALIDADE_DO_BLOQUEIO_ORFAO_DIAS = 7;

/**
 * E228/S-C233 — teto da PRÉ-PENEIRA SQL para a cauda de lavagem do bloqueio
 * cancelado: devolvido há mais tempo que isto, ele nem entra na conta. Quem
 * decide a ocupação REAL é `janelasDoBloqueio` com a regra da loja
 * (`lavagemDiasDepois`, default 7) — este número só limita quantas linhas
 * históricas a query arrasta, e por isso é um teto folgado, não a regra.
 */
export const TETO_DA_CAUDA_DE_LAVAGEM_DIAS = 30;

export type ClasseJanela = "FISICA" | "PROVA";
export type MotivoJanela =
  | "USO"
  | "LAVAGEM"
  | "PROVA"
  | "MANUTENCAO"
  | "ATRASO_DEVOLUCAO";

export interface Janela {
  /** Dia local inclusivo "YYYY-MM-DD". */
  inicio: string;
  /** Dia local inclusivo "YYYY-MM-DD"; null = aberta. */
  fim: string | null;
  motivo: MotivoJanela;
  classe: ClasseJanela;
  bloqueioId: string;
}

export interface Conflito {
  nova: Janela;
  existente: Janela;
}

/** Campos de um bloqueio necessários para derivar janelas (subset de BloqueioVestido). */
export type BloqueioJanelasInput = Pick<
  BloqueioVestido,
  | "id"
  | "tipo"
  | "casamentoData"
  | "provaDataReal"
  | "retiradaDataReal"
  | "devolucaoDataReal"
  | "lavagemConcluidaEm"
  | "inicio"
  | "fim"
> & {
  /**
   * E225 — presente quando o bloqueio vem do banco; os CANDIDATOS montados à
   * mão não o carregam (candidato cancelado não existe). Cancelado, só a
   * ocupação FÍSICA sobrevive: a janela de PROVA de um contrato morto não
   * agenda nada.
   */
  canceladoEm?: BloqueioVestido["canceladoEm"];
};

/** Item de conflito no shape do payload 409 / endpoint batch. */
export interface ConflitoDetalhe {
  bloqueioId: string;
  tipo: BloqueioTipo;
  motivo: MotivoJanela;
  inicio: string;
  fim: string | null;
  leadId: string | null;
  reservaId: string | null;
  noivaNome: string | null;
}

export interface ResultadoDisponibilidade {
  disponivel: boolean;
  conflitos: ConflitoDetalhe[];
  /** Regra efetiva usada (da loja ou REGRA_DEFAULT) — reutilizável p/ ocupacaoFisica. */
  regra: RegraJanelas;
}

/** Aceita o db ou uma transação drizzle (mesma API de select). */
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ───────────────────────── Núcleo puro: datas ─────────────────────────

const FUSO_LOJA = "America/Sao_Paulo";

// en-CA formata como "YYYY-MM-DD".
const formatadorDiaLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_LOJA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dia local (America/Sao_Paulo) de um instante, como "YYYY-MM-DD".
 * O banco está em GMT — truncar o timestamptz direto erraria o dia.
 */
export function diaLocal(d: Date): string {
  return formatadorDiaLocal.format(d);
}

/**
 * Instante em que o dia local "YYYY-MM-DD" começa em São Paulo — o inverso de
 * `diaLocal`. Offset fixo -03:00: o Brasil não tem DST desde 2019, e é aqui que
 * essa premissa mora (fronteira de dia para filtros sobre timestamptz).
 */
export function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

const MS_POR_DIA = 86_400_000;

/**
 * Soma `n` dias a um dia "YYYY-MM-DD". Aritmética em UTC-meio-dia para
 * ficar imune a DST.
 */
export function addDias(dia: string, n: number): string {
  const [ano, mes, diaMes] = dia.split("-").map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, diaMes, 12) + n * MS_POR_DIA);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${instante.getUTCFullYear()}-${pad(instante.getUTCMonth() + 1)}-${pad(instante.getUTCDate())}`;
}

// ───────────────────────── Núcleo puro: janelas ─────────────────────────

/**
 * Deriva as janelas de indisponibilidade de um bloqueio.
 *
 * RESERVA_CASAMENTO (casamentoData = D, obrigatória — a rota valida com 400):
 * - USO     [D − usoDiasAntes, D + usoDiasDepois]            FISICA
 * - LAVAGEM [fimUso + 1, fimUso + lavagemDiasDepois]         FISICA
 * - PROVA   [D − provaDiasAntes, inicioUsoPrevisto − 1]      PROVA (se válida)
 *
 * Overrides por datas reais:
 * - provaDataReal    → PROVA colapsa para [dia, dia].
 * - retiradaDataReal anterior ao início previsto → FISICA começa nela.
 * - devolucaoDataReal → USO termina nela; LAVAGEM = [dev+1, dev+lavagem].
 * - retiradaDataReal sem devolucaoDataReal → FISICA ABERTA [inicioUso, null];
 *   motivo ATRASO_DEVOLUCAO se hojeDia > fim previsto, senão USO.
 * - lavagemConcluidaEm (E152) → LAVAGEM termina nela; anterior ao início da
 *   lavagem = não houve lavagem, e a janela não existe.
 *
 * MANUTENCAO: janela única [dia(inicio), dia(fim)|null] FISICA (inicio
 * obrigatório — a rota valida com 400; aqui, sem inicio → sem janelas).
 */
/**
 * A janela de PROVA prevista para um casamento — `[D − provaDiasAntes,
 * D − usoDiasAntes − 1]`, ou `null` quando a regra não deixa dia nenhum
 * (`provaDiasAntes <= usoDiasAntes`: a peça já saiu para o uso).
 *
 * S-O97: ela era uma expressão dentro de `janelasDoBloqueio` e passou a ser
 * função porque ganhou um SEGUNDO leitor — a contagem das provas que ficam para
 * trás quando a reserva muda de data (`reservas.ts`). Extrair em vez de copiar é
 * a regra 26 na letra: duas cópias desta conta divergiriam no dia em que a loja
 * mexesse na regra, e a divergência apareceria como aviso que não aparece.
 *
 * **E240/S-O116 — e a segunda cópia existia mesmo assim, do outro lado da
 * rede** (`moscow-noivas/src/lib/prova-fora-da-janela.ts`), presa a esta só
 * pelos números escritos à mão nos dois testes. A conta saiu para o
 * `@workspace/agenda-core` (`janelaDeProvaDoDia`) e os dois lados a importam;
 * este nome fica porque três chamadores e os testes o conhecem.
 */
export function janelaDeProvaPrevista(
  dataCasamento: string,
  regra: RegraJanelas,
): { inicio: string; fim: string } | null {
  return janelaDeProvaDoDia(dataCasamento, regra);
}

export function janelasDoBloqueio(
  b: BloqueioJanelasInput,
  regra: RegraJanelas,
  hojeDia: string,
): Janela[] {
  const janelas = janelasSemOlharCancelamento(b, regra, hojeDia);
  /**
   * E225 — bloqueio CANCELADO só ocupa o que ocupa FISICAMENTE.
   *
   * Quem o deixa entrar aqui é o predicado de `buscarBloqueiosAtivos` (a peça
   * saiu e não voltou); o que este filtro tira é o resto: a janela de PROVA de
   * um contrato morto não agenda nada, e sem ela a noiva B seria barrada num
   * dia em que a peça está — fisicamente — livre para provar.
   */
  return b.canceladoEm ? janelas.filter((j) => j.classe === "FISICA") : janelas;
}

/**
 * S-C234 — a janela de PROVA PREVISTA de uma CANDIDATA não varre o passado.
 *
 * `janelaDeProvaPrevista` devolve `[D − provaDiasAntes, inícioDoUso − 1]` sem
 * olhar o calendário: com a régua default, reservar para daqui a 3 dias criava
 * uma prova `[hoje−11, hoje−1]` — inteira sobre dias em que nenhuma prova vai
 * acontecer — e a lavagem já TERMINADA de uma peça devolvida barrava com 409 a
 * reserva fisicamente possível (medido: 201 depois do corte, na cena do teste).
 *
 * O corte é cirúrgico de propósito:
 * - só classe PROVA — janela FÍSICA ocupa o que ocupa, no passado inclusive
 *   (a peça na rua continua barrando, e o teste prova);
 * - só a PREVISTA — quem chama guarda o corte atrás de `provaDataReal == null`,
 *   porque prova real é FATO e fato não se apara;
 * - só a CANDIDATA — as janelas dos bloqueios EXISTENTES não passam por aqui:
 *   aparar o outro lado mudaria contagem de conflito que ninguém pediu.
 * - `hojeDia` fica: prova ainda pode acontecer hoje.
 */
export function aparaProvaPrevistaNoPassado(janelas: Janela[], hojeDia: string): Janela[] {
  return janelas.flatMap((j) => {
    if (j.classe !== "PROVA") return [j];
    if (j.fim !== null && j.fim < hojeDia) return [];
    if (j.inicio < hojeDia) return [{ ...j, inicio: hojeDia }];
    return [j];
  });
}

function janelasSemOlharCancelamento(
  b: BloqueioJanelasInput,
  regra: RegraJanelas,
  hojeDia: string,
): Janela[] {
  if (b.tipo === "MANUTENCAO") {
    if (!b.inicio) return [];
    return [
      {
        inicio: diaLocal(b.inicio),
        fim: b.fim ? diaLocal(b.fim) : null,
        motivo: "MANUTENCAO",
        classe: "FISICA",
        bloqueioId: b.id,
      },
    ];
  }

  // RESERVA_CASAMENTO
  if (!b.casamentoData) return [];
  // S-O117: dia de NEGÓCIO, não instante. Lida em fuso da loja, a meia-noite
  // UTC que um cliente de API manda (`new Date("2028-09-05")`) devolvia
  // 2028-09-04, e as três janelas — prova, uso e lavagem — andavam um dia.
  const dataCasamento = diaDeNegocio(b.casamentoData);
  const inicioUsoPrevisto = addDias(dataCasamento, -regra.usoDiasAntes);
  const fimUsoPrevisto = addDias(dataCasamento, regra.usoDiasDepois);

  const janelas: Janela[] = [];

  // PROVA
  if (b.provaDataReal) {
    const diaProva = diaLocal(b.provaDataReal);
    janelas.push({
      inicio: diaProva,
      fim: diaProva,
      motivo: "PROVA",
      classe: "PROVA",
      bloqueioId: b.id,
    });
  } else {
    const prevista = janelaDeProvaPrevista(dataCasamento, regra);
    if (prevista) {
      janelas.push({
        inicio: prevista.inicio,
        fim: prevista.fim,
        motivo: "PROVA",
        classe: "PROVA",
        bloqueioId: b.id,
      });
    }
  }

  // FISICA (USO + LAVAGEM)
  let inicioUso = inicioUsoPrevisto;
  if (b.retiradaDataReal) {
    const diaRetirada = diaLocal(b.retiradaDataReal);
    if (diaRetirada < inicioUsoPrevisto) inicioUso = diaRetirada;
  }

  if (b.retiradaDataReal && !b.devolucaoDataReal) {
    // Vestido fora da loja sem devolução: janela física aberta.
    janelas.push({
      inicio: inicioUso,
      fim: null,
      motivo: hojeDia > fimUsoPrevisto ? "ATRASO_DEVOLUCAO" : "USO",
      classe: "FISICA",
      bloqueioId: b.id,
    });
    return janelas;
  }

  const fimUso = b.devolucaoDataReal ? diaLocal(b.devolucaoDataReal) : fimUsoPrevisto;
  janelas.push({
    inicio: inicioUso,
    fim: fimUso,
    motivo: "USO",
    classe: "FISICA",
    bloqueioId: b.id,
  });

  /**
   * E152 — a lavagem termina quando a peça VOLTA, não quando a soma diz.
   *
   * `lavagemConcluidaEm` encurta a janela exatamente como `devolucaoDataReal`
   * encurta o USO, e é a última assimetria do ciclo: retirada e devolução
   * tinham data real, a lavagem não tinha nenhuma — a peça voltava da
   * lavanderia na quarta e continuava presa até domingo.
   *
   * Quando a volta é anterior ao início da lavagem, não há janela nenhuma a
   * criar: é o caso de "não houve lavagem" (a peça saiu e voltou limpa, ou a
   * dona lavou na hora). Criar uma janela invertida seria pior que nenhuma.
   *
   * Colapsar janela só REDUZ ocupação, nunca cria conflito — a mesma razão que
   * o código já dá para a prova (`routes/agenda.ts`) —, então não há
   * revalidação a fazer em cima disto.
   */
  if (regra.lavagemDiasDepois > 0) {
    const inicioLavagem = addDias(fimUso, 1);
    const fimPrevisto = addDias(fimUso, regra.lavagemDiasDepois);
    const voltou = b.lavagemConcluidaEm ? diaLocal(b.lavagemConcluidaEm) : null;
    const fimLavagem = voltou && voltou < fimPrevisto ? voltou : fimPrevisto;
    if (!voltou || inicioLavagem <= fimLavagem) {
      janelas.push({
        inicio: inicioLavagem,
        fim: fimLavagem,
        motivo: "LAVAGEM",
        classe: "FISICA",
        bloqueioId: b.id,
      });
    }
  }

  return janelas;
}

/** Sobreposição de intervalos inclusivos (fim null = aberto). Encostadas NÃO sobrepõem. */
function sobrepoem(a: Janela, b: Janela): boolean {
  const aDentroDeB = b.fim === null || a.inicio <= b.fim;
  const bDentroDeA = a.fim === null || b.inicio <= a.fim;
  return aDentroDeB && bDentroDeA;
}

/**
 * Pares (nova, existente) que sobrepõem E têm pelo menos uma janela FISICA.
 */
export function conflitos(novas: Janela[], existentes: Janela[]): Conflito[] {
  const resultado: Conflito[] = [];
  for (const nova of novas) {
    for (const existente of existentes) {
      const algumaFisica = nova.classe === "FISICA" || existente.classe === "FISICA";
      if (algumaFisica && sobrepoem(nova, existente)) {
        resultado.push({ nova, existente });
      }
    }
  }
  return resultado;
}

/**
 * Envelope FÍSICO do bloqueio (para as colunas ocupacao_inicio/ocupacao_fim).
 * null = bloqueio sem janela física (ex.: MANUTENCAO sem inicio).
 * fim null = envelope aberto (retirada sem devolução).
 *
 * O envelope não depende de "hoje" (só o MOTIVO da janela aberta depende).
 */
export function ocupacaoFisica(
  b: BloqueioJanelasInput,
  regra: RegraJanelas,
): { inicio: string; fim: string | null } | null {
  const fisicas = janelasDoBloqueio(b, regra, "1970-01-01").filter(
    (j) => j.classe === "FISICA",
  );
  if (fisicas.length === 0) return null;

  let inicio = fisicas[0].inicio;
  let fim: string | null = fisicas[0].fim;
  for (const j of fisicas.slice(1)) {
    if (j.inicio < inicio) inicio = j.inicio;
    if (fim !== null && (j.fim === null || j.fim > fim)) fim = j.fim;
  }
  return { inicio, fim };
}

/**
 * Primeiro dia local >= `aPartirDe` em que uma RESERVA_CASAMENTO nova passaria
 * sem conflito (E9). Simula a vendedora "tentando data por data": monta o
 * candidato de cada dia com `janelasDoBloqueio` e testa com `conflitos` — a
 * MESMA régua da escrita, nunca uma cópia que diverge. Inclui a janela de
 * prova do candidato: dia que passaria aqui é dia que o POST aceitaria.
 * Retorna null se nada livre dentro do horizonte (ex.: janela física aberta
 * por retirada sem devolução bloqueia tudo à frente).
 */
export function proximaDataLivre(params: {
  janelasExistentes: Janela[];
  regra: RegraJanelas;
  aPartirDe: string;
  horizonteDias?: number;
}): string | null {
  const horizonte = params.horizonteDias ?? 365;
  for (let i = 0; i < horizonte; i++) {
    const dia = addDias(params.aPartirDe, i);
    const candidato: BloqueioJanelasInput = {
      id: "candidato-proxima-janela",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: inicioDoDia(dia),
      provaDataReal: null,
      retiradaDataReal: null,
      devolucaoDataReal: null,
      lavagemConcluidaEm: null,
      inicio: null,
      fim: null,
    };
    // S-C234 — a candidata da sugestão nunca tem prova real, e a prevista não
    // varre o passado: sem o corte, uma lavagem terminada ontem empurrava a
    // proposta 11 dias (medido: '2027-06-29' onde '2027-06-18' está livre).
    const novas = aparaProvaPrevistaNoPassado(
      janelasDoBloqueio(candidato, params.regra, params.aPartirDe),
      params.aPartirDe,
    );
    if (conflitos(novas, params.janelasExistentes).length === 0) return dia;
  }
  return null;
}

// ───────────────────────── Orquestração (IO) ─────────────────────────

/** Regra efetiva da loja (fallback REGRA_DEFAULT). */
export async function buscarRegra(
  lojaId: string,
  executor: DbExecutor = db,
): Promise<RegraJanelas> {
  const [regra] = await executor
    .select({
      provaDiasAntes: regraDisponibilidadeTable.provaDiasAntes,
      usoDiasAntes: regraDisponibilidadeTable.usoDiasAntes,
      usoDiasDepois: regraDisponibilidadeTable.usoDiasDepois,
      lavagemDiasDepois: regraDisponibilidadeTable.lavagemDiasDepois,
      estoqueLavagemDiasDepois: regraDisponibilidadeTable.estoqueLavagemDiasDepois,
    })
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  return regra ?? REGRA_DEFAULT;
}

export interface BloqueioAtivoComContexto {
  bloqueio: BloqueioVestido;
  noivaNome: string | null;
}

/**
 * Bloqueios que OCUPAM a peça, com noivaNome do lead para mensagens.
 * `vestidoId` opcional: ausente = todos os vestidos da loja (endpoint batch).
 *
 * Ocupar tem duas formas, e a segunda é o E225 (S-C110):
 *
 * 1. **Vivo** — `cancelado_em IS NULL` e reserva vinculada, se houver, com
 *    status <> CANCELADA. Era a definição inteira até o E225.
 * 2. **Na rua** — retirada real sem devolução real, **cancelado ou não**.
 *    Cancelar o contrato soft-cancela o bloqueio, e com a definição antiga a
 *    peça voltava ao acervo enquanto estava NA CASA DA NOIVA: outra noiva a
 *    reservava para a mesma data, e a dupla promessa só aparecia na retirada
 *    (classe da S-M7/S-M24, pelo caminho do cancelamento de contrato). É o
 *    predicado da S-C85 aplicado à disponibilidade: **quem discrimina é
 *    `retiradaDataReal`** — cancelar é gesto administrativo e não traz o
 *    vestido de volta. Registrada a devolução, o braço 2 solta sozinho.
 */
export async function buscarBloqueiosAtivos(
  params: {
    lojaId: string;
    vestidoId?: string;
    ignorarBloqueioId?: string;
    /** "Hoje" injetado (a régua do E211); ausente, o agora real. */
    hoje?: Date;
  },
  executor: DbExecutor = db,
): Promise<BloqueioAtivoComContexto[]> {
  const hoje = params.hoje ?? new Date();
  const filtros: SQL[] = [eq(bloqueioVestidosTable.lojaId, params.lojaId)];
  if (params.vestidoId) {
    filtros.push(eq(bloqueioVestidosTable.vestidoId, params.vestidoId));
  }
  if (params.ignorarBloqueioId) {
    filtros.push(ne(bloqueioVestidosTable.id, params.ignorarBloqueioId));
  }
  /**
   * E228/S-C60 — o órfão VENCIDO não ocupa. Órfão é RESERVA_CASAMENTO sem as
   * duas âncoras de dona; vencido é mais velho que a validade decidida. A
   * exceção dentro da exceção é física, e é o braço "na rua" lá embaixo: o
   * órfão que já SAIU não expira — prazo administrativo não traz vestido de
   * volta, que é a mesma frase da S-C85 e do E225.
   */
  const orfaoVencido = and(
    eq(bloqueioVestidosTable.tipo, "RESERVA_CASAMENTO"),
    isNull(bloqueioVestidosTable.leadId),
    isNull(bloqueioVestidosTable.reservaId),
    lt(
      bloqueioVestidosTable.createdAt,
      new Date(hoje.getTime() - VALIDADE_DO_BLOQUEIO_ORFAO_DIAS * MS_POR_DIA),
    ),
  );
  const vivo = and(
    isNull(bloqueioVestidosTable.canceladoEm),
    or(isNull(bloqueioVestidosTable.reservaId), ne(reservasTable.status, "CANCELADA")),
    not(orfaoVencido!),
  );
  // E228/S-C233 — a decisão da dona: a peça devolvida também ocupa a cauda de
  // lavagem, cancelada ou não. A pré-peneira usa o teto folgado; a ocupação
  // real é das janelas, com a regra da loja.
  const naRua = and(
    isNotNull(bloqueioVestidosTable.retiradaDataReal),
    or(
      isNull(bloqueioVestidosTable.devolucaoDataReal),
      gte(
        bloqueioVestidosTable.devolucaoDataReal,
        new Date(hoje.getTime() - TETO_DA_CAUDA_DE_LAVAGEM_DIAS * MS_POR_DIA),
      ),
    ),
  );
  const ocupa = or(vivo, naRua);
  if (ocupa) filtros.push(ocupa);

  const linhas = await executor
    .select({
      bloqueio: bloqueioVestidosTable,
      noivaNome: leadsTable.noivaNome,
    })
    .from(bloqueioVestidosTable)
    .leftJoin(reservasTable, eq(reservasTable.id, bloqueioVestidosTable.reservaId))
    .leftJoin(leadsTable, eq(leadsTable.id, bloqueioVestidosTable.leadId))
    .where(and(...filtros));

  return linhas;
}

/**
 * Converte pares de conflito em itens do payload 409, deduplicados por
 * (bloqueioId, motivo, inicio) — um candidato com várias janelas pode bater
 * na mesma janela existente mais de uma vez.
 */
export function detalharConflitos(
  pares: Conflito[],
  contexto: Map<string, BloqueioAtivoComContexto>,
): ConflitoDetalhe[] {
  const vistos = new Set<string>();
  const detalhes: ConflitoDetalhe[] = [];
  for (const { existente } of pares) {
    const chave = `${existente.bloqueioId}|${existente.motivo}|${existente.inicio}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const ctx = contexto.get(existente.bloqueioId);
    detalhes.push({
      bloqueioId: existente.bloqueioId,
      tipo: ctx?.bloqueio.tipo ?? "RESERVA_CASAMENTO",
      motivo: existente.motivo,
      inicio: existente.inicio,
      fim: existente.fim,
      leadId: ctx?.bloqueio.leadId ?? null,
      reservaId: ctx?.bloqueio.reservaId ?? null,
      noivaNome: ctx?.noivaNome ?? null,
    });
  }
  return detalhes;
}

export interface VerificarDisponibilidadeParams {
  lojaId: string;
  vestidoId: string;
  /** Bloqueio candidato (novo ou editado) — campos de data + tipo. */
  candidato: BloqueioJanelasInput;
  /** Ao revalidar um bloqueio existente, exclui ele mesmo da checagem. */
  ignorarBloqueioId?: string;
  /** "Hoje" injetado (nunca derivado internamente). */
  hoje: Date;
  executor?: DbExecutor;
}

/**
 * Verifica se o bloqueio candidato conflita com os bloqueios ativos do
 * vestido. Exatamente 2 queries: regra (com fallback) e bloqueios ativos
 * (status da reserva + noivaNome via LEFT JOIN).
 */
export async function verificarDisponibilidade(
  params: VerificarDisponibilidadeParams,
): Promise<ResultadoDisponibilidade> {
  const executor = params.executor ?? db;
  const hojeDia = diaLocal(params.hoje);

  const regra = await buscarRegra(params.lojaId, executor);
  const ativos = await buscarBloqueiosAtivos(
    {
      lojaId: params.lojaId,
      vestidoId: params.vestidoId,
      ignorarBloqueioId: params.ignorarBloqueioId,
    },
    executor,
  );

  // S-C234 — a prova PREVISTA da candidata é aparada em `hojeDia`; a real é
  // fato e passa inteira (a guarda do `provaDataReal` é daqui de propósito:
  // `aparaProvaPrevistaNoPassado` não sabe distinguir e não deve).
  const janelasCandidatoCruas = janelasDoBloqueio(params.candidato, regra, hojeDia);
  const janelasCandidato = params.candidato.provaDataReal
    ? janelasCandidatoCruas
    : aparaProvaPrevistaNoPassado(janelasCandidatoCruas, hojeDia);
  const janelasExistentes = ativos.flatMap(({ bloqueio }) =>
    janelasDoBloqueio(bloqueio, regra, hojeDia),
  );

  const pares = conflitos(janelasCandidato, janelasExistentes);
  const contexto = new Map(ativos.map((a) => [a.bloqueio.id, a]));
  const detalhes = detalharConflitos(pares, contexto);

  return { disponivel: detalhes.length === 0, conflitos: detalhes, regra };
}
