-- E48 — salarios_recorrentes vira recorrencias (o motor passa a saber pagar
-- aluguel, assinatura e fornecedor fixo, não só gente).
--
-- Em transação e com GUARDA: aborta se o banco não estiver no estado esperado,
-- em vez de aplicar meio caminho. `drizzle-kit push` trava sem TTY quando há
-- coluna a renomear (pergunta "renomeou ou removeu?"), então o DDL vem por
-- psql e o push depois só confirma a convergência.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.recorrencias') IS NOT NULL THEN
    RAISE EXCEPTION 'E48 já aplicado: a tabela recorrencias existe';
  END IF;
  IF to_regclass('public.salarios_recorrentes') IS NULL THEN
    RAISE EXCEPTION 'estado inesperado: salarios_recorrentes não existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' AND column_name = 'salario_recorrente_id'
  ) THEN
    RAISE EXCEPTION 'estado inesperado: contas_pagar.salario_recorrente_id não existe';
  END IF;
END
$$;

-- 1. A tabela e seus artefatos.
ALTER TABLE salarios_recorrentes RENAME TO recorrencias;
ALTER INDEX salarios_recorrentes_pkey RENAME TO recorrencias_pkey;
ALTER TABLE recorrencias RENAME CONSTRAINT salarios_recorrentes_loja_id_lojas_id_fk
  TO recorrencias_loja_id_lojas_id_fk;
ALTER TABLE recorrencias RENAME CONSTRAINT salarios_recorrentes_usuario_id_usuarios_id_fk
  TO recorrencias_usuario_id_usuarios_id_fk;

-- 2. O que a recorrência passa a saber. `tipo` entra com default para as linhas
--    existentes (todas são salário) e perde o default em seguida: recorrência
--    nova tem de DECLARAR o que é.
ALTER TABLE recorrencias ADD COLUMN tipo text NOT NULL DEFAULT 'SALARIO';
ALTER TABLE recorrencias ALTER COLUMN tipo DROP DEFAULT;
ALTER TABLE recorrencias ADD COLUMN descricao text;
ALTER TABLE recorrencias ADD COLUMN categoria text;
ALTER TABLE recorrencias ADD COLUMN fornecedor text;

-- 3. Despesa não tem colaborador.
ALTER TABLE recorrencias ALTER COLUMN usuario_id DROP NOT NULL;

-- 4. "Um salário ativo por pessoa" continua valendo — e agora diz isso no
--    predicado. Sem `usuario_id IS NOT NULL` o índice funcionaria igual (NULLs
--    são distintos num unique btree), mas leria como se restringisse despesa.
DROP INDEX salarios_recorrentes_ativo_unico;
CREATE UNIQUE INDEX recorrencias_salario_ativo_unico
  ON recorrencias (loja_id, usuario_id)
  WHERE ativo = true AND usuario_id IS NOT NULL;

-- 5. O rastro na conta gerada.
ALTER TABLE contas_pagar RENAME COLUMN salario_recorrente_id TO recorrencia_id;

-- 6. O BACKSTOP contra dupla geração sob concorrência. O predicado era
--    `tipo = 'SALARIO'` — ou seja, a despesa recorrente nasceria SEM a rede
--    que protege o salário: dois POSTs simultâneos leem "nada feito" e ambos
--    inserem. `recorrencia_id IS NOT NULL` cobre toda conta GERADA, qualquer
--    tipo, e continua deixando de fora a conta lançada à mão.
DROP INDEX contas_pagar_salario_unico;
CREATE UNIQUE INDEX contas_pagar_recorrencia_unica
  ON contas_pagar (loja_id, competencia, recorrencia_id)
  WHERE recorrencia_id IS NOT NULL;

COMMIT;
