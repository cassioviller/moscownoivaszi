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
// E222 — o SEGUNDO expediente: retirada e devolução (cláusulas 4ª e 5ª). O que
// já existia governa atendimento, e está certo para provas; este governa a peça
// saindo e voltando. O ateliê tem dois calendários, e o modelo tinha um.
export * from "./expediente-retirada";
// E240/S-O116 — a janela de PROVA, num lugar só: servidor e tela importam a
// mesma conta em vez de escrevê-la duas vezes.
export * from "./janela-de-prova";
// E249/S-R2 — e os dias da LOCAÇÃO pelo mesmo motivo: o E224 escreveu a conta
// na tela, e o E244 deu ao servidor um motivo para saber refazê-la (o casamento
// que é adiado move a data que o papel imprime).
export * from "./janela-da-locacao";
