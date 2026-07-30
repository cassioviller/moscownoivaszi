-- E91 — a fronteira da loja: nenhum id entra sem prova de pertencimento.
--
-- Duas mudanças de DDL sobre as MESMAS tabelas, numa migração só (o cuidado (a)
-- do épico: uma segunda janela de aplicação é risco por nada).
--
-- 1. B2 🔴 — as FKs de vendedora deixam de ser ON DELETE CASCADE.
--    O `replit.md` fixa a regra: "campos de autoria são ON DELETE SET NULL,
--    porque perder quem fez é recuperável e perder o registro do que aconteceu
--    não é". Estas quatro colunas são `NOT NULL`, então `SET NULL` sequer é
--    possível — a única saída honesta é RECUSAR o delete. Com `CASCADE`,
--    `DELETE /api/admin/usuarios/:id` apagava os contratos da vendedora, as
--    parcelas PAGAS (com `recebido_em`), o snapshot de itens, os orçamentos, os
--    atendimentos e os fechamentos de comissão: o caixa realizado, o DRE e a
--    ficha da noiva mudavam para trás, sem erro, sem confirmação e sem trilha.
--    O caminho suportado para quem sai do ateliê continua sendo INATIVAR
--    (`usuarios.ativo = false`), que preserva tudo.
--
-- 2. B10 🟡 — índice composto começando por `loja_id` nas tabelas quentes.
--    O Postgres NÃO cria índice para FK: `parcelas.loja_id`, `pagamentos.loja_id`
--    e `contratos.loja_id` eram colunas sem estrutura nenhuma, e `loja_id = ?` é
--    a primeira condição de literalmente toda query do sistema. Com o multi-loja
--    (E76) e três anos de histórico, cada chamada do fluxo, do DRE, do alerta de
--    caixa (o sino, a cada poll) e do dashboard lê a tabela inteira de TODAS as
--    lojas para responder por uma.
--
-- Em transação e com GUARDA: aborta se o banco não estiver no estado esperado,
-- em vez de aplicar meio caminho. `drizzle-kit push` não sabe trocar a ação de
-- uma FK sem dropar/recriar (e trava sem TTY quando pergunta), então o DDL vem
-- por psql e o push depois só confirma a convergência.

BEGIN;

DO $$
DECLARE
  faltando text;
BEGIN
  -- Guarda 1: as quatro FKs existem com o nome que o Drizzle gera.
  SELECT string_agg(esperada, ', ') INTO faltando
  FROM (VALUES
    ('contratos_vendedora_id_usuarios_id_fk'),
    ('orcamentos_vendedora_id_usuarios_id_fk'),
    ('atendimentos_vendedora_id_usuarios_id_fk'),
    ('comissao_regras_vendedora_id_usuarios_id_fk'),
    ('comissao_fechamentos_vendedora_id_usuarios_id_fk')
  ) AS v(esperada)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = v.esperada AND contype = 'f'
  );
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'estado inesperado: FK(s) ausente(s) — %', faltando;
  END IF;

  -- Guarda 2: elas ainda estão em CASCADE ('c'). Se já forem 'r' (restrict),
  -- a migração já rodou — abortar em vez de dropar e recriar por nada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_vendedora_id_usuarios_id_fk' AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'E91 já aplicado: contratos.vendedora_id não está mais em CASCADE';
  END IF;
END
$$;

-- ─────────────── 1. FKs de vendedora: CASCADE → RESTRICT ───────────────
-- O nome da constraint é preservado: é o que o `drizzle-kit push` procura.

ALTER TABLE contratos
  DROP CONSTRAINT contratos_vendedora_id_usuarios_id_fk,
  ADD CONSTRAINT contratos_vendedora_id_usuarios_id_fk
    FOREIGN KEY (vendedora_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

ALTER TABLE orcamentos
  DROP CONSTRAINT orcamentos_vendedora_id_usuarios_id_fk,
  ADD CONSTRAINT orcamentos_vendedora_id_usuarios_id_fk
    FOREIGN KEY (vendedora_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

-- O atendimento é O QUE ACONTECEU com a noiva (a prova, o desfecho, o
-- `atendido_em`). B2 o lista no raio da explosão; sem ele, excluir a vendedora
-- continuaria apagando o histórico da ficha da noiva.
ALTER TABLE atendimentos
  DROP CONSTRAINT atendimentos_vendedora_id_usuarios_id_fk,
  ADD CONSTRAINT atendimentos_vendedora_id_usuarios_id_fk
    FOREIGN KEY (vendedora_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

-- A escada versionada é o que EXPLICA cada fechamento passado.
ALTER TABLE comissao_regras
  DROP CONSTRAINT comissao_regras_vendedora_id_usuarios_id_fk,
  ADD CONSTRAINT comissao_regras_vendedora_id_usuarios_id_fk
    FOREIGN KEY (vendedora_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

-- O fechamento é dinheiro que a loja PAGOU.
ALTER TABLE comissao_fechamentos
  DROP CONSTRAINT comissao_fechamentos_vendedora_id_usuarios_id_fk,
  ADD CONSTRAINT comissao_fechamentos_vendedora_id_usuarios_id_fk
    FOREIGN KEY (vendedora_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

-- ─────────────── 2. Índices por loja nas tabelas quentes ───────────────
-- Nomes iguais aos declarados no schema Drizzle, para o push convergir.

CREATE INDEX IF NOT EXISTS parcelas_loja_vencimento_idx
  ON parcelas (loja_id, vencimento);
CREATE INDEX IF NOT EXISTS parcelas_loja_recebido_em_idx
  ON parcelas (loja_id, recebido_em);
CREATE INDEX IF NOT EXISTS contas_pagar_loja_vencimento_idx
  ON contas_pagar (loja_id, vencimento);
CREATE INDEX IF NOT EXISTS pagamentos_loja_data_idx
  ON pagamentos (loja_id, data);
CREATE INDEX IF NOT EXISTS contratos_loja_fechado_em_idx
  ON contratos (loja_id, fechado_em);
CREATE INDEX IF NOT EXISTS leads_loja_etapa_idx
  ON leads (loja_id, etapa);
-- Lidos por join em toda montagem de extrato e de contrato/PDF.
CREATE INDEX IF NOT EXISTS pagamento_itens_pagamento_idx
  ON pagamento_itens (pagamento_id);
CREATE INDEX IF NOT EXISTS contrato_itens_contrato_idx
  ON contrato_itens (contrato_id);

COMMIT;

-- Nota deliberada: `recorrencias.usuario_id` continua em CASCADE. Ela é
-- NULLABLE e não é histórico — é a CONFIGURAÇÃO do salário de alguém; a conta a
-- pagar já gerada sobrevive (`contas_pagar.colaborador_id` é SET NULL e
-- `recorrencia_id` é texto solto). Fica registrado aqui para quem for revisitar.
