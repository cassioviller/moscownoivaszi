import { describe, it, expect, afterAll } from "vitest";
import {
  REGRA_DEFAULT,
  diaLocal,
  addDias,
  janelasDoBloqueio,
  conflitos,
  ocupacaoFisica,
  type Janela,
  type BloqueioJanelasInput,
  type ClasseJanela,
  type MotivoJanela,
  type RegraJanelas,
} from "../lib/disponibilidade";
import { fecharPool } from "./helpers";

/**
 * Lote 3 — testes de UNIDADE do serviço de disponibilidade.
 * SEM banco: só as funções puras. "Hoje" é sempre literal injetado e todas as
 * datas de negócio são literais com offset explícito (America/Sao_Paulo).
 */

afterAll(async () => {
  await fecharPool();
});

// Casamento âncora D = 15/09/2027. Com REGRA_DEFAULT (14/3/2/7):
//   PROVA   [2027-09-01, 2027-09-11]
//   USO     [2027-09-12, 2027-09-17]
//   LAVAGEM [2027-09-18, 2027-09-24]
const D = new Date("2027-09-15T12:00:00-03:00");
const HOJE = "2027-01-10"; // bem antes de qualquer janela

function bloqueio(over: Partial<BloqueioJanelasInput> = {}): BloqueioJanelasInput {
  return {
    id: "blq-1",
    tipo: "RESERVA_CASAMENTO",
    casamentoData: D,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    lavagemConcluidaEm: null,
    inicio: null,
    fim: null,
    ...over,
  };
}

function jan(
  inicio: string,
  fim: string | null,
  classe: ClasseJanela = "FISICA",
  motivo: MotivoJanela = "USO",
  bloqueioId = "jan-x",
): Janela {
  return { inicio, fim, classe, motivo, bloqueioId };
}

const porMotivo = (janelas: Janela[], motivo: MotivoJanela) =>
  janelas.find((j) => j.motivo === motivo);

describe("diaLocal", () => {
  it("converte timestamptz GMT para o dia local de São Paulo (01:00Z do dia 16 ainda é 15/09 em SP)", () => {
    expect(diaLocal(new Date("2027-09-16T01:00:00Z"))).toBe("2027-09-15");
  });

  it("meio-dia local com offset explícito mantém o dia", () => {
    expect(diaLocal(new Date("2027-09-15T12:00:00-03:00"))).toBe("2027-09-15");
  });

  it("vira o dia exatamente na meia-noite de SP (03:00Z)", () => {
    expect(diaLocal(new Date("2027-09-15T03:00:00Z"))).toBe("2027-09-15");
    expect(diaLocal(new Date("2027-09-15T02:59:59Z"))).toBe("2027-09-14");
  });
});

