import { describe, expect, it } from "vitest";
import { primeirosPassos, lojaConfigurada, type ContagensDaLoja } from "./primeiros-passos";

const vazia: ContagensDaLoja = {
  cabines: 0,
  temHorario: false,
  atributos: 0,
  vestidos: 0,
  escadasDeComissao: 0,
  recorrencias: 0,
};

const pronta: ContagensDaLoja = {
  cabines: 2,
  temHorario: true,
  atributos: 5,
  vestidos: 40,
  escadasDeComissao: 1,
  recorrencias: 3,
};

describe("primeirosPassos — o que falta configurar, na ordem de fazer", () => {
  it("loja nova mostra os cinco passos, na ordem de execução", () => {
    expect(primeirosPassos(vazia).map((p) => p.chave)).toEqual([
      "cabines",
      "atributos",
      "vestidos",
      "comissao",
      "recorrencias",
    ]);
  });

  it("a ordem é a de EXECUÇÃO, não a de importância", () => {
    // Montar vestido antes de ter atributo obriga a voltar — por isso atributos
    // vem antes, embora vestido seja o que a loja quer ver primeiro.
    const chaves = primeirosPassos(vazia).map((p) => p.chave);
    expect(chaves.indexOf("atributos")).toBeLessThan(chaves.indexOf("vestidos"));
  });

  it("cabine sem horário ainda conta como pendente — os dois formam um passo só", () => {
    expect(primeirosPassos({ ...pronta, temHorario: false }).map((p) => p.chave)).toEqual([
      "cabines",
    ]);
    expect(primeirosPassos({ ...pronta, cabines: 0 }).map((p) => p.chave)).toEqual(["cabines"]);
  });

  it("a escada de comissão explica o silêncio que ela causa", () => {
    const passo = primeirosPassos({ ...pronta, escadasDeComissao: 0 })[0];
    // É o único item cuja ausência produz uma tela que some sem erro — e a
    // frase precisa dizer isso, senão a pessoa conclui que o sistema não tem.
    expect(passo.porque).toContain("sem erro");
  });

  it("loja pronta não tem passo nenhum — e o cartão some", () => {
    expect(primeirosPassos(pronta)).toEqual([]);
    expect(lojaConfigurada(pronta)).toBe(true);
    expect(lojaConfigurada(vazia)).toBe(false);
  });

  it("a loja recém-semeada (E147) para num passo só: cadastrar os vestidos", () => {
    // As contagens são as que `aplicarConfiguracaoInicial` deixa no banco, e o
    // teste de API afirma cada uma delas
    // (`api-server/src/__tests__/e147-configuracao-inicial-api.test.ts`).
    // O par existe para que mexer no seed sem mexer aqui — ou o contrário —
    // apareça: a promessa do seed é ESTA, e ela é uma frase de tela.
    const semeada: ContagensDaLoja = {
      cabines: 3,
      temHorario: true,
      atributos: 7,
      vestidos: 0,
      escadasDeComissao: 1,
      recorrencias: 4,
    };
    expect(primeirosPassos(semeada).map((p) => p.chave)).toEqual(["vestidos"]);
  });

  it("todo passo tem para onde ir", () => {
    for (const p of primeirosPassos(vazia)) {
      expect(p.href.startsWith("/")).toBe(true);
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.porque.length).toBeGreaterThan(0);
    }
  });
});
