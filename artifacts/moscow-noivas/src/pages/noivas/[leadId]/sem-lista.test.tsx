// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "@workspace/api-client-react";
import { SemLista } from "./sem-lista";
import { estadoDoCard } from "@/lib/estado-consulta";
import { podeNoModulo, type Acessos } from "@/lib/permissoes";

/**
 * S-C120 — **a ficha afirmava à Recepção que a noiva não tem contrato.**
 *
 * O caminho inteiro, do perfil SEMEADO à frase desenhada. É o cuidado que o
 * plano pediu: *"o teste tem de encenar a Recepção de verdade, não um 403
 * fabricado"* — um 403 de `activeLojaId` errado é indistinguível de um 403 de
 * perfil pelo status, então o que separa os dois é o gate do cliente, e o gate
 * do cliente só vale se o perfil vier de onde o seed o escreve.
 *
 * Por isso os acessos saem de `configuracao-inicial.ts`, lido do disco, no
 * formato do `varredura-manuais.test.ts` (E184). Trocar `contratos: NADA` por
 * qualquer coisa lá reprova aqui — e é o que se quer: o dia em que a dona der
 * contrato à Recepção, esta expectativa cai e alguém a lê.
 */

const RAIZ = path.resolve(__dirname, "../../../../../..");
const PERFIS = "artifacts/api-server/src/lib/configuracao-inicial.ts";

const CONSTANTES: Record<string, { ver: boolean; criar: boolean; editar: boolean }> = {
  TUDO: { ver: true, criar: true, editar: true },
  SO_VER: { ver: true, criar: false, editar: false },
  VER_E_CRIAR: { ver: true, criar: true, editar: false },
  NADA: { ver: false, criar: false, editar: false },
};

/** Os acessos de um perfil SEMEADO, no formato em que o `/auth/me` os entrega. */
function acessosSemeados(nome: string): Acessos {
  const fonte = readFileSync(path.join(RAIZ, PERFIS), "utf8");
  for (const m of fonte.matchAll(/nome:\s*"([^"]+)"[\s\S]{0,200}?acessos:\s*\{([^}]+)\}/g)) {
    if (m[1] !== nome) continue;
    const acessos: Record<string, unknown> = {};
    for (const par of m[2]!.matchAll(/(\w+):\s*(\w+)/g)) {
      const valor = CONSTANTES[par[2]!];
      // Constante nova sem tradução aqui vira erro alto, não permissão calada.
      if (!valor) throw new Error(`acesso desconhecido no seed: ${par[2]}`);
      acessos[par[1]!] = valor;
    }
    return acessos;
  }
  throw new Error(`perfil não encontrado no seed: ${nome}`);
}

/** Uma consulta que o react-query deixa DESLIGADA — o gate não a disparou. */
const DESLIGADA = { isLoading: false, isError: false };
const RESPONDEU = { isLoading: false, isError: false };

/** Um erro da API igual ao que o `custom-fetch` levanta (o mesmo do E4). */
function erroApi(status: number): ApiError {
  const resposta = new Response(null, { status, statusText: "Erro" });
  return new ApiError(resposta, null, { method: "GET", url: "/lojas/l1/contratos" });
}

