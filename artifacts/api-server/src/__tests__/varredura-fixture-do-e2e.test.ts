import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import { corpoSeguindoChamadas, lerRotas } from "./schemas-aninhados";

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

/**
 * S-O118/E239 — **o que o spec cria ATRAVÉS da aplicação também é escrita.**
 *
 * Até aqui a régua enxergava `db.insert` — a escrita direta — e o spec que
 * criava o contrato por `request.post(`${API_URL}/api/lojas/…/contratos`)`
 * ficava invisível para ela, embora deixasse no banco de dev exatamente o
 * mesmo rastro. A varredura das cabines (S-D25) fechava isso para UMA rota,
 * com um regex de `.post(…/cabines)`; a forma geral é a da regra 22: cruzar as
 * rotas de criação do ROTEADOR (o `router.post` e as tabelas em que o handler
 * insere, seguindo a chamada como o motor da `varredura-schemas-aninhados` já
 * faz) com os `.post(`…`)` de cada spec.
 *
 * Medido em 2026-08-15, antes de escrever: **66 `router.post` no roteador,
 * 113 pares (spec, rota) fora de `/api/auth`, todos com handler** — a rota mais
 * chamada é `POST /leads` (22 specs), depois `POST /contratos` (12), que
 * insere em CINCO tabelas (`contratos`, `parcelas`, `contrato_itens`,
 * `contrato_bloqueios`, `audit_log`).
 *
 * O que fica FORA, dito: o que o spec cria CLICANDO (`getByRole("button")`)
 * não tem forma estática — o botão não diz a rota que chama. É a metade que
 * só o run vê, e o placar dele é a régua (S-O93).
 */
