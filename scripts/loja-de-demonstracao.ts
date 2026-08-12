/**
 * A loja de DEMONSTRAÇÃO dos manuais — o cenário que aparece nos prints.
 *
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/loja-de-demonstracao.ts
 *
 * Por que ela existe, medido: as capturas de manual saíam da loja do E2E, e a
 * primeira amostra provou que ela não serve — **1.289 leads**, e os visíveis na
 * primeira tela eram *"Noiva Combobox mspc8…"*, *"E2E Reabrir 178…"*, *"E2E
 * Esquecida 1…"*, todos com *"Casamento a definir"*. Um manual cujo print
 * mostra isso não ensina nada: quem lê não distingue o que é a tela do que é
 * lixo de fixture.
 *
 * O que ela cria, e a régua de cada escolha:
 *
 * - **Nomes plausíveis e inventados.** É uma loja de demonstração, não um
 *   recorte da loja real: nenhum PDF que circula leva nome de noiva de verdade,
 *   telefone de verdade ou CPF de verdade. Os telefones são todos `(11) 9xxxx`
 *   de faixa reservada, e não há CPF nenhum.
 * - **Datas RELATIVAS a hoje.** Um casamento gravado em data fixa envelhece e o
 *   print passa a mostrar contagem negativa. Tudo aqui é `hoje + N`.
 * - **Idempotente por ID fixo** (`demo-*`), como o `global-setup.ts` do E2E:
 *   rodar de novo não duplica, e o print refeito em três meses é o mesmo print.
 * - **Um estado de cada coisa que o manual descreve** — a noiva que acabou de
 *   entrar, a que tem prova marcada, a que recebeu a proposta, a que ACEITOU e
 *   não tem contrato (o selo do funil), a que fechou, a que se perdeu. Sem isso
 *   o print da faixa "próximo passo" mostra sempre a mesma frase.
 *
 * A loja nasce com `id` próprio e nome próprio: ela CONVIVE com a loja do E2E e
 * com a de dev no mesmo banco, e nenhuma das três se atrapalha.
 */
import { eq } from "drizzle-orm";
// A régua do hash é a do servidor (custo 12), e ela mora lá. Importar o módulo
// dele resolve `bcryptjs` a partir de `artifacts/api-server`, onde a dependência
// está declarada — `scripts/` não a declara e não deve declarar.
import { hashSenha } from "../artifacts/api-server/src/lib/auth";
import {
  db,
  pool,
  lojasTable,
  usuariosTable,
  usuariosLojasTable,
  perfisTable,
  vestidosTable,
  leadsTable,
  cabinesTable,
  regraDisponibilidadeTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  contratoItensTable,
  parcelasTable,
  bloqueioVestidosTable,
  atendimentosTable,
  ajustesTable,
  ajusteChecklistItensTable,
} from "../lib/db/src/index";

export const LOJA_DEMO_ID = "demo-manuais-loja";
export const VENDEDORA_EMAIL = "camila@moscownoivas.com";
/** Senha só desta loja de demonstração, e ela nunca sai daqui. */
export const SENHA_DEMO = "demo-dos-manuais";
const ADMIN_EMAIL = "admin@moscownoivas.com";

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date();
/** Hoje + N dias, às HH:MM no fuso da loja (aproximado pelo offset -03). */
const emDias = (n: number, hora = 10, minuto = 0): Date => {
  const d = new Date(agora.getTime() + n * DIA);
  d.setUTCHours(hora + 3, minuto, 0, 0);
  return d;
};
const diaLocal = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** As peças do acervo da demonstração — código, nome e preço plausíveis. */
const VESTIDOS = [
  { id: "demo-vestido-1", codigo: "MS-014", nome: "Sereia Veneza", precoBase: 4800 },
  { id: "demo-vestido-2", codigo: "MS-021", nome: "Princesa Aurora", precoBase: 5600 },
  { id: "demo-vestido-3", codigo: "MS-033", nome: "Reto Chantilly", precoBase: 3900 },
  { id: "demo-vestido-4", codigo: "MS-040", nome: "Evasê Bruges", precoBase: 4200 },
  { id: "demo-vestido-5", codigo: "MS-052", nome: "Império Alençon", precoBase: 3400 },
  { id: "demo-vestido-6", codigo: "MS-061", nome: "Sereia Provence", precoBase: 5200 },
];

