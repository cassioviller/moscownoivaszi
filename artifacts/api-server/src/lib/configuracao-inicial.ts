/**
 * A configuração inicial de um ateliê — o estado em que o sistema é USÁVEL.
 *
 * O seed que existia aqui era de teste: dois vestidos, dois leads, um contrato
 * de R$ 5.000 e uma parcela vencendo hoje. Ele provava que as tabelas aceitam
 * linhas, e não servia para nada além disso — ninguém abre uma loja com o
 * cadastro de outra pessoa dentro.
 *
 * Este módulo faz o contrário: ele cria **só o que não é trabalho da loja**.
 * A régua é `moscow-noivas/src/lib/primeiros-passos.ts`, que já escrevia a
 * ordem de montar um ateliê:
 *
 *     cabines e horário → atributos → vestidos → escada de comissão →
 *     recorrências → primeira noiva
 *
 * Destes seis passos, cinco são configuração e um é trabalho. Este módulo zera
 * os cinco. O que sobra na tela de primeiros passos depois de rodá-lo é
 * exatamente **"Cadastrar os primeiros vestidos"** — e daí em diante vestido,
 * noiva, prova e atendimento entram pela tela, como devem entrar.
 *
 * Três invariantes, e cada uma tem motivo:
 *
 * 1. **Nunca sobrescreve.** Todo insert é `onConflictDoNothing` sobre um id
 *    DERIVADO da loja (`<lojaId>-cabine-1`). Rodar de novo numa loja que já
 *    renomeou "Cabine 1" para "Provador Rosa" não desfaz a renomeação nem cria
 *    uma quarta cabine. O seed COMPLETA o que falta; ele não impõe.
 * 2. **Nenhum dado de noiva, vestido, contrato ou dinheiro movimentado.** Não
 *    há um único lead, um contrato ou uma parcela aqui. A loja nasce vazia de
 *    história e cheia de régua — que é a diferença entre configuração e fixture.
 * 3. **Todo número tem exemplo conferível.** A escada de comissão e as
 *    recorrências trazem valor, e o valor está em constante exportada, com o
 *    total escrito no teste (`e147-configuracao-inicial-unit.test.ts`) e não
 *    descoberto depois rodando a tela.
 */
