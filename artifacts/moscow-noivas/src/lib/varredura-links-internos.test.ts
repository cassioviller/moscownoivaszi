import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * S-O38 — todo link interno aponta uma rota que EXISTE.
 *
 * O botão "Lookbook" da barra "Atendendo…" e o da linha do atendimento em curso
 * apontavam `/noivas/:leadId/lookbook` — e essa rota nunca existiu: o lookbook é
 * um CARD da ficha da noiva, não uma tela. Os dois caíam no catch-all, e a
 * vendedora lia **"Não encontramos esta página" no meio de um atendimento**, com
 * a noiva do lado. O botão irmão "Interesses" funcionava, porque a rota dele
 * existe — e é isso que fazia o defeito passar despercebido: metade do par
 * funcionava.
 *
 * Nenhuma das duas rodadas de revisão o achou, porque as duas olharam o sistema
 * por dentro. Ele apareceu ao escrever o manual da vendedora, andando o caminho
 * dela tela a tela.
 *
 * Esta sonda pega a CLASSE, não o caso: enumera os destinos literais de todo
 * `<Link to=…>`/`navigate(…)` do frontend e confere contra as rotas declaradas
 * em `App.tsx`. Link com destino calculado em variável ela não vê — está no
 * "que ela não enxerga", abaixo.
 *
 * **Enumera com `git ls-files`** (regra da casa): 65% do que o disco devolve em
 * sessão com agentes é cópia de worktree órfão.
 */

const RAIZ = path.resolve(__dirname, "../../../..");
const SRC = "artifacts/moscow-noivas/src";

function versionados(): string[] {
  return execFileSync("git", ["ls-files", `${SRC}/**/*.tsx`, `${SRC}/**/*.ts`], {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .filter((f) => !f.includes(".test."));
}

/** `${lojaId}` e `:lojaId` viram o mesmo buraco, para os dois lados casarem. */
function normalizar(destino: string): string {
  return destino
    .split("?")[0]!
    .split("#")[0]!
    .replace(/\$\{[^}]*\}/g, ":x")
    .replace(/:[A-Za-z][A-Za-z0-9]*/g, ":x")
    .replace(/\/+$/, "");
}

/**
 * As rotas declaradas. O `App.tsx` aninha tudo que é logado sob
 * `/loja/:lojaId`, então o conjunto tem as absolutas E as de loja com o prefixo
 * montado — é assim que `/loja/${lojaId}/noivas/${id}` e o `naLoja("/noivas")`
 * caem no mesmo lugar.
 */
function rotasDeclaradas(): Set<string> {
  const fonte = readFileSync(path.join(RAIZ, SRC, "App.tsx"), "utf8");
  const paths = [...fonte.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]!);
  const rotas = new Set<string>();
  for (const p of paths) {
    if (p === "*") continue;
    if (p.startsWith("/")) rotas.add(normalizar(p));
    else {
      // Relativa: é filha de /loja/:lojaId. Guarda as duas grafias, porque a
      // tela às vezes escreve o prefixo à mão e às vezes chama `naLoja`.
      rotas.add(normalizar(`/loja/:lojaId/${p}`));
      rotas.add(normalizar(`/${p}`));
    }
  }
  return rotas;
}

/** Os destinos literais. Query e hash saem — eles não escolhem rota. */
function destinosLiterais(): { arquivo: string; destino: string }[] {
  const achados: { arquivo: string; destino: string }[] = [];
  for (const arquivo of versionados()) {
    const fonte = readFileSync(path.join(RAIZ, arquivo), "utf8");
    const padroes = [
      /to=\{naLoja\(`([^`]+)`\)\}/g,
      /to=\{naLoja\("([^"]+)"\)\}/g,
      /to=\{`([^`]+)`\}/g,
      /to="(\/[^"]+)"/g,
      /navigate\(naLoja\(`([^`]+)`\)\)/g,
      /navigate\(`(\/[^`]+)`\)/g,
    ];
    for (const padrao of padroes) {
      for (const m of fonte.matchAll(padrao)) {
        const bruto = m[1]!;
        if (/^(https?:|mailto:|tel:|wa\.me)/.test(bruto)) continue;
        if (!bruto.startsWith("/")) continue;
        achados.push({ arquivo, destino: bruto });
      }
    }
  }
  return achados;
}

