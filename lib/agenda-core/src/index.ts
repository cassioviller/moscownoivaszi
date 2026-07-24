/**
 * @workspace/agenda-core (E28): a régua ÚNICA da agenda — a malha de horários e
 * a regra de para onde um atendimento pode ser movido.
 *
 * Nasceu com o arraste na grade. Antes dele a regra vivia partida em três:
 * o expediente conferido só no formulário do cliente, o choque de agenda só nas
 * UNIQUE do banco, e o PATCH no meio sem validar nenhum dos dois. A grade
 * precisa recusar a célula ANTES do gesto e a rota precisa recusar o mesmo
 * depois — logo, um módulo só, como o funil-core do E27.
 *
 * Puro de propósito: sem IO, sem banco, tipos estruturais.
 */
export * from "./slots";
export * from "./mover";