import {
  db,
  lojasTable,
  perfisTable,
  usuariosTable,
  usuariosLojasTable,
  cabinesTable,
  regraDisponibilidadeTable,
  atributosTable,
  atributoOpcoesTable,
  comissaoRegrasTable,
  comissaoFaixasTable,
  recorrenciasTable,
  vestidosTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { CNPJ_DE_EXEMPLO, ancoraDeNegocio, hojeLocal, primeiroDiaDoMes } from "@workspace/financeiro-core";
import { type AcessosModulos } from "./permissoes";

// ── Os perfis (tabela GLOBAL — perfil não pertence a loja) ────────────────────

const TUDO = { ver: true, criar: true, editar: true } as const;
const SO_VER = { ver: true, criar: false, editar: false } as const;
const NADA = { ver: false, criar: false, editar: false } as const;

export type PerfilPadrao = {
  id: string;
  nome: string;
  /** E80: o perfil do SISTEMA é flag, não nome — o servidor recusa PATCH/DELETE dele. */
  sistema: boolean;
  acessos: AcessosModulos;
};

/**
 * Cinco perfis, e o que separa um do outro é uma pergunta do balcão:
 *
 * - **Admin** é o perfil do sistema (E80). Ele existe para a rede e é o único
 *   com `sistema: true`.
 * - **Proprietária** tem os mesmos sete módulos, com `sistema: false`. É a
 *   persona real da dona — e é ela quem EXERCITA o gate de permissão, coisa
 *   que um superadmin nunca faz, porque passa por todo `requireModulo`.
 * - **Vendedora** vende e atende: noivas, propostas, contratos, agenda e acervo
 *   inteiros; dinheiro e comissão da loja, não. (Ela continua vendo a PRÓPRIA
 *   comissão — "Minha comissão" não tem módulo, de propósito.) Esta linha é
 *   espelhada à mão em `e2e/12-permissoes.spec.ts:18` e mudar uma sem a outra
 *   reprova o sweep.
 * - **Recepção** marca e remarca a agenda o dia inteiro, cadastra a noiva que
 *   ligou **e corrige o que digitou**. A proposta ela LÊ — para responder ao
 *   telefone quanto foi — e não aprova, não recusa, não gera link e não mexe
 *   em preço; contrato, nada.
 * - **Costureira** a agenda inteira — a fila de ajustes, as provas, o prazo — e
 *   o acervo **só de leitura**. Nada de carteira de noivas, contrato, dinheiro
 *   ou comissão.
 *
 * **E172 — as três linhas que mudaram, e a decisão da dona por trás de cada
 * uma** (2026-08-12):
 *
 * 1. A Recepção ganhou `leads.editar`. Ela é quem atende o telefone, logo quem
 *    digita o WhatsApp pelo qual a loja confirma a prova — e um dígito errado
 *    só se consertava pedindo a outra pessoa (S-O41). O `editar` não a deixou
 *    passar a mão em nada perigoso: o expurgo de LGPD, que pedia a MESMA ação,
 *    passou a pedir `admin` no mesmo commit, alinhando-se com a tela que já o
 *    escondia (`configuracoes/index.tsx:51`).
 * 2. A Recepção perdeu o contrato — não por ação, por MÓDULO. Ver
 *    `lib/permissoes.ts:21`: com `leads` inteiro nas mãos dela, nenhuma ação
 *    separava "cadastrar a noiva" de "assinar o contrato de R$ 5.000,00"
 *    (S-O40). O contrato virou módulo próprio, e as parcelas foram junto —
 *    senão o `editar` novo lhe daria o `receber` do dinheiro, que ela nunca
 *    teve.
 *
 *    **E o orçamento foi junto, por medição.** Fechar só o contrato deixava-a
 *    APROVANDO a proposta, que é o passo anterior: `POST /orcamentos/:id/`
 *    `aprovar` pedia `leads: editar`. Medido com o perfil já novo — respondia
 *    **404**, não 403. Quem aprova congela a versão que o contrato confere,
 *    logo decide o preço que ele cobra. Ela ficou com `orcamentos: SO_VER`:
 *    lê a proposta para responder ao telefone, e não a move.
 * 3. A Costureira nasceu (S-O36). Antes ela entrava como Recepção, que é o
 *    perfil mais fechado que concede `agenda` — e levava a carteira de leads
 *    da loja inteira junto.
 *
 *    O `vestidos: SO_VER` dela não é generosidade, é a medição: com `agenda` e
 *    nada mais, os DOIS botões da ficha de trabalho dela morrem em 403 —
 *    "Abrir a reserva" (`ajustes/[ajusteId].tsx:124,251`) e o nome do vestido
 *    (`:167,226`), porque `/reservas` e `/vestidos` gateiam por `vestidos`
 *    (`reservas.ts:46`, `vestidos.ts:68`). É onde moram as provas e a
 *    movimentação da peça, e o manual dela promete os dois. Decisão da dona em
 *    2026-08-12, medida antes de decidir: **ela lê o acervo, não escreve nele**
 *    — o mesmo `SO_VER` que a Recepção já tinha. O que a S-O36 existia para
 *    evitar era a carteira de LEADS, e essa continua fechada.
 *
 * A Vendedora **fecha contrato, e agora está escrito** (S-O37): o poder é o
 * mesmo de sempre, o que mudou é que ele tem nome. Quem lê os cinco perfis
 * descobre isso na linha dela, e não no meio de um roteador.
 */
export const PERFIS_PADRAO: PerfilPadrao[] = [
  {
    id: "perfil-admin",
    nome: "Admin",
    sistema: true,
    acessos: { leads: TUDO, orcamentos: TUDO, contratos: TUDO, agenda: TUDO, vestidos: TUDO, financeiro: TUDO, comissao: TUDO, admin: TUDO },
  },
  {
    id: "perfil-proprietaria",
    nome: "Proprietária",
    sistema: false,
    acessos: { leads: TUDO, orcamentos: TUDO, contratos: TUDO, agenda: TUDO, vestidos: TUDO, financeiro: TUDO, comissao: TUDO, admin: TUDO },
  },
  {
    id: "perfil-vendedora",
    nome: "Vendedora",
    sistema: false,
    acessos: { leads: TUDO, orcamentos: TUDO, contratos: TUDO, agenda: TUDO, vestidos: TUDO, financeiro: NADA, comissao: NADA, admin: NADA },
  },
  {
    id: "perfil-recepcao",
    nome: "Recepção",
    sistema: false,
    acessos: { leads: TUDO, orcamentos: SO_VER, contratos: NADA, agenda: TUDO, vestidos: SO_VER, financeiro: NADA, comissao: NADA, admin: NADA },
  },
  {
    id: "perfil-costureira",
    nome: "Costureira",
    sistema: false,
    acessos: { leads: NADA, orcamentos: NADA, contratos: NADA, agenda: TUDO, vestidos: SO_VER, financeiro: NADA, comissao: NADA, admin: NADA },
  },
];

// ── A agenda: cabines e horário ───────────────────────────────────────────────

/** Três cabines. Renomear é uma linha na tela; ter zero trava a agenda inteira. */
export const CABINES_PADRAO = ["Cabine 1", "Cabine 2", "Cabine 3"] as const;

/**
 * O horário e as janelas físicas do vestido.
 *
 * São os defaults do schema escritos por extenso, e escrever por extenso é o
 * ponto: sem uma linha em `regra_disponibilidade` a loja não tem horário
 * nenhum — `primeirosPassos` chama isso de `temHorario: false` e a agenda não
 * sabe onde encaixar um atendimento. **Os dois lados têm de bater**: o schema é
 * quem manda em linha criada sem estes campos (`lib/db/src/schema/loja.ts:29`).
 *
 * **S-A8 — de onde vieram estes números, e por que dois deles mudaram.**
 *
 * Este bloco carregava uma afirmação sobre o mundo: *"domingo fechado, como
 * todo ateliê de noiva"*. O ateliê que usa este sistema **refuta a frase 7
 * vezes em 15 páginas de agenda** — provas em 19/07, 02/08, 09/08, 16/08 e
 * 13/09, às 14h e às 18h. E o fechamento às 19h, com prova de 60 min, fazia a
 * última prova possível começar às 18:00, enquanto o papel registra **6 provas
 * às 18:30** (mais 12 às 18:00, que cabiam raspando).
 *
 * Nenhum dos dois era bug: os dois são configuráveis, e a loja os corrige numa
 * linha da tela. O defeito era a ORIGEM — o default não tinha sido tirado de
 * ateliê nenhum, e toda instalação nova nascia recusando o horário mais usado
 * do fim do dia. Perguntamos, e a dona respondeu: **atende até as 20h**, e
 * **domingo é com hora marcada** — não é expediente de rotina, mas ela atende
 * quando a noiva pede. O sistema não sabe dizer essa diferença (só sabe abrir
 * ou recusar o dia), e entre perder a venda e oferecer um dia a mais na grade,
 * abrir é o que não custa nada desfazer.
 *
 * O resto continua sendo default de fábrica, e é honesto que seja: `provaDuracao`
 * está em SLOTS de 30 min (2 = 60 min), e a régua de dias — prova 14, uso 3+2,
 * lavagem 7 — foi confirmada pela dona em P1 (*"uma semana, lavagem externa"*).
 */
export const HORARIO_PADRAO = {
  provaDiasAntes: 14,
  provaDuracao: 2,
  usoDiasAntes: 3,
  usoDiasDepois: 2,
  lavagemDiasDepois: 7,
  // S-A16: a lavagem do ESTOQUE nasce em 0 — configurável por loja, e zero é
  // o comportamento que sempre valeu (estoque sem lavagem na conta). A da
  // linha acima é a do VESTIDO, confirmada pela dona em P1.
  estoqueLavagemDiasDepois: 0,
  atendimentoAberturaHora: 9,
  atendimentoFechamentoHora: 20,
  diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
} as const;

/** 0 = domingo … 6 = sábado, como em `diasFuncionamento` (E38). */
const DIAS_ROTULO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * "todos os dias" · "seg–sáb" · "seg–sex, dom" — os dias que a loja abre, na
 * forma que a dona lê.
 *
 * S-D41: o resumo do seed trazia a frase `"seg–sáb, 9h–19h"` CRAVADA, e as duas
 * metades dela estavam erradas desde a S-A8 — a loja abre domingo e fecha às
 * 20h. A frase é a única prova que o script dá de que o ateliê ficou configurado
 * do jeito da dona, e ela dizia que domingo estava fechado quando o sistema ia
 * abrir. Descrição que não sai do DADO volta a mentir na próxima vez que o dado
 * mudar; esta sai.
 */
export function descreverDias(dias: readonly number[]): string {
  const unicos = [...new Set(dias)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (unicos.length === 0) return "nenhum dia";
  if (unicos.length === 7) return "todos os dias";

  const blocos: number[][] = [];
  for (const d of unicos) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && d === ultimo[ultimo.length - 1]! + 1) ultimo.push(d);
    else blocos.push([d]);
  }
  return blocos
    .map((b) => (b.length >= 3 ? `${DIAS_ROTULO[b[0]!]}–${DIAS_ROTULO[b[b.length - 1]!]}` : b.map((d) => DIAS_ROTULO[d]).join(", ")))
    .join(", ");
}

