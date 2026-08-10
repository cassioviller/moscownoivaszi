-- S-D46 — a faxina das lojas de fixture que os runs interrompidos deixaram.
--
-- **ESTE SCRIPT NÃO É DE SCHEMA** (a forma é a da S18): ele apaga LIXO DE
-- TESTE de um banco compartilhado, é idempotente e não muda estrutura.
--
-- `criarFixture` abre uma `Loja Teste <sufixo>` por execução e `limparFixture`
-- a leva embora QUANDO RODA — o afterAll do vitest não roda quando o run
-- morre, e a loja viva segura o ecossistema por FK. As faxinas anteriores
-- pararam uma camada antes: a S18 limpou usuários órfãos, a S-A13 o acervo, a
-- S-D25 as cabines — nenhuma tocou `lojas`. E a S-D27 provou o custo: uma
-- dessas zumbis herdaria a suíte E2E inteira se a loja do seed sumisse (hoje a
-- eleição é por id, `e01bff4`, então apagá-las não muda alvo nenhum).
--
-- MEDIDO ANTES (2026-08-07, banco de dev — regra 16 do método):
--   28 lojas · 26 com assinatura `Loja Teste %`/`Loja Vazia %`
--   45 vínculos usuário×loja pendurados nelas
--   44 perfis referenciados SÓ por elas (todos `%Teste%` — os "44 dos 48" que
--      o épico da S-D26 mediu), 24 usuários cujo único vínculo é com elas
--      (todos `...@teste.local`)
--   DINHEIRO: zero — 0 parcelas PARCIAL/PAGA, 0 pagamentos. Um único contrato
--      ATIVO (Loja Teste f8447f68, R$ 10.000,00, 0 parcelas): resíduo de run
--      interrompido, sem um centavo movido; o CASCADE o leva com a loja.
--
-- A guarda é a INVERSA da do `DELETE /admin/lojas` (E106 recusa loja COM
-- história): aqui só sai loja que casa a assinatura E não tem dinheiro real.
-- Loja de fixture com parcela PARCIAL/PAGA ou pagamento fica, de propósito,
-- para olho humano. Os 33 CASCADE de `lojas` (S33) levam o resto; depois saem
-- os perfis que ficaram sem referência e os usuários órfãos, com as guardas
-- da S18 (quem tem história em QUALQUER loja fica).

BEGIN;

-- 1. As lojas — assinatura de fixture, zero dinheiro.
DELETE FROM lojas l
 WHERE (l.nome LIKE 'Loja Teste %' OR l.nome LIKE 'Loja Vazia %')
   AND NOT EXISTS (
     SELECT 1 FROM parcelas p
      WHERE p.loja_id = l.id AND p.status IN ('PARCIAL', 'PAGA'))
   AND NOT EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.loja_id = l.id);

-- 2. Os perfis de fixture que ficaram sem referência nenhuma. `perfis` é
--    global (sem loja_id) — é por isso que o CASCADE da loja não os alcança.
DELETE FROM perfis p
 WHERE p.sistema = false
   AND p.nome LIKE '%Teste%'
   AND NOT EXISTS (SELECT 1 FROM usuarios_lojas ul WHERE ul.perfil_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM convites cv WHERE cv.perfil_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM perfil_overrides_lojas po WHERE po.perfil_id = p.id);

-- 3. Os usuários que o cascade deixou órfãos — o DELETE da S18, verbatim:
--    sem vínculo nenhum, sem história nenhuma, nunca superadmin.
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

-- Depois: `SELECT count(*) FROM lojas` volta a contar só as lojas com dono
-- (2 na medição), e as três contagens abaixo devolvem 0.
--   SELECT count(*) FROM lojas WHERE nome LIKE 'Loja Teste %' OR nome LIKE 'Loja Vazia %';
--   SELECT count(*) FROM perfis WHERE sistema=false AND nome LIKE '%Teste%'
--     AND NOT EXISTS (SELECT 1 FROM usuarios_lojas ul WHERE ul.perfil_id=perfis.id);
--   SELECT count(*) FROM usuarios u WHERE u.is_super_admin=false
--     AND NOT EXISTS (SELECT 1 FROM usuarios_lojas ul WHERE ul.usuario_id=u.id)
--     AND NOT EXISTS (SELECT 1 FROM audit_log l WHERE l.usuario_id=u.id);