/**
 * As noivas, uma por ESTADO que os manuais descrevem. A ordem importa só para a
 * leitura desta lista; a tela ordena pelo que ela ordena.
 */
const NOIVAS = [
  {
    id: "demo-lead-ana",
    noivaNome: "Ana Paula Ribeiro",
    noivoNome: "Thiago Menezes",
    whatsapp: "(11) 96324-1180",
    etapa: "ORCAMENTO_ABERTO" as const,
    origem: "INSTAGRAM" as const,
    casamentoEmDias: 168,
    casamentoLocal: "Espaço Villa Bianca",
    // Ela é a do caminho completo: proposta enviada, aceita, sem contrato.
  },
  {
    id: "demo-lead-beatriz",
    noivaNome: "Beatriz Camargo",
    noivoNome: "Rafael Duarte",
    whatsapp: "(11) 95580-2244",
    etapa: "CONTRATO_FECHADO" as const,
    origem: "LOJA" as const,
    casamentoEmDias: 96,
    casamentoLocal: "Fazenda Santa Bárbara",
  },
  {
    id: "demo-lead-carolina",
    noivaNome: "Carolina Nunes",
    noivoNome: "Eduardo Blanco",
    whatsapp: "(11) 94417-8890",
    etapa: "ATENDIMENTO_AGENDADO" as const,
    origem: "WHATSAPP" as const,
    casamentoEmDias: 240,
    casamentoLocal: "Igreja Nossa Senhora do Brasil",
  },
  {
    id: "demo-lead-daniela",
    noivaNome: "Daniela Prado",
    whatsapp: "(11) 93302-5517",
    etapa: "NOVO" as const,
    origem: "SITE" as const,
    casamentoEmDias: 310,
  },
  {
    id: "demo-lead-fernanda",
    noivaNome: "Fernanda Lopes",
    noivoNome: "Caio Bastos",
    whatsapp: "(11) 98871-6003",
    etapa: "INTERESSES_PREENCHIDOS" as const,
    origem: "INSTAGRAM" as const,
    casamentoEmDias: 205,
    casamentoLocal: "Casa Petra",
  },
  {
    id: "demo-lead-juliana",
    noivaNome: "Juliana Moreira",
    noivoNome: "Pedro Sarmento",
    whatsapp: "(11) 97740-3312",
    etapa: "EM_PROVAS" as const,
    origem: "LOJA" as const,
    casamentoEmDias: 34,
    casamentoLocal: "Buffet Colonial",
  },
  {
    id: "demo-lead-marina",
    noivaNome: "Marina Tavares",
    whatsapp: "(11) 96650-9928",
    etapa: "PERDIDO" as const,
    origem: "SITE" as const,
    casamentoEmDias: 150,
  },
];

