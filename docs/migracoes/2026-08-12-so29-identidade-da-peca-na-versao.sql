-- S-O29 (A07.4) — a IDENTIDADE das peças congelada ao lado do hash.
--
-- O `hash` da versão prende o que a proposta DIZ: `{tipo, descricao,
-- valorUnitario, quantidade}` (`lib/conteudo-orcamento.ts`). Ele não prende o
-- que ela É — o `vestidoId` fica de fora. Trocar a peça de um item mantendo a
-- descrição e o preço **não move o hash**, e o `POST /contratos` aceitava: a
-- noiva prova o vestido A, aceita "Vestido tomara-que-caia marfim ·
-- R$ 5.000,00", e o contrato fecha sobre o vestido B.
--
-- Por que uma coluna nova em vez de pôr o `vestidoId` dentro do hash: o
-- comentário de `conteudoEnviado` é explícito — *"o formato do `conteudo` é
-- CONTRATO: mudar uma chave invalida todo hash já gravado"*. Uma noiva com o
-- link na mão no momento do deploy perderia o aceite dela. A identidade viaja
-- ao lado, na MESMA ordem canônica de `itens` (por `createdAt`), e a
-- conferência é independente.
--
-- Nasce NULA de propósito, e é o comportamento certo: `null` = versão anterior
-- a esta coluna, e a guarda se desliga nela. Não se cobra de um snapshot o que
-- ele nunca guardou — a mesma decisão que o O7/C5 (E166) tomou para
-- `observacoes` e `validade`. As versões criadas a partir do deploy já nascem
-- com a lista preenchida.
--
-- Idempotente: `IF NOT EXISTS`.

ALTER TABLE orcamento_versoes
  ADD COLUMN IF NOT EXISTS itens_vestido_ids jsonb;

-- Confira depois de rodar — as versões antigas ficam NULAS, e é o esperado:
--
--   SELECT numero,
--          jsonb_array_length(itens)             AS itens,
--          itens_vestido_ids IS NULL             AS sem_identidade
--   FROM orcamento_versoes
--   ORDER BY criada_em DESC
--   LIMIT 20;
--
-- Toda linha anterior ao deploy responde `sem_identidade = true`. A primeira
-- linha `false` é a primeira proposta enviada depois dele.
