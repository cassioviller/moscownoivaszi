// Integração: itensDoMes monta a mini-agenda por dia (casamento + itens com hora).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { itensDoMes } from "@/lib/calendario/dados";

const MARK = "t-itens-";
let loja = "";
const ymdHoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const base = new Date(`${ymdHoje}T00:00:00.000Z`);
base.setUTCDate(base.getUTCDate() + 25);
const dia = base.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  const vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  const noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Maria`, etapa: "NOVO" } as never })).id;
  const cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: dia });
  if (r.ok) await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: u.id, dataYMD: dia, hora: 9, tipo: "PROVA", bloqueioId: r.bloqueioId });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("itensDoMes", () => {
  it("agrupa por dia com casamento primeiro e prova com hora", async () => {
    const inicio = new Date(`${dia}T00:00:00.000Z`);
    const fim = new Date(inicio.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1);
    const porDia = await itensDoMes(loja, inicio, fim, { financeiro: false });
    const d = porDia.get(dia);
    expect(d).toBeTruthy();
    expect(d!.itens[0]).toMatchObject({ tipo: "casamento", noivaNome: `${MARK}Maria` });
    expect(d!.itens.some((i) => i.tipo === "prova" && i.hora === 9)).toBe(true);
  });
});
