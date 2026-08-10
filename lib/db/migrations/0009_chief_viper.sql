CREATE TYPE "public"."parcela_origem" AS ENUM('PLANO', 'AVULSA', 'AVARIA');--> statement-breakpoint
ALTER TABLE "parcelas" ADD COLUMN "origem" "parcela_origem" DEFAULT 'AVULSA' NOT NULL;