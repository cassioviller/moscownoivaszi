-- E172 — o orçamento e o contrato viram MÓDULOS, e quem já instalou precisa
-- desta linha.
--
-- Não há DDL aqui: `perfis.acessos_modulos` é jsonb, e o shape vem do código
-- (`api-server/src/lib/permissoes.ts:21`). O que existe é um problema de DADO,
-- e ele é o oposto do habitual — não é uma coluna nova que nasce nula, são duas
-- PERMISSÕES novas que nascem fechadas.
--
-- `normalizarAcessos` é fail-closed por regra escrita: chave ausente vira
-- `{ver:false, criar:false, editar:false}`. É o comportamento certo (módulo
-- novo não abre sozinho para quem nunca o recebeu), e o preço dele é que, no
-- segundo em que este código sobe, **a Vendedora de toda loja já instalada para
-- de fechar contrato e de aprovar proposta** — o `acessos_modulos` dela não tem
-- as chaves `orcamentos` e `contratos`. Numa base nova o seed já grava certo
-- (`configuracao-inicial.ts`); numa base que existe, quem grava é este arquivo.
--
-- **A regra dos passos 1 a 4 é uma só: os dois módulos novos nascem CÓPIA de
-- `leads`.** Não é atalho — é a preservação exata. Até ontem `/orcamentos` e
-- `/contratos` eram `requireModulo("leads")` puro, então o que a pessoa podia
-- fazer com a proposta e com o contrato era, literalmente, o que ela tinha em
-- `leads`. Copiar o valor devolve cada um ao lugar de onde ele saiu, sem esta
-- migração decidir nada por ninguém. Quem decide é o passo 5, e só sobre os
-- perfis do SEED.
--
-- O `jsonb -> 'leads'` cobre os dois formatos de graça, e é de propósito: o
-- plano (`"leads": true`) ainda existe em linhas que nunca passaram por um
-- PATCH desde o E147, e `normalizarAcessos` lê `true` como as três ações
-- (`permissoes.ts:88`). Copiado, ele continua querendo dizer a mesma coisa.
--
-- Rode INTEIRO, e numa transação só: os seis passos são UM estado, não seis.
-- Parar no meio deixa a base num lugar que nenhum código prevê — por exemplo,
-- com a Recepção já editando leads (passo 5) e o expurgo de LGPD ainda ao
-- alcance dela, porque o passo que lhe fecha o contrato não rodou.
--
-- Idempotente: rodar duas vezes não muda nada na segunda. Os passos 1 a 4 são
-- guardados por `NOT (acessos_modulos ? '<chave>')`, o 6 por `ON CONFLICT`, e o
-- 5 é uma escrita do mesmo valor.

BEGIN;

-- 1 e 2. Os perfis: `orcamentos` e `contratos` nascem valendo o que `leads`
--        vale. Perfil sem a chave `leads` (não deveria existir) fica sem as
--        duas, que é o fail-closed certo.
UPDATE perfis
SET acessos_modulos = jsonb_set(acessos_modulos, '{orcamentos}', acessos_modulos -> 'leads')
WHERE NOT (acessos_modulos ? 'orcamentos')
  AND acessos_modulos ? 'leads';

UPDATE perfis
SET acessos_modulos = jsonb_set(acessos_modulos, '{contratos}', acessos_modulos -> 'leads')
WHERE NOT (acessos_modulos ? 'contratos')
  AND acessos_modulos ? 'leads';

-- 3 e 4. Os overrides POR LOJA são um segundo lugar onde a permissão mora, e o
--        esquecido: `resolverAcessosEfetivos` diz que o override SUBSTITUI o
--        template (não se mistura com ele), então a loja que personalizou a
--        Vendedora ficaria sem proposta e sem contrato mesmo com os passos 1 e
--        2 aplicados.
UPDATE perfil_overrides_lojas
SET acessos_modulos = jsonb_set(acessos_modulos, '{orcamentos}', acessos_modulos -> 'leads')
WHERE NOT (acessos_modulos ? 'orcamentos')
  AND acessos_modulos ? 'leads';

UPDATE perfil_overrides_lojas
SET acessos_modulos = jsonb_set(acessos_modulos, '{contratos}', acessos_modulos -> 'leads')
WHERE NOT (acessos_modulos ? 'contratos')
  AND acessos_modulos ? 'leads';

-- 5. A Recepção padrão — as três decisões da dona, em uma escrita.
--
--    `leads` inteiro: ela corrige o telefone que ela mesma digitou (S-O41).
--    `orcamentos` só ver: responde ao telefone quanto foi a proposta, e não a
--    aprova — aprovar congela a versão que o contrato confere, logo decide o
--    preço que ele cobra. `contratos` fechado (S-O40).
--
--    Só o perfil PADRÃO, pelo id do seed. Perfil que a loja criou à mão com o
--    nome "Recepção" é decisão dela, e migração não reescreve decisão de
--    ninguém — para esses, os passos 1 a 4 já preservaram o que havia.
UPDATE perfis
SET acessos_modulos = acessos_modulos
  || '{"leads": {"ver": true, "criar": true, "editar": true}}'::jsonb
  || '{"orcamentos": {"ver": true, "criar": false, "editar": false}}'::jsonb
  || '{"contratos": {"ver": false, "criar": false, "editar": false}}'::jsonb
WHERE id = 'perfil-recepcao';

-- 6. A Costureira (S-O36) — o perfil que não existia. Sem ele, dar à costureira
--    a fila de ajustes custava a carteira de leads da loja inteira, porque o
--    perfil mais fechado que concedia `agenda` era a Recepção.
--
--    O acervo entra só de LEITURA, e isso foi medido antes de decidido: com
--    `agenda` e nada mais, os dois botões da ficha de trabalho dela respondem
--    403 — "Abrir a reserva" e o nome do vestido —, porque `/reservas` e
--    `/vestidos` gateiam por `vestidos`. É onde moram as provas e a movimentação
--    da peça. Ela lê; escrever no acervo continua sendo de outro.
--
--    `ON CONFLICT DO NOTHING` pelo mesmo motivo que o seed: quem já criou um
--    perfil com este id fez uma escolha, e ela vale mais que esta linha.
INSERT INTO perfis (id, nome, sistema, acessos_modulos)
VALUES (
  'perfil-costureira',
  'Costureira',
  false,
  '{"leads": {"ver": false, "criar": false, "editar": false},
    "orcamentos": {"ver": false, "criar": false, "editar": false},
    "contratos": {"ver": false, "criar": false, "editar": false},
    "agenda": {"ver": true, "criar": true, "editar": true},
    "vestidos": {"ver": true, "criar": false, "editar": false},
    "financeiro": {"ver": false, "criar": false, "editar": false},
    "comissao": {"ver": false, "criar": false, "editar": false},
    "admin": {"ver": false, "criar": false, "editar": false}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Confira depois de rodar — a resposta esperada é uma linha por perfil, e
-- NENHUMA com `orcamentos` ou `contratos` ausente:
--
--   SELECT nome,
--          acessos_modulos -> 'leads'      AS leads,
--          acessos_modulos -> 'orcamentos' AS orcamentos,
--          acessos_modulos -> 'contratos'  AS contratos
--   FROM perfis ORDER BY nome;
--
-- O que se lê ali: Admin, Proprietária e Vendedora com os três inteiros;
-- Recepção com `leads` inteiro, `orcamentos` só `ver` e `contratos` tudo
-- `false`; Costureira com os três `false`.
