import { db, regraDisponibilidadeTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  descricaoDoExpedienteDeRetirada,
  diasDaLocacaoSugeridos,
  expedienteDeRetirada,
  foraDoExpedienteDeRetirada,
  fraseDaRecusaDeRetirada,
  horaLocal,
  LOCACAO_FIM_PADRAO,
  LOCACAO_INICIO_PADRAO,
  minutosParaHHMM,
  type ExpedienteDeRetirada,
} from "@workspace/agenda-core";
import { REGRA_DEFAULT, type DbExecutor } from "./disponibilidade";

/**
 * **A guarda da cláusula 4ª, num lugar só** — E222.
 *
 * Duas portas gravam `dataRetirada` e `dataDevolucao` (o `POST /contratos` que
 * fecha e o `PATCH /contratos/:id` que corrige), e as duas passam por aqui. A
 * conta é a mesma do módulo puro (`@workspace/agenda-core`); o que este arquivo
 * acrescenta é a leitura da regra da loja e o **formato do recado**.
 *
 * O recado cita o expediente por extenso, e não um código: quem lê é a vendedora
 * com a noiva na frente, e *"FORA_DO_EXPEDIENTE"* não diz a que horas voltar.
 */

export type RecusaDeExpediente = {
  error: "RETIRADA_FORA_DO_EXPEDIENTE" | "DEVOLUCAO_FORA_DO_EXPEDIENTE";
  detalhe: string;
  campos: { campo: string; motivo: string }[];
};

/**
 * A recusa da 4ª para este par de datas, ou `null` quando as duas cabem.
 *
 * **Nada é obrigatório aqui**, e é decisão medida: 723 contratos no banco, **1**
 * com data de retirada e **nenhum** com data de devolução (E222). Uma régua que
 * exigisse as datas recusaria o fecho de contrato que sempre funcionou — a
 * cláusula diz a que horas a loja abre, não que toda locação tenha de declarar a
 * hora.
 */
export async function recusaDeExpedienteDeRetirada(
  lojaId: string,
  datas: { dataRetirada?: Date | string | null; dataDevolucao?: Date | string | null },
): Promise<RecusaDeExpediente | null> {
  if (
    (datas.dataRetirada === null || datas.dataRetirada === undefined) &&
    (datas.dataDevolucao === null || datas.dataDevolucao === undefined)
  ) {
    return null;
  }

  const [regra] = await db
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  const exp = expedienteDeRetirada(regra);
  const expediente = descricaoDoExpedienteDeRetirada(exp);

  const retirada = foraDoExpedienteDeRetirada(datas.dataRetirada, exp);
  if (retirada) {
    return {
      error: "RETIRADA_FORA_DO_EXPEDIENTE",
      // E224: a frase saiu daqui para o módulo puro, que a TELA também importa.
      detalhe: fraseDaRecusaDeRetirada(retirada, exp),
      campos: [{ campo: "dataRetirada", motivo: `Expediente de retirada: ${expediente}` }],
    };
  }
  const devolucao = foraDoExpedienteDeRetirada(datas.dataDevolucao, exp);
  if (devolucao) {
    return {
      error: "DEVOLUCAO_FORA_DO_EXPEDIENTE",
      detalhe: fraseDaRecusaDeRetirada(devolucao, exp),
      campos: [{ campo: "dataDevolucao", motivo: `Expediente de retirada: ${expediente}` }],
    };
  }
  return null;
}

/**
 * **E249/S-R2 — o casamento andou, e o papel anda com ele.**
 *
 * O E244 pôs `contratos.data_devolucao` no comando da 16ª: é ela que decide
 * até quando a peça pode estar fora sem atraso. Ninguém a movia quando a noiva
 * adiava o casamento — o `PATCH /reservas/:id` movia `bloqueio.casamentoData`
 * e `contratos.dataCasamento` (S-O4/R6) e deixava as duas datas do papel onde
 * estavam.
 *
 * **O número que isso custava:** casamento 12/09, devolução impressa 15/09,
 * casamento adiado para 12/12, peça devolvida em 14/12 — em dia pela janela
 * nova. `diasDeAtraso('2026-09-15', '2026-12-14') = 90`, e 90 ≥ 10 é EXTRAVIO
 * pela 16ª §2º: **4 peças × R$ 3.000,00 = R$ 12.000,00** oferecidos pela fila
 * de atrasos e cobráveis pela porta, sobre uma noiva que devolveu no prazo.
 * Antes do E244 a mesma cena dava R$ 0,00.
 *
 * ## As duas decisões que esta função toma
 *
 * **1. O DIA recalcula pela janela nova** — a mesma conta que sugeriu as datas
 * no fecho do contrato (`diasDaLocacaoSugeridos`, E224: a janela de uso andando
 * para a frente até dia de expediente da 4ª). A alternativa — somar às datas
 * velhas os dias que o casamento andou — cai em dia fechado sempre que o
 * casamento muda de dia da semana, que é exatamente o que o E224 existe para
 * evitar (67 de 127 reservas, 53%, tinham uma ponta em domingo ou segunda).
 *
 * **2. A HORA é preservada, e só cede quando a 4ª a recusa.** A hora foi
 * escolhida por alguém — a 5ª dá 10:30 e 18:00 como padrão, não como regra —, e
 * mudar a data não é motivo para desfazer a combinação. Mas o sábado fecha às
 * 18:00 e a terça às 19:00: uma retirada às 18:30 que era terça e vira sábado
 * gravaria o valor que a porta do E222 recusa com 422. Nesse caso, e só nele,
 * a hora volta ao padrão da 5ª.
 *
 * **Data que não existe não nasce aqui**: campo `null` continua `null`. O papel
 * que não foi impresso não passa a existir porque a noiva mudou de data — os
 * dois campos são opcionais por decisão medida (E222).
 */
