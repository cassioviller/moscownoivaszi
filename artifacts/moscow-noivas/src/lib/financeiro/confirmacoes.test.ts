import { describe, expect, it } from "vitest";
import { brl } from "@/lib/formatos";
import {
  fraseEstornoPagamento,
  fraseEstornoParcela,
  fraseRemocaoConta,
  fraseRemocaoParcela,
} from "./confirmacoes";

// O espaço de `brl()` é o não separável do Intl (pt-BR) — comparar com o
// próprio formatador evita afirmar um espaço que não é o que a tela mostra.

describe("E128 — a confirmação de dinheiro diz o número certo", () => {
  it("o estorno da PARCIAL cita os R$ 300,00 que o caixa perde, não os R$ 1.000,00 do plano", () => {
    // O caso literal da trilha C (C5): o diálogo dizia R$ 1.000,00 e o caixa
    // perdia R$ 300,00 — "a tela mentindo sobre dinheiro num clique sem volta".
    const frase = fraseEstornoParcela("Parcela 3", { valorRecebido: 300 });
    expect(frase).toContain(brl(300));
    expect(frase).not.toContain(brl(1000));
  });

  it("o estorno da parcela PAGA cheia cita o valor cheio — recebido e previsto coincidem", () => {
    expect(fraseEstornoParcela("Entrada", { valorRecebido: 1000 })).toContain(brl(1000));
  });

  it("a remoção de parcela cita o PREVISTO — o que sai do plano é o plano", () => {
    expect(fraseRemocaoParcela("Parcela 5", { valorPrevisto: 840 })).toContain(brl(840));
  });

  it("a remoção de conta nomeia descrição E valor", () => {
    const frase = fraseRemocaoConta({ descricao: "Aluguel do ateliê", valorPrevisto: 3500 });
    expect(frase).toContain("Aluguel do ateliê");
    expect(frase).toContain(brl(3500));
  });

  it("o estorno de pagamento single nomeia valor e descrição", () => {
    const frase = fraseEstornoPagamento({ contas: 1, descricao: "Costureira", valorDaLinha: 900 });
    expect(frase).toContain(brl(900));
    expect(frase).toContain("Costureira");
  });

  it("o estorno de saída conjunta diz o lote e a fatia da linha clicada", () => {
    const frase = fraseEstornoPagamento({ contas: 3, descricao: "Linha e tecido", valorDaLinha: 250 });
    expect(frase).toContain("3 contas");
    expect(frase).toContain(brl(250));
  });

  /**
   * P7 (E169) — removida a parcela 10 de R$ 500,00 de um carnê de R$ 5.000,00,
   * o plano passa a somar R$ 4.500,00. A frase antiga dizia "não pode ser
   * desfeita" e nada sobre o buraco; hoje ela diz os dois números e aponta o
   * gesto que repõe.
   */
  it("remover parcela do CARNÊ diz o buraco que fica, com os dois números", () => {
    const frase = fraseRemocaoParcela(
      "Parcela 10/10",
      { valorPrevisto: 500, origem: "PLANO" },
      { somaDepoisCentavos: 450000, totalContratoCentavos: 500000 },
    );
    expect(frase).toContain(brl(500));
    expect(frase).toContain(brl(4500));
    expect(frase).toContain(brl(5000));
    expect(frase).toContain("gerar as parcelas que faltam");
  });

  it("remover cobrança FORA do carnê não fala de carnê nenhum", () => {
    // A parcela de avaria não é o carnê (P8) — o contrato continua fechando.
    const frase = fraseRemocaoParcela(
      "Reparo de avaria",
      { valorPrevisto: 350, origem: "AVARIA" },
      { somaDepoisCentavos: 500000, totalContratoCentavos: 500000 },
    );
    expect(frase).toContain(brl(350));
    expect(frase).toContain("não pode ser desfeita");
  });

  it("carnê que continua fechando depois da remoção não promete buraco", () => {
    const frase = fraseRemocaoParcela(
      "Parcela 10/10",
      { valorPrevisto: 500, origem: "PLANO" },
      { somaDepoisCentavos: 500000, totalContratoCentavos: 500000 },
    );
    expect(frase).toContain("não pode ser desfeita");
  });
});
