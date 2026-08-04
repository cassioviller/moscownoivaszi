-- E149 — cor sai do texto livre e vira atributo do catálogo
--
-- O que este script faz, e o que NÃO faz:
--
--  · Casa `vestidos.cor` (texto livre) com a opção do atributo "Cor", por
--    comparação NORMALIZADA (sem acento, sem caixa, sem espaço nas pontas) —
--    que é exatamente o que a coluna não fazia e por isso o filtro quebrava.
--  · Casa `vestidos.categoria` com a opção de "Silhueta" quando o texto for uma
--    silhueta. Medido no banco de dev antes de escrever isto: dos 863 vestidos,
--    4 tinham `categoria` preenchida e as quatro diziam "Princesa" ou "Sereia".
--    A coluna que o E147 deixou livre para coleção virou depósito do atributo
--    que já existia ao lado — e é por isso que a migração olha para lá.
--  · NÃO apaga `vestidos.cor` nem `vestidos.categoria`. As duas viram legado
--    LIDO: quem tem cadastro antigo continua vendo o que digitou.
--  · NÃO inventa opção nova. O que não casar sai no relatório do fim para
--    alguém decidir — nada se perde em silêncio.
--
-- Idempotente: `on conflict do nothing` na PK (vestido_id, atributo_id), então
-- rodar de novo não duplica e não sobrescreve escolha feita à mão depois.
--
-- Pré-requisito: o seed do E149 já rodou (os atributos "Cor" e "Tipo de peça"
-- existem). `tsx src/scripts/seed.ts` é idempotente e pode rodar antes.

begin;

-- Normalização: minúsculas, sem acento, sem espaço nas pontas.
create or replace function e149_norm(t text) returns text as $$
  select btrim(lower(translate(
    coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )));
$$ language sql immutable;

-- 1. cor (texto livre) → atributo "Cor"
insert into vestido_atributos (vestido_id, atributo_id, opcao_id)
select v.id, a.id, o.id
from vestidos v
join atributos a on a.loja_id = v.loja_id and a.nome = 'Cor'
join atributo_opcoes o on o.atributo_id = a.id
                      and e149_norm(o.valor) = e149_norm(v.cor)
where v.cor is not null and btrim(v.cor) <> ''
on conflict (vestido_id, atributo_id) do nothing;

-- 2. categoria que na verdade é silhueta → atributo "Silhueta"
insert into vestido_atributos (vestido_id, atributo_id, opcao_id)
select v.id, a.id, o.id
from vestidos v
join atributos a on a.loja_id = v.loja_id and a.nome = 'Silhueta'
join atributo_opcoes o on o.atributo_id = a.id
                      and e149_norm(o.valor) = e149_norm(v.categoria)
where v.categoria is not null and btrim(v.categoria) <> ''
on conflict (vestido_id, atributo_id) do nothing;

-- 3. O que NÃO casou — para decidir à mão, não para sumir.
--    (Um `select` no fim da transação: aparece na saída do psql.)
select 'cor sem opção no catálogo' as pendencia, v.loja_id, v.codigo, v.nome, v.cor as valor
from vestidos v
where v.cor is not null and btrim(v.cor) <> ''
  and not exists (
    select 1 from atributos a
    join atributo_opcoes o on o.atributo_id = a.id
    where a.loja_id = v.loja_id and a.nome = 'Cor'
      and e149_norm(o.valor) = e149_norm(v.cor)
  )
union all
select 'categoria não é silhueta (fica como coleção)', v.loja_id, v.codigo, v.nome, v.categoria
from vestidos v
where v.categoria is not null and btrim(v.categoria) <> ''
  and not exists (
    select 1 from atributos a
    join atributo_opcoes o on o.atributo_id = a.id
    where a.loja_id = v.loja_id and a.nome = 'Silhueta'
      and e149_norm(o.valor) = e149_norm(v.categoria)
  )
order by 1, 3;

drop function e149_norm(text);

commit;
