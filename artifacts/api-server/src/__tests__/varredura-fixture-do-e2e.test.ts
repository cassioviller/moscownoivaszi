import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-O101 — **spec que escreve no banco compartilhado apaga o que escreveu, e a
 * limpeza mora num HOOK.**
 *
 * O banco do E2E persiste entre execuções, e o que um spec deixa de pé chega ao
 * próximo como fixture invisível. Medido no E190: o `45-portal-noiva` apagava o
 * contrato no CORPO do teste, então qualquer falha antes da última linha o
 * deixava vivo; o `afterAll` estourava em `Failed query: delete from "leads"`
 * (`contratos.lead_id` é RESTRICT) e **a cabine ia junto**. Dois runs vermelhos
 * deixaram 2 leads, 2 contratos e 2 cabines, e a cabine extra derrubou
 * `18-agenda-grade:138` no run seguinte — a grade desenha uma coluna por
 * cabine.
 *
 * A distinção que esta régua faz é a que o defeito ensinou: **limpar no corpo
 * do teste não é limpar.** O corpo não roda até o fim quando o teste falha, e é
 * justamente o run vermelho que suja o banco. Só `afterAll`/`afterEach` contam.
 *
 * **O cascade não é julgado à mão — é DERIVADO do schema.** Apagar o lead leva
 * o orçamento e os itens dele; apagar o contrato leva as parcelas. Escrever
 * isso numa tabela de julgamento seria uma segunda cópia do `onDelete` do
 * drizzle, que apodrece na primeira migração (regra 26). A varredura lê os
 * `references(... onDelete: "cascade")` de `lib/db/src/schema` e fecha o grafo.
 *
 * **A régua é da CLASSE, não do sintoma**: hoje ela passa nos 10 specs que
 * escrevem — o `45` foi consertado no E190, e o `52-orcamento-vira-contrato`
 * (S-O105) apaga contrato, bloqueio, lead e vestido no `afterAll`, então o que
 * ele cria no dev é apagado no dev. O que ela impede é o 11º nascer sujo.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/** `db.insert(xTable)` — a escrita direta, que é a que persiste sem a API. */
const INSERE = /\.insert\((\w+Table)\)/g;
/** `db.delete(xTable)` dentro de um hook. */
const APAGA = /\.delete\((\w+Table)\)/g;

/**
 * O corpo de cada `test.afterAll(...)` / `test.afterEach(...)`, por contagem de
 * parênteses. Regex não casa bloco aninhado, e um `slice` até o próximo `})`
 * cortaria no primeiro callback interno.
 */
function corpoDosHooks(fonte: string): string {
  let corpo = "";
  const abre = /test\.(?:afterAll|afterEach)\(/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(fonte)) !== null) {
    const inicio = abre.lastIndex - 1;
    let profundidade = 0;
    for (let i = inicio; i < fonte.length; i++) {
      if (fonte[i] === "(") profundidade++;
      else if (fonte[i] === ")") {
        profundidade--;
        if (profundidade === 0) {
          corpo += fonte.slice(inicio, i);
          break;
        }
      }
    }
  }
  return corpo;
}

