-- E232/S-C1 — ONDE a avaria foi constatada (cláusula 5ª §3º).
--
-- O sistema só conhecia avaria na DEVOLUÇÃO, e a 5ª §3º manda a LOCADORA
-- substituir a peça quando o defeito é visto NO ATO DA LOCAÇÃO — sem o
-- registro, o dano que a noiva recebeu pronto não tinha onde existir, e o
-- caminho natural era cobrá-lo dela na volta. O default preserva todas as
-- linhas existentes (e o comportamento de quem não escolher): constatada na
-- devolução, o ciclo de sempre.
--
-- Aplicado no `heliumdb` (dev) em 2026-08-14. Um banco existente roda:

ALTER TABLE avarias
  ADD COLUMN IF NOT EXISTS constatada_em text NOT NULL DEFAULT 'DEVOLUCAO';
