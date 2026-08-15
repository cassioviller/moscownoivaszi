import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * **S-C152 — o `generated/` tem de estar em dia com o `openapi.yaml`, e agora
 * há régua.**
 *
 * A S-C150 🟠 nasceu e viveu um dia inteiro porque o codegen é um gesto humano
 * que ninguém pregava: o E217 pôs `DEVOLUCAO` no enum do spec, **não re-rodou o
 * codegen**, e a conta a pagar que a própria 13ª §3º cria fazia o
 * `GET /financeiro/contas-pagar` responder **500** (`RESPOSTA_FORA_DO_CONTRATO`)
 * — a tela inteira, armada, esperando a primeira linha `DEVOLUCAO` no banco. O
 * `_cobreTodosOsTipos` do `dre.ts` existe para pegar isso e não pegou, porque
 * **guarda que depende do codegen só protege depois de o codegen rodar.** Esta
 * régua fecha o círculo: ela RODA o codegen.
 *
 * O mecanismo: fotografa o estado dos dois `generated/` (diff + status contra o
 * versionamento), re-roda o orval, fotografa de novo e exige que NADA tenha
 * mudado. Não exige árvore limpa — quem está no meio de um épico com o spec e o
 * `generated/` já regenerados (e ainda não commitados) passa, porque os dois
 * estão EM DIA um com o outro; quem mudou o spec e esqueceu o codegen reprova,
 * e sai da reprova com o `generated/` já corrigido na árvore.
 *
 * O que sustenta o desenho, medido em 2026-08-14:
 * - o codegen é DETERMINÍSTICO — a nota S-D44 do `orval.config.ts` diz que os
 *   `generated/` commitados são reproduzidos byte a byte, e a medição de
 *   abertura confirmou: rodar sobre árvore limpa muda **0 arquivos**;
 * - custa **~7 s**, contra os ~11,6 min da suíte — cabe.
 *
 * Custo declarado: a régua ESCREVE na árvore (o orval regenera com
 * `clean: true`). Edição manual em `generated/` é destruída — de propósito:
 * arquivo gerado não se edita à mão, e é exatamente essa edição que a régua
 * existe para não deixar passar despercebida.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");
const GERADOS = ["lib/api-client-react/src/generated", "lib/api-zod/src/generated"];

/** A fotografia: o que difere do commit (conteúdo) + o que existe fora dele (status). */
function fotografia(): string {
  const alvos = GERADOS.join(" ");
  const diff = execSync(`git diff -- ${alvos}`, { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 });
  const status = execSync(`git status --porcelain -- ${alvos}`, { cwd: RAIZ });
  return `${diff.toString("utf8")}\n---\n${status.toString("utf8")}`;
}

describe("S-C152 — o codegen está em dia", () => {
  it(
    "re-rodar o orval não muda um byte de generated/ — spec e gerado dizem a mesma coisa",
    () => {
      /**
       * S-C260 — **o piso, que faltava.**
       *
       * Esta régua compara duas fotografias e nada mais. Se os dois
       * `generated/` sumissem — pasta renomeada, `clean: true` apagando sem
       * regravar, caminho mudado no config —, `antes` e `depois` seriam a
       * MESMA string vazia e ela passaria verde, dizendo que o codegen está em
       * dia sobre um `generated/` que não existe. É o formato exato que a
       * S-C46 descreve, dentro da régua mais nova do repositório: **verde por
       * não ter olhado.**
       *
       * O piso é sobre o que ela FOTOGRAFA, não sobre o que ela denuncia:
       * os dois diretórios têm de conter arquivo versionado.
       */
      const porDiretorio = GERADOS.map((dir) => ({
        dir,
        n: execSync(`git ls-files -- ${dir}`, { cwd: RAIZ })
          .toString("utf8")
          .split("\n")
          .filter(Boolean).length,
      }));
      for (const { dir, n } of porDiretorio) {
        // Piso por diretório é 1, e não um número redondo: os dois têm formas
        // MUITO diferentes — o `api-zod` sai em `mode: split` com 377 arquivos,
        // e o `api-client-react` sai em 2. Um piso alto no segundo seria régua
        // que reprova por desenho do gerador, não por defeito.
        expect(n, `${dir} está vazio — a fotografia compararia nada com nada`).toBeGreaterThan(0);
      }
      expect(
        porDiretorio.reduce((s, d) => s + d.n, 0),
        "os dois generated/ somados encolheram demais — a fotografia perdeu o objeto",
      ).toBeGreaterThan(100);

      const antes = fotografia();

      execSync("npx orval --config ./orval.config.ts", {
        cwd: path.join(RAIZ, "lib", "api-spec"),
        stdio: "pipe",
      });

      const depois = fotografia();
      const mudou = execSync(`git status --porcelain -- ${GERADOS.join(" ")}`, { cwd: RAIZ })
        .toString("utf8")
        .trim();

      expect(
        depois,
        `O openapi.yaml mudou e o codegen não rodou — o generated/ estava contando outra história ` +
          `(é a S-C150 de novo: o 500 fica armado até a primeira linha nova no banco). ` +
          `A árvore JÁ ESTÁ corrigida por esta régua; confira e commite:\n${mudou}`,
      ).toBe(antes);
    },
    // O orval leva ~7 s; o teto padrão da suíte é 15 s e uma máquina carregada
    // não pode transformar régua em flake.
    120_000,
  );
});
