import { describe, expect, it } from "vitest";
import { locacaoDaNoiva } from "./locacao-da-noiva";

/**
 * S-C91/E229 — o que a ficha da noiva mostra da locação, e o que ela cala.
 *
 * A fonte mudou no E229 (decisão da dona, 14/08/2026): a régua deixou de
 * derivar de `contratosDaNoiva` — que para a Recepção é `[]` desde o E172 — e
 * passou a ler o RECORTE do `GET /leads/:id/locacao`. Escolher o contrato
 * ATIVO e cortar o CANCELADO virou responsabilidade do SERVIDOR, pregada em
 * `e229-a-leitura-estreita-da-recepcao-api.test.ts`. O que resta aqui é a
 * decisão de TELA: campo vazio não vira linha vazia, e a metade que falta é
 * dita quando a outra existe.
 */

const RETIRADA = "2027-05-12T13:30:00.000Z"; // 12/05/2027 10:30 em São Paulo
const DEVOLUCAO = "2027-05-18T21:00:00.000Z"; // 18/05/2027 18:00 em São Paulo

const RECORTE = {
  contratoId: "c-ativo",
  retirada: RETIRADA,
  devolucao: DEVOLUCAO,
  retiradaFeitaEm: null,
  devolucaoFeitaEm: null,
};

describe("S-C91/E229 — a locação que a ficha da noiva mostra", () => {
  it("com o recorte inteiro, os dois instantes", () => {
    expect(locacaoDaNoiva(RECORTE)).toEqual({
      contratoId: "c-ativo",
      retirada: RETIRADA,
      devolucao: DEVOLUCAO,
      retiradaFeitaEm: null,
      devolucaoFeitaEm: null,
    });
  });

  it("E231 — a peça que SAIU aparece mesmo sem data combinada: fato não é moldura", () => {
    const l = locacaoDaNoiva({
      contratoId: "c",
      retirada: null,
      devolucao: null,
      retiradaFeitaEm: RETIRADA,
      devolucaoFeitaEm: null,
    });
    expect(l?.retiradaFeitaEm).toBe(RETIRADA);
  });

  it("sem contrato ativo o servidor manda null, e não há locação", () => {
    expect(locacaoDaNoiva(null)).toBeNull();
    // A consulta ainda carregando também é silêncio, nunca moldura.
    expect(locacaoDaNoiva(undefined)).toBeNull();
  });

  it("recorte sem NENHUMA das duas datas cala — campo vazio não vira linha vazia", () => {
    expect(
      locacaoDaNoiva({
        contratoId: "c",
        retirada: null,
        devolucao: null,
        retiradaFeitaEm: null,
        devolucaoFeitaEm: null,
      }),
    ).toBeNull();
  });

  it("pela METADE mostra o que tem e diz que falta a outra ponta", () => {
    expect(locacaoDaNoiva({ ...RECORTE, devolucao: null })?.devolucao).toBeNull();
    expect(locacaoDaNoiva({ ...RECORTE, retirada: null })?.retirada).toBeNull();
  });
});
