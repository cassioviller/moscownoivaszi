CREATE TYPE "public"."estado_civil" AS ENUM('SOLTEIRA', 'CASADA', 'DIVORCIADA', 'VIUVA', 'SEPARADA', 'UNIAO_ESTAVEL');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "rg" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "estado_civil" "estado_civil";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profissao" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "nascimento" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_logradouro" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_numero" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_complemento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_bairro" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_cep" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_cidade" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco_estado" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "rg" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "estado_civil" "estado_civil";--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "profissao" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "nascimento" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_logradouro" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_numero" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_complemento" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_bairro" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_cep" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_cidade" text;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "endereco_estado" text;