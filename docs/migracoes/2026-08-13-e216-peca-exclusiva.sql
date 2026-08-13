-- E216 — a peça sabe que é exclusiva (contrato, cláusula 12ª).
--
-- > CLÁUSULA 12ª — Se tratar de rescisão de vestido exclusivo para primeiro
-- > aluguel, será cobrado na qualidade de multa de rescisão contratual o valor
-- > integral do aluguel.
--
-- Uma coluna só, e é a metade que o sistema não tinha. A outra metade —
-- "primeiro aluguel" — NÃO vira coluna: ela é a contagem de saídas, derivada dos
-- contratos ATIVOS em `GET /vestidos/utilizacao` desde o E157. Gravar um segundo
-- "já alugou" seria uma segunda verdade sobre o mesmo número, e ela divergiria
-- no primeiro cancelamento de contrato.
--
-- Por que COLUNA e não atributo do catálogo (`vestido_atributos`):
--
--   · Medido no banco de dev, os 9 atributos do catálogo são Brilho, Cauda, Cor,
--     Decote, Manga, Silhueta, Tecido, Tipo de peça e Volume da saia — todos
--     descritivos, todos do que a NOIVA procura, e nenhum decide dinheiro.
--   · `vestido_atributos` cascateia no DELETE do atributo e da opção: a loja
--     apaga a palavra arrumando vocabulário e a classificação vai junto. Uma
--     cláusula que cobra o aluguel INTEIRO não pode depender disso.
--   · O molde certo está ao lado: `vestidos.preco_realuguel` (E157) é o mesmo
--     tipo de fato — comercial, lido pelo CÓDIGO.
--
-- Nasce `false` para todo mundo, e é o comportamento certo: nenhuma peça do
-- acervo foi declarada exclusiva antes deste épico, e o sistema não inventa
-- exclusividade que ninguém acordou. Quem for exclusiva, a loja marca na ficha.
--
-- Idempotente: `IF NOT EXISTS`.

ALTER TABLE vestidos
  ADD COLUMN IF NOT EXISTS exclusiva boolean NOT NULL DEFAULT false;

-- Conferência (deve devolver a coluna, com o default):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'vestidos' AND column_name = 'exclusiva';
--
-- E a população, que deve nascer toda em false:
--   SELECT exclusiva, count(*) FROM vestidos GROUP BY exclusiva;
