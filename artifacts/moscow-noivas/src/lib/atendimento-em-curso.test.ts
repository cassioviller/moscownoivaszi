import { describe, expect, it } from "vitest";
import { atendimentoEmCurso } from "./atendimento-em-curso";

/**
 * F13/E98 — a régua da barra do atendimento em curso.
 *
 * Ela decide UMA coisa (qual atendimento a barra mostra) e os casos que
 * importam são todos sobre mostrar a barra ERRADA — que é pior que não mostrar
 * nenhuma, porque convida ao clique no atendimento de outra pessoa.
 */
const base = {
  id: "a1",
  leadId: "lead-1",
  vendedoraId: "eu",
  situacao: "EM_ATENDIMENTO",
  inicio: "2026-07-28T13:00:00Z",
  atendidoEm: "2026-07-28T13:07:00Z",
  lead: { noivaNome: "Marina" },
};

describe("atendimentoEmCurso", () => {
  it("devolve o atendimento EM_ATENDIMENTO da própria pessoa", () => {
    expect(atendimentoEmCurso([base], "eu")?.id).toBe("a1");
  });

  it("AGENDADO, CONCLUIDO e FALTOU não são atendimento em curso", () => {
    for (const situacao of ["AGENDADO", "CONCLUIDO", "FALTOU"]) {
      expect(atendimentoEmCurso([{ ...base, situacao }], "eu")).toBeNull();
    }
  });

  /**
   * O caso que faz a régua existir. Numa loja com três vendedoras há vários
   * `EM_ATENDIMENTO` ao mesmo tempo, e uma barra dizendo "Atendendo Marina"
   * para quem não está atendendo Marina convida ao clique em "Concluir" de um
   * atendimento alheio.
   */
  it("o atendimento de OUTRA vendedora nunca vira a minha barra", () => {
    expect(atendimentoEmCurso([{ ...base, vendedoraId: "outra" }], "eu")).toBeNull();
  });

  it("entre dois meus, mostra o que começou POR ÚLTIMO", () => {
    const antigo = { ...base, id: "antigo", atendidoEm: "2026-07-28T09:00:00Z" };
    const recente = { ...base, id: "recente", atendidoEm: "2026-07-28T15:30:00Z" };

    expect(atendimentoEmCurso([antigo, recente], "eu")?.id).toBe("recente");
    // E a ordem da lista não decide nada.
    expect(atendimentoEmCurso([recente, antigo], "eu")?.id).toBe("recente");
  });

  /**
   * `inicio` é a hora AGENDADA; `atendidoEm` é quando o botão foi clicado. O
   * F11/E97 existe porque as duas divergem — a noiva das 14h que chegou às
   * 15h40. Quem tem a noiva na cabine AGORA é quem começou por último no
   * relógio, não quem tinha o horário mais tarde na agenda.
   */
  it("ordena pelo relógio real (atendidoEm), não pelo horário agendado", () => {
    const marcadoTarde = {
      ...base,
      id: "marcado-tarde",
      inicio: "2026-07-28T16:00:00Z",
      atendidoEm: "2026-07-28T10:00:00Z",
    };
    const comecouAgora = {
      ...base,
      id: "comecou-agora",
      inicio: "2026-07-28T09:00:00Z",
      atendidoEm: "2026-07-28T15:00:00Z",
    };

    expect(atendimentoEmCurso([marcadoTarde, comecouAgora], "eu")?.id).toBe("comecou-agora");
  });

  it("sem atendidoEm, o horário agendado é o critério — e não estoura", () => {
    const semCarimbo = { ...base, id: "sem", atendidoEm: null };
    expect(atendimentoEmCurso([semCarimbo], "eu")?.id).toBe("sem");
  });

  it("lista ausente, vazia ou sem usuário devolve null em vez de estourar", () => {
    expect(atendimentoEmCurso(undefined, "eu")).toBeNull();
    expect(atendimentoEmCurso([], "eu")).toBeNull();
    // Sessão ainda carregando: sem `usuarioId` não há "meu" atendimento, e
    // adivinhar mostraria a barra de outra pessoa por um instante.
    expect(atendimentoEmCurso([base], undefined)).toBeNull();
  });
});
