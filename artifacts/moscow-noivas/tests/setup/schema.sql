--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AjusteStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AjusteStatus" AS ENUM (
    'PENDENTE',
    'FEITO'
);


--
-- Name: AtendimentoDesfecho; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AtendimentoDesfecho" AS ENUM (
    'RESERVOU',
    'VAI_PENSAR',
    'NAO_SERVIU'
);


--
-- Name: AtendimentoSituacao; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AtendimentoSituacao" AS ENUM (
    'AGENDADO',
    'EM_ATENDIMENTO',
    'CONCLUIDO',
    'FALTOU'
);


--
-- Name: AtendimentoTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AtendimentoTipo" AS ENUM (
    'ATENDIMENTO',
    'PROVA'
);


--
-- Name: AtributoTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AtributoTipo" AS ENUM (
    'OPCAO_UNICA',
    'ESCALA'
);


--
-- Name: BloqueioTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BloqueioTipo" AS ENUM (
    'RESERVA_CASAMENTO',
    'MANUTENCAO'
);


--
-- Name: CobrancaCanal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CobrancaCanal" AS ENUM (
    'WHATSAPP',
    'TELEFONE',
    'PRESENCIAL',
    'OUTRO'
);


--
-- Name: ContaPagarStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContaPagarStatus" AS ENUM (
    'PREVISTA',
    'PAGA'
);


--
-- Name: ContaPagarTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContaPagarTipo" AS ENUM (
    'DESPESA',
    'FORNECEDOR',
    'SALARIO',
    'COMISSAO'
);


--
-- Name: ContratoStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContratoStatus" AS ENUM (
    'ATIVO',
    'CANCELADO'
);


--
-- Name: DescontoTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DescontoTipo" AS ENUM (
    'PERCENTUAL',
    'VALOR'
);


--
-- Name: FormaPagamento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormaPagamento" AS ENUM (
    'PIX',
    'CARTAO_CREDITO',
    'CARTAO_DEBITO',
    'DINHEIRO',
    'BOLETO',
    'TRANSFERENCIA',
    'OUTRO'
);


--
-- Name: LeadEtapa; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadEtapa" AS ENUM (
    'NOVO',
    'INTERESSES_PREENCHIDOS',
    'ATENDIMENTO_AGENDADO',
    'EM_ATENDIMENTO',
    'ORCAMENTO_ABERTO',
    'CONTRATO_FECHADO',
    'EM_PROVAS',
    'RETIRADO',
    'CASAMENTO_REALIZADO',
    'DEVOLVIDO',
    'PERDIDO'
);


--
-- Name: LeadOrigem; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadOrigem" AS ENUM (
    'LOJA',
    'WHATSAPP'
);


--
-- Name: OrcamentoItemTipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrcamentoItemTipo" AS ENUM (
    'VESTIDO',
    'SERVICO',
    'AJUSTE'
);


--
-- Name: OrcamentoStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrcamentoStatus" AS ENUM (
    'RASCUNHO',
    'ENVIADO',
    'APROVADO',
    'RECUSADO'
);


--
-- Name: ParcelaStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ParcelaStatus" AS ENUM (
    'PREVISTA',
    'PAGA',
    'CANCELADA'
);


--
-- Name: ReservaStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReservaStatus" AS ENUM (
    'EM_MONTAGEM',
    'CONFIRMADA'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Ajuste; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Ajuste" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "atendimentoId" text NOT NULL,
    descricao text NOT NULL,
    status public."AjusteStatus" DEFAULT 'PENDENTE'::public."AjusteStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AjusteChecklistItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AjusteChecklistItem" (
    id text NOT NULL,
    "ajusteId" text NOT NULL,
    descricao text NOT NULL,
    feito boolean DEFAULT false NOT NULL,
    ordem integer DEFAULT 0 NOT NULL
);


