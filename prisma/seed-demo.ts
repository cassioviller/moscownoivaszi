// prisma/seed-demo.ts
// ─────────────────────────────────────────────────────────────────────────────
// CARGA DE DEMONSTRAÇÃO — Moscow Noivas (apresentação ao cliente)
//
// Popula a loja padrão "loja-moscow" com dados realistas para demonstrar a jornada:
//   Noiva → Atendimento/Interesse → data do casamento → disponibilidade → reservar.
//
// É IDEMPOTENTE: usa IDs fixos ("demo-*") com upsert. Pode rodar quantas vezes
// quiser que o resultado é o mesmo (não duplica). Roda com:  npm run db:seed:demo
//
// PRÉ-REQUISITO: o seed base (npm run db:seed) precisa ter rodado antes — ele cria
// a loja, os usuários de acesso, as regras de disponibilidade e o catálogo de
// atributos. Este script só ADICIONA acervo/noivas/reservas em cima disso.
//
// ISOLAMENTO POR LOJA: igual ao seed base, escreve com Prisma direto e SEMPRE com
// lojaId = "loja-moscow" explícito em cada linha. Nada vaza para outras lojas.
//
// MOTOR DE DISPONIBILIDADE: as reservas são gravadas como o app grava (tipo
// RESERVA_CASAMENTO + casamentoData; provaDataReal fica null → não abre buracos).
// O bloco contínuo (preparação → uso → higienização) é derivado pelo motor a
// partir das regras da loja. Este script não recalcula nada — só fornece os fatos.
// ─────────────────────────────────────────────────────────────────────────────
import {
  PrismaClient,
  type LeadEtapa,
  AtendimentoSituacao,
  AtendimentoTipo,
  OrcamentoStatus,
  OrcamentoItemTipo,
  DescontoTipo,
  ContratoStatus,
  ParcelaStatus,
  ContaPagarTipo,
  ContaPagarStatus,
  CobrancaCanal,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LOJA_ID = "loja-moscow";

// ── Helpers de data (UTC, sem off-by-one — mesma convenção do resto do sistema) ──
function addDias(isoBase: string, n: number): string {
  const d = new Date(`${isoBase}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DATA-BASE DA DEMO — relativa a HOJE para a demo ficar sempre "atual": o      ║
// ║  cluster de casamentos cai ~7 semanas à frente, DENTRO da janela de 60 dias   ║
// ║  da Agenda (senão ela aparece vazia). Tudo (casamentos, reservas, manutenções,║
// ║  provas) é RELATIVO a esta data. Troque o +50 para deslocar TODA a demo.      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
const DEMO_BASE_DATE = addDias(new Date().toISOString().slice(0, 10), 50);
function meiaNoiteUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
// Offset em dias a partir da DATA-BASE → "YYYY-MM-DD".
const D = (offset: number) => addDias(DEMO_BASE_DATE, offset);

// A "data tranquila" do roteiro: 45 dias ANTES da base, longe de qualquer bloqueio
// → nela TODO o acervo aparece livre. (Mude o -45 se mexer muito nos clusters.)
const DATA_TRANQUILA = D(-45);

// ───────────────────────────── ACERVO (20 vestidos) ──────────────────────────
// atributos: pares [nomeDoAtributo, valorDaOpção] resolvidos contra o catálogo do
// seed base. Se um par não existir no catálogo, é ignorado (degrada sem quebrar).
type AttrPar = [string, string];
type VestidoDemo = {
  n: number; // 1..20 → codigo VD-01.. e id demo-vd-01
  nome: string;
  categoria: string; // silhueta
  preco: string; // Decimal como string
  tamanho: string;
  cor: string;
  colecao: string; // vira observacoes ("peça de acervo", não estoque frio)
  atributos: AttrPar[];
};

const VESTIDOS: VestidoDemo[] = [
  { n: 1, nome: "Valentina", categoria: "Sereia", preco: "4800.00", tamanho: "40", cor: "Off-white", colecao: "Coleção Eterna · 2025", atributos: [["Decote", "Coração"], ["Tipo de saia", "Sereia"], ["Cauda", "Médio"], ["Brilho", "Pouco"]] },
  { n: 2, nome: "Aurora", categoria: "Princesa", preco: "6200.00", tamanho: "42", cor: "Marfim", colecao: "Coleção Realeza · 2024", atributos: [["Decote", "Tomara que caia"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"], ["Cauda", "Muito"]] },
  { n: 3, nome: "Giovanna", categoria: "Reta", preco: "3600.00", tamanho: "38", cor: "Off-white", colecao: "Coleção Minimal · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Reta"], ["Costas", "Aberta"], ["Brilho", "Pouco"]] },
  { n: 4, nome: "Isabela", categoria: "Evasê", preco: "4200.00", tamanho: "44", cor: "Champagne", colecao: "Coleção Jardim · 2024", atributos: [["Decote", "Ombro a ombro"], ["Tipo de saia", "Evasê"], ["Alças e mangas", "Manga curta"]] },
  { n: 5, nome: "Lorena", categoria: "Sereia", preco: "5400.00", tamanho: "40", cor: "Off-white", colecao: "Coleção Eterna · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Sereia"], ["Fenda", "Sim"], ["Cauda", "Médio"]] },
  { n: 6, nome: "Manuela", categoria: "Princesa", preco: "7200.00", tamanho: "42", cor: "Branco", colecao: "Coleção Realeza · 2024", atributos: [["Decote", "Coração"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"], ["Brilho", "Muito"]] },
  { n: 7, nome: "Catarina", categoria: "Tomara que caia", preco: "3900.00", tamanho: "36", cor: "Marfim", colecao: "Coleção Clássica · 2023", atributos: [["Decote", "Tomara que caia"], ["Tipo de saia", "Com detalhe"], ["Costas", "Renda"]] },
  { n: 8, nome: "Rafaela", categoria: "Reta", preco: "3400.00", tamanho: "38", cor: "Nude", colecao: "Coleção Minimal · 2025", atributos: [["Decote", "Halter"], ["Tipo de saia", "Reta"], ["Costas", "Decote nas costas"]] },
  { n: 9, nome: "Bianca", categoria: "Evasê", preco: "4600.00", tamanho: "44", cor: "Off-white", colecao: "Coleção Jardim · 2024", atributos: [["Decote", "Canoa"], ["Tipo de saia", "Evasê"], ["Alças e mangas", "Mangas de renda"]] },
  { n: 10, nome: "Letícia", categoria: "Sereia", preco: "5800.00", tamanho: "40", cor: "Champagne", colecao: "Coleção Eterna · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Sereia"], ["Fenda", "Talvez"], ["Cauda", "Muito"]] },
  { n: 11, nome: "Antonella", categoria: "Princesa", preco: "8400.00", tamanho: "42", cor: "Branco", colecao: "Coleção Alta-Costura · 2025", atributos: [["Decote", "Tomara que caia"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"], ["Cauda", "Muito"], ["Brilho", "Médio"]] },
  { n: 12, nome: "Heloísa", categoria: "Reta", preco: "3200.00", tamanho: "36", cor: "Off-white", colecao: "Coleção Minimal · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Reta"], ["Costas", "Botões"]] },
  { n: 13, nome: "Veneza", categoria: "Sereia", preco: "6800.00", tamanho: "40", cor: "Off-white", colecao: "Coleção Riviera · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Sereia"], ["Cauda", "Muito"], ["Fenda", "Sim"], ["Brilho", "Médio"]] },
  { n: 14, nome: "Athena", categoria: "Sereia", preco: "5200.00", tamanho: "42", cor: "Marfim", colecao: "Coleção Riviera · 2025", atributos: [["Decote", "V"], ["Tipo de saia", "Sereia"], ["Cauda", "Médio"], ["Fenda", "Não"]] },
  { n: 15, nome: "Florença", categoria: "Evasê", preco: "4400.00", tamanho: "44", cor: "Champagne", colecao: "Coleção Jardim · 2024", atributos: [["Decote", "Ombro a ombro"], ["Tipo de saia", "Evasê"], ["Volume da saia", "Médio"]] },
  { n: 16, nome: "Sevilha", categoria: "Princesa", preco: "6600.00", tamanho: "42", cor: "Branco", colecao: "Coleção Realeza · 2024", atributos: [["Decote", "Coração"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"], ["Cauda", "Médio"]] },
  { n: 17, nome: "Toscana", categoria: "Tomara que caia", preco: "3700.00", tamanho: "38", cor: "Marfim", colecao: "Coleção Clássica · 2023", atributos: [["Decote", "Tomara que caia"], ["Costas", "Renda"], ["Tipo de saia", "Com detalhe"]] },
  { n: 18, nome: "Capri", categoria: "Reta", preco: "3300.00", tamanho: "36", cor: "Nude", colecao: "Coleção Minimal · 2025", atributos: [["Decote", "Halter"], ["Tipo de saia", "Reta"]] },
  { n: 19, nome: "Provence", categoria: "Evasê", preco: "4900.00", tamanho: "44", cor: "Off-white", colecao: "Coleção Jardim · 2024", atributos: [["Decote", "Canoa"], ["Tipo de saia", "Evasê"], ["Alças e mangas", "Manga longa"]] },
  { n: 20, nome: "Versalhes", categoria: "Princesa", preco: "9800.00", tamanho: "42", cor: "Branco", colecao: "Coleção Alta-Costura · 2025", atributos: [["Decote", "Tomara que caia"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"], ["Cauda", "Muito"], ["Brilho", "Muito"]] },
];

const codigoVestido = (n: number) => `VD-${String(n).padStart(2, "0")}`;
const idVestido = (n: number) => `demo-vd-${String(n).padStart(2, "0")}`;

// ───────────────────────────── NOIVAS (15) ───────────────────────────────────
// reservaVestidoN: nº do vestido reservado (cluster que prende a data-base), ou null.
// offset: dias a partir da DATA-BASE para o casamento.
// interesse: seleções de catálogo (alimentam a indicação na ficha da noiva).
type NoivaDemo = {
  n: number; // 1..15 → id demo-ld-01
  noivaNome: string;
  noivoNome?: string;
  whatsapp: string;
  offset: number; // casamento = DATA-BASE + offset
  horario: string;
  local: string;
  etapa: LeadEtapa;
  cerimonialista?: string;
  reservaVestidoN: number | null;
  retirado?: boolean; // RETIRADO: grava retirada/devolução reais (bloco fecha cedo)
  orcamentoAberto?: boolean; // marca orcamentoAbertoEm
  contratoFechado?: boolean; // marca contratoFechadoEm
  perdida?: boolean; // marca perdidaEm
  interesse?: { teto?: string; atributos: AttrPar[]; algoAMais?: string; naoQuerUsar?: string };
};

const NOIVAS: NoivaDemo[] = [
  // ── Cluster de alta temporada: 11 noivas com vestido RESERVADO, casamentos
  //    espalhados entre -7 e +5 dias da base → os 11 vestidos ficam todos presos
  //    na DATA-BASE (preparação/uso/higienização cobrem o dia 12/09). Casamentos
  //    no FUTURO → estágios derivados vão de "orçamento aberto" a "em provas". ──
  { n: 1, noivaNome: "Mariana Lopes", noivoNome: "Rafael", whatsapp: "+55 11 99812-3344", offset: -7, horario: "16h", local: "Espaço Villa Bisutti — São Paulo", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 1, cerimonialista: "Atelier Cerimonial" },
  { n: 2, noivaNome: "Camila Andrade", noivoNome: "Thiago", whatsapp: "+55 11 99745-1122", offset: -5, horario: "17h30", local: "Casa Charlô — São Paulo", etapa: "EM_PROVAS", contratoFechado: true, reservaVestidoN: 2 },
  { n: 3, noivaNome: "Júlia Ferreira", noivoNome: "Lucas", whatsapp: "+55 11 99654-8890", offset: -3, horario: "11h", local: "Fazenda Vila Rica — Itu", etapa: "EM_PROVAS", contratoFechado: true, reservaVestidoN: 3 },
  { n: 4, noivaNome: "Larissa Souza", noivoNome: "Bruno", whatsapp: "+55 11 99533-2010", offset: -2, horario: "18h", local: "Espaço Natura — São Paulo", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 4 },
  { n: 5, noivaNome: "Patrícia Gomes", noivoNome: "André", whatsapp: "+55 11 99421-7766", offset: -1, horario: "16h30", local: "Quinta da Cantareira — São Paulo", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 5 },
  { n: 6, noivaNome: "Fernanda Lima", noivoNome: "Diego", whatsapp: "+55 11 99388-4521", offset: 0, horario: "16h", local: "Jardim das Acácias — São Paulo", etapa: "EM_PROVAS", contratoFechado: true, reservaVestidoN: 6, interesse: { teto: "8000,00", atributos: [["Decote", "Coração"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"]], algoAMais: "Quer um brilho discreto no corpete." } },
  { n: 7, noivaNome: "Aline Castro", noivoNome: "Felipe", whatsapp: "+55 11 99277-9043", offset: 0, horario: "19h", local: "Espaço Provence — Cotia", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 7 },
  { n: 8, noivaNome: "Vanessa Rocha", noivoNome: "Gustavo", whatsapp: "+55 11 99165-3387", offset: 1, horario: "15h", local: "Villa Giardini — São Paulo", etapa: "ORCAMENTO_ABERTO", orcamentoAberto: true, reservaVestidoN: 8, interesse: { teto: "4000,00", atributos: [["Decote", "Halter"], ["Tipo de saia", "Reta"]], naoQuerUsar: "Não quer cauda longa." } },
  { n: 9, noivaNome: "Tatiane Alves", noivoNome: "Marcelo", whatsapp: "+55 11 99054-6612", offset: 2, horario: "17h", local: "Casa das Caldeiras — São Paulo", etapa: "EM_PROVAS", contratoFechado: true, reservaVestidoN: 9 },
  { n: 10, noivaNome: "Bruna Martins", noivoNome: "Rodrigo", whatsapp: "+55 11 98943-2298", offset: 3, horario: "16h", local: "Espaço Rosa Mística — São Paulo", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 10 },
  { n: 11, noivaNome: "Carolina Dias", noivoNome: "Vinícius", whatsapp: "+55 11 98832-1175", offset: 5, horario: "18h30", local: "Fazenda 7 Lagoas — Mairiporã", etapa: "CONTRATO_FECHADO", contratoFechado: true, reservaVestidoN: 11 },
  // Renata: jornada CONCLUÍDA (casamento no passado, vestido devolvido). Mostra a
  // linha do tempo inteira ("Devolvido"). Bloco no passado → não prende a peça hoje.
  { n: 12, noivaNome: "Renata Pires", noivoNome: "Eduardo", whatsapp: "+55 11 98721-5530", offset: -120, horario: "16h", local: "Espaço TarObá — São Paulo", etapa: "DEVOLVIDO", contratoFechado: true, reservaVestidoN: 12, retirado: true },

  // ── Noivas SEM reserva (para demonstrar o fluxo de disponibilidade ao vivo) ──
  // Helena: casamento NA data-base (movimentada). Ainda escolhendo → na ficha dela
  // as sugestões mostram quais combinam E estão livres (Veneza) vs já reservadas.
  { n: 13, noivaNome: "Helena Duarte", noivoNome: "Pedro", whatsapp: "+55 11 99900-0001", offset: 0, horario: "20h", local: "Palácio Tangará — São Paulo", etapa: "EM_ATENDIMENTO", cerimonialista: "Mais Cerimonial", reservaVestidoN: null, interesse: { teto: "7000,00", atributos: [["Decote", "V"], ["Tipo de saia", "Sereia"], ["Cauda", "Muito"], ["Fenda", "Sim"]], algoAMais: "Sonha com um modelo sereia com fenda discreta." } },
  // Marina: casamento na DATA TRANQUILA (-45d). Atendimento agendado, acervo todo
  // livre → ótimo para mostrar "vários vestidos disponíveis".
  { n: 14, noivaNome: "Marina Teixeira", noivoNome: "Caio", whatsapp: "+55 11 99900-0002", offset: -45, horario: "15h", local: "Espaço Boulevard — São Paulo", etapa: "ATENDIMENTO_AGENDADO", reservaVestidoN: null, interesse: { teto: "9000,00", atributos: [["Decote", "Tomara que caia"], ["Tipo de saia", "Princesa"], ["Volume da saia", "Muito"]] } },
  // Sofia: jornada encerrada (não seguiu) — variedade na linha do tempo.
  { n: 15, noivaNome: "Sofia Mendes", whatsapp: "+55 11 99900-0003", offset: 60, horario: "17h", local: "Espaço Aurora — Santana de Parnaíba", etapa: "PERDIDO", perdida: true, reservaVestidoN: null },
];

const idNoiva = (n: number) => `demo-ld-${String(n).padStart(2, "0")}`;

// ───────────────────────── MANUTENÇÕES (cuidados do atelier) ──────────────────
// Janelas no FUTURO (≥ +30d da base) → não interferem nos dois cenários-roteiro,
// mas povoam a agenda de cuidados e criam bloqueios para OUTRAS datas de teste.
const MANUTENCOES = [
  { id: "demo-mnt-01", vestidoN: 13, inicio: D(30), fim: D(37), motivo: "Higienização após evento" },
  { id: "demo-mnt-02", vestidoN: 14, inicio: D(33), fim: D(40), motivo: "Ajuste de bainha e barra" },
  { id: "demo-mnt-03", vestidoN: 20, inicio: D(50), fim: null, motivo: "Restauração de renda (sem previsão de retorno)" },
];

// ───────────────────────── PROVAS & AJUSTES (atelier) ─────────────────────────
// Registros operacionais dentro de reservas. NÃO afetam disponibilidade (a peça já
// está presa pelo bloco contínuo). Povoam a ficha da reserva e a fila da costureira.
type ProvaDemo = {
  id: string;
  reservaNoivaN: number; // a reserva é a da noiva nº X
  dataReal: string;
  tipo: "PRIMEIRA" | "INTERMEDIARIA" | "FINAL";
  comparecimento: "AGENDADA" | "COMPARECEU" | "FALTOU" | "REMARCADA";
  responsavel?: string;
  observacao?: string;
  ajustes?: { id: string; descricao: string; status: "PENDENTE" | "FEITO"; checklist: string[] }[];
};

const PROVAS: ProvaDemo[] = [
  {
    id: "demo-prv-02a", reservaNoivaN: 2, dataReal: D(-12), tipo: "PRIMEIRA", comparecimento: "COMPARECEU",
    responsavel: "Atelier — Dona Rosa", observacao: "Primeira prova: ótimo caimento, pequenos ajustes.",
    ajustes: [{ id: "demo-aj-02a", descricao: "Ajustar barra (2 cm) e alça esquerda", status: "PENDENTE", checklist: ["Marcar barra", "Refazer alça esquerda", "Passar a ferro"] }],
  },
  { id: "demo-prv-02b", reservaNoivaN: 2, dataReal: D(-2), tipo: "FINAL", comparecimento: "AGENDADA", responsavel: "Atelier — Dona Rosa", observacao: "Prova final agendada — conferir ajustes." },
  {
    id: "demo-prv-06a", reservaNoivaN: 6, dataReal: D(-10), tipo: "PRIMEIRA", comparecimento: "COMPARECEU",
    responsavel: "Atelier — Dona Rosa",
    ajustes: [{ id: "demo-aj-06a", descricao: "Apertar cintura em 1,5 cm", status: "PENDENTE", checklist: ["Marcar cintura", "Costurar e arrematar"] }],
  },
];

// ─────────────────────────────── EXECUÇÃO ─────────────────────────────────────
type Resolver = (par: AttrPar) => { atributoId: string; opcaoId: string } | null;

async function carregarResolverCatalogo(): Promise<Resolver> {
  const attrs = await prisma.atributo.findMany({
    where: { lojaId: LOJA_ID },
    include: { opcoes: true },
  });
  // nomeAtributo → (valorOpção → {atributoId, opcaoId})
  const mapa = new Map<string, Map<string, { atributoId: string; opcaoId: string }>>();
  for (const a of attrs) {
    const porValor = new Map<string, { atributoId: string; opcaoId: string }>();
    for (const o of a.opcoes) porValor.set(o.valor, { atributoId: a.id, opcaoId: o.id });
    mapa.set(a.nome, porValor);
  }
  return ([nome, valor]: AttrPar) => mapa.get(nome)?.get(valor) ?? null;
}

async function main() {
  // 0) Pré-requisito: loja + catálogo do seed base.
  const loja = await prisma.loja.findUnique({ where: { id: LOJA_ID } });
  if (!loja) {
    throw new Error(
      `Loja "${LOJA_ID}" não existe. Rode o seed base primeiro:  npm run db:seed`,
    );
  }
  const resolver = await carregarResolverCatalogo();

  // 1) ACERVO — 20 vestidos (idempotente por id fixo) + atributos de catálogo.
  for (const v of VESTIDOS) {
    const id = idVestido(v.n);
    const dados = {
      lojaId: LOJA_ID,
      codigo: codigoVestido(v.n),
      nome: v.nome,
      precoBase: v.preco,
      tamanho: v.tamanho,
      cor: v.cor,
      categoria: v.categoria,
      status: "ativo",
      observacoes: v.colecao,
    };
    await prisma.vestido.upsert({ where: { id }, create: { id, ...dados }, update: dados });

    // Atributos (tabela-filha sem lojaId): substitui o conjunto inteiro a cada run.
    const selecoes = v.atributos.map(resolver).filter((s): s is { atributoId: string; opcaoId: string } => s !== null);
    await prisma.vestidoAtributo.deleteMany({ where: { vestidoId: id } });
    if (selecoes.length > 0) {
      await prisma.vestidoAtributo.createMany({
        data: selecoes.map((s) => ({ vestidoId: id, atributoId: s.atributoId, opcaoId: s.opcaoId })),
        skipDuplicates: true,
      });
    }
  }

  // 2) NOIVAS — 15 (idempotente) + interesses (catálogo) de algumas.
  for (const noiva of NOIVAS) {
    const id = idNoiva(noiva.n);
    const casamentoData = meiaNoiteUTC(D(noiva.offset));
    const dados = {
      lojaId: LOJA_ID,
      etapa: noiva.etapa,
      noivaNome: noiva.noivaNome,
      noivoNome: noiva.noivoNome ?? null,
      cerimonialista: noiva.cerimonialista ?? null,
      whatsapp: noiva.whatsapp,
      casamentoData,
      casamentoHorario: noiva.horario,
      casamentoLocal: noiva.local,
      orcamentoAbertoEm: noiva.orcamentoAberto || noiva.contratoFechado ? meiaNoiteUTC(D(noiva.offset - 40)) : null,
      contratoFechadoEm: noiva.contratoFechado ? meiaNoiteUTC(D(noiva.offset - 30)) : null,
      perdidaEm: noiva.perdida ? meiaNoiteUTC(D(noiva.offset - 20)) : null,
      origem: "LOJA" as const,
    };
    await prisma.lead.upsert({ where: { id }, create: { id, ...dados }, update: dados });

    // Interesse (LeadInteresse + join, ambos sem lojaId → via o lead já confirmado).
    if (noiva.interesse) {
      const selecoes = noiva.interesse.atributos
        .map(resolver)
        .filter((s): s is { atributoId: string; opcaoId: string } => s !== null);
      const interesseId = `demo-int-${String(noiva.n).padStart(2, "0")}`;
      const escalares = {
        algoAMais: noiva.interesse.algoAMais ?? null,
        naoQuerUsar: noiva.interesse.naoQuerUsar ?? null,
        tetoOrcamento: noiva.interesse.teto ? noiva.interesse.teto.replace(/\./g, "").replace(",", ".") : null,
      };
      await prisma.leadInteresse.upsert({
        where: { leadId: id },
        create: { id: interesseId, leadId: id, ...escalares },
        update: escalares,
      });
      const li = await prisma.leadInteresse.findUnique({ where: { leadId: id }, select: { id: true } });
      if (li) {
        await prisma.leadInteresseAtributo.deleteMany({ where: { leadInteresseId: li.id } });
        if (selecoes.length > 0) {
          await prisma.leadInteresseAtributo.createMany({
            data: selecoes.map((s) => ({ leadInteresseId: li.id, atributoId: s.atributoId, opcaoId: s.opcaoId })),
            skipDuplicates: true,
          });
        }
      }
    }
  }

  // 3) RESERVAS — 12 (uma por noiva do cluster). Como o app grava: RESERVA_CASAMENTO
  //    + casamentoData. provaDataReal SEMPRE null (não abre buracos na disponibilidade).
  //    RETIRADO → grava retirada/devolução reais (bloco fecha cedo, segue no passado).
  for (const noiva of NOIVAS) {
    if (noiva.reservaVestidoN == null) continue;
    const blqId = `demo-blq-${String(noiva.n).padStart(2, "0")}`;
    const casamentoOffset = noiva.offset;
    const dados = {
      lojaId: LOJA_ID,
      vestidoId: idVestido(noiva.reservaVestidoN),
      leadId: idNoiva(noiva.n),
      tipo: "RESERVA_CASAMENTO" as const,
      casamentoData: meiaNoiteUTC(D(casamentoOffset)),
      provaDataReal: null,
      retiradaDataReal: noiva.retirado ? meiaNoiteUTC(D(casamentoOffset - 3)) : null,
      devolucaoDataReal: noiva.retirado ? meiaNoiteUTC(D(casamentoOffset + 2)) : null,
      observacao: null,
    };
    await prisma.bloqueioVestido.upsert({ where: { id: blqId }, create: { id: blqId, ...dados }, update: dados });
  }

  // 4) MANUTENÇÕES — cuidados do atelier (higienização/restauro). Bloqueio de
  //    manutenção: retiradaDataReal = início; devolucaoDataReal = fim (null = aberto).
  for (const m of MANUTENCOES) {
    const dados = {
      lojaId: LOJA_ID,
      vestidoId: idVestido(m.vestidoN),
      leadId: null,
      tipo: "MANUTENCAO" as const,
      casamentoData: null,
      provaDataReal: null,
      retiradaDataReal: meiaNoiteUTC(m.inicio),
      devolucaoDataReal: m.fim ? meiaNoiteUTC(m.fim) : null,
      observacao: m.motivo,
    };
    await prisma.bloqueioVestido.upsert({ where: { id: m.id }, create: { id: m.id, ...dados }, update: dados });
  }

  // 5) PROVAS & AJUSTES — provas agora são Atendimento{tipo:PROVA} presos à reserva
  //    (criados na seção 6, junto com cabine/vendedora, que a prova exige como slot).

  // ─────────────────────── 6) COMERCIAL & FINANCEIRO ──────────────────────────
  // Atendimentos, orçamentos, contratos, parcelas (receber), contas a pagar + folha
  // e comissão. Ancorado ao MÊS REAL do sistema (o financeiro usa "hoje", não a
  // DATA-BASE da agenda) → as telas já aparecem populadas no mês corrente. Casamentos
  // seguem no futuro (DATA-BASE): vender em maio e casar em setembro é realista.
  const vendA = await prisma.usuario.findUnique({ where: { email: "vendedora@moscow.local" }, select: { id: true } });
  const vendB = await prisma.usuario.findUnique({ where: { email: "gerente@moscow.local" }, select: { id: true } });
  const costureira = await prisma.usuario.findUnique({ where: { email: "costureira@moscow.local" }, select: { id: true } });

  if (vendA && vendB) {
    const dec = (n: number) => n.toFixed(2);
    const precoVestido = (n: number) => Number(VESTIDOS.find((v) => v.n === n)!.preco);
    const vendId = (v: "A" | "B") => (v === "A" ? vendA.id : vendB.id);

    // Competências relativas ao mês REAL (idempotência por dia-fixo dentro do mês).
    const hojeR = new Date();
    const compOffset = (n: number) => {
      const d = new Date(Date.UTC(hojeR.getUTCFullYear(), hojeR.getUTCMonth() + n, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const COMP_ATUAL = compOffset(0); // mês corrente → ranking de comissão ao vivo
    const COMP_FECH = compOffset(-1); // mês passado → tem fechamento gravado
    const diaDe = (comp: string, dd: number) => meiaNoiteUTC(`${comp}-${String(dd).padStart(2, "0")}`);
    const venc05ProxMes = (comp: string) => diaDe(compOffsetDe(comp, 1), 5);
    function compOffsetDe(comp: string, n: number) {
      const y = Number(comp.slice(0, 4)), m = Number(comp.slice(5, 7));
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    // — Cabine (o seed base não cria) —
    await prisma.cabine.upsert({ where: { id: "demo-cab-01" }, create: { id: "demo-cab-01", lojaId: LOJA_ID, nome: "Cabine Marfim" }, update: { nome: "Cabine Marfim", ativo: true } });

    // — Provas (Atendimento{tipo:PROVA}) + ajustes/checklist. A prova vive presa à
    //   reserva (bloqueioId) e ocupa um slot de cabine/vendedora, como no app real.
    //   comparecimento antigo → situacao: COMPARECEU=CONCLUIDO, FALTOU=FALTOU, resto=AGENDADO.
    const situacaoDaProva = (c: ProvaDemo["comparecimento"]): AtendimentoSituacao =>
      c === "COMPARECEU" ? AtendimentoSituacao.CONCLUIDO : c === "FALTOU" ? AtendimentoSituacao.FALTOU : AtendimentoSituacao.AGENDADO;
    for (const p of PROVAS) {
      const blqId = `demo-blq-${String(p.reservaNoivaN).padStart(2, "0")}`;
      const sit = situacaoDaProva(p.comparecimento);
      const inicio = new Date(`${p.dataReal}T14:00:00.000Z`);
      const dadosProva = {
        lojaId: LOJA_ID,
        leadId: idNoiva(p.reservaNoivaN),
        cabineId: "demo-cab-01",
        vendedoraId: vendId("A"),
        tipo: AtendimentoTipo.PROVA,
        bloqueioId: blqId,
        inicio,
        situacao: sit,
        atendidoEm: sit === AtendimentoSituacao.CONCLUIDO ? inicio : null,
        observacao: p.observacao ?? null,
      };
      await prisma.atendimento.upsert({ where: { id: p.id }, create: { id: p.id, ...dadosProva }, update: dadosProva });

      for (const aj of p.ajustes ?? []) {
        const dadosAjuste = { lojaId: LOJA_ID, atendimentoId: p.id, descricao: aj.descricao, status: aj.status };
        await prisma.ajuste.upsert({ where: { id: aj.id }, create: { id: aj.id, ...dadosAjuste }, update: dadosAjuste });
        // Checklist (filha sem lojaId): substitui o conjunto a cada run.
        await prisma.ajusteChecklistItem.deleteMany({ where: { ajusteId: aj.id } });
        if (aj.checklist.length > 0) {
          await prisma.ajusteChecklistItem.createMany({
            data: aj.checklist.map((descricao, ordem) => ({ ajusteId: aj.id, descricao, feito: false, ordem })),
          });
        }
      }
    }

    // — Atendimentos (a fila do dia, situações variadas) —
    const ATEND = [
      { id: "demo-at-13", noivaN: 13, vend: "A" as const, off: 0, hora: 14, sit: AtendimentoSituacao.EM_ATENDIMENTO },
      { id: "demo-at-14", noivaN: 14, vend: "B" as const, off: 1, hora: 10, sit: AtendimentoSituacao.AGENDADO },
      { id: "demo-at-08", noivaN: 8, vend: "A" as const, off: -1, hora: 16, sit: AtendimentoSituacao.CONCLUIDO },
      { id: "demo-at-15", noivaN: 15, vend: "B" as const, off: -2, hora: 11, sit: AtendimentoSituacao.FALTOU },
    ];
    for (const a of ATEND) {
      const inicio = new Date(`${D(a.off)}T${String(a.hora).padStart(2, "0")}:00:00.000Z`);
      const ativo = a.sit === AtendimentoSituacao.EM_ATENDIMENTO || a.sit === AtendimentoSituacao.CONCLUIDO;
      const dados = { lojaId: LOJA_ID, leadId: idNoiva(a.noivaN), cabineId: "demo-cab-01", vendedoraId: vendId(a.vend), inicio, situacao: a.sit, atendidoEm: ativo ? inicio : null };
      await prisma.atendimento.upsert({ where: { id: a.id }, create: { id: a.id, ...dados }, update: dados });
    }

    // — Orçamentos (variedade de status) + itens —
    const ORC = [
      { id: "demo-orc-08", noivaN: 8, vend: "A" as const, status: OrcamentoStatus.ENVIADO, descTipo: null as DescontoTipo | null, desc: null as number | null,
        itens: [{ tipo: OrcamentoItemTipo.VESTIDO, vestidoN: 8, descricao: "Vestido Rafaela (VD-08)", valor: precoVestido(8), qtd: 1 }, { tipo: OrcamentoItemTipo.SERVICO, descricao: "Véu longo + acessórios", valor: 450, qtd: 1 }] },
      { id: "demo-orc-06", noivaN: 6, vend: "A" as const, status: OrcamentoStatus.APROVADO, descTipo: DescontoTipo.PERCENTUAL, desc: 10,
        itens: [{ tipo: OrcamentoItemTipo.VESTIDO, vestidoN: 6, descricao: "Vestido Manuela (VD-06)", valor: precoVestido(6), qtd: 1 }, { tipo: OrcamentoItemTipo.AJUSTE, descricao: "Ajuste de corpete e barra", valor: 380, qtd: 1 }] },
    ];
    for (const o of ORC) {
      const dados = {
        lojaId: LOJA_ID, leadId: idNoiva(o.noivaN), vendedoraId: vendId(o.vend), status: o.status,
        descontoTipo: o.descTipo, descontoValor: o.desc === null ? null : dec(o.desc),
        aprovadoEm: o.status === OrcamentoStatus.APROVADO ? diaDe(COMP_FECH, 20) : null,
      };
      await prisma.orcamento.upsert({ where: { id: o.id }, create: { id: o.id, ...dados }, update: dados });
      await prisma.orcamentoItem.deleteMany({ where: { orcamentoId: o.id } });
      await prisma.orcamentoItem.createMany({
        data: o.itens.map((it) => ({ lojaId: LOJA_ID, orcamentoId: o.id, tipo: it.tipo, vestidoId: "vestidoN" in it && it.vestidoN ? idVestido(it.vestidoN) : null, descricao: it.descricao, valorUnitario: dec(it.valor), quantidade: it.qtd })),
      });
    }

    // — Contratos (a venda) — fechadoEm define a competência da comissão.
    const CT = [
      { noivaN: 1, vend: "A" as const, comp: COMP_FECH }, { noivaN: 2, vend: "A" as const, comp: COMP_FECH },
      { noivaN: 12, vend: "A" as const, comp: COMP_FECH }, { noivaN: 3, vend: "B" as const, comp: COMP_FECH },
      { noivaN: 4, vend: "A" as const, comp: COMP_ATUAL }, { noivaN: 6, vend: "A" as const, comp: COMP_ATUAL },
      { noivaN: 10, vend: "A" as const, comp: COMP_ATUAL }, { noivaN: 5, vend: "B" as const, comp: COMP_ATUAL },
      { noivaN: 7, vend: "B" as const, comp: COMP_ATUAL }, { noivaN: 9, vend: "B" as const, comp: COMP_ATUAL },
      { noivaN: 11, vend: "B" as const, comp: COMP_ATUAL },
    ];
    for (const c of CT) {
      const noiva = NOIVAS.find((x) => x.n === c.noivaN)!;
      const vN = noiva.reservaVestidoN!;
      const total = precoVestido(vN);
      const id = `demo-ct-${String(c.noivaN).padStart(2, "0")}`;
      const entrada = Math.round(total * 0.3);
      const dados = {
        lojaId: LOJA_ID, leadId: idNoiva(c.noivaN), bloqueioVestidoId: `demo-blq-${String(c.noivaN).padStart(2, "0")}`,
        vendedoraId: vendId(c.vend), valorTotal: dec(total), entrada: dec(entrada), formaPagamento: "Pix + 2x",
        vestidoDescricao: `${VESTIDOS.find((v) => v.n === vN)!.nome} (${codigoVestido(vN)})`,
        dataCasamento: meiaNoiteUTC(D(noiva.offset)), status: ContratoStatus.ATIVO, fechadoEm: diaDe(c.comp, 15),
      };
      await prisma.contrato.upsert({ where: { id }, create: { id, ...dados }, update: dados });

      // Parcelas: entrada (paga no mês do contrato) + 2 parcelas previstas.
      const restante = total - entrada;
      const p1 = Math.floor(restante / 2), p2 = restante - p1;
      const plano = [
        { numero: 0, descricao: "Entrada", valor: entrada, venc: diaDe(c.comp, 18), pago: true },
        { numero: 1, descricao: "Parcela 1/2", valor: p1, venc: diaDe(compOffsetDe(c.comp, 1), 18), pago: false },
        { numero: 2, descricao: "Parcela 2/2", valor: p2, venc: diaDe(compOffsetDe(c.comp, 2), 18), pago: false },
      ];
      for (const pa of plano) {
        const pid = `demo-pc-${String(c.noivaN).padStart(2, "0")}-${pa.numero}`;
        const dadosP = {
          lojaId: LOJA_ID, contratoId: id, numero: pa.numero, descricao: pa.descricao, valorPrevisto: dec(pa.valor),
          vencimento: pa.venc, status: pa.pago ? ParcelaStatus.PAGA : ParcelaStatus.PREVISTA,
          valorRecebido: pa.pago ? dec(pa.valor) : null, recebidoEm: pa.pago ? pa.venc : null, formaRecebimento: pa.pago ? "Pix" : null,
        };
        await prisma.parcela.upsert({ where: { id: pid }, create: { id: pid, ...dadosP }, update: dadosP });
      }
    }

    // — Comissão: regra + faixas (3% até 30k; 5% + bônus 500 acima) p/ as 2 vendedoras —
    function comissaoDe(total: number) {
      return total >= 30000
        ? { pct: 5, comissao: Math.round(total * 5) / 100, bonus: 500 }
        : { pct: 3, comissao: Math.round(total * 3) / 100, bonus: 0 };
    }
    for (const v of ["A", "B"] as const) {
      const rid = `demo-cr-${v}`;
      await prisma.comissaoRegra.upsert({
        where: { id: rid },
        create: { id: rid, lojaId: LOJA_ID, vendedoraId: vendId(v), vigenciaInicio: meiaNoiteUTC("2026-01-01"), bonusAcumulaFaixas: false },
        update: { vendedoraId: vendId(v), vigenciaInicio: meiaNoiteUTC("2026-01-01"), bonusAcumulaFaixas: false, ativo: true },
      });
      await prisma.comissaoFaixa.deleteMany({ where: { regraId: rid } });
      await prisma.comissaoFaixa.createMany({
        data: [
          { lojaId: LOJA_ID, regraId: rid, minAcumulado: dec(0), maxAcumulado: dec(30000), percentual: dec(3), bonusFixo: null },
          { lojaId: LOJA_ID, regraId: rid, minAcumulado: dec(30000), maxAcumulado: null, percentual: dec(5), bonusFixo: dec(500) },
        ],
      });
    }

    // — Fechamento do mês passado (COMP_FECH) por vendedora + ContaPagar COMISSAO —
    for (const v of ["A", "B"] as const) {
      const totalV = CT.filter((c) => c.vend === v && c.comp === COMP_FECH).reduce((s, c) => s + precoVestido(NOIVAS.find((x) => x.n === c.noivaN)!.reservaVestidoN!), 0);
      if (totalV <= 0) continue;
      const r = comissaoDe(totalV);
      const fid = `demo-cf-${v}-${COMP_FECH}`;
      const cpId = `demo-cp-com-${v}`;
      // a ContaPagar de comissão primeiro (o fechamento referencia ela)
      const contaDados = {
        lojaId: LOJA_ID, tipo: ContaPagarTipo.COMISSAO, colaboradorId: vendId(v), competencia: COMP_FECH,
        descricao: `Comissão ${COMP_FECH}`, valorPrevisto: dec(r.comissao + r.bonus), vencimento: venc05ProxMes(COMP_FECH),
        status: ContaPagarStatus.PREVISTA, origemComissaoFechamentoId: fid,
      };
      await prisma.contaPagar.upsert({ where: { id: cpId }, create: { id: cpId, ...contaDados }, update: contaDados });
      const fechDados = {
        lojaId: LOJA_ID, vendedoraId: vendId(v), competencia: COMP_FECH, totalVendas: dec(totalV), percentualAplicado: dec(r.pct),
        valorComissao: dec(r.comissao), valorBonus: dec(r.bonus), valorTotal: dec(r.comissao + r.bonus), contaPagarId: cpId,
      };
      await prisma.comissaoFechamento.upsert({ where: { id: fid }, create: { id: fid, ...fechDados }, update: fechDados });
    }

    // — Folha: salário recorrente + ContaPagar SALARIO (mês passado e corrente) —
    const salarios: { who: string; id: string; base: number }[] = [
      { who: vendA.id, id: "demo-sal-A", base: 3000 },
      { who: vendB.id, id: "demo-sal-B", base: 4000 },
      ...(costureira ? [{ who: costureira.id, id: "demo-sal-C", base: 2500 }] : []),
    ];
    for (const s of salarios) {
      await prisma.salarioRecorrente.upsert({
        where: { id: s.id },
        create: { id: s.id, lojaId: LOJA_ID, colaboradorId: s.who, valorBase: dec(s.base), diaVencimento: 5 },
        update: { colaboradorId: s.who, valorBase: dec(s.base), diaVencimento: 5, ativo: true },
      });
      for (const comp of [COMP_FECH, COMP_ATUAL]) {
        const cid = `demo-cpsal-${comp}-${s.id}`;
        const dados = { lojaId: LOJA_ID, tipo: ContaPagarTipo.SALARIO, colaboradorId: s.who, competencia: comp, descricao: `Salário ${comp}`, valorPrevisto: dec(s.base), vencimento: venc05ProxMes(comp), status: ContaPagarStatus.PREVISTA, salarioRecorrenteId: s.id };
        await prisma.contaPagar.upsert({ where: { id: cid }, create: { id: cid, ...dados }, update: dados });
      }
    }

    // — Despesas / fornecedores (uma atrasada, uma a pagar, uma quitada) —
    const DESP = [
      { id: "demo-cp-aluguel", tipo: ContaPagarTipo.DESPESA, descricao: "Aluguel do atelier", categoria: "Aluguel", fornecedor: null, valor: 4500, venc: diaDe(COMP_ATUAL, 10), status: ContaPagarStatus.PREVISTA },
      { id: "demo-cp-forn", tipo: ContaPagarTipo.FORNECEDOR, descricao: "Tecidos e aviamentos", categoria: null, fornecedor: "Casa do Tecido", valor: 2200, venc: diaDe(COMP_ATUAL, 8), status: ContaPagarStatus.PREVISTA },
      { id: "demo-cp-atraso", tipo: ContaPagarTipo.DESPESA, descricao: "Conta de energia", categoria: "Utilidades", fornecedor: null, valor: 680, venc: diaDe(COMP_FECH, 20), status: ContaPagarStatus.PAGA },
    ];
    for (const d of DESP) {
      const dados = { lojaId: LOJA_ID, tipo: d.tipo, descricao: d.descricao, categoria: d.categoria, fornecedor: d.fornecedor, valorPrevisto: dec(d.valor), vencimento: d.venc, status: d.status };
      await prisma.contaPagar.upsert({ where: { id: d.id }, create: { id: d.id, ...dados }, update: dados });
    }

    // — Pagamentos (saídas de caixa reais → fluxo) —
    // (a) quita a energia (despesa do mês passado) com 1 saída.
    await prisma.pagamento.upsert({
      where: { id: "demo-pg-energia" },
      create: { id: "demo-pg-energia", lojaId: LOJA_ID, data: diaDe(COMP_ATUAL, 6), valorPago: dec(680), forma: "Boleto" },
      update: { data: diaDe(COMP_ATUAL, 6), valorPago: dec(680), forma: "Boleto" },
    });
    await prisma.pagamentoItem.upsert({
      where: { contaPagarId: "demo-cp-atraso" },
      create: { id: "demo-pgi-energia", lojaId: LOJA_ID, pagamentoId: "demo-pg-energia", contaPagarId: "demo-cp-atraso", valor: dec(680) },
      update: { pagamentoId: "demo-pg-energia", valor: dec(680) },
    });
    // (b) "Pagar colaborador": vendA recebe salário + comissão do mês passado numa saída só.
    const salAcpId = `demo-cpsal-${COMP_FECH}-demo-sal-A`;
    await prisma.contaPagar.updateMany({ where: { id: { in: [salAcpId, "demo-cp-com-A"] } }, data: { status: ContaPagarStatus.PAGA } });
    await prisma.contaPagar.updateMany({ where: { id: "demo-cp-atraso" }, data: { status: ContaPagarStatus.PAGA } });
    const comissaoA = comissaoDe(CT.filter((c) => c.vend === "A" && c.comp === COMP_FECH).reduce((s, c) => s + precoVestido(NOIVAS.find((x) => x.n === c.noivaN)!.reservaVestidoN!), 0));
    const totalPagoA = 3000 + comissaoA.comissao + comissaoA.bonus;
    await prisma.pagamento.upsert({
      where: { id: "demo-pg-colabA" },
      create: { id: "demo-pg-colabA", lojaId: LOJA_ID, colaboradorId: vendA.id, data: diaDe(COMP_ATUAL, 5), valorPago: dec(totalPagoA), forma: "Pix", enviadoContabilidadeEm: diaDe(COMP_ATUAL, 7) },
      update: { colaboradorId: vendA.id, data: diaDe(COMP_ATUAL, 5), valorPago: dec(totalPagoA), forma: "Pix", enviadoContabilidadeEm: diaDe(COMP_ATUAL, 7) },
    });
    await prisma.pagamentoItem.upsert({ where: { contaPagarId: salAcpId }, create: { id: "demo-pgi-salA", lojaId: LOJA_ID, pagamentoId: "demo-pg-colabA", contaPagarId: salAcpId, valor: dec(3000) }, update: { pagamentoId: "demo-pg-colabA", valor: dec(3000) } });
    await prisma.pagamentoItem.upsert({ where: { contaPagarId: "demo-cp-com-A" }, create: { id: "demo-pgi-comA", lojaId: LOJA_ID, pagamentoId: "demo-pg-colabA", contaPagarId: "demo-cp-com-A", valor: dec(comissaoA.comissao + comissaoA.bonus) }, update: { pagamentoId: "demo-pg-colabA", valor: dec(comissaoA.comissao + comissaoA.bonus) } });

    // — Projeção de caixa: saldo de referência (âncora) no início do mês corrente —
    await prisma.saldoReferencia.upsert({
      where: { id: "demo-saldo-ref" },
      create: { id: "demo-saldo-ref", lojaId: LOJA_ID, dataReferencia: diaDe(COMP_ATUAL, 1), valor: dec(15000) },
      update: { dataReferencia: diaDe(COMP_ATUAL, 1), valor: dec(15000) },
    });

    // — Cobrança/inadimplência: parcelas vencidas em aberto nas 3 faixas + 1 histórico —
    // hoje ≈ D(-50) (DEMO_BASE = hoje+50); então X dias de atraso = D(-50 - X).
    const ATRASOS = [
      { noivaN: 4, diasAtras: 15, valor: 1200 }, // faixa até 30 dias
      { noivaN: 6, diasAtras: 45, valor: 900 },  // faixa 31–60 dias
      { noivaN: 10, diasAtras: 75, valor: 1500 }, // faixa 60+ dias
    ];
    for (const a of ATRASOS) {
      const pid = `demo-pc-atraso-${a.noivaN}`;
      const dados = {
        lojaId: LOJA_ID,
        contratoId: `demo-ct-${String(a.noivaN).padStart(2, "0")}`,
        numero: 9,
        descricao: "Parcela em atraso",
        valorPrevisto: dec(a.valor),
        vencimento: meiaNoiteUTC(D(-50 - a.diasAtras)),
        status: ParcelaStatus.PREVISTA,
        valorRecebido: null,
        recebidoEm: null,
        formaRecebimento: null,
      };
      await prisma.parcela.upsert({ where: { id: pid }, create: { id: pid, ...dados }, update: dados });
    }
    await prisma.registroCobranca.upsert({
      where: { id: "demo-cob-10" },
      create: { id: "demo-cob-10", lojaId: LOJA_ID, leadId: idNoiva(10), data: meiaNoiteUTC(D(-55)), canal: CobrancaCanal.WHATSAPP, observacao: "Prometeu pagar até sexta." },
      update: { leadId: idNoiva(10), data: meiaNoiteUTC(D(-55)), canal: CobrancaCanal.WHATSAPP, observacao: "Prometeu pagar até sexta." },
    });
  }

  // 7) VERIFICAÇÃO — confere os dois cenários-roteiro de disponibilidade usando o
  //    MOTOR REAL do sistema (mesma lógica de bloco contínuo da tela). Import
  //    relativo (motor é puro, sem alias @) → roda no tsx sem configuração extra.
  const { vestidoDisponivel } = await import("../src/lib/disponibilidade/motor");
  const regras = { provaDiasAntes: 14, provaDuracao: 2, usoDiasAntes: 3, usoDiasDepois: 2, lavagemDiasDepois: 7 };
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const ativos = await prisma.vestido.findMany({
    where: { lojaId: LOJA_ID, status: "ativo" },
    orderBy: { codigo: "asc" },
  });
  const todosBloqueios = await prisma.bloqueioVestido.findMany({ where: { lojaId: LOJA_ID } });
  const porVestido = new Map<string, ReturnType<typeof toBloqueioMotor>[]>();
  for (const b of todosBloqueios) {
    const lista = porVestido.get(b.vestidoId) ?? [];
    lista.push(toBloqueioMotor(b));
    porVestido.set(b.vestidoId, lista);
  }
  function toBloqueioMotor(b: (typeof todosBloqueios)[number]) {
    return {
      id: b.id,
      vestidoId: b.vestidoId,
      tipo: (b.tipo === "RESERVA_CASAMENTO" ? "reserva_casamento" : "manutencao") as "reserva_casamento" | "manutencao",
      casamentoData: ymd(b.casamentoData),
      provaDataReal: ymd(b.provaDataReal),
      retiradaDataReal: ymd(b.retiradaDataReal),
      devolucaoDataReal: ymd(b.devolucaoDataReal),
    };
  }
  const livresEm = (dia: string) =>
    ativos.filter(
      (v) =>
        vestidoDisponivel({
          vestidoId: v.id,
          casamentoDataCandidata: dia,
          regras,
          bloqueiosExistentes: porVestido.get(v.id) ?? [],
        }).disponivel,
    );

  const livresBusy = livresEm(DEMO_BASE_DATE);
  const livresTranquila = livresEm(DATA_TRANQUILA);
  const totalAtivos = ativos.length;

  console.log("\n──────────── Carga de demonstração concluída ────────────");
  console.log(`Loja: ${LOJA_ID}`);
  console.log(`Vestidos ativos no acervo: ${totalAtivos}`);
  console.log(`Noivas: ${NOIVAS.length}  ·  Reservas: ${NOIVAS.filter((n) => n.reservaVestidoN != null).length}  ·  Manutenções: ${MANUTENCOES.length}  ·  Provas: ${PROVAS.length}`);
  console.log("");
  console.log(`📅 DATA MOVIMENTADA  ${DEMO_BASE_DATE} (DEMO_BASE_DATE)`);
  console.log(`   → ${totalAtivos - livresBusy.length} vestidos INDISPONÍVEIS, ${livresBusy.length} livres`);
  console.log(`📅 DATA TRANQUILA    ${DATA_TRANQUILA} (DATA-BASE − 45 dias)`);
  console.log(`   → ${totalAtivos - livresTranquila.length} indisponíveis, ${livresTranquila.length} livres`);
  console.log("─────────────────────────────────────────────────────────\n");

  const indispBusy = totalAtivos - livresBusy.length;
  if (indispBusy < 10) {
    console.warn(`⚠️  Atenção: a data movimentada tem só ${indispBusy} indisponíveis (esperado ≥10). Revise os offsets do cluster.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
