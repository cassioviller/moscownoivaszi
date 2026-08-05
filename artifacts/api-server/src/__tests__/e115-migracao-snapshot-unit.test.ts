import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, isPgEnum } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";

const metaDir = join(import.meta.dirname, "..", "..", "..", "..", "lib", "db", "migrations", "meta");
const migracoesDir = join(import.meta.dirname, "..", "..", "..", "..", "docs", "migracoes");

/**
 * O snapshot mais recente — a pergunta "de qual arquivo esta sonda está
 * falando", que as duas asserções abaixo dependem de acertar.
 *
 * **A S-A22 foi RETIRADA, e a correção fica aqui porque é o tipo de coisa que
 * se erra duas vezes.** Eu a registrei afirmando que o `.sort()` de string
 * mentiria no `0010` (`"0010" < "0006"`). **É falso**: o drizzle zera à esquerda
 * em quatro dígitos, e com largura fixa a ordem de string É a ordem numérica —
 * `"0010" > "0009"` porque a diferença cai na terceira casa. Medido nos dois
 * sentidos com 12 nomes sintéticos: as duas ordenações devolvem o mesmo arquivo.
 *
 * A ordenação numérica fica, e não porque conserta algo: ela é a única que não
 * depende da largura do zero à esquerda. Se o drizzle passar a numerar com cinco
 * dígitos, ou alguém renomear um arquivo à mão, esta função continua certa e a
 * de string deixaria de estar.
 */
export function ultimoSnapshot(nomes: readonly string[]): string | undefined {
  return [...nomes]
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .at(-1);
}

function tabelasDoSnapshot(): {
  tables: Record<string, Record<string, unknown>>;
  enums: Record<string, { values: string[] }>;
} {
  const arquivo = ultimoSnapshot(readdirSync(metaDir));
  expect(arquivo).toBeTruthy();
  return JSON.parse(readFileSync(join(metaDir, arquivo!), "utf8"));
}

/**
 * E115 — o snapshot das migrações não pode apodrecer em silêncio.
 *
 * O 0000 do drizzle parou de ser regenerado e ficou SEIS migrações atrás do
 * schema: um banco provisionado por `pnpm --filter @workspace/db migrate`
 * respondia "migrations applied successfully!" e nascia sem `conciliado_em`,
 * `remarcacao_pedida_em`, `avarias.parcela_id`, `estorno_absorvido` — a noiva
 * abria o portal e levava 500 em toda abertura (42703, coluna não existe),
 * junto com a conciliação, o fechamento do mês e a cobrança de avaria. O
 * invariante do `replit.md` ("um banco novo nasce certo") valia para o `push`
 * e tinha sido derrubado, sem nenhum aviso, para o caminho `migrate` que o
 * mesmo package.json oferece.
 *
 * Esta sonda compara o SCHEMA VIVO (drizzle) com o ÚLTIMO snapshot: toda
 * tabela e toda coluna do schema têm de existir lá. Coluna nova sem
 * regenerar a baseline (`drizzle-kit generate`) reprova aqui — em vez de
 * reprovar no celular da noiva, meses depois.
 *
 * VERMELHO ANTES (medido em banco efêmero): `migrate` verde e
 * `select remarcacao_pedida_em from atendimentos` → 42703.
 */
describe("E115 — o snapshot do migrate acompanha o schema", () => {
  it("toda tabela e coluna do schema drizzle existe no último snapshot", () => {
    const { tables } = tabelasDoSnapshot();

    const faltando: string[] = [];
    for (const exportado of Object.values(schema)) {
      if (!is(exportado, PgTable)) continue;
      const cfg = getTableConfig(exportado);
      const tabela = tables[`public.${cfg.name}`] as { columns: Record<string, unknown> } | undefined;
      if (!tabela) {
        faltando.push(`tabela ${cfg.name}`);
        continue;
      }
      for (const col of cfg.columns) {
        if (!(col.name in tabela.columns)) faltando.push(`${cfg.name}.${col.name}`);
      }
    }

    // Se isto reprovar: rode `drizzle-kit generate` em lib/db (a baseline é
    // regenerável enquanto nenhum banco de verdade consumir o `migrate` — o
    // banco de dev usa `push` e não tem __drizzle_migrations).
    expect(faltando).toEqual([]);
  });

  /**
   * S-A15 — a sonda via tabela e COLUNA, e não via VALOR DE ENUM.
   *
   * O `ACESSORIO` que o E150 acrescentou a `orcamento_item_tipo` ficou **um dia
   * inteiro fora da baseline, com a suíte verde**, e só apareceu porque o E154
   * mexeu numa coluna e forçou o `generate` — o `0001` gerado trouxe o
   * `ALTER TYPE … 'ACESSORIO'` junto, de carona.
   *
   * O custo do buraco é discreto e tardio: um banco provisionado por `migrate`
   * entre os dois épicos aceita o tipo novo **até o primeiro INSERT** — a coluna
   * existe, o enum é que não tem o valor, e o 22P02 chega quando a vendedora
   * salva o orçamento, não quando alguém roda a migração.
   */
  it("todo valor de enum do schema drizzle existe no último snapshot", () => {
    const { enums } = tabelasDoSnapshot();

    const faltando: string[] = [];
    for (const exportado of Object.values(schema)) {
      if (!isPgEnum(exportado)) continue;
      const noSnapshot = enums[`public.${exportado.enumName}`];
      if (!noSnapshot) {
        faltando.push(`enum ${exportado.enumName}`);
        continue;
      }
      for (const valor of exportado.enumValues) {
        if (!noSnapshot.values.includes(valor)) faltando.push(`${exportado.enumName}.${valor}`);
      }
    }

    // Mesmo conserto da irmã de cima: `drizzle-kit generate` em lib/db.
    expect(faltando).toEqual([]);
  });
});

