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

  // E125 (D3): a etapa não sabe da agenda — criar atendimento não a avança.
  // O banner sugeria "Agendar" com o horário já marcado na agenda.
  it("noiva nova COM visita marcada não ouve 'Agendar' — o preparo vira o passo", () => {
    const p = proximoPasso({ ...base, etapa: "NOVO", temVisitaFutura: true })!;
    expect(p.titulo).toBe("Registrar os interesses dela");
    expect(p.href).toBe("/noivas/L1/interesses");
  });

  it("interesses prontos + visita marcada = jornada em dia, banner cala", () => {
    expect(
      proximoPasso({ ...base, etapa: "INTERESSES_PREENCHIDOS", temVisitaFutura: true }),
    ).toBeNull();
  });

  it("sem saber da agenda (permissão), o comportamento antigo fica de pé", () => {
    expect(proximoPasso({ ...base, etapa: "NOVO" })!.titulo).toBe(
      "Agendar o primeiro atendimento",
    );
    expect(proximoPasso({ ...base, etapa: "INTERESSES_PREENCHIDOS" })!.rotuloAcao).toBe("Agendar");
  });

  /**
   * S-O12 — a faixa mandava ENVIAR uma proposta que a noiva já tinha aceitado.
   *
   * A etapa para em ORCAMENTO_ABERTO depois do aceite, porque não existe etapa
   * "ACEITO" no funil (decisão de produto adiada, S-O10). A régua lia só a
   * etapa, então a ficha dizia "Enviar a proposta para ela — orçamento aberto
   * que não chega à noiva não vira contrato" para uma noiva que já disse SIM.
   *
   * O erro tinha custo: a faixa é o lugar onde a vendedora confia para saber o
   * que falta, e ela mandava refazer o passo cumprido em vez de fechar o
   * contrato — que é a hora em que o vestido passa a ser da noiva. A fila
   * "Aceites esperando contrato" já respondia certo; a ficha não.
   */
  it("S-O12 · com o aceite dela na mão, o passo é o CONTRATO — não reenviar a proposta", () => {
    const p = proximoPasso({ ...base, etapa: "ORCAMENTO_ABERTO", temOrcamento: true, temAceiteSemContrato: true })!;
    expect(p.titulo).toBe("Fechar o contrato");
    expect(p.detalhe).toContain("já disse sim");
    expect(p.rotuloAcao).toBe("Ver orçamentos");
  });

  it("S-O12 · sem aceite, a faixa continua mandando enviar", () => {
    const p = proximoPasso({ ...base, etapa: "ORCAMENTO_ABERTO", temOrcamento: true })!;
    expect(p.titulo).toBe("Enviar a proposta para ela");
  });

  it("S-O12 · com contrato ativo o dinheiro manda, aceite ou não", () => {
    const p = proximoPasso({
      ...base,
      etapa: "ORCAMENTO_ABERTO",
      temAceiteSemContrato: true,
      temContratoAtivo: true,
      contratoAtivoId: "C1",
    })!;
    expect(p.titulo).toBe("Acompanhar o pagamento");
  });
});

/**
 * S-C120 — **a terceira voz da ficha, e a mais alta.**
 *
 * A Recepção tem `contratos: NADA` desde o E172: a consulta de contratos não sai
 * do navegador dela, e a lista chegava aqui como `[]` — o mesmo `false` de "não
 * tem contrato". O banner então mandava, em botão, **"Fechar o contrato — ela já
 * disse sim"** para quem não pode fechá-lo, sobre um contrato já fechado.
 *
 * Ausente = não se sabe, o mesmo idioma que `temVisitaFutura` (E125) e
 * `temAceiteSemContrato` (S-O12) já falavam neste módulo. O que cala é só o
 * passo que DEPENDE de saber; os três primeiros seguem, e são justamente os da
 * Recepção, que agenda o dia inteiro.
 */
describe("S-C120 — sem saber do contrato, o passo que o pressupõe cala", () => {
  const semSaber = { leadId: "L1", temOrcamento: true };

  it("ORCAMENTO_ABERTO com aceite não manda mais fechar o contrato", () => {
    /**
     * VERMELHO ANTES (com `temContratoAtivo: boolean` e a ficha mandando
     * `!!contratoAtivo` sobre a lista silenciada):
     *
     *     AssertionError: expected { titulo: 'Fechar o contrato', … } to be null
     */
    expect(
      proximoPasso({ ...semSaber, etapa: "ORCAMENTO_ABERTO", temAceiteSemContrato: true }),
    ).toBeNull();
  });

  it("ORCAMENTO_ABERTO sem aceite também cala — 'enviar a proposta' afirma o mesmo", () => {
    expect(proximoPasso({ ...semSaber, etapa: "ORCAMENTO_ABERTO" })).toBeNull();
  });

  it("EM_ATENDIMENTO cala — 'montar o orçamento' pressupõe que não há contrato", () => {
    expect(proximoPasso({ ...semSaber, etapa: "EM_ATENDIMENTO" })).toBeNull();
  });

  it("os três primeiros passos SOBREVIVEM — a Recepção é quem agenda", () => {
    expect(proximoPasso({ ...semSaber, etapa: "NOVO" })!.titulo).toBe(
      "Agendar o primeiro atendimento",
    );
    expect(proximoPasso({ ...semSaber, etapa: "INTERESSES_PREENCHIDOS" })!.titulo).toBe(
      "Agendar o atendimento",
    );
    expect(proximoPasso({ ...semSaber, etapa: "ATENDIMENTO_AGENDADO" })!.titulo).toBe(
      "Registrar os interesses dela",
    );
  });

  it("saber que NÃO há contrato continua sendo saber — o passo volta", () => {
    const p = proximoPasso({
      ...semSaber,
      etapa: "ORCAMENTO_ABERTO",
      temContratoAtivo: false,
      temAceiteSemContrato: true,
    })!;
    expect(p.titulo).toBe("Fechar o contrato");
  });
});
