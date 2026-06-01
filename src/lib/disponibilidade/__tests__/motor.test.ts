import { describe, it, expect } from "vitest";
import { calcularJanelas, vestidoDisponivel, pendenteDevolucao, FUTURO_DISTANTE } from "../motor";
import type { Bloqueio, Regras } from "../tipos";

// dia → Date UTC (para as janelas de SAÍDA, que são Date)
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
// ds → "YYYY-MM-DD" (para as datas de ENTRADA do Bloqueio, que são string — Grill 4)
const ds = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const REGRAS: Regras = {
  provaDiasAntes: 14,
  provaDuracao: 2,
  usoDiasAntes: 3,
  usoDiasDepois: 2,
  lavagemDiasDepois: 7,
};

describe("calcularJanelas — reserva de casamento (projeção)", () => {
  const reserva: Bloqueio = {
    id: "b1",
    vestidoId: "v1",
    tipo: "reserva_casamento",
    casamentoData: ds(2026, 6, 20),
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  };
  const janelas = calcularJanelas(reserva, REGRAS);

  it("projeta 3 janelas: prova, uso e lavagem, nessa ordem", () => {
    expect(janelas.map((x) => x.tipo)).toEqual(["prova", "uso", "lavagem"]);
  });
  it("ancora a PROVA em casamento − provaDiasAntes, com provaDuracao", () => {
    const prova = janelas.find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 6, 6));
    expect(prova.fim).toEqual(dia(2026, 6, 8));
  });
  it("ancora o USO de casamento − usoDiasAntes até casamento + usoDiasDepois", () => {
    const uso = janelas.find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 17));
    expect(uso.fim).toEqual(dia(2026, 6, 22));
  });
  it("ancora a LAVAGEM no fim do uso (devolução) + lavagemDiasDepois", () => {
    const lavagem = janelas.find((x) => x.tipo === "lavagem")!;
    expect(lavagem.inicio).toEqual(dia(2026, 6, 22));
    expect(lavagem.fim).toEqual(dia(2026, 6, 29));
  });
});

describe("calcularJanelas — datas reais recalculam as janelas", () => {
  it("usa provaDataReal no lugar da projeção quando informada", () => {
    const reserva: Bloqueio = {
      id: "b2", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: ds(2026, 6, 1),
      retiradaDataReal: null, devolucaoDataReal: null,
    };
    const prova = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 6, 1));
    expect(prova.fim).toEqual(dia(2026, 6, 3));
  });
  it("ancora uso.fim e lavagem em devolucaoDataReal quando informada", () => {
    const reserva: Bloqueio = {
      id: "b3", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null, retiradaDataReal: null,
      devolucaoDataReal: ds(2026, 6, 25),
    };
    const janelas = calcularJanelas(reserva, REGRAS);
    const uso = janelas.find((x) => x.tipo === "uso")!;
    const lavagem = janelas.find((x) => x.tipo === "lavagem")!;
    expect(uso.fim).toEqual(dia(2026, 6, 25));
    expect(lavagem.inicio).toEqual(dia(2026, 6, 25));
    expect(lavagem.fim).toEqual(dia(2026, 7, 2));
  });
});