/** "todos os dias, 9h–20h" — o horário como ele está gravado. */
export function descreverHorario(h: {
  diasFuncionamento: readonly number[];
  atendimentoAberturaHora: number;
  atendimentoFechamentoHora: number;
}): string {
  return `${descreverDias(h.diasFuncionamento)}, ${h.atendimentoAberturaHora}h–${h.atendimentoFechamentoHora}h`;
}

// ── O catálogo: o vocabulário do acervo ───────────────────────────────────────

export type AtributoPadrao = {
  /** Sufixo do id derivado — estável, sem acento, para o id não depender do rótulo. */
  chave: string;
  nome: string;
  opcoes: string[];
};

/**
 * Nove atributos, 66 opções — o vocabulário com que uma noiva descreve o
 * vestido que ela quer, e a vendedora descreve o que tem na arara.
 *
 * Ele serve aos DOIS lados da mesma pergunta, e é por isso que vale a pena
 * nascer pronto: o mesmo catálogo preenche a ficha do vestido
 * (`vestido_atributos`) e os interesses da noiva (`lead_interesse_atributos`),
 * e é o que vira filtro na lista do acervo e no lookbook.
 *
 * **Tamanho** não está aqui, e continua não estando: é da PEÇA física, muda de
 * unidade para unidade, e nada no papel do ateliê o usa para buscar.
 *
 * **Cor estava fora e voltou (E149).** O E147 a deixou de fora com um
 * argumento correto — "dois campos para o mesmo fato um dia discordariam" —,
 * mas decidiu sem a evidência que a arqueologia do legado trouxe depois: nas
 * 15 páginas de agenda do ateliê há **38 compromissos de festa e dama
 * indexados por COR**, em 15 cores distintas, e a noiva de festa não pede
 * "Arnalda", pede verde. Como coluna de texto livre, `cor` não sustentava
 * isso: o cadastro era `<Input placeholder="Branco">` e o filtro comparava com
 * `!==`, então "Verde", "verde" e "VERDE" viravam três entradas no dropdown,
 * cada uma filtrando um pedaço do acervo. O argumento do E147 continua de pé e
 * é a razão de `vestidos.cor` virar **legado lido, nunca escrito** — um campo
 * só, não dois. E o ganho que o E147 não tinha como pesar: atributo aparece em
 * `lead_interesse_atributos`, então a noiva passa a poder **pedir a cor** na
 * ficha de interesses, que é exatamente o gesto que o papel registra 38 vezes.
 *
 * **`categoria` continua livre**, como o E147 quis — mas a linha de negócio
 * (noiva, festa, dama) virou o atributo **Tipo de peça**, e não ela. Medido no
 * banco de dev: dos 863 vestidos, 4 têm `categoria` preenchida, e as quatro
 * dizem "Princesa" ou "Sereia" — que são opções de **Silhueta**. A coluna
 * livre não virou coleção: virou depósito do atributo que já existia ao lado.
 */
