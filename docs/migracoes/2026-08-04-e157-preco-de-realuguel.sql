-- E157 — a peça sabe quantas vezes saiu, e o preço acompanha
--
-- O ateliê precifica pela VEZ em que a peça sai. O caderno registra a contagem
-- 7 vezes em 14 semanas — `1º Aluguel` (YOKO, Adelita, Andreia), `2º Aluguel`
-- (Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita) — e o sistema tinha
-- um preço só.
--
-- A pergunta que segurava isto desde a trilha A era se o `7.600` ao lado de
-- "Realuguel" era valor ou código de peça. A dona respondeu (P5): **é valor**.
-- A releitura da trilha B já apontava para lá — ponto de milhar, e nenhum dos 8
-- códigos observados usa ponto.
--
-- A CONTAGEM não entra aqui. Ela já existe e é da vida inteira:
-- `GET /vestidos/utilizacao` conta provas, reservas e contratos por peça, e o
-- recorte de/ate é opcional (routes/vestidos.ts:274-277). Não há motor a
-- construir; há um número que ninguém lia na hora certa.

BEGIN;

ALTER TABLE vestidos
  ADD COLUMN IF NOT EXISTS preco_realuguel numeric(10,2);

COMMIT;

-- Nada a fazer com as linhas existentes, e é de propósito: **nulo significa
-- "esta peça não tem preço de segunda saída"**, e o orçamento segue com o
-- `preco_base` — exatamente o comportamento de hoje. Cada peça ganha o número
-- quando a dona o digitar, como já acontece com o `preco_base`.
