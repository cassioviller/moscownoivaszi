import { describe, expect, it } from "vitest";
import { proximoPasso } from "./proximo-passo";

const base = { leadId: "L1", temContratoAtivo: false, temOrcamento: false };

describe("proximoPasso — a ficha diz o que falta, em vez de oito cards vazios", () => {
  it("noiva nova pede horário, e o link já leva o id dela", () => {
    const p = proximoPasso({ ...base, etapa: "NOVO" })!;
    expect(p.titulo).toBe("Agendar o primeiro atendimento");
    expect(p.href).toBe("/atendimentos/novo?noiva=L1");
  });

  it("com atendimento marcado, o passo é chegar à prova sabendo o estilo", () => {
    expect(proximoPasso({ ...base, etapa: "ATENDIMENTO_AGENDADO" })!.href).toBe(
      "/noivas/L1/interesses",
    );
  });

  it("em atendimento, o passo depende de já haver proposta", () => {
    expect(proximoPasso({ ...base, etapa: "EM_ATENDIMENTO" })!.titulo).toBe("Montar o orçamento");
    expect(proximoPasso({ ...base, etapa: "EM_ATENDIMENTO", temOrcamento: true })!.titulo).toBe(
      "Fechar o orçamento",
    );
  });

  it("o contrato ativo manda mais que a etapa — o assunto vira dinheiro", () => {
    // Uma noiva pode estar EM_PROVAS com parcela vencendo: a etapa fala da
    // jornada do vestido, não da do pagamento.
    const p = proximoPasso({
      ...base,
      etapa: "EM_PROVAS",
      temContratoAtivo: true,
      contratoAtivoId: "C9",
    })!;
    expect(p.titulo).toBe("Acompanhar o pagamento");
    expect(p.href).toBe("/contratos/C9");
  });

  it("sem o id do contrato, cai na tela de receber em vez de link quebrado", () => {
    expect(proximoPasso({ ...base, etapa: "CONTRATO_FECHADO", temContratoAtivo: true })!.href).toBe(
      "/financeiro/receber",
    );
  });

  it("perdida e jornada encerrada não têm próximo passo — e o null é a mensagem", () => {
    // Uma faixa que aparece sempre vira moldura e ninguém lê.
    expect(proximoPasso({ ...base, etapa: "PERDIDO" })).toBeNull();
    expect(proximoPasso({ ...base, etapa: "CASAMENTO_REALIZADO" })).toBeNull();
    expect(proximoPasso({ ...base, etapa: "DEVOLVIDO" })).toBeNull();
  });

  it("perdida continua sem passo mesmo com contrato ativo — a régua de PERDIDO vem antes", () => {
    expect(proximoPasso({ ...base, etapa: "PERDIDO", temContratoAtivo: true })).toBeNull();
  });
});
