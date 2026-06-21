// src/lib/disponibilidade/movimentacao.ts
// Máquina de estados da movimentação física de uma reserva (retirada ↔ devolução), PURA e
// testável. Recebe o estado atual (datas-só "YYYY-MM-DD" ou null) e um patch (campo ausente =
// mantém; null = limpa; string = grava) e devolve o ESTADO FINAL coerente — ou o motivo da
// recusa. NÃO toca banco nem projeta janelas no motor: isso fica no wrapper com efeito
// (definirMovimentacaoReserva), que ainda valida `datas_invalidas` via calcularJanelas.
import { diaValido } from "./datas";

export type EstadoMovimentacao = { retirada: string | null; devolucao: string | null };
export type PatchMovimentacao = { retiradaDataReal?: string | null; devolucaoDataReal?: string | null };

export type MotivoMovimentacao = "data_invalida" | "devolucao_orfa" | "sem_retirada" | "data_invertida";
export type ResolucaoMovimentacao =
  | { ok: true; estado: EstadoMovimentacao }
  | { ok: false; motivo: MotivoMovimentacao };

/**
 * Aplica o patch sobre o estado atual e valida a coerência do estado final:
 * - data mal formada ("" do form, ou dia inexistente) → `data_invalida`;
 * - limpar a retirada deixando a devolução → `devolucao_orfa`;
 * - devolução sem retirada → `sem_retirada`;
 * - devolução anterior à retirada → `data_invertida`.
 * Datas-só comparáveis lexicograficamente (YYYY-MM-DD). Sucesso devolve o estado final.
 */
export function resolverMovimentacao(atual: EstadoMovimentacao, patch: PatchMovimentacao): ResolucaoMovimentacao {
  // "" (campo vazio do form) nunca é "limpar" (isso é null); string precisa ser dia válido.
  if (patch.retiradaDataReal === "" || (patch.retiradaDataReal && !diaValido(patch.retiradaDataReal)))
    return { ok: false, motivo: "data_invalida" };
  if (patch.devolucaoDataReal === "" || (patch.devolucaoDataReal && !diaValido(patch.devolucaoDataReal)))
    return { ok: false, motivo: "data_invalida" };

  const retirada = patch.retiradaDataReal === undefined ? atual.retirada : patch.retiradaDataReal;
  const devolucao = patch.devolucaoDataReal === undefined ? atual.devolucao : patch.devolucaoDataReal;

  if (patch.retiradaDataReal === null && devolucao) return { ok: false, motivo: "devolucao_orfa" };
  if (devolucao && !retirada) return { ok: false, motivo: "sem_retirada" };
  if (devolucao && retirada && devolucao < retirada) return { ok: false, motivo: "data_invertida" };

  return { ok: true, estado: { retirada, devolucao } };
}
