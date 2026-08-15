import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { RAIZ_DO_REPO, lerDoRepo, manuaisVersionados } from "./manuais-do-repositorio";

/**
 * **E236 — todo print que um manual promete existe, e todo print que existe é
 * prometido por um manual.**
 *
 * O manual declara os prints com `<figure class="print" data-print="nome">`;
 * `scripts/prints-dos-manuais.ts` os captura (`docs/manuais/capturas/<qual>-<nome>.png`)
 * e escreve o manifesto `<qual>.json` com o que capturou; o PDF publicável
 * (`docs/manuais/pdf/<qual>.pdf`) nasce da injeção das capturas nas âncoras.
 * São três lugares que dizem "este manual tem estes prints", e cada um
 * envelhece sozinho:
 *
 * - âncora nova no HTML sem captura → o PDF sai com a figura VAZIA e uma frase
 *   apontando para o nada (o script avisa no console e segue);
 * - captura versionada que nenhum manual cita → lixo que o `--so-injetar` não
 *   percebe e que o próximo executor pensa que é tela atual;
 * - manual sem PDF versionado → a página *Manuais* do sistema diz
 *   "não está no servidor" (E236 serve o que está no git, e só isso).
 *
 * A régua da casa: enumerar pelo VERSIONAMENTO, nunca pelo disco (`c98341e`).
 * O manifesto `.json` entra pela mesma porta — captura feita e não commitada
 * é captura que não existe para quem instala.
 */
function versionados(padrao: string): string[] {
  return execFileSync("git", ["ls-files", padrao], { cwd: RAIZ_DO_REPO, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const qualDe = (manual: string) => path.basename(manual, ".html");
const ancorasDe = (html: string) => [...html.matchAll(/<figure class="print" data-print="([^"]+)"><\/figure>/g)].map((m) => m[1]!);

describe("varredura — os prints dos manuais", () => {
  const manuais = manuaisVersionados();
  const capturas = versionados("docs/manuais/capturas/*.png").map((c) => path.basename(c, ".png"));
  const manifestos = versionados("docs/manuais/capturas/*.json").map((c) => path.basename(c, ".json"));
  const pdfs = versionados("docs/manuais/pdf/*.pdf").map((c) => path.basename(c, ".pdf"));

  it("a varredura tem o que varrer — piso (S-C46)", () => {
    expect(manuais.length).toBe(5);
    expect(capturas.length).toBeGreaterThan(60);
  });

  it("todo manual declara prints, e cada âncora tem a captura versionada", () => {
    for (const manual of manuais) {
      const qual = qualDe(manual);
      const ancoras = ancorasDe(lerDoRepo(manual));
      expect(ancoras.length, `${manual} não declara nenhum print — os cinco têm passo a passo desde o E236`).toBeGreaterThan(4);
      const semCaptura = ancoras.filter((a) => !capturas.includes(`${qual}-${a}`));
      expect(
        semCaptura,
        `${manual} declara prints sem captura versionada (a figura sai VAZIA no PDF): rode ` +
          `\`BASE_URL=… prints-dos-manuais.ts ${qual}\` e faça \`git add docs/manuais/capturas\``,
      ).toEqual([]);
      const repetidas = ancoras.filter((a, i) => ancoras.indexOf(a) !== i);
      expect(repetidas, `${manual} declara o mesmo print duas vezes`).toEqual([]);
    }
  });

  it("toda captura versionada é citada por um manual — nenhum print órfão", () => {
    const citadas = new Set(manuais.flatMap((m) => ancorasDe(lerDoRepo(m)).map((a) => `${qualDe(m)}-${a}`)));
    const orfas = capturas.filter((c) => !citadas.has(c));
    expect(orfas, "capturas versionadas que nenhum manual cita — apague, ou declare a âncora").toEqual([]);
  });

  it("o manifesto de cada manual bate com as âncoras — o script rodou DEPOIS da última âncora", () => {
    for (const manual of manuais) {
      const qual = qualDe(manual);
      expect(manifestos, `falta docs/manuais/capturas/${qual}.json — o script nunca rodou para este manual`).toContain(qual);
      const manifesto = JSON.parse(lerDoRepo(`docs/manuais/capturas/${qual}.json`)) as { capturas: string[] };
      const feitas = manifesto.capturas.map((c) => c.replace(/\.png$/, "")).sort();
      const esperadas = ancorasDe(lerDoRepo(manual)).map((a) => `${qual}-${a}`).sort();
      expect(feitas, `${qual}: o manifesto e as âncoras divergem — âncora nova sem recaptura, ou captura sem âncora`).toEqual(esperadas);
    }
  });

  it("todo manual tem o PDF versionado — é o que a página Manuais do sistema serve", () => {
    for (const manual of manuais) {
      expect(pdfs, `docs/manuais/pdf/${qualDe(manual)}.pdf não está no git`).toContain(qualDe(manual));
    }
  });
});
