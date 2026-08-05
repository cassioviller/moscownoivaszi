-- S18 — a limpeza do passivo que a fixture vazou até hoje
--
-- **ESTE SCRIPT NÃO É DE SCHEMA.** Os outros arquivos desta pasta levam um banco
-- que já existe até o schema novo; este apaga LIXO DE TESTE de um banco
-- compartilhado. Ele é idempotente e não muda estrutura nenhuma.
--
-- O que ele limpa e por que existe: `limparFixture` apagava usuário POR ID, e só
-- os dois que o `Fixture` conhece. Toda pessoa criada pela ROTA
-- (`POST /lojas/:id/equipe`) tinha id que nunca entrava ali — o cascade da loja
-- levava o VÍNCULO e deixava a pessoa órfã. O mecanismo foi consertado no mesmo
-- commit (`helpers.ts`, `limparFixture` passa a apagar quem ficou sem vínculo
-- nenhum); isto aqui é o que já vazou.
--
-- MEDIDO ANTES (2026-08-05, banco de dev — regra 16 do método):
--   usuarios 1667 · órfãos 1629 (98%) · sessoes 630 · lojas 24
-- O E100 tinha medido 613 órfãos de 714. Cresceu 2,7× em dez dias.
--
-- DUAS GUARDAS, e a segunda é a que importa:
--   1. só quem NÃO tem vínculo com loja nenhuma — quem trabalha em alguma fica;
--   2. só quem NÃO tem história. As FKs de autoria viraram RESTRICT no E91
--      (contrato, orçamento, atendimento, comissão), então uma pessoa com
--      qualquer registro faria o DELETE inteiro falhar; aqui ela é excluída da
--      lista ANTES, e o script não depende do banco recusar para acertar.
--   3. superadmin nunca entra — é a conta que abre o sistema.

BEGIN;

DELETE FROM usuarios u
 WHERE u.is_super_admin = false
   AND NOT EXISTS (SELECT 1 FROM usuarios_lojas ul WHERE ul.usuario_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM contratos c WHERE c.vendedora_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM orcamentos o WHERE o.vendedora_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM atendimentos a WHERE a.vendedora_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM comissao_regras r WHERE r.vendedora_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM comissao_fechamentos f WHERE f.vendedora_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM audit_log l WHERE l.usuario_id = u.id);

COMMIT;

-- As sessões saem junto: `sessoes.usuario_id` é CASCADE.
--
-- O que sobra de propósito: quem tem história. Uma pessoa que fechou contrato
-- não é lixo de teste — é registro, e o E91 decidiu que apagá-la nunca é o
-- caminho (inativar é). Se ainda sobrarem órfãos depois disto, eles têm alguma
-- dessas âncoras, e a pergunta passa a ser outra.
--
-- A rede contra a volta: `s18-fixture-nao-vaza-usuario-api.test.ts` reprova se o
-- número de usuários sem loja voltar a passar de 200.
