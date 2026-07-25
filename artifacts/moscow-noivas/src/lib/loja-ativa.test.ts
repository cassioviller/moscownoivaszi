import { describe, it, expect } from "vitest";
import { decidirLojaDaUrl } from "./loja-ativa";

const A = "loja-a";
const B = "loja-b";
const LOJAS = [{ id: A }, { id: B }];

describe("decidirLojaDaUrl — a URL ganha, e a divergência é uma ação", () => {
  it("URL e sessão na mesma loja: segue", () => {
    expect(
      decidirLojaDaUrl({ urlLojaId: A, lojaAtivaId: A, lojas: LOJAS, jaReivindicada: null }),
    ).toEqual({ tipo: "seguir", lojaId: A });
  });

  it("o bookmark: URL em B, sessão em A → reivindica B no servidor", () => {
    expect(
      decidirLojaDaUrl({ urlLojaId: B, lojaAtivaId: A, lojas: LOJAS, jaReivindicada: null }),
    ).toEqual({ tipo: "reivindicar", lojaId: B });
  });

  it("sessão sem loja (cookie válido, nunca escolheu) → reivindica a da URL", () => {
    expect(
      decidirLojaDaUrl({ urlLojaId: B, lojaAtivaId: null, lojas: LOJAS, jaReivindicada: null }),
    ).toEqual({ tipo: "reivindicar", lojaId: B });
  });

  it("loja da URL não é da pessoa → manda escolher, não reivindica", () => {
    expect(
      decidirLojaDaUrl({
        urlLojaId: "loja-de-outra-pessoa",
        lojaAtivaId: A,
        lojas: LOJAS,
        jaReivindicada: null,
      }),
    ).toEqual({ tipo: "escolher" });
  });

  it("duas abas: já reivindicou B e a sessão virou A → segue a sessão, não reivindica de novo", () => {
    // É esta linha que impede o pingue-pongue pela rede entre duas abas.
    expect(
      decidirLojaDaUrl({ urlLojaId: B, lojaAtivaId: A, lojas: LOJAS, jaReivindicada: B }),
    ).toEqual({ tipo: "seguir-a-sessao", lojaId: A });
  });

  it("já reivindicou e a sessão ficou sem loja (logout em outra aba) → escolher", () => {
    expect(
      decidirLojaDaUrl({ urlLojaId: B, lojaAtivaId: null, lojas: LOJAS, jaReivindicada: B }),
    ).toEqual({ tipo: "escolher" });
  });

  it("sem loja na URL → escolher", () => {
    expect(
      decidirLojaDaUrl({ urlLojaId: undefined, lojaAtivaId: A, lojas: LOJAS, jaReivindicada: null }),
    ).toEqual({ tipo: "escolher" });
  });

  it("a decisão é ESTÁVEL: reaplicá-la sobre o resultado dela mesma não gera outra ação", () => {
    // O D1 era exatamente a falta desta propriedade: a decisão de um efeito
    // reativava o outro. Aqui, depois de reivindicar B e o servidor confirmar,
    // a decisão seguinte é "seguir" — e "seguir" não pede mais nada.
    const primeira = decidirLojaDaUrl({
      urlLojaId: B,
      lojaAtivaId: A,
      lojas: LOJAS,
      jaReivindicada: null,
    });
    expect(primeira.tipo).toBe("reivindicar");
    const segunda = decidirLojaDaUrl({
      urlLojaId: B,
      lojaAtivaId: B, // o servidor confirmou
      lojas: LOJAS,
      jaReivindicada: B,
    });
    expect(segunda).toEqual({ tipo: "seguir", lojaId: B });
    const terceira = decidirLojaDaUrl({
      urlLojaId: B,
      lojaAtivaId: B,
      lojas: LOJAS,
      jaReivindicada: B,
    });
    expect(terceira).toEqual(segunda);
  });
});
