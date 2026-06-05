// Integração (Postgres real): leitura de itens pagos p/ contabilidade + marcar enviados.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { lancarConta, registrarPagamento } from "@/lib/financeiro/pagar";
import { itensPagosNoIntervalo, marcarEnviadosNoIntervalo } from "@/lib/financeiro/contabilidade";

const MARK = "t-contab-";
let loja = "";
let colaborador = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const u = await prisma.usuario.create({
    data: { nome: `${MARK}Vera`, email: `${MARK}vera${Date.now()}@x.local`, senhaHash: "x" },
  });
  colaborador = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: colaborador, lojaId: loja, perfilId: "perfil-vendedora" } });

  const c = await lancarConta(loja, {
    tipo: "SALARIO",
    colaboradorId: colaborador,
    competencia: "2027-07",
    descricao: "Salário",
    valorPrevisto: "2.000,00",
    vencimento: "2027-07-05",
  });
  if (!c.ok) throw new Error("falhou lançar conta");
  const pg = await registrarPagamento(loja, {
    colaboradorId: colaborador,
    data: "2027-07-06",
    forma: "Pix",
    itens: [{ contaPagarId: c.contaId, valor: "2.000,00" }],
  });
  if (!pg.ok) throw new Error("falhou registrar pagamento");
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("contabilidade: itens pagos no intervalo", () => {
  it("retorna o item dentro do intervalo (valor/tipo) e nada fora dele", async () => {
    const gte = new Date("2027-07-01T00:00:00.000Z");
    const lt = new Date("2027-08-01T00:00:00.000Z");
    const dentro = await itensPagosNoIntervalo(loja, { gte, lt });
    expect(dentro).toHaveLength(1);
    expect(dentro[0].valor).toBe("2000.00");
    expect(dentro[0].tipo).toBe("SALARIO");
    expect(dentro[0].quem).toBe(`${MARK}Vera`);

    const foraGte = new Date("2027-08-01T00:00:00.000Z");
    const foraLt = new Date("2027-09-01T00:00:00.000Z");
    expect(await itensPagosNoIntervalo(loja, { gte: foraGte, lt: foraLt })).toHaveLength(0);
  });
});

describe("contabilidade: marcar enviados", () => {
  it("marca 1 na primeira vez e 0 na segunda (idempotente)", async () => {
    const gte = new Date("2027-07-01T00:00:00.000Z");
    const lt = new Date("2027-08-01T00:00:00.000Z");
    expect(await marcarEnviadosNoIntervalo(loja, { gte, lt })).toBe(1);
    expect(await marcarEnviadosNoIntervalo(loja, { gte, lt })).toBe(0);
  });
});
