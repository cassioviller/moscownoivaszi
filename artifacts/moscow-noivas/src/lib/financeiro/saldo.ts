import { parseValor, hojeLocal } from "@workspace/financeiro-core";

/**
 * E25: âncora e saldo-de-hoje moram no motor único (@workspace/financeiro-core).
 * Aqui fica só a validação do FORMULÁRIO de conferência — texto de erro é
 * assunto de tela, não de motor. saldo.test.ts ao lado prova o core.
 */
export { ancoraAtiva, saldoDeHoje, type SaldoDeHoje } from "@workspace/financeiro-core";

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
