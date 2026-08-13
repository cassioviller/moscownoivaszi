import { diaDaSemanaLocal, horaLocal } from "./slots";

/**
 * **O segundo expediente do ateliê** — E222, cláusulas 4ª e 5ª do instrumento de
 * locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **4ª** — O horário de funcionamento da LOCADORA é de **terça a sexta, das
 * > 10:30 às 19:00**, e aos **sábados das 10:30 às 18:00**.
 *
 * > **5ª** — A locação tem início às **10:30** do dia da retirada e término às
 * > **18:00** do dia da devolução.
 *
 * ## Por que existe um segundo expediente, e não uma correção do primeiro
 *
 * O horário que o sistema já tinha (`atendimentoAberturaHora`,
 * `atendimentoFechamentoHora`, `diasFuncionamento`) governa **ATENDIMENTO** — as
 * provas. Ele é sete dias até as 20h, veio do caderno de papel (S-A8: **7
 * compromissos em 5 domingos**, provas às 18:30) e está **certo para provas**.
 *
 * A cláusula 4ª governa **RETIRADA e DEVOLUÇÃO**, que é outro expediente. Um
 * ateliê que prova aos domingos e só entrega de terça a sábado é perfeitamente
 * coerente: **o modelo é que tinha um calendário onde o negócio tem dois.**
 *
 * A primeira versão da auditoria listou a 4ª como *colisão* entre papel e
 * sistema, e o erro foi de leitura — está registrado em `B-auditoria.md`. Não
 * era contradição: era **ausência**.
 *
 * ## O fechamento é INCLUSIVO aqui, e EXCLUSIVO na agenda
 *
 * `slotsDoDia` recusa o instante do fechamento: às 19h a loja fecha, e uma prova
 * que começasse ali não caberia — **prova tem duração**. Retirar ou devolver uma
 * peça é um ATO, não uma janela: a 4ª descreve o intervalo em que a loja está
 * aberta, e às 19:00 em ponto ela ainda está. As duas réguas divergem de
 * propósito, e é por isso que esta linha está escrita.
 */

/** 4ª — os dias em que a loja retira e devolve: 2=terça … 6=sábado. */
export const RETIRADA_DIAS_PADRAO = [2, 3, 4, 5, 6] as const;

/** 4ª — a abertura, em minutos desde a meia-noite. 630 = 10:30. */
export const RETIRADA_ABERTURA_PADRAO = 630;

/** 4ª — o fechamento de terça a sexta. 1140 = 19:00. */
export const RETIRADA_FECHAMENTO_PADRAO = 1140;

/**
 * 4ª — o fechamento do SÁBADO, que o contrato dá separado. 1080 = 18:00.
 *
 * É coluna própria porque o instrumento trata o sábado como dia de expediente
 * mais curto, e não como exceção de calendário: colapsar os dois num só número
 * escolheria entre recusar retirada às 18:30 numa quarta (que o contrato
 * permite) ou aceitá-la no sábado (que ele não permite).
 */
export const RETIRADA_FECHAMENTO_SABADO_PADRAO = 1080;

/** 5ª — a hora em que a locação COMEÇA, sugerida à vendedora. 630 = 10:30. */
export const LOCACAO_INICIO_PADRAO = 630;

/** 5ª — a hora em que a locação TERMINA, sugerida à vendedora. 1080 = 18:00. */
export const LOCACAO_FIM_PADRAO = 1080;

export type ExpedienteDeRetirada = {
  /** 0=domingo … 6=sábado. */
  dias: readonly number[];
  aberturaMinutos: number;
  fechamentoMinutos: number;
  /** O sábado fecha antes; ver a constante. */
  fechamentoSabadoMinutos: number;
};

export const EXPEDIENTE_DE_RETIRADA_PADRAO: ExpedienteDeRetirada = {
  dias: RETIRADA_DIAS_PADRAO,
  aberturaMinutos: RETIRADA_ABERTURA_PADRAO,
  fechamentoMinutos: RETIRADA_FECHAMENTO_PADRAO,
  fechamentoSabadoMinutos: RETIRADA_FECHAMENTO_SABADO_PADRAO,
};

/**
 * O expediente EFETIVO de uma loja, com o do contrato como piso.
 *
 * Loja sem linha de regra (a que nunca abriu Configurações) recebe o do papel —
 * que é a mesma escolha do `EXPEDIENTE_PADRAO` do atendimento, e pela mesma
 * razão: régua ausente não pode virar régua que aceita tudo.
 */
