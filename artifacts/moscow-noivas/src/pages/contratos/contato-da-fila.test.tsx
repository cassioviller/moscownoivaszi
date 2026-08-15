// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContatoDaFila } from "./contato-da-fila";

/**
 * S-C87 — a fila de atrasos age: o registro de contato abre DA FILA.
 *
 * O widget de verdade é o `HistoricoContato` (E27/E32) — o mesmo da ficha da
 * noiva e da Cobrança, reusado para não nascer a segunda grafia do registro
 * (regra 26). Aqui ele entra MOCKADO: o que este arquivo prega é que a fila
 * oferece o gesto, abre sob demanda (lazy — a fila não paga uma request por
 * linha ao montar) e entrega o MESMO leadId da linha ao widget compartilhado.
 *
 * VERMELHO ANTES (regra 34, medido com o `<ContatoDaFila>` removido das duas
 * listas de `contratos/index.tsx` e recolocado):
 * `expected false to be true` nas duas âncoras da varredura de fiação —
 * a fila voltava a só avisar, e o teste do componente sozinho seguia verde,
 * que é exatamente a fresta que a varredura fecha.
 */

vi.mock("@/components/historico-contato", () => ({
  HistoricoContato: ({ leadId, aberto }: { leadId: string; aberto: boolean }) => (
    <div data-testid="historico-mock" data-lead={leadId} data-aberto={String(aberto)} />
  ),
}));

describe("S-C87 — o contato se registra da fila, pelo widget compartilhado", () => {
  it("fechado não monta o histórico (lazy); aberto entrega o MESMO leadId", async () => {
    render(<ContatoDaFila leadId="lead-77" />);

    // Lazy: nada montado, nenhuma request paga ao desenhar a fila.
    expect(screen.queryByTestId("historico-mock")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("contato-da-fila-lead-77"));
    const historico = screen.getByTestId("historico-mock");
    expect(historico.getAttribute("data-lead")).toBe("lead-77");
    expect(historico.getAttribute("data-aberto")).toBe("true");
  });

  /**
   * A fiação: o componente certo existir não prova que a FILA o usa — o
   * defeito da sobra era exatamente a fila sem gesto. As duas listas
   * (cobráveis e órfãs) têm de renderizar o ContatoDaFila, e a órfã só com
   * dona (`o.leadId ?`): a sem dona não tem a quem ligar.
   */
  it("as duas listas da fila usam o componente — e a órfã só quando tem dona", () => {
    const src = readFileSync(join(import.meta.dirname, "index.tsx"), "utf8");
    expect(src.includes("<ContatoDaFila leadId={i.leadId} />")).toBe(true);
    expect(src.includes("{o.leadId ? <ContatoDaFila leadId={o.leadId} /> : null}")).toBe(true);
  });
});