--
-- Name: Atendimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Atendimento" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "leadId" text NOT NULL,
    "cabineId" text NOT NULL,
    "vendedoraId" text NOT NULL,
    tipo public."AtendimentoTipo" DEFAULT 'ATENDIMENTO'::public."AtendimentoTipo" NOT NULL,
    "bloqueioId" text,
    inicio timestamp(3) without time zone NOT NULL,
    situacao public."AtendimentoSituacao" DEFAULT 'AGENDADO'::public."AtendimentoSituacao" NOT NULL,
    "atendidoEm" timestamp(3) without time zone,
    desfecho public."AtendimentoDesfecho",
    observacao text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Atributo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Atributo" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    nome text NOT NULL,
    tipo public."AtributoTipo" DEFAULT 'OPCAO_UNICA'::public."AtributoTipo" NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: AtributoOpcao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AtributoOpcao" (
    id text NOT NULL,
    "atributoId" text NOT NULL,
    valor text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: BloqueioVestido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BloqueioVestido" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "vestidoId" text NOT NULL,
    "leadId" text,
    tipo public."BloqueioTipo" NOT NULL,
    "casamentoData" timestamp(3) without time zone,
    "provaDataReal" timestamp(3) without time zone,
    "retiradaDataReal" timestamp(3) without time zone,
    "devolucaoDataReal" timestamp(3) without time zone,
    observacao text,
    "reservaId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Cabine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Cabine" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ComissaoFaixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ComissaoFaixa" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "regraId" text NOT NULL,
    "minAcumulado" numeric(10,2) NOT NULL,
    "maxAcumulado" numeric(10,2),
    percentual numeric(5,2),
    "bonusFixo" numeric(10,2)
);


--
-- Name: ComissaoFechamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ComissaoFechamento" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "vendedoraId" text NOT NULL,
    competencia text NOT NULL,
    "totalVendas" numeric(10,2) NOT NULL,
    "percentualAplicado" numeric(5,2),
    "valorComissao" numeric(10,2) NOT NULL,
    "valorBonus" numeric(10,2) NOT NULL,
    "valorTotal" numeric(10,2) NOT NULL,
    "contaPagarId" text,
    "fechadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ComissaoRegra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ComissaoRegra" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "vendedoraId" text NOT NULL,
    "vigenciaInicio" timestamp(3) without time zone NOT NULL,
    "bonusAcumulaFaixas" boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ContaPagar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContaPagar" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    tipo public."ContaPagarTipo" NOT NULL,
    "colaboradorId" text,
    competencia text,
    descricao text NOT NULL,
    categoria text,
    fornecedor text,
    "valorPrevisto" numeric(10,2) NOT NULL,
    vencimento timestamp(3) without time zone NOT NULL,
    status public."ContaPagarStatus" DEFAULT 'PREVISTA'::public."ContaPagarStatus" NOT NULL,
    "salarioRecorrenteId" text,
    "origemComissaoFechamentoId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contrato" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "leadId" text NOT NULL,
    "orcamentoId" text,
    "bloqueioVestidoId" text,
    "vendedoraId" text NOT NULL,
    status public."ContratoStatus" DEFAULT 'ATIVO'::public."ContratoStatus" NOT NULL,
    cpf text,
    "vestidoDescricao" text,
    "valorTotal" numeric(10,2) NOT NULL,
    "formaPagamento" public."FormaPagamento",
    "canceladoMotivo" text,
    "dataCasamento" timestamp(3) without time zone,
    "dataRetirada" timestamp(3) without time zone,
    "dataDevolucao" timestamp(3) without time zone,
    observacoes text,
    "fechadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "comissaoEstornadaEm" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Lead" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    etapa public."LeadEtapa" DEFAULT 'NOVO'::public."LeadEtapa" NOT NULL,
    "noivaNome" text NOT NULL,
    "noivoNome" text,
    cerimonialista text,
    whatsapp text,
    "casamentoData" timestamp(3) without time zone,
    "casamentoHorario" text,
    "casamentoLocal" text,
    "orcamentoAbertoEm" timestamp(3) without time zone,
    "contratoFechadoEm" timestamp(3) without time zone,
    "perdidaEm" timestamp(3) without time zone,
    origem public."LeadOrigem" DEFAULT 'LOJA'::public."LeadOrigem" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: LeadInteresse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadInteresse" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "algoAMais" text,
    "naoQuerUsar" text,
    "tetoOrcamento" numeric(10,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: LeadInteresseAtributo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadInteresseAtributo" (
    "leadInteresseId" text NOT NULL,
    "atributoId" text NOT NULL,
    "opcaoId" text NOT NULL
);


