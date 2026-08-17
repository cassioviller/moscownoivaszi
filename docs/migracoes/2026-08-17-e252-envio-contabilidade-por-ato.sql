-- E252/S-R6 — o envio à contabilidade passa a ser por ATO, e o que já foi
-- declarado continua declarado.
--
-- `parcelas.enviado_contabilidade_em` é coluna POR LINHA, e a parcela recebe em
-- pedaços (E49). Declarada com R$ 400,00 e completada depois com R$ 600,00, ela
-- já tem o carimbo — e o `isNull` do próximo envio a excluía: **os R$ 600,00
-- não entravam em pacote nenhum.** Dinheiro recebido que nunca é declarado.
--
-- O conserto que o lote de higiene (A6) aplicou ao carimbo IRMÃO — limpar
-- `conciliado_em` quando chega pedaço novo — está ERRADO aqui: limpar faz a
-- parcela INTEIRA voltar ao pacote seguinte e declara os R$ 400,00 duas vezes,
-- R$ 1.400,00 sobre R$ 1.000,00 recebidos. Conferir é repetível; declarar é de
-- mão única.
--
-- A tabela abaixo é irmã de `conciliacao_de_recebimentos` (E235) e tem a mesma
-- chave: `ato_id` é o id da linha `PARCELA_RECEBIDA` da trilha (`audit_log`), o
-- mesmo número que o recibo da cláusula 7ª cita. `parcelas.enviado_contabilidade_em`
-- FICA e passa a ser DERIVADO — recebe o instante quando todos os atos válidos
-- da parcela estão declarados —, de modo que o índice parcial das não enviadas
-- continue barato e a parcela SEM ato (o legado, o seed) continue sendo
-- carimbada direto.
--
-- ## O BACKFILL, e por que ele não é opcional
--
-- Sem ele, a primeira execução depois desta migração encontra as parcelas já
-- carimbadas com ZERO atos declarados e **redeclara tudo**: cada recebimento
-- que a contadora já recebeu volta num pacote novo. O carimbo da linha é a
-- prova de que aqueles atos foram declarados, e é dele que a linha por ato
-- nasce — com a data do envio original, que é um fato, não um estado.
--
-- **Neste banco a população é ZERO, e foi medida.** No `heliumdb` em
-- 17/08/2026: `enviado_contabilidade_em` é NULL nas **322 parcelas**
-- (19 PREVISTA · 101 PARCIAL · 202 PAGA) e nos **0 pagamentos** — ninguém
-- fechou um mês no banco de dev. É a instalação REAL que recebe este backfill,
-- e é por ela que ele está escrito.
--
-- O corte do ESTORNO entra na seleção: o estorno deste repositório é
-- tudo-ou-nada (E49) e anula todos os atos anteriores a ele, então o backfill
-- só declara os atos posteriores ao último estorno da parcela — a mesma leitura
-- que `recibosDaParcela` faz (`RECEBIMENTO_ESTORNADO` da parcela, e
-- `CONTRATO_CANCELADO` com `destinoPago: 'estornar'` do contrato dela).
--
-- Roda UMA vez, e dentro de `BEGIN`/`COMMIT`: numa segunda execução o
-- `CREATE TABLE` reprova, a transação inteira desfaz e o banco não fica pela
-- metade. O BACKFILL sozinho é idempotente (`ON CONFLICT (ato_id) DO NOTHING`),
-- para quem precisar reexecutá-lo depois de a tabela já existir.
BEGIN;

CREATE TABLE "envio_contabilidade_de_recebimentos" (
	"ato_id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"parcela_id" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_por" text
);

ALTER TABLE "envio_contabilidade_de_recebimentos" ADD CONSTRAINT "envio_contabilidade_de_recebimentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "envio_contabilidade_de_recebimentos" ADD CONSTRAINT "envio_contabilidade_de_recebimentos_parcela_id_parcelas_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcelas"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "envio_contabilidade_de_recebimentos_loja_idx" ON "envio_contabilidade_de_recebimentos" USING btree ("loja_id");
CREATE INDEX "envio_contabilidade_de_recebimentos_parcela_idx" ON "envio_contabilidade_de_recebimentos" USING btree ("parcela_id");

-- O backfill: cada ato VÁLIDO de uma parcela já carimbada nasce declarado, com
-- a data do envio original.
WITH carimbadas AS (
  SELECT p.id, p.loja_id, p.contrato_id, p.enviado_contabilidade_em
    FROM parcelas p
   WHERE p.enviado_contabilidade_em IS NOT NULL
),
corte AS (
  -- O último estorno de cada parcela — os atos anteriores a ele foram anulados
  -- e não são recibo de nada.
  SELECT c.id AS parcela_id, max(a.criado_em) AS quando
    FROM carimbadas c
    JOIN audit_log a
      ON a.loja_id = c.loja_id
     AND (
          (a.acao = 'RECEBIMENTO_ESTORNADO' AND a.entidade_id = c.id)
       OR (a.acao = 'CONTRATO_CANCELADO' AND a.entidade_id = c.contrato_id
           AND a.detalhe ->> 'destinoPago' = 'estornar')
         )
   GROUP BY c.id
)
INSERT INTO envio_contabilidade_de_recebimentos (ato_id, loja_id, parcela_id, enviado_em, enviado_por)
SELECT a.id, c.loja_id, c.id, c.enviado_contabilidade_em,
       'backfill E252 (o carimbo da linha já declarava estes atos)'
  FROM carimbadas c
  JOIN audit_log a ON a.loja_id = c.loja_id AND a.acao = 'PARCELA_RECEBIDA' AND a.entidade_id = c.id
  LEFT JOIN corte ON corte.parcela_id = c.id
 WHERE corte.quando IS NULL OR a.criado_em > corte.quando
    ON CONFLICT (ato_id) DO NOTHING;

-- Conferência, POR LOJA (num banco de duas lojas o total agregado esconde o
-- que interessa — a lição da S-R9): quantas parcelas estavam carimbadas,
-- quantas ficaram com ato declarado, e quantas seguem SEM ato — que são as do
-- legado e do seed, declaradas pela linha, e é assim que devem ficar.
SELECT p.loja_id,
       count(*) AS parcelas_carimbadas,
       count(*) FILTER (WHERE e.n > 0) AS com_ato_declarado,
       count(*) FILTER (WHERE e.n IS NULL) AS sem_ato_declarado,
       coalesce(sum(e.n), 0) AS atos_declarados
  FROM parcelas p
  LEFT JOIN (
        SELECT parcela_id, count(*) AS n
          FROM envio_contabilidade_de_recebimentos GROUP BY parcela_id
       ) e ON e.parcela_id = p.id
 WHERE p.enviado_contabilidade_em IS NOT NULL
 GROUP BY p.loja_id
 ORDER BY p.loja_id;

COMMIT;
