-- S16 — quem tem contrato passa a ter a data do contrato.
--
-- `leads.contrato_fechado_em` era efeito do AVANÇO da etapa, não do contrato:
-- o carimbo morava dentro do `if (etapaNova !== lead.etapa)` de
-- `routes/contratos.ts`. Quem já estava adiante no funil quando o contrato foi
-- registrado não avançava etapa nenhuma — `avancarEtapaLead` devolve a mesma —
-- e ficava sem carimbo para sempre. O funil aceita PULAR
-- (`transicaoLeadValida` só exige `iPara > iDe`), então "a noiva já está
-- EM_PROVAS quando o contrato entra" é caminho normal, não estado corrompido.
-- A segunda porta conspirava: o `carimboEtapa` de `routes/leads.ts:45` só
-- carimba quando a etapa é `CONTRATO_FECHADO` EXATAMENTE.
--
-- Quem lê a coluna é o `comContrato` de `/leads/sazonalidade`
-- (`routes/leads.ts:451`), que filtra por `is not null`: a noiva sem carimbo
-- não é contada como "já fechou" na curva que diz quando falta vestido.
--
-- O CÓDIGO já foi consertado (o carimbo saiu de dentro do `if`), com vermelho
-- literal em `lote6-estados-api.test.ts`:
--
--   × fechar contrato carimba a data mesmo quando a etapa não avança (S16)
--     AssertionError: expected null to be an instance of Date
--
-- Este script é o passivo: um banco que já existe tem leads carimbados por um
-- código que só carimbava metade dos casos.
--
-- A FONTE É `contratos.fechado_em`, e não `created_at`. As duas coincidem em
-- produção — `routes/contratos.ts:518` grava `new Date()` no INSERT e não há
-- caminho que deixe o cliente escolher a data —, mas divergem em qualquer banco
-- que tenha recebido fixtures escritas direto: neste banco de dev as 836 linhas
-- divergem, com média de 51 dias e máximo de 201. `fechado_em` é o que o nome
-- da coluna promete e o que um relatório de sazonalidade precisa.
--
-- MEDIDO NESTE BANCO ANTES DE RODAR: 836 leads têm contrato e **3 estão sem
-- carimbo** (0,36%), os três em etapa `NOVO` — inserções diretas de fixture,
-- nenhuma passou pela rota. As datas a gravar vão de 2026-07-06 a 2026-07-22.
-- O número é pequeno aqui e não diz nada sobre um banco de ateliê: lá o buraco
-- é do tamanho de quantas noivas fecharam contrato já estando em provas.
--
-- A ETAPA NÃO É MEXIDA, de propósito. Um lead em `NOVO` com contrato também
-- está errado, mas isso é outra afirmação — reescrever o funil de leads reais
-- por dedução de uma migração é mais caro que o defeito que ela conserta.
-- Este script toca a coluna que a S16 nomeia, e só ela.

BEGIN;

-- Guarda: a coluna existe com o nome esperado. Se o schema mudou, o `UPDATE`
-- abaixo falharia de todo jeito — a guarda existe para falhar dizendo o quê.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'contrato_fechado_em'
  ) THEN
    RAISE EXCEPTION 'leads.contrato_fechado_em não existe neste banco';
  END IF;
END $$;

-- O backfill. `min(fechado_em)` porque um lead pode ter tido mais de um
-- contrato ao longo do tempo (a regra só proíbe dois ATIVOS ao mesmo tempo —
-- `CONTRATO_ATIVO_DUPLICADO`, `routes/contratos.ts:192`), e o marco do funil é
-- o PRIMEIRO: é quando aquela noiva deixou de ser negociação.
--
-- Contrato cancelado conta, e isso espelha a rota: o carimbo é gravado quando o
-- contrato nasce e nunca é apagado quando ele é cancelado. Quem quiser a régua
-- "só contratos vivos" muda os dois lugares juntos, não este script sozinho.
UPDATE leads l
SET contrato_fechado_em = c.quando,
    updated_at = now()
FROM (
  SELECT lead_id, min(fechado_em) AS quando
  FROM contratos
  GROUP BY lead_id
) c
WHERE c.lead_id = l.id
  AND l.contrato_fechado_em IS NULL;

-- Confere: nenhum lead com contrato pode sobrar sem carimbo.
SELECT count(*) AS leads_com_contrato,
       count(*) FILTER (WHERE l.contrato_fechado_em IS NULL) AS ainda_sem_carimbo
FROM leads l
WHERE EXISTS (SELECT 1 FROM contratos c WHERE c.lead_id = l.id);

COMMIT;
