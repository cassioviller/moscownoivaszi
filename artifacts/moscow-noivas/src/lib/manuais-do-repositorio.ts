import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **S-C271 — as quatro varreduras de manual passam a ler pelo mesmo lugar.**
 *
 * Os manuais de `docs/manuais/*.html` são varridos por quatro réguas — o menu
 * (`varredura-manuais`), os prazos (`-prazos`), os textos de tela (`-textos`) e
 * a contradição interna (`-contradicao`). Cada uma nasceu num épico diferente e
 * **cada uma trouxe a própria cópia do enumerador**, com a mesma chamada de
 * `git ls-files` escrita de quatro formas ligeiramente diferentes.
 *
 * A sobra descrevia a duplicação como *"quatro extrações próprias de
 * chips/enumeração"*. Medido antes de fundir, são **duas coisas com números
 * diferentes**:
 *
 * - **o enumerador: quatro cópias**, e é a que dói — é ele que carrega a regra
 *   da casa (enumerar pelo versionamento, nunca por `find`/`glob` de disco, a
 *   lição de `c98341e`: 65% do que o disco devolvia era cópia de worktree
 *   órfão) e o piso de população da S-C46. Regra que mora em quatro lugares é
 *   regra que se conserta em um e envelhece em três;
 * - **o leitor de chips: duas cópias**, não quatro. As outras duas varreduras
 *   leem estruturas completamente diferentes — o menu por perfil
 *   (`<div class="colunas" data-perfil>`) e a tabela de recados
 *   (`<th>O recado</th>`) —, e fundir aquilo seria inventar parentesco.
 *
 * Este módulo é também o que a S-C271 dizia estar esperando: *"fundir quando o
 * helper de população chegar ao pacote do frontend"*. Ele chegou aqui.
 */

/** A raiz do repositório, vista de `artifacts/moscow-noivas/src/lib`. */
export const RAIZ_DO_REPO = path.resolve(import.meta.dirname, "../../../..");

/**
 * Os manuais versionados. **Pelo `git ls-files`, e não pelo disco** — a régua
 * da casa desde `c98341e`.
 *
 * O piso mora aqui, e não em cada chamador: manual que sai do versionamento
 * faria as quatro varreduras ficarem verdes por não terem olhado nada, que é a
 * S-C46 aplicada ao documento em vez de ao código.
 */
export function manuaisVersionados(): string[] {
  const achados = execFileSync("git", ["ls-files", "docs/manuais/*.html"], {
    cwd: RAIZ_DO_REPO,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f.endsWith(".html"));

  if (achados.length < 5) {
    throw new Error(
      `os manuais sumiram do versionamento: ${achados.length} achados, 5 esperados ` +
        `(vendedora, costureira, noiva, recepcao, proprietario). ` +
        `Varredura sobre conjunto vazio aprova tudo — S-C46/S-C260.`,
    );
  }
  return achados;
}

/** O conteúdo de um arquivo do repositório, pelo caminho relativo à raiz. */
export function lerDoRepo(relativo: string): string {
  return readFileSync(path.join(RAIZ_DO_REPO, relativo), "utf8");
}

/**
 * Os chips de gesto de um manual — `<span class="btn">Perdoar multa</span>`.
 *
 * É por eles que duas varreduras sabem o que o manual PROMETE que existe na
 * tela: a de textos confere que o botão existe, a de contradição confere que o
 * manual não nega noutro parágrafo o que promete aqui.
 *
 * Devolve os atributos crus junto com o rótulo porque a varredura de textos
 * decide por eles (`data-tela` e afins) — quem só quer o rótulo usa
 * `rotulosDosChips`.
 */
export function chipsDe(html: string): Array<{ rotulo: string; atributos: string }> {
  return [...html.matchAll(/<span class="btn"([^>]*)>([^<]+)<\/span>/g)].map((m) => ({
    atributos: m[1]!,
    rotulo: m[2]!.trim(),
  }));
}

/** Só os rótulos dos chips, na ordem em que aparecem. */
export function rotulosDosChips(html: string): string[] {
  return chipsDe(html).map((c) => c.rotulo);
}
