-- E150 — o acessório de peça única entra no acervo, e o contrato exige reserva
--
-- `ALTER TYPE ... ADD VALUE` NÃO roda dentro de transação em que o valor novo
-- também seja usado (o Postgres precisa do commit do tipo antes), então este
-- script é uma instrução só, sem BEGIN — e `IF NOT EXISTS` o torna idempotente.
-- Mesmo molde do E49 (parcela PARCIAL).
--
-- Posição importa: ACESSORIO entra DEPOIS de VESTIDO, porque é o vizinho dele
-- em natureza — peça física do acervo, com código próprio e reserva própria —,
-- e antes de SERVICO e AJUSTE, que não são peça nenhuma. `enum_range` passa a
-- devolver VESTIDO, ACESSORIO, SERVICO, AJUSTE.

ALTER TYPE orcamento_item_tipo ADD VALUE IF NOT EXISTS 'ACESSORIO' AFTER 'VESTIDO';

-- Nada a fazer com as linhas existentes. ACESSORIO é tipo NOVO: o que já está
-- gravado como SERVICO ou como VESTIDO segue valendo, e reclassificar exigiria
-- adivinhar o que a descrição em texto queria dizer — que é exatamente o que
-- este épico deixa de fazer daqui para a frente.
--
-- O que o ateliê tem a fazer, e é trabalho da loja, não deste script: cadastrar
-- como peça do acervo (com código) os acessórios de UNIDADE ÚNICA que hoje só
-- existem como frase no contrato. Contados no caderno, são de 10 a 13 nomes
-- distintos em 14 semanas — bolero, mantilha, manga, véu. Os de ESTOQUE
-- (saiote, crinol) não entram aqui: são o E154, e contam por quantidade.
