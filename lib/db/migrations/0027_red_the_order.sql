ALTER TYPE "public"."conta_pagar_tipo" ADD VALUE 'DEVOLUCAO';--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "prazo_devolucao_reserva_dias" integer;--> statement-breakpoint
ALTER TABLE "contas_pagar" ADD COLUMN "origem_contrato_id" text;--> statement-breakpoint
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_origem_contrato_id_contratos_id_fk" FOREIGN KEY ("origem_contrato_id") REFERENCES "public"."contratos"("id") ON DELETE set null ON UPDATE no action;