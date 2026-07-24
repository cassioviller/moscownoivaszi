CREATE TYPE "public"."ajuste_status" AS ENUM('PENDENTE', 'FEITO');--> statement-breakpoint
CREATE TYPE "public"."atendimento_desfecho" AS ENUM('RESERVOU', 'VAI_PENSAR', 'NAO_SERVIU');--> statement-breakpoint
CREATE TYPE "public"."atendimento_situacao" AS ENUM('AGENDADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU');--> statement-breakpoint
CREATE TYPE "public"."atendimento_tipo" AS ENUM('ATENDIMENTO', 'PROVA');--> statement-breakpoint
CREATE TYPE "public"."atributo_tipo" AS ENUM('OPCAO_UNICA', 'ESCALA');--> statement-breakpoint
CREATE TYPE "public"."bloqueio_tipo" AS ENUM('RESERVA_CASAMENTO', 'MANUTENCAO');--> statement-breakpoint
CREATE TYPE "public"."conta_pagar_status" AS ENUM('PREVISTA', 'PAGA');--> statement-breakpoint
CREATE TYPE "public"."conta_pagar_tipo" AS ENUM('DESPESA', 'FORNECEDOR', 'SALARIO', 'COMISSAO');--> statement-breakpoint
CREATE TYPE "public"."contrato_status" AS ENUM('ATIVO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."desconto_tipo" AS ENUM('PERCENTUAL', 'VALOR');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento" AS ENUM('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."lead_etapa" AS ENUM('NOVO', 'INTERESSES_PREENCHIDOS', 'ATENDIMENTO_AGENDADO', 'EM_ATENDIMENTO', 'ORCAMENTO_ABERTO', 'CONTRATO_FECHADO', 'EM_PROVAS', 'RETIRADO', 'CASAMENTO_REALIZADO', 'DEVOLVIDO', 'PERDIDO');--> statement-breakpoint
CREATE TYPE "public"."lead_origem" AS ENUM('LOJA', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."orcamento_item_tipo" AS ENUM('VESTIDO', 'SERVICO', 'AJUSTE');--> statement-breakpoint
CREATE TYPE "public"."orcamento_status" AS ENUM('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO');--> statement-breakpoint
CREATE TYPE "public"."parcela_status" AS ENUM('PREVISTA', 'PAGA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."reserva_status" AS ENUM('EM_MONTAGEM', 'CONFIRMADA', 'CONCLUIDA', 'CANCELADA');--> statement-breakpoint
CREATE TABLE "cabines" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lojas" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"endereco" text,
	"telefone" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regra_disponibilidade" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"prova_dias_antes" integer DEFAULT 14 NOT NULL,
	"prova_duracao" integer DEFAULT 2 NOT NULL,
	"uso_dias_antes" integer DEFAULT 3 NOT NULL,
	"uso_dias_depois" integer DEFAULT 2 NOT NULL,
	"lavagem_dias_depois" integer DEFAULT 7 NOT NULL,
	"atendimento_abertura_hora" integer DEFAULT 9 NOT NULL,
	"atendimento_fechamento_hora" integer DEFAULT 19 NOT NULL,
	CONSTRAINT "regra_disponibilidade_loja_id_unique" UNIQUE("loja_id")
);
--> statement-breakpoint
CREATE TABLE "perfil_overrides_lojas" (
	"loja_id" text NOT NULL,
	"perfil_id" text NOT NULL,
	"acessos_modulos" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfil_overrides_lojas_loja_id_perfil_id_pk" PRIMARY KEY("loja_id","perfil_id")
);
--> statement-breakpoint
CREATE TABLE "perfis" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"acessos_modulos" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"loja_ativa_id" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_lojas" (
	"usuario_id" text NOT NULL,
	"loja_id" text NOT NULL,
	"perfil_id" text NOT NULL,
	CONSTRAINT "usuarios_lojas_usuario_id_loja_id_pk" PRIMARY KEY("usuario_id","loja_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "atributo_opcoes" (
	"id" text PRIMARY KEY NOT NULL,
	"atributo_id" text NOT NULL,
	"valor" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atributos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "atributo_tipo" DEFAULT 'OPCAO_UNICA' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vestido_atributos" (
	"vestido_id" text NOT NULL,
	"atributo_id" text NOT NULL,
	"opcao_id" text NOT NULL,
	CONSTRAINT "vestido_atributos_vestido_id_atributo_id_pk" PRIMARY KEY("vestido_id","atributo_id")
);
--> statement-breakpoint
CREATE TABLE "vestido_fotos" (
	"id" text PRIMARY KEY NOT NULL,
	"vestido_id" text NOT NULL,
	"ordem" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"largura" integer NOT NULL,
	"altura" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vestido_fotos_vestido_id_ordem_unique" UNIQUE("vestido_id","ordem")
);
--> statement-breakpoint
CREATE TABLE "vestidos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"preco_base" numeric(10, 2) NOT NULL,
	"tamanho" text,
	"cor" text,
	"categoria" text,
	"status" text DEFAULT 'ativo' NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vestidos_loja_id_codigo_unique" UNIQUE("loja_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "lead_interesse_atributos" (
	"lead_interesse_id" text NOT NULL,
	"atributo_id" text NOT NULL,
	"opcao_id" text NOT NULL,
	CONSTRAINT "lead_interesse_atributos_lead_interesse_id_atributo_id_pk" PRIMARY KEY("lead_interesse_id","atributo_id")
);
--> statement-breakpoint
CREATE TABLE "lead_interesses" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"algo_a_mais" text,
	"nao_quer_usar" text,
	"teto_orcamento" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_interesses_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"etapa" "lead_etapa" DEFAULT 'NOVO' NOT NULL,
	"noiva_nome" text NOT NULL,
	"noivo_nome" text,
	"cerimonialista" text,
	"whatsapp" text,
	"casamento_data" timestamp with time zone,
	"casamento_horario" text,
	"casamento_local" text,
	"orcamento_aberto_em" timestamp with time zone,
	"contrato_fechado_em" timestamp with time zone,
	"perdida_em" timestamp with time zone,
	"origem" "lead_origem" DEFAULT 'LOJA' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ajuste_checklist_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"ajuste_id" text NOT NULL,
	"descricao" text NOT NULL,
	"feito" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ajustes" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"atendimento_id" text NOT NULL,
	"descricao" text NOT NULL,
	"status" "ajuste_status" DEFAULT 'PENDENTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"cabine_id" text NOT NULL,
	"vendedora_id" text NOT NULL,
	"tipo" "atendimento_tipo" DEFAULT 'ATENDIMENTO' NOT NULL,
	"bloqueio_id" text,
	"inicio" timestamp with time zone NOT NULL,
	"situacao" "atendimento_situacao" DEFAULT 'AGENDADO' NOT NULL,
	"atendido_em" timestamp with time zone,
	"desfecho" "atendimento_desfecho",
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atendimentos_cabine_id_inicio_unique" UNIQUE("cabine_id","inicio"),
	CONSTRAINT "atendimentos_loja_id_vendedora_id_inicio_unique" UNIQUE("loja_id","vendedora_id","inicio")
);
--> statement-breakpoint
CREATE TABLE "bloqueio_vestidos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"vestido_id" text NOT NULL,
	"lead_id" text,
	"tipo" "bloqueio_tipo" NOT NULL,
	"casamento_data" timestamp with time zone,
	"prova_data_real" timestamp with time zone,
	"retirada_data_real" timestamp with time zone,
	"devolucao_data_real" timestamp with time zone,
	"inicio" timestamp with time zone,
	"fim" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"ocupacao_inicio" date,
	"ocupacao_fim" date,
	"observacao" text,
	"reserva_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"casamento_data" timestamp with time zone NOT NULL,
	"status" "reserva_status" DEFAULT 'EM_MONTAGEM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"orcamento_id" text NOT NULL,
	"tipo" "orcamento_item_tipo" NOT NULL,
	"vestido_id" text,
	"descricao" text NOT NULL,
	"valor_unitario" numeric(10, 2) NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"atendimento_id" text,
	"vendedora_id" text NOT NULL,
	"status" "orcamento_status" DEFAULT 'RASCUNHO' NOT NULL,
	"desconto_tipo" "desconto_tipo",
	"desconto_valor" numeric(10, 2),
	"validade" timestamp with time zone,
	"observacoes" text,
	"aprovado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contrato_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"contrato_id" text NOT NULL,
	"tipo" "orcamento_item_tipo" NOT NULL,
	"vestido_id" text,
	"descricao" text NOT NULL,
	"valor_unitario" numeric(10, 2) NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"orcamento_id" text,
	"bloqueio_vestido_id" text,
	"vendedora_id" text NOT NULL,
	"status" "contrato_status" DEFAULT 'ATIVO' NOT NULL,
	"cpf" text,
	"vestido_descricao" text,
	"valor_total" numeric(10, 2) NOT NULL,
	"forma_pagamento" "forma_pagamento",
	"cancelado_motivo" text,
	"cancelado_em" timestamp with time zone,
	"data_casamento" timestamp with time zone,
	"data_retirada" timestamp with time zone,
	"data_devolucao" timestamp with time zone,
	"observacoes" text,
	"fechado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"comissao_estornada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contratos_orcamento_id_unique" UNIQUE("orcamento_id")
);
--> statement-breakpoint
CREATE TABLE "contas_pagar" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"tipo" "conta_pagar_tipo" NOT NULL,
	"colaborador_id" text,
	"competencia" text,
	"descricao" text NOT NULL,
	"categoria" text,
	"fornecedor" text,
	"valor_previsto" numeric(10, 2) NOT NULL,
	"vencimento" timestamp with time zone NOT NULL,
	"status" "conta_pagar_status" DEFAULT 'PREVISTA' NOT NULL,
	"salario_recorrente_id" text,
	"origem_comissao_fechamento_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamento_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"pagamento_id" text NOT NULL,
	"conta_pagar_id" text NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	CONSTRAINT "pagamento_itens_conta_pagar_id_unique" UNIQUE("conta_pagar_id")
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"colaborador_id" text,
	"data" timestamp with time zone NOT NULL,
	"valor_pago" numeric(10, 2) NOT NULL,
	"forma" text,
	"observacoes" text,
	"enviado_contabilidade_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcelas" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"contrato_id" text NOT NULL,
	"numero" integer NOT NULL,
	"descricao" text,
	"valor_previsto" numeric(10, 2) NOT NULL,
	"vencimento" timestamp with time zone NOT NULL,
	"status" "parcela_status" DEFAULT 'PREVISTA' NOT NULL,
	"valor_recebido" numeric(10, 2),
	"recebido_em" timestamp with time zone,
	"forma_recebimento" "forma_pagamento",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registros_cobranca" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"contato_data" timestamp with time zone DEFAULT now() NOT NULL,
	"canal" text NOT NULL,
	"observacao" text,
	"vendedor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salarios_recorrentes" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"dia_vencimento" integer DEFAULT 5 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saldos_referencia" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"competencia" text NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saldos_referencia_loja_id_competencia_unique" UNIQUE("loja_id","competencia")
);
--> statement-breakpoint
CREATE TABLE "comissao_faixas" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"minimo_venda" numeric(10, 2) NOT NULL,
	"percentual" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comissao_fechamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"competencia" text NOT NULL,
	"total_vendas" numeric(10, 2) NOT NULL,
	"comissao_valor" numeric(10, 2) NOT NULL,
	"conta_pagar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comissao_fechamentos_conta_pagar_id_unique" UNIQUE("conta_pagar_id"),
	CONSTRAINT "comissao_fechamentos_loja_id_usuario_id_competencia_unique" UNIQUE("loja_id","usuario_id","competencia")
);
--> statement-breakpoint
CREATE TABLE "comissao_regras" (
	"id" text PRIMARY KEY NOT NULL,
	"loja_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"regra_global" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comissao_regras_loja_id_usuario_id_unique" UNIQUE("loja_id","usuario_id")
);
--> statement-breakpoint
ALTER TABLE "cabines" ADD CONSTRAINT "cabines_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_disponibilidade" ADD CONSTRAINT "regra_disponibilidade_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_overrides_lojas" ADD CONSTRAINT "perfil_overrides_lojas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_overrides_lojas" ADD CONSTRAINT "perfil_overrides_lojas_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_loja_ativa_id_lojas_id_fk" FOREIGN KEY ("loja_ativa_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_lojas" ADD CONSTRAINT "usuarios_lojas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_lojas" ADD CONSTRAINT "usuarios_lojas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_lojas" ADD CONSTRAINT "usuarios_lojas_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atributo_opcoes" ADD CONSTRAINT "atributo_opcoes_atributo_id_atributos_id_fk" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atributos" ADD CONSTRAINT "atributos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestido_atributos" ADD CONSTRAINT "vestido_atributos_vestido_id_vestidos_id_fk" FOREIGN KEY ("vestido_id") REFERENCES "public"."vestidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestido_atributos" ADD CONSTRAINT "vestido_atributos_atributo_id_atributos_id_fk" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestido_atributos" ADD CONSTRAINT "vestido_atributos_opcao_id_atributo_opcoes_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."atributo_opcoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestido_fotos" ADD CONSTRAINT "vestido_fotos_vestido_id_vestidos_id_fk" FOREIGN KEY ("vestido_id") REFERENCES "public"."vestidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vestidos" ADD CONSTRAINT "vestidos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" ADD CONSTRAINT "lead_interesse_atributos_lead_interesse_id_lead_interesses_id_fk" FOREIGN KEY ("lead_interesse_id") REFERENCES "public"."lead_interesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" ADD CONSTRAINT "lead_interesse_atributos_atributo_id_atributos_id_fk" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesse_atributos" ADD CONSTRAINT "lead_interesse_atributos_opcao_id_atributo_opcoes_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."atributo_opcoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interesses" ADD CONSTRAINT "lead_interesses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_checklist_itens" ADD CONSTRAINT "ajuste_checklist_itens_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_cabine_id_cabines_id_fk" FOREIGN KEY ("cabine_id") REFERENCES "public"."cabines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_vendedora_id_usuarios_id_fk" FOREIGN KEY ("vendedora_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_bloqueio_id_bloqueio_vestidos_id_fk" FOREIGN KEY ("bloqueio_id") REFERENCES "public"."bloqueio_vestidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio_vestidos" ADD CONSTRAINT "bloqueio_vestidos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio_vestidos" ADD CONSTRAINT "bloqueio_vestidos_vestido_id_vestidos_id_fk" FOREIGN KEY ("vestido_id") REFERENCES "public"."vestidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio_vestidos" ADD CONSTRAINT "bloqueio_vestidos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio_vestidos" ADD CONSTRAINT "bloqueio_vestidos_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamento_id_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_vestido_id_vestidos_id_fk" FOREIGN KEY ("vestido_id") REFERENCES "public"."vestidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedora_id_usuarios_id_fk" FOREIGN KEY ("vendedora_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_itens" ADD CONSTRAINT "contrato_itens_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_itens" ADD CONSTRAINT "contrato_itens_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_itens" ADD CONSTRAINT "contrato_itens_vestido_id_vestidos_id_fk" FOREIGN KEY ("vestido_id") REFERENCES "public"."vestidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_orcamento_id_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_bloqueio_vestido_id_bloqueio_vestidos_id_fk" FOREIGN KEY ("bloqueio_vestido_id") REFERENCES "public"."bloqueio_vestidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_vendedora_id_usuarios_id_fk" FOREIGN KEY ("vendedora_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_colaborador_id_usuarios_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_pagamento_id_pagamentos_id_fk" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_conta_pagar_id_contas_pagar_id_fk" FOREIGN KEY ("conta_pagar_id") REFERENCES "public"."contas_pagar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_colaborador_id_usuarios_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_cobranca" ADD CONSTRAINT "registros_cobranca_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_cobranca" ADD CONSTRAINT "registros_cobranca_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_cobranca" ADD CONSTRAINT "registros_cobranca_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salarios_recorrentes" ADD CONSTRAINT "salarios_recorrentes_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salarios_recorrentes" ADD CONSTRAINT "salarios_recorrentes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos_referencia" ADD CONSTRAINT "saldos_referencia_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_faixas" ADD CONSTRAINT "comissao_faixas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_fechamentos" ADD CONSTRAINT "comissao_fechamentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_fechamentos" ADD CONSTRAINT "comissao_fechamentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_fechamentos" ADD CONSTRAINT "comissao_fechamentos_conta_pagar_id_contas_pagar_id_fk" FOREIGN KEY ("conta_pagar_id") REFERENCES "public"."contas_pagar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_regras" ADD CONSTRAINT "comissao_regras_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_regras" ADD CONSTRAINT "comissao_regras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes" USING btree ("expira_em");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes" USING btree ("usuario_id");