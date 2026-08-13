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
// E211 — o reajuste da troca de data (cláusula 17ª §§2º e 3º do contrato).
export * from "./reajuste";
// E216 — a peça exclusiva de primeiro aluguel (cláusula 12ª). O predicado, não
// a multa: a conta é do E217, e ele consome este predicado.
export * from "./exclusividade";
// E214 — a faixa da taxa de limpeza e o teto do dano (cláusulas 14ª e 15ª).
export * from "./avaria";
// E212 — o atraso na devolução e o extravio (cláusula 16ª e seus dois §§). O
// sistema já enxergava o atraso (`ATRASO_DEVOLUCAO`); esta é a conta.
export * from "./atraso";
// E213 — a multa e os juros da parcela vencida (cláusula 9ª). O sistema já
// sabia que a parcela estava atrasada desde o E49; esta é a conta.
export * from "./mora";
// S-O52/E186: os nomes das ações da trilha — o CSV da contadora e a coluna
// "Ação" da tela deixam de ser duas listas que divergiam em três rótulos.
export * from "./auditoria";
