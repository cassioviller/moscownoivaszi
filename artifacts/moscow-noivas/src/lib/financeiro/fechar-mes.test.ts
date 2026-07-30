import { describe, expect, it } from "vitest";
import { estadoDoPasso } from "./fechar-mes";

describe("estadoDoPasso — o roteiro de fechar o mês não mente (E139)", () => {
  it("carregando NUNCA vira pendente — a lição do E121 no nascimento", () => {
    expect(estadoDoPasso("carregando", false)).toBe("conferindo");
    expect(estadoDoPasso("carregando", true)).toBe("conferindo");
  });

  it("erro é 'sem resposta', não um ✗ que manda refazer o que pode estar feito", () => {
    expect(estadoDoPasso("erro", false)).toBe("semResposta");
    expect(estadoDoPasso("erro", true)).toBe("semResposta");
  });

  it("com resposta, o passo diz feito ou pendente conforme o fato", () => {
    expect(estadoDoPasso("pronto", true)).toBe("feito");
    expect(estadoDoPasso("pronto", false)).toBe("pendente");
  });
});