describe("calcularJanelas — manutenção", () => {
  it("gera uma única janela entre retirada e devolução reais", () => {
    const manut: Bloqueio = {
      id: "m1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19),
      devolucaoDataReal: ds(2026, 6, 21),
    };
    expect(calcularJanelas(manut, REGRAS)).toEqual([
      { tipo: "manutencao", inicio: dia(2026, 6, 19), fim: dia(2026, 6, 21) },
    ]);
  });
  it("manutenção SEM devolução fica em aberto: [retirada, FUTURO_DISTANTE)", () => {
    const manut: Bloqueio = {
      id: "m2", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    expect(calcularJanelas(manut, REGRAS)).toEqual([
      { tipo: "manutencao", inicio: dia(2026, 6, 19), fim: FUTURO_DISTANTE },
    ]);
  });
  it("manutenção SEM retirada continua lançando (sem âncora de início)", () => {
    const manut: Bloqueio = {
      id: "m3", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: null, devolucaoDataReal: ds(2026, 6, 21),
    };
    expect(() => calcularJanelas(manut, REGRAS)).toThrow(/retirada/i);
  });
  it("manutenção em aberto BLOQUEIA uma data candidata futura", () => {
    const manutAberta: Bloqueio = {
      id: "ma1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 12, 25),
      regras: REGRAS,
      bloqueiosExistentes: [manutAberta],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("ma1");
  });
});

describe("calcularJanelas — virada de ano nas contas de dias", () => {
  it("projeta a prova no ano anterior quando o casamento é em janeiro", () => {
    const reserva: Bloqueio = {
      id: "b4", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2027, 1, 2),
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    const prova = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 12, 19));
    expect(prova.fim).toEqual(dia(2026, 12, 21));
  });
  it("lança se faltar casamentoData numa reserva", () => {
    const reserva: Bloqueio = {
      id: "b5", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: null,
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    expect(() => calcularJanelas(reserva, REGRAS)).toThrow(/casamento/i);
  });
});

describe("calcularJanelas — retirou e NÃO devolveu (bloqueio aberto, Grill 2)", () => {
  const base = {
    id: "b6", vestidoId: "v1", tipo: "reserva_casamento" as const,
    casamentoData: ds(2026, 6, 20),
    provaDataReal: null, devolucaoDataReal: null,
  };

  it("abre o uso de retiradaDataReal até FUTURO_DISTANTE e NÃO emite lavagem", () => {
    const reserva: Bloqueio = { ...base, retiradaDataReal: ds(2026, 6, 17) };
    const janelas = calcularJanelas(reserva, REGRAS);
    expect(janelas.map((x) => x.tipo)).toEqual(["prova", "uso"]); // sem lavagem
    const uso = janelas.find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 17));
    expect(uso.fim).toEqual(FUTURO_DISTANTE);
  });

  it("NÃO projeta devolução: retirada depois do casamento continua bloqueando", () => {
    // sem este comportamento, casamento + usoDiasDepois (22/6) reliberaria o vestido
    const reserva: Bloqueio = { ...base, retiradaDataReal: ds(2026, 6, 22) };
    const uso = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 22));
    expect(uso.fim).toEqual(FUTURO_DISTANTE);
  });
});

describe("calcularJanelas — guarda de invariante (inicio <= fim)", () => {
  it("lança quando a devolução real é anterior à retirada real (janela invertida)", () => {
    const reserva: Bloqueio = {
      id: "b7", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 22),
      devolucaoDataReal: ds(2026, 6, 18), // antes da retirada → inválido
    };
    expect(() => calcularJanelas(reserva, REGRAS)).toThrow(/invertida/i);
  });
});

describe("pendenteDevolucao", () => {
  const base = {
    id: "b8", vestidoId: "v1", tipo: "reserva_casamento" as const,
    casamentoData: ds(2026, 6, 20), provaDataReal: null,
    retiradaDataReal: ds(2026, 6, 17),
  };
  it("true quando há retirada sem devolução", () => {
    expect(pendenteDevolucao({ ...base, devolucaoDataReal: null })).toBe(true);
  });
  it("false quando a devolução já foi registrada", () => {
    expect(pendenteDevolucao({ ...base, devolucaoDataReal: ds(2026, 6, 22) })).toBe(false);
  });
});

