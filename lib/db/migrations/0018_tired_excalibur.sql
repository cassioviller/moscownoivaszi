ALTER TYPE "public"."parcela_origem" ADD VALUE 'REAJUSTE_DATA';--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "reajustes_de_data" integer DEFAULT 0 NOT NULL;