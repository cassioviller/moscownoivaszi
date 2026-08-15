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
 *   5. **roda TRÊS SPECS de verdade contra o banco descartável** (S-O73/S-O90);
 *   6. roda o seed DE NOVO, porque ele promete ser idempotente, e exige que a
 *      segunda passada não crie nada;
 *   7. apaga o banco, inclusive se algum passo estourar.
 *
 * **Por que o passo 5 existe (S-O73/E188).** Até o E188 esta régua subia o
 * `global-setup` e **não rodava um spec sequer** — e foi exatamente por essa
 * fresta que a S-O73 viveu: a fixture gravava a cor na COLUNA legada, a ficha
 * lê o ATRIBUTO desde o E149, e o E2E inteiro reprovava em banco novo
 * (`1 failed · 6 passed` em `04-vestidos`) enquanto esta régua dizia verde.
 * Setup que sobe não é tela que abre.
 *
 * **Por que são três, e por que ESTES três (S-O90/E190).** O critério não é o
 * alfabeto: é a ÁREA cujo estado no banco de dev veio de uma MIGRAÇÃO que uma
 * instalação nova nunca rodou — que é a forma exata do defeito da S-O73. Cada
 * um cobre uma configuração que o seed cria e uma migração que a backfillou:
 *
 *   - `04-vestidos` — o **catálogo de atributos** (E149, `2026-08-04-e149-cor-
 *     para-atributo.sql`): login, listagem, cadastro, ficha e o filtro por par
 *     `(atributoId, opcaoId)`. É o spec que a S-O73 derrubou.
 *   - `12-permissoes` — os **perfis semeados × módulo·ação** (E172,
 *     `2026-08-12-e172-modulos-orcamentos-e-contratos.sql`, e a `sd26` antes
 *     dela). Chave ausente é fail-closed, e o seed é idempotente: perfil que já
 *     existe não ganha módulo novo. **O E2E já cobrou isso uma vez** — no E172
 *     este spec reprovou justamente porque o banco de dev tinha os perfis
 *     semeados antes dos módulos nascerem. Num banco novo o defeito é o
 *     espelho: é aqui que se prova que o seed sozinho monta a matriz inteira.
 *   - `52-orcamento-vira-contrato` — a **jornada do papel que a noiva assina**,
 *     aceite → fila → reserva inline → contrato (E162), sobre o índice único do
 *     E158 e o snapshot do E166. Ele CONSTRÓI o próprio contrato, e é por isso
 *     que entra: os 4 testes que uma instalação nova não roda são os que
 *     PROCURAM um contrato pronto (`08-contratos` ×3 e `15-onda5:150`).
 *
 * **A decisão que a S-O90 deixou em aberto: a fixture do contrato fica FORA.**
 * O seed não cadastra contrato porque isso é trabalho da loja (E147), e criar
 * um só para a régua seria semear na instalação nova exatamente o que ela
 * existe para não ter. O buraco que aquela ausência abria — "a jornada do papel
 * é a única que uma instalação nova não prova" — fecha pelo outro lado: o `52`
 * prova a jornada CRIANDO o contrato, que é o que a loja faz no primeiro dia.
 * Os 4 `skip` continuam sendo ausência honesta de fixture, não vermelho.
 *
 * Os specs sobem servidores PRÓPRIOS, em portas próprias (`E2E_API_PORT`/
 * `E2E_WEB_PORT`): com as portas de sempre o `reuseExistingServer` do
 * `playwright.config.ts` pegaria um servidor vivo apontado para OUTRO banco, e
 * a régua mediria o dev de novo — a S-M15 pela porta em vez de pelo import.
 * Eles rodam numa CHAMADA SÓ do Playwright, para pagar a subida dos dois
 * servidores uma vez; o placar sai junto.
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

