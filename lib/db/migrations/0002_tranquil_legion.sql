CREATE TYPE "public"."ajuste_tipo" AS ENUM('AJUSTE', 'CONFECCAO');--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "tipo" "ajuste_tipo" DEFAULT 'AJUSTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "custo" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "ajuste_id" text;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE set null ON UPDATE no action;