export const CATALOGO_PADRAO: AtributoPadrao[] = [
  {
    // E149: a linha de negócio do ateliê. O papel trata noiva e festa como dois
    // acervos — nome de modelo de um lado, cor e etiqueta de 4 dígitos do outro
    // —, e "Acessório" é o que dá lugar ao bolero e à mantilha (E150).
    chave: "tipo-de-peca",
    nome: "Tipo de peça",
    opcoes: ["Noiva", "Festa", "Dama", "Madrinha", "Debutante", "Acessório"],
  },
  {
    // E149: as 15 cores lidas nas 15 páginas de agenda do ateliê, mais os
    // brancos que o acervo de noiva usa e que o papel não precisa nomear.
    chave: "cor",
    nome: "Cor",
    opcoes: [
      "Branco", "Off-white", "Marfim", "Nude", "Champagne", "Dourado",
      "Rosê", "Rosa", "Pink", "Fúcsia", "Vermelho", "Marsala", "Terracota",
      "Laranja", "Amarelo", "Verde", "Azul", "Azul serenity", "Roxo",
    ],
  },
  {
    chave: "silhueta",
    nome: "Silhueta",
    opcoes: ["Sereia", "Princesa", "Evasê", "Reto", "Império", "Duas peças"],
  },
  {
    chave: "decote",
    nome: "Decote",
    opcoes: ["Tomara que caia", "Coração", "V", "Ombro a ombro", "Halter", "Canoa", "Quadrado", "Ilusão em tule"],
  },
  {
    chave: "manga",
    nome: "Manga",
    opcoes: ["Sem manga", "Alça fina", "Manga curta", "Manga 3/4", "Manga longa", "Manga removível"],
  },
  {
    chave: "tecido",
    nome: "Tecido",
    opcoes: ["Renda", "Tule", "Cetim", "Crepe", "Musseline", "Zibeline", "Organza", "Mikado"],
  },
  {
    chave: "cauda",
    nome: "Cauda",
    opcoes: ["Sem cauda", "Curta", "Média", "Longa", "Catedral"],
  },
  {
    chave: "volume-da-saia",
    nome: "Volume da saia",
    opcoes: ["Justa", "Levemente rodada", "Rodada", "Muito rodada"],
  },
  {
    chave: "brilho",
    nome: "Brilho",
    opcoes: ["Liso", "Brilho discreto", "Pedraria", "Todo bordado"],
  },
];

// ── A escada de comissão ──────────────────────────────────────────────────────

export type FaixaPadrao = {
  /** Reais — borda inferior INCLUSIVA. */
  minAcumulado: number;
  /** Reais — borda superior EXCLUSIVA; null = topo aberto. */
  maxAcumulado: number | null;
  /** % (5 = 5%). */
  percentual: number;
  /** Reais. */
  bonusFixo?: number;
};

