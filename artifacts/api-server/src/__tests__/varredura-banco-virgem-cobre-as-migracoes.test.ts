import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **S-O103/E239 — o critério do `banco-virgem.ts` deixa de ser PROSA.**
 *
 * A régua do banco virgem roda TRÊS specs de 65, e o cabeçalho dela diz por
 * quê: *"a área cujo estado no banco de dev veio de uma MIGRAÇÃO que uma
 * instalação nova nunca rodou"* — que é a forma exata do defeito da S-O73 (a
 * cor gravada na coluna legada, o atributo que só o dev tinha). Até aqui nada
 * cobrava esse critério: uma migração nova que backfilla dado numa área sem
 * spec de instalação nova não reprovava nada.
 *
 * As duas pontas já estão versionadas, e esta varredura as cruza (regra 22):
 * `git ls-files docs/migracoes` de um lado, a constante `SPECS` do script do
 * outro. **Medido em 2026-08-15, antes de escrever: 60 migrações (a sobra dizia
 * 47), 15 escrevem DADO** (`UPDATE`/`INSERT INTO`/`DELETE FROM` no começo de
 * sentença, fora de comentário) — **9 backfillam** (UPDATE/INSERT) e **6 são
 * faxina** (só DELETE, do rastro de teste que uma instalação nova não tem).
 * As 45 restantes são só schema, e o `push` as cobre por construção.
 *
 * O que a régua cobra: **toda tabela que uma migração BACKFILLOU tem, ou um
 * spec em `SPECS` que a exercite, ou uma linha de julgamento aqui.** Migração
 * nova de backfill numa tabela sem cobertura reprova nomeando a tabela e o
 * arquivo. E o inverso: spec citado na cobertura tem de estar em `SPECS`, e
 * linha de cobertura sem migração que a sustente é linha morta.
 *
 * O que ela NÃO julga: SE o spec de fato exercita a tabela — isso é o run da
 * própria régua, e o `banco-virgem.ts` roda os specs contra o banco
 * descartável. Aqui se cobra a DECISÃO escrita, não o efeito.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = "scripts/banco-virgem.ts";

/** Sentença de escrita de DADO no começo de linha — schema (`ALTER`, `CREATE`) fica fora. */
const ESCREVE_DADO = /^\s*(update|insert\s+into|delete\s+from)\s+"?([a-z_]+)"?/gim;

function semComentarioSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

type Migracao = { arquivo: string; backfill: string[]; faxina: string[] };

/** As tabelas que cada migração escreve, separando backfill (UPDATE/INSERT) de faxina (DELETE). */
function lerMigracao(arquivo: string, sql: string): Migracao {
  const backfill = new Set<string>();
  const faxina = new Set<string>();
  for (const m of semComentarioSql(sql).matchAll(ESCREVE_DADO)) {
    const verbo = m[1]!.toLowerCase().replace(/\s+/g, " ");
    const tabela = m[2]!;
    if (verbo === "delete from") faxina.add(tabela);
    else backfill.add(tabela);
  }
  return { arquivo, backfill: [...backfill].sort(), faxina: [...faxina].sort() };
}

function migracoes(): Migracao[] {
  return arquivosVersionados(RAIZ, ["docs/migracoes"])
    .filter((f) => f.endsWith(".sql"))
    .map((f) => lerMigracao(f, readFileSync(join(RAIZ, f), "utf8")));
}

/** A constante `SPECS` do script, lida do arquivo — não copiada. */
function specsDaRegua(): string[] {
  const fonte = readFileSync(join(RAIZ, SCRIPT), "utf8");
  const m = /const SPECS = \[([\s\S]*?)\];/.exec(fonte);
  if (!m) return [];
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
}

/**
 * **A cobertura, tabela por tabela — o julgamento que era prosa.**
 *
 * `spec`: qual dos `SPECS` exercita a tabela numa instalação nova.
 * `motivo`: por que nenhum precisa (a tabela nasce vazia numa instalação nova
 * e o backfill só existiu para o dev que tinha dado antigo).
 */
/**
 * E247 (G2 da conferência) — `exercicio` é a PROVA de que o spec exercita a
 * tabela, e não só existe. A régua conferia que o arquivo citado estava em
 * `SPECS`; um spec renomeado por dentro (que parasse de tocar a área) ficaria
 * verde. O regex é a grafia que a cena tem de conter — o gesto, o testid ou a
 * rota — e é lido no fonte do spec.
 */
