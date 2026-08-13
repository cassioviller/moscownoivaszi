ALTER TABLE "regra_disponibilidade" ADD COLUMN "retirada_dias" jsonb DEFAULT '[2,3,4,5,6]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "regra_disponibilidade" ADD COLUMN "retirada_abertura_minutos" integer DEFAULT 630 NOT NULL;--> statement-breakpoint
ALTER TABLE "regra_disponibilidade" ADD COLUMN "retirada_fechamento_minutos" integer DEFAULT 1140 NOT NULL;--> statement-breakpoint
ALTER TABLE "regra_disponibilidade" ADD COLUMN "retirada_fechamento_sabado_minutos" integer DEFAULT 1080 NOT NULL;