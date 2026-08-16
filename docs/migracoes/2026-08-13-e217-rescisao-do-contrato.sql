-- E217 — a rescisão calcula (contrato: 8ª §2º, 11ª, 12ª, 13ª §3º, 18ª).
--
-- Escrito em 16/08/2026 (E2 da conferência do contrato): o E217 era o único
-- épico com DDL da trilha sem o script em `docs/migracoes/` — a migração
-- drizzle existe (`0027_red_the_order.sql`), e um banco existente "só chega lá
-- por esse script" (`replit.md`). Idempotente: roda duas vezes sem erro.
--
-- Três mudanças, e nenhuma tabela nova:
--
-- 1. `conta_pagar_tipo` ganha DEVOLUCAO — a devolução que a rescisão manda
--    (13ª §3º, 30 dias) nasce como conta a pagar da loja, o mesmo lugar que já
--    representa dívida da loja. Desde o E241 ela NÃO nasce sob
--    `destinoPago: "estornar"` (o estorno já é a devolução).
-- 2. `contratos.prazo_devolucao_reserva_dias` — o prazo pactuado da 18ª
--    (D3: nulo = cláusula não pactuada). A tela do E224 o preenche no diálogo
--    das datas (S-C211).
-- 3. `contas_pagar.origem_contrato_id` — o vínculo da DEVOLUCAO com o contrato
--    rescindido (FK ON DELETE SET NULL: apagar o contrato não apaga a dívida
--    da loja; ela perde a origem).
--
-- O `ALTER TYPE … ADD VALUE` não roda dentro de transação em Postgres < 12 e,
-- em qualquer versão, o valor novo só pode ser USADO depois do commit — por
-- isso ele vem antes e fora do BEGIN, como no E212.
ALTER TYPE conta_pagar_tipo ADD VALUE IF NOT EXISTS 'DEVOLUCAO';

BEGIN;

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS prazo_devolucao_reserva_dias integer;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS origem_contrato_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contas_pagar_origem_contrato_id_contratos_id_fk'
  ) THEN
    ALTER TABLE contas_pagar
      ADD CONSTRAINT contas_pagar_origem_contrato_id_contratos_id_fk
      FOREIGN KEY (origem_contrato_id) REFERENCES contratos(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

COMMIT;