const CHAMA_POST = /\.post\(\s*`([^`]*)`/g;
/** `request.delete(`…`)` num hook — a limpeza feita pela porta da API. */
const CHAMA_DELETE = /\.delete\(\s*`([^`]*)`/g;

/**
 * Escrita COLATERAL, que não é fixture — dita, com o motivo de cada linha:
 *
 * - `audit_log`: a trilha é o rastro de todo gesto; a linha fica quando a
 *   entidade some (o `entidadeId` não tem FK) e cai com a loja. Cobrá-la aqui
 *   obrigaria todo spec a apagar trilha, que é exatamente o que a casa não faz.
 * - `sessoes`: o `POST /auth/login` cria a sessão de quem encena o spec. Ela
 *   tem `expira_em`, e o próprio login apaga as sessões anteriores do mesmo
 *   usuário (`lib/auth.ts` — `delete(sessoesTable).where(usuarioId)`): o run
 *   seguinte recolhe a deste. Medido em 2026-08-15: sem esta linha, **44 dos
 *   65 specs** reprovariam só por terem feito login pela API.
 */
const ESCRITA_COLATERAL = new Set(["auditLogTable", "sessoesTable"]);

/**
 * Os helpers de limpeza moram em `e2e/helpers.ts` (`apagarCabineCriada`,
 * `apagarReservaDeProva`), e o hook os CHAMA em vez de escrever o `delete`.
 * O leitor de hook segue a chamada um nível — é a S-O114 pelo lado do E2E:
 * ler só o corpo do hook diria que a cabine do `18-agenda-grade` fica de pé,
 * e o `apagarCabineCriada` a apaga junto com os atendimentos dela.
 */
function funcoesDosHelpers(): Map<string, string> {
  const fonte = readFileSync(join(RAIZ, "e2e/helpers.ts"), "utf8");
  const mapa = new Map<string, string>();
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const abre = re.lastIndex - 1;
    let profundidade = 0;
    for (let i = abre; i < fonte.length; i++) {
      if (fonte[i] === "{") profundidade++;
      else if (fonte[i] === "}") {
        profundidade--;
        if (profundidade === 0) {
          mapa.set(m[1]!, fonte.slice(abre, i));
          break;
        }
      }
    }
  }
  return mapa;
}

function corpoDosHooksSeguindoHelpers(fonte: string, helpers: Map<string, string>): string {
  let corpo = corpoDosHooks(fonte);
  for (const m of corpo.matchAll(/\b(\w+)\s*\(/g)) {
    const h = helpers.get(m[1]!);
    if (h) corpo += "\n" + h;
  }
  return corpo;
}

/**
 * O roteador lido pelas duas pontas: rota normalizada (`/lojas/:p/leads`) →
 * tabelas em que o `router.post` INSERE, e → tabelas que o `router.delete`
 * APAGA (a limpeza que um hook faz por `request.delete` conta como `db.delete`).
 */
type RotasDoRoteador = { cria: Map<string, string[]>; apaga: Map<string, string[]> };

function rotasDoRoteador(): RotasDoRoteador {
  const { handlers, funcoes } = lerRotas();
  const cria = new Map<string, string[]>();
  const apaga = new Map<string, string[]>();
  for (const h of handlers) {
    if (h.metodo !== "post" && h.metodo !== "delete") continue;
    const corpo = corpoSeguindoChamadas(h.corpo, funcoes);
    const rota = h.rota.replace(/:[A-Za-z0-9_]+/g, ":p");
    if (h.metodo === "post") {
      cria.set(
        rota,
        [...new Set([...corpo.matchAll(INSERE)].map((m) => m[1]!))].filter((t) => !ESCRITA_COLATERAL.has(t)),
      );
    } else {
      apaga.set(rota, [...new Set([...corpo.matchAll(APAGA)].map((m) => m[1]!))]);
    }
  }
  return { cria, apaga };
}

function rotaDoSpec(url: string): string {
  return url.replace(/\$\{[^}]+\}/g, ":p").split("?")[0]!.replace(/^.*?\/api/, "");
}

/** As tabelas que o spec preenche pela API — o `.post` casado com o roteador. */
function inseridasPelaApi(fonte: string, rotas: RotasDoRoteador): string[] {
  const out = new Set<string>();
  for (const m of fonte.matchAll(CHAMA_POST)) for (const t of rotas.cria.get(rotaDoSpec(m[1]!)) ?? []) out.add(t);
  return [...out];
}

/** As tabelas que os hooks apagam — por `db.delete`, pelos helpers, ou pela porta `DELETE` da API. */
function apagadasNosHooks(fonte: string, rotas: RotasDoRoteador, helpers: Map<string, string>): Set<string> {
  const corpo = corpoDosHooksSeguindoHelpers(fonte, helpers);
  const out = new Set([...corpo.matchAll(APAGA)].map((m) => m[1]!));
  for (const m of corpo.matchAll(CHAMA_DELETE)) for (const t of rotas.apaga.get(rotaDoSpec(m[1]!)) ?? []) out.add(t);
  return out;
}

function naoCobertasPelaApi(
  fonte: string,
  grafo: Map<string, string[]>,
  rotas: RotasDoRoteador,
  helpers: Map<string, string> = new Map(),
): string[] {
  const inseridas = inseridasPelaApi(fonte, rotas);
  if (inseridas.length === 0) return [];
  return inseridas.filter((t) => !coberta(t, apagadasNosHooks(fonte, rotas, helpers), grafo));
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

  /**
   * S-O118/E239 — a segunda ponta: **a escrita que passa pela API.**
   */
  describe("o que o spec cria pela API também precisa de hook (S-O118)", () => {
    const rotas = rotasDoRoteador();
    const helpers = funcoesDosHelpers();

    it("o roteador é lido inteiro, e as rotas de criação dizem em que tabelas escrevem", () => {
      // Piso: 66 `router.post` em 2026-08-15. Sem piso, um regex quebrado
      // devolveria mapa vazio e aprovaria todo spec.
      expect(rotas.cria.size, "`router.post` lidos do api-server").toBeGreaterThanOrEqual(50);
      expect(rotas.apaga.size, "`router.delete` lidos do api-server").toBeGreaterThanOrEqual(15);
      expect(rotas.apaga.get("/lojas/:p/contas-pagar/:p"), "apagar a conta pela API apaga `contas_pagar`").toContain("contasPagarTable");
      expect(rotas.cria.get("/lojas/:p/leads"), "criar a noiva escreve em `leads`").toEqual(["leadsTable"]);
      // A rota que mais escreve: cinco tabelas, e a trilha fica de fora por decisão.
      expect(rotas.cria.get("/lojas/:p/contratos")).toEqual(
        expect.arrayContaining(["contratosTable", "parcelasTable", "contratoItensTable", "contratoBloqueiosTable"]),
      );
      expect(rotas.cria.get("/lojas/:p/contratos")).not.toContain("auditLogTable");
    });

    it("o leitor de `.post` casa a URL do spec com a rota do roteador, com ou sem API_URL", () => {
      const fonte = `
        await request.post(\`\${API_URL}/api/lojas/\${estado.lojaId}/leads\`, { data: {} });
        await page.request.post(\`/api/lojas/\${lojaId}/contratos\`, { data: {} });
        await request.post(\`\${API_URL}/api/auth/login\`, { data: {} });
        await request.post(\`\${API_URL}/api/lojas/\${id}/orcamentos/\${o}/link?x=1\`);
      `;
      const achadas = inseridasPelaApi(fonte, rotas).sort();
      expect(achadas).toContain("leadsTable");
      expect(achadas).toContain("contratosTable");
      expect(achadas, "a query string não atrapalha o casamento").toContain("orcamentoVersoesTable");
      // Login não cria nada; um `.post` sem casamento é ignorado, não inventado.
      expect(inseridasPelaApi("await request.post(`${API_URL}/api/rota/que/nao/existe`)", rotas)).toEqual([]);
    });

    it("a régua REPROVA o contrato criado pela API e não apagado — e aprova o hook", () => {
      const semHook = `
        test("fecha o contrato", async ({ request }) => {
          await request.post(\`\${API_URL}/api/lojas/\${lojaId}/contratos\`, { data: {} });
        });
        test.afterAll(async () => { await db.delete(leadsTable).where(eq(leadsTable.id, leadId)); });
      `;
      // A noiva cai no hook, mas o contrato é RESTRICT — e as parcelas caem COM
      // o contrato, então a única linha que falta é a dele.
      expect(naoCobertasPelaApi(semHook, grafo, rotas)).toEqual(["contratosTable", "parcelasTable", "contratoItensTable"]);
      const comHook = semHook.replace(
        "await db.delete(leadsTable)",
        "await db.delete(contratosTable).where(eq(contratosTable.leadId, leadId));\n await db.delete(leadsTable)",
      );
      expect(naoCobertasPelaApi(comHook, grafo, rotas)).toEqual([]);
    });

    it("todo spec que cria pela API tem a limpeza num hook, ou está na dívida com motivo", () => {
      const ofensores: string[] = [];
      for (const relativo of specs()) {
        const descobertas = naoCobertasPelaApi(readFileSync(join(RAIZ, relativo), "utf8"), grafo, rotas, helpers);
        if (descobertas.length > 0) ofensores.push(`${relativo}: ${descobertas.join(", ")}`);
      }
      expect(ofensores.sort()).toEqual(Object.keys(CRIA_PELA_API_SEM_HOOK).sort());
    });

    it("a dívida não guarda linha morta", () => {
      const vivos = new Set(
        specs().filter((r) => naoCobertasPelaApi(readFileSync(join(RAIZ, r), "utf8"), grafo, rotas, helpers).length > 0)
          .map((r) => `${r}: ${naoCobertasPelaApi(readFileSync(join(RAIZ, r), "utf8"), grafo, rotas, helpers).join(", ")}`),
      );
      const mortas = Object.keys(CRIA_PELA_API_SEM_HOOK).filter((k) => !vivos.has(k));
      expect(mortas, "linha da dívida que já não reprova — apague-a").toEqual([]);
    });
  });
});

