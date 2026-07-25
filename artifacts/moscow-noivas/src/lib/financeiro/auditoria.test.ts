import { describe, expect, it } from "vitest";
import type { AuditoriaItem } from "@workspace/api-client-react";
import { acaoFiltravel, destinoDaLinha, resumoDetalhe } from "./auditoria";

/**
 * E47 — o núcleo da trilha. O que precisa de prova aqui é a régua do
 * deep-link: só vira link quando o destino MOSTRA a entidade da linha. Link
 * que erra o alvo gasta a confiança de quem clicou e não volta a ser clicado.
 */

const linha = (over: Partial<AuditoriaItem>): AuditoriaItem =>
  ({
    id: "a-1",
    acao: "PARCELA_RECEBIDA",
    entidade: "parcela",
    entidadeId: "parc-1",
    usuarioId: "u-1",
    usuarioNome: "Maria",
    detalhe: null,
    criadoEm: "2026-07-21T14:32:00.000Z",
    ...over,
  }) as AuditoriaItem;

const LOJA = "loja-9";

describe("destinoDaLinha", () => {
  it("contrato aponta para a própria ficha, pelo id da linha", () => {
    const d = destinoDaLinha(linha({ entidade: "contrato", entidadeId: "ctr-7" }), LOJA);
    expect(d).toEqual({ href: "/loja/loja-9/contratos/ctr-7", rotulo: "Ver contrato" });
  });

  it("parcela usa o contratoId do detalhe — é lá que a parcela aparece", () => {
    const d = destinoDaLinha(linha({ detalhe: { contratoId: "ctr-3", valorRecebido: 500 } }), LOJA);
    expect(d?.href).toBe("/loja/loja-9/contratos/ctr-3");
  });

  it("parcela SEM contratoId no detalhe não vira link", () => {
    // O id da parcela sozinho não abre tela nenhuma: mandar para a ficha
    // errada (ou para lugar nenhum) é pior do que não oferecer o link.
    expect(destinoDaLinha(linha({ detalhe: { valorRecebido: 500 } }), LOJA)).toBeNull();
    expect(destinoDaLinha(linha({ detalhe: null }), LOJA)).toBeNull();
    expect(destinoDaLinha(linha({ detalhe: { contratoId: "" } }), LOJA)).toBeNull();
  });

  it("conta a pagar e pagamento caem na tela que lista as duas", () => {
    const conta = destinoDaLinha(linha({ acao: "CONTA_PAGA", entidade: "conta_pagar" }), LOJA);
    const pag = destinoDaLinha(linha({ acao: "PAGAMENTO_REGISTRADO", entidade: "pagamento" }), LOJA);
    expect(conta?.href).toBe("/loja/loja-9/financeiro/pagar");
    expect(pag?.href).toBe("/loja/loja-9/financeiro/pagar");
  });

  it("entidade desconhecida não vira link — nada de chute", () => {
    // Entidade nova nasce no servidor; tela velha não pode inventar destino.
    expect(destinoDaLinha(linha({ entidade: "orcamento" }), LOJA)).toBeNull();
  });
});

describe("acaoFiltravel", () => {
  it("aceita as ações da união fechada", () => {
    expect(acaoFiltravel("CONTA_PAGA")).toBe("CONTA_PAGA");
  });

  it("descarta o que não conhece — URL editável não pode virar 400", () => {
    expect(acaoFiltravel("XPTO")).toBeUndefined();
    expect(acaoFiltravel("")).toBeUndefined();
    expect(acaoFiltravel(null)).toBeUndefined();
  });
});

describe("resumoDetalhe", () => {
  it("junta valor, descrição e competência em uma frase", () => {
    const r = resumoDetalhe(
      linha({ detalhe: { valorPago: 1234.5, descricao: "Aluguel", competencia: "2026-07" } }),
    );
    // O espaço entre R$ e o número é RÍGIDO (U+00A0) desde o E92: brl() é a
    // régua única do dinheiro e o navegador não pode quebrar linha ali.
    expect(r).toBe("R$\u00a01.234,50 · Aluguel · competência 2026-07");
  });

  it("sem nada reconhecível, não inventa frase", () => {
    expect(resumoDetalhe(linha({ detalhe: { contratoId: "ctr-1" } }))).toBeNull();
    expect(resumoDetalhe(linha({ detalhe: null }))).toBeNull();
  });
});
