-- S-D26 — os perfis planos: a fonte fecha e o banco converte.
--
-- Medido em 2026-08-07, antes desta migração: **45 de 48 perfis no formato
-- PLANO** (`{"leads": true}`) — a conferência media 37 de 40 dois dias antes, e
-- a diferença é a própria doença: 44 dos 48 são fixture de suíte interrompida
-- ("Perfil Teste %" / "Perfil Admin Teste %", presos a lojas zumbis — S-D46),
-- e `__tests__/helpers.ts` escrevia o formato plano em cada execução.
-- Os quatro reais: Admin (plano), Vendedora (plano), Proprietária e Recepção
-- (já em módulo × ação). `perfil_overrides_lojas` está em 0 linhas e a rota
-- que o escreve normaliza na entrada — não precisa de conversão.
--
-- A conversão espelha `normalizarAcessos` (`lib/permissoes.ts:37`):
--   true                       → {ver:true,  criar:true,  editar:true}
--   false / ausente / opaco    → {ver:false, criar:false, editar:false}
--   objeto                     → {ver: ver||criar||editar, criar, editar}
--
-- E é IDENTIDADE SEMÂNTICA: a ponte já traduzia exatamente assim em toda
-- leitura. Por isso NENHUMA sessão precisa cair — o cuidado do E56/E60 vale
-- para MUDANÇA de permissão, e aqui o acesso efetivo não muda um bit.
-- Aplicada a TODAS as linhas: normalizar também descarta chave desconhecida e
-- materializa módulo ausente como all-false, o fail-closed que o código já
-- aplicava ao ler.

BEGIN;

UPDATE perfis SET acessos_modulos = (
  SELECT jsonb_object_agg(m, CASE
    WHEN acessos_modulos->m = 'true'::jsonb
      THEN '{"ver":true,"criar":true,"editar":true}'::jsonb
    WHEN jsonb_typeof(acessos_modulos->m) = 'object'
      THEN jsonb_build_object(
        'ver', (acessos_modulos->m->>'ver' = 'true')
            OR (acessos_modulos->m->>'criar' = 'true')
            OR (acessos_modulos->m->>'editar' = 'true'),
        'criar', acessos_modulos->m->>'criar' = 'true',
        'editar', acessos_modulos->m->>'editar' = 'true')
    ELSE '{"ver":false,"criar":false,"editar":false}'::jsonb
  END)
  FROM unnest(ARRAY['leads','agenda','vestidos','financeiro','comissao','admin']) AS m
);

-- Deve devolver 0: é o mesmo predicado da sonda sd26 da suíte.
SELECT count(*) AS planos_restantes
FROM perfis p
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(p.acessos_modulos) e WHERE jsonb_typeof(e.value) = 'boolean'
);

COMMIT;