export function expedienteDeRetirada(
  regra: {
    retiradaDias?: number[] | null;
    retiradaAberturaMinutos?: number | null;
    retiradaFechamentoMinutos?: number | null;
    retiradaFechamentoSabadoMinutos?: number | null;
  } | null | undefined,
): ExpedienteDeRetirada {
  return {
    dias: regra?.retiradaDias ?? EXPEDIENTE_DE_RETIRADA_PADRAO.dias,
    aberturaMinutos: regra?.retiradaAberturaMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.aberturaMinutos,
    fechamentoMinutos:
      regra?.retiradaFechamentoMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoMinutos,
    fechamentoSabadoMinutos:
      regra?.retiradaFechamentoSabadoMinutos ??
      EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoSabadoMinutos,
  };
}

const DIA_ROTULO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Minutos desde a meia-noite → `"HH:MM"`.
 *
 * Exportada porque a TELA precisa da mesma conversão para desenhar o campo de
 * hora, e duas grafias divergiriam no dia em que uma delas ganhasse segundos —
 * é a lição do E187 (cinco grafias da mesma conta de desconto, duas errando).
 */
export function minutosParaHHMM(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** `"HH:MM"` → minutos desde a meia-noite, ou `null` quando não é hora. */
export function hhmmParaMinutos(valor: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

const hhmm = minutosParaHHMM;

/** O fechamento DAQUELE dia: o sábado tem o seu. */
export function fechamentoDoDia(dia: number, exp: ExpedienteDeRetirada): number {
  return dia === 6 ? exp.fechamentoSabadoMinutos : exp.fechamentoMinutos;
}

/**
 * **O expediente escrito por extenso** — é ele que o recado da recusa cita.
 *
 * A porta não devolve código: quem lê é a vendedora com a noiva na frente, e
 * *"FORA_DO_EXPEDIENTE"* não diz a que horas voltar. É a mesma escolha do E211
 * (o preço antes do clique) e do E166 (a proposta vencida diz o caminho, não um
 * erro mudo).
 */
export function descricaoDoExpedienteDeRetirada(exp: ExpedienteDeRetirada): string {
  const dias = [...exp.dias].sort((a, b) => a - b);
  if (dias.length === 0) return "a loja não retira nem devolve em nenhum dia da semana";
  const semSabado = dias.filter((d) => d !== 6);
  const partes: string[] = [];
  if (semSabado.length > 0) {
    const faixa =
      semSabado.length > 1 && semSabado[semSabado.length - 1]! - semSabado[0]! === semSabado.length - 1
        ? `${DIA_ROTULO[semSabado[0]!]} a ${DIA_ROTULO[semSabado[semSabado.length - 1]!]}`
        : semSabado.map((d) => DIA_ROTULO[d]).join(", ");
    partes.push(`${faixa}, das ${hhmm(exp.aberturaMinutos)} às ${hhmm(exp.fechamentoMinutos)}`);
  }
  if (dias.includes(6)) {
    partes.push(`sábado, das ${hhmm(exp.aberturaMinutos)} às ${hhmm(exp.fechamentoSabadoMinutos)}`);
  }
  return partes.join("; ");
}

export type ForaDoExpediente = {
  motivo: "DIA_FECHADO" | "FORA_DA_HORA";
  /** A frase que a vendedora lê, com o dia e a hora que ela tentou. */
  detalhe: string;
};

/**
 * A recusa da 4ª, ou `null` quando o instante cabe no expediente.
 *
 * `null` para instante ausente é a resposta certa e não um descuido: retirada e
 * devolução são **opcionais** no contrato (723 contratos no banco, **1** com
 * data de retirada, medido no E222), e uma régua que exigisse a data recusaria
 * o fecho de contrato que sempre funcionou.
 */
export function foraDoExpedienteDeRetirada(
  instante: Date | string | null | undefined,
  exp: ExpedienteDeRetirada,
): ForaDoExpediente | null {
  if (instante === null || instante === undefined) return null;
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return null;

  const dia = diaDaSemanaLocal(d);
  const { hora, minuto } = horaLocal(d);
  const minutos = hora * 60 + minuto;

  if (!exp.dias.includes(dia)) {
    return {
      motivo: "DIA_FECHADO",
      detalhe: `A loja não retira nem devolve ${DIA_ROTULO[dia] === "domingo" || DIA_ROTULO[dia] === "sábado" ? "no" : "na"} ${DIA_ROTULO[dia]}.`,
    };
  }
  const fechamento = fechamentoDoDia(dia, exp);
  // Inclusivo nas duas pontas; a razão está na nota do módulo.
  if (minutos < exp.aberturaMinutos || minutos > fechamento) {
    return {
      motivo: "FORA_DA_HORA",
      detalhe: `${hhmm(minutos)} está fora do expediente de ${DIA_ROTULO[dia]} (${hhmm(exp.aberturaMinutos)} às ${hhmm(fechamento)}).`,
    };
  }
  return null;
}