--
-- Name: Loja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Loja" (
    id text NOT NULL,
    nome text NOT NULL,
    cnpj text,
    endereco text,
    telefone text,
    ativo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Orcamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Orcamento" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "leadId" text NOT NULL,
    "atendimentoId" text,
    "vendedoraId" text NOT NULL,
    status public."OrcamentoStatus" DEFAULT 'RASCUNHO'::public."OrcamentoStatus" NOT NULL,
    "descontoTipo" public."DescontoTipo",
    "descontoValor" numeric(10,2),
    validade timestamp(3) without time zone,
    observacoes text,
    "aprovadoEm" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: OrcamentoItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrcamentoItem" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "orcamentoId" text NOT NULL,
    tipo public."OrcamentoItemTipo" NOT NULL,
    "vestidoId" text,
    descricao text NOT NULL,
    "valorUnitario" numeric(10,2) NOT NULL,
    quantidade integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Pagamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Pagamento" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "colaboradorId" text,
    data timestamp(3) without time zone NOT NULL,
    "valorPago" numeric(10,2) NOT NULL,
    forma text,
    observacoes text,
    "enviadoContabilidadeEm" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PagamentoItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PagamentoItem" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "pagamentoId" text NOT NULL,
    "contaPagarId" text NOT NULL,
    valor numeric(10,2) NOT NULL
);


--
-- Name: Parcela; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Parcela" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "contratoId" text NOT NULL,
    numero integer NOT NULL,
    descricao text,
    "valorPrevisto" numeric(10,2) NOT NULL,
    vencimento timestamp(3) without time zone NOT NULL,
    status public."ParcelaStatus" DEFAULT 'PREVISTA'::public."ParcelaStatus" NOT NULL,
    "valorRecebido" numeric(10,2),
    "recebidoEm" timestamp(3) without time zone,
    "formaRecebimento" public."FormaPagamento",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Perfil; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Perfil" (
    id text NOT NULL,
    nome text NOT NULL,
    "acessosModulos" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PerfilOverrideLoja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PerfilOverrideLoja" (
    "lojaId" text NOT NULL,
    "perfilId" text NOT NULL,
    "acessosModulos" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: RegistroCobranca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RegistroCobranca" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "leadId" text NOT NULL,
    data timestamp(3) without time zone NOT NULL,
    canal public."CobrancaCanal" NOT NULL,
    observacao text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: RegraDisponibilidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RegraDisponibilidade" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "provaDiasAntes" integer DEFAULT 14 NOT NULL,
    "provaDuracao" integer DEFAULT 2 NOT NULL,
    "usoDiasAntes" integer DEFAULT 3 NOT NULL,
    "usoDiasDepois" integer DEFAULT 2 NOT NULL,
    "lavagemDiasDepois" integer DEFAULT 7 NOT NULL,
    "atendimentoAberturaHora" integer DEFAULT 9 NOT NULL,
    "atendimentoFechamentoHora" integer DEFAULT 19 NOT NULL
);


