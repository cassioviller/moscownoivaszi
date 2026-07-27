-- E102/C5 — o estorno de comissão passa a ser absorvido PROPORCIONALMENTE.
--
-- O DEFEITO. O estorno §6.4 era tudo-ou-nada por fechamento: se o mês não
-- absorvia o estorno INTEIRO, nada era reconciliado e o **valor cheio** voltava
-- a pesar no mês seguinte — mas a base daquele mês já tinha sido consumida.
--
-- O caso medido pela trilha C: a vendedora vende R$ 38.000 em três meses, deve
-- R$ 20.000 de estorno, e recebe **R$ 500 em vez de R$ 1.800**. Os R$ 20.000
-- foram descontados TRÊS vezes. É dinheiro de pessoa, calculado errado a favor
-- da loja, sem nenhuma linha na tela que denuncie — e `minha-comissao` ainda
-- mostrava "Já com R$ 20.000,00 de estorno abatido" num mês em que ela recebeu
-- zero.
--
-- Havia teste blindando o comportamento (`lote9-comissao-api.test.ts:317`,
-- chamado "estorno maior que o mês CARREGA"): ele muda de asserção junto, porque
-- afirmava o acidente.
--
-- A DECISÃO DO DONO (2026-07-25): absorver proporcionalmente. O mês abate
-- `min(bruto, estornoPendente)` e o resto fica pendente para o mês seguinte.
-- **Vale daqui para frente; fechamentos passados NÃO são recalculados** — o
-- caso extremo (a vendedora que parou de vender) continua sendo resolvido pela
-- baixa manual do I10.
--
-- A COLUNA. `estorno_absorvido` guarda quanto DESTE fechamento foi absorvido.
-- Ela é necessária porque o modelo antigo só sabia marcar CONTRATOS inteiros
-- como reconciliados (`contratos.comissao_estornada_em`), e absorção parcial não
-- cabe em granularidade de contrato: um cancelamento de R$ 20.000 abatido pela
-- metade não é "meio contrato reconciliado".
--
-- Como o pendente passa a ser lido:
--   pendente = Σ(contratos cancelados ainda não reconciliados)
--            − Σ(estorno_absorvido dos fechamentos que NÃO reconciliaram nenhum)
--
-- Os fechamentos que absorveram tudo carimbam os contratos, e esses saem da
-- primeira soma — por isso só os PARCIAIS entram na segunda. Reabrir um
-- fechamento parcial some com a linha e devolve o valor ao pendente, sem código
-- extra: a conta é derivada, não acumulada.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comissao_fechamentos' AND column_name = 'estorno_absorvido'
  ) THEN
    RAISE EXCEPTION 'E102: comissao_fechamentos.estorno_absorvido já existe';
  END IF;
END $$;

ALTER TABLE comissao_fechamentos
  ADD COLUMN estorno_absorvido numeric(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN comissao_fechamentos.estorno_absorvido IS
  'E102: quanto do estorno pendente ESTE fechamento absorveu. Parcial quando o mês não cobre tudo; o resto carrega.';

-- Sem backfill, e por decisão explícita do dono: fechamentos passados NÃO são
-- recalculados. `DEFAULT 0` nas linhas antigas é a leitura correta delas — elas
-- foram tudo-ou-nada, e quem absorveu tudo já carimbou os contratos.

COMMIT;
