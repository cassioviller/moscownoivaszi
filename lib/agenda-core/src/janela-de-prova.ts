import { addDias } from "@workspace/financeiro-core";

/**
 * E240/S-O116 — **a janela de prova era escrita DUAS vezes, e nada comparava
 * as duas.**
 *
 * `api-server/src/lib/disponibilidade.ts:janelaDeProvaPrevista` (servidor,
 * extraída no E193 porque ganhou um segundo leitor) e
 * `moscow-noivas/src/lib/prova-fora-da-janela.ts:janelaDeProva` (tela, porque
 * o servidor não manda a janela mastigada) faziam a mesma conta em dois
 * pacotes, presas pelos MESMOS números escritos à mão nos dois testes —
 * casamento 05/09, prova 26/08, janela 22/08–01/09 — e não por uma régua.
 *
 * Medido em 15/08, antes de unir: as duas concordam em toda entrada que já é
 * DIA (`AAAA-MM-DD`), e **divergem em um dia** quando o casamento chega como
 * INSTANTE à meia-noite UTC — a tela fazia `diaLocal(casamento)` sobre uma
 * data de NEGÓCIO, e `2028-09-05T00:00:00Z` é 04/09 em São Paulo (a S-O117
 * do E197, na régua da tela): servidor `22/08–01/09`, tela `21/08–31/08`.
 * População no banco: zero linhas desancoradas desde o E197, então estava
 * armado, não disparado.
 *
 * Agora há UMA conta, aqui, sobre DIAS: `[D − provaDiasAntes,
 * D − usoDiasAntes − 1]`, inclusiva nas duas pontas, `null` quando a régua não
 * deixa dia nenhum (a S-A23). Os dois lados importam daqui; o que cada um
 * acrescenta é só a conversão para dia — e a da tela passou a ser
 * `diaDeNegocio`, a mesma do servidor.
 *
 * Mora no `agenda-core` (e não no `financeiro-core`, que só empresta o
 * `addDias`) porque prova é agenda: é o mesmo pacote da malha de horários e
 * do expediente.
 */
export type RegraDaJanelaDeProva = {
  provaDiasAntes: number;
  usoDiasAntes: number;
};

export type JanelaDeDias = { inicio: string; fim: string };

/** `casamentoDia` é o DIA do casamento (`AAAA-MM-DD`), já convertido por quem chama. */
export function janelaDeProvaDoDia(casamentoDia: string, regra: RegraDaJanelaDeProva): JanelaDeDias | null {
  const inicio = addDias(casamentoDia, -regra.provaDiasAntes);
  const fim = addDias(casamentoDia, -regra.usoDiasAntes - 1);
  return inicio <= fim ? { inicio, fim } : null;
}
