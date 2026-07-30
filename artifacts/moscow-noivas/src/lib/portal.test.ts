import { describe, expect, it, vi, afterEach } from "vitest";
import {
  portalVivo,
  portalVencido,
  urlsDePortalPorLead,
  leadsComPortalVencido,
} from "./portal";

/**
 * A11/E100 — a função que decide se a mensagem sai com link vivo ou morto.
 *
 * O cabeçalho do próprio `portal.ts` diz: **"link morto na mensagem é pior que
 * nenhum"** — e não havia um teste para isso. É ela que o E84 consulta antes de
 * montar cada wa.me de cobrança: um falso positivo manda a noiva para uma
 * página que responde 404 como se o link nunca tivesse valido, no meio de uma
 * conversa sobre dinheiro.
 */
const EM = (iso: string) => vi.setSystemTime(new Date(iso));

/**
 * `linkDoPortal` lê `window.location.origin`, e o vitest do frontend roda em
 * node — sem DOM. O stub fica no teste e não no código de produção: a função
 * está certa, quem não tem janela é o ambiente de teste. (Mesma limitação que o
 * E99 encontrou ao tentar testar componente.)
 */
vi.stubGlobal("window", { location: { origin: "https://moscow.example" } });

afterEach(() => vi.useRealTimers());

describe("portalVivo", () => {
  it("vivo: não revogado e ainda no prazo", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(portalVivo({ token: "t", expiraEm: "2026-08-26T12:00:00Z" })).toBe(true);
  });

  it("revogado é morto, mesmo dentro do prazo — a revogação ganha do TTL", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(
      portalVivo({
        token: "t",
        expiraEm: "2026-08-26T12:00:00Z",
        revogadoEm: "2026-07-20T12:00:00Z",
      }),
    ).toBe(false);
  });

  it("expirado é morto, mesmo sem revogação", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(portalVivo({ token: "t", expiraEm: "2026-07-26T12:00:00Z" })).toBe(false);
  });

  /**
   * A fronteira do instante. `>` e não `>=`: um token que expira EXATAMENTE
   * agora está morto. É a escolha certa para link em mensagem — a noiva abre
   * segundos depois de a mensagem sair, nunca no mesmo milissegundo.
   */
  it("no instante exato da expiração já está morto", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00.000Z");
    expect(portalVivo({ token: "t", expiraEm: "2026-07-27T12:00:00.000Z" })).toBe(false);
    expect(portalVivo({ token: "t", expiraEm: "2026-07-27T12:00:00.001Z" })).toBe(true);
  });

  it("ausente é morto — e `null`/`undefined` não podem explodir no caminho da mensagem", () => {
    expect(portalVivo(null)).toBe(false);
    expect(portalVivo(undefined)).toBe(false);
  });

  it("aceita Date e string, porque o payload da API muda de forma no caminho", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(portalVivo({ token: "t", expiraEm: new Date("2026-08-26T12:00:00Z") })).toBe(true);
    expect(portalVivo({ token: "t", expiraEm: new Date("2026-07-01T12:00:00Z") })).toBe(false);
  });
});

describe("urlsDePortalPorLead", () => {
  it("só os vivos entram no mapa — quem tem portal morto simplesmente não aparece", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    const mapa = urlsDePortalPorLead([
      { leadId: "viva", token: "T1", expiraEm: "2026-08-26T12:00:00Z" },
      { leadId: "expirada", token: "T2", expiraEm: "2026-07-01T12:00:00Z" },
      { leadId: "revogada", token: "T3", expiraEm: "2026-08-26T12:00:00Z", revogadoEm: "2026-07-10T12:00:00Z" },
    ]);

    expect([...mapa.keys()]).toEqual(["viva"]);
    expect(mapa.get("viva")).toContain("/noiva/T1");
    // E o silêncio é o problema que o F38 registra: quem some do mapa faz a
    // mensagem do E84 sair SEM link, sem ninguém do lado de dentro saber.
    expect(mapa.get("expirada")).toBeUndefined();
  });

  it("lista ausente devolve mapa vazio em vez de estourar", () => {
    expect(urlsDePortalPorLead(undefined).size).toBe(0);
    expect(urlsDePortalPorLead([]).size).toBe(0);
  });

  it("com dois portais do mesmo lead, o último vivo manda", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    const mapa = urlsDePortalPorLead([
      { leadId: "ana", token: "ANTIGO", expiraEm: "2026-08-01T12:00:00Z" },
      { leadId: "ana", token: "NOVO", expiraEm: "2026-08-26T12:00:00Z" },
    ]);
    expect(mapa.get("ana")).toContain("/noiva/NOVO");
  });
});

