-- E212 — o atraso na devolução tem preço (contrato, cláusula 16ª e seus §§).
--
-- > CLÁUSULA 16ª — A não devolução no prazo de 10 (dez) dias a contar da data
-- > prevista será considerada EXTRAVIO ou ROUBO, sendo que o LOCATÁRIO terá que
-- > pagar quatro vezes o valor do aluguel de cada peça.
-- >
-- > §1º — Se for ultrapassada a data prevista para a devolução, em prazo
-- > inferior ao descrito no caput, o LOCATÁRIO pagará o valor equivalente a um
-- > dia de aluguel extra para cada dia de atraso, acrescido de multa de
-- > R$ 250,00.
-- >
-- > §2º — Os valores poderão ser aplicados proporcionalmente a trajes e/ou
-- > acessórios avulsos que não foram devolvidos na data prevista.
--
-- O sistema JÁ ENXERGAVA o atraso: `disponibilidade.ts` pinta a janela física
-- como `ATRASO_DEVOLUCAO` quando há retirada sem devolução depois do fim do uso
-- previsto. A peça aparecia vermelha na tela do acervo e **nenhuma cobrança
-- nascia** — a conta não existia em lugar nenhum do código.
--
-- Duas mudanças, e nenhuma tabela nova.
--
-- 1. A ORIGEM da parcela, que é o que faz a linha de cobrança dizer de onde ela
--    veio. Uma origem para as duas faixas da cláusula, e não duas: elas são
--    parágrafos diferentes, mas o FATO é o mesmo — a peça não voltou. Qual das
--    duas incidiu está na descrição da parcela e na trilha.
--
-- 2. O VÍNCULO da cobrança com o contrato, que é o mesmo que `avarias.parcela_id`
--    guarda do outro lado, e existe pela mesma razão MEDIDA no E97/F22: sem ele
--    o botão não muda de estado depois do clique, e dois cliques — o que
--    acontece quando a rede demora e a pessoa insiste — criam DUAS parcelas
--    cobrando o mesmo atraso. Fica no CONTRATO e não no bloqueio porque a
--    cobrança é uma só para todas as peças atrasadas: o §2º manda RATEAR a
--    conta entre elas, então a multa do §1º é uma por devolução, não uma por
--    vestido.
--
-- As duas são aditivas: nenhuma linha existente muda de valor, e o
-- `atraso_parcela_id` nasce NULL em todos os contratos — que é a verdade,
-- porque nenhum atraso foi cobrado até hoje.

-- O `ALTER TYPE … ADD VALUE` não roda dentro de transação em Postgres < 12 e,
-- mesmo depois, não pode ser usado no mesmo bloco em que o valor novo é lido.
-- Rode esta linha sozinha, antes do resto.
ALTER TYPE parcela_origem ADD VALUE IF NOT EXISTS 'ATRASO_DEVOLUCAO';

BEGIN;

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS atraso_parcela_id text;

COMMIT;

-- Conferência (as duas devem devolver linha):
--   SELECT unnest(enum_range(NULL::parcela_origem));
--     -- PLANO, AVULSA, AVARIA, REAJUSTE_DATA, ATRASO_DEVOLUCAO
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'contratos' AND column_name = 'atraso_parcela_id';
--
-- **Confira no banco de `DATABASE_URL`, não no que você decorou.** São dois
-- bancos na mesma instância (`heliumdb` e `moscow_base`), e aplicar o DDL só
-- num deles é o defeito que o E211 cometeu e o E214 herdou: a suíte lê só o
-- primeiro, e vinte arquivos de teste reprovaram de uma vez com
-- `column "exclusiva" of relation "vestidos" does not exist`. Este arquivo é o
-- de quem já tem instalação rodando — o banco novo nasce certo do schema.
