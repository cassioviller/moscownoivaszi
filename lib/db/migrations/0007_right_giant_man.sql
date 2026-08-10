ALTER TABLE "itens_estoque" DROP CONSTRAINT "itens_estoque_loja_id_nome_tamanho_unique";--> statement-breakpoint
CREATE INDEX "itens_estoque_loja_idx" ON "itens_estoque" USING btree ("loja_id");--> statement-breakpoint
CREATE INDEX "atendimentos_loja_contato_idx" ON "atendimentos" USING btree ("loja_id","contatado_em");--> statement-breakpoint
CREATE INDEX "avarias_parcela_id_idx" ON "avarias" USING btree ("parcela_id");--> statement-breakpoint
ALTER TABLE "itens_estoque" ADD CONSTRAINT "itens_estoque_loja_nome_tamanho_unq" UNIQUE("loja_id","nome","tamanho");