const COBERTURA: Record<string, { spec: string; exercicio: RegExp } | { motivo: string }> = {
  // E149: a cor virou atributo; o dev tinha o par (Cor, Marfim) pela migração e
  // o banco novo não — foi a S-O73. O `04` abre a ficha e filtra pelo par.
  vestido_atributos: { spec: "e2e/04-vestidos.spec.ts", exercicio: /Marfim|atributo/i },
  // SA26: a grafia do status do vestido (`ATIVO` → `ativo`); o `04` lê o status
  // com rótulo tratado.
  vestidos: { spec: "e2e/04-vestidos.spec.ts", exercicio: /"\/vestidos"|\/vestidos\// },
  // E80, SD26, E172: os perfis do sistema — `sistema`, `acessos_modulos` por
  // módulo×ação, e os módulos `orcamentos`/`contratos`. O `12` prova que o
  // seed sozinho monta a matriz inteira num banco novo.
  perfis: { spec: "e2e/12-permissoes.spec.ts", exercicio: /perfis|permiss/i },
  // E172: os overrides por loja receberam os módulos novos. Instalação nova
  // nasce sem override; o `12` exercita a matriz semeada, e o override é
  // criado e restaurado pelo `46` — que NÃO está na régua. Fica dito.
  perfil_overrides_lojas: {
    motivo:
      "instalação nova não tem override (a tabela nasce vazia); o backfill do E172 corrigia overrides já gravados no dev. O `12-permissoes` cobre os perfis-base.",
  },
  // E72: o vínculo contrato↔bloqueio saiu do 1:1 legado para a tabela; o `52`
  // fecha o contrato com a reserva inline e é o único que CRIA o vínculo.
  contrato_bloqueios: { spec: "e2e/52-orcamento-vira-contrato.spec.ts", exercicio: /Gerar contrato/ },
  // S16: o carimbo do contrato na noiva (`contrato_id`), backfillado do que já
  // existia. O `52` fecha um contrato novo, e o carimbo nasce com ele.
  leads: { spec: "e2e/52-orcamento-vira-contrato.spec.ts", exercicio: /leadsTable|\/leads/ },
  // S26: a origem da parcela (`PLANO`/`AVULSA`), backfillada nas de antes. O
  // `52` fecha o contrato e o carnê nasce com origem.
  parcelas: { spec: "e2e/52-orcamento-vira-contrato.spec.ts", exercicio: /parcela/i },
  // E97: `contato_em`/`confirmado_em` do atendimento, backfillados do legado.
  atendimentos: {
    motivo:
      "instalação nova nasce sem atendimento; o backfill do E97 preencheu colunas do que o dev já tinha. Os specs da agenda (`22`, `25`) exercitam as colunas, e nenhum está na régua — se a área der defeito de instalação nova, é ela a candidata ao quarto spec.",
  },
};

describe("varredura — a régua do banco virgem cobre o que as migrações backfillaram (S-O103)", () => {
  const todas = migracoes();
  const comBackfill = todas.filter((m) => m.backfill.length > 0);
  const specs = specsDaRegua();

  it("enumera pelo versionamento e tem piso — 60 migrações e 3 specs em 2026-08-15", () => {
    expect(todas.length, "migrações versionadas em docs/migracoes").toBeGreaterThanOrEqual(50);
    expect(specs.length, "a constante SPECS do banco-virgem.ts foi lida").toBeGreaterThanOrEqual(3);
    // Os specs da régua existem no versionamento — renomear um spec sem tocar
    // no script deixaria a régua rodando nada.
    const versionados = new Set(arquivosVersionados(RAIZ, ["e2e"]));
    for (const s of specs) expect(versionados, `${s} está em SPECS e não está versionado`).toContain(s);
  });

  it("o leitor separa backfill de faxina, e ignora comentário, `ON UPDATE` e `FOR UPDATE`", () => {
    const sql = `
      -- Nenhum UPDATE aqui: só o comentário fala dele.
      ALTER TABLE "x" ADD CONSTRAINT "x_fk" FOREIGN KEY ("y") REFERENCES "z"("id") ON DELETE cascade ON UPDATE no action;
      /* a rota tranca a linha com FOR UPDATE e relê */
      UPDATE perfis SET sistema = true WHERE nome = 'Dona';
      insert into vestido_atributos (vestido_id, atributo_id, opcao_id) select 1, 2, 3;
      DELETE FROM cabines c WHERE c.nome LIKE 'E2E%';
    `;
    const m = lerMigracao("prova.sql", sql);
    expect(m.backfill).toEqual(["perfis", "vestido_atributos"]);
    expect(m.faxina).toEqual(["cabines"]);
    expect(lerMigracao("limpa.sql", "ALTER TABLE a ADD COLUMN b text;").backfill).toEqual([]);
  });

  it("16 migrações escrevem dado — 10 backfillam, 6 são faxina — e a conta está travada", () => {
    // Retrato travado (regra da casa): migração nova de backfill sobe o 9 e
    // obriga a linha de cobertura abaixo; faxina nova sobe o 6 e não obriga
    // nada — o rastro de teste não existe numa instalação nova.
    const soFaxina = todas.filter((m) => m.backfill.length === 0 && m.faxina.length > 0);
    expect(comBackfill.map((m) => m.arquivo).sort()).toEqual([
      "docs/migracoes/2026-07-22-e72-contrato-bloqueios.sql",
      "docs/migracoes/2026-07-22-e80-perfil-sistema.sql",
      "docs/migracoes/2026-07-27-e97-contato-e-confirmacao.sql",
      "docs/migracoes/2026-08-04-e149-cor-para-atributo.sql",
      "docs/migracoes/2026-08-05-s26-origem-da-parcela.sql",
      "docs/migracoes/2026-08-06-s16-carimbo-do-contrato-no-lead.sql",
      "docs/migracoes/2026-08-07-sa26-grafia-do-status-do-vestido.sql",
      "docs/migracoes/2026-08-07-sd26-perfis-para-modulo-x-acao.sql",
      "docs/migracoes/2026-08-12-e172-modulos-orcamentos-e-contratos.sql",
      // S-A27 (ec53e2d6, 16/08): o Tipo de peça das 132 peças do legado —
      // backfilla `vestido_atributos`, que a régua já cobre pelo spec 04.
      // Entrou depois desta lista e a suíte ficou vermelha no `main` até o
      // E241 passar por aqui (regra 18).
      "docs/migracoes/2026-08-16-s-a27-tipo-de-peca-do-legado.sql",
    ]);
    expect(soFaxina.length).toBe(6);
  });

  it("toda tabela backfillada por migração tem spec na régua ou julgamento escrito", () => {
    const semCobertura: string[] = [];
    for (const m of comBackfill) {
      for (const t of m.backfill) {
        if (!(t in COBERTURA)) semCobertura.push(`${t} (${m.arquivo})`);
      }
    }
    expect(
      semCobertura,
      "migração backfillou uma tabela que nenhum spec de instalação nova exercita — ponha o spec em SPECS e aqui, ou escreva o motivo",
    ).toEqual([]);
  });

  it("todo spec citado na cobertura está em SPECS, e nenhuma linha da cobertura é morta", () => {
    const citados = [...new Set(Object.values(COBERTURA).flatMap((c) => ("spec" in c ? [c.spec] : [])))];
    for (const s of citados) expect(specs, `${s} é citado como cobertura e não está em SPECS do ${SCRIPT}`).toContain(s);
    // E247 (G2): e EXERCITA a tabela — o regex de cada linha casa com o fonte do spec.
    for (const [tabela, c] of Object.entries(COBERTURA)) {
      if (!("spec" in c)) continue;
      const fonte = readFileSync(join(RAIZ, c.spec), "utf8");
      expect(c.exercicio.test(fonte), `${c.spec} é citado como cobertura de ${tabela} e não contém ${c.exercicio}`).toBe(true);
    }
    const backfilladas = new Set(comBackfill.flatMap((m) => m.backfill));
    const mortas = Object.keys(COBERTURA).filter((t) => !backfilladas.has(t));
    expect(mortas, "tabela na cobertura que migração nenhuma backfilla — apague a linha").toEqual([]);
  });
});