/**
 * **A dívida de quem cria pela API e não recolhe num hook — 9 de 65 specs,
 * medidos em 2026-08-15, cada linha com o julgamento.**
 *
 * A régua nasceu VERMELHA (regra 34): nove specs, e nenhum deles é o
 * `52-orcamento-vira-contrato` que a sobra citava — ele apaga contrato,
 * bloqueio, lead e vestido no `afterAll`, e a régua o vê verde. O que ela
 * achou é de três classes, e a classe decide o que fazer:
 *
 * - **rastro de verdade**, que o run seguinte herda: as contas a pagar e os
 *   pagamentos do `15` e do `33`, a regra de comissão do `41`, o saldo de
 *   referência do `32`, a conta da rescisão do `62`. Cada um pede um
 *   `delete` no hook — e o E2E precisa rodar para provar que o hook não
 *   derruba o spec seguinte, o que é trabalho de quem tem a porta (S-O130).
 * - **decisão escrita no próprio spec**: o `39` e o `40` CANCELAM o contrato
 *   em vez de apagá-lo (*"sem apagar o histórico"*), e a noiva fica; o `06`
 *   recolhe no COMEÇO do run seguinte (o `request.delete` antes do `post`).
 *   São padrões que a régua não distingue de esquecimento, e ficam ditos.
 * - **falso positivo do detector**: o `12` faz `POST /contas-pagar` para
 *   ouvir **403** — a régua lê a rota e não o status esperado.
 *
 * Linha paga sai daqui (o teste ao lado cobra); linha nova entra com motivo,
 * ou o spec ganha o hook.
 */