describe("vestidoDisponivel — cenários do spec §10", () => {
  const reservaEm = (id: string, data: string): Bloqueio => ({
    id,
    vestidoId: "v1",
    tipo: "reserva_casamento",
    casamentoData: data,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  });

  it("BLOQUEIA quando há um casamento existente sobreposto", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e1", ds(2026, 6, 21))],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos.length).toBeGreaterThan(0);
    expect(r.conflitos[0].bloqueioId).toBe("e1");
  });

  it("LIBERA quando o casamento existente está distante", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e2", ds(2026, 9, 1))],
    });
    expect(r.disponivel).toBe(true);
    expect(r.conflitos).toEqual([]);
    expect(r.errosBloqueio).toEqual([]);
  });

  it("BLOQUEIA quando há manutenção sobreposta", () => {
    const manut: Bloqueio = {
      id: "m1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: ds(2026, 6, 21),
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [manut],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("m1");
  });

  it("IGNORA bloqueios de outro vestido", () => {
    const outro: Bloqueio = { ...reservaEm("e3", ds(2026, 6, 21)), vestidoId: "v2" };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [outro],
    });
    expect(r.disponivel).toBe(true);
  });

  it("LIBERA um casamento próximo quando as datas reais moveram o uso para longe", () => {
    // mesmo casamento 06-21, mas prova/retirada/devolução reais empurram tudo para julho
    const movido: Bloqueio = {
      id: "e4", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 21),
      provaDataReal: ds(2026, 7, 10),
      retiradaDataReal: ds(2026, 7, 18),
      devolucaoDataReal: ds(2026, 7, 24),
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [movido],
    });
    expect(r.disponivel).toBe(true);
  });

  it("acumula conflitos de todas as janelas que se sobrepõem", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e1", ds(2026, 6, 21))],
    });
    // mesmo vestido, datas coladas: prova×prova e uso×uso colidem
    expect(r.conflitos.length).toBeGreaterThanOrEqual(2);
    expect(r.conflitos.every((c) => c.bloqueioId === "e1")).toBe(true);
  });

  it("LIBERA ao editar a própria reserva (excluirBloqueioId evita a auto-colisão, Grill 3)", () => {
    // e1 já existe em 20/6; movemos para 22/6 — sem excluir, ela colidiria consigo mesma
    const existente = reservaEm("e1", ds(2026, 6, 20));
    const semExcluir = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 22),
      regras: REGRAS,
      bloqueiosExistentes: [existente],
    });
    expect(semExcluir.disponivel).toBe(false); // colide com a própria versão atual

    const comExcluir = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 22),
      regras: REGRAS,
      bloqueiosExistentes: [existente],
      excluirBloqueioId: "e1",
    });
    expect(comExcluir.disponivel).toBe(true);
    expect(comExcluir.conflitos).toEqual([]);
  });

  it("BLOQUEIA qualquer data futura enquanto o bloqueio segue pendente de devolução (Grill 2)", () => {
    // retirou em junho, sem devolução: uso aberto até FUTURO_DISTANTE
    const pendente: Bloqueio = {
      id: "e5", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 17),
      devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 12, 25), // bem distante
      regras: REGRAS,
      bloqueiosExistentes: [pendente],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("e5");
  });

  it("FAIL-SAFE: bloqueioExistente malformado deixa indisponível e reporta erro, sem crash", () => {
    // reserva sem casamentoData → calcularJanelas lança "exige casamentoData"
    const malformado: Bloqueio = {
      id: "x1", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: null,
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [malformado],
    });
    expect(r.disponivel).toBe(false);          // fail-safe: nunca libera por erro
    expect(r.conflitos).toEqual([]);           // não houve conflito de janela...
    expect(r.errosBloqueio).toHaveLength(1);   // ...mas o erro foi reportado
    expect(r.errosBloqueio[0].bloqueioId).toBe("x1");
    expect(r.errosBloqueio[0].motivo).toMatch(/casamento/i);
  });

  it("CANDIDATO inválido continua lançando (não vira errosBloqueio)", () => {
    expect(() =>
      vestidoDisponivel({
        vestidoId: "v1",
        casamentoDataCandidata: "data-invalida",
        regras: REGRAS,
        bloqueiosExistentes: [],
      }),
    ).toThrow(/inválida/i);
  });
});