--
-- Name: Reserva; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Reserva" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "leadId" text NOT NULL,
    "casamentoData" timestamp(3) without time zone NOT NULL,
    status public."ReservaStatus" DEFAULT 'EM_MONTAGEM'::public."ReservaStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SalarioRecorrente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalarioRecorrente" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "colaboradorId" text NOT NULL,
    "valorBase" numeric(10,2) NOT NULL,
    "diaVencimento" integer NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SaldoReferencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SaldoReferencia" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "dataReferencia" timestamp(3) without time zone NOT NULL,
    valor numeric(10,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Sessao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Sessao" (
    id text NOT NULL,
    "usuarioId" text NOT NULL,
    "lojaAtivaId" text,
    "criadaEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiraEm" timestamp(3) without time zone NOT NULL
);


--
-- Name: Usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Usuario" (
    id text NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    "senhaHash" text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "isSuperAdmin" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: UsuarioLoja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UsuarioLoja" (
    "usuarioId" text NOT NULL,
    "lojaId" text NOT NULL,
    "perfilId" text NOT NULL
);


--
-- Name: Vestido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Vestido" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    "precoBase" numeric(10,2) NOT NULL,
    tamanho text,
    cor text,
    categoria text,
    status text DEFAULT 'ativo'::text NOT NULL,
    observacoes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: VestidoAtributo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VestidoAtributo" (
    "vestidoId" text NOT NULL,
    "atributoId" text NOT NULL,
    "opcaoId" text NOT NULL
);


--
-- Name: VestidoFoto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VestidoFoto" (
    id text NOT NULL,
    "vestidoId" text NOT NULL,
    ordem integer NOT NULL,
    bytes bytea NOT NULL,
    mime text NOT NULL,
    largura integer NOT NULL,
    altura integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AjusteChecklistItem AjusteChecklistItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AjusteChecklistItem"
    ADD CONSTRAINT "AjusteChecklistItem_pkey" PRIMARY KEY (id);


--
-- Name: Ajuste Ajuste_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ajuste"
    ADD CONSTRAINT "Ajuste_pkey" PRIMARY KEY (id);


--
-- Name: Atendimento Atendimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_pkey" PRIMARY KEY (id);


--
-- Name: AtributoOpcao AtributoOpcao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AtributoOpcao"
    ADD CONSTRAINT "AtributoOpcao_pkey" PRIMARY KEY (id);


--
-- Name: Atributo Atributo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atributo"
    ADD CONSTRAINT "Atributo_pkey" PRIMARY KEY (id);


--
-- Name: BloqueioVestido BloqueioVestido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueioVestido"
    ADD CONSTRAINT "BloqueioVestido_pkey" PRIMARY KEY (id);


--
-- Name: Cabine Cabine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cabine"
    ADD CONSTRAINT "Cabine_pkey" PRIMARY KEY (id);


--
-- Name: ComissaoFaixa ComissaoFaixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFaixa"
    ADD CONSTRAINT "ComissaoFaixa_pkey" PRIMARY KEY (id);


--
-- Name: ComissaoFechamento ComissaoFechamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFechamento"
    ADD CONSTRAINT "ComissaoFechamento_pkey" PRIMARY KEY (id);


--
-- Name: ComissaoRegra ComissaoRegra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoRegra"
    ADD CONSTRAINT "ComissaoRegra_pkey" PRIMARY KEY (id);


--
-- Name: ContaPagar ContaPagar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContaPagar"
    ADD CONSTRAINT "ContaPagar_pkey" PRIMARY KEY (id);


--
-- Name: Contrato Contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_pkey" PRIMARY KEY (id);


--
-- Name: LeadInteresseAtributo LeadInteresseAtributo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresseAtributo"
    ADD CONSTRAINT "LeadInteresseAtributo_pkey" PRIMARY KEY ("leadInteresseId", "atributoId");


--
-- Name: LeadInteresse LeadInteresse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresse"
    ADD CONSTRAINT "LeadInteresse_pkey" PRIMARY KEY (id);


--
-- Name: Lead Lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);


--
-- Name: Loja Loja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loja"
    ADD CONSTRAINT "Loja_pkey" PRIMARY KEY (id);


