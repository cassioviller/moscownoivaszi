// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter, useSearchParams } from "react-router";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { comFiltros } from "./filtro-url";
import { resolverIntervalo } from "./financeiro/datas";
import { esquecerFrameDaUrl, useEscritaNaUrl } from "@/hooks/use-escrita-na-url";

/**
 * S-RM17 (E261) — **a janela não alarga sozinha.**
 *
 * O E260 achou o defeito CAUSANDO-o: dois `fill()` seguidos nos campos De e Até
 * da folha declararam `2024-04-04..2026-08-01` à contabilidade e carimbaram
 * **302 recebimentos** de verdade no `heliumdb`, restaurados por SQL depois.
 *
 * O mecanismo tem duas metades, e nenhuma das duas é dano sozinha:
 *
 * 1. **A perda.** O handler monta o próximo `URLSearchParams` a partir do
 *    `searchParams` da RENDERIZAÇÃO em que nasceu. Duas edições no mesmo frame
 *    leem o mesmo objeto velho, e a segunda escrita não contém o que a primeira
 *    pôs — `?ini=2024-04-04` seguido de `?fim=2024-04-04` some com o `ini`. Com
 *    400 ms entre as duas, os dois sobrevivem: o defeito é do frame, e é por
 *    isso que ninguém o via clicando devagar.
 *
 * 2. **O alargamento.** `resolverIntervalo` (`financeiro-core/src/datas.ts:188`)
 *    TROCA as pontas quando `ini > fim`. Perdido o `ini`, ele volta ao primeiro
 *    dia do mês corrente, fica maior que o `fim` recém-digitado, e a troca
 *    devolve uma janela de dois anos e quatro meses.
 *
 * **E o conserto que o diagnóstico prescrevia não conserta.** O terceiro teste
 * daqui é o que mede isso: o updater funcional de `setSearchParams`, que a
 * assinatura de tipos promete ler no momento da aplicação, recebe na verdade o
 * `searchParams` da renderização (`react-router/dist/development/chunk-KS7C4IRE.mjs:10854`).
 * Quem lê a URL do momento certo é o `useEscritaNaUrl`, e é por isso que ele
 * existe.
 */

const DIA = "2024-04-04";
const HOJE = "2026-08-17";

/** A tela como era: o handler fecha sobre o `searchParams` da renderização. */
function JanelaCrua() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <Campos
      aoMudar={(patch) => {
        const proximo = new URLSearchParams(searchParams);
        for (const [chave, valor] of Object.entries(patch)) {
          if (valor) proximo.set(chave, valor);
          else proximo.delete(chave);
        }
        setSearchParams(proximo, { replace: true });
      }}
    />
  );
}

/** O conserto que o diagnóstico prescrevia: o updater funcional do react-router. */
function JanelaComUpdaterDoRouter() {
  const [, setSearchParams] = useSearchParams();
  return (
    <Campos
      aoMudar={(patch) => setSearchParams((atual) => comFiltros(atual, patch), { replace: true })}
    />
  );
}

/** A tela como ficou. */
function JanelaViva() {
  const [, escrever] = useEscritaNaUrl();
  return <Campos aoMudar={(patch) => escrever((atual) => comFiltros(atual, patch), { replace: true })} />;
}

function Campos({ aoMudar }: { aoMudar: (patch: Record<string, string>) => void }) {
  return (
    <div>
      <label>
        De
        <input type="date" onChange={(e) => aoMudar({ ini: e.target.value })} />
      </label>
      <label>
        Até
        <input type="date" onChange={(e) => aoMudar({ fim: e.target.value })} />
      </label>
    </div>
  );
}

function montar(Tela: () => React.JSX.Element, entrada = "/folha") {
  const roteador = createMemoryRouter([{ path: "/folha", element: <Tela /> }], {
    initialEntries: [entrada],
  });
  render(<RouterProvider router={roteador} />);
  return roteador;
}

/** Os dois campos preenchidos DENTRO do mesmo frame — o gesto humano. */
function preencherAsDuasPontas() {
  const de = screen.getByLabelText("De");
  const ate = screen.getByLabelText("Até");
  act(() => {
    fireEvent.change(de, { target: { value: DIA } });
    fireEvent.change(ate, { target: { value: DIA } });
  });
}