/**
 * Três degraus, e o do topo paga bônus.
 *
 * A régua do motor é RETROATIVA (`lib/comissao.ts:6`): a faixa do acumulado
 * FINAL rege o mês inteiro, não é progressiva por degrau como imposto de renda.
 * Vale ler o exemplo com o número, porque é ele que o teste afirma:
 *
 *     vendeu R$ 50.000,00 no mês  →  cai na faixa [40.000, ∞), 7%
 *                                 →  comissão  R$ 3.500,00
 *                                 →  bônus     R$   500,00
 *                                 →  a receber R$ 4.000,00
 *
 * `bonusAcumulaFaixas: false`: só o bônus do degrau final conta. Ligado, os
 * bônus dos degraus vencidos se somariam — aqui só o topo tem bônus, então a
 * escolha não muda o número hoje; ela muda no dia em que a loja puser bônus no
 * meio da escada, e o default conservador é o que não paga duas vezes.
 */
export const ESCADA_PADRAO: FaixaPadrao[] = [
  { minAcumulado: 0, maxAcumulado: 20000, percentual: 5 },
  { minAcumulado: 20000, maxAcumulado: 40000, percentual: 6 },
  { minAcumulado: 40000, maxAcumulado: null, percentual: 7, bonusFixo: 500 },
];

// ── As recorrências: o custo fixo que se repete todo mês ──────────────────────

export type RecorrenciaPadrao = {
  chave: string;
  tipo: "DESPESA" | "FORNECEDOR";
  descricao: string;
  categoria: string;
  fornecedor?: string;
  /** Reais. */
  valor: number;
  diaVencimento: number;
};

/**
 * Quatro contas fixas — R$ 5.710,00 por mês, somados no teste.
 *
 * São o custo de manter a porta aberta, e existem aqui porque sem eles a folha
 * e a projeção de caixa mentem por omissão: a loja vê a entrada da noiva e não
 * vê o aluguel, e conclui que sobrou dinheiro que não sobrou.
 *
 * **Os valores são exemplo, e a loja os corrige na tela** (Financeiro → Folha).
 * O que não é exemplo é a ESTRUTURA: quatro linhas ativas, vencimentos
 * espalhados no mês, categoria preenchida — é isso que faz o DRE ter linha e a
 * projeção ter degrau.
 *
 * **Salário não entra**, e não é esquecimento: uma recorrência de SALARIO exige
 * `usuarioId`, e no primeiro dia a equipe é uma pessoa só — a dona, que não
 * tira salário de si mesma por uma linha de seed. Salário nasce quando alguém
 * entra na equipe, na mesma tela.
 */
export const RECORRENCIAS_PADRAO: RecorrenciaPadrao[] = [
  { chave: "aluguel", tipo: "DESPESA", descricao: "Aluguel do ponto", categoria: "Ocupação", valor: 4500, diaVencimento: 5 },
  { chave: "energia", tipo: "DESPESA", descricao: "Energia elétrica", categoria: "Ocupação", valor: 380, diaVencimento: 10 },
  { chave: "internet", tipo: "DESPESA", descricao: "Internet e telefone", categoria: "Ocupação", valor: 180, diaVencimento: 15 },
  {
    chave: "contabilidade",
    tipo: "FORNECEDOR",
    descricao: "Honorários de contabilidade",
    categoria: "Serviços",
    fornecedor: "Escritório contábil",
    valor: 650,
    diaVencimento: 20,
  },
];

// ── A aplicação ───────────────────────────────────────────────────────────────

/** Os defaults do ambiente de desenvolvimento — os mesmos ids de sempre. */
export const LOJA_PADRAO = {
  id: "84e539bd-9199-4551-8ae5-7619868f62d3",
  nome: "Moscow Noivas SP",
  // E233: o exemplo anterior (12.345.678/0001-99) não fechava os dígitos e a
  // porta o recusaria na primeira instalação. Este é o exemplo canônico, válido.
  cnpj: CNPJ_DE_EXEMPLO,
  endereco: "Rua das Noivas, 123, São Paulo - SP",
  telefone: "(11) 99999-9999",
  // E234 — o instrumento inteiro na instalação de exemplo: quem assina, o PIX,
  // o foro. Valores claramente de exemplo (o CPF fecha os dígitos).
  cidade: "São Paulo",
  uf: "SP",
  representanteNome: "Representante de Exemplo",
  representanteRg: "12.345.678-9",
  representanteCpf: "390.533.447-05",
  pixChave: "39053344705",
  pixTitular: "Representante de Exemplo",
} as const;

export const DONA_PADRAO = {
  id: "66df29bc-77a2-438a-9825-a7e11233896a",
  nome: "Super Admin",
  email: "admin@moscownoivas.com",
  senha: "admin123",
} as const;

export type OpcoesConfiguracao = {
  loja: {
    id: string;
    nome: string;
    cnpj?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    // E234 — os sete do instrumento; opcionais para quem semeia sem eles.
    cidade?: string | null;
    uf?: string | null;
    representanteNome?: string | null;
    representanteRg?: string | null;
    representanteCpf?: string | null;
    pixChave?: string | null;
    pixTitular?: string | null;
  };
  dona: { id: string; nome: string; email: string; senha: string; superAdmin: boolean };
  /** Escada de comissão e recorrências. Desligado, a loja fica sem valor nenhum. */
  comExemplosFinanceiros: boolean;
};

