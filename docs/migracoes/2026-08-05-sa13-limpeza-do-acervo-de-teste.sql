-- S-A13 / S-D25 — a limpeza do acervo de teste do banco de dev
--
-- **ESTE SCRIPT NÃO É DE SCHEMA**, como o irmão da S18: ele apaga LIXO DE TESTE
-- de um banco compartilhado, é idempotente e não muda estrutura nenhuma.
--
-- MEDIDO ANTES (2026-08-05 — regra 16 do método):
--   vestidos 899 · atributos 223 (9 são o catálogo do E147) · cabines 186
--   vestidos com item de CONTRATO: 0
--   vestidos sem bloqueio, sem item de orçamento e sem item de contrato: 568
--
-- O que o banco tinha: `V001 Princesa Encantada` e `V002 Sereia Glamour` do seed
-- de demonstração que o E147 aposentou, mais centenas de `MANU…`, `BLQ…`,
-- `STAT…` com sufixo de epoch — cada passada da suíte deixando os seus. E o pior
-- não é o volume: são atributos chamados **"Cor", "Cor A", "Cor B" e "Tamanho"**
-- convivendo com o vocabulário real do catálogo (a "Cor" de verdade aparece TRÊS
-- vezes), que confundem qualquer varredura futura por nome de atributo.
--
-- AS GUARDAS:
--   1. só o que não é referenciado por NADA — sem bloqueio, sem item de
--      orçamento, sem item de contrato. Peça com história não é lixo de teste;
--   2. o acervo do E2E (`codigo LIKE 'E2E%'`) fica inteiro, mesmo sem
--      referência: ele é fixture VIVA, e a suíte conta com ele;
--   3. atributo só sai depois, e só se nenhum vestido e nenhuma noiva o
--      apontarem — a ordem importa, porque a maioria deles estava presa aos
--      vestidos que saem no passo 1.
--
-- Um dump foi tirado antes (`artifacts/api-server/backups/`), que é o que torna
-- isto reversível.

BEGIN;

-- 1. As peças de teste sem história nenhuma.
DELETE FROM vestidos v
 WHERE v.codigo NOT LIKE 'E2E%'
   AND NOT EXISTS (SELECT 1 FROM bloqueio_vestidos b WHERE b.vestido_id = v.id)
   AND NOT EXISTS (SELECT 1 FROM orcamento_itens oi WHERE oi.vestido_id = v.id)
   AND NOT EXISTS (SELECT 1 FROM contrato_itens ci WHERE ci.vestido_id = v.id);

-- 2. Os atributos que ficaram sem dono, exceto os nove do catálogo do E147.
--    `vestido_atributos` cascateia do vestido, então o passo 1 já soltou a
--    maioria; o que sobra aqui é o que nunca esteve em peça nenhuma.
DELETE FROM atributos a
 WHERE a.nome NOT IN (
         'Tipo de peça', 'Cor', 'Silhueta', 'Decote', 'Manga',
         'Tecido', 'Cauda', 'Volume da saia', 'Brilho'
       )
   AND NOT EXISTS (SELECT 1 FROM vestido_atributos va WHERE va.atributo_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM lead_interesse_atributos lia WHERE lia.atributo_id = a.id)
   -- A ficha de interesses da noiva aponta a OPÇÃO, não só o atributo
   -- (`lead_interesse_atributos.opcao_id`), e `atributo_opcoes` cascateia do
   -- atributo. Sem esta linha o DELETE cascateia até a opção e bate na FK da
   -- ficha — foi o que abortou a primeira execução deste script, e o ROLLBACK
   -- é a razão de nada ter sido apagado por engano.
   AND NOT EXISTS (
         SELECT 1 FROM lead_interesse_atributos lia
          JOIN atributo_opcoes ao ON ao.id = lia.opcao_id
         WHERE ao.atributo_id = a.id
       );

COMMIT;

-- O que fica de propósito: as duplicatas de NOME do catálogo ("Cor" aparecendo
-- três vezes, uma por loja de teste). Elas são de OUTRAS lojas, e apagar
-- atributo de loja alheia é decidir pela loja — o caminho certo é apagar a loja
-- de teste inteira, e isso é outra conversa, com outra guarda.
