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
import { PrismaClient, type LeadEtapa } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LOJA_ID = "loja-moscow";

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DATA-BASE DA DEMO — TROQUE AQUI para deslocar TODA a demonstração no tempo. ║
// ║  Tudo (casamentos, reservas, manutenções, provas) é calculado RELATIVO a    ║
// ║  esta data. É também a "data movimentada" do roteiro (12+ vestidos presos). ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
const DEMO_BASE_DATE = "2026-09-12"; // sábado — alta temporada de casamentos

// ── Helpers de data (UTC, sem off-by-one — mesma convenção do resto do sistema) ──
function addDias(isoBase: string, n: number): string {
  const d = new Date(`${isoBase}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
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

  // 5) PROVAS & AJUSTES — dentro das reservas (operacional, não move disponibilidade).
  for (const p of PROVAS) {
    const blqId = `demo-blq-${String(p.reservaNoivaN).padStart(2, "0")}`;
    const dadosProva = {
      lojaId: LOJA_ID,
      bloqueioId: blqId,
      dataReal: meiaNoiteUTC(p.dataReal),
      tipo: p.tipo,
      comparecimento: p.comparecimento,
      observacao: p.observacao ?? null,
      responsavel: p.responsavel ?? null,
    };
    await prisma.prova.upsert({ where: { id: p.id }, create: { id: p.id, ...dadosProva }, update: dadosProva });

    for (const aj of p.ajustes ?? []) {
      const dadosAjuste = { lojaId: LOJA_ID, provaId: p.id, descricao: aj.descricao, status: aj.status };
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

  // 6) VERIFICAÇÃO — confere os dois cenários-roteiro de disponibilidade usando o
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
