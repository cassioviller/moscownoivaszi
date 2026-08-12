// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { NoivaForm, type NoivaFormValues } from "./noiva-form";

/**
 * S-O43 — o formulário não deixa mais passar o número que apaga os botões.
 *
 * Antes: `whatsapp: z.string().optional()` e um `<input type="tel">` cru. O
 * número com um dígito a menos era aceito, salvo e exibido na ficha como se
 * estivesse bom, e todo botão de wa.me do sistema sumia sem uma palavra.
 *
 * O formulário usa `useBlocker` (o guarda de "você tem alterações não salvas"),
 * que exige um data router — daí o `createMemoryRouter` em vez do `render` seco.
 */
function montar(onSubmit: (v: NoivaFormValues) => void) {
  const router = createMemoryRouter(
    [{ path: "/", element: <NoivaForm submitLabel="Adicionar noiva" pending={false} onSubmit={onSubmit} /> }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}
describe("o campo de WhatsApp do cadastro da noiva", () => {
  it("formata enquanto se digita", async () => {
    const usuario = userEvent.setup();
    montar(vi.fn());

    await usuario.type(screen.getByTestId("input-noiva-whatsapp"), "11962220147");

    expect(screen.getByTestId("input-noiva-whatsapp")).toHaveValue("(11) 96222-0147");
  });

  it("recusa o número que não vira link, e diz o que aconteceria", async () => {
    const usuario = userEvent.setup();
    const aoEnviar = vi.fn();
    montar(aoEnviar);

    await usuario.type(screen.getByTestId("input-noiva-nome"), "Helena Ferraz");
    await usuario.type(screen.getByTestId("input-noiva-whatsapp"), "962220147");
    await usuario.click(screen.getByTestId("button-salvar-noiva"));

    await waitFor(() => {
      expect(screen.getByText(/os botões de WhatsApp dela não aparecem/i)).toBeInTheDocument();
    });
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  /**
   * Campo vazio não reclama. O teste afirma pela AUSÊNCIA da mensagem, e não
   * por um envio bem-sucedido, porque o `Select` do Radix não abre em jsdom
   * (ele depende de pointer events que o ambiente não tem) — a origem, que é
   * obrigatória, continuaria barrando o envio por outro motivo e o teste
   * passaria a medir a coisa errada.
   */
  it("não reclama do WhatsApp vazio — o campo é opcional", async () => {
    const usuario = userEvent.setup();
    montar(vi.fn());

    await usuario.type(screen.getByTestId("input-noiva-nome"), "Helena Ferraz");
    await usuario.click(screen.getByTestId("button-salvar-noiva"));

    await waitFor(() => {
      expect(screen.getByText(/Escolha de onde ela veio/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/os botões de WhatsApp dela não aparecem/i)).not.toBeInTheDocument();
  });
});
