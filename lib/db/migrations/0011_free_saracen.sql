ALTER TABLE "vestido_atributos" DROP CONSTRAINT "vestido_atributos_atributo_id_atributos_id_fk";
--> statement-breakpoint
ALTER TABLE "vestido_atributos" DROP CONSTRAINT "vestido_atributos_opcao_id_atributo_opcoes_id_fk";
--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" DROP CONSTRAINT "lead_interesse_atributos_atributo_id_atributos_id_fk";
--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" DROP CONSTRAINT "lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk";
--> statement-breakpoint
ALTER TABLE "regra_disponibilidade" ADD COLUMN "estoque_lavagem_dias_depois" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vestido_atributos" ADD CONSTRAINT "vestido_atributos_atributo_id_atributos_id_fk" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestido_atributos" ADD CONSTRAINT "vestido_atributos_opcao_id_atributo_opcoes_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."atributo_opcoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" ADD CONSTRAINT "lead_interesse_atributos_atributo_id_atributos_id_fk" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" ADD CONSTRAINT "lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."atributo_opcoes"("id") ON DELETE cascade ON UPDATE no action;