describe("S-C120 — a Recepção lê por que não vê, e não que não há", () => {
  it("o perfil semeado da Recepção não vê contratos e VÊ orçamentos", () => {
    const recepcao = acessosSemeados("Recepção");
    // O E172, medido: contrato NADA (ela não fecha), orçamento SO_VER (ela lê
    // para responder ao telefone e não move).
    expect(podeNoModulo(recepcao, "contratos", "ver")).toBe(false);
    expect(podeNoModulo(recepcao, "orcamentos", "ver")).toBe(true);
    expect(podeNoModulo(recepcao, "leads", "ver")).toBe(true);
  });

  it("com o contrato fechado, a ficha da Recepção NÃO diz 'Nenhum contrato ainda.'", () => {
    const recepcao = acessosSemeados("Recepção");
    const estado = estadoDoCard(podeNoModulo(recepcao, "contratos", "ver"), DESLIGADA);

    /**
     * **VERMELHO ANTES** (com `estadoDoCard` devolvendo "pronto" para consulta
     * desligada, que é o que `estadoDasConsultas` fazia e o que a tela usava):
     *
     *     AssertionError: expected 'pronto' to be 'sem-permissao'
     *
     * e, na tela, `expected null not to be null` no `contratos-da-ficha-sem-
     * permissao` enquanto `contratos-da-ficha-vazio` desenhava a frase
     * "Nenhum contrato ainda." para a noiva que TEM contrato ativo.
     */
    expect(estado).toBe("sem-permissao");

    render(
      <SemLista
        estado={estado}
        oQue="os contratos"
        vazio="Nenhum contrato ainda."
        testid="contratos-da-ficha"
      />,
    );
    expect(screen.queryByText("Nenhum contrato ainda.")).not.toBeInTheDocument();
    expect(screen.getByTestId("contratos-da-ficha-sem-permissao")).toHaveTextContent(
      "Você não tem permissão para ver os contratos desta noiva.",
    );
  });

  it("o card de Orçamentos, que a Recepção VÊ, continua dizendo o vazio", () => {
    const recepcao = acessosSemeados("Recepção");
    const estado = estadoDoCard(podeNoModulo(recepcao, "orcamentos", "ver"), RESPONDEU);
    expect(estado).toBe("pronto");

    render(
      <SemLista
        estado={estado}
        oQue="os orçamentos"
        vazio="Nenhum orçamento ainda."
        testid="orcamentos-da-ficha"
      />,
    );
    // A frase de vazio é um FATO aqui: a consulta rodou e voltou sem nada.
    expect(screen.getByTestId("orcamentos-da-ficha-vazio")).toHaveTextContent(
      "Nenhum orçamento ainda.",
    );
  });

  it("a Costureira não vê nenhum dos dois — o mesmo mecanismo, outro perfil", () => {
    const costureira = acessosSemeados("Costureira");
    for (const modulo of ["contratos", "orcamentos"]) {
      expect(podeNoModulo(costureira, modulo, "ver")).toBe(false);
      expect(estadoDoCard(podeNoModulo(costureira, modulo, "ver"), DESLIGADA)).toBe(
        "sem-permissao",
      );
    }
  });

  it("a Vendedora vê os dois — o gate não pode fechar quem trabalha", () => {
    const vendedora = acessosSemeados("Vendedora");
    expect(estadoDoCard(podeNoModulo(vendedora, "contratos", "ver"), RESPONDEU)).toBe("pronto");
    expect(estadoDoCard(podeNoModulo(vendedora, "orcamentos", "ver"), RESPONDEU)).toBe("pronto");
  });

  it("403 do SERVIDOR diz a mesma frase — a loja errada na sessão, o perfil mudado no meio", () => {
    // O gate do cliente aprovou (a Vendedora vê contratos) e o servidor recusou
    // assim mesmo. Indistinguível de um 403 de perfil pelo status, e não precisa
    // ser distinguido: a frase honesta é a mesma.
    const erro = erroApi(403);
    const estado = estadoDoCard(true, { isLoading: false, isError: true, error: erro });
    expect(estado).toBe("sem-permissao");

    render(
      <SemLista
        estado={estado}
        oQue="os contratos"
        vazio="Nenhum contrato ainda."
        erro={erro}
        testid="contratos-da-ficha"
      />,
    );
    expect(screen.queryByText("Nenhum contrato ainda.")).not.toBeInTheDocument();
  });

  it("500 NÃO vira 'nenhum' nem 'sem permissão' — vira a frase do E92", () => {
    const erro = erroApi(500);
    const estado = estadoDoCard(true, { isLoading: false, isError: true, error: erro });
    expect(estado).toBe("erro");

    render(
      <SemLista
        estado={estado}
        oQue="os contratos"
        vazio="Nenhum contrato ainda."
        erro={erro}
        testid="contratos-da-ficha"
      />,
    );
    expect(screen.queryByText("Nenhum contrato ainda.")).not.toBeInTheDocument();
    expect(screen.getByTestId("contratos-da-ficha-erro")).toHaveTextContent(
      "Não consegui falar com o sistema",
    );
  });
});

/**
 * A segunda perna: a ficha PEDE o módulo certo, e as duas consultas param de
 * sair para quem não o tem.
 *
 * É o formato do `dinheiro-miudo-varredura.test.ts:139` — ler a fonte. Um teste
 * de componente prega o que o `SemLista` faz com o estado que recebe; quem
 * garante que a ficha calcula esse estado é isto aqui. Sem ele, o conserto
 * poderia viver inteiro no componente e a tela seguir chamando a porta fechada.
 */
describe("S-C120 — a ficha gateia os dois cards pelo módulo que o servidor guarda", () => {
  const ficha = readFileSync(path.join(__dirname, "index.tsx"), "utf8");

  it("pergunta por contratos.ver e por orcamentos.ver", () => {
    expect(ficha).toMatch(/podeNoModulo\(\s*acessosModulos\s*,\s*"contratos"\s*,\s*"ver"\s*\)/);
    expect(ficha).toMatch(/podeNoModulo\(\s*acessosModulos\s*,\s*"orcamentos"\s*,\s*"ver"\s*\)/);
  });

  it("desliga as duas consultas com esses gates", () => {
    expect(ficha).toMatch(/enabled:.*&&\s*podeVerOrcamentos/);
    expect(ficha).toMatch(/enabled:.*&&\s*podeVerContratos/);
  });

  it("nenhum dos dois cards volta a afirmar o vazio direto do `?? []`", () => {
    // O `?? []` continua e continua certo — o que não pode voltar é a frase
    // pendurada só no `length === 0`, sem o estado antes.
    expect(ficha).not.toMatch(/orcamentosDaNoiva\.length === 0 \? \(\s*<p/);
    expect(ficha).not.toMatch(/contratosDaNoiva\.length === 0 \? \(\s*<p/);
    expect(ficha).toMatch(/estadoOrcamentos !== "pronto" \|\| orcamentosDaNoiva\.length === 0/);
    expect(ficha).toMatch(/estadoContratos !== "pronto" \|\| contratosDaNoiva\.length === 0/);
  });
});
