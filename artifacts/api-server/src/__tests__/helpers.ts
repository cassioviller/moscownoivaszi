import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  db,
  pool,
  lojasTable,
  perfisTable,
  usuariosTable,
  usuariosLojasTable,
  vestidosTable,
  leadsTable,
  reservasTable,
  bloqueioVestidosTable,
  regraDisponibilidadeTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  type Vestido,
  type Lead,
  type Reserva,
  type BloqueioVestido,
  type RegraDisponibilidade,
  type Orcamento,
  type OrcamentoItem,
  type Contrato,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { hashSenha } from "../lib/auth";
import app from "../app";
import {
  buscarRegra,
  ocupacaoFisica,
  type BloqueioJanelasInput,
} from "../lib/disponibilidade";

export const SENHA_TESTE = "senha-teste-123";

export interface Fixture {
  lojaId: string;
  perfilId: string;
  vendedoraId: string;
  vendedoraEmail: string;
  superAdminId: string;
  superAdminEmail: string;
}

// Cria loja/perfil/usuários exclusivos deste teste (sufixo aleatório) para não
// depender nem interferir nos dados existentes do banco de desenvolvimento.
export async function criarFixture(): Promise<Fixture> {
  const sufixo = randomUUID().slice(0, 8);
  const senhaHash = await hashSenha(SENHA_TESTE);

  const lojaId = randomUUID();
  await db.insert(lojasTable).values({ id: lojaId, nome: `Loja Teste ${sufixo}` });

  const perfilId = randomUUID();
  await db.insert(perfisTable).values({
    id: perfilId,
    nome: `Perfil Teste ${sufixo}`,
    acessosModulos: { leads: true, vestidos: true, agenda: true },
  });

  const vendedoraId = randomUUID();
  const vendedoraEmail = `vendedora-${sufixo}@teste.local`;
  const superAdminId = randomUUID();
  const superAdminEmail = `superadmin-${sufixo}@teste.local`;

  await db.insert(usuariosTable).values([
    { id: vendedoraId, nome: `Vendedora Teste ${sufixo}`, email: vendedoraEmail, senhaHash },
    { id: superAdminId, nome: `Super Admin Teste ${sufixo}`, email: superAdminEmail, senhaHash, isSuperAdmin: true },
  ]);

  await db.insert(usuariosLojasTable).values({ usuarioId: vendedoraId, lojaId, perfilId });

  return { lojaId, perfilId, vendedoraId, vendedoraEmail, superAdminId, superAdminEmail };
}

// Remove somente o que a fixture criou. Usuários cascateiam sessões e vínculos;
// a loja cascateia entidades de teste criadas sob ela.
export async function limparFixture(f: Fixture): Promise<void> {
  await db.delete(usuariosTable).where(inArray(usuariosTable.id, [f.vendedoraId, f.superAdminId]));
  await db.delete(lojasTable).where(eq(lojasTable.id, f.lojaId));
  await db.delete(perfisTable).where(eq(perfisTable.id, f.perfilId));
}

export async function fecharPool(): Promise<void> {
  await pool.end();
}

// Autentica a vendedora e seleciona a loja ativa; retorna o agent com cookies.
export async function loginComLoja(email: string, lojaId: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, senha: SENHA_TESTE }).expect(200);
  await agent.post("/api/auth/selecionar-loja").send({ lojaId }).expect(200);
  return agent;
}

// ────────────────── Datas de negócio (Lote 3) ──────────────────
// Nunca `new Date()` para datas de negócio: âncora literal ao meio-dia de
// São Paulo (offset explícito; SP não tem DST desde 2019).

export const DATA_BASE_CASAMENTO = new Date("2027-09-15T12:00:00-03:00");

const MS_POR_DIA = 86_400_000;

/** DATA_BASE_CASAMENTO + offsetDias, preservando o meio-dia local. */
export function dataFutura(offsetDias: number): Date {
  return new Date(DATA_BASE_CASAMENTO.getTime() + offsetDias * MS_POR_DIA);
}

// ────────────────── Fixtures por inserção direta (Lote 3) ──────────────────
// Tudo pendurado em f.lojaId: o delete da loja cascateia a limpeza.

export async function criarVestido(
  f: Fixture,
  overrides: Partial<typeof vestidosTable.$inferInsert> = {},
): Promise<Vestido> {
  const sufixo = randomUUID().slice(0, 8);
  const [vestido] = await db
    .insert(vestidosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      codigo: `VT-${sufixo}`,
      nome: `Vestido Teste ${sufixo}`,
      precoBase: 5000,
      ...overrides,
    })
    .returning();
  return vestido;
}

export async function criarLead(
  f: Fixture,
  overrides: Partial<typeof leadsTable.$inferInsert> = {},
): Promise<Lead> {
  const sufixo = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(leadsTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      noivaNome: `Noiva Teste ${sufixo}`,
      ...overrides,
    })
    .returning();
  return lead;
}