const buscaDe = (roteador: ReturnType<typeof montar>) =>
  new URLSearchParams(roteador.state.location.search);

afterEach(() => esquecerFrameDaUrl());

describe("S-RM17 — duas pontas editadas no mesmo frame", () => {
  it("o hook guarda as DUAS: a janela é de um dia, e é a digitada", () => {
    const roteador = montar(JanelaViva);
    preencherAsDuasPontas();

    const busca = buscaDe(roteador);
    expect(busca.get("ini")).toBe(DIA);
    expect(busca.get("fim")).toBe(DIA);

    // E é esta a janela que o botão de mão única usaria.
    expect(resolverIntervalo(busca.get("ini"), busca.get("fim"), HOJE)).toEqual({
      iniYMD: DIA,
      fimYMD: DIA,
    });
  });

  it("a forma antiga perde a primeira ponta, e a troca de pontas a transforma em dois anos", () => {
    const roteador = montar(JanelaCrua);
    preencherAsDuasPontas();

    const busca = buscaDe(roteador);
    // O `ini` da primeira escrita não sobreviveu à segunda: o handler leu o
    // `searchParams` de antes das duas. É a URL que a sonda do E260 imprimiu no
    // navegador de verdade.
    expect(busca.get("ini")).toBeNull();
    expect(busca.get("fim")).toBe(DIA);

    // E aqui a perda vira dinheiro: sem `ini`, o resolvedor cai no 1º dia do mês
    // corrente (2026-08-01), que é MAIOR que o fim digitado, e troca as pontas.
    expect(resolverIntervalo(busca.get("ini"), busca.get("fim"), HOJE)).toEqual({
      iniYMD: "2024-04-04",
      fimYMD: "2026-08-01",
    });
  });

  it("o updater funcional do react-router perde IGUAL — a prescrição do diagnóstico não conserta", () => {
    // `setSearchParams` é um `useCallback` com `[navigate, searchParams]`, e
    // entrega ao updater `new URLSearchParams(searchParams)` — o da renderização.
    // A assinatura de tipos promete o momento da aplicação; a implementação não.
    const roteador = montar(JanelaComUpdaterDoRouter);
    preencherAsDuasPontas();

    const busca = buscaDe(roteador);
    expect(busca.get("ini")).toBeNull();
    expect(busca.get("fim")).toBe(DIA);
  });

  it("com um frame entre as duas, a forma antiga acerta — o defeito é do frame", () => {
    // É por isso que ele atravessou duas passadas de review: quem clica devagar
    // nunca o vê, e o E2E que o achou foi o primeiro a digitar rápido.
    const roteador = montar(JanelaCrua);
    act(() => {
      fireEvent.change(screen.getByLabelText("De"), { target: { value: DIA } });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: DIA } });
    });

    const busca = buscaDe(roteador);
    expect(busca.get("ini")).toBe(DIA);
    expect(busca.get("fim")).toBe(DIA);
  });

  it("o parâmetro de quem não escreve atravessa intacto", () => {
    const roteador = montar(JanelaViva, "/folha?filtro=vencidas");
    preencherAsDuasPontas();

    const busca = buscaDe(roteador);
    expect(busca.get("filtro")).toBe("vencidas");
    expect(busca.get("ini")).toBe(DIA);
    expect(busca.get("fim")).toBe(DIA);
  });

  it("navegar por fora reinicia o acumulador — a URL é a verdade, não o que pedimos", async () => {
    const roteador = montar(JanelaViva);
    preencherAsDuasPontas();
    expect(buscaDe(roteador).get("ini")).toBe(DIA);

    await act(async () => {
      await roteador.navigate("/folha?fim=2025-01-31");
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2025-01-01" } });
    });

    const busca = buscaDe(roteador);
    expect(busca.get("ini")).toBe("2025-01-01");
    expect(busca.get("fim")).toBe("2025-01-31");
  });
});

/**
 * DUAS instâncias do hook na mesma tela, que é o retrato de `noivas/index.tsx`:
 * a tela escreve `etapa` e o `useBuscaNaUrl` escreve `q`, cada um com o seu
 * `useSearchParams`. Um acumulador POR COMPONENTE deixaria as duas se
 * atropelando — foi por isso que o acumulador ficou no módulo.
 */
