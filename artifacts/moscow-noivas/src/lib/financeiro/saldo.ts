import type { Parcela, Pagamento, SaldoReferencia } from "@workspace/api-client-react";
import { centavos, parseValor, reais } from "./dinheiro";
import { diaLocal, hojeLocal, type Intervalo } from "./datas";
import { resumoCaixa } from "./fluxo";

/**
 * O saldo de partida da projeção.
 *
 * Ninguém confere o caixa todo dia. O que existe é uma ÂNCORA: "em 14/07 tinha
 * R$ 8.000". De lá para cá o caixa andou, e a projeção precisa do saldo de HOJE
 * — âncora + o realizado desde ela. Usar a âncora crua como saldo de hoje ignora
 * tudo que entrou e saiu no meio, e a curva inteira nasce no nível errado.
 *
 * Convenção: `valor` é o saldo no INÍCIO de `dataReferencia`, então o realizado
 * a somar é o intervalo [dataReferencia, hoje] — inclusive nas duas pontas.
 */

export type Conferencia = { ok: true; valor: number } | { ok: false; erro: string };

/**
 * Valida o formulário de conferência de saldo. Dia futuro é recusado —
 * conferir é registrar um fato, e o caixa de amanhã ainda não existe. Zero e
 * negativo passam: o caixa não é obrigado a fechar no azul.
 */
export function validarConferencia(
  dia: string,
  valorTexto: string,
  hoje: string = hojeLocal(),
): Conferencia {
  if (!dia) return { ok: false, erro: "Informe o dia da conferência." };
  if (dia > hoje) return { ok: false, erro: "O dia conferido não pode estar no futuro." };
  const valor = parseValor(valorTexto);
  if (valor === null || Number.isNaN(valor)) {
    return { ok: false, erro: "Informe o valor conferido — use vírgula para os centavos." };
  }
  return { ok: true, valor };
}

/** A âncora ativa: o saldo conferido mais recente que não está no futuro. */
export function ancoraAtiva(
  saldos: readonly SaldoReferencia[] | undefined,
  hoje: string = hojeLocal(),
): SaldoReferencia | null {
  const aplicaveis = (saldos ?? []).filter((s) => diaLocal(s.dataReferencia) <= hoje);
  if (aplicaveis.length === 0) return null;
  // Mesmo dia conferido duas vezes: vale o registrado por último.
  return aplicaveis.reduce((maisRecente, s) =>
    s.dataReferencia >= maisRecente.dataReferencia ? s : maisRecente,
  );
}

export type SaldoDeHoje = {
  /** Reais. Pode ser negativo — o caixa não é obrigado a fechar no azul. */
  valor: number;
  /** O dia conferido de onde este saldo foi rolado. */
  ancoraDia: string;
  /** O que o caixa andou entre a âncora e hoje. */
  movimentoDesdeAncora: number;
};

/**
 * Saldo de hoje = âncora + realizado [âncora, hoje]. Sem âncora não há saldo:
 * devolve null em vez de fingir zero — zero é um número, "não sei" não é.
 */
export function saldoDeHoje(
  saldos: readonly SaldoReferencia[] | undefined,
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
  hoje: string = hojeLocal(),
): SaldoDeHoje | null {
  const ancora = ancoraAtiva(saldos, hoje);
  if (!ancora) return null;

  const ancoraDia = diaLocal(ancora.dataReferencia);
  const desdeAncora: Intervalo = { iniYMD: ancoraDia, fimYMD: hoje };
  const realizado = resumoCaixa(parcelas, pagamentos, desdeAncora);

  return {
    valor: reais(centavos(ancora.valor) + centavos(realizado.saldo)),
    ancoraDia,
    movimentoDesdeAncora: realizado.saldo,
  };
}
