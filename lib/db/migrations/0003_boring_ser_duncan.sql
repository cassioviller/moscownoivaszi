CREATE TABLE "ausencias" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"inicio" date NOT NULL,
	"fim" date NOT NULL,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ausencias_loja_periodo_idx" ON "ausencias" USING btree ("loja_id","inicio","fim");