--
-- Name: OrcamentoItem OrcamentoItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrcamentoItem"
    ADD CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY (id);


--
-- Name: Orcamento Orcamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Orcamento"
    ADD CONSTRAINT "Orcamento_pkey" PRIMARY KEY (id);


--
-- Name: PagamentoItem PagamentoItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PagamentoItem"
    ADD CONSTRAINT "PagamentoItem_pkey" PRIMARY KEY (id);


--
-- Name: Pagamento Pagamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pagamento"
    ADD CONSTRAINT "Pagamento_pkey" PRIMARY KEY (id);


--
-- Name: Parcela Parcela_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Parcela"
    ADD CONSTRAINT "Parcela_pkey" PRIMARY KEY (id);


--
-- Name: PerfilOverrideLoja PerfilOverrideLoja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilOverrideLoja"
    ADD CONSTRAINT "PerfilOverrideLoja_pkey" PRIMARY KEY ("lojaId", "perfilId");


--
-- Name: Perfil Perfil_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Perfil"
    ADD CONSTRAINT "Perfil_pkey" PRIMARY KEY (id);


--
-- Name: RegistroCobranca RegistroCobranca_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RegistroCobranca"
    ADD CONSTRAINT "RegistroCobranca_pkey" PRIMARY KEY (id);


--
-- Name: RegraDisponibilidade RegraDisponibilidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RegraDisponibilidade"
    ADD CONSTRAINT "RegraDisponibilidade_pkey" PRIMARY KEY (id);


--
-- Name: Reserva Reserva_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reserva"
    ADD CONSTRAINT "Reserva_pkey" PRIMARY KEY (id);


--
-- Name: SalarioRecorrente SalarioRecorrente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalarioRecorrente"
    ADD CONSTRAINT "SalarioRecorrente_pkey" PRIMARY KEY (id);


--
-- Name: SaldoReferencia SaldoReferencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SaldoReferencia"
    ADD CONSTRAINT "SaldoReferencia_pkey" PRIMARY KEY (id);


--
-- Name: Sessao Sessao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_pkey" PRIMARY KEY (id);


--
-- Name: UsuarioLoja UsuarioLoja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UsuarioLoja"
    ADD CONSTRAINT "UsuarioLoja_pkey" PRIMARY KEY ("usuarioId", "lojaId");


--
-- Name: Usuario Usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Usuario"
    ADD CONSTRAINT "Usuario_pkey" PRIMARY KEY (id);


--
-- Name: VestidoAtributo VestidoAtributo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoAtributo"
    ADD CONSTRAINT "VestidoAtributo_pkey" PRIMARY KEY ("vestidoId", "atributoId");


--
-- Name: VestidoFoto VestidoFoto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoFoto"
    ADD CONSTRAINT "VestidoFoto_pkey" PRIMARY KEY (id);


--
-- Name: Vestido Vestido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Vestido"
    ADD CONSTRAINT "Vestido_pkey" PRIMARY KEY (id);


--
-- Name: ComissaoFechamento_contaPagarId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ComissaoFechamento_contaPagarId_key" ON public."ComissaoFechamento" USING btree ("contaPagarId");


--
-- Name: ComissaoFechamento_lojaId_vendedoraId_competencia_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ComissaoFechamento_lojaId_vendedoraId_competencia_key" ON public."ComissaoFechamento" USING btree ("lojaId", "vendedoraId", competencia);


--
-- Name: Contrato_orcamentoId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Contrato_orcamentoId_key" ON public."Contrato" USING btree ("orcamentoId");


--
-- Name: LeadInteresse_leadId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LeadInteresse_leadId_key" ON public."LeadInteresse" USING btree ("leadId");


--
-- Name: PagamentoItem_contaPagarId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PagamentoItem_contaPagarId_key" ON public."PagamentoItem" USING btree ("contaPagarId");