/**
 * Os specs que a régua roda, e as portas em que ela sobe os servidores deles.
 *
 * A escolha é por ÁREA que depende de migração antiga, e o argumento de cada um
 * está no cabeçalho deste arquivo (S-O90). Quem acrescentar um quarto escolhe
 * pelo mesmo critério, e diz aqui qual configuração do seed ele exercita.
 *
 * As portas NÃO são as de sempre (5099/5173) de propósito: assim a régua não
 * atropela um E2E do vizinho nem reusa o servidor dele — `reuseExistingServer`
 * fica desligado sozinho quando estas duas env estão postas.
 */
const SPECS = [
  "e2e/04-vestidos.spec.ts",
  "e2e/12-permissoes.spec.ts",
  "e2e/52-orcamento-vira-contrato.spec.ts",
];
const PORTA_API = Number(process.env.BANCO_VIRGEM_API_PORT ?? 5199);
const PORTA_WEB = Number(process.env.BANCO_VIRGEM_WEB_PORT ?? 5273);

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

    /**
     * S-O71 — o total de PERFIS é lido do banco, como todos os outros.
     *
     * Esta linha do resumo era a única com o total cravado (`4`), e num banco
     * virgem ela imprimia `Perfis de acesso 4 (+5)`: o total MENOR do que o que
     * a própria execução acabara de criar, no único lugar em que esse número se
     * lê — a instalação nova. A régua não é "diz 5": é "não contradiz o
     * `count(*)`", para a Costureira do E172 não ter uma sexta irmã sem que
     * ninguém perceba.
     */
    const nPerfis = Number(consultar("select count(*) from perfis")[0]?.[0] ?? "0");
    // S-O92/E239: a linha passou a dizer "Perfis do sistema" — é o que ela conta.
    const linhaPerfis = saida1.split("\n").find((l) => l.includes("Perfis do sistema")) ?? "";
    afirmar(
      "o resumo diz quantos perfis o banco tem (S-O71)",
      new RegExp(`Perfis do sistema\\s+${nPerfis}(\\s|$)`).test(linhaPerfis),
      `o banco tem ${nPerfis} perfis e a linha diz "${linhaPerfis.trim()}"`,
    );

    passo("o `global-setup` do E2E sobe neste banco (S-D38)");
    /**
     * Os DOIS arquivos que o E2E deixa no disco apontando para o banco em que
     * rodou, guardados aqui e devolvidos no `finally` de baixo (S-O91).
     *
     * `e2e/.state.json` é escrito pelo `global-setup` e traz os ids desta
     * instalação; `e2e/.auth/admin.json` é escrito pelo projeto `setup` do
     * Playwright e traz o **cookie de uma sessão** — e o passo do spec loga no
     * banco descartável. Guardar só o primeiro deixava o `storageState`
     * apontando para sessão de um banco que esta régua acabou de apagar. Hoje
     * isso é inofensivo, porque o `setup` é dependência do projeto `chromium` e
     * reescreve o arquivo em todo run; deixa de ser no dia em que alguém rodar
     * um spec com `--project=chromium` sozinho. São dois arquivos com uma régua
     * só, e a régua é a mesma: **o que esta régua encosta, ela devolve**.
     */
    const arquivosDoE2E = [path.join(RAIZ, "e2e/.state.json"), path.join(RAIZ, "e2e/.auth/admin.json")];
    const guardados = arquivosDoE2E.map((arquivo) => ({
      arquivo,
      antes: existsSync(arquivo) ? readFileSync(arquivo) : null,
    }));
    /**
     * S-M15 — a troca da env vem ANTES do import, e a ordem é o defeito que
     * esta régua teve: `@workspace/db` abre o pool em `DATABASE_URL` no
     * momento do import (o comentário do passo anterior já sabia), e o import
     * do `global-setup` é quem o importa. Com o import primeiro, o pool nascia
     * no banco de DEV: o setup rodava lá — onde o admin já existe e nada
     * dispara o ramo S-D38 —, terminava sem erro, e a régua declarava sucesso
     * sobre um banco que nunca tocou. O único passo que justifica o script era
     * o único que não acontecia.
     */
    process.env.DATABASE_URL = URL_VIRGEM;
    const globalSetup = (await import(path.join(RAIZ, "e2e/global-setup"))).default as () => Promise<void>;
    let setupOk = false;
    try {
      await globalSetup();
      setupOk = true;
      afirmar("o setup do E2E terminou sem erro", true, "");
      // E a prova do ALVO, que sobrevive a qualquer refactor de import: as
      // fixtures de id fixo do setup têm de estar NESTE banco. Se um import
      // futuro renascer o pool cedo demais, o setup escreve no dev, o
      // descartável fica vazio, e esta linha reprova em vez de deixar a régua
      // mentir verde.
      const fixtures = Number(
        consultar("select count(*) from vestidos where id = 'e2e-vestido-1'")[0]?.[0] ?? "0",
      );
      afirmar(
        "o setup escreveu no banco descartável, não no de dev (S-M15)",
        fixtures === 1,
        "o e2e-vestido-1 não está no banco descartável — o pool do setup nasceu apontando para outro banco",
      );
    } catch (e) {
      const causa = (e as { cause?: { code?: string; constraint?: string } }).cause;
      afirmar(
        "o setup do E2E terminou sem erro",
        false,
        `${(e as Error).message}${causa?.constraint ? ` · ${causa.code} ${causa.constraint}` : ""}`,
      );
    }

    /**
     * S-O73/S-O90 — TRÊS specs de verdade, contra o banco descartável.
     *
     * O `.state.json` fica de pé até aqui de propósito: é ele que diz aos specs
     * quais são os ids desta instalação. A devolução dos dois arquivos do
     * repositório vem depois, no `finally` de baixo.
     */
    passo("três specs do E2E ABREM A TELA neste banco (S-O73, S-O90)");
    const oQue = "os três specs de instalação nova passam inteiros";
    try {
      if (!setupOk) {
        afirmar(oQue, false, "o setup não terminou — os specs não chegam a rodar");
      } else {
        try {
          const saidaSpec = rodar(
            `./node_modules/.bin/playwright test ${SPECS.join(" ")} --reporter=line`,
            RAIZ,
            {
              DATABASE_URL: URL_VIRGEM,
              // O mesmo vazio que o `playwright.config.ts` põe no comando da API,
              // e pelo mesmo motivo: o userenv do workspace define
              // `APP_DATABASE_NAME` para todo shell, e sem o vazio o servidor do
              // spec subiria no banco da LOJA em vez do descartável.
              APP_DATABASE_NAME: "",
              E2E_API_PORT: String(PORTA_API),
              E2E_WEB_PORT: String(PORTA_WEB),
            },
          );
          const resumo = saidaSpec
            .split("\n")
            .filter((l) => /\d+ (passed|failed|skipped)/.test(l))
            .map((l) => l.trim())
            .join(" · ");
          afirmar(`${oQue} — ${resumo}`, true, "");
        } catch (e) {
          const err = e as { stdout?: string; stderr?: string };
          const saida = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
          const pistas = saida
            .split("\n")
            // O nome do teste (`1) [chromium] › …`), a frase do erro e o placar.
            .filter((l) => /^\s*\d+\)\s|✘|\d+ failed|Error:/.test(l))
            .slice(0, 6)
            .map((l) => l.trim())
            .join("\n      ");
          afirmar(
            oQue,
            false,
            `${SPECS.join(" · ")} — reprovou num banco recém-criado; o dev passa porque tem rastro de migração que a instalação nova não tem:\n      ${pistas}`,
          );
        }
      }
    } finally {
      for (const { arquivo, antes } of guardados) {
        if (antes) writeFileSync(arquivo, antes);
        else if (existsSync(arquivo)) rmSync(arquivo);
      }
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