describe("addDias", () => {
  it("atravessa viradas de mês", () => {
    expect(addDias("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDias("2027-09-30", 1)).toBe("2027-10-01");
    expect(addDias("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("respeita ano bissexto", () => {
    expect(addDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDias("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("atravessa virada de ano e aceita n = 0", () => {
    expect(addDias("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDias("2027-09-15", 0)).toBe("2027-09-15");
  });

  it("soma janelas longas sem drift (40 dias)", () => {
    expect(addDias("2027-09-15", 40)).toBe("2027-10-25");
    expect(addDias("2027-09-15", -14)).toBe("2027-09-01");
  });
});

describe("REGRA_DEFAULT", () => {
  it("bate com os defaults do schema (regra ausente nunca falha)", () => {
    expect(REGRA_DEFAULT).toEqual({
      provaDiasAntes: 14,
      usoDiasAntes: 3,
      usoDiasDepois: 2,
      lavagemDiasDepois: 7,
      // S-A16: a lavagem do ESTOQUE nasce em 0 — sem lavagem na conta, o
      // comportamento que sempre valeu, até a loja configurar.
      estoqueLavagemDiasDepois: 0,
    });
  });
});

describe("janelasDoBloqueio — RESERVA_CASAMENTO", () => {
  it("gera PROVA, USO e LAVAGEM previstas para D = 15/09/2027", () => {
    const janelas = janelasDoBloqueio(bloqueio(), REGRA_DEFAULT, HOJE);
    expect(janelas).toHaveLength(3);
    expect(porMotivo(janelas, "PROVA")).toMatchObject({
      inicio: "2027-09-01",
      fim: "2027-09-11",
      classe: "PROVA",
      bloqueioId: "blq-1",
    });
    expect(porMotivo(janelas, "USO")).toMatchObject({
      inicio: "2027-09-12",
      fim: "2027-09-17",
      classe: "FISICA",
    });
    expect(porMotivo(janelas, "LAVAGEM")).toMatchObject({
      inicio: "2027-09-18",
      fim: "2027-09-24",
      classe: "FISICA",
    });
  });

  it("provaDataReal colapsa a janela de prova para um único dia", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ provaDataReal: new Date("2027-09-05T15:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(porMotivo(janelas, "PROVA")).toMatchObject({
      inicio: "2027-09-05",
      fim: "2027-09-05",
      classe: "PROVA",
    });
  });

  it("retiradaDataReal anterior ao previsto antecipa o início da FISICA", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({
        retiradaDataReal: new Date("2027-09-10T10:00:00-03:00"),
        devolucaoDataReal: new Date("2027-09-17T18:00:00-03:00"),
      }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(porMotivo(janelas, "USO")).toMatchObject({
      inicio: "2027-09-10",
      fim: "2027-09-17",
    });
  });

  it("devolução atrasada estende o USO e desloca a LAVAGEM", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ devolucaoDataReal: new Date("2027-09-20T14:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(porMotivo(janelas, "USO")).toMatchObject({ fim: "2027-09-20" });
    expect(porMotivo(janelas, "LAVAGEM")).toMatchObject({
      inicio: "2027-09-21",
      fim: "2027-09-27",
    });
  });

  it("devolução antecipada encurta o USO e antecipa a LAVAGEM", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ devolucaoDataReal: new Date("2027-09-16T09:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(porMotivo(janelas, "USO")).toMatchObject({ fim: "2027-09-16" });
    expect(porMotivo(janelas, "LAVAGEM")).toMatchObject({
      inicio: "2027-09-17",
      fim: "2027-09-23",
    });
  });

  it("retirada sem devolução → janela FISICA aberta com motivo USO enquanto não atrasa", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ retiradaDataReal: new Date("2027-09-12T10:00:00-03:00") }),
      REGRA_DEFAULT,
      "2027-09-16", // hoje <= fim previsto (17/09)
    );
    const fisicas = janelas.filter((j) => j.classe === "FISICA");
    expect(fisicas).toHaveLength(1); // sem LAVAGEM enquanto não devolve
    expect(fisicas[0]).toMatchObject({ inicio: "2027-09-12", fim: null, motivo: "USO" });
  });

  it("retirada sem devolução com hoje > fim previsto → motivo ATRASO_DEVOLUCAO", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ retiradaDataReal: new Date("2027-09-12T10:00:00-03:00") }),
      REGRA_DEFAULT,
      "2027-09-18", // fim previsto do uso é 17/09
    );
    const aberta = janelas.find((j) => j.fim === null);
    expect(aberta).toMatchObject({ motivo: "ATRASO_DEVOLUCAO", classe: "FISICA" });
  });

  it("janela aberta conflita com qualquer casamento futuro", () => {
    const abertas = janelasDoBloqueio(
      bloqueio({ retiradaDataReal: new Date("2027-09-12T10:00:00-03:00") }),
      REGRA_DEFAULT,
      "2027-09-18",
    );
    const futuras = janelasDoBloqueio(
      bloqueio({ id: "blq-2", casamentoData: new Date("2028-06-10T12:00:00-03:00") }),
      REGRA_DEFAULT,
      "2027-09-18",
    );
    const pares = conflitos(futuras, abertas);
    expect(pares.length).toBeGreaterThan(0);
    expect(pares.some((p) => p.existente.motivo === "ATRASO_DEVOLUCAO")).toBe(true);
  });

  it("regra com lavagemDiasDepois = 0 não gera janela de LAVAGEM", () => {
    const regra: RegraJanelas = { ...REGRA_DEFAULT, lavagemDiasDepois: 0 };
    const janelas = janelasDoBloqueio(bloqueio(), regra, HOJE);
    expect(porMotivo(janelas, "LAVAGEM")).toBeUndefined();
    expect(porMotivo(janelas, "USO")).toMatchObject({ fim: "2027-09-17" });
  });
});

/**
 * S-O117 — `casamentoData` é data de NEGÓCIO, não instante.
 *
 * A tela ancora ao meio-dia SP antes de mandar (`diaParaISO`), e por isso o
 * defeito não aparece clicando. Cliente de API que mande o dia cru —
 * `2028-09-05T00:00:00.000Z`, que é o que `new Date("2028-09-05")` produz em
 * JavaScript — recebia as TRÊS janelas um dia atrás, porque a leitura era em
 * fuso da loja: meia-noite UTC do dia 5 é 21h do dia 4 em São Paulo.
 */