--
-- Name: RegistroCobranca_lojaId_leadId_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RegistroCobranca_lojaId_leadId_data_idx" ON public."RegistroCobranca" USING btree ("lojaId", "leadId", data);


--
-- Name: RegraDisponibilidade_lojaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RegraDisponibilidade_lojaId_key" ON public."RegraDisponibilidade" USING btree ("lojaId");


--
-- Name: Reserva_lojaId_leadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Reserva_lojaId_leadId_idx" ON public."Reserva" USING btree ("lojaId", "leadId");


--
-- Name: SalarioRecorrente_lojaId_colaboradorId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SalarioRecorrente_lojaId_colaboradorId_key" ON public."SalarioRecorrente" USING btree ("lojaId", "colaboradorId");


--
-- Name: SaldoReferencia_lojaId_dataReferencia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SaldoReferencia_lojaId_dataReferencia_idx" ON public."SaldoReferencia" USING btree ("lojaId", "dataReferencia");


--
-- Name: Sessao_expiraEm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Sessao_expiraEm_idx" ON public."Sessao" USING btree ("expiraEm");


--
-- Name: Sessao_usuarioId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Sessao_usuarioId_idx" ON public."Sessao" USING btree ("usuarioId");


--
-- Name: Usuario_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Usuario_email_key" ON public."Usuario" USING btree (email);


--
-- Name: VestidoFoto_vestidoId_ordem_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VestidoFoto_vestidoId_ordem_key" ON public."VestidoFoto" USING btree ("vestidoId", ordem);


--
-- Name: Vestido_lojaId_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Vestido_lojaId_codigo_key" ON public."Vestido" USING btree ("lojaId", codigo);


--
-- Name: AjusteChecklistItem AjusteChecklistItem_ajusteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AjusteChecklistItem"
    ADD CONSTRAINT "AjusteChecklistItem_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES public."Ajuste"(id) ON DELETE CASCADE;


--
-- Name: Ajuste Ajuste_atendimentoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ajuste"
    ADD CONSTRAINT "Ajuste_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES public."Atendimento"(id) ON DELETE CASCADE;


--
-- Name: Ajuste Ajuste_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ajuste"
    ADD CONSTRAINT "Ajuste_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Atendimento Atendimento_bloqueioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_bloqueioId_fkey" FOREIGN KEY ("bloqueioId") REFERENCES public."BloqueioVestido"(id) ON DELETE CASCADE;


--
-- Name: Atendimento Atendimento_cabineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_cabineId_fkey" FOREIGN KEY ("cabineId") REFERENCES public."Cabine"(id) ON DELETE CASCADE;


--
-- Name: Atendimento Atendimento_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: Atendimento Atendimento_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Atendimento Atendimento_vendedoraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atendimento"
    ADD CONSTRAINT "Atendimento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: AtributoOpcao AtributoOpcao_atributoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AtributoOpcao"
    ADD CONSTRAINT "AtributoOpcao_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES public."Atributo"(id) ON DELETE CASCADE;


--
-- Name: Atributo Atributo_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Atributo"
    ADD CONSTRAINT "Atributo_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: BloqueioVestido BloqueioVestido_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueioVestido"
    ADD CONSTRAINT "BloqueioVestido_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE SET NULL;


--
-- Name: BloqueioVestido BloqueioVestido_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueioVestido"
    ADD CONSTRAINT "BloqueioVestido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: BloqueioVestido BloqueioVestido_reservaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueioVestido"
    ADD CONSTRAINT "BloqueioVestido_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES public."Reserva"(id) ON DELETE CASCADE;


--
-- Name: BloqueioVestido BloqueioVestido_vestidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueioVestido"
    ADD CONSTRAINT "BloqueioVestido_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES public."Vestido"(id) ON DELETE CASCADE;


