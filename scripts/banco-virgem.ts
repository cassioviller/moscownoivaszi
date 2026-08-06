/**
 * A régua do banco VIRGEM — o único caminho que um ateliê novo percorre, e o
 * único que nenhuma suíte exercita (S-D43).
 *
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/banco-virgem.ts
 *
 * As três suítes rodam contra o banco de `DATABASE_URL`, que neste repositório
 * existe desde antes do E147. O ramo "banco sem admin, roda o seed oficial" do
 * `e2e/global-setup.ts` nunca é executado por run nenhum — e foi exatamente ali
 * que a S-D38 viveu: o setup morria com 23505
 * `regra_disponibilidade_loja_id_unique` logo depois de o seed que ele mesmo
 * chama criar a linha. Defeito de primeira execução não fica escondido por
 * sorte; fica escondido por CONSTRUÇÃO (regra 27).
 *
 * O que este script faz, na ordem de um ateliê novo:
 *
 *   1. cria um banco descartável e aplica o schema como o dev aplica (`push`);
 *   2. roda o seed oficial e GUARDA a saída dele;
 *   3. confere que o resumo impresso descreve o que o banco realmente guarda —
 *      é isto que pega a S-D41, e é a única régua que a pega, porque o resumo do
 *      seed só se lê numa instalação nova;
 *   4. roda o `global-setup` do E2E inteiro e exige que ele termine sem erro;
 *   5. roda o seed DE NOVO, porque ele promete ser idempotente, e exige que a
 *      segunda passada não crie nada;
 *   6. apaga o banco, inclusive se algum passo estourar.
 *
 * Ele NÃO entra em suíte: `createdb`/`dropdb` pedem permissão de servidor, e a
 * suíte da API já tem um banco só e serial. É régua de mão, e o `replit.md` diz
 * quando rodá-la — antes de publicar, e depois de mexer no seed, no schema ou no
 * `global-setup`.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BANCO = process.env.BANCO_VIRGEM ?? "moscow_virgem_regua";

function urlDoBanco(nome: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não está definida — não sei em que servidor criar o banco.");
  const u = new URL(base);
  u.pathname = `/${nome}`;
  return u.toString();
}

const URL_VIRGEM = urlDoBanco(BANCO);
let falhas = 0;

function passo(titulo: string): void {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 68 - titulo.length))}`);
}

function afirmar(oQue: string, condicao: boolean, detalhe: string): void {
  if (condicao) {
    console.log(`  ✓ ${oQue}`);
  } else {
    falhas++;
    console.log(`  ✗ ${oQue}\n      ${detalhe}`);
  }
}

/** Uma consulta no banco descartável, por `psql`: linhas de colunas cruas. */
function consultar(sql: string): string[][] {
  const saida = execFileSync("psql", [URL_VIRGEM, "-t", "-A", "-F", "|", "-c", sql], {
    encoding: "utf8",
  });
  return saida
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => l.split("|"));
}

