/**
 * Régua da agenda no frontend. As regras NÃO vivem aqui — vêm de
 * `@workspace/agenda-core`, o mesmo módulo que o PATCH usa para recusar o
 * reagendamento com 422 (E28). A grade apaga a célula usando exatamente a
 * função que o servidor consultaria depois.
 */
export {
  SLOT_MINUTOS,
  EXPEDIENTE_PADRAO,
  DETALHE_RECUSA,
  slotsDoDia,
  slotDe,
  instanteDoSlot,
  horaLocal,
  rotuloSlot,
  dentroDoFuncionamento,
  chaveCelula,
  lerChaveCelula,
  recusaDeMover,
  ausenciaQueCobre,
  type Ausencia,
  type Expediente,
  type Marcacao,
  type MotivoRecusa,
} from "@workspace/agenda-core";