--
-- Name: Cabine Cabine_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cabine"
    ADD CONSTRAINT "Cabine_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: ComissaoFaixa ComissaoFaixa_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFaixa"
    ADD CONSTRAINT "ComissaoFaixa_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: ComissaoFaixa ComissaoFaixa_regraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFaixa"
    ADD CONSTRAINT "ComissaoFaixa_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES public."ComissaoRegra"(id) ON DELETE CASCADE;


--
-- Name: ComissaoFechamento ComissaoFechamento_contaPagarId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFechamento"
    ADD CONSTRAINT "ComissaoFechamento_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES public."ContaPagar"(id) ON DELETE SET NULL;


--
-- Name: ComissaoFechamento ComissaoFechamento_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFechamento"
    ADD CONSTRAINT "ComissaoFechamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: ComissaoFechamento ComissaoFechamento_vendedoraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoFechamento"
    ADD CONSTRAINT "ComissaoFechamento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: ComissaoRegra ComissaoRegra_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoRegra"
    ADD CONSTRAINT "ComissaoRegra_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: ComissaoRegra ComissaoRegra_vendedoraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ComissaoRegra"
    ADD CONSTRAINT "ComissaoRegra_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: ContaPagar ContaPagar_colaboradorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContaPagar"
    ADD CONSTRAINT "ContaPagar_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES public."Usuario"(id) ON DELETE SET NULL;


--
-- Name: ContaPagar ContaPagar_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContaPagar"
    ADD CONSTRAINT "ContaPagar_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Contrato Contrato_bloqueioVestidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_bloqueioVestidoId_fkey" FOREIGN KEY ("bloqueioVestidoId") REFERENCES public."BloqueioVestido"(id) ON DELETE SET NULL;


--
-- Name: Contrato Contrato_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: Contrato Contrato_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Contrato Contrato_orcamentoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES public."Orcamento"(id) ON DELETE SET NULL;


--
-- Name: Contrato Contrato_vendedoraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contrato"
    ADD CONSTRAINT "Contrato_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: LeadInteresseAtributo LeadInteresseAtributo_atributoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresseAtributo"
    ADD CONSTRAINT "LeadInteresseAtributo_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES public."Atributo"(id);


--
-- Name: LeadInteresseAtributo LeadInteresseAtributo_leadInteresseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresseAtributo"
    ADD CONSTRAINT "LeadInteresseAtributo_leadInteresseId_fkey" FOREIGN KEY ("leadInteresseId") REFERENCES public."LeadInteresse"(id) ON DELETE CASCADE;


--
-- Name: LeadInteresseAtributo LeadInteresseAtributo_opcaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresseAtributo"
    ADD CONSTRAINT "LeadInteresseAtributo_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES public."AtributoOpcao"(id);


--
-- Name: LeadInteresse LeadInteresse_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadInteresse"
    ADD CONSTRAINT "LeadInteresse_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: Lead Lead_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: OrcamentoItem OrcamentoItem_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrcamentoItem"
    ADD CONSTRAINT "OrcamentoItem_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: OrcamentoItem OrcamentoItem_orcamentoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrcamentoItem"
    ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES public."Orcamento"(id) ON DELETE CASCADE;


--
-- Name: OrcamentoItem OrcamentoItem_vestidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrcamentoItem"
    ADD CONSTRAINT "OrcamentoItem_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES public."Vestido"(id) ON DELETE SET NULL;


--
-- Name: Orcamento Orcamento_atendimentoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Orcamento"
    ADD CONSTRAINT "Orcamento_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES public."Atendimento"(id) ON DELETE SET NULL;


--
-- Name: Orcamento Orcamento_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Orcamento"
    ADD CONSTRAINT "Orcamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: Orcamento Orcamento_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Orcamento"
    ADD CONSTRAINT "Orcamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Orcamento Orcamento_vendedoraId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Orcamento"
    ADD CONSTRAINT "Orcamento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: PagamentoItem PagamentoItem_contaPagarId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PagamentoItem"
    ADD CONSTRAINT "PagamentoItem_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES public."ContaPagar"(id) ON DELETE CASCADE;


