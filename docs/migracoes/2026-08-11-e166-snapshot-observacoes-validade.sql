-- E166 (O7/C5) — observações e validade entram no SNAPSHOT congelado.
--
-- A página da noiva mostra os dois logo acima do comprovante de aceite, e
-- ambos eram lidos da linha VIVA: a observação mudava de "entrada de
-- R$ 1.500,00" para "entrada de R$ 2.500,00" com o total intacto, o hash
-- continuava batendo, e o comprovante passava a afirmar R$ 1.000,00 a mais de
-- entrada sob o mesmo "Aceito em". Agora as duas congelam com a versão.
--
-- Nulos são as versões anteriores a estas colunas — a página cai na linha
-- viva para elas, como sempre fez. Sem backfill: congelar retroativamente o
-- valor VIVO de hoje seria inventar o que a noiva viu ontem.

ALTER TABLE orcamento_versoes
  ADD COLUMN observacoes text,
  ADD COLUMN validade timestamp with time zone;
