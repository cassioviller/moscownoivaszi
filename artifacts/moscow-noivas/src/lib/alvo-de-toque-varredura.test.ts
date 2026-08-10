import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-D18 — **a régua dos 44px, agora nos primitivos que o E137 não mediu.**
 *
 * O E137 fechou o achado E9 mudando UMA linha do `button.tsx` (`min-h-11
 * md:min-h-9`) e remediu: `/vestidos` a 390px foi de 153 alvos abaixo de 44px
 * para 0 de 763. O que sobrou em `/atendimentos` foram **2 alvos**, e os dois
 * eram `SelectTrigger` — um primitivo diferente, que o achado nunca tinha
 * medido. Junto com ele ficaram as abas do tablist à mão, a ~38px.
 *
 * A régua é a do E137, e ela vale por primitivo, não por arquivo:
 *
 * - **44px é o piso do alvo abaixo de `md`** (`min-h-11`), porque é o que a
 *   ponta do dedo cobre; acima de `md` o ponteiro é o mouse e o desenho denso
 *   volta (`md:min-h-9`).
 * - A grafia é **`min-h-11 md:min-h-9`**, e não `min-h-11 md:h-9`: `min-h-11`
 *   sem prefixo vale em TODA largura, e no CSS a altura usada é limitada pelo
 *   `min-height` — `md:h-9` ao lado dele daria 44px também no desktop, que é o
 *   oposto do que a mudança quer.
 *
 * ## O escopo desta varredura, dito por extenso
 *
 * ✔ cobre: a classe do `SelectTrigger` (`components/ui/select.tsx`), a do
 *   `Input` (`components/ui/input.tsx` — S-D34: o terceiro primitivo com o
 *   MESMO `h-9` cru, no campo que toda tela de formulário toca), a do
 *   `Button` (`components/ui/button.tsx`, a linha que o E137 escreveu) e todo
 *   `<button role="tab">` de `src/pages/**`.
 * ✘ NÃO cobre: altura RENDERIZADA — isto lê classe, não pixel. Quem mede pixel
 *   é o navegador, e a medida do E137 está no relatório dele.
 * ✘ NÃO cobre: alvo cuja altura vem de override na chamada (`className` no
 *   sítio de uso). A régua é do primitivo; override é caso a caso.
 */

const PISO_MOBILE = "min-h-11";
const TETO_DESKTOP = "md:min-h-9";

const raizSrc = join(__dirname, "..");

/**
 * A enumeração sai do versionamento, não do disco (S-D30). Caminhos relativos
 * a `src/`.
 */
function paginasTsx(): string[] {
  return arquivosVersionados(raizSrc, ["pages"]).filter((r) => r.endsWith(".tsx"));
}

describe("a régua dos 44px vale por primitivo", () => {
  it("o SelectTrigger tem piso de toque no mobile e volta a 36px no desktop", () => {
    const fonte = readFileSync(join(raizSrc, "components/ui/select.tsx"), "utf8");
    const classe = fonte.slice(fonte.indexOf("SelectPrimitive.Trigger"));
    const linha = classe.split("\n").find((l) => l.includes("whitespace-nowrap rounded-md"))!;
    expect(linha).toContain(PISO_MOBILE);
    expect(linha).toContain(TETO_DESKTOP);
    // `h-9` cru é o defeito que a sobra nomeou: 36px em qualquer largura.
    expect(linha).not.toMatch(/(^|\s)h-9(\s|"|`)/);
  });

  it("o Input tem piso de toque no mobile e volta a 36px no desktop", () => {
    // S-D34 — a mesma classe da S-D18, no primitivo que ninguém mediu: campo
    // de texto também é alvo de dedo, e o E137 contava alvos por PAPEL
    // clicável. O `textarea.tsx` já nasce acima do piso (`min-h-[60px]`).
    const fonte = readFileSync(join(raizSrc, "components/ui/input.tsx"), "utf8");
    const linha = fonte.split("\n").find((l) => l.includes("w-full rounded-md border border-input"))!;
    expect(linha).toBeDefined();
    expect(linha).toContain(PISO_MOBILE);
    expect(linha).toContain(TETO_DESKTOP);
    // `h-9` cru é o defeito que a sobra nomeou: 36px em qualquer largura.
    expect(linha).not.toMatch(/(^|\s)h-9(\s|"|`)/);
  });

  it("o Button mantém a linha que o E137 escreveu", () => {
    const fonte = readFileSync(join(raizSrc, "components/ui/button.tsx"), "utf8");
    expect(fonte).toContain(`${PISO_MOBILE} ${TETO_DESKTOP}`);
  });

  it("o Toggle tem piso de toque nas três variantes de tamanho", () => {
    // S-D47 — o QUARTO primitivo com `h-9` cru, e em uso real: o
    // ToggleGroupItem da troca lista/funil (`noivas/index.tsx`) ficava em
    // 36px no mobile. O toggle-group herda `toggleVariants`, então a régua
    // no toggle.tsx cobre os dois. A segunda metade da sobra morreu por
    // medição: `BreadcrumbEllipsis` (`breadcrumb.tsx`) é `<span
    // role="presentation" aria-hidden>` com zero consumidores — não é alvo.
    const fonte = readFileSync(join(raizSrc, "components/ui/toggle.tsx"), "utf8");
    // O bloco `size:` vem depois do `variant:` — e `default:` existe nos dois;
    // ancorar no bloco certo é o que separa medir tamanho de medir cor.
    const blocoSize = fonte.slice(fonte.indexOf("size: {"));
    for (const tamanho of ["default", "sm", "lg"] as const) {
      const linha = blocoSize.split("\n").find((l) => l.trim().startsWith(`${tamanho}: "`))!;
      expect(linha, `variante ${tamanho} sem a linha de classe`).toBeDefined();
      expect(linha).toContain(PISO_MOBILE);
      // O toggle também é alvo na LARGURA — pode ser só ícone.
      expect(linha).toContain("min-w-11");
      // `h-9`/`h-8`/`h-10` crus: 36px (ou menos) em qualquer largura.
      expect(linha).not.toMatch(/(^|[\s"])h-(8|9|10)(\s|"|`)/);
    }
  });

  it("toda aba do tablist à mão carrega o mesmo piso", () => {
    const semPiso: string[] = [];
    for (const relativo of paginasTsx()) {
      const fonte = readFileSync(join(raizSrc, relativo), "utf8");
      if (!fonte.includes('role="tab"')) continue;
      // O className da aba é o template literal que traz o sublinhado da aba
      // ativa — `border-b-2` é a assinatura dele.
      const linhas = fonte.split("\n").filter((l) => l.includes("border-b-2 px-4 py-2"));
      for (const l of linhas) {
        if (!l.includes(PISO_MOBILE)) semPiso.push(`${relativo}: ${l.trim()}`);
      }
      expect(linhas.length, `${relativo}: tablist sem a linha de classe da aba`).toBeGreaterThan(0);
    }
    expect(semPiso).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 66 telas `.tsx` versionadas em `pages/` — com folga para
   * baixo.
   */
  it("a varredura olha telas de verdade, não um conjunto vazio", () => {
    expect(paginasTsx().length).toBeGreaterThan(50);
  });
});
