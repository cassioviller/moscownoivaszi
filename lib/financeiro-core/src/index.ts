/**
 * @workspace/financeiro-core (E25): o motor ÚNICO de dinheiro, datas, caixa,
 * saldo e projeção. Nasceu da lib do frontend (onde as regras já viviam
 * testadas) e agora é consumido também pelo api-server — frontend e backend
 * deixam de calcular visões separadas que divergiam por centavos e por um dia.
 *
 * Puro de propósito: sem IO, sem dependências, tipos estruturais — a linha do
 * drizzle e o objeto da API entram igual.
 */
export * from "./dinheiro";
export * from "./datas";
export * from "./plano";
export * from "./caixa";
export * from "./dre";
export * from "./saldo";
export * from "./projecao";
export * from "./alerta";
export * from "./extrato";
