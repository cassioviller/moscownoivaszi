import { describe, expect, it, vi, afterEach } from "vitest";
import { portalVivo, urlsDePortalPorLead } from "./portal";

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
