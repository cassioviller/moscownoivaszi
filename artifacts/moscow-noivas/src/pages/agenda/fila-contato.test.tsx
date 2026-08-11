// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilaFaltaProcurar } from "./fila-contato";
import type { Atendimento } from "@workspace/api-client-react";

/**
 * E168 — a fila "Falta procurar" da agenda do dia.
 *
 * Dois defeitos da fatia 4 moram aqui, e nenhum deles era visível da lógica
 * pura nem barato de montar no Playwright (exige perfil customizado e sessão
 * própria) — é exatamente o meio-termo que o `vitest.config.ts` descreve.
 */

const BASE = {
  id: "a1",
  lojaId: "l1",
  leadId: "lead-1",
  cabineId: "c1",
  vendedoraId: "v1",
  tipo: "ATENDIMENTO",
  inicio: new Date("2026-08-12T17:00:00.000Z"),
  situacao: "AGENDADO",
  contatadoEm: null,
  confirmadoEm: null,
  remarcacaoPedidaEm: null,
} as unknown as Atendimento;

const nomes = new Map([["lead-1", "Ana"], ["lead-2", "Beatriz"]]);
const linkWa = () => "https://wa.me/5511999999999";

describe("G14 — a fila usa a régua de mensagens-do-dia, com os TRÊS fatos", () => {
  it("quem pediu para remarcar sai da fila e é contado à parte", async () => {
    const pediuRemarcar = {
      ...BASE,
      id: "a2",
      leadId: "lead-2",
      remarcacaoPedidaEm: new Date("2026-08-12T12:00:00.000Z"),
    } as unknown as Atendimento;

    render(
      <FilaFaltaProcurar
        atendimentos={[BASE, pediuRemarcar]}
        nomePorLead={nomes}
        linkWa={linkWa}
        podeEditar
        onProcurou={() => {}}
      />,
    );

    /**
     * VERMELHO ANTES: `expected null not to be null` (o `getByTestId` acha a
     * linha da Beatriz). `agenda/index.tsx:216` re-derivava a régua à mão —
     * `!a.contatadoEm && !a.confirmadoEm` — e esquecia o terceiro fato que o
     * F37/E100 criou. A recepção mandava "confirme sua presença hoje às 14h"
     * **para quem avisou às 9h que não vem**.
     */
    expect(screen.queryByTestId("confirmar-linha-a2")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirmar-linha-a1")).toBeInTheDocument();
    // E some DIZENDO: a Beatriz está na fila de remarcar, que é outro gesto.
    expect(screen.getByText(/pediu para remarcar/)).toBeInTheDocument();
  });

  it("quem já confirmou ou já foi procurada continua fora, como sempre esteve", () => {
    const confirmou = { ...BASE, id: "a3", confirmadoEm: new Date() } as unknown as Atendimento;
    const procurada = { ...BASE, id: "a4", contatadoEm: new Date() } as unknown as Atendimento;
    render(
      <FilaFaltaProcurar
        atendimentos={[confirmou, procurada]}
        nomePorLead={nomes}
        linkWa={linkWa}
        podeEditar
        onProcurou={() => {}}
      />,
    );
    expect(screen.queryByTestId("confirmar-linha-a3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirmar-linha-a4")).not.toBeInTheDocument();
    expect(screen.getByText("1 confirmou pelo portal.")).toBeInTheDocument();
    expect(screen.getByText("1 procurada, ainda sem resposta.")).toBeInTheDocument();
  });
});

describe("G13 — o botão do WhatsApp respeita `agenda.editar`", () => {
  it("sem permissão de editar, o clique NÃO tenta carimbar — e o rótulo avisa", async () => {
    const onProcurou = vi.fn();
    render(
      <FilaFaltaProcurar
        atendimentos={[BASE]}
        nomePorLead={nomes}
        linkWa={linkWa}
        podeEditar={false}
        onProcurou={onProcurou}
      />,
    );

    const botao = screen.getByTestId("confirmar-btn-a1");
    // O link continua abrindo: falar com a noiva não é editar a agenda.
    expect(botao).toHaveAttribute("href", "https://wa.me/5511999999999");
    await userEvent.click(botao);

    /**
     * VERMELHO ANTES: `expected "spy" to not be called at all, but actually
     * been called 1 times`. `index.tsx:252` chamava `registrarContato.mutate`
     * sem gate nenhum: o `POST /contato` exige `agenda.editar`
     * (`agenda.ts:812`) e voltava 403 em silêncio. **A noiva era procurada, o
     * contato não era gravado, e a próxima pessoa procurava de novo** — a
     * mesma mensagem duas vezes.
     */
    expect(onProcurou).not.toHaveBeenCalled();
    expect(screen.getByText("Chamar (sem registrar)")).toBeInTheDocument();
  });

  it("com permissão, o clique carimba o contato do atendimento clicado", async () => {
    const onProcurou = vi.fn();
    render(
      <FilaFaltaProcurar
        atendimentos={[BASE]}
        nomePorLead={nomes}
        linkWa={linkWa}
        podeEditar
        onProcurou={onProcurou}
      />,
    );
    await userEvent.click(screen.getByTestId("confirmar-btn-a1"));
    expect(onProcurou).toHaveBeenCalledWith("a1");
    expect(screen.getByText("Chamar no WhatsApp")).toBeInTheDocument();
  });
});
