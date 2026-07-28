import { describe, expect, it } from "vitest";
import {
  aContatarNaJanela,
  jaContatadasNaJanela,
  pediramRemarcacaoNaJanela,
  orcamentosVencendoNaJanela,
  resumoDaFila,
} from "./mensagens-do-dia";

/**
 * A régua da fila do dia (E69) saiu da tela para o `lib` no F7, para o
 * dashboard contar a MESMA coisa que "Mensagens de hoje" mostra. Estes casos
 * fixam as fronteiras que a tela nunca teve teste para defender.
 */

const AGORA = new Date("2026-07-28T10:00:00-03:00").getTime();
const H = 3_600_000;

function atendimento(over: Partial<Parameters<typeof aContatarNaJanela>[0][number]> = {}) {
  return {
    situacao: "AGENDADO",
    inicio: new Date(AGORA + 2 * H).toISOString(),
    contatadoEm: null,
    confirmadoEm: null,
    ...over,
  };
}

describe("a fila de quem procurar", () => {
  it("pega o atendimento agendado dentro das 48h", () => {
    expect(aContatarNaJanela([atendimento()], AGORA)).toHaveLength(1);
  });

  it("não pega quem a loja já procurou", () => {
    const ja = atendimento({ contatadoEm: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([ja], AGORA)).toHaveLength(0);
  });

  it("não pega quem já respondeu pelo portal — não há o que perguntar a ela", () => {
    const respondeu = atendimento({ confirmadoEm: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([respondeu], AGORA)).toHaveLength(0);
  });

  it("não pega o que já passou: confirmar presença de ontem não existe", () => {
    const passado = atendimento({ inicio: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([passado], AGORA)).toHaveLength(0);
  });

  it("a fronteira das 48h é inclusiva, e 1ms depois já é fora", () => {
    const naBorda = atendimento({ inicio: new Date(AGORA + 48 * H).toISOString() });
    const foraPorUmMs = atendimento({ inicio: new Date(AGORA + 48 * H + 1).toISOString() });
    expect(aContatarNaJanela([naBorda], AGORA)).toHaveLength(1);
    expect(aContatarNaJanela([foraPorUmMs], AGORA)).toHaveLength(0);
  });

  it("ordena por horário — quem é atendida antes precisa ser procurada antes", () => {
    const tarde = atendimento({ inicio: new Date(AGORA + 10 * H).toISOString() });
    const cedo = atendimento({ inicio: new Date(AGORA + 2 * H).toISOString() });
    expect(aContatarNaJanela([tarde, cedo], AGORA)[0]).toBe(cedo);
  });

  it("só conta AGENDADO — quem faltou ou concluiu não recebe confirmação", () => {
    const concluido = atendimento({ situacao: "CONCLUIDO" });
    const faltou = atendimento({ situacao: "FALTOU" });
    expect(aContatarNaJanela([concluido, faltou], AGORA)).toHaveLength(0);
  });
});

describe("F37 — quem avisou que NÃO pode ir", () => {
  it("sai da fila de procurar: ela JÁ respondeu", () => {
    const pediu = atendimento({ remarcacaoPedidaEm: new Date(AGORA - H).toISOString() });
    // Perguntar "você vem?" a quem acabou de avisar que não vem é a forma mais
    // rápida de a noiva concluir que ninguém leu o aviso dela.
    expect(aContatarNaJanela([pediu], AGORA)).toHaveLength(0);
    expect(jaContatadasNaJanela([pediu], AGORA)).toHaveLength(0);
  });

  it("entra na fila PRÓPRIA, porque o gesto é outro — remarcar, não escrever", () => {
    const pediu = atendimento({ remarcacaoPedidaEm: new Date(AGORA - H).toISOString() });
    expect(pediramRemarcacaoNaJanela([pediu], AGORA)).toHaveLength(1);
  });

  it("quem não pediu não aparece nela", () => {
    expect(pediramRemarcacaoNaJanela([atendimento()], AGORA)).toHaveLength(0);
  });

  it("sai da fila quando o horário passa — não há mais o que devolver", () => {
    const passado = atendimento({
      inicio: new Date(AGORA - H).toISOString(),
      remarcacaoPedidaEm: new Date(AGORA - 2 * H).toISOString(),
    });
    expect(pediramRemarcacaoNaJanela([passado], AGORA)).toHaveLength(0);
  });
});

describe("a fila de quem já foi procurada", () => {
  it("é o complemento exato da outra: procurada, sem resposta", () => {
    const procurada = atendimento({ contatadoEm: new Date(AGORA - H).toISOString() });
    expect(jaContatadasNaJanela([procurada], AGORA)).toHaveLength(1);
    expect(aContatarNaJanela([procurada], AGORA)).toHaveLength(0);
  });

  it("quem respondeu sai das duas listas", () => {
    const respondeu = atendimento({
      contatadoEm: new Date(AGORA - 2 * H).toISOString(),
      confirmadoEm: new Date(AGORA - H).toISOString(),
    });
    expect(jaContatadasNaJanela([respondeu], AGORA)).toHaveLength(0);
    expect(aContatarNaJanela([respondeu], AGORA)).toHaveLength(0);
  });
});

describe("orçamentos vencendo", () => {
  it("pega o ENVIADO que vence dentro de 72h", () => {
    const o = { status: "ENVIADO", validade: new Date(AGORA + 24 * H).toISOString() };
    expect(orcamentosVencendoNaJanela([o], AGORA)).toHaveLength(1);
  });

  it("não pega o que JÁ venceu — lembrar de um prazo morto não é mensagem a enviar", () => {
    const o = { status: "ENVIADO", validade: new Date(AGORA - H).toISOString() };
    expect(orcamentosVencendoNaJanela([o], AGORA)).toHaveLength(0);
  });

  it("não pega rascunho nem aprovado, mesmo com validade próxima", () => {
    const validade = new Date(AGORA + 24 * H).toISOString();
    const rascunho = { status: "RASCUNHO", validade };
    const aprovado = { status: "APROVADO", validade };
    expect(orcamentosVencendoNaJanela([rascunho, aprovado], AGORA)).toHaveLength(0);
  });

  it("orçamento sem validade não vence e não entra na fila", () => {
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: null }], AGORA)).toHaveLength(0);
  });
});

describe("o resumo do dashboard", () => {
  it("some quando não há nada a enviar — o cartão não vira paisagem", () => {
    expect(resumoDaFila(0)).toBeNull();
  });

  it("fala no singular quando é uma só", () => {
    expect(resumoDaFila(1)?.frase).toBe("1 mensagem pronta para enviar");
  });

  it("fala no plural a partir de duas", () => {
    expect(resumoDaFila(4)?.frase).toBe("4 mensagens prontas para enviar");
  });
});
