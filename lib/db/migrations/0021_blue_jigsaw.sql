CREATE TYPE "public"."avaria_tipo" AS ENUM('LIMPEZA', 'DANO');--> statement-breakpoint
ALTER TABLE "avarias" ADD COLUMN "tipo" "avaria_tipo" DEFAULT 'DANO' NOT NULL;--> statement-breakpoint
ALTER TABLE "avarias" ADD COLUMN "justificativa_da_taxa" text;