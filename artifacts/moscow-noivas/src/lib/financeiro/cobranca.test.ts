import { describe, expect, it } from "vitest";
import { agingDeParcelas, faixaDeAtraso, linkWhatsApp, type ParcelaComNoiva } from "./cobranca";

const HOJE = "2027-07-16";

/** Parcela vencida há `dias`, da noiva informada. */
function vencida(dias: number, over: Partial<ParcelaComNoiva> & { leadId?: string } = {}): ParcelaComNoiva {
  const { leadId = "lead-1", ...resto } = over;
  const venc = new Date(Date.UTC(2027, 6, 16 - dias, 15)); // meio-dia SP
  return {
    id: `p-${leadId}-${dias}`,
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: 100,
    vencimento: venc.toISOString(),
    status: "PREVISTA",
    contrato: { leadId, lead: { noivaNome: "Ana", whatsapp: "(11) 98888-7777" } },
    ...resto,
  } as ParcelaComNoiva;
}

describe("faixaDeAtraso", () => {
  it("corta nos limites de 30 e 60 dias", () => {
    expect(faixaDeAtraso(1)).toBe("ate30");
    expect(faixaDeAtraso(30)).toBe("ate30");
    expect(faixaDeAtraso(31)).toBe("d31a60");
    expect(faixaDeAtraso(60)).toBe("d31a60");
    expect(faixaDeAtraso(61)).toBe("mais60");
  });
});

describe("linkWhatsApp", () => {
  it("prefixa o DDI 55 em número nacional e encoda a mensagem", () => {
    expect(linkWhatsApp("(11) 98888-7777", "Oi Ana!")).toBe("https://wa.me/5511988887777?text=Oi%20Ana!");
    expect(linkWhatsApp("1133334444", "x")).toBe("https://wa.me/551133334444?text=x");
  });

  it("mantém o número que já vem com DDI", () => {
    expect(linkWhatsApp("+55 11 98888-7777", "x")).toBe("https://wa.me/5511988887777?text=x");
  });

  it("devolve null em vez de link quebrado quando o número é implausível", () => {
    expect(linkWhatsApp(null, "x")).toBeNull();
    expect(linkWhatsApp("", "x")).toBeNull();
    expect(linkWhatsApp("123", "x")).toBeNull();
    expect(linkWhatsApp("1111111111111111", "x")).toBeNull();
    expect(linkWhatsApp("(11) 98888-7777".replace(/8/g, ""), "x")).toBeNull(); // sobra pouco dígito
  });
});

describe("agingDeParcelas", () => {
  it("agrupa por noiva somando o vencido e usa o atraso mais antigo", () => {
    const aging = agingDeParcelas([vencida(10), vencida(45)], HOJE);
    expect(aging.noivas).toHaveLength(1);
    expect(aging.noivas[0]).toMatchObject({
      leadId: "lead-1",
      noivaNome: "Ana",
      totalVencido: 200,
      qtdParcelas: 2,
      diasMaisAntigo: 45,
      faixaMaisAntiga: "d31a60",
    });
  });

  it("cada parcela conta na SUA faixa, mesmo sendo da mesma noiva", () => {
    const aging = agingDeParcelas([vencida(10), vencida(45)], HOJE);
    expect(aging.faixas.ate30).toEqual({ total: 100, qtdNoivas: 1 });
    expect(aging.faixas.d31a60).toEqual({ total: 100, qtdNoivas: 1 });
    expect(aging.faixas.mais60).toEqual({ total: 0, qtdNoivas: 0 });
  });

  it("ordena as noivas pela mais atrasada — a fila de quem ligar antes", () => {
    const aging = agingDeParcelas(
      [vencida(5, { leadId: "recente" }), vencida(90, { leadId: "antiga" }), vencida(40, { leadId: "media" })],
      HOJE,
    );
    expect(aging.noivas.map((n) => n.leadId)).toEqual(["antiga", "media", "recente"]);
  });

  it("parcela que vence hoje não é atraso", () => {
    expect(agingDeParcelas([vencida(0)], HOJE).noivas).toEqual([]);
  });

  it("parcela futura não é atraso", () => {
    expect(agingDeParcelas([vencida(-10)], HOJE).noivas).toEqual([]);
  });

  it("parcela já paga não é cobrança", () => {
    expect(agingDeParcelas([vencida(30, { status: "PAGA" })], HOJE).noivas).toEqual([]);
  });

  it("parcela cancelada não é cobrança", () => {
    expect(agingDeParcelas([vencida(30, { status: "CANCELADA" })], HOJE).noivas).toEqual([]);
  });

  it("sem noiva não há quem cobrar", () => {
    expect(agingDeParcelas([vencida(30, { contrato: null })], HOJE).noivas).toEqual([]);
  });

  it("lista vazia devolve faixas zeradas, não NaN", () => {
    const aging = agingDeParcelas([], HOJE);
    expect(aging.faixas.ate30).toEqual({ total: 0, qtdNoivas: 0 });
    expect(aging.noivas).toEqual([]);
  });
});
