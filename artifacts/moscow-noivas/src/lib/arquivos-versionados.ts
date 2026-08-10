import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * CÓPIA de `artifacts/api-server/src/__tests__/arquivos-versionados.ts` — e a
 * cópia é decisão, não descuido (S-D30).
 *
 * Não existe pacote de utilitário de teste compartilhado neste workspace, e
 * criar um workspace package só para uma função de 30 linhas custa mais do que
 * a cópia: mais um `package.json`, mais um projeto no typecheck, mais um nó no
 * grafo do pnpm — para um consumidor que é só teste. "Cópia correta continua
 * sendo cópia" é a frase da `varredura-reguas.test.ts`, e ela vale aqui também:
 * se um dia nascer um terceiro consumidor, é a hora de promover a função a
 * pacote e apagar as duas cópias. Quem mexer numa, mexe na outra — a origem é
 * a do api-server.
 *
 * O que ela faz e por quê (o texto da origem, na íntegra):
 *
 * A enumeração das varreduras sai do VERSIONAMENTO, não do disco.
 *
 * Em 2026-08-06 dois worktrees de agente saíram do git e ficaram no disco —
 * 1,04 GB que `.git/info/exclude` escondia do git e nada escondia do `find`.
 * Uma varredura ingênua lia **4.791 arquivos `.ts`/`.tsx` onde havia 1.681**.
 * O número saía com cara de medida (S38, sessão de 2026-08-06).
 *
 * 1. `readdirSync` lê o que está no disco, então qualquer diretório ignorado
 *    pelo git DENTRO de uma pasta varrida entra na conta — `coverage/`,
 *    `build/`, `.vite/`, `test-results/`.
 * 2. Cada varredura mantinha a própria lista de diretórios a pular, e lista
 *    mantida à mão apodrece. `git ls-files` deriva a exclusão do `.gitignore`,
 *    que é onde a decisão já mora.
 */
export function arquivosVersionados(raiz: string, prefixos: readonly string[]): string[] {
  let saida: string;
  try {
    // `-z` separa por NUL: sem ele o git ESCAPA e aspa caminhos com acento ou
    // espaço, e o consumidor recebe um caminho que não abre.
    saida = execFileSync("git", ["ls-files", "-z", "--", ...prefixos], {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (erro) {
    // Cair no disco quando o git falta é exatamente o defeito que esta função
    // existe para não repetir: a varredura passaria a ler mais do que deve e
    // continuaria verde. Falha alto.
    throw new Error(
      `A varredura enumera pelo versionamento e o \`git ls-files\` falhou em ${raiz}: ` +
        (erro instanceof Error ? erro.message : String(erro)),
    );
  }

  const relativos = saida
    .split("\0")
    .filter(Boolean)
    // Arquivo rastreado e apagado no working tree (um `git rm` em curso) sai da
    // conta em vez de estourar a leitura no meio da varredura.
    .filter((relativo) => existsSync(join(raiz, relativo)));

  // Lista vazia aprovaria toda varredura em silêncio, que é a falha mais cara
  // possível numa sonda: verde por não ter olhado nada.
  if (relativos.length === 0) {
    throw new Error(
      `\`git ls-files\` não devolveu arquivo nenhum sob ${prefixos.join(", ")} em ${raiz}. ` +
        `Varredura sobre conjunto vazio passa sempre e não guarda nada.`,
    );
  }

  return relativos;
}
