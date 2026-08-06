-- S31 — o vocabulário do catálogo cascateia com a loja.
--
-- Quatro FKs nasceram em `NO ACTION` por OMISSÃO — `pg_get_constraintdef`
-- devolve as quatro sem cláusula `ON DELETE`. A quinta da mesma família,
-- `atributo_opcoes_atributo_id_atributos_id_fk`, já é CASCADE, **e é a
-- assimetria que produz o defeito**: apagar a loja cascateia até `atributos`,
-- o gatilho de `atributo_opcoes` cascateia em seguida, e as quatro checagens
-- NO ACTION encontram linhas de `vestido_atributos` e `lead_interesse_atributos`
-- que só sumiriam dezenas de posições depois na ordem dos gatilhos. Resultado:
-- `23503`, que o Express 5 traduz em **409 `VINCULO_EXISTENTE`** — não em 500,
-- como a sobra dizia. Foi este caminho que abortou o script da faxina da S-A13.
--
-- POR QUE CASCADE, E POR QUE NÃO RESTRICT. A régua do E91 é CONFIGURAÇÃO
-- cascateia / HISTÓRIA recusa. `vestido_atributos` é a classificação da peça no
-- vocabulário da loja; `lead_interesse_atributos` é a tradução do desejo da
-- noiva para esse mesmo vocabulário. O que ela escreveu com as próprias
-- palavras — `algo_a_mais`, `nao_quer_usar`, `teto_orcamento` — mora em
-- `lead_interesses` e NÃO cai junto. Apagar a palavra apaga a classificação,
-- não a noiva.
--
-- **Não troque por RESTRICT numa rodada futura.** RESTRICT tornaria impossível
-- apagar a loja, que é justamente a operação que o E106 guarda com 409
-- `LOJA_COM_HISTORICO` na camada certa. A guarda contra apagar sem querer é de
-- APLICAÇÃO, e entra junto com este DDL: `DELETE /atributos/:id` passa a
-- responder 409 `ATRIBUTO_EM_USO` dizendo quantas peças e quantas noivas
-- dependem da palavra — o molde é o do `DELETE /vestidos/:id` da S-A25.
--
-- BACKFILL: nenhum. As 6 linhas existentes (2 em `vestido_atributos`, 4 em
-- `lead_interesse_atributos`) já apontam para pais que existem; o
-- `ADD CONSTRAINT` só revalida contra 16 atributos e 72 opções.

BEGIN;

-- Guarda 1: as quatro FKs existem com o nome que o Drizzle gera. Se o nome
-- mudou, o `push` seguinte recriaria a FK e desfaria isto em silêncio.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
  WHERE contype = 'f' AND conname IN (
    'vestido_atributos_atributo_id_atributos_id_fk',
    'vestido_atributos_opcao_id_atributo_opcoes_id_fk',
    'lead_interesse_atributos_atributo_id_atributos_id_fk',
    'lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk'
  );
  IF n <> 4 THEN
    RAISE EXCEPTION 'esperava 4 FKs do vocabulário com o nome do Drizzle, achei %', n;
  END IF;
END $$;

-- Guarda 2: as quatro ainda estão em NO ACTION. Se já forem cascade, alguém
-- passou por aqui antes e este script não tem o que fazer.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
  WHERE contype = 'f' AND confdeltype = 'a' AND conname IN (
    'vestido_atributos_atributo_id_atributos_id_fk',
    'vestido_atributos_opcao_id_atributo_opcoes_id_fk',
    'lead_interesse_atributos_atributo_id_atributos_id_fk',
    'lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk'
  );
  IF n <> 4 THEN
    RAISE EXCEPTION 'esperava as 4 em NO ACTION, achei % — alguém já mexeu', n;
  END IF;
END $$;

ALTER TABLE vestido_atributos
  DROP CONSTRAINT vestido_atributos_atributo_id_atributos_id_fk,
  ADD CONSTRAINT vestido_atributos_atributo_id_atributos_id_fk
    FOREIGN KEY (atributo_id) REFERENCES atributos(id) ON DELETE CASCADE;

ALTER TABLE vestido_atributos
  DROP CONSTRAINT vestido_atributos_opcao_id_atributo_opcoes_id_fk,
  ADD CONSTRAINT vestido_atributos_opcao_id_atributo_opcoes_id_fk
    FOREIGN KEY (opcao_id) REFERENCES atributo_opcoes(id) ON DELETE CASCADE;

ALTER TABLE lead_interesse_atributos
  DROP CONSTRAINT lead_interesse_atributos_atributo_id_atributos_id_fk,
  ADD CONSTRAINT lead_interesse_atributos_atributo_id_atributos_id_fk
    FOREIGN KEY (atributo_id) REFERENCES atributos(id) ON DELETE CASCADE;

ALTER TABLE lead_interesse_atributos
  DROP CONSTRAINT lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk,
  ADD CONSTRAINT lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk
    FOREIGN KEY (opcao_id) REFERENCES atributo_opcoes(id) ON DELETE CASCADE;

-- Confere: as quatro em 'c', e a quinta segue como estava.
SELECT conname,
  CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' END AS on_delete
FROM pg_constraint
WHERE contype = 'f' AND confrelid::regclass::text IN ('atributos', 'atributo_opcoes')
ORDER BY conname;

COMMIT;
