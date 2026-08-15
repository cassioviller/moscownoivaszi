CREATE TABLE "conciliacao_de_recebimentos" (
	"ato_id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"parcela_id" text NOT NULL,
	"conciliado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"conciliado_por" text
);
--> statement-breakpoint
ALTER TABLE "conciliacao_de_recebimentos" ADD CONSTRAINT "conciliacao_de_recebimentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacao_de_recebimentos" ADD CONSTRAINT "conciliacao_de_recebimentos_parcela_id_parcelas_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcelas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conciliacao_de_recebimentos_loja_idx" ON "conciliacao_de_recebimentos" USING btree ("loja_id");--> statement-breakpoint
CREATE INDEX "conciliacao_de_recebimentos_parcela_idx" ON "conciliacao_de_recebimentos" USING btree ("parcela_id");