/**
 * Os destinos em que o CAMINHO é calculado, não escrito — a sonda lê o literal
 * e não consegue resolvê-los. Cada um é dívida reconhecida, não permissão, e o
 * que trava é a **contagem**: foi o defeito que a conferência de 2026-08-05
 * achou na S30 ("trava a lista de arquivos, não a contagem"), e aqui a lista
 * poderia crescer de 3 para 30 com a suíte verde.
 *
 * - `app-layout.tsx` — a troca de loja remonta a URL inteira (`${resto}${search}`)
 * - `tour-acesso.tsx` — o segmento é o nome do MÓDULO, vindo de um mapa
 * - `noivas/[leadId]/index.tsx` — o `href` do próximo passo vem do núcleo
 */
const CALCULADOS: Record<string, number> = {
  "artifacts/moscow-noivas/src/components/layout/app-layout.tsx": 1,
  "artifacts/moscow-noivas/src/components/tour-acesso.tsx": 1,
  "artifacts/moscow-noivas/src/pages/noivas/[leadId]/index.tsx": 1,
};
const TOTAL_CALCULADOS = 3;

describe("varredura — todo link interno aponta uma rota que existe", () => {
  const rotas = rotasDeclaradas();
  const destinos = destinosLiterais();
  const naoResolvidos = destinos.filter(({ destino }) => !rotas.has(normalizar(destino)));

  /**
   * O piso. Conjunto vazio aprova tudo em silêncio, que é a falha mais cara de
   * uma sonda: verde por não ter olhado. Medido em 2026-08-11: **63 rotas** e
   * **113 destinos literais**; os pisos ficam abaixo com folga.
   */
  it("olha para as rotas e para os links, não para conjuntos vazios", () => {
    expect(rotas.size).toBeGreaterThan(40);
    expect(destinos.length).toBeGreaterThan(70);
  });

  it("nenhum link aponta rota inexistente", () => {
    const mortos = naoResolvidos
      .filter(({ arquivo }) => !(arquivo in CALCULADOS))
      .map(({ arquivo, destino }) => `${arquivo} → ${destino}`);
    expect([...new Set(mortos)]).toEqual([]);
  });

  it("e a dívida dos calculados não cresce às escondidas — a CONTAGEM é o número", () => {
    const porArquivo: Record<string, number> = {};
    for (const { arquivo } of naoResolvidos) {
      if (!(arquivo in CALCULADOS)) continue;
      porArquivo[arquivo] = (porArquivo[arquivo] ?? 0) + 1;
    }
    expect(porArquivo).toEqual(CALCULADOS);
    expect(Object.values(porArquivo).reduce((a, b) => a + b, 0)).toBe(TOTAL_CALCULADOS);
  });
});

/**
 * O que esta varredura NÃO enxerga, e é honesto dizer:
 *
 * 1. **Destino calculado em variável** — `to={rota}` com `rota` vindo de um
 *    `const` ou de um `map`. Ela lê o literal, não segue o valor.
 * 2. **Rota declarada fora do `App.tsx`** — hoje não existe nenhuma, e é por
 *    isso que ler um arquivo só basta. Nascendo um segundo roteador, esta sonda
 *    passa a aprovar por não enxergar; o piso de rotas é o que avisa.
 * 3. **Se a rota existe mas a TELA quebra** — isso é do E2E, não daqui.
 * 4. **Query e hash** saem da comparação de propósito: `?vista=funil` e
 *    `#lookbook` não escolhem rota, e compará-los daria falso vermelho.
 */