describe("janelasDoBloqueio — casamentoData é data de NEGÓCIO (S-O117)", () => {
  // D = 05/09/2028 escrito CRU (meia-noite UTC). Com REGRA_DEFAULT:
  //   PROVA   [2028-08-22, 2028-09-01]
  //   USO     [2028-09-02, 2028-09-07]
  //   LAVAGEM [2028-09-08, 2028-09-14]
  const CRU = new Date("2028-09-05T00:00:00.000Z");

  it("meia-noite UTC não empurra as três janelas um dia para trás", () => {
    const janelas = janelasDoBloqueio(bloqueio({ casamentoData: CRU }), REGRA_DEFAULT, "2028-01-10");
    expect(porMotivo(janelas, "PROVA")).toMatchObject({ inicio: "2028-08-22", fim: "2028-09-01" });
    expect(porMotivo(janelas, "USO")).toMatchObject({ inicio: "2028-09-02", fim: "2028-09-07" });
    expect(porMotivo(janelas, "LAVAGEM")).toMatchObject({ inicio: "2028-09-08", fim: "2028-09-14" });
  });

  it("o dia cru e o mesmo dia ancorado ao meio-dia SP descrevem as MESMAS janelas", () => {
    const ancorado = new Date("2028-09-05T12:00:00-03:00");
    expect(janelasDoBloqueio(bloqueio({ casamentoData: CRU }), REGRA_DEFAULT, "2028-01-10")).toEqual(
      janelasDoBloqueio(bloqueio({ casamentoData: ancorado }), REGRA_DEFAULT, "2028-01-10"),
    );
  });
});

