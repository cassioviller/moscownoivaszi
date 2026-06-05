import { describe, it, expect } from "vitest";
import { paginar, totalPaginas, TAMANHO_PAGINA } from "@/lib/paginacao";

describe("paginar", () => {
  it("página ausente/inválida → 1; skip 0", () => {
    expect(paginar(undefined)).toEqual({ pagina: 1, skip: 0, take: TAMANHO_PAGINA });
    expect(paginar("0")).toMatchObject({ pagina: 1, skip: 0 });
    expect(paginar("-3")).toMatchObject({ pagina: 1 });
    expect(paginar("abc")).toMatchObject({ pagina: 1 });
  });
  it("página N → skip (N-1)*tamanho", () => {
    expect(paginar("3", 10)).toEqual({ pagina: 3, skip: 20, take: 10 });
    expect(paginar(2, 30)).toEqual({ pagina: 2, skip: 30, take: 30 });
  });
});
describe("totalPaginas", () => {
  it("ceil, mínimo 1", () => {
    expect(totalPaginas(0, 30)).toBe(1);
    expect(totalPaginas(30, 30)).toBe(1);
    expect(totalPaginas(31, 30)).toBe(2);
    expect(totalPaginas(61, 30)).toBe(3);
  });
});