export type ResumoConfiguracao = {
  lojaId: string;
  lojaNome: string;
  donaEmail: string;
  /** O que ESTA execução criou. Segunda execução devolve tudo zerado. */
  criado: {
    loja: boolean;
    perfis: number;
    dona: boolean;
    vinculo: boolean;
    cabines: number;
    horario: boolean;
    atributos: number;
    opcoes: number;
    escadaDeComissao: boolean;
    recorrencias: number;
  };
};

/** Id derivado da loja: estável entre execuções, único entre lojas. */
function idDe(lojaId: string, sufixo: string): string {
  return `${lojaId}-${sufixo}`;
}

/**
 * Lê a configuração do ambiente, com os defaults do dev.
 *
 * É o que faz este seed ser reaproveitável: a mesma configuração vale para o
 * banco de desenvolvimento e para o primeiro dia de um ateliê de verdade — só
 * mudam as variáveis. Nenhum nome de loja mora em código de servidor.
 */
export function configuracaoDoAmbiente(env: NodeJS.ProcessEnv = process.env): OpcoesConfiguracao {
  const texto = (chave: string, padrao: string): string => {
    const v = env[chave];
    return v != null && v.trim() !== "" ? v.trim() : padrao;
  };

  return {
    loja: {
      id: texto("SEED_LOJA_ID", LOJA_PADRAO.id),
      nome: texto("SEED_LOJA_NOME", LOJA_PADRAO.nome),
      cnpj: texto("SEED_LOJA_CNPJ", LOJA_PADRAO.cnpj),
      endereco: texto("SEED_LOJA_ENDERECO", LOJA_PADRAO.endereco),
      telefone: texto("SEED_LOJA_TELEFONE", LOJA_PADRAO.telefone),
      cidade: texto("SEED_LOJA_CIDADE", LOJA_PADRAO.cidade),
      uf: texto("SEED_LOJA_UF", LOJA_PADRAO.uf),
      representanteNome: texto("SEED_LOJA_REPRESENTANTE_NOME", LOJA_PADRAO.representanteNome),
      representanteRg: texto("SEED_LOJA_REPRESENTANTE_RG", LOJA_PADRAO.representanteRg),
      representanteCpf: texto("SEED_LOJA_REPRESENTANTE_CPF", LOJA_PADRAO.representanteCpf),
      pixChave: texto("SEED_LOJA_PIX_CHAVE", LOJA_PADRAO.pixChave),
      pixTitular: texto("SEED_LOJA_PIX_TITULAR", LOJA_PADRAO.pixTitular),
    },
    dona: {
      id: texto("SEED_DONA_ID", DONA_PADRAO.id),
      nome: texto("SEED_DONA_NOME", DONA_PADRAO.nome),
      email: texto("SEED_DONA_EMAIL", DONA_PADRAO.email).toLowerCase(),
      senha: texto("SEED_DONA_SENHA", DONA_PADRAO.senha),
      // A dona é superadmin por default porque, num banco recém-nascido, ela é
      // a ÚNICA pessoa que existe — e sem o bypass ninguém abre a segunda loja
      // nem alcança o console da rede. Quem quiser a dona exercitando o gate
      // (o perfil Proprietária faz isso) põe SEED_DONA_SUPERADMIN=false.
      superAdmin: texto("SEED_DONA_SUPERADMIN", "true") !== "false",
    },
    comExemplosFinanceiros: texto("SEED_EXEMPLOS_FINANCEIROS", "true") !== "false",
  };
}

/**
 * Aplica a configuração inicial. Idempotente: rodar duas vezes não duplica
 * nada e não sobrescreve nada.
 *
 * Escreve por INSERT direto, e não pelas rotas: isto roda na subida do
 * servidor, sem sessão, antes de existir gente para autenticar — e uma trilha
 * de auditoria de "o instalador configurou a loja" não tem autor a registrar.
 * A partir daqui, toda escrita passa pelas rotas e deixa rastro.
 */
