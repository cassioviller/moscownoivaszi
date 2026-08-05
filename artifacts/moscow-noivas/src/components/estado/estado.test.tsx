// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Erro, Vazio } from "./index";

/**
 * S15 — **este é o teste que morreu antes de nascer.**
 *
 * A sobra conta a história: alguém foi escrever o teste do `<Erro>`, rodou o
 * vitest e leu *"No test files found"*, porque o `include` só olhava
 * `src/lib/**​/*.test.ts`. O teste foi jogado fora e a linha do config ficou.
 *
 * O que ele prega é o que o componente consertou ao nascer: **a noiva e a
 * vendedora nunca leem o protocolo**. O `EstadoErro` que ele substituiu ainda
 * fazia `erro instanceof Error ? erro.message`, e por isso mostrava "HTTP 404
 * Not Found" na cara de quem vende — a perna que o E92 já tinha matado no
 * `mensagemApi` e que sobreviveu escondida no componente COMPARTILHADO.
 */
describe("S15/<Erro> — o que a tela mostra quando a busca falha", () => {
  /**
   * **Escrevi este teste errado duas vezes, e as duas correções são a régua.**
   *
   * Esperei "Falha inesperada" (o fallback que a chamada passa) para um `Error`
   * cru. Não é: `mensagemApi` trata `Error` que NÃO veio da API como sistema
   * mudo — rede caída, DNS, parse — e devolve *"Não consegui falar com o
   * sistema"*. O fallback é para o erro da API sem código conhecido, que é
   * outra coisa.
   */
  it("erro sem código vira frase de gente, nunca a mensagem do Error", () => {
    render(<Erro titulo="Não deu para carregar os vestidos" erro={new Error("HTTP 404 Not Found")} />);

    expect(screen.getByText("Não deu para carregar os vestidos")).toBeInTheDocument();
    expect(screen.getByText(/Não consegui falar com o sistema/)).toBeInTheDocument();
    // O texto do protocolo não chega à tela — é o defeito que o componente
    // nasceu consertando.
    expect(screen.queryByText(/HTTP 404/)).not.toBeInTheDocument();
  });

  /**
   * A segunda: o corpo do erro é `err.data`, não `err.response.data`. O cliente
   * gerado já desembrulha a resposta antes de o erro chegar à tela, e um teste
   * com a forma do axios passaria a testar um caso que não existe.
   */
  it("o dicionário da tela ganha do texto genérico, quando o código bate", () => {
    render(
      <Erro
        titulo="Não deu para carregar"
        erro={{ data: { error: "LOJA_SEM_ACESSO" } }}
        mensagens={{ LOJA_SEM_ACESSO: "Você não tem acesso a esta loja." }}
      />,
    );
    expect(screen.getByText("Você não tem acesso a esta loja.")).toBeInTheDocument();
  });

  it("sem dicionário, o `detalhe` do servidor é o que a pessoa lê", () => {
    render(<Erro titulo="Não deu" erro={{ data: { error: "X", detalhe: "Este contrato já possui carnê" } }} />);
    expect(screen.getByText("Este contrato já possui carnê")).toBeInTheDocument();
  });

  it("sem saída oferecida, não há botão — e com ela, o clique chega", async () => {
    const { unmount } = render(<Erro titulo="Falhou" />);
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    unmount();

    const tentar = vi.fn();
    render(<Erro titulo="Falhou" onTentarNovamente={tentar} />);
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(tentar).toHaveBeenCalledOnce();
  });
});

/**
 * O `<Vazio>` guarda a régua escrita uma vez: **toda mensagem de vazio diz por
 * que está vazia e qual é o próximo passo**. O `acao` é opcional porque há
 * vazios sem saída honesta — um filtro que não casou não tem botão, tem filtro
 * para limpar.
 */
describe("S15/<Vazio> — o vazio que diz o próximo passo", () => {
  it("mostra o motivo, e a ação quando ela existe", () => {
    render(
      <Vazio
        titulo="Nenhum vestido no acervo"
        descricao="Cadastre a primeira peça para começar a indicar."
        acao={<button>Cadastrar vestido</button>}
      />,
    );
    expect(screen.getByText("Nenhum vestido no acervo")).toBeInTheDocument();
    expect(screen.getByText(/Cadastre a primeira peça/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar vestido" })).toBeInTheDocument();
  });

  it("vazio sem saída honesta não inventa botão", () => {
    render(<Vazio titulo="Nada nesta busca" descricao="Tente outro nome." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
