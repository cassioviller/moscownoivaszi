-- S3 — o ato GLOBAL de superadmin passa a deixar rastro
--
-- `audit_log.loja_id` era `notNull`, e a trilha inteira é por loja. As duas
-- ações que não pertencem a loja nenhuma ficavam de fora, com um `req.log.warn`
-- no lugar:
--
--   · `DELETE /admin/usuarios/:id` — `usuarios` é tabela GLOBAL;
--   · `DELETE /admin/lojas/:id` — e aqui a coluna obrigatória era pior que
--     inútil. Gravar "loja X apagada" com `loja_id = X` num FK em CASCADE
--     **apagaria o próprio registro junto com a loja**: o rastro morreria no
--     instante exato em que passasse a importar.
--
-- Nulo passa a significar **ato global**, e é isso que faz o registro sobreviver
-- ao que ele registra. Não é frouxidão de modelagem: é a única forma de a linha
-- existir depois do DELETE que ela descreve.

BEGIN;

ALTER TABLE audit_log
  ALTER COLUMN loja_id DROP NOT NULL;

COMMIT;

-- Nenhuma linha existente muda, e nenhuma passa a ser nula: toda trilha gravada
-- até aqui aconteceu DENTRO de uma loja, e continua apontando para ela. O nulo
-- só nasce das duas rotas acima, daqui para a frente.
--
-- Lê-se em `GET /admin/auditoria-global` (superadmin), porque
-- `/lojas/{lojaId}/financeiro/auditoria` filtra por loja e nunca mostraria estas
-- linhas — trilha gravada e nunca lida é meio conserto.
