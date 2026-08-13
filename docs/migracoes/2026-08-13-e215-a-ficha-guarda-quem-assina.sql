-- E215 — a ficha guarda quem assina (contrato, qualificação das partes).
--
-- O instrumento de locação abre qualificando as duas partes. A LOCADORA está no
-- cadastro da loja; a LOCATÁRIA, não: a ficha da noiva tinha nome, WhatsApp,
-- data e local do casamento, e **nenhum dado civil**. O contrato saía com os
-- campos em branco e a vendedora preenchia à mão, no papel.
--
-- O achado que dimensionou o épico é sobre o único campo que já existia.
-- `contratos.cpf` estava lá desde antes, a tela de fechar contrato já o
-- oferecia — e ele era OPCIONAL. Medido em 13/08/2026 no `heliumdb` (o banco de
-- `DATABASE_URL`; `select current_database()` conferido antes de escrever o
-- nome, pela régua do 1d9ccff):
--
--     leads .......................... 1413
--     contratos ....................... 735
--     contratos com cpf ................. 0
--
-- **0 de 735.** Não era falta de campo, era falta de obrigação: campo que dá
-- para pular é campo vazio. Por isso acrescentar onze colunas opcionais teria
-- produzido onze colunas vazias, e por isso a decisão da dona (13/08) é que os
-- campos são obrigatórios NO FECHO DO CONTRATO.
--
-- ## As colunas são todas ANULÁVEIS, e isso é decisão
--
-- A régua mora na PORTA (`POST /contratos`), que recusa nomeando o campo que
-- falta — não na coluna. `NOT NULL` puniria os 1413 leads que já existem,
-- nenhum dos quais tem um só dado civil, e travaria o cadastro de quem só
-- ligou perguntando preço: a noiva vira ficha muito antes de virar contrato.
--
-- Contratos já fechados NÃO são tocados. Eles nasceram sob outra regra, e
-- reescrever o passado seria dizer que a noiva assinou o que ela não assinou.
--
-- ## Por que as mesmas colunas nascem DUAS vezes
--
-- Em `leads` elas são o cadastro VIVO — a noiva muda de endereço, casa, troca
-- de profissão. Em `contratos` são o SNAPSHOT do dia da assinatura, pela mesma
-- razão que `vestido_descricao` e o par `desconto_tipo`/`desconto_valor` já
-- eram congelados: o papel tem de poder ser reimpresso anos depois dizendo o
-- que dizia. O `cpf` já era assim e estava sozinho, o que era o defeito — um
-- campo de qualificação congelado e os outros doze inexistentes.
--
-- ## `estado_civil` é ENUM, e não texto livre
--
-- O PDF do E220 vai imprimir a palavra na qualificação da locatária, onde ela
-- concorda em gênero com o resto da frase ("brasileira, {estado civil},
-- {profissão}"). Texto livre traria "Solteira", "solteira", "SOLTEIRA" e
-- "Solteiro" para a mesma pessoa, e o papel é o que ela assina. As seis são as
-- do art. 1.571 do Código Civil mais a união estável, que o cartório reconhece
-- e o molde de papel não previa.
--
-- ## Dado pessoal novo entra nas DUAS pontas da LGPD
--
-- O expurgo de `routes/leads.ts` é `set({…})` de lista curada à mão — a classe
-- da S-C33, na direção que custa processo: campo que não entra na lista
-- SOBREVIVE à anonimização. As treze entraram, e há régua pregando isso.
--
-- Idempotente (`IF NOT EXISTS`). Rode nos DOIS bancos — foi a S-C63 desta mesma
-- trilha que mostrou o custo de escrever a migração e não rodá-la no
-- `moscow_base`, que é o banco do preview.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_civil') THEN
    CREATE TYPE "public"."estado_civil" AS ENUM (
      'SOLTEIRA', 'CASADA', 'DIVORCIADA', 'VIUVA', 'SEPARADA', 'UNIAO_ESTAVEL'
    );
  END IF;
END $$;

-- A ficha da noiva — o cadastro vivo.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cpf" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "rg" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "estado_civil" "estado_civil";
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "profissao" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "nascimento" timestamp with time zone;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_logradouro" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_numero" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_complemento" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_bairro" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_cep" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_cidade" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "endereco_estado" text;

-- O contrato — o snapshot do dia da assinatura. `cpf` já existia.
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "rg" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "estado_civil" "estado_civil";
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "profissao" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "nascimento" timestamp with time zone;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_logradouro" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_numero" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_complemento" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_bairro" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_cep" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_cidade" text;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco_estado" text;

-- Conferência (a S-C63 existiu porque ninguém rodou esta parte):
--
--   SELECT table_name, count(*) FROM information_schema.columns
--    WHERE (table_name = 'leads' AND column_name IN ('cpf','rg','estado_civil',
--          'profissao','nascimento','email','endereco_logradouro',
--          'endereco_numero','endereco_complemento','endereco_bairro',
--          'endereco_cep','endereco_cidade','endereco_estado'))
--       OR (table_name = 'contratos' AND column_name IN ('rg','estado_civil',
--          'profissao','nascimento','email','endereco_logradouro',
--          'endereco_numero','endereco_complemento','endereco_bairro',
--          'endereco_cep','endereco_cidade','endereco_estado'))
--    GROUP BY table_name;
--
-- Esperado: contratos 12 · leads 13.