// Upsert: regra_disponibilidade tem UNIQUE por loja.
export async function criarRegraDisponibilidade(
  f: Fixture,
  valores: Partial<Omit<typeof regraDisponibilidadeTable.$inferInsert, "id" | "lojaId">> = {},
): Promise<RegraDisponibilidade> {
  const [regra] = await db
    .insert(regraDisponibilidadeTable)
    .values({ id: randomUUID(), lojaId: f.lojaId, ...valores })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.lojaId,
      set: { ...valores, lojaId: f.lojaId },
    })
    .returning();
  return regra;
}

export async function criarOrcamento(
  f: Fixture,
  params: { leadId: string; status?: Orcamento["status"]; vendedoraId?: string },
): Promise<Orcamento> {
  const status = params.status ?? "APROVADO";
  const [orcamento] = await db
    .insert(orcamentosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      vendedoraId: params.vendedoraId ?? f.vendedoraId,
      status,
      aprovadoEm: status === "APROVADO" ? new Date() : null,
    })
    .returning();
  return orcamento;
}

export async function criarOrcamentoItem(
  f: Fixture,
  params: {
    orcamentoId: string;
    tipo?: OrcamentoItem["tipo"];
    descricao?: string;
    valorUnitario?: number;
    quantidade?: number;
    vestidoId?: string | null;
  },
): Promise<OrcamentoItem> {
  const sufixo = randomUUID().slice(0, 8);
  const [item] = await db
    .insert(orcamentoItensTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      orcamentoId: params.orcamentoId,
      tipo: params.tipo ?? "VESTIDO",
      descricao: params.descricao ?? `Item ${sufixo}`,
      valorUnitario: params.valorUnitario ?? 5000,
      quantidade: params.quantidade ?? 1,
      vestidoId: params.vestidoId ?? null,
    })
    .returning();
  return item;
}

export async function criarReserva(
  f: Fixture,
  params: { leadId: string; casamentoData: Date; status?: Reserva["status"] },
): Promise<Reserva> {
  const [reserva] = await db
    .insert(reservasTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      casamentoData: params.casamentoData,
      status: params.status,
    })
    .returning();
  return reserva;
}

// Inserção direta com fechadoEm/estorno controlados — para testes de comissão
// por competência (a rota sempre usa new Date() no fechadoEm).
export async function criarContrato(
  f: Fixture,
  params: {
    leadId: string;
    vendedoraId?: string;
    valorTotal: number;
    fechadoEm: Date;
    canceladoEm?: Date | null;
    comissaoEstornadaEm?: Date | null;
  },
): Promise<Contrato> {
  const cancelado = params.canceladoEm ?? params.comissaoEstornadaEm ?? null;
  const [contrato] = await db
    .insert(contratosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      vendedoraId: params.vendedoraId ?? f.vendedoraId,
      valorTotal: params.valorTotal,
      fechadoEm: params.fechadoEm,
      status: cancelado ? "CANCELADO" : "ATIVO",
      canceladoEm: cancelado,
      comissaoEstornadaEm: params.comissaoEstornadaEm ?? null,
    })
    .returning();
  return contrato;
}

export interface CriarBloqueioParams {
  vestidoId: string;
  tipo: BloqueioVestido["tipo"];
  casamentoData?: Date | null;
  leadId?: string | null;
  reservaId?: string | null;
  provaDataReal?: Date | null;
  retiradaDataReal?: Date | null;
  devolucaoDataReal?: Date | null;
  inicio?: Date | null;
  fim?: Date | null;
  canceladoEm?: Date | null;
}

// Como a rota: materializa o envelope físico (ocupacao_inicio/fim) via
// ocupacaoFisica do serviço, com a regra efetiva da loja.
export async function criarBloqueio(
  f: Fixture,
  params: CriarBloqueioParams,
): Promise<BloqueioVestido> {
  const id = randomUUID();
  const candidato: BloqueioJanelasInput = {
    id,
    tipo: params.tipo,
    casamentoData: params.casamentoData ?? null,
    provaDataReal: params.provaDataReal ?? null,
    retiradaDataReal: params.retiradaDataReal ?? null,
    devolucaoDataReal: params.devolucaoDataReal ?? null,
    inicio: params.inicio ?? null,
    fim: params.fim ?? null,
  };
  const regra = await buscarRegra(f.lojaId);
  const ocupacao = ocupacaoFisica(candidato, regra);
  const [bloqueio] = await db
    .insert(bloqueioVestidosTable)
    .values({
      id,
      lojaId: f.lojaId,
      vestidoId: params.vestidoId,
      leadId: params.leadId ?? null,
      reservaId: params.reservaId ?? null,
      tipo: params.tipo,
      casamentoData: candidato.casamentoData,
      provaDataReal: candidato.provaDataReal,
      retiradaDataReal: candidato.retiradaDataReal,
      devolucaoDataReal: candidato.devolucaoDataReal,
      inicio: candidato.inicio,
      fim: candidato.fim,
      canceladoEm: params.canceladoEm ?? null,
      ocupacaoInicio: ocupacao?.inicio ?? null,
      ocupacaoFim: ocupacao?.fim ?? null,
    })
    .returning();
  return bloqueio;
}