--
-- Name: PagamentoItem PagamentoItem_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PagamentoItem"
    ADD CONSTRAINT "PagamentoItem_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: PagamentoItem PagamentoItem_pagamentoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PagamentoItem"
    ADD CONSTRAINT "PagamentoItem_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES public."Pagamento"(id) ON DELETE CASCADE;


--
-- Name: Pagamento Pagamento_colaboradorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pagamento"
    ADD CONSTRAINT "Pagamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES public."Usuario"(id) ON DELETE SET NULL;


--
-- Name: Pagamento Pagamento_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pagamento"
    ADD CONSTRAINT "Pagamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Parcela Parcela_contratoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Parcela"
    ADD CONSTRAINT "Parcela_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES public."Contrato"(id) ON DELETE CASCADE;


--
-- Name: Parcela Parcela_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Parcela"
    ADD CONSTRAINT "Parcela_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: PerfilOverrideLoja PerfilOverrideLoja_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilOverrideLoja"
    ADD CONSTRAINT "PerfilOverrideLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: PerfilOverrideLoja PerfilOverrideLoja_perfilId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilOverrideLoja"
    ADD CONSTRAINT "PerfilOverrideLoja_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES public."Perfil"(id) ON DELETE CASCADE;


--
-- Name: RegistroCobranca RegistroCobranca_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RegistroCobranca"
    ADD CONSTRAINT "RegistroCobranca_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: RegistroCobranca RegistroCobranca_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RegistroCobranca"
    ADD CONSTRAINT "RegistroCobranca_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: RegraDisponibilidade RegraDisponibilidade_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RegraDisponibilidade"
    ADD CONSTRAINT "RegraDisponibilidade_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Reserva Reserva_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reserva"
    ADD CONSTRAINT "Reserva_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: Reserva Reserva_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reserva"
    ADD CONSTRAINT "Reserva_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: SalarioRecorrente SalarioRecorrente_colaboradorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalarioRecorrente"
    ADD CONSTRAINT "SalarioRecorrente_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: SalarioRecorrente SalarioRecorrente_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalarioRecorrente"
    ADD CONSTRAINT "SalarioRecorrente_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: SaldoReferencia SaldoReferencia_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SaldoReferencia"
    ADD CONSTRAINT "SaldoReferencia_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: Sessao Sessao_lojaAtivaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_lojaAtivaId_fkey" FOREIGN KEY ("lojaAtivaId") REFERENCES public."Loja"(id) ON DELETE SET NULL;


--
-- Name: Sessao Sessao_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: UsuarioLoja UsuarioLoja_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UsuarioLoja"
    ADD CONSTRAINT "UsuarioLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- Name: UsuarioLoja UsuarioLoja_perfilId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UsuarioLoja"
    ADD CONSTRAINT "UsuarioLoja_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES public."Perfil"(id);


--
-- Name: UsuarioLoja UsuarioLoja_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UsuarioLoja"
    ADD CONSTRAINT "UsuarioLoja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: VestidoAtributo VestidoAtributo_atributoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoAtributo"
    ADD CONSTRAINT "VestidoAtributo_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES public."Atributo"(id);


--
-- Name: VestidoAtributo VestidoAtributo_opcaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoAtributo"
    ADD CONSTRAINT "VestidoAtributo_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES public."AtributoOpcao"(id);


--
-- Name: VestidoAtributo VestidoAtributo_vestidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoAtributo"
    ADD CONSTRAINT "VestidoAtributo_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES public."Vestido"(id) ON DELETE CASCADE;


--
-- Name: VestidoFoto VestidoFoto_vestidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VestidoFoto"
    ADD CONSTRAINT "VestidoFoto_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES public."Vestido"(id) ON DELETE CASCADE;


--
-- Name: Vestido Vestido_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Vestido"
    ADD CONSTRAINT "Vestido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