export async function aplicarConfiguracaoInicial(opts: OpcoesConfiguracao): Promise<ResumoConfiguracao> {
  const { loja, dona } = opts;
  const criado: ResumoConfiguracao["criado"] = {
    loja: false,
    perfis: 0,
    dona: false,
    vinculo: false,
    cabines: 0,
    horario: false,
    atributos: 0,
    opcoes: 0,
    escadaDeComissao: false,
    recorrencias: 0,
  };

  // 1. A loja.
  const inseridaLoja = await db
    .insert(lojasTable)
    .values({
      id: loja.id,
      nome: loja.nome,
      cnpj: loja.cnpj ?? null,
      endereco: loja.endereco ?? null,
      telefone: loja.telefone ?? null,
      cidade: loja.cidade ?? null,
      uf: loja.uf ?? null,
      representanteNome: loja.representanteNome ?? null,
      representanteRg: loja.representanteRg ?? null,
      representanteCpf: loja.representanteCpf ?? null,
      pixChave: loja.pixChave ?? null,
      pixTitular: loja.pixTitular ?? null,
      ativo: true,
    })
    .onConflictDoNothing()
    .returning({ id: lojasTable.id });
  criado.loja = inseridaLoja.length > 0;

  // 2. Os perfis. Tabela GLOBAL: numa rede, a segunda loja reusa estes mesmos.
  const perfisInseridos = await db
    .insert(perfisTable)
    .values(
      PERFIS_PADRAO.map((p) => ({
        id: p.id,
        nome: p.nome,
        sistema: p.sistema,
        acessosModulos: p.acessos,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: perfisTable.id });
  criado.perfis = perfisInseridos.length;

  // 3. A dona. O e-mail é único GLOBAL — quem já existe é reusado, nunca
  //    recriado, e a senha de quem já existe não se toca.
  const [existente] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, dona.email));
  const donaId = existente?.id ?? dona.id;
  if (!existente) {
    await db
      .insert(usuariosTable)
      .values({
        id: donaId,
        nome: dona.nome,
        email: dona.email,
        senhaHash: await bcrypt.hash(dona.senha, 12),
        ativo: true,
        isSuperAdmin: dona.superAdmin,
        // Deliberadamente `false`: marcar aqui manda a pessoa para a tela de
        // troca de senha antes de qualquer outra, e este seed também é o que
        // provisiona o ambiente automatizado. Quem instala com a senha padrão
        // é AVISADO pelo script, em vez de ser barrado pelo banco.
        precisaTrocarSenha: false,
      })
      .onConflictDoNothing();
    criado.dona = true;
  }

  // 4. O vínculo dona ↔ loja, pelo perfil Proprietária.
  const [vinculo] = await db
    .select()
    .from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, donaId), eq(usuariosLojasTable.lojaId, loja.id)));
  if (!vinculo) {
    await db
      .insert(usuariosLojasTable)
      .values({ usuarioId: donaId, lojaId: loja.id, perfilId: "perfil-proprietaria" })
      .onConflictDoNothing();
    criado.vinculo = true;
  }

  // 5. As cabines.
  const cabinesInseridas = await db
    .insert(cabinesTable)
    .values(
      CABINES_PADRAO.map((nome, i) => ({
        id: idDe(loja.id, `cabine-${i + 1}`),
        lojaId: loja.id,
        nome,
        ativo: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: cabinesTable.id });
  criado.cabines = cabinesInseridas.length;

  // 6. O horário. `lojaId` é unique aqui — o conflito sem alvo cobre as duas
  //    restrições (id e loja_id), que é o caso de uma loja já configurada.
  const horarioInserido = await db
    .insert(regraDisponibilidadeTable)
    .values({ id: idDe(loja.id, "horario"), lojaId: loja.id, ...HORARIO_PADRAO, diasFuncionamento: [...HORARIO_PADRAO.diasFuncionamento] })
    .onConflictDoNothing()
    .returning({ id: regraDisponibilidadeTable.id });
  criado.horario = horarioInserido.length > 0;

  // 7. O catálogo.
  const atributosInseridos = await db
    .insert(atributosTable)
    .values(
      CATALOGO_PADRAO.map((a, i) => ({
        id: idDe(loja.id, `atributo-${a.chave}`),
        lojaId: loja.id,
        nome: a.nome,
        tipo: "OPCAO_UNICA" as const,
        ordem: i,
        ativo: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: atributosTable.id });
  criado.atributos = atributosInseridos.length;

  const opcoesInseridas = await db
    .insert(atributoOpcoesTable)
    .values(
      CATALOGO_PADRAO.flatMap((a) =>
        a.opcoes.map((valor, i) => ({
          id: idDe(loja.id, `opcao-${a.chave}-${i + 1}`),
          atributoId: idDe(loja.id, `atributo-${a.chave}`),
          valor,
          ordem: i,
          ativo: true,
        })),
      ),
    )
    .onConflictDoNothing()
    .returning({ id: atributoOpcoesTable.id });
  criado.opcoes = opcoesInseridas.length;

  if (!opts.comExemplosFinanceiros) return { lojaId: loja.id, lojaNome: loja.nome, donaEmail: dona.email, criado };

  // 8. A escada de comissão da dona.
  //
  //    A vigência começa no dia 1º do mês da instalação, e não "hoje": fechar a
  //    competência corrente no mês que vem tem de encontrar regra valendo desde
  //    o começo dela. Uma vigência de 30/07 deixaria julho sem régua e a
  //    comissão do primeiro mês sairia zero, sem erro e sem explicação.
  const regraId = idDe(loja.id, "comissao-regra-1");
  const regraInserida = await db
    .insert(comissaoRegrasTable)
    .values({
      id: regraId,
      lojaId: loja.id,
      vendedoraId: donaId,
      vigenciaInicio: ancoraDeNegocio(primeiroDiaDoMes(hojeLocal())),
      bonusAcumulaFaixas: false,
      ativo: true,
    })
    .onConflictDoNothing()
    .returning({ id: comissaoRegrasTable.id });
  criado.escadaDeComissao = regraInserida.length > 0;

  if (criado.escadaDeComissao) {
    await db.insert(comissaoFaixasTable).values(
      ESCADA_PADRAO.map((f, i) => ({
        id: idDe(loja.id, `comissao-faixa-${i + 1}`),
        lojaId: loja.id,
        regraId,
        minAcumulado: f.minAcumulado,
        maxAcumulado: f.maxAcumulado,
        percentual: f.percentual,
        bonusFixo: f.bonusFixo ?? null,
      })),
    );
  }

  // 9. As recorrências.
  const recorrenciasInseridas = await db
    .insert(recorrenciasTable)
    .values(
      RECORRENCIAS_PADRAO.map((r) => ({
        id: idDe(loja.id, `recorrencia-${r.chave}`),
        lojaId: loja.id,
        tipo: r.tipo,
        usuarioId: null,
        descricao: r.descricao,
        categoria: r.categoria,
        fornecedor: r.fornecedor ?? null,
        valor: r.valor,
        diaVencimento: r.diaVencimento,
        ativo: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: recorrenciasTable.id });
  criado.recorrencias = recorrenciasInseridas.length;

  return { lojaId: loja.id, lojaNome: loja.nome, donaEmail: dona.email, criado };
}

/**
 * O que a loja tem, contado no banco — a MESMA forma que
 * `moscow-noivas/src/lib/primeiros-passos.ts` consome.
 *
 * É a prova de que a configuração pegou, e é o que o script imprime no fim:
 * um seed que diz "concluído" sem contar o que existe pede que se acredite
 * nele.
 */
export async function contarConfiguracao(lojaId: string): Promise<{
  cabines: number;
  temHorario: boolean;
  /** O horário como está gravado — para quem precisa DESCREVÊ-lo, não só saber que existe (S-D41). */
  horario: { diasFuncionamento: number[]; atendimentoAberturaHora: number; atendimentoFechamentoHora: number } | null;
  /**
   * S-O71 — os perfis são a única linha do resumo que não passava por aqui, e a
   * consequência é a S-D41 na letra: o script imprimia o literal `4` e o banco
   * tinha 5 desde que a Costureira nasceu (E172). **Não leva `lojaId`**, e é de
   * propósito: `perfis` é tabela GLOBAL (o comentário de `PERFIS_PADRAO` diz
   * isso, e a segunda loja da rede reusa os mesmos) — filtrar por loja aqui
   * devolveria zero em toda instalação.
   */
  perfis: number;
  atributos: number;
  opcoes: number;
  vestidos: number;
  escadasDeComissao: number;
  recorrencias: number;
}> {
  const [cabines, horario, atributos, escadas, recorrencias, vestidos, perfis] = await Promise.all([
    db.select({ id: cabinesTable.id }).from(cabinesTable).where(eq(cabinesTable.lojaId, lojaId)),
    db.select({
      id: regraDisponibilidadeTable.id,
      diasFuncionamento: regraDisponibilidadeTable.diasFuncionamento,
      atendimentoAberturaHora: regraDisponibilidadeTable.atendimentoAberturaHora,
      atendimentoFechamentoHora: regraDisponibilidadeTable.atendimentoFechamentoHora,
    }).from(regraDisponibilidadeTable).where(eq(regraDisponibilidadeTable.lojaId, lojaId)),
    db.select({ id: atributosTable.id }).from(atributosTable).where(eq(atributosTable.lojaId, lojaId)),
    db.select({ id: comissaoRegrasTable.id }).from(comissaoRegrasTable).where(eq(comissaoRegrasTable.lojaId, lojaId)),
    db.select({ id: recorrenciasTable.id }).from(recorrenciasTable).where(eq(recorrenciasTable.lojaId, lojaId)),
    db.select({ id: vestidosTable.id }).from(vestidosTable).where(eq(vestidosTable.lojaId, lojaId)),
    db.select({ id: perfisTable.id }).from(perfisTable),
  ]);

  const opcoes = atributos.length
    ? (
        await db
          .select({ id: atributoOpcoesTable.id })
          .from(atributoOpcoesTable)
          .where(inArray(atributoOpcoesTable.atributoId, atributos.map((a) => a.id)))
      ).length
    : 0;

  return {
    cabines: cabines.length,
    temHorario: horario.length > 0,
    horario: horario[0]
      ? {
          diasFuncionamento: horario[0].diasFuncionamento,
          atendimentoAberturaHora: horario[0].atendimentoAberturaHora,
          atendimentoFechamentoHora: horario[0].atendimentoFechamentoHora,
        }
      : null,
    perfis: perfis.length,
    atributos: atributos.length,
    opcoes,
    vestidos: vestidos.length,
    escadasDeComissao: escadas.length,
    recorrencias: recorrencias.length,
  };
}
