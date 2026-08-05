ALTER TYPE "public"."orcamento_item_tipo" ADD VALUE 'ACESSORIO' BEFORE 'SERVICO';--> statement-breakpoint
ALTER TYPE "public"."orcamento_item_tipo" ADD VALUE 'ESTOQUE' BEFORE 'SERVICO';--> statement-breakpoint
CREATE TABLE "itens_estoque" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"nome" text NOT NULL,
	"tamanho" text,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"preco" numeric(10, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_estoque_loja_id_nome_tamanho_unique" UNIQUE("loja_id","nome","tamanho")
);
--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "item_estoque_id" text;--> statement-breakpoint
ALTER TABLE "contrato_itens" ADD COLUMN "item_estoque_id" text;--> statement-breakpoint
ALTER TABLE "itens_estoque" ADD CONSTRAINT "itens_estoque_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_item_estoque_id_itens_estoque_id_fk" FOREIGN KEY ("item_estoque_id") REFERENCES "public"."itens_estoque"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_itens" ADD CONSTRAINT "contrato_itens_item_estoque_id_itens_estoque_id_fk" FOREIGN KEY ("item_estoque_id") REFERENCES "public"."itens_estoque"("id") ON DELETE set null ON UPDATE no action;