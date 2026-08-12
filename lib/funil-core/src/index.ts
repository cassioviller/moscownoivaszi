/**
 * @workspace/funil-core (E27): a régua ÚNICA do funil da noiva — quais etapas
 * existem, que transição é permitida e quando um lead está parado.
 *
 * Nasceu do `estados.ts` do api-server, que era a única fonte da máquina de
 * estados enquanto só as rotas precisavam dela. O kanban mudou isso: para
 * desabilitar as colunas que recusariam o drop, o frontend precisa da MESMA
 * régua — e espelhá-la à mão é exatamente o que a auditoria do E12 apontou como
 * dívida na matriz de permissões. Um lugar só, dois consumidores.
 *
 * Puro de propósito: sem IO, sem acesso ao banco, tipos estruturais.
 */
export * from "./etapas";
export * from "./parado";
export * from "./whatsapp";
