import { describe, expect, it } from "vitest";
import { EXPEDIENTE_PADRAO } from "./agenda";
import {
  ancoraDaSemana,
  atendimentosNaCabine,
  colunasDaGrade,
  diasDaSemana,
  opcoesDeReagendamento,
  segundaDaSemana,
} from "./agenda-telas";

/**
 * E168 — o que as três telas de agenda precisam decidir igual.
 *
 * Cada `it` daqui pregava um defeito medido da fatia 4: a cabine desativada
 * que sumia com a agenda dentro (G6), a semana montada no fuso do navegador
 * (G11) e o diálogo de reagendar que não passava por recusa nenhuma (G15).
 */

describe("G6 — a cabine desativada continua desenhada enquanto tiver agenda", () => {
  const cabines = [
    { id: "c1", nome: "Cabine 1", ativo: true },
    { id: "c2", nome: "Cabine 2", ativo: false },
    { id: "c3", nome: "Cabine 3", ativo: false },
  ];

  it("a desativada COM atendimento volta para a grade, marcada", () => {
    /**
     * VERMELHO ANTES: `expected [ { id: 'c1', … } ] to deeply equal
     * [ { id: 'c1', … }, { id: 'c2', … } ]`. As duas telas faziam
     * `cabines.filter((c) => c.ativo)` (`grade.tsx:119`, `semana.tsx:104`) e o
     * 409 do DELETE recomenda desativar — as 4 provas continuavam no banco,
     * continuavam AGENDADO, as noivas continuavam recebendo confirmação, e no
     * dia ninguém via que existiam.
     */
    const colunas = colunasDaGrade(cabines, [{ cabineId: "c2" }, { cabineId: "c1" }]);
    expect(colunas.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(colunas.find((c) => c.id === "c2")!.inativa).toBe(true);
    expect(colunas.find((c) => c.id === "c1")!.inativa).toBe(false);
  });

  it("a desativada VAZIA continua fora — é o ponto de desativá-la", () => {
    expect(colunasDaGrade(cabines, []).map((c) => c.id)).toEqual(["c1"]);
  });

  it("conta quantos atendimentos ficam na cabine que vai ser desativada", () => {
    const agenda = [{ cabineId: "c2" }, { cabineId: "c2" }, { cabineId: "c1" }];
    expect(atendimentosNaCabine(agenda, "c2")).toBe(2);
    expect(atendimentosNaCabine(agenda, "c3")).toBe(0);
  });
});

describe("G11 — a semana nasce do dia da loja, não do fuso do navegador", () => {
  it("às 02:00 de segunda em UTC a loja ainda está no domingo — e a semana é a que contém esse domingo", () => {
    // 2026-08-10 é uma segunda-feira. 02:00Z = 23:00 de domingo (09/08) em SP.
    const agora = new Date("2026-08-10T02:00:00.000Z");
    /**
     * VERMELHO ANTES: `expected '2026-08-10' to be '2026-08-03'`.
     * `startOfWeek(new Date(), { weekStartsOn: 1 })` lia o relógio do
     * NAVEGADOR e respondia a segunda que estava começando; o recorte dos
     * atendimentos, três linhas abaixo, já usava `diaLocal` desde o E115. O
     * botão "Esta semana" levava à semana SEGUINTE, e a semana corrente
     * inteira ficava fora da busca. É a fronteira que sobrou da S-M25.
     */
    expect(ancoraDaSemana(null, agora)).toBe("2026-08-03");
  });

  it("o parâmetro da URL manda quando existe, e o lixo cai no dia da loja", () => {
    const agora = new Date("2026-08-12T15:00:00.000Z");
    expect(ancoraDaSemana("2026-08-19", agora)).toBe("2026-08-17");
    expect(ancoraDaSemana("qualquer-coisa", agora)).toBe("2026-08-10");
  });

  it("segunda continua segunda, domingo recua seis, e a semana tem sete dias seguidos", () => {
    expect(segundaDaSemana("2026-08-10")).toBe("2026-08-10");
    expect(segundaDaSemana("2026-08-09")).toBe("2026-08-03");
    expect(segundaDaSemana("2026-08-16")).toBe("2026-08-10");
    expect(diasDaSemana("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});

describe("G15 — o diálogo de reagendar consulta a mesma recusa que o arraste", () => {
  const expediente = { ...EXPEDIENTE_PADRAO, aberturaHora: 9, fechamentoHora: 11 };
  const cabines = [
    { id: "c1", nome: "Cabine 1", ativo: true },
    { id: "c2", nome: "Cabine 2", ativo: true },
  ];
  const movida = {
    id: "a1",
    cabineId: "c1",
    vendedoraId: "v1",
    inicio: "2026-08-12T12:00:00.000Z", // 09:00 em SP
  };
  // Outra noiva na Cabine 1 às 10:00 de SP.
  const ocupada = {
    id: "a2",
    cabineId: "c1",
    vendedoraId: "v2",
    inicio: "2026-08-12T13:00:00.000Z",
    situacao: "AGENDADO",
  };

  it("o horário ocupado vem recusado, com a frase — e o par escolhido trava o botão", () => {
    const opcoes = opcoesDeReagendamento({
      movida,
      diaYMD: "2026-08-12",
      cabines,
      atendimentosDoDia: [movida, ocupada],
      expediente,
      ausencias: [],
      cabineEscolhida: "c1",
      horaEscolhida: "10:00",
    });
    /**
     * VERMELHO ANTES: o diálogo montava o PATCH direto do `<input type=time>`
     * e do `<Select>` de cabine — nenhuma chamada a `recusaDeMover`, nenhuma
     * opção apagada, nenhum motivo dito. A doutrina do E27 invertida
     * justamente para quem usa teclado e celular, que é o público para o qual
     * o diálogo foi criado (E136/E10). A função não existia: `expected
     * undefined to be 'CABINE_OCUPADA'`.
     */
    expect(opcoes.recusaDoPar).toBe("CABINE_OCUPADA");
    const dezHoras = opcoes.horarios.find((o) => o.valor === "10:00")!;
    expect(dezHoras.recusa).toBe("CABINE_OCUPADA");
    expect(dezHoras.detalhe).toBe("já há atendimento nessa cabine nesse horário");
    // O slot livre continua livre, e sem frase nenhuma.
    expect(opcoes.horarios.find((o) => o.valor === "09:30")!.recusa).toBe(null);
    expect(opcoes.horarios.find((o) => o.valor === "09:30")!.detalhe).toBe(null);
    // A malha é a do expediente, do primeiro ao último que ainda COMEÇA nele.
    expect(opcoes.horarios.map((o) => o.valor)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("a cabine vizinha aparece livre para o mesmo horário", () => {
    const opcoes = opcoesDeReagendamento({
      movida,
      diaYMD: "2026-08-12",
      cabines,
      atendimentosDoDia: [movida, ocupada],
      expediente,
      ausencias: [],
      cabineEscolhida: "c2",
      horaEscolhida: "10:00",
    });
    expect(opcoes.recusaDoPar).toBe(null);
    expect(opcoes.cabines.find((o) => o.valor.id === "c1")!.recusa).toBe("CABINE_OCUPADA");
    expect(opcoes.cabines.find((o) => o.valor.id === "c2")!.recusa).toBe(null);
  });

  it("a vendedora ausente no dia recusa as opções todas, com o motivo do núcleo", () => {
    const opcoes = opcoesDeReagendamento({
      movida,
      diaYMD: "2026-08-12",
      cabines,
      atendimentosDoDia: [movida],
      expediente,
      ausencias: [{ usuarioId: "v1", inicio: "2026-08-12", fim: "2026-08-12" }],
      cabineEscolhida: "c1",
      horaEscolhida: "09:30",
    });
    expect(opcoes.horarios.every((o) => o.recusa === "VENDEDORA_AUSENTE")).toBe(true);
    expect(opcoes.recusaDoPar).toBe("VENDEDORA_AUSENTE");
  });
});
