import { describe, expect, it } from "vitest";
import { competenciaValida, diaLocal } from "@workspace/financeiro-core";
import { competenciaDe, competenciasAnteriores, projetarCompetencia } from "../lib/comissao";
import { montarCsv, responderCsv, type RespostaCsv } from "../lib/csv";
import { intervaloValidado } from "../lib/intervalo";

/**
 * S35 — as consolidações que trocaram uma cópia local pela régua da casa, com
 * a exigência do plano: comportamento idêntico BIT a BIT no domínio válido.
 *
 * A equivalência do `-3h` à mão com `diaLocal` (Intl, America/Sao_Paulo) vale
 * porque São Paulo tem offset FIXO -03:00 desde que o último horário de verão
 * terminou em **17/02/2019** — antes disso o Intl responde -02:00 onde a conta
 * à mão cravava -03:00, e a PRIMEIRA execução desta varredura provou isso:
 * começando em 01/01/2019, `2019-01-01T02:00Z` é dia 1 para o Intl (meia-noite
 * de -02:00) e dia 31 para o `-3h`. Os comentários do repo dizem "sem DST
 * desde 2019", e a fronteira exata é fevereiro. A varredura começa em março de
 * 2019; instantes anteriores não existem no domínio (todo `agora`, `fechadoEm`
 * e `vigenciaInicio` do sistema é de 2026 em diante).
 */

const TRES_HORAS_MS = 3 * 60 * 60 * 1000;

/** A conta que morava em comissao.ts (lib e rota) antes da S35. */
const antigoDiaSP = (t: Date) => new Date(t.getTime() - TRES_HORAS_MS).getUTCDate();
const antigaCompetenciaDe = (t: Date) =>
  new Date(t.getTime() - TRES_HORAS_MS).toISOString().slice(0, 7);

describe("S35: -3h à mão ≡ diaLocal (domínio pós-2019)", () => {
  it("dia do mês e competência batem em toda a varredura mar/2019–2035", () => {
    // Cada dia da faixa, em cinco horários que cercam a virada de dia da
    // loja (00:00Z ainda é véspera 21h em SP; 03:00Z é meia-noite em ponto).
    const horasUTC = [0, 2.99, 3, 12, 23.5];
    let conferidos = 0;
    for (let t = Date.UTC(2019, 2, 1); t <= Date.UTC(2035, 11, 31); t += 86_400_000) {
      for (const h of horasUTC) {
        const instante = new Date(t + h * 3_600_000);
        expect(Number(diaLocal(instante).slice(8, 10))).toBe(antigoDiaSP(instante));
        expect(diaLocal(instante).slice(0, 7)).toBe(antigaCompetenciaDe(instante));
        conferidos++;
      }
    }
    // ~16,8 anos × ~365 dias × 5 horários = 30.750 — a varredura de fato rodou.
    expect(conferidos).toBe(30_750);
  });

  it("competenciaDe consolidada responde igual à conta antiga nas bordas", () => {
    // 23:59:59.999 de SP (02:59:59.999Z do dia seguinte) ainda é o mês velho.
    expect(competenciaDe(new Date("2026-08-01T02:59:59.999Z"))).toBe("2026-07");
    expect(competenciaDe(new Date("2026-08-01T03:00:00.000Z"))).toBe("2026-08");
    expect(competenciaDe(new Date("2026-01-01T02:59:59.999Z"))).toBe("2025-12");
  });
});

describe("S35: competenciaValida — a cópia local aceitava o MESMO conjunto do core", () => {
  it("todos os meses de duas casas, e só os 01..12, nas duas grafias", () => {
    // A conta local antiga: /^\d{4}-\d{2}$/ + mês 1..12.
    const antiga = (s: string) => {
      if (!/^\d{4}-\d{2}$/.test(s)) return false;
      const mes = Number(s.slice(5, 7));
      return mes >= 1 && mes <= 12;
    };
    for (let mes = 0; mes <= 99; mes++) {
      const s = `2026-${String(mes).padStart(2, "0")}`;
      expect(competenciaValida(s)).toBe(antiga(s));
    }
    for (const s of ["2026-1", "2026-013", "26-01", "2026/01", "2026-01-01", "", "abcd-ef"]) {
      expect(competenciaValida(s)).toBe(antiga(s));
    }
  });
});

