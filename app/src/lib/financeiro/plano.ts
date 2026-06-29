// src/lib/financeiro/plano.ts
// Reconciliação do plano de pagamento × total do contrato (puro, centavos). A Parcela é
// a fonte da verdade do que se deve; o valorTotal do contrato é o cabeçalho acordado.
// Quando há plano e a soma das parcelas difere do total, a UI sinaliza para reconciliar.
import { decParaCentavos, paraCentavos } from "@/lib/dinheiro";
import { diaParaData } from "@/lib/financeiro/datas";

const DIA_MS = 86_400_000;

export type LinhaPlano = { numero: number; descricao: string; valor: number; vencimento: Date };
export type PlanoInput = { entrada?: string; numParcelas: number; primeiroVencimento: string; periodicidadeDias?: number };
export type ResultadoMontarPlano =
  | { ok: true; linhas: LinhaPlano[] }
  | { ok: false; motivo: "num_invalido" | "data_invalida" | "entrada_maior" | "valor_invalido" };

/** Soma (em centavos) os valores previstos das parcelas. */
export function totalDoPlanoCentavos(valoresPrevistos: string[]): number {
  return valoresPrevistos.reduce((soma, v) => soma + decParaCentavos(v), 0);
}

/** Há plano e a soma das parcelas difere do total do contrato → precisa reconciliar. */
export function planoDivergeDoTotal(valorTotalContrato: string, valoresPrevistos: string[]): boolean {
  if (valoresPrevistos.length === 0) return false;
  return totalDoPlanoCentavos(valoresPrevistos) !== decParaCentavos(valorTotalContrato);
}

/**
 * Constrói o plano de parcelas (puro, centavos): entrada (nº 0, opcional) + N parcelas, a
 * ÚLTIMA absorvendo o resto da divisão (sem drift). Vencimentos a cada `periodicidadeDias`
 * (default 30) a partir de `primeiroVencimento`. Espelha a regra que vivia embutida em
 * gerarPlanoDePagamento — agora reusada também pelo fechar-contrato atômico.
 */
export function montarPlano(totalC: number, input: PlanoInput): ResultadoMontarPlano {
  const n = Math.trunc(input.numParcelas);
  if (!Number.isInteger(n) || n < 1 || n > 360) return { ok: false, motivo: "num_invalido" };

  let venc0: Date;
  try {
    venc0 = diaParaData(input.primeiroVencimento);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  const periodicidade = Math.trunc(input.periodicidadeDias ?? 30);
  if (periodicidade < 1 || periodicidade > 3650) return { ok: false, motivo: "num_invalido" };

  let entradaC = 0;
  if (input.entrada && input.entrada.trim() !== "") {
    try {
      entradaC = paraCentavos(input.entrada);
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (entradaC > totalC) return { ok: false, motivo: "entrada_maior" };

  const restanteC = totalC - entradaC;
  const base = Math.floor(restanteC / n);
  const resto = restanteC - base * n;

  const linhas: LinhaPlano[] = [];
  if (entradaC > 0) linhas.push({ numero: 0, descricao: "Entrada", valor: entradaC, vencimento: venc0 });
  const startMonth = entradaC > 0 ? 1 : 0;
  for (let i = 1; i <= n; i++) {
    const valor = base + (i === n ? resto : 0);
    const vencimento = new Date(venc0.getTime() + (startMonth + (i - 1)) * periodicidade * DIA_MS);
    linhas.push({ numero: i, descricao: `Parcela ${i}/${n}`, valor, vencimento });
  }
  return { ok: true, linhas };
}
