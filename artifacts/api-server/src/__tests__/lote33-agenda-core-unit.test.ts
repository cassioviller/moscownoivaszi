import { describe, expect, it } from "vitest";
import {
  SLOT_MINUTOS,
  slotsDoDia,
  slotDe,
  instanteDoSlot,
  horaLocal,
  dentroDoFuncionamento,
  chaveCelula,
  lerChaveCelula,
  recusaDeMover,
  type Marcacao,
} from "@workspace/agenda-core";

/**
 * E28: a régua que a grade e o PATCH compartilham. O que se prova aqui é o que
 * antes não existia em lugar nenhum inteiro — o expediente vivia só no
 * formulário do cliente e o choque de agenda só nas UNIQUE do banco.
 */

const EXPEDIENTE = { aberturaHora: 9, fechamentoHora: 19 };

describe("agenda-core — a malha de horários", () => {
  it("o último slot é o que ainda COMEÇA no expediente", () => {
    const slots = slotsDoDia(9, 19);
    expect(slots[0]).toBe("09:00");
    expect(slots[1]).toBe("09:30");
    expect(slots.at(-1)).toBe("18:30");
    expect(slots).toHaveLength(((19 - 9) * 60) / SLOT_MINUTOS);
  });

  it("expediente vazio ou invertido não gera malha", () => {
    expect(slotsDoDia(9, 9)).toEqual([]);
    expect(slotsDoDia(19, 9)).toEqual([]);
  });

  it("o slot faz PISO — 14:17 cai em 14:00, não some da grade", () => {
    // A criação usa datetime-local livre, então o banco já tem horários fora da
    // malha. Sem piso eles não teriam célula e ficariam invisíveis.
    expect(slotDe(instanteDoSlot("2026-08-10", "14:00"), 9, 19)).toBe("14:00");
    expect(slotDe(new Date("2026-08-10T14:17:00-03:00"), 9, 19)).toBe("14:00");
    expect(slotDe(new Date("2026-08-10T14:47:00-03:00"), 9, 19)).toBe("14:30");
  });

  it("fora do expediente não tem célula", () => {
    expect(slotDe(new Date("2026-08-10T08:59:00-03:00"), 9, 19)).toBeNull();
    expect(slotDe(new Date("2026-08-10T19:00:00-03:00"), 9, 19)).toBeNull();
    expect(slotDe(new Date("2026-08-10T18:59:00-03:00"), 9, 19)).toBe("18:30");
  });

  it("a hora é a da loja, não a do UTC", () => {
    // 18h em São Paulo é 21h UTC. Lido em UTC cairia fora do expediente e o
    // atendimento sumiria da grade de quem o marcou.
    const fimDeTarde = new Date("2026-08-10T18:00:00-03:00");
    expect(fimDeTarde.toISOString()).toBe("2026-08-10T21:00:00.000Z");
    expect(horaLocal(fimDeTarde).hora).toBe(18);
    expect(dentroDoFuncionamento(fimDeTarde, 9, 19)).toBe(true);
  });

  it("a chave da célula sobrevive a id com barra vertical", () => {
    const chave = chaveCelula("cab|1", "14:30");
    expect(lerChaveCelula(chave)).toEqual({ cabineId: "cab|1", slot: "14:30" });
    expect(lerChaveCelula("semseparador")).toBeNull();
  });
});

describe("agenda-core — para onde o atendimento pode ir", () => {
  const base: Marcacao = {
    id: "a1",
    cabineId: "cab1",
    vendedoraId: "v1",
    inicio: new Date("2026-08-10T10:00:00-03:00"),
  };
  const alvo = (slot: string) => instanteDoSlot("2026-08-10", slot);

  it("célula livre aceita", () => {
    expect(recusaDeMover(base, { cabineId: "cab2", inicio: alvo("15:00") }, [base], EXPEDIENTE)).toBeNull();
  });

  it("fora do expediente é recusado", () => {
    expect(
      recusaDeMover(base, { cabineId: "cab1", inicio: alvo("20:00") }, [base], EXPEDIENTE),
    ).toBe("FORA_DO_HORARIO");
  });

  it("cabine ocupada no mesmo instante é recusada", () => {
    const outra: Marcacao = { id: "a2", cabineId: "cab2", vendedoraId: "v9", inicio: alvo("15:00") };
    expect(
      recusaDeMover(base, { cabineId: "cab2", inicio: alvo("15:00") }, [base, outra], EXPEDIENTE),
    ).toBe("CABINE_OCUPADA");
  });

  it("a mesma vendedora em duas cabines ao mesmo tempo é recusada", () => {
    // Espelha a UNIQUE (loja, vendedora, inicio): ela não se divide em duas.
    const outra: Marcacao = { id: "a2", cabineId: "cab3", vendedoraId: "v1", inicio: alvo("15:00") };
    expect(
      recusaDeMover(base, { cabineId: "cab2", inicio: alvo("15:00") }, [base, outra], EXPEDIENTE),
    ).toBe("VENDEDORA_OCUPADA");
  });

  it("não colide consigo mesma ao ser solta de volta no próprio lugar", () => {
    expect(
      recusaDeMover(base, { cabineId: "cab1", inicio: base.inicio }, [base], EXPEDIENTE),
    ).toBeNull();
  });

  it("ocupação em OUTRO instante não atrapalha", () => {
    const outra: Marcacao = { id: "a2", cabineId: "cab2", vendedoraId: "v1", inicio: alvo("16:00") };
    expect(
      recusaDeMover(base, { cabineId: "cab2", inicio: alvo("15:00") }, [base, outra], EXPEDIENTE),
    ).toBeNull();
  });
});
