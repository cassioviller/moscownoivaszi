-- S-A16 — a lavagem da peça de ESTOQUE vira configurável por loja.
--
-- Decidido pela dona em 2026-08-07 (folha de perguntas, pergunta 2): nem
-- "mesma semana do vestido" nem "nenhuma" — configurável. O campo nasce em
-- ZERO, que é o comportamento que sempre valeu (o E154 deixou a lavagem fora
-- da conta do estoque de propósito, e a nota registrava o custo: casamento em
-- 19/09, vestido comprometido até 28/09, o saiote do MESMO contrato livre em
-- 22/09). Nada muda em nenhuma loja até alguém preencher o campo em
-- "Cabines & horário".
--
-- Quem o lê é `estoque.ts` (`janelaDeUsoDoContrato`): o fim da janela de uso
-- ganha + estoque_lavagem_dias_depois. Com 0, identidade.

ALTER TABLE regra_disponibilidade
  ADD COLUMN IF NOT EXISTS estoque_lavagem_dias_depois integer NOT NULL DEFAULT 0;

-- Depois: a coluna existe com 0 em toda linha, e
--   SELECT count(*) FROM regra_disponibilidade WHERE estoque_lavagem_dias_depois <> 0;
-- devolve 0 até a primeira loja configurar.