const CRIA_PELA_API_SEM_HOOK: Record<string, string> = {
  "e2e/06-agenda.spec.ts: atendimentosTable":
    "o atendimento do dia fixo (2028-02-14) é recolhido no COMEÇO do run seguinte, pelo `request.delete` que precede o `post` — limpeza de partida, não de hook.",
  "e2e/12-permissoes.spec.ts: contasPagarTable":
    "o `POST /contas-pagar` é da Recepção e espera 403 — nada nasce; a régua lê a rota, não o status.",
  "e2e/15-onda5-pdf-e-folha.spec.ts: contasPagarTable, pagamentosTable, pagamentoItensTable":
    "rastro real: `recorrencias/gerar` cria as contas de 2025-01 e o spec paga uma; sem hook. S-O130.",
  "e2e/32-alerta-caixa.spec.ts: saldosReferenciaTable":
    "rastro real: o saldo de referência de R$ 100.000 do dia fica (a conta a pagar é apagada pela API no hook, e a régua vê). S-O130.",
  "e2e/33-auditoria-filtros.spec.ts: contasPagarTable, pagamentosTable, pagamentoItensTable":
    "rastro real: a conta de R$ 123,45 e o pagamento dela ficam; sem hook. S-O130.",
  "e2e/39-pendencias-comissao.spec.ts: leadsTable, contratosTable, parcelasTable, contratoItensTable, contratoBloqueiosTable":
    "decisão do spec: o hook CANCELA o contrato em vez de apagá-lo (\"sem apagar o histórico\"), e a noiva fica com ele.",
  "e2e/40-reabrir-fechamento.spec.ts: leadsTable, contratosTable, parcelasTable, contratoItensTable, contratoBloqueiosTable, contasPagarTable":
    "decisão do spec para o contrato (cancelado, não apagado); a conta a pagar do fechamento de comissão fica. S-O130.",
  "e2e/41-colocacao-comissao.spec.ts: comissaoRegrasTable, comissaoFaixasTable":
    "rastro real: o hook apaga contratos e noivas e deixa a REGRA de comissão criada; sem hook para ela. S-O130.",
  "e2e/62-avaria-fecha.spec.ts: contasPagarTable":
    "rastro real: o `POST /cancelar` cria a conta a pagar da devolução (13ª §3º) e o hook apaga contrato, vestido, reserva e noiva — a conta não cai com nenhum deles. S-O130.",
};