/**
 * F38/E100 — o motivo de alguém não estar no mapa acima.
 *
 * `portalVivo` responde "há link?", que é tudo o que a mensagem precisa saber.
 * O que ele não diz é POR QUE não há, e a diferença decide se a tela reclama:
 * o vencimento aconteceu sozinho e faz a mensagem sair sem o link em silêncio;
 * a revogação foi uma decisão da loja; e quem nunca teve portal não tem nada a
 * consertar. Só o primeiro vira aviso.
 *
 * Estes testes olham APENAS `revogadoEm` e `expiraEm` — não olham token,
 * origem nem qualquer outro campo do lote.
 */
describe("portalVencido", () => {
  it("vencido: existe, não foi revogado, e o prazo passou", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(portalVencido({ token: "t", expiraEm: "2026-07-26T12:00:00Z" })).toBe(true);
  });

  it("dentro do prazo NÃO é vencido — o aviso não pode aparecer em quem está bem", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(portalVencido({ token: "t", expiraEm: "2026-08-26T12:00:00Z" })).toBe(false);
  });

  /**
   * O caso que separa esta função de `!portalVivo(p)`: o revogado também está
   * morto, e mesmo assim não é vencido. Cobrar um link novo de quem acabou de
   * matar o antigo de propósito é discutir com a decisão de quem a tomou.
   */
  it("revogado NÃO é vencido, mesmo com o prazo já passado", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    expect(
      portalVencido({
        token: "t",
        expiraEm: "2026-07-01T12:00:00Z",
        revogadoEm: "2026-06-30T12:00:00Z",
      }),
    ).toBe(false);
  });

  it("sem portal nenhum não é vencido — ela nunca teve um para vencer", () => {
    expect(portalVencido(null)).toBe(false);
    expect(portalVencido(undefined)).toBe(false);
  });

  /** Mesma fronteira do `portalVivo`, do outro lado: os dois nunca concordam. */
  it("no instante exato da expiração já está vencido — e nunca vivo ao mesmo tempo", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00.000Z");
    const p = { token: "t", expiraEm: "2026-07-27T12:00:00.000Z" };
    expect(portalVencido(p)).toBe(true);
    expect(portalVivo(p)).toBe(false);
  });
});

describe("leadsComPortalVencido", () => {
  it("só o vencido entra — o vivo, o revogado e o ausente ficam de fora", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    const vencidos = leadsComPortalVencido([
      { leadId: "viva", token: "T1", expiraEm: "2026-08-26T12:00:00Z" },
      { leadId: "vencida", token: "T2", expiraEm: "2026-07-01T12:00:00Z" },
      {
        leadId: "revogada",
        token: "T3",
        expiraEm: "2026-07-01T12:00:00Z",
        revogadoEm: "2026-06-30T12:00:00Z",
      },
    ]);

    expect([...vencidos]).toEqual(["vencida"]);
  });

  /**
   * O par com `urlsDePortalPorLead`, que é como as três filas de mensagem os
   * usam: quem está num nunca está no outro. Sem isto, a mesma linha poderia
   * mostrar o link E o aviso de que o link não existe.
   */
  it("os dois conjuntos não se cruzam: ter link e estar vencida são exclusivos", () => {
    vi.useFakeTimers();
    EM("2026-07-27T12:00:00Z");
    const lote = [
      { leadId: "viva", token: "T1", expiraEm: "2026-08-26T12:00:00Z" },
      { leadId: "vencida", token: "T2", expiraEm: "2026-07-01T12:00:00Z" },
    ];
    const comLink = urlsDePortalPorLead(lote);
    const vencidos = leadsComPortalVencido(lote);

    for (const leadId of vencidos) expect(comLink.has(leadId)).toBe(false);
    for (const leadId of comLink.keys()) expect(vencidos.has(leadId)).toBe(false);
  });

  it("lista ausente devolve conjunto vazio em vez de estourar", () => {
    expect(leadsComPortalVencido(undefined).size).toBe(0);
    expect(leadsComPortalVencido([]).size).toBe(0);
  });
});
