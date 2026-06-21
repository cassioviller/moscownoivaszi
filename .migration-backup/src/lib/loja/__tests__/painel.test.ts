// src/lib/loja/__tests__/painel.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { carregarPainel } from "@/lib/loja/painel";

const MARK = "t-painel-";
let loja = "";
let outra = "";
let destaqueId = "";
let cabineProva = "";
let vendProva = "";

// Mesma convenção do painel: meia-noite UTC do dia de hoje em SP.
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const hoje = new Date(`${ymd}T00:00:00.000Z`);
const emDias = (n: number) => new Date(hoje.getTime() + n * 86_400_000);

// Cria uma reserva (BloqueioVestido RESERVA_CASAMENTO) com uma prova realizada
// (Atendimento{tipo:PROVA, situacao:CONCLUIDO}) para o lead — é assim que a noiva
// DERIVA o estágio "em_provas" (prova realizada = situacao EM_ATENDIMENTO/CONCLUIDO).
async function comProvaRealizada(db: ReturnType<typeof tenantPrisma>, leadId: string, vestidoId: string, hora: number) {
  const b = await db.bloqueioVestido.create({
    data: { vestidoId, leadId, tipo: "RESERVA_CASAMENTO" } as never,
  });
  await db.atendimento.create({
    data: {
      leadId,
      cabineId: cabineProva,
      vendedoraId: vendProva,
      tipo: "PROVA",
      bloqueioId: b.id,
      // hora distinta por prova: a mesma cabine/vendedora no mesmo instante agora colide
      // com a @@unique de slot (anti double-booking). O painel só deriva "em_provas".
      inicio: new Date(hoje.getTime() + hora * 3_600_000),
      situacao: "CONCLUIDO",
    } as never,
  });
}

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);

  // Catálogo mínimo (interesse se expressa via catálogo) — usado para derivar "interesses".
  const attr = await prisma.atributo.create({
    data: {
      lojaId: loja,
      nome: "Volume da saia",
      tipo: "ESCALA",
      ordem: 0,
      opcoes: { create: [{ valor: "Muito", ordem: 0 }] },
    },
    include: { opcoes: true },
  });

  // Vestido âncora para as reservas que produzem "em_provas".
  const vReserva = await db.vestido.create({
    data: { codigo: "R1", nome: `${MARK}reserva`, precoBase: "100.00" } as never,
  });

  // Cabine + vendedora para as provas (Atendimento{tipo:PROVA}).
  cabineProva = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const uProva = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vendProva = uProva.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: uProva.id, lojaId: loja, perfilId: "perfil-vendedora" } });

  // Estágios derivados de FATOS reais (não há mais coluna Lead.etapa para setar):
  //   cadastrada: lead "pelado" (n1 sem casamento, n2 +10d, n3 +40d)
  //   interesses: lead com LeadInteresse + 1 atributo
  //   orcamento_aberto: orcamentoAbertoEm preenchido (Ana Reis, +7d → atenção)
  //   em_provas: reserva com prova COMPARECEU (prov1 +20d, prov2 +14d, prov3 +15d)
  //   encerradas (fora de noivasAtivas): x1 perdida; c1 casamento já passou (-5d)
  await db.lead.create({ data: { noivaNome: `${MARK}n1` } as never });
  await db.lead.create({ data: { noivaNome: `${MARK}n2`, casamentoData: emDias(10) } as never });
  await db.lead.create({ data: { noivaNome: `${MARK}n3`, casamentoData: emDias(40) } as never });

  const int1 = await db.lead.create({ data: { noivaNome: `${MARK}int1` } as never });
  await prisma.leadInteresse.create({
    data: {
      leadId: int1.id,
      atributos: { create: [{ atributoId: attr.id, opcaoId: attr.opcoes[0].id }] },
    },
  });

  await db.lead.create({
    data: { noivaNome: `${MARK}Ana Reis`, orcamentoAbertoEm: hoje, casamentoData: emDias(7) } as never,
  });

  const prov1 = await db.lead.create({ data: { noivaNome: `${MARK}prov1`, casamentoData: emDias(20) } as never });
  const prov2 = await db.lead.create({ data: { noivaNome: `${MARK}prov2`, casamentoData: emDias(14) } as never });
  const prov3 = await db.lead.create({ data: { noivaNome: `${MARK}prov3`, casamentoData: emDias(15) } as never });
  await comProvaRealizada(db, prov1.id, vReserva.id, 9);
  await comProvaRealizada(db, prov2.id, vReserva.id, 10);
  await comProvaRealizada(db, prov3.id, vReserva.id, 11);

  const x1 = await db.lead.create({ data: { noivaNome: `${MARK}x1` } as never });
  await tenantPrisma(prisma, loja).lead.update({ where: { id: x1.id }, data: { perdidaEm: new Date() } });

  await db.lead.create({ data: { noivaNome: `${MARK}c1`, casamentoData: emDias(-5) } as never });

  await db.vestido.create({ data: { codigo: "P1", nome: `${MARK}v1`, precoBase: "100.00" } as never });
  const v2 = await db.vestido.create({ data: { codigo: "P2", nome: `${MARK}v2`, precoBase: "200.00" } as never });
  // v2 ganha foto de capa → vira o destaque do atelier.
  await prisma.vestidoFoto.create({
    data: { vestidoId: v2.id, ordem: 0, bytes: new Uint8Array([1, 2, 3]), mime: "image/webp", largura: 100, altura: 133 },
  });
  destaqueId = v2.id;
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { lojaId: { in: [loja, outra] } } });
  await prisma.vestido.deleteMany({ where: { lojaId: { in: [loja, outra] } } });
  await prisma.atributo.deleteMany({ where: { lojaId: { in: [loja, outra] } } });
  await prisma.loja.deleteMany({ where: { id: { in: [loja, outra] } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("carregarPainel — dashboard com estágio derivado", () => {
  it("conta noivas ativas (exclui perdida e casamento já realizado), acervo e em provas", async () => {
    const p = await carregarPainel(loja);
    // ativas: 3 cadastrada + 1 interesses + 1 orçamento + 3 em provas = 8.
    // x1 (perdida) e c1 (casamento passou) ficam fora.
    expect(p.noivasAtivas).toBe(8);
    expect(p.vestidos).toBe(3); // R1 + P1 + P2
    expect(p.emProvas).toBe(3);
  });

  it("noiva recém-criada cai em 'cadastrada' e aparece na jornada", async () => {
    const p = await carregarPainel(loja);
    const cadastrada = p.jornada.find((e) => e.chave === "cadastrada");
    expect(cadastrada).toEqual({ chave: "cadastrada", rotulo: "Cadastrada", total: 3 });
  });

  it("noiva perdida NÃO conta em noivasAtivas nem aparece na jornada", async () => {
    const p = await carregarPainel(loja);
    // Nenhuma das 8 ativas é perdida; soma das jornadas == noivasAtivas.
    const soma = p.jornada.reduce((s, e) => s + e.total, 0);
    expect(soma).toBe(p.noivasAtivas);
    expect(soma).toBe(8);
  });

  it("jornada lista só estágios vivos com noivas, na ordem do acompanhamento", async () => {
    const p = await carregarPainel(loja);
    expect(p.jornada).toEqual([
      { chave: "cadastrada", rotulo: "Cadastrada", total: 3 },
      { chave: "interesses", rotulo: "Interesses preenchidos", total: 1 },
      { chave: "orcamento_aberto", rotulo: "Orçamento aberto", total: 1 },
      { chave: "em_provas", rotulo: "Em provas", total: 3 },
    ]);
  });

  it("casamentos: conta os de 30 dias e lista os futuros ordenados (passado fora)", async () => {
    const p = await carregarPainel(loja);
    expect(p.casamentosProximos).toBe(5); // 7,10,14,15,20 (40d fora da janela)
    expect(p.proximosCasamentos.map((c) => c.diasRestantes)).toEqual([7, 10, 14, 15, 20]);
  });

  it("atenções: casamento ≤14 dias E em provas/orçamento aberto, ordenadas (A1)", async () => {
    const p = await carregarPainel(loja);
    // Ana Reis (orçamento, 7d) e prov2 (em provas, 14d). prov3 (15d) e prov1 (20d) ficam fora;
    // n2 (10d) é cadastrada → fora.
    expect(p.atencoes.map((a) => ({ rotulo: a.rotulo, dias: a.diasRestantes }))).toEqual([
      { rotulo: "Orçamento aberto", dias: 7 },
      { rotulo: "Em provas", dias: 14 },
    ]);
  });

  it("destaque do atelier: vestido ativo com foto de capa (ordem 0)", async () => {
    const p = await carregarPainel(loja);
    expect(p.destaque?.id).toBe(destaqueId);
    expect(p.destaque?.codigo).toBe("P2");
    expect(p.destaque?.versaoFoto).toBeGreaterThan(0);
  });

  it("é escopado por loja: loja sem dados zera tudo", async () => {
    const p = await carregarPainel(outra);
    expect(p).toMatchObject({
      noivasAtivas: 0,
      vestidos: 0,
      emProvas: 0,
      casamentosProximos: 0,
      jornada: [],
      proximosCasamentos: [],
      atencoes: [],
      destaque: null,
    });
  });
});
