import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **E270 — a imagem de produção lista o workspace À MÃO, e mão esquece.**
 *
 * O `Dockerfile` copia os `package.json` de todos os pacotes ANTES do `pnpm
 * install --frozen-lockfile`, para que a camada das dependências sobreviva a
 * toda edição de código. O preço dessa camada é uma lista escrita à mão: um
 * pacote novo no `pnpm-workspace.yaml` **não** aparece nela sozinha, e o
 * `--frozen-lockfile` recusa um workspace com pacote faltando — *"Cannot
 * install with frozen-lockfile because pnpm-lock.yaml is not up to date"*.
 *
 * O defeito é da pior classe: o repositório inteiro fica verde (typecheck,
 * API, frontend, E2E — nenhum deles constrói a imagem) e quem descobre é o
 * deploy, com a loja parada esperando. É o mesmo formato da regra 25 — a régua
 * que pega o defeito não é a que roda no mesmo gesto que o causa.
 *
 * Esta varredura enumera os pacotes pelo VERSIONAMENTO e exige que cada um
 * tenha a sua linha de `COPY`. Ela não constrói a imagem: constrói é caro e
 * precisa de rede; o que ela cobra é a lista, que é o que apodrece.
 */
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

function ler(arquivo: string): string {
  return readFileSync(join(RAIZ, arquivo), "utf8");
}

/**
 * Os manifestos de pacote do workspace — todo `package.json` versionado que não
 * é o da raiz e não veio de dentro de `node_modules`.
 */
function manifestosDoWorkspace(): string[] {
  return arquivosVersionados(RAIZ, ["artifacts", "lib", "scripts"]).filter((f) =>
    f.endsWith("/package.json"),
  );
}

describe("E270 — a imagem de produção acompanha o workspace", () => {
  it("todo pacote do workspace tem a sua linha de COPY no Dockerfile", () => {
    const dockerfile = ler("Dockerfile");
    const manifestos = manifestosDoWorkspace();

    // Sem população a régua atestaria o vazio (regra 34). Onze pacotes em
    // 17/08/2026 — três em `artifacts`, sete em `lib`, o `scripts`.
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(manifestos.length, "pacotes do workspace").toBeGreaterThanOrEqual(11);

    const semCopy = manifestos.filter((m) => !dockerfile.includes(m));
    expect(
      semCopy,
      "pacote do workspace sem `COPY` no Dockerfile: o `pnpm install " +
        "--frozen-lockfile` da imagem recusa um workspace incompleto, e nenhuma " +
        "suíte deste repositório constrói a imagem — quem descobre é o deploy (E270)",
    ).toEqual([]);
  });

  it("a porta é a MESMA em todas as declarações da imagem", () => {
    const dockerfile = ler("Dockerfile");

    // `ENV PORT=` é o que o servidor lê (`index.ts:5`) e `EXPOSE` é o que o
    // proxy do EasyPanel procura. Dois números diferentes dão um contêiner que
    // sobe, responde por dentro e é inalcançável pelo domínio.
    const doEnv = /^\s*PORT=(\d+)/m.exec(dockerfile)?.[1];
    const doExpose = /^EXPOSE\s+(\d+)/m.exec(dockerfile)?.[1];

    expect(doEnv, "ENV PORT do Dockerfile").toBeTruthy();
    expect(doExpose, "EXPOSE do Dockerfile").toBeTruthy();
    expect(doExpose, `EXPOSE ${doExpose} contra ENV PORT=${doEnv}`).toBe(doEnv);
  });

  it("os caminhos que a imagem declara são os que ela copia", () => {
    const dockerfile = ler("Dockerfile");

    // Cada `ENV` de caminho tem um `COPY` que o cria. `FRONTEND_DIR` errado
    // derruba a SUBIDA desde este épico (`app.ts` confere o `index.html`), mas
    // `MANUAIS_PDF_DIR` e `MIGRACOES_DIR` errados só aparecem quando alguém
    // baixa um manual ou quando o schema muda — meses depois.
    const declarados: Record<string, string> = {
      FRONTEND_DIR: "./public",
      MIGRACOES_DIR: "./migrations",
      MANUAIS_PDF_DIR: "./manuais",
      // E273: e este é o caso que a régua pegou de verdade. A imagem copiava
      // `docs/legado` para `/app/legado` e NÃO declarava `LEGADO_DIR` — o
      // default do motor resolve a partir do `cwd`, que no contêiner dá
      // `/legado`, fora de `/app`. O botão da importação listaria zero pacotes
      // em produção e ninguém saberia por quê.
      LEGADO_DIR: "./legado",
    };

    const orfaos = Object.entries(declarados)
      .filter(([env, destino]) => {
        const valor = new RegExp(`^\\s*${env}=(\\S+)`, "m").exec(dockerfile)?.[1];
        if (valor !== `/app/${destino.replace("./", "")}`) return true;
        return !new RegExp(`^COPY .*${destino.replace(".", "\\.")}/?\\s*$`, "m").test(dockerfile);
      })
      .map(([env]) => env);

    expect(
      orfaos,
      "variável de caminho da imagem sem o `COPY` que a preenche (ou apontando " +
        "para outro lugar) — o contêiner sobe e o recurso não existe (E270)",
    ).toEqual([]);
  });

  it("o .dockerignore mantém segredo e peso fora do contexto", () => {
    const ignore = ler(".dockerignore");

    // As quatro que importam, e cada uma por uma razão medida em 17/08/2026:
    // `.env` é segredo; `.claude` são 4,7 GB de worktrees de agente;
    // `node_modules` são 518 MB que a imagem reinstala; `.git` são 195 MB de
    // história que servidor nenhum lê.
    const exigidos = [".env", ".claude", "node_modules", ".git"];
    const faltando = exigidos.filter(
      (linha) => !ignore.split("\n").some((l) => l.trim() === linha),
    );
    expect(
      faltando,
      "o `.dockerignore` deixou de excluir isto, e o contexto do build passa a " +
        "carregar segredo ou gigabytes (E270)",
    ).toEqual([]);
  });
});
