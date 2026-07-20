import { dentroDoFuncionamento } from "./slots";

/**
 * A regra de "esse atendimento pode ir para ali?", em UM lugar.
 *
 * Antes ela não existia em lugar nenhum inteiro: o horário de funcionamento era
 * conferido só no formulário do cliente, e o choque de agenda só pelas UNIQUE do
 * banco — que devolvem um 409 genérico sem dizer se esbarrou na cabine ou na
 * vendedora. A grade precisa saber ANTES do gesto, para apagar a célula em vez
 * de aceitar o card e falhar depois (doutrina do E27).
 *
 * A rota usa isto como pré-checagem amigável, não como garantia: entre o SELECT
 * e o UPDATE cabe outra requisição. Quem realmente segura é a UNIQUE do banco —
 * o mesmo desenho que o E1 provou sob `Promise.all`.
 */

export type MotivoRecusa = "FORA_DO_HORARIO" | "CABINE_OCUPADA" | "VENDEDORA_OCUPADA";

export const DETALHE_RECUSA: Record<MotivoRecusa, string> = {
  FORA_DO_HORARIO: "o horário está fora do expediente da loja",
  CABINE_OCUPADA: "já há atendimento nessa cabine nesse horário",
  VENDEDORA_OCUPADA: "a vendedora já tem atendimento nesse horário",
};

/** O mínimo que a regra precisa saber — a linha do drizzle e o objeto da API entram igual. */
export type Marcacao = {
  id: string;
  cabineId: string;
  vendedoraId: string;
  inicio: Date | string;
};

export type Expediente = { aberturaHora: number; fechamentoHora: number };

/**
 * Expediente de quem ainda não configurou nada. Espelha os defaults das colunas
 * `atendimento_abertura_hora`/`atendimento_fechamento_hora` do schema — uma loja
 * sem linha em `regra_disponibilidade` precisa de agenda mesmo assim.
 */
export const EXPEDIENTE_PADRAO: Expediente = { aberturaHora: 9, fechamentoHora: 19 };

const instante = (v: Date | string): number => new Date(v).getTime();

/**
 * Por que este movimento seria recusado — `null` se é permitido.
 *
 * `outras` é a agenda com que o destino compete; o próprio atendimento movido é
 * ignorado por id, senão ele colidiria consigo mesmo ao ser solto de volta no
 * lugar onde já está.
 */
export function recusaDeMover(
  movida: Marcacao,
  destino: { cabineId: string; inicio: Date | string },
  outras: readonly Marcacao[],
  expediente: Expediente,
): MotivoRecusa | null {
  if (!dentroDoFuncionamento(destino.inicio, expediente.aberturaHora, expediente.fechamentoHora)) {
    return "FORA_DO_HORARIO";
  }

  const quando = instante(destino.inicio);
  for (const outra of outras) {
    if (outra.id === movida.id) continue;
    if (instante(outra.inicio) !== quando) continue;
    // Espelha as duas UNIQUE do banco: (cabine, inicio) e (loja, vendedora, inicio).
    if (outra.cabineId === destino.cabineId) return "CABINE_OCUPADA";
    if (outra.vendedoraId === movida.vendedoraId) return "VENDEDORA_OCUPADA";
  }

  return null;
}