/**
 * De qual arquivo a sonda está falando — as duas asserções de cima só valem se
 * lerem o snapshot MAIS NOVO, e nenhuma delas reprovaria se a escolha errasse:
 * um snapshot velho tem MENOS coisas, não coisas erradas, então a comparação
 * simplesmente não veria o que falta.
 *
 * Estes casos existem por isso, e não por causa da S-A22 (que foi retirada —
 * ver a nota em `ultimoSnapshot`). O terceiro é o que mais importa: sem
 * snapshot nenhum, é melhor `undefined` e um erro alto que escolher errado
 * calado.
 */
describe("a sonda lê o snapshot mais novo", () => {
  it("a numeração de dois dígitos não confunde a escolha", () => {
    const nomes = Array.from({ length: 12 }, (_, i) => `${String(i).padStart(4, "0")}_snapshot.json`);
    expect(ultimoSnapshot(nomes)).toBe("0011_snapshot.json");
  });

  it("larguras MISTAS, que é o caso em que a ordem de string erraria de verdade", () => {
    expect(ultimoSnapshot(["0009_snapshot.json", "10_snapshot.json"])).toBe("10_snapshot.json");
  });

  it("ignora o que não é snapshot, e a ordem em que o disco devolve", () => {
    expect(
      ultimoSnapshot(["0002_snapshot.json", "_journal.json", "0010_snapshot.json", "0001_snapshot.json"]),
    ).toBe("0010_snapshot.json");
  });

  it("sem snapshot nenhum, devolve undefined em vez de escolher errado", () => {
    expect(ultimoSnapshot(["_journal.json"])).toBeUndefined();
  });
});

/**
 * S-A20 — o que os scripts à mão CRIAM tem de existir no schema, com o mesmo
 * NOME.
 *
 * A sonda de cima olha o caminho `migrate`. Este olha o outro: `docs/migracoes/`
 * é o que um banco que JÁ EXISTE roda, e o drizzle não o lê nunca. Quando os
 * dois divergem, um banco novo e um banco antigo deixam de ser o mesmo banco —
 * e a divergência é silenciosa até alguém tropeçar nela.
 *
 * Foram quatro, e só UMA gritou:
 *
 * · `itens_estoque_loja_nome_tamanho_unq` (E154) — nome diferente do que o
 *   drizzle gera. Ele não achava o dele, tentava CRIAR a duplicata e perguntava
 *   se podia truncar `itens_estoque`: prompt, sem TTY, **`push` morto por um
 *   dia inteiro** e o caminho do `replit.md` cancelado para todo banco real.
 * · `itens_estoque_loja_idx` (E154), `avarias_parcela_id_idx` (E97) e
 *   `atendimentos_loja_contato_idx` (E97) — índices que existiam nos bancos
 *   antigos e **em nenhum banco novo**, porque o schema nunca soube deles.
 *   Ninguém tropeça num índice que falta: só fica mais lento, e num banco que
 *   ainda é pequeno.
 *
 * VERMELHO ANTES: os quatro nomes acima, com o schema do `3cdaa83`.
 */
describe("S-A20 — os scripts à mão e o schema falam os mesmos nomes", () => {
  it("todo nome de constraint ou índice criado em docs/migracoes existe no snapshot", () => {
    const { tables: tabelas } = tabelasDoSnapshot();
    const conhecidos = new Set<string>();
    for (const t of Object.values(tabelas)) {
      for (const grupo of [
        "indexes",
        "foreignKeys",
        "uniqueConstraints",
        "checkConstraints",
        "compositePrimaryKeys",
      ]) {
        for (const nome of Object.keys((t[grupo] as Record<string, unknown>) ?? {})) {
          conhecidos.add(nome);
        }
      }
      // A PK do drizzle não aparece nomeada no snapshot; o Postgres a chama
      // sempre assim, e os scripts a citam por esse nome.
      conhecidos.add(`${t.name as string}_pkey`);
    }

    // Só o que CRIA nome. `DROP CONSTRAINT` fica de fora de propósito: script
    // que remove algo citou um nome que pode legitimamente não existir mais no
    // schema — é o passado, não o contrato.
    const criaNome =
      /(?:ADD\s+CONSTRAINT|^\s*CONSTRAINT|RENAME\s+CONSTRAINT\s+\w+\s+TO|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-z_0-9]+)/gim;

    const desconhecidos: string[] = [];
    for (const arquivo of readdirSync(migracoesDir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(migracoesDir, arquivo), "utf8");
      for (const [, nome] of sql.matchAll(criaNome)) {
        if (!conhecidos.has(nome)) desconhecidos.push(`${arquivo} → ${nome}`);
      }
    }

    // Se isto reprovar, a pergunta NÃO é "como calo o teste": é qual das duas
    // pontas está certa. Se o script criou algo que a loja precisa, declare-o no
    // schema (foi o caso dos três índices); se o nome é que divergiu, use o do
    // script no schema — nenhum banco consumiu o `migrate`, então mudar o nome
    // do lado do drizzle custa zero DDL em banco de verdade.
    expect(desconhecidos).toEqual([]);
  });
});
