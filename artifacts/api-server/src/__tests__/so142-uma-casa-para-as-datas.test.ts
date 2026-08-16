import { describe, expect, it } from "vitest";
import * as core from "@workspace/financeiro-core";
import { addDias, diaLocal, inicioDoDia } from "../lib/disponibilidade";

/**
 * S-O142 — **`addDias`/`diaLocal`/`inicioDoDia` moram numa casa só.**
 *
 * `disponibilidade.ts:177` tinha um `addDias` com `pad` e
 * `financeiro-core/datas.ts:86` outro com `toISOString().slice(0, 10)`;
 * `reservas.ts` importava um de cada. Eram equivalentes HOJE (UTC-meio-dia nas
 * duas), e "equivalentes hoje" é a divergência de amanhã (S-C180). Regra 30:
 * a prova de equivalência vem ANTES de apagar — a grafia antiga fica aqui,
 * literal, contra a do core, sobre os dias que fazem diferença: fim de mês,
 * bissexto, virada de ano, n negativo, e o dia do (ex-)horário de verão.
 */
function addDiasAntigo(dia: string, n: number): string {
  const [ano, mes, diaMes] = dia.split("-").map(Number);
  const instante = new Date(Date.UTC(ano!, mes! - 1, diaMes!, 12) + n * 86_400_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${instante.getUTCFullYear()}-${pad(instante.getUTCMonth() + 1)}-${pad(instante.getUTCDate())}`;
}

const DIAS = ["2026-01-31", "2026-02-28", "2028-02-28", "2028-02-29", "2026-12-31", "2027-01-01", "2026-11-01", "2026-10-18", "2000-02-29", "2099-12-31"];
const NS = [-400, -31, -30, -1, 0, 1, 28, 29, 30, 31, 365, 366];

describe("S-O142 — as três funções de dia são as do core", () => {
  it("a grafia antiga do servidor e a do core dão o mesmo dia em 120 pares", () => {
    let pares = 0;
    for (const d of DIAS) for (const n of NS) {
      expect(core.addDias(d, n), `${d} + ${n}`).toBe(addDiasAntigo(d, n));
      pares++;
    }
    expect(pares).toBe(120);
  });

  it("`disponibilidade` re-exporta as do core — a mesma referência, não uma cópia igual", () => {
    expect(addDias).toBe(core.addDias);
    expect(diaLocal).toBe(core.diaLocal);
    expect(inicioDoDia).toBe(core.inicioDoDia);
  });

  it("e o comportamento que o servidor dependia continua: dia local de instante UTC, e o inverso", () => {
    // 02:00Z é 23:00 do dia anterior em SP.
    expect(diaLocal(new Date("2026-08-16T02:00:00Z"))).toBe("2026-08-15");
    expect(inicioDoDia("2026-08-15").toISOString()).toBe("2026-08-15T03:00:00.000Z");
    expect(addDias("2026-08-31", 1)).toBe("2026-09-01");
  });
});
