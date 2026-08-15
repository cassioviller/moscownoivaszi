-- E240/S-O50 (decisão da dona, 15/08/2026) — a CONFECÇÃO ganha prazo próprio.
-- Até aqui o prazo de todo trabalho de agulha era derivado: a próxima prova
-- quando há, senão o casamento da noiva (E170, `casamentoDeReferencia`). A
-- costureira não tinha como dizer "esta eu preciso para o dia 10" quando o
-- casamento é em março — a coluna não existia.
--
-- Uma coluna, nula: `date`, dia no fuso da loja (a mesma convenção das férias
-- do E151). Nulo é "vale a régua derivada" — os 7 ajustes do `heliumdb`
-- (5 confecções, medidas em 15/08) continuam com o prazo saindo do casamento
-- até alguém preencher o campo no diálogo de Nova confecção.
--
-- Um banco existente roda:

ALTER TABLE ajustes
  ADD COLUMN IF NOT EXISTS prazo_proprio date;