export type PapelDoCasamentoNovo = {
  /**
   * As datas do papel deste contrato, para o casamento novo. `null` em cada
   * campo que já era `null`.
   */
  datasDe(atuais: { dataRetirada: Date | null; dataDevolucao: Date | null }): {
    dataRetirada: Date | null;
    dataDevolucao: Date | null;
  };
  /** Os dois DIAS novos, para a trilha dizer para onde o papel foi. */
  dias: { retirada: string; devolucao: string };
};

/**
 * A régua da loja lida UMA vez, para os N contratos da reserva que se moveu.
 *
 * Ler por contrato seria a S-C280 de volta — a consulta por linha que o E244
 * teve de desfazer na fila de atrasos. Uma reserva costuma ter um contrato, e
 * é justamente por isso que a segunda leitura passaria despercebida até o dia
 * em que não passa.
 *
 * `null` quando a semana inteira da 4ª está fechada: não há dia para onde
 * mover, e inventar um seria gravar o que a porta do E222 recusa com 422. As
 * datas ficam como estão, e o defeito que sobra é o de hoje — não um pior.
 */
export async function papelParaOCasamentoNovo(
  lojaId: string,
  casamentoDia: string,
  executor: DbExecutor = db,
): Promise<PapelDoCasamentoNovo | null> {
  const [regra] = await executor
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  const exp = expedienteDeRetirada(regra);
  const dias = diasDaLocacaoSugeridos(
    casamentoDia,
    {
      usoDiasAntes: regra?.usoDiasAntes ?? REGRA_DEFAULT.usoDiasAntes,
      usoDiasDepois: regra?.usoDiasDepois ?? REGRA_DEFAULT.usoDiasDepois,
    },
    exp,
  );
  if (!dias) return null;

  return {
    dias: { retirada: dias.retirada, devolucao: dias.devolucao },
    datasDe: (atuais) => ({
      dataRetirada: comADataNova(atuais.dataRetirada, dias.retirada, LOCACAO_INICIO_PADRAO, exp),
      dataDevolucao: comADataNova(atuais.dataDevolucao, dias.devolucao, LOCACAO_FIM_PADRAO, exp),
    }),
  };
}

/**
 * O mesmo instante, no dia novo — com a hora de origem, ou a da 5ª quando a 4ª
 * recusaria aquela hora naquele dia.
 *
 * O `-03:00` é explícito: São Paulo é -03:00 fixo desde 17/02/2019, e a
 * varredura de equivalência da S35 percorreu 30.750 instantes para escrever
 * essa fronteira. Montar sem fuso valeria o relógio de quem roda o servidor.
 */
function comADataNova(
  atual: Date | null,
  diaNovo: string,
  minutosDaClausula: number,
  exp: ExpedienteDeRetirada,
): Date | null {
  if (atual === null) return null;
  const { hora, minuto } = horaLocal(atual);
  const comAHoraDeOrigem = new Date(`${diaNovo}T${minutosParaHHMM(hora * 60 + minuto)}:00-03:00`);
  if (!foraDoExpedienteDeRetirada(comAHoraDeOrigem, exp)) return comAHoraDeOrigem;
  return new Date(`${diaNovo}T${minutosParaHHMM(minutosDaClausula)}:00-03:00`);
}

/**
 * E220 — o expediente da loja POR EXTENSO, para a cláusula 4ª do instrumento
 * impresso. A mesma leitura da guarda acima (a regra da loja, com o padrão do
 * papel como piso), a mesma frase que a recusa cita — o papel e a porta dizem
 * o mesmo horário porque leem a mesma linha.
 */
export async function expedienteDeRetiradaPorExtenso(lojaId: string): Promise<string> {
  const [regra] = await db
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  return descricaoDoExpedienteDeRetirada(expedienteDeRetirada(regra));
}