function DoisEscritores() {
  const [, escreverA] = useEscritaNaUrl();
  const [, escreverB] = useEscritaNaUrl();
  return (
    <div>
      <button onClick={() => escreverA((p) => comFiltros(p, { etapa: "PROVA" }), { replace: true })}>
        etapa
      </button>
      <button onClick={() => escreverB((p) => comFiltros(p, { q: "mariana" }), { replace: true })}>
        busca
      </button>
    </div>
  );
}

describe("dois escritores independentes no mesmo frame", () => {
  it("os dois parâmetros sobrevivem, e nenhum é de quem escreveu por último", () => {
    const roteador = montar(DoisEscritores);
    act(() => {
      fireEvent.click(screen.getByText("etapa"));
      fireEvent.click(screen.getByText("busca"));
    });

    const busca = buscaDe(roteador);
    expect(busca.get("etapa")).toBe("PROVA");
    expect(busca.get("q")).toBe("mariana");
  });
});

/**
 * Regra 30 — a consolidação de régua duplicada se prova, não se argumenta.
 *
 * As três cópias de `atualizarParams` (folha `:316`, pagar `:195`, receber
 * `:153`) eram idênticas BYTE A BYTE, e todas as três passaram a delegar ao
 * `comFiltros`, que já era a gramática de escrita da casa em 18 sítios (E129).
 * A diferença de forma é real — uma varre `Object.entries` e testa `if (valor)`,
 * a outra normaliza para texto e testa `=== ""` — e é por isso que a
 * equivalência é medida sobre a população de entradas que as telas produzem.
 */
describe("a régua antiga e a nova dão a MESMA URL", () => {
  const antiga = (base: URLSearchParams, patch: Record<string, string>) => {
    const proximo = new URLSearchParams(base);
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
    }
    return proximo;
  };

  const casos: Array<[string, Record<string, string>]> = [
    // Os patches que as três telas escrevem, um a um.
    ["", { ini: DIA }],
    ["", { fim: DIA }],
    ["ini=2026-08-01&fim=2026-08-31", { ini: DIA }],
    ["ini=2026-08-01&fim=2026-08-31", { filtro: "vencidas" }],
    ["ini=2026-08-01&fim=2026-08-31&filtro=vencidas", { ini: "", fim: "", filtro: "" }],
    ["filtro=vencidas", { fim: "2026-11-30" }],
    // A competência escreve as DUAS pontas num patch só (folha `:313`).
    ["ini=2026-08-01&fim=2026-08-31", { ini: "2026-07-01", fim: "2026-07-31" }],
    // E o que a tela não escreve atravessa nos dois.
    ["pagina=3&q=mariana", { ini: DIA, fim: DIA }],
  ];

  it.each(casos)("sobre ?%s, o patch %o produz a mesma URL", (base, patch) => {
    expect(comFiltros(new URLSearchParams(base), patch).toString()).toBe(
      antiga(new URLSearchParams(base), patch).toString(),
    );
  });
});

/**
 * A régua. Os testes acima provam o mecanismo sobre componentes deste arquivo; o
 * que impede a fresta de voltar às telas é esta varredura, na forma que o
 * `use-confirmar-saida.test.tsx` fixou: enumera o fonte versionado e cobra UMA
 * grafia.
 *
 * A régua tem duas metades porque o defeito tem duas: `useSearchParams` do
 * `react-router` não pode ser chamado direto nas telas (o setter dele lê a URL
 * velha), e a escrita é sempre por updater (passar um objeto pronto perde o que
 * a tela não conhece).
 */
describe("a escrita na URL passa pelo hook, e a varredura cobra isso", () => {
  const raiz = path.resolve(import.meta.dirname, "../../../..");
  const fontes = () =>
    execFileSync("git", ["ls-files", "-z", "*.ts", "*.tsx"], {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\0")
      .filter((p) => p.startsWith("artifacts/moscow-noivas/src/"))
      .filter((p) => !p.endsWith("escrita-na-url.test.tsx"))
      // A única casa do `useSearchParams` cru é o hook que o conserta.
      .filter((p) => !p.endsWith("hooks/use-escrita-na-url.ts"));

  it("nenhuma tela tira o ESCRITOR do useSearchParams do react-router", () => {
    // Ler é legítimo — `const [searchParams] = useSearchParams()` devolve os
    // params daquela renderização, que é o que a tela desenha, e há dois sítios
    // assim (`agenda/index.tsx:48`, `atendimentos/novo.tsx:123`). O que a régua
    // proíbe é tirar dali o SEGUNDO elemento: esse escritor lê a URL velha.
    const foraDaRegua: string[] = [];
    for (const rel of fontes()) {
      const fonte = readFileSync(path.resolve(raiz, rel), "utf8");
      for (const m of fonte.matchAll(/\[[^\]\n]*,[^\]\n]*\]\s*=\s*useSearchParams\(/g)) {
        const linha = fonte.slice(0, m.index).split("\n").length;
        foraDaRegua.push(`${rel}:${linha} — ${m[0].trim()}`);
      }
    }
    expect(foraDaRegua).toEqual([]);
  });

  it("toda escrita na URL recebe um updater, e são os 31 sítios de hoje", () => {
    const arquivos = fontes();
    expect(arquivos.length).toBeGreaterThan(50);

    // `escrever(` seguido de `(ident) =>`, com quebra de linha no meio permitida
    // — é como o `dre.tsx` e o `cobranca.tsx` já escreviam.
    const funcional = /^\s*\(\s*\w*\s*\)\s*=>/;
    const foraDaRegua: string[] = [];
    let sitios = 0;
    for (const rel of arquivos) {
      const fonte = readFileSync(path.resolve(raiz, rel), "utf8");
      const linhas = fonte.split("\n");
      for (const m of fonte.matchAll(/setSearchParams\(/g)) {
        sitios += 1;
        const depois = fonte.slice(m.index + m[0].length, m.index + m[0].length + 40);
        if (funcional.test(depois)) continue;
        const linha = fonte.slice(0, m.index).split("\n").length;
        foraDaRegua.push(
          `${rel}:${linha} — ${linhas[linha - 1].trim().slice(0, 70)}`,
        );
      }
    }

    // Os 31 sítios de hoje — um deles é a grafia CITADA no docblock do
    // `filtro-url.ts`, e ela também tem de estar certa, que é o exemplo que
    // alguém copia. Se nascer um trigésimo segundo, ele usa o updater ou
    // aparece aqui.
    expect(sitios).toBe(31);
    expect(foraDaRegua).toEqual([]);
  });

  /**
   * **S-RM29 (E265) — a suposição do acumulador vira régua.**
   *
   * O acumulador do frame vive no MÓDULO (`use-escrita-na-url.ts:52-54`), e
   * isso supõe **um roteador por contexto de JS**. A suposição é verdadeira
   * hoje e estava escrita só num comentário; comentário não reprova. Se
   * nascer um segundo roteador de produção, dois trechos da árvore passam a
   * disputar o mesmo `acumulado` — o hook se cura no primeiro render em que a
   * URL real difere da última pedida, mas as escritas do MESMO frame vindas
   * dos dois roteadores se atropelam, que é exatamente o que ele existe para
   * impedir.
   *
   * A régua não proíbe o segundo roteador: ela obriga quem o criar a passar
   * por aqui e decidir o que fazer com o acumulador.
   */
  it("o app tem UM roteador, que é o que o acumulador do frame supõe", () => {
    const criacoes: string[] = [];
    for (const rel of fontes()) {
      // Teste monta o roteador que quiser: `createMemoryRouter` é a régua deste
      // próprio arquivo em oito sítios. Quem carrega a suposição é a PRODUÇÃO.
      if (/\.test\.tsx?$/.test(rel)) continue;
      const fonte = readFileSync(path.resolve(raiz, rel), "utf8");
      // O comentário não cria roteador nenhum, e cobrá-lo é a S-RM30 de novo:
      // `use-confirmar-saida.ts:27` narra o dia em que o `App.tsx` virou
      // `createBrowserRouter(...)`, e a régua leria a narrativa como código. As
      // posições são preservadas para a âncora continuar apontando o lugar
      // certo do arquivo.
      const semComentario = fonte
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
      for (const m of semComentario.matchAll(/\bcreate(Browser|Hash|Memory)Router\s*\(/g)) {
        const linha = semComentario.slice(0, m.index).split("\n").length;
        criacoes.push(`${rel}:${linha} — ${m[0].trim()}`);
      }
    }
    expect(criacoes).toEqual(["artifacts/moscow-noivas/src/App.tsx:356 — createBrowserRouter("]);
  });
});
