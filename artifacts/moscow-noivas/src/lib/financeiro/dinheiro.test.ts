import { describe, expect, it } from "vitest";
import {
  brutoEmCentavos,
  centavos,
  linhaDeDesconto,
  liquidoEmCentavos,
  parseQuantidade,
  parseValor,
  motivoDaRecusaDeDesconto,
  reais,
  recusaDeDesconto,
  somaCentavos,
} from "./dinheiro";

describe("centavos / reais", () => {
  it("ida e volta preserva a quantia", () => {
    expect(reais(centavos(1234.56))).toBe(1234.56);
    expect(reais(centavos(0.1))).toBe(0.1);
  });

  it("arredonda o centavo em vez de truncar", () => {
    expect(centavos(0.005)).toBe(1);
    expect(centavos(0.004)).toBe(0);
    // 19.99 * 100 dá 1998.9999… em float: truncar perderia um centavo.
    expect(centavos(19.99)).toBe(1999);
  });
});

describe("somaCentavos", () => {
  it("soma inteiro: o erro de float não se acumula", () => {
    const itens = Array.from({ length: 10 }, () => ({ v: 0.1 }));
    // Em reais, 0.1 somado 10 vezes dá 0.9999999999999999.
    expect(reais(somaCentavos(itens, (i) => i.v))).toBe(1);
  });

  it("campo ausente ou nulo conta como zero, nunca NaN", () => {
    const itens = [{ v: 10 }, { v: null }, { v: undefined }];
    expect(reais(somaCentavos(itens, (i) => i.v))).toBe(10);
  });

  it("lista vazia é zero", () => {
    expect(somaCentavos([], () => 0)).toBe(0);
  });
});

describe("parseValor", () => {
  it("lê o padrão pt-BR: vírgula decimal, ponto de milhar", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("0,10")).toBe(0.1);
  });

  it("aceita o formato cru, sem separador de milhar", () => {
    expect(parseValor("1234.56")).toBe(1234.56);
    expect(parseValor("100")).toBe(100);
  });

  it("ponto de milhar sem decimais não vira decimal", () => {
    // O engano que custa caro: "1.234" é mil e pouco, não um e pouco.
    expect(parseValor("1.234")).toBe(1234);
    expect(parseValor("1.234.567")).toBe(1234567);
  });

  it("o SINAL não muda a quantia por mil", () => {
    // O caixa fecha no vermelho e a conferência aceita negativo de propósito.
    // O reconhecedor de milhar começava em `^\d` e reprovava o "-": "-1.234"
    // caía no Number cru e virava −1,23 — a âncora de saldo mil vezes menor.
    expect(parseValor("-1.234")).toBe(-1234);
    expect(parseValor("-1.234,56")).toBe(-1234.56);
    expect(parseValor("+1.234")).toBe(1234);
  });

  it("vazio é null (não digitou); lixo é NaN (digitou errado)", () => {
    expect(parseValor("")).toBeNull();
    expect(parseValor("   ")).toBeNull();
    expect(parseValor("abc")).toBeNaN();
  });
});

/**
 * O6 (E169) — a quantidade tinha a mesma borda do valor e nenhuma régua:
 * `Math.trunc(Number("3un") || 1)` é 1, e a guarda `< 1` da tela nunca
 * disparava. Três véus de R$ 800,00 entravam como um.
 */
