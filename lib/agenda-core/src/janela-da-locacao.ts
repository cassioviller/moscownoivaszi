import { addDias } from "@workspace/financeiro-core";
import {
  proximoDiaDeExpedienteDeRetirada,
  type ExpedienteDeRetirada,
} from "./expediente-retirada";

/**
 * E249/S-R2 — **os dias que o papel imprime, num lugar só.**
 *
 * O E224 escreveu esta conta na TELA (`moscow-noivas/src/lib/retirada-devolucao.ts`)
 * porque só a tela precisava dela: era ela que sugeria à vendedora as datas da
 * 5ª no fecho do contrato. Ninguém mais precisava — até que o E244 pôs
 * `contratos.data_devolucao` no comando da 16ª e o SERVIDOR passou a ter de
 * saber recalcular esses dias sozinho, quando o casamento é adiado.
 *
 * A conta é a mesma, e é a do E224:
 *
 * > A **hora** vem da 5ª; o **dia** vem da janela de uso da reserva
 * > (`casamento − usoDiasAntes` a `casamento + usoDiasDepois`), andando para a
 * > FRENTE até um dia de expediente da 4ª.
 *
 * Ela mora aqui, e não na tela, pela razão do E240/S-O116: duas grafias da
 * mesma conta em dois pacotes ficam presas uma à outra pelos números escritos
 * à mão nos dois testes, e não por uma régua. A tela acrescenta o formato do
 * `<input>` e o aviso; o servidor acrescenta a hora e o fuso.
 *
 * **Por que andar para a FRENTE, e por que isto importa quando a data muda:**
 * medido no E224 sobre o `heliumdb`, com a régua de fábrica (3 antes · 2
 * depois), **67 de 127 reservas (53%)** tinham pelo menos uma das duas pontas
 * caindo em domingo ou segunda, que a 4ª fecha. Adiar um casamento de sábado
 * para domingo, e simplesmente somar à data velha os dias que o casamento
 * andou, entregaria uma devolução em dia fechado — o valor que a própria porta
 * do E222 recusa com 422.
 */
export type RegraDaJanelaDeLocacao = {
  usoDiasAntes: number;
  usoDiasDepois: number;
};

export type DiasDaLocacao = {
  /** As pontas CRUAS da janela de uso — o que a reserva segura. */
  janela: { inicio: string; fim: string };
  /** O dia da retirada, já andado até dia de expediente. */
  retirada: string;
  /** O dia da devolução, já andado até dia de expediente. */
  devolucao: string;
  /** Alguma das duas pontas teve de andar por dia fechado. */
  andou: boolean;
};

/**
 * Os dois dias da locação para este casamento, ou `null` quando não há o que
 * dizer.
 *
 * `null` tem uma causa só, e ela é real: **a semana inteira fechada**
 * (`exp.dias` vazio, ou nenhum dos 7 dias seguintes aberto). Inventar um dia
 * ali entregaria à vendedora um valor que a porta recusa.
 *
 * `casamentoDia` é um dia civil `AAAA-MM-DD` — nunca um instante, porque
 * `casamentoData` é data de NEGÓCIO (S-O117), e quem chama já a converteu.
 */
export function diasDaLocacaoSugeridos(
  casamentoDia: string,
  regra: RegraDaJanelaDeLocacao,
  exp: ExpedienteDeRetirada,
): DiasDaLocacao | null {
  const inicioDaJanela = addDias(casamentoDia, -regra.usoDiasAntes);
  const fimDaJanela = addDias(casamentoDia, regra.usoDiasDepois);
  const retirada = proximoDiaDeExpedienteDeRetirada(inicioDaJanela, exp);
  const devolucao = proximoDiaDeExpedienteDeRetirada(fimDaJanela, exp);
  if (!retirada || !devolucao) return null;
  return {
    janela: { inicio: inicioDaJanela, fim: fimDaJanela },
    retirada,
    devolucao,
    andou: retirada !== inicioDaJanela || devolucao !== fimDaJanela,
  };
}