/** Filho → pais cujo DELETE o leva junto, lido do `onDelete: "cascade"`. */
function grafoDeCascade(): Map<string, string[]> {
  const grafo = new Map<string, string[]>();
  for (const relativo of arquivosVersionados(RAIZ, ["lib/db/src/schema"])) {
    if (!relativo.endsWith(".ts")) continue;
    const fonte = readFileSync(join(RAIZ, relativo), "utf8");
    const marcas = [...fonte.matchAll(/export const (\w+Table)\s*=\s*pgTable\(/g)];
    marcas.forEach((marca, i) => {
      const fim = i + 1 < marcas.length ? marcas[i + 1]!.index : fonte.length;
      const corpo = fonte.slice(marca.index, fim);
      const pais = [
        ...corpo.matchAll(/references\(\(\)\s*=>\s*(\w+Table)\.\w+,\s*\{\s*onDelete:\s*"cascade"/g),
      ].map((r) => r[1]!);
      if (pais.length > 0) grafo.set(marca[1]!, [...new Set([...(grafo.get(marca[1]!) ?? []), ...pais])]);
    });
  }
  return grafo;
}

/** A tabela some quando algum dos `apagados` some — direto ou por cascade. */
function coberta(tabela: string, apagados: Set<string>, grafo: Map<string, string[]>): boolean {
  const vistos = new Set<string>();
  const fila = [tabela];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (apagados.has(atual)) return true;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    fila.push(...(grafo.get(atual) ?? []));
  }
  return false;
}

/** As tabelas que o spec escreve e nenhum hook apaga — direto ou por cascade. */
function naoCobertas(fonte: string, grafo: Map<string, string[]>): string[] {
  const inseridas = [...new Set([...fonte.matchAll(INSERE)].map((m) => m[1]!))];
  if (inseridas.length === 0) return [];
  const apagadas = new Set([...corpoDosHooks(fonte).matchAll(APAGA)].map((m) => m[1]!));
  return inseridas.filter((t) => !coberta(t, apagadas, grafo));
}

function specs(): string[] {
  return arquivosVersionados(RAIZ, ["e2e"]).filter((r) => r.endsWith(".spec.ts"));
}

describe("varredura — o que o spec escreve no banco, o hook apaga (S-O101)", () => {
  const grafo = grafoDeCascade();

  it("o grafo de cascade sai do schema, e não de uma lista à mão", () => {
    // Piso de população: conjunto vazio aprovaria todo spec em silêncio.
    expect(grafo.size, "nenhum `onDelete: cascade` lido — o parser do schema quebrou").toBeGreaterThanOrEqual(30);
    // As duas arestas que o defeito da S-O101 percorreu, medidas:
    expect(grafo.get("orcamentosTable"), "apagar a noiva leva o orçamento dela").toContain("leadsTable");
    expect(grafo.get("parcelasTable"), "apagar o contrato leva o carnê").toContain("contratosTable");
    // E a que NÃO existe, que é a razão de o `afterAll` do 45 estourar:
    expect(grafo.get("contratosTable") ?? [], "contrato NÃO cai com a noiva — a FK é RESTRICT").not.toContain(
      "leadsTable",
    );
  });

  it("o leitor de hook enxerga o `afterAll` inteiro, inclusive callback aninhado", () => {
    const fonte = `
      test.afterAll(async () => {
        await db.delete(contratosTable).where(eq(contratosTable.id, id));
        await Promise.all(ids.map((i) => db.delete(leadsTable).where(eq(leadsTable.id, i))));
      });
      test("nao conta", async () => { await db.delete(vestidosTable); });
    `;
    const corpo = corpoDosHooks(fonte);
    expect(corpo).toContain("contratosTable");
    expect(corpo, "o `delete` dentro do map do hook conta").toContain("leadsTable");
    expect(corpo, "o `delete` do CORPO do teste não conta — ele não roda no vermelho").not.toContain(
      "vestidosTable",
    );
  });

  /**
   * **A régua nasceu verde, e régua verde de nascença não prova nada** (regra
   * 34). Este caso é o defeito da S-O101 escrito à mão: o contrato é apagado no
   * CORPO do teste — que não roda quando o teste falha —, e o `afterAll` só
   * alcança o lead, que não leva o contrato junto porque a FK é RESTRICT. É
   * exatamente o `45-portal-noiva` como ele estava antes do E190.
   */
  it("a régua REPROVA o defeito que a fez nascer", () => {
    const comoEra = `
      test("a noiva aceita pelo portal", async () => {
        await db.insert(contratosTable).values({ id, leadId });
        await db.delete(contratosTable).where(eq(contratosTable.id, id));
      });
      test.afterAll(async () => {
        await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
      });
    `;
    expect(naoCobertas(comoEra, grafo), "contrato apagado só no corpo do teste").toEqual([
      "contratosTable",
    ]);

    const comoFicou = comoEra.replace(
      "await db.delete(leadsTable)",
      "await db.delete(contratosTable).where(eq(contratosTable.leadId, leadId));\n        await db.delete(leadsTable)",
    );
    expect(naoCobertas(comoFicou, grafo), "a mesma limpeza, movida para o hook").toEqual([]);

    // E a cobertura por cascade, que é o que dispensa apagar item por item:
    const porCascade = `
      test.afterAll(async () => { await db.delete(leadsTable); });
      test("x", async () => { await db.insert(orcamentoItensTable).values({}); });
    `;
    expect(naoCobertas(porCascade, grafo), "orçamento e itens caem com a noiva").toEqual([]);
  });

  it("todo spec que insere no banco tem a limpeza num hook", () => {
    const ofensores: string[] = [];
    for (const relativo of specs()) {
      const descobertas = naoCobertas(readFileSync(join(RAIZ, relativo), "utf8"), grafo);
      if (descobertas.length > 0) ofensores.push(`${relativo}: ${descobertas.join(", ")}`);
    }
    expect(
      ofensores,
      "o spec escreve no banco compartilhado e nada o apaga num hook — o próximo run herda a fixture",
    ).toEqual([]);
  });

  /**
   * S-C75 — o critério da S-C46 aplicado aqui: **escrever direto no banco
   * compartilhado é DÍVIDA, e dívida é RETRATO, não piso.** Este teste dizia
   * `>= 8` enquanto a própria prosa media 10 — dois specs de folga em que o
   * 11º e o 12º entrariam sem uma linha de explicação. O retrato é NOMEADO:
   * o spec novo que inserir direto fica vermelho aqui com o próprio nome, e o
   * vermelho é o único lugar onde alguém escreve POR QUE ele precisa escrever
   * por baixo da API.
   *
   * A população segue PISO, e é o único do arquivo: spec de E2E nasce toda
   * semana por motivo que nada tem a ver com escrita direta, e travar 65
   * cobraria remedida de quem encenou uma tela nova (S-C46). Medido em
   * 2026-08-15: 65 specs.
   */
  it("a população tem piso, e a dívida de quem escreve direto é retrato nomeado", () => {
    const todos = specs();
    // `INSERE.test(...)` seria um defeito silencioso: com a flag `/g` o `test`
    // guarda `lastIndex` entre chamadas e pula um arquivo a cada dois. O
    // `matchAll` não carrega estado — é a mesma razão pela qual ele é usado
    // acima.
    const comEscrita = todos.filter(
      (r) => [...readFileSync(join(RAIZ, r), "utf8").matchAll(INSERE)].length > 0,
    );
    expect(todos.length, "specs versionados").toBeGreaterThanOrEqual(60);
    expect(comEscrita.sort(), "specs que escrevem direto no banco — a dívida, nomeada").toEqual([
      "e2e/23-prova-data-real.spec.ts",
      "e2e/26-prova-ocupa-intervalo.spec.ts",
      "e2e/38-serie-comissao.spec.ts",
      "e2e/44-sino-e-mensagens.spec.ts",
      "e2e/45-portal-noiva.spec.ts",
      "e2e/47-conciliacao.spec.ts",
      "e2e/48-avaria-vira-parcela.spec.ts",
      "e2e/52-orcamento-vira-contrato.spec.ts",
      "e2e/61-link-publico.spec.ts",
      "e2e/62-avaria-fecha.spec.ts",
    ]);
  });
});
