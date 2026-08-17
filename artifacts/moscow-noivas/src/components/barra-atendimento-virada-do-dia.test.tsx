// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

/**
 * **S-RM18 — a barra do atendimento em curso, na aba que atravessa a meia-noite.**
 *
 * A barra está em TODA tela do app e pede exatamente `de=ate=hoje`
 * (`barra-atendimento.tsx:43`). O dia era lido no CORPO do componente, não
 * dentro de um `useMemo` — então a régua da S-RM11 (`datas-varredura.test.ts`)
 * não a via, e a fronteira dela dizia isso na letra. O efeito é o mesmo e é
 * pior de lugar: a barra só lê `atendimentos.data`, o react-query não a
 * re-renderiza enquanto o dado não muda, e a aba que o ateliê deixa aberta o
 * dia inteiro seguia pedindo a agenda de ONTEM. O atendimento iniciado hoje não
 * aparecia na barra que existe justamente para mostrá-lo.
 *
 * **A mock respeita a JANELA** — é o que torna a cena uma medição e não uma
 * encenação: ela devolve o atendimento só quando a chave pedida é o dia 18. Se
 * ela devolvesse sempre a mesma lista, o teste passaria com o `hojeLocal()` de
 * volta no lugar e não pregaria nada (regra 34).
 *
 * **E as referências são constantes de módulo** (a lição da S-RM12): o
 * `useMemo` do `emCurso` depende de `atendimentos.data`, e uma mock que
 * construísse `{ data: [...] }` a cada chamada inventaria dependência instável
 * e faria o conserto "aparecer" sem existir.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ activeLojaId: "l1", acessosModulos: null, user: { id: "u1" } }),
}));

/** 00h10 do dia 18/08 em São Paulo (UTC−3) — dez minutos DEPOIS da virada. */
const COMECOU_DEPOIS_DA_VIRADA = "2026-08-18T03:10:00.000Z";

const EM_CURSO = {
  id: "a1",
  lojaId: "l1",
  leadId: "lead-1",
  vendedoraId: "u1",
  tipo: "ATENDIMENTO",
  inicio: COMECOU_DEPOIS_DA_VIRADA,
  atendidoEm: COMECOU_DEPOIS_DA_VIRADA,
  situacao: "EM_ATENDIMENTO",
  lead: { id: "lead-1", noivaNome: "Ana" },
};

/** Duas respostas PARADAS, uma por dia — a referência nunca muda por render. */
const DIA_18 = { data: [EM_CURSO], isLoading: false, isError: false };
const DIA_17 = { data: [] as never[], isLoading: false, isError: false };

/** Toda janela que a barra pediu, na ordem — a chave é o que se mede aqui. */
const janelasPedidas: string[] = [];

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useListAtendimentos: (_lojaId: string, janela: { de: string; ate: string }) => {
      janelasPedidas.push(`${janela.de}..${janela.ate}`);
      return janela.de === "2026-08-18" ? DIA_18 : DIA_17;
    },
  };
});

const { BarraAtendimento } = await import("./barra-atendimento");

/** 23h59 do dia 17/08 em São Paulo — um minuto antes da virada. */
const ANTES_DA_VIRADA = new Date("2026-08-18T02:59:00.000Z");

function montarABarra() {
  render(
    <MemoryRouter initialEntries={["/loja/l1/vestidos"]}>
      <BarraAtendimento />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  janelasPedidas.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(ANTES_DA_VIRADA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S-RM18 — a barra do atendimento pergunta pelo dia NOVO sem recarregar a aba", () => {
  it("o atendimento iniciado depois da meia-noite aparece na barra", async () => {
    montarABarra();

    // 23h59 do dia 17: a janela certa é o dia 17, e não há atendimento nenhum.
    expect(janelasPedidas.at(-1)).toBe("2026-08-17..2026-08-17");
    expect(screen.queryByTestId("barra-atendimento")).not.toBeInTheDocument();

    // A aba fica aberta na tela de vestidos. Passam dois minutos, o dia vira e a
    // vendedora inicia o atendimento das 00h10 pela fila — em outra aba, ou na
    // própria fila, que é o único lugar que recarrega.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    /**
     * VERMELHO ANTES (com `const janela = { de: hojeLocal(), ate: hojeLocal() }`
     * de volta no corpo, régua da regra 34):
     *
     * ```
     * AssertionError: expected '2026-08-17..2026-08-17' to be '2026-08-18..2026-08-18'
     * ```
     *
     * e, na linha seguinte, a barra que não existe:
     *
     * ```
     * TestingLibraryElementError: Unable to find an element by: [data-testid="barra-atendimento"]
     * ```
     */
    expect(janelasPedidas.at(-1)).toBe("2026-08-18..2026-08-18");
    expect(screen.getByTestId("barra-atendimento")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("trinta segundos antes da virada nada se mexe — a chave não é um relógio que gira", async () => {
    montarABarra();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // Ainda é dia 17: a janela é a mesma e a barra continua fora da tela.
    expect(janelasPedidas.at(-1)).toBe("2026-08-17..2026-08-17");
    expect(screen.queryByTestId("barra-atendimento")).not.toBeInTheDocument();
  });
});
