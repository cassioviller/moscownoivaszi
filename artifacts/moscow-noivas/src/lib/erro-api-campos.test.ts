import { describe, expect, it, vi } from "vitest";
import { aplicarErroDoServidor, camposDoErro, mensagemApi } from "./erro-api";

/**
 * E96/D6 — o erro do servidor chega ao campo que o causou.
 *
 * Antes, todo 400/422 virava toast: a mensagem no canto da tela e o input
 * errado sem marca nenhuma. No diálogo de gerar contrato era pior — ele
 * continua aberto POR CIMA do toast.
 */
const erroCom = (campos: { campo: string; motivo: string }[], codigo = "CORPO_INVALIDO") =>
  ({ data: { error: codigo, campos } });

function formFalso(valores: Record<string, unknown>) {
  return {
    setError: vi.fn(),
    getValues: () => valores,
    marcados: function (this: { setError: ReturnType<typeof vi.fn> }) {
      return this.setError.mock.calls.map(([campo, erro]) => [campo, erro.message]);
    },
  };
}

describe("camposDoErro", () => {
  it("lê os campos do corpo e ignora lixo", () => {
    expect(camposDoErro(erroCom([{ campo: "valorTotal", motivo: "Não bate" }]))).toEqual([
      { campo: "valorTotal", motivo: "Não bate" },
    ]);
    expect(camposDoErro({ data: { error: "X" } })).toEqual([]);
    expect(camposDoErro(new Error("rede"))).toEqual([]);
    expect(camposDoErro(undefined)).toEqual([]);
  });
});

describe("aplicarErroDoServidor", () => {
  it("marca o campo e devolve true — a tela NÃO abre toast", () => {
    const form = formFalso({ entrada: "0", numParcelas: "6" });
    const aplicou = aplicarErroDoServidor(form, erroCom([{ campo: "entrada", motivo: "As parcelas somam 800" }]));

    expect(aplicou).toBe(true);
    expect(form.setError).toHaveBeenCalledWith("entrada", {
      type: "server",
      message: "As parcelas somam 800",
    });
  });

  it("caminho aninhado do Zod é o caminho do react-hook-form", () => {
    const form = formFalso({ itens: [{ valorUnitario: "" }] });
    expect(aplicarErroDoServidor(form, erroCom([{ campo: "itens.0.valorUnitario", motivo: "Valor inválido" }]))).toBe(true);
    expect(form.setError).toHaveBeenCalledWith("itens.0.valorUnitario", expect.objectContaining({ type: "server" }));
  });

  it("campo que este formulário não tem devolve FALSE — o recado vai para o toast", () => {
    // Marcar um input que a pessoa não está vendo esconde o recado; silenciar
    // seria pior ainda. O false é o que manda a tela falar.
    const form = formFalso({ entrada: "0" });
    expect(aplicarErroDoServidor(form, erroCom([{ campo: "vendedoraId", motivo: "Campo obrigatório" }]))).toBe(false);
    expect(form.setError).not.toHaveBeenCalled();
  });

  it("erro sem campos (regra de negócio, rede, permissão) devolve false", () => {
    const form = formFalso({ entrada: "0" });
    expect(aplicarErroDoServidor(form, { data: { error: "JA_TEM_CONTRATO" } })).toBe(false);
    expect(aplicarErroDoServidor(form, new Error("offline"))).toBe(false);
  });

  it("e o toast que sobra fala português, não protocolo", () => {
    const dicionario = { JA_TEM_CONTRATO: "Este orçamento já virou contrato." };
    expect(mensagemApi({ data: { error: "JA_TEM_CONTRATO" } }, "Tente novamente.", dicionario)).toBe(
      "Este orçamento já virou contrato.",
    );
  });
});
