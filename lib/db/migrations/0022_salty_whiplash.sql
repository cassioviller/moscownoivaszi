ALTER TYPE "public"."parcela_origem" ADD VALUE 'ATRASO_DEVOLUCAO';--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "atraso_parcela_id" text;