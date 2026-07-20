import { describe, expect, it } from "vitest";
import {
  agingDeParcelas,
  faixaDeAtraso,
  linkWhatsApp,
  msgCobranca,
  rotuloContato,
  type ParcelaComNoiva,
} from "./cobranca";

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

describe("msgCobranca", () => {
  it("cita o valor vencido e há quantos dias", () => {
    const msg = msgCobranca({ noivaNome: "Ana", totalVencido: 1234.5, diasMaisAntigo: 45 });
    expect(msg).toContain("Olá, Ana!");
    // Intl usa espaço estreito não-quebrável entre "R$" e o número — normalizo.
    expect(msg.replace(/\s/g, " ")).toContain("R$ 1.234,50");
    expect(msg).toContain("há 45 dias");
    // A saída para quem já pagou — o tom concierge que a tela pediu.
    expect(msg).toContain("Se já tiver acertado");
  });

  it("um dia de atraso é 'desde ontem', não 'há 1 dias'", () => {
    expect(msgCobranca({ noivaNome: "Bia", totalVencido: 100, diasMaisAntigo: 1 })).toContain("desde ontem");
  });

  it("usa o nome da loja quando há, e cai no atelier quando não", () => {
    expect(msgCobranca({ noivaNome: "Ana", totalVencido: 100, diasMaisAntigo: 5, lojaNome: "Moscow Noivas" })).toContain(
      "Aqui é da Moscow Noivas.",
    );
    expect(msgCobranca({ noivaNome: "Ana", totalVencido: 100, diasMaisAntigo: 5 })).toContain("Aqui é do atelier.");
  });

  it("noiva sem nome não deixa buraco na saudação", () => {
    expect(msgCobranca({ noivaNome: null, totalVencido: 100, diasMaisAntigo: 5 })).toContain("Olá, noiva!");
  });

  it("encoda dentro de um link wa.me sem quebrar", () => {
    const msg = msgCobranca({ noivaNome: "Ana", totalVencido: 100, diasMaisAntigo: 5 });
    const link = linkWhatsApp("(11) 98888-7777", msg);
    expect(link).toContain("https://wa.me/5511988887777?text=");
    expect(decodeURIComponent(link!.split("text=")[1]!)).toBe(msg);
  });
});

describe("rotuloContato", () => {
  it("mostra dia e hora do contato no fuso da loja", () => {
    expect(rotuloContato("2026-06-20T12:00:00.000Z")).toBe("20/06/2026 às 09:00");
  });

  it("contato das 21h fica no dia em que aconteceu, não no seguinte", () => {
    // 21h30 em SP já é o dia seguinte em UTC. Lido cru, escorregaria um dia.
    expect(rotuloContato("2026-06-21T00:30:00.000Z")).toBe("20/06/2026 às 21:30");
  });
});
