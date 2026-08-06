import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * A enumeração das varreduras sai do VERSIONAMENTO, não do disco.
 *
 * Por que existe: em 2026-08-06 dois worktrees de agente saíram do git e
 * ficaram no disco — 1,04 GB que `.git/info/exclude` escondia do git e nada
 * escondia do `find`. Uma varredura ingênua lia **4.791 arquivos `.ts`/`.tsx`
 * onde havia 1.681**, e um agente mandado contar usos de `useIsMobile` teria
 * achado 10 onde há 3. O número saía com cara de medida (S38, sessão de
 * 2026-08-06).
 *
 * As varreduras COMMITADAS deste repositório escaparam daquele caso por sorte
 * de caminho — nenhuma anda a partir da raiz, e os órfãos moravam em
 * `.claude/worktrees/`, fora de `artifacts/`, `e2e/` e `lib/`. A fresta de
 * MECANISMO continua aberta, e ela é de duas formas:
 *
 * 1. `readdirSync` lê o que está no disco, então qualquer diretório ignorado
 *    pelo git DENTRO de uma pasta varrida entra na conta — `coverage/`,
 *    `build/`, `.vite/`, `test-results/`, um `.migration-backup/` que volte.
 * 2. Cada varredura mantinha a própria lista de diretórios a pular
 *    (`node_modules`, `dist`, `.git`, `generated`), e lista mantida à mão
 *    apodrece — é a lição que o E101 já tinha pago. `git ls-files` deriva a
 *    exclusão do `.gitignore`, que é onde a decisão já mora.
 *
 * Medido hoje: nas duas varreduras que passaram a usar esta função o conjunto
 * é **idêntico** ao que o disco devolvia — 265 arquivos de teste e 237
 * arquivos-fonte, os mesmos. O conserto não muda um número; ele tira a
 * dependência da sorte.
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