describe("janelasDoBloqueio — MANUTENCAO", () => {
  it("gera janela única FISICA [dia(inicio), dia(fim)]", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({
        tipo: "MANUTENCAO",
        casamentoData: null,
        inicio: new Date("2027-10-01T09:00:00-03:00"),
        fim: new Date("2027-10-10T18:00:00-03:00"),
      }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(janelas).toHaveLength(1);
    expect(janelas[0]).toMatchObject({
      inicio: "2027-10-01",
      fim: "2027-10-10",
      motivo: "MANUTENCAO",
      classe: "FISICA",
    });
  });

  it("fim null → janela aberta (sem prazo) que conflita com casamento futuro", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({
        tipo: "MANUTENCAO",
        casamentoData: null,
        inicio: new Date("2027-10-01T09:00:00-03:00"),
        fim: null,
      }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(janelas[0]).toMatchObject({ inicio: "2027-10-01", fim: null });

    const futuras = janelasDoBloqueio(
      bloqueio({ id: "blq-2", casamentoData: new Date("2028-03-20T12:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(conflitos(futuras, janelas).length).toBeGreaterThan(0);
  });

  it("sem inicio → nenhuma janela (a rota é quem responde 400)", () => {
    const janelas = janelasDoBloqueio(
      bloqueio({ tipo: "MANUTENCAO", casamentoData: null, inicio: null }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(janelas).toEqual([]);
  });

  it("manutenção sobreposta ao uso de um casamento conflita", () => {
    const manutencao = janelasDoBloqueio(
      bloqueio({
        tipo: "MANUTENCAO",
        casamentoData: null,
        inicio: new Date("2027-09-14T09:00:00-03:00"),
        fim: new Date("2027-09-16T18:00:00-03:00"),
      }),
      REGRA_DEFAULT,
      HOJE,
    );
    const casamento = janelasDoBloqueio(bloqueio({ id: "blq-2" }), REGRA_DEFAULT, HOJE);
    const pares = conflitos(manutencao, casamento);
    expect(pares.length).toBeGreaterThan(0);
    expect(pares.some((p) => p.nova.motivo === "MANUTENCAO" && p.existente.motivo === "USO")).toBe(
      true,
    );
  });
});

describe("conflitos", () => {
  it("sem bloqueios existentes → livre", () => {
    const novas = janelasDoBloqueio(bloqueio(), REGRA_DEFAULT, HOJE);
    expect(conflitos(novas, [])).toEqual([]);
  });

  it("sobreposição exata de janelas FISICAS conflita", () => {
    const a = [jan("2027-09-12", "2027-09-17")];
    const b = [jan("2027-09-12", "2027-09-17")];
    expect(conflitos(a, b)).toHaveLength(1);
  });

  it("sobreposição parcial conflita", () => {
    const a = [jan("2027-09-15", "2027-09-20")];
    const b = [jan("2027-09-12", "2027-09-17")];
    expect(conflitos(a, b)).toHaveLength(1);
  });

  it("janelas encostadas NÃO conflitam", () => {
    const a = [jan("2027-09-11", "2027-09-20")];
    const b = [jan("2027-09-01", "2027-09-10")];
    expect(conflitos(a, b)).toEqual([]);
    expect(conflitos(b, a)).toEqual([]);
  });

  it("compartilhar o dia-limite (intervalos inclusivos) conflita", () => {
    const a = [jan("2027-09-10", "2027-09-20")];
    const b = [jan("2027-09-01", "2027-09-10")];
    expect(conflitos(a, b)).toHaveLength(1);
  });

  it("PROVA × PROVA é permitido (vestido está na loja)", () => {
    const a = [jan("2027-09-01", "2027-09-11", "PROVA", "PROVA")];
    const b = [jan("2027-09-05", "2027-09-15", "PROVA", "PROVA")];
    expect(conflitos(a, b)).toEqual([]);
  });

  it("PROVA × FISICA conflita nas duas direções", () => {
    const prova = [jan("2027-09-10", "2027-09-14", "PROVA", "PROVA")];
    const fisica = [jan("2027-09-12", "2027-09-17", "FISICA", "USO")];
    expect(conflitos(prova, fisica)).toHaveLength(1);
    expect(conflitos(fisica, prova)).toHaveLength(1);
  });

  it("lavagem do casamento anterior bloqueia o uso do próximo (12 dias depois)", () => {
    const existentes = janelasDoBloqueio(bloqueio(), REGRA_DEFAULT, HOJE);
    const novas = janelasDoBloqueio(
      bloqueio({ id: "blq-2", casamentoData: new Date("2027-09-27T12:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    // USO do novo [24/09, 29/09] invade a LAVAGEM do existente [18/09, 24/09].
    const pares = conflitos(novas, existentes);
    expect(
      pares.some((p) => p.nova.motivo === "USO" && p.existente.motivo === "LAVAGEM"),
    ).toBe(true);
  });

  it("casamento a 40 dias não conflita (não super-bloquear)", () => {
    const existentes = janelasDoBloqueio(bloqueio(), REGRA_DEFAULT, HOJE);
    const novas = janelasDoBloqueio(
      bloqueio({ id: "blq-2", casamentoData: new Date("2027-10-25T12:00:00-03:00") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(conflitos(novas, existentes)).toEqual([]);
  });
});

describe("ocupacaoFisica", () => {
  it("envelope físico cobre USO + LAVAGEM (sem a PROVA)", () => {
    expect(ocupacaoFisica(bloqueio(), REGRA_DEFAULT)).toEqual({
      inicio: "2027-09-12",
      fim: "2027-09-24",
    });
  });

  it("retirada sem devolução → envelope aberto (fim null)", () => {
    expect(
      ocupacaoFisica(
        bloqueio({ retiradaDataReal: new Date("2027-09-12T10:00:00-03:00") }),
        REGRA_DEFAULT,
      ),
    ).toEqual({ inicio: "2027-09-12", fim: null });
  });

  it("devolução atrasada estende o envelope até o fim da lavagem real", () => {
    expect(
      ocupacaoFisica(
        bloqueio({ devolucaoDataReal: new Date("2027-09-20T14:00:00-03:00") }),
        REGRA_DEFAULT,
      ),
    ).toEqual({ inicio: "2027-09-12", fim: "2027-09-27" });
  });

  it("MANUTENCAO sem fim → envelope aberto; sem inicio → null", () => {
    expect(
      ocupacaoFisica(
        bloqueio({
          tipo: "MANUTENCAO",
          casamentoData: null,
          inicio: new Date("2027-10-01T09:00:00-03:00"),
          fim: null,
        }),
        REGRA_DEFAULT,
      ),
    ).toEqual({ inicio: "2027-10-01", fim: null });

    expect(
      ocupacaoFisica(
        bloqueio({ tipo: "MANUTENCAO", casamentoData: null, inicio: null }),
        REGRA_DEFAULT,
      ),
    ).toBeNull();
  });

  it("regra sem lavagem encerra o envelope no fim do USO", () => {
    const regra: RegraJanelas = { ...REGRA_DEFAULT, lavagemDiasDepois: 0 };
    expect(ocupacaoFisica(bloqueio(), regra)).toEqual({
      inicio: "2027-09-12",
      fim: "2027-09-17",
    });
  });
});