describe("parseQuantidade — a irmã do parseValor, para o que se CONTA", () => {
  it("3 véus são 3, e o total do orçamento é o de 3", () => {
    expect(parseQuantidade("3")).toBe(3);
    // O número medido do achado: 3 × R$ 800,00 = R$ 2.400,00. Lido como 1,
    // o orçamento saía R$ 800,00 — R$ 1.600,00 a menos no que a noiva aceita.
    const itens = [{ valorUnitario: 800, quantidade: parseQuantidade("3") ?? 1 }];
    expect(reais(brutoEmCentavos(itens))).toBe(2400);
  });

  it("'3un' é NaN, não 1 — quem chama recusa em vez de gravar em silêncio", () => {
    expect(parseQuantidade("3un")).toBeNaN();
    expect(parseQuantidade("três")).toBeNaN();
    // Meio véu não existe: truncar aqui é a mesma classe de defeito.
    expect(parseQuantidade("2,5")).toBeNaN();
    expect(parseQuantidade("2.5")).toBeNaN();
  });

  it("vazio é null — quem chama decide o padrão (a tela usa 1)", () => {
    expect(parseQuantidade("")).toBeNull();
    expect(parseQuantidade("  ")).toBeNull();
  });

  it("negativo passa como negativo, para a guarda `< 1` da tela pegá-lo", () => {
    // S-M23: "-1" virava quantidade −1 e SUBTRAÍA o item do total. Quem recusa
    // é a tela; esta função só não pode transformá-lo em 1 pelo caminho.
    expect(parseQuantidade("-1")).toBe(-1);
    expect(parseQuantidade("0")).toBe(0);
  });
});

/**
 * A07.3 (E169) — o teto do desconto vale para os DOIS tipos. O S-M23 fechou o
 * percentual e a mensagem dele mandava a vendedora para a porta aberta.
 */
describe("recusaDeDesconto — o teto dos dois tipos, numa régua só", () => {
  const BRUTO = centavos(5000); // R$ 5.000,00 em itens

  it("percentual acima de 100 continua recusado (S-M23)", () => {
    expect(recusaDeDesconto("PERCENTUAL", 150, BRUTO)?.error).toBe("DESCONTO_INVALIDO");
    expect(recusaDeDesconto("PERCENTUAL", 100, BRUTO)).toBeNull();
  });

  it("desconto em VALOR maior que os itens é recusado, e a frase traz o número", () => {
    // Sem a régua: `Math.max(0, 500000 − 600000)` = 0 — o orçamento de
    // R$ 5.000,00 passava a valer R$ 0,00, e era esse zero que a versão
    // ENVIADA congelava no hash que a noiva assina.
    expect(reais(liquidoEmCentavos(BRUTO, "VALOR", 6000))).toBe(0);
    const recusa = recusaDeDesconto("VALOR", 6000, BRUTO);
    expect(recusa?.error).toBe("DESCONTO_INVALIDO");
    expect(recusa?.detalhe).toContain("R$ 6.000,00");
    expect(recusa?.detalhe).toContain("R$ 5.000,00");
  });

  it("desconto que cabe passa, e o exato-bruto também", () => {
    expect(recusaDeDesconto("VALOR", 500, BRUTO)).toBeNull();
    expect(recusaDeDesconto("VALOR", 5000, BRUTO)).toBeNull();
  });

  it("um centavo acima do bruto já é recusa — a fronteira é em CENTAVOS", () => {
    expect(recusaDeDesconto("VALOR", 5000.01, BRUTO)?.error).toBe("DESCONTO_INVALIDO");
  });

  it("bruto null é 'não há itens para comparar' — só a regra do percentual vale", () => {
    // É o `POST /orcamentos`, cujo corpo não aceita itens: recusar ali um
    // desconto em reais proibiria "crio com o desconto combinado, lanço as
    // peças depois".
    expect(recusaDeDesconto("VALOR", 6000, null)).toBeNull();
    expect(recusaDeDesconto("PERCENTUAL", 150, null)?.error).toBe("DESCONTO_INVALIDO");
  });

  it("sem valor não há o que recusar", () => {
    expect(recusaDeDesconto("VALOR", null, BRUTO)).toBeNull();
    expect(recusaDeDesconto(null, 6000, BRUTO)).toBeNull();
  });

  /**
   * E240/S-O85 — a DECISÃO saiu da FRASE, e esta é a prova de equivalência
   * (regra 30 do METODO): em toda célula da grade, o veredito é nulo exatamente
   * quando a recusa é nula, e o motivo nomeia a mesma cláusula que a frase.
   * Medido: 4 tipos × 8 valores × 3 brutos = 96 células, zero divergência.
   */
  it("motivoDaRecusaDeDesconto é o veredito de recusaDeDesconto, sem a frase — 96 células, zero divergência", () => {
    const tipos = ["PERCENTUAL", "VALOR", null, undefined];
    const valores = [null, undefined, 0, 50, 100, 100.01, 5000, 5000.01];
    const brutos = [null, 0, BRUTO];
    let celulas = 0;
    for (const tipo of tipos) for (const valor of valores) for (const bruto of brutos) {
      celulas++;
      const motivo = motivoDaRecusaDeDesconto(tipo, valor, bruto);
      const recusa = recusaDeDesconto(tipo, valor, bruto);
      expect(motivo === null, `${tipo} ${valor} ${bruto}`).toBe(recusa === null);
      if (motivo === "PERCENTUAL_ACIMA_DE_100") expect(recusa?.detalhe).toContain("não passa de 100");
      if (motivo === "VALOR_ACIMA_DO_BRUTO") expect(recusa?.detalhe).toContain("é maior que os itens");
    }
    expect(celulas).toBe(96);
  });
});

