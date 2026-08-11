CREATE INDEX "bloqueio_vestidos_loja_cancelado_idx" ON "bloqueio_vestidos" USING btree ("loja_id","cancelado_em");--> statement-breakpoint
CREATE INDEX "orcamento_itens_orcamento_idx" ON "orcamento_itens" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "orcamentos_loja_status_idx" ON "orcamentos" USING btree ("loja_id","status");--> statement-breakpoint
CREATE INDEX "orcamentos_lead_idx" ON "orcamentos" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "registros_cobranca_lead_idx" ON "registros_cobranca" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "registros_cobranca_loja_idx" ON "registros_cobranca" USING btree ("loja_id");