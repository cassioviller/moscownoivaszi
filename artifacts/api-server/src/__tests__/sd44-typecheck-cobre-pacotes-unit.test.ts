import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-D44 — todo pacote com TypeScript versionado tem typecheck que RODA.
 *
 * A fresta nasceu três vezes com a mesma cara: `e2e/` (63 arquivos, S-D23),
 * `scripts/` (`60adc7c`) e `lib/api-spec` (1 arquivo — o que configura o
 * codegen que já apagou `generated/` ao falhar, E142). O mecanismo comum é o
 * `--if-present` da raiz: ele acerta o pacote sem script `typecheck` e **não
 * faz nada, em silêncio** — a linha de comando parece cobrir tudo e a
 * cobertura real depende de cada pacote ter lembrado de declarar o script.
 *
 * Esta varredura casa as duas pontas pelo que está ESCRITO: a lista de
 * pacotes do workspace (pelo versionamento, S-D30) contra quem de fato é
 * alcançado — ou pelas `references` do `tsc --build` da raiz, ou por um
 * script `typecheck` que os filtros do `pnpm run typecheck` alcançam. Pacote
 * novo com `.ts` e sem cobertura reprova AQUI, não no dia em que o erro de
 * tipo chegar ao runtime.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

type Pacote = { dir: string; nome: string; temScriptTypecheck: boolean; temTs: boolean };

/** As duas pontas saem do versionamento — uma passada única de `git ls-files`. */
function pacotes(): Pacote[] {
  const arquivos = arquivosVersionados(RAIZ, ["artifacts", "lib", "scripts"]);
  const dirs = arquivos
    .filter((f) => f.endsWith("/package.json"))
    .map((f) => f.slice(0, -"/package.json".length));
  return dirs.map((dir) => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, dir, "package.json"), "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    const temTs = arquivos.some(
      (f) =>
        f.startsWith(dir + "/") &&
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        // O que o codegen escreve é conferido no pacote que o consome.
        !f.includes("/generated/"),
    );
    return {
      dir,
      nome: pkg.name ?? dir,
      temScriptTypecheck: typeof pkg.scripts?.typecheck === "string",
      temTs,
    };
  });
}

/** O que o `typecheck:libs` da raiz cobre: as references do tsconfig. */
function referenciasDaRaiz(): string[] {
  const cfg = JSON.parse(readFileSync(join(RAIZ, "tsconfig.json"), "utf8")) as {
    references?: { path: string }[];
  };
  return (cfg.references ?? []).map((r) => r.path.replace(/^\.\//, ""));
}

/** Os filtros do script `typecheck` da raiz, como o pnpm os lê. */
function filtrosDaRaiz(): { inclui: string[]; excluiNome: string[] } {
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = pkg.scripts.typecheck;
  const filtros = [...script.matchAll(/--filter\s+"([^"]+)"/g)].map((m) => m[1]);
  return {
    inclui: filtros.filter((f) => !f.startsWith("!")).map((f) => f.replace(/^\.\//, "")),
    excluiNome: filtros.filter((f) => f.startsWith("!")).map((f) => f.slice(1)),
  };
}

function filtroAlcanca(dir: string, inclui: string[]): boolean {
  return inclui.some((f) =>
    f.endsWith("/**") ? dir.startsWith(f.slice(0, -"/**".length) + "/") : dir === f,
  );
}

describe("S-D44 — a lista de pacotes casa com quem o typecheck alcança", () => {
  it("todo pacote com .ts versionado é alcançado por uma das duas rotas", () => {
    const refs = referenciasDaRaiz();
    const { inclui, excluiNome } = filtrosDaRaiz();

    // A exclusão por NOME é decisão documentada (S23: o custo do
    // mockup-sandbox era exatamente o typecheck, e tirá-lo dali foi
    // deliberado — o comentário mora no pnpm-workspace.yaml). Uma exclusão
    // nova não entra em silêncio: ela reprova aqui até ganhar a sua razão.
    expect(excluiNome).toEqual(["@workspace/mockup-sandbox"]);

    const descobertos: string[] = [];
    for (const p of pacotes()) {
      if (!p.temTs) continue;
      const pelaReferencia = refs.includes(p.dir);
      const peloFiltro =
        p.temScriptTypecheck && filtroAlcanca(p.dir, inclui) && !excluiNome.includes(p.nome);
      const excluidoDeProposito = excluiNome.includes(p.nome);
      if (!pelaReferencia && !peloFiltro && !excluidoDeProposito) {
        descobertos.push(`${p.dir} (${p.nome})`);
      }
    }
    expect(descobertos).toEqual([]);
  });

  it("filtro que alcança pacote sem script é o silêncio do --if-present", () => {
    const { inclui, excluiNome } = filtrosDaRaiz();
    const mudos: string[] = [];
    for (const p of pacotes()) {
      if (!p.temTs || excluiNome.includes(p.nome)) continue;
      if (filtroAlcanca(p.dir, inclui) && !p.temScriptTypecheck) {
        mudos.push(`${p.dir} — o filtro o acerta e o --if-present engole`);
      }
    }
    expect(mudos).toEqual([]);
  });

  /** Conjunto vazio aprova tudo em silêncio (S-D31). Piso medido em 2026-08-07:
   *  11 pacotes, 6 references, 2+ filtros de inclusão. */
  it("as pontas enumeradas têm população de verdade", () => {
    expect(pacotes().length).toBeGreaterThanOrEqual(10);
    expect(referenciasDaRaiz().length).toBeGreaterThanOrEqual(5);
    expect(filtrosDaRaiz().inclui.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * S-M28 (rodada 2, achado 10#1): o `e2e/` não tem package.json, então
   * `pacotes()` nunca o enxerga — ele é alcançado EXCLUSIVAMENTE pela linha
   * `typecheck:e2e` encadeada no script da raiz, e nenhum assert a defendia.
   * Apagar o `&& pnpm run typecheck:e2e` — o gesto exato que criou a fresta
   * da S-D23 — deixava esta sonda verde e os 63 arquivos de e2e/ sem
   * typecheck de novo (a S-D25 mediu 7 specs vermelhos por um erro desses).
   */
  it("o script da raiz encadeia o typecheck do e2e/ — a única rota até ele", () => {
    const raiz = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(raiz.scripts.typecheck).toContain("typecheck:e2e");
    expect(raiz.scripts["typecheck:e2e"]).toBeTruthy();
  });
});