async function main(): Promise<void> {
  const [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
  if (!admin) {
    throw new Error(
      "loja-de-demonstracao: não há admin no banco. Rode o seed oficial primeiro:\n" +
        "  pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts",
    );
  }

  // ── A loja ────────────────────────────────────────────────────────────────
  await db
    .insert(lojasTable)
    .values({
      id: LOJA_DEMO_ID,
      nome: "Moscow Noivas",
      endereco: "Rua das Palmeiras, 412 — Higienópolis, São Paulo",
      telefone: "(11) 3062-4400",
    })
    .onConflictDoUpdate({
      target: lojasTable.id,
      set: {
        nome: "Moscow Noivas",
        endereco: "Rua das Palmeiras, 412 — Higienópolis, São Paulo",
        telefone: "(11) 3062-4400",
      },
    });

  // O admin do banco entra na loja com o perfil de proprietária, que é o
  // perfil dos prints do manual do proprietário.
  const [perfilDono] = await db
    .select()
    .from(perfisTable)
    .where(eq(perfisTable.nome, "Proprietária"));
  if (!perfilDono) throw new Error("loja-de-demonstracao: perfil 'Proprietária' não existe no banco");
  await db
    .insert(usuariosLojasTable)
    .values({ usuarioId: admin.id, lojaId: LOJA_DEMO_ID, perfilId: perfilDono.id })
    .onConflictDoUpdate({
      target: [usuariosLojasTable.usuarioId, usuariosLojasTable.lojaId],
      set: { perfilId: perfilDono.id },
    });

  /**
   * A VENDEDORA da demonstração — e ela não é enfeite.
   *
   * O admin do banco é superadmin, e superadmin vê tudo: um print do menu feito
   * com a sessão dele mostraria Financeiro e Permissões no manual da vendedora,
   * que é exatamente a mentira que a varredura dos manuais existe para impedir.
   * Os prints de cada manual saem da sessão do PERFIL daquele manual.
   */
  const [perfilVendedora] = await db
    .select()
    .from(perfisTable)
    .where(eq(perfisTable.nome, "Vendedora"));
  const senhaHash = await hashSenha(SENHA_DEMO);
  await db
    .insert(usuariosTable)
    .values({
      id: "demo-usuario-vendedora",
      nome: "Camila Duarte",
      email: VENDEDORA_EMAIL,
      senhaHash,
      ativo: true,
    })
    .onConflictDoUpdate({
      target: usuariosTable.id,
      set: { nome: "Camila Duarte", senhaHash, ativo: true },
    });
  if (!perfilVendedora) throw new Error("loja-de-demonstracao: perfil 'Vendedora' não existe no banco");
  await db
    .insert(usuariosLojasTable)
    .values({ usuarioId: "demo-usuario-vendedora", lojaId: LOJA_DEMO_ID, perfilId: perfilVendedora.id })
    .onConflictDoUpdate({
      target: [usuariosLojasTable.usuarioId, usuariosLojasTable.lojaId],
      set: { perfilId: perfilVendedora.id },
    });

  // ── Cabines e expediente ──────────────────────────────────────────────────
  for (const [i, nome] of ["Cabine 1", "Cabine 2", "Cabine 3"].entries()) {
    await db
      .insert(cabinesTable)
      .values({ id: `demo-cabine-${i + 1}`, lojaId: LOJA_DEMO_ID, nome, ativo: true })
      .onConflictDoUpdate({ target: cabinesTable.id, set: { nome, ativo: true } });
  }
  await db
    .insert(regraDisponibilidadeTable)
    .values({
      id: "demo-regra-disponibilidade",
      lojaId: LOJA_DEMO_ID,
      atendimentoAberturaHora: 9,
      atendimentoFechamentoHora: 19,
      diasFuncionamento: [1, 2, 3, 4, 5, 6],
      provaDuracao: 2,
    })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.id,
      set: { atendimentoAberturaHora: 9, atendimentoFechamentoHora: 19, provaDuracao: 2 },
    });

  // ── O acervo ──────────────────────────────────────────────────────────────
  for (const v of VESTIDOS) {
    await db
      .insert(vestidosTable)
      .values({ ...v, lojaId: LOJA_DEMO_ID })
      .onConflictDoUpdate({
        target: vestidosTable.id,
        set: { codigo: v.codigo, nome: v.nome, precoBase: v.precoBase },
      });
  }

  // ── As noivas ─────────────────────────────────────────────────────────────
  for (const n of NOIVAS) {
    const { casamentoEmDias, ...resto } = n;
    const valores = {
      ...resto,
      lojaId: LOJA_DEMO_ID,
      casamentoData: emDias(casamentoEmDias, 16, 0),
      casamentoHorario: "16:00",
      ...(n.etapa === "PERDIDO"
        ? { perdidaEm: emDias(-22), perdidaMotivo: "PRECO" as const }
        : {}),
      ...(n.etapa === "ORCAMENTO_ABERTO" ? { orcamentoAbertoEm: emDias(-9) } : {}),
      ...(n.etapa === "CONTRATO_FECHADO" || n.etapa === "EM_PROVAS"
        ? { orcamentoAbertoEm: emDias(-40), contratoFechadoEm: emDias(-31) }
        : {}),
    };
    await db.insert(leadsTable).values(valores).onConflictDoUpdate({
      target: leadsTable.id,
      set: valores,
    });
  }
  // O SELO do funil: a Ana Paula aceitou e ainda não tem contrato (S-O10).
  await db
    .update(leadsTable)
    .set({ aceiteEm: emDias(-2, 21, 14) })
    .where(eq(leadsTable.id, "demo-lead-ana"));

  // ── A proposta da Ana Paula: enviada, aberta pela noiva e ACEITA ──────────
  const validade = emDias(21, 23, 59);
  await db
    .insert(orcamentosTable)
    .values({
      id: "demo-orcamento-ana",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-ana",
      vendedoraId: admin.id,
      status: "ENVIADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
      validade,
      observacoes:
        "O valor inclui a prova de ajuste e a lavagem. A retirada é combinada três dias antes do casamento.",
      publicoToken: "demo-proposta-ana-paula",
      publicoExpiraEm: emDias(7, 23, 59),
      publicoAbertoEm: emDias(-2, 20, 51),
      aceitoEm: emDias(-2, 21, 14),
      aceiteVersao: 1,
    })
    .onConflictDoUpdate({
      target: orcamentosTable.id,
      set: {
        status: "ENVIADO",
        validade,
        publicoExpiraEm: emDias(7, 23, 59),
        publicoAbertoEm: emDias(-2, 20, 51),
        aceitoEm: emDias(-2, 21, 14),
      },
    });
  const ITENS_ANA = [
    { id: "demo-orcitem-1", tipo: "VESTIDO" as const, descricao: "MS-014 · Sereia Veneza", valorUnitario: 4800, quantidade: 1, vestidoId: "demo-vestido-1" },
    { id: "demo-orcitem-2", tipo: "ACESSORIO" as const, descricao: "Véu longo bordado", valorUnitario: 620, quantidade: 1 },
    { id: "demo-orcitem-3", tipo: "SERVICO" as const, descricao: "Prova de ajuste com a costureira", valorUnitario: 180, quantidade: 2 },
  ];
  for (const it of ITENS_ANA) {
    await db
      .insert(orcamentoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, orcamentoId: "demo-orcamento-ana" })
      .onConflictDoUpdate({ target: orcamentoItensTable.id, set: { descricao: it.descricao, valorUnitario: it.valorUnitario } });
  }

  // ── O contrato da Beatriz, com carnê ──────────────────────────────────────
  const casamentoBeatriz = emDias(96, 16, 0);
  await db
    .insert(bloqueioVestidosTable)
    .values({
      id: "demo-bloqueio-beatriz",
      lojaId: LOJA_DEMO_ID,
      vestidoId: "demo-vestido-2",
      leadId: "demo-lead-beatriz",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamentoBeatriz,
      ocupacaoInicio: diaLocal(new Date(casamentoBeatriz.getTime() - 3 * DIA)),
      ocupacaoFim: diaLocal(new Date(casamentoBeatriz.getTime() + 2 * DIA)),
    })
    .onConflictDoNothing();

  const TOTAL_BEATRIZ = 6180;
  await db
    .insert(contratosTable)
    .values({
      id: "demo-contrato-beatriz",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-beatriz",
      vendedoraId: admin.id,
      status: "ATIVO",
      valorTotal: TOTAL_BEATRIZ,
      formaPagamento: "PIX",
      dataCasamento: casamentoBeatriz,
      dataRetirada: new Date(casamentoBeatriz.getTime() - 3 * DIA),
      vestidoDescricao: "MS-021 · Princesa Aurora",
      fechadoEm: emDias(-31, 15, 20),
    })
    .onConflictDoNothing();
  for (const it of [
    { id: "demo-contitem-1", tipo: "VESTIDO" as const, descricao: "MS-021 · Princesa Aurora", valorUnitario: 5600, quantidade: 1, vestidoId: "demo-vestido-2" },
    { id: "demo-contitem-2", tipo: "ACESSORIO" as const, descricao: "Tiara de cristais", valorUnitario: 580, quantidade: 1 },
  ]) {
    await db
      .insert(contratoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, contratoId: "demo-contrato-beatriz" })
      .onConflictDoNothing();
  }
  // Carnê: entrada paga + 5 parcelas, as duas primeiras já recebidas.
  const PARCELAS = [
    { numero: 0, descricao: "Entrada", valor: 1180, venceEmDias: -31, pago: true },
    { numero: 1, valor: 1000, venceEmDias: -14, pago: true },
    { numero: 2, valor: 1000, venceEmDias: 16, pago: false },
    { numero: 3, valor: 1000, venceEmDias: 46, pago: false },
    { numero: 4, valor: 1000, venceEmDias: 76, pago: false },
    { numero: 5, valor: 1000, venceEmDias: 106, pago: false },
  ];
  for (const p of PARCELAS) {
    await db
      .insert(parcelasTable)
      .values({
        id: `demo-parcela-${p.numero}`,
        lojaId: LOJA_DEMO_ID,
        contratoId: "demo-contrato-beatriz",
        numero: p.numero,
        origem: "PLANO",
        descricao: p.descricao ?? null,
        valorPrevisto: p.valor,
        vencimento: emDias(p.venceEmDias, 12, 0),
        status: p.pago ? "PAGA" : "PREVISTA",
        valorRecebido: p.pago ? p.valor : null,
        recebidoEm: p.pago ? emDias(p.venceEmDias, 14, 30) : null,
        formaRecebimento: p.pago ? "PIX" : null,
      })
      .onConflictDoNothing();
  }

  // ── A agenda de hoje e a prova da Juliana ─────────────────────────────────
  const casamentoJuliana = emDias(34, 16, 0);
  await db
    .insert(bloqueioVestidosTable)
    .values({
      id: "demo-bloqueio-juliana",
      lojaId: LOJA_DEMO_ID,
      vestidoId: "demo-vestido-6",
      leadId: "demo-lead-juliana",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamentoJuliana,
      ocupacaoInicio: diaLocal(new Date(casamentoJuliana.getTime() - 3 * DIA)),
      ocupacaoFim: diaLocal(new Date(casamentoJuliana.getTime() + 2 * DIA)),
    })
    .onConflictDoNothing();

  const AGENDA = [
    { id: "demo-atend-1", leadId: "demo-lead-carolina", cabineId: "demo-cabine-1", tipo: "ATENDIMENTO" as const, emDias: 0, hora: 10, situacao: "AGENDADO" as const },
    { id: "demo-atend-2", leadId: "demo-lead-fernanda", cabineId: "demo-cabine-2", tipo: "ATENDIMENTO" as const, emDias: 0, hora: 14, situacao: "AGENDADO" as const },
    { id: "demo-atend-3", leadId: "demo-lead-juliana", cabineId: "demo-cabine-1", tipo: "PROVA" as const, emDias: 4, hora: 15, situacao: "AGENDADO" as const, bloqueioId: "demo-bloqueio-juliana" },
    { id: "demo-atend-4", leadId: "demo-lead-ana", cabineId: "demo-cabine-3", tipo: "ATENDIMENTO" as const, emDias: -9, hora: 11, situacao: "CONCLUIDO" as const, desfecho: "RESERVOU" as const },
  ];
  for (const a of AGENDA) {
    const { emDias: dias, hora, desfecho, ...resto } = a;
    await db
      .insert(atendimentosTable)
      .values({
        ...resto,
        lojaId: LOJA_DEMO_ID,
        vendedoraId: admin.id,
        inicio: emDias(dias, hora, 0),
        ...(desfecho ? { desfecho, atendidoEm: emDias(dias, hora, 6) } : {}),
      })
      .onConflictDoNothing();
  }

  // ── A fila da costureira ──────────────────────────────────────────────────
  await db
    .insert(ajustesTable)
    .values({
      id: "demo-ajuste-1",
      lojaId: LOJA_DEMO_ID,
      atendimentoId: "demo-atend-3",
      tipo: "AJUSTE",
      descricao: "Barra e alças — Juliana Moreira",
      status: "PENDENTE",
    })
    .onConflictDoNothing();
  for (const [i, item] of ["Marcar a barra", "Ajustar as alças", "Fechar o busto"].entries()) {
    await db
      .insert(ajusteChecklistItensTable)
      .values({
        id: `demo-checklist-${i + 1}`,
        ajusteId: "demo-ajuste-1",
        descricao: item,
        ordem: i + 1,
        feito: i === 0,
      })
      .onConflictDoNothing();
  }

  console.log(
    [
      "loja-de-demonstracao: pronta.",
      `  loja      ${LOJA_DEMO_ID}`,
      `  noivas    ${NOIVAS.length}`,
      `  vestidos  ${VESTIDOS.length}`,
      "  proposta  demo-orcamento-ana (token demo-proposta-ana-paula)",
      "  contrato  demo-contrato-beatriz (6 parcelas, 2 pagas)",
    ].join("\n"),
  );
  await pool.end();
}

await main();