describe("S35: competenciasAnteriores ≡ a competenciaAnterior que a rota reimplementava", () => {
  it("as N anteriores batem com o Array.from da rota, viradas de ano incluídas", () => {
    // A conta que morava em routes/comissao.ts:486.
    const antigaAnterior = (comp: string, n: number) => {
      const ano = Number(comp.slice(0, 4));
      const mes = Number(comp.slice(5, 7));
      const d = new Date(Date.UTC(ano, mes - 1 - n, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    for (const atual of ["2026-08", "2026-01", "2026-12", "2024-02"]) {
      for (const meses of [1, 3, 6, 12, 24]) {
        const antiga = Array.from({ length: meses }, (_, i) => antigaAnterior(atual, meses - i));
        expect(competenciasAnteriores(atual, meses)).toEqual(antiga);
      }
    }
    expect(competenciasAnteriores("2026-01", 3)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });
});

describe("S35: projetarCompetencia continua contando os dias pela mesma régua", () => {
  it("dia 4 do mês da loja não projeta; dia 5 projeta", () => {
    // 2026-08-05T02:00Z ainda é dia 4 em SP → cedo demais.
    expect(projetarCompetencia(100_000, 0, "2026-08", new Date("2026-08-05T02:00:00Z"))).toBeNull();
    // 2026-08-05T12:00Z é dia 5 em SP → projeta 100000 × 31 ÷ 5 = 620000.
    const p = projetarCompetencia(100_000, 0, "2026-08", new Date("2026-08-05T12:00:00Z"));
    expect(p).toEqual({ diasDecorridos: 5, diasNoMes: 31, baseProjetadaC: 620_000 });
  });
});

describe("S35: responderCsv — o envelope das quatro rotas, byte a byte", () => {
  function resFake() {
    const chamadas: unknown[][] = [];
    const res: RespostaCsv = {
      status: (c) => (chamadas.push(["status", c]), res),
      type: (t) => (chamadas.push(["type", t]), res),
      setHeader: (n, v) => chamadas.push(["setHeader", n, v]),
      send: (corpo) => chamadas.push(["send", corpo]),
    };
    return { res, chamadas };
  }

  it("200, content-type com charset, attachment e BOM — na ordem das rotas", () => {
    const { res, chamadas } = resFake();
    const csv = montarCsv([["Vencimento", "Valor"], ["2026-08-01", "-50.00"]]);
    responderCsv(res, "contas-pagar-2026-08-01-a-2026-08-31", csv);
    expect(chamadas).toEqual([
      ["status", 200],
      ["type", "text/csv; charset=utf-8"],
      ["setHeader", "Content-Disposition", 'attachment; filename="contas-pagar-2026-08-01-a-2026-08-31.csv"'],
      ["send", "\ufeff" + csv],
    ]);
    // O corpo abre no BOM (EF BB BF em UTF-8) — sem ele o Excel lê latin-1.
    const corpo = chamadas[3][1] as string;
    expect(corpo.charCodeAt(0)).toBe(0xfeff);
    expect(corpo.slice(1)).toBe(csv);
  });
});

describe("S35: intervaloValidado — o bloco de/ate copiado nove vezes", () => {
  function resFake() {
    const respostas: { status: number; corpo: unknown }[] = [];
    const res = {
      status: (status: number) => ({
        json: (corpo: unknown) => {
          respostas.push({ status, corpo });
        },
      }),
    };
    return { res, respostas };
  }
  const ok = <Q,>(data: Q) => ({ success: true as const, data });
  const falhou = { success: false as const };

  it("parse recusado responde o 400 padrão e devolve null", () => {
    const { res, respostas } = resFake();
    expect(intervaloValidado(res, falhou)).toBeNull();
    expect(respostas).toEqual([
      { status: 400, corpo: { error: "INTERVALO_INVALIDO", detalhe: "de/ate esperam AAAA-MM-DD" } },
    ]);
  });

  it("as duas rotas com corpo próprio de parse (pagamentos, agenda) o preservam", () => {
    const { res, respostas } = resFake();
    intervaloValidado(res, falhou, {
      error: "FILTRO_INVALIDO",
      detalhe: "Filtro inválido: de/ate esperam YYYY-MM-DD.",
    });
    intervaloValidado(res, falhou, { error: "FILTRO_INVALIDO" });
    expect(respostas).toEqual([
      { status: 400, corpo: { error: "FILTRO_INVALIDO", detalhe: "Filtro inválido: de/ate esperam YYYY-MM-DD." } },
      { status: 400, corpo: { error: "FILTRO_INVALIDO" } },
    ]);
  });

  it("de depois de ate responde a frase histórica; pontas soltas passam", () => {
    const { res, respostas } = resFake();
    expect(intervaloValidado(res, ok({ de: "2026-08-02", ate: "2026-08-01" }))).toBeNull();
    expect(respostas).toEqual([
      { status: 400, corpo: { error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" } },
    ]);
    // Sem uma das pontas (listagens têm as duas opcionais) não há o que comparar.
    expect(intervaloValidado(res, ok({ de: "2026-08-02" }))).toEqual({ de: "2026-08-02" });
    expect(intervaloValidado(res, ok({}))).toEqual({});
    expect(intervaloValidado(res, ok({ de: "2026-08-01", ate: "2026-08-01", status: "ABERTA" })))
      .toEqual({ de: "2026-08-01", ate: "2026-08-01", status: "ABERTA" });
    expect(respostas).toHaveLength(1);
  });
});
