import { describe, expect, it } from "vitest";
import {
  expedienteEmFrase,
  isoParaLocal,
  localParaISO,
  recusaDoExpediente,
  sugestaoDaLocacao,
} from "./retirada-devolucao";

/**
 * E224 — a régua da tela que passou a oferecer a retirada e a devolução.
 *
 * A régua de fábrica é a do papel: uso 3 dias antes e 2 depois
 * (`REGRA_PADRAO`), expediente de retirada terça a sexta 10:30–19:00 e sábado
 * até 18:00 (cláusula 4ª). Os casos abaixo são dias de calendário de verdade,
 * conferidos um a um.
 */
const REGRA = { usoDiasAntes: 3, usoDiasDepois: 2 };

describe("o instante sai no relógio da LOJA, não no de quem clicou", () => {
  it("10:30 de São Paulo é 13:30 UTC", () => {
    expect(localParaISO("2028-09-06T10:30")).toBe("2028-09-06T13:30:00.000Z");
  });

  it("18:00 de São Paulo é 21:00 UTC — e o dia não anda", () => {
    expect(localParaISO("2028-09-12T18:00")).toBe("2028-09-12T21:00:00.000Z");
  });

  it("a volta é a ida ao contrário", () => {
    expect(isoParaLocal("2028-09-06T13:30:00.000Z")).toBe("2028-09-06T10:30");
    expect(isoParaLocal("2028-09-12T21:00:00.000Z")).toBe("2028-09-12T18:00");
  });

  it("o campo vazio, o lixo e o nulo não viram instante nenhum", () => {
    expect(localParaISO("")).toBeNull();
    expect(localParaISO("2028-09-06")).toBeNull();
    expect(localParaISO(null)).toBeNull();
    expect(isoParaLocal(null)).toBe("");
    expect(isoParaLocal("qualquer coisa")).toBe("");
  });
});

describe("a sugestão da cláusula 5ª — a hora do contrato, o dia da reserva", () => {
  /**
   * Casamento numa QUARTA (2028-09-06): a janela de uso vai de domingo 03 a
   * sexta 08. A loja não abre no domingo — a retirada anda para a terça 05.
   */
  it("a retirada anda do domingo fechado para o primeiro dia de expediente", () => {
    const s = sugestaoDaLocacao("2028-09-06", REGRA)!;
    expect(s.retirada).toBe("2028-09-05T10:30");
    expect(s.devolucao).toBe("2028-09-08T18:00");
    expect(s.aviso).toContain("03/09/2028 a 08/09/2028");
    expect(s.aviso).toContain("05/09/2028");
  });

  /**
   * **O caso que a régua existe para pegar, e é o casamento mais comum: o
   * SÁBADO.** A janela termina na segunda-feira, que a 4ª fecha — a devolução
   * sugerida crua seria recusada pela própria porta do E222, com 422.
   */
  it("casamento no sábado: a devolução na segunda anda para a terça", () => {
    const s = sugestaoDaLocacao("2028-09-09", REGRA)!;
    // Quarta 06 — dentro do expediente, não anda.
    expect(s.retirada).toBe("2028-09-06T10:30");
    // Segunda 11 → terça 12.
    expect(s.devolucao).toBe("2028-09-12T18:00");
    expect(s.aviso).toContain("12/09/2028");
    // E a sugestão passa na régua da porta, que é o ponto de tudo isto.
    expect(recusaDoExpediente(s.retirada, REGRA)).toBeNull();
    expect(recusaDoExpediente(s.devolucao, REGRA)).toBeNull();
  });

  it("quando a janela inteira cabe no expediente, nada é dito", () => {
    // Casamento na sexta 2028-09-08: janela de terça 05 a domingo 10 → a
    // devolução anda para a terça 12, então este NÃO é o caso mudo. O caso mudo
    // é o casamento na terça 2028-09-05: janela de sábado 02 a quinta 07.
    const s = sugestaoDaLocacao("2028-09-05", REGRA)!;
    expect(s.retirada).toBe("2028-09-02T10:30");
    expect(s.devolucao).toBe("2028-09-07T18:00");
    expect(s.aviso).toBeNull();
  });

  it("sem a régua da loja não há sugestão — o campo em branco diz a verdade", () => {
    expect(sugestaoDaLocacao("2028-09-09", null)).toBeNull();
    expect(sugestaoDaLocacao("2028-09-09", {})).toBeNull();
    expect(sugestaoDaLocacao("2028-09-09", { usoDiasAntes: 3 })).toBeNull();
  });

  it("sem data de casamento não há janela", () => {
    expect(sugestaoDaLocacao("", REGRA)).toBeNull();
    expect(sugestaoDaLocacao(null, REGRA)).toBeNull();
    expect(sugestaoDaLocacao("2028-09", REGRA)).toBeNull();
  });

  it("loja que não retira em dia nenhum não recebe sugestão inventada", () => {
    expect(sugestaoDaLocacao("2028-09-09", { ...REGRA, retiradaDias: [] })).toBeNull();
  });

  it("a loja com expediente próprio manda — a régua não é constante", () => {
    // Uma loja que retira só às segundas, das 14:00 às 16:00.
    const s = sugestaoDaLocacao("2028-09-09", {
      ...REGRA,
      retiradaDias: [1],
      retiradaAberturaMinutos: 840,
      retiradaFechamentoMinutos: 960,
    })!;
    // Quarta 06 → segunda 11; segunda 11 já é dia de expediente.
    expect(s.retirada).toBe("2028-09-11T10:30");
    expect(s.devolucao).toBe("2028-09-11T18:00");
    // E aqui a sugestão da 5ª NÃO cabe no expediente desta loja: a hora do
    // contrato e a hora da loja são duas decisões, e a tela diz a segunda.
    expect(recusaDoExpediente(s.retirada, {
      ...REGRA,
      retiradaDias: [1],
      retiradaAberturaMinutos: 840,
      retiradaFechamentoMinutos: 960,
    })).toContain("10:30 está fora do expediente de segunda (14:00 às 16:00)");
  });
});

describe("a recusa da 4ª, dita ANTES do clique", () => {
  it("o domingo às 23h — o caso que passava calado antes do E222", () => {
    const frase = recusaDoExpediente("2028-09-10T23:00", REGRA);
    expect(frase).toBe(
      "A loja não retira nem devolve no domingo. A loja retira e devolve terça a sexta, " +
        "das 10:30 às 19:00; sábado, das 10:30 às 18:00 (cláusula 4ª).",
    );
  });

  it("o sábado às 18:30 é recusado, e a quarta às 18:30 não", () => {
    expect(recusaDoExpediente("2028-09-09T18:30", REGRA)).toContain("fora do expediente de sábado");
    expect(recusaDoExpediente("2028-09-06T18:30", REGRA)).toBeNull();
  });

  it("o fechamento é inclusivo: 19:00 em ponto na quarta ainda é expediente", () => {
    expect(recusaDoExpediente("2028-09-06T19:00", REGRA)).toBeNull();
    expect(recusaDoExpediente("2028-09-06T19:01", REGRA)).toContain("fora do expediente");
  });

  it("campo vazio não é recusa — os dois campos são OPCIONAIS (E222)", () => {
    expect(recusaDoExpediente("", REGRA)).toBeNull();
    expect(recusaDoExpediente(null, REGRA)).toBeNull();
  });

  it("o expediente por extenso é o que a tela mostra", () => {
    expect(expedienteEmFrase(null)).toBe(
      "terça a sexta, das 10:30 às 19:00; sábado, das 10:30 às 18:00",
    );
  });
});