/**
 * S-O64 (E187) — o desconto que a NOIVA lê é a diferença real.
 *
 * O portal e a página pública mostram a mesma proposta pelos dois links que a
 * loja manda; até este épico, um imprimia o `descontoValor` gravado e o outro a
 * subtração. O caso que os separa é o desconto em VALOR maior que a soma dos
 * itens — gravável em todo orçamento anterior ao E174, e o único em que o
 * líquido clampa em zero.
 */
describe("linhaDeDesconto — a linha que se exibe é bruto − líquido", () => {
  it("desconto MAIOR que os itens sai como o abatimento real, não como o pedido", () => {
    const brutoC = centavos(4800);
    const liquidoC = liquidoEmCentavos(brutoC, "VALOR", 5000);
    expect(reais(liquidoC)).toBe(0); // o clamp de sempre
    const linha = linhaDeDesconto(brutoC, liquidoC, "VALOR", 5000)!;
    // O portal dizia R$ 5.000,00 aqui, com "Soma R$ 4.800,00" logo acima e
    // "Total R$ 0,00" logo abaixo: três números que não fecham na tela dela.
    expect(reais(linha.abatimentoC)).toBe(4800);
    expect(reais(linha.subtotalC)).toBe(4800);
    // 4.800 − 4.800 = 0, e o total é 0: a conta fecha em qualquer desconto.
    expect(reais(linha.subtotalC - linha.abatimentoC)).toBe(reais(liquidoC));
  });

  it("o percentual vira RÓTULO e o número continua sendo o abatimento", () => {
    const brutoC = centavos(5000);
    const liquidoC = liquidoEmCentavos(brutoC, "PERCENTUAL", 10);
    const linha = linhaDeDesconto(brutoC, liquidoC, "PERCENTUAL", 10)!;
    expect(linha.rotulo).toBe(" (10%)");
    expect(reais(linha.abatimentoC)).toBe(500);
  });

  it("desconto em VALOR não ganha rótulo — o número já é o valor", () => {
    expect(linhaDeDesconto(centavos(5000), centavos(4500), "VALOR", 500)!.rotulo).toBe("");
  });

  it("sem desconto não há linha — é o `temDesconto` (P15/E163) por dentro", () => {
    const brutoC = centavos(5000);
    expect(linhaDeDesconto(brutoC, brutoC, "VALOR", 0)).toBeNull();
    expect(linhaDeDesconto(brutoC, brutoC, null, 500)).toBeNull();
    expect(linhaDeDesconto(brutoC, brutoC, "PERCENTUAL", null)).toBeNull();
  });

  it("a subtração é em CENTAVOS: o abatimento de um preço quebrado não vaza float", () => {
    // Em reais, 1000.10 − 850.07 dá 150.02999999999997.
    const linha = linhaDeDesconto(centavos(1000.1), centavos(850.07), "VALOR", 150.03)!;
    expect(linha.abatimentoC).toBe(15003);
    expect(reais(linha.abatimentoC)).toBe(150.03);
  });
});
