-- E49 — a parcela ganha o estado PARCIAL: a noiva pagou parte, o dinheiro
-- entrou no caixa e o resto continua devido.
--
-- `ALTER TYPE ... ADD VALUE` NÃO roda dentro de transação em que o valor novo
-- também seja usado (o Postgres precisa do commit do tipo antes), então este
-- script é uma instrução só, sem BEGIN — e `IF NOT EXISTS` o torna idempotente.
--
-- Posição importa: PARCIAL entra ENTRE prevista e paga, que é a ordem do ciclo
-- de vida. `enum_range` passa a devolver PREVISTA, PARCIAL, PAGA, CANCELADA.

ALTER TYPE parcela_status ADD VALUE IF NOT EXISTS 'PARCIAL' AFTER 'PREVISTA';

-- Nada a fazer com as linhas existentes: PARCIAL é estado NOVO, e nenhuma
-- parcela antiga era parcial (o status era binário — ou o valor cheio estava
-- lá, ou a parcela seguia PREVISTA).
