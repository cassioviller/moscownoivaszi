// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DialogoRemoverItem } from "./remover-item";

/**
 * S-O49/E181 — a tela do orçamento passa a saber da recusa que o E174 criou.
 *
 * O cenário é o do S-O25, medido contra o servidor: desconto de R$ 4.000,00 em
 * VALOR sobre R$ 5.000,00 de itens. Tirar o véu de R$ 2.000,00 deixa bruto
 * R$ 3.000,00 contra desconto de R$ 4.000,00 — o `DELETE` volta 422 e o
 * orçamento fica como estava. A vendedora lia isso num toast DEPOIS do clique.
 */

const VESTIDO = { id: "i1", descricao: "Vestido Serena", valorUnitario: 3000, quantidade: 1 };
const VEU = { id: "i2", descricao: "Véu longo", valorUnitario: 2000, quantidade: 1 };

const COM_DESCONTO_APERTADO = {
  descontoTipo: "VALOR",
  descontoValor: 4000,
  itens: [VESTIDO, VEU],
};

describe("S-O49 — o item que sustenta o desconto não sai calado", () => {
  it("o diálogo diz a recusa e o botão Remover não fica clicável", async () => {
    const onConfirmar = vi.fn();
    render(
      <DialogoRemoverItem
        item={VEU}
        orcamento={COM_DESCONTO_APERTADO}
        onConfirmar={onConfirmar}
        onFechar={() => {}}
      />,
    );

    // A frase é a MESMA que o 422 traria — `recusaDeDesconto`, a função que o
    // servidor executa dentro da transação (regra 26).
    expect(screen.getByTestId("recusa-remover-item")).toHaveTextContent(
      /Desconto de R\$ 4\.000,00 é maior que os itens do orçamento \(R\$ 3\.000,00\)/,
    );
    // E o caminho de saída fica dito: quem quer mesmo tirar o item baixa o
    // desconto antes, que é decisão de dinheiro.
    expect(screen.getByTestId("recusa-remover-item")).toHaveTextContent(/desconto/i);

    const remover = screen.getByTestId("confirmar-remover-item");
    expect(remover).toBeDisabled();
    await userEvent.click(remover);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("o item que o desconto não precisa sai como sempre saiu", async () => {
    const onConfirmar = vi.fn();
    render(
      <DialogoRemoverItem
        item={VEU}
        orcamento={{ ...COM_DESCONTO_APERTADO, descontoValor: 1000 }}
        onConfirmar={onConfirmar}
        onFechar={() => {}}
      />,
    );

    expect(screen.queryByTestId("recusa-remover-item")).not.toBeInTheDocument();
    expect(screen.getByText(/sai do orçamento e o total é recalculado/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("confirmar-remover-item"));
    expect(onConfirmar).toHaveBeenCalledWith("i2");
  });
});
