-- P4/E237 (decidida em 15/08/2026: a correção da cláusula 9ª é pelo IPCA) — o
-- índice INFORMADO por competência, por loja. Aplicado no `heliumdb` (dev) em 2026-08-15.

CREATE TABLE "indices_monetarios" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"indice" text DEFAULT 'IPCA' NOT NULL,
	"competencia" text NOT NULL,
	"variacao_pct" numeric(8, 4) NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" text,
	CONSTRAINT "indices_monetarios_loja_id_indice_competencia_unique" UNIQUE("loja_id","indice","competencia")
);

ALTER TABLE "indices_monetarios" ADD CONSTRAINT "indices_monetarios_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;