function rodar(comando: string, cwd: string, env: Record<string, string> = {}): string {
  return execSync(comando, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main(): Promise<void> {
  passo(`banco descartável "${BANCO}"`);
  try {
    execFileSync("dropdb", ["--if-exists", BANCO], { stdio: "ignore" });
  } catch {
    // dropdb sem o banco não é erro aqui; o createdb abaixo é quem manda.
  }
  execFileSync("createdb", [BANCO], { stdio: "inherit" });
  console.log(`  criado`);

  try {
    passo("schema (o mesmo `push` que o dev roda)");
    rodar("pnpm run push", path.join(RAIZ, "lib/db"), { DATABASE_URL: URL_VIRGEM });
    console.log("  aplicado");

    passo("seed oficial — primeira passada");
    const saida1 = rodar(
      "./node_modules/.bin/tsx src/scripts/seed.ts",
      path.join(RAIZ, "artifacts/api-server"),
      { DATABASE_URL: URL_VIRGEM },
    );
    console.log(saida1.split("\n").map((l) => `  │ ${l}`).join("\n"));

    passo("o resumo do seed descreve o que o banco guarda (S-D41, S-A12)");
    // As leituras vão por `psql` de propósito: `@workspace/db` abre o pool em
    // `DATABASE_URL` no momento do import, e aqui o banco é outro.
    const linhasRegra = consultar(
      `select dias_funcionamento, atendimento_abertura_hora, atendimento_fechamento_hora from regra_disponibilidade`,
    );
    const nCabines = Number(consultar("select count(*) from cabines")[0]?.[0] ?? "0");

    afirmar(
      "o seed criou exatamente um horário",
      linhasRegra.length === 1,
      `achei ${linhasRegra.length} linhas em regra_disponibilidade`,
    );
    const bruta = linhasRegra[0];
    if (bruta) {
      const regra = {
        dias: JSON.parse(bruta[0] ?? "[]") as number[],
        abertura: Number(bruta[1]),
        fechamento: Number(bruta[2]),
      };
      const linhaHorario = saida1.split("\n").find((l) => l.includes("Horário de funcionamento")) ?? "";
      // A régua não é "a frase é esta": é "a frase não pode contradizer a linha".
      // Domingo é o caso que a S-A8 decidiu e o resumo negava.
      const abreDomingo = regra.dias.includes(0);
      afirmar(
        "o resumo não nega o domingo que o banco abre",
        !abreDomingo || !/seg[–-]/.test(linhaHorario),
        `o banco guarda ${JSON.stringify(regra.dias)} (domingo incluído) e a linha diz "${linhaHorario.trim()}"`,
      );
      afirmar(
        "o resumo diz a hora de fechamento que o banco guarda",
        linhaHorario.includes(`${regra.fechamento}h`),
        `o banco guarda fechamento ${regra.fechamento}h e a linha diz "${linhaHorario.trim()}"`,
      );
      afirmar(
        "o resumo diz a hora de abertura que o banco guarda",
        linhaHorario.includes(`${regra.abertura}h`),
        `o banco guarda abertura ${regra.abertura}h e a linha diz "${linhaHorario.trim()}"`,
      );
    }

    const linhaCabines = saida1.split("\n").find((l) => l.includes("Cabines")) ?? "";
    afirmar(
      "a linha das cabines separa o total do que esta execução criou (S-A12)",
      new RegExp(`${nCabines}\\s*\\(\\+\\d+\\)`).test(linhaCabines),
      `o banco tem ${nCabines} cabines e a linha diz "${linhaCabines.trim()}" — falta o "total (+criadas)"`,
    );

    passo("o `global-setup` do E2E sobe neste banco (S-D38)");
    // O setup grava `e2e/.state.json` com os ids do banco em que rodou. Aqui ele
    // roda contra o descartável, então o arquivo do repositório é guardado e
    // devolvido: quem rodar esta régua no meio de outra coisa não fica com o
    // state apontando para um banco que já foi apagado.
    const arquivoEstado = path.join(RAIZ, "e2e/.state.json");
    const estadoAntes = existsSync(arquivoEstado) ? readFileSync(arquivoEstado) : null;
    const globalSetup = (await import(path.join(RAIZ, "e2e/global-setup"))).default as () => Promise<void>;
    process.env.DATABASE_URL = URL_VIRGEM;
    try {
      await globalSetup();
      afirmar("o setup do E2E terminou sem erro", true, "");
    } catch (e) {
      const causa = (e as { cause?: { code?: string; constraint?: string } }).cause;
      afirmar(
        "o setup do E2E terminou sem erro",
        false,
        `${(e as Error).message}${causa?.constraint ? ` · ${causa.code} ${causa.constraint}` : ""}`,
      );
    } finally {
      if (estadoAntes) writeFileSync(arquivoEstado, estadoAntes);
      else if (existsSync(arquivoEstado)) rmSync(arquivoEstado);
    }

    passo("o seed é idempotente — segunda passada não cria nada");
    const saida2 = rodar(
      "./node_modules/.bin/tsx src/scripts/seed.ts",
      path.join(RAIZ, "artifacts/api-server"),
      { DATABASE_URL: URL_VIRGEM },
    );
    const criouAlgo = saida2.split("\n").filter((l) => /\((novo|\+\d+)\)/.test(l));
    afirmar(
      "a segunda passada do seed não marca nada como criado",
      criouAlgo.length === 0,
      `marcou ${criouAlgo.length}: ${criouAlgo.map((l) => l.trim()).join(" · ")}`,
    );
  } finally {
    passo("faxina");
    execFileSync("dropdb", ["--if-exists", BANCO], { stdio: "inherit" });
    console.log("  apagado");
  }

  console.log(
    falhas === 0
      ? "\nA régua do banco virgem passou inteira.\n"
      : `\n${falhas} afirmação(ões) reprovaram — um ateliê NOVO encontraria isto.\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nA régua do banco virgem estourou fora das afirmações:", e);
  try {
    execFileSync("dropdb", ["--if-exists", BANCO], { stdio: "ignore" });
  } catch {
    // já apagado, ou nunca criado.
  }
  process.exit(1);
});
