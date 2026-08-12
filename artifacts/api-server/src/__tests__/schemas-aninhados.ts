import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * E192/S-O76 — **quem serializa este schema aninhado?**
 *
 * O `openapi.yaml` é a fonte da verdade do contrato, e ele descreve a resposta
 * em CAMADAS: uma operação aponta um schema, esse schema aponta outros por
 * `$ref`, e esses apontam outros. A pergunta *"esta operação entrega mesmo o
 * objeto que ela promete três níveis abaixo?"* nunca teve resposta de máquina —
 * a `varredura-restricoes-do-spec` (E177) lê o YAML como TEXTO, e **nenhuma
 * varredura do repositório resolvia `$ref`**.
 *
 * A conta foi feita à mão três vezes, e as três saíram erradas:
 *
 * - o **E167** disse *"só o `GET` e o `PATCH` trazem `donoLeadId`"* — eram
 *   **5** portas dentro de `reservas.ts`;
 * - o **E179** disse *"11 operações fora de `reservas.ts`"* — eram **10**;
 * - o **E185** achou, ao medir, que `Atendimento.ajustes[].atendimento` era
 *   declarado e **nunca preenchido** (a S-O75, fechada no E192).
 *
 * Este módulo é o motor: ele resolve o `$ref` TRANSITIVO do spec e o cruza com
 * o `with` da consulta relacional que monta a resposta (regra 22 — o defeito
 * entre dois arquivos se pega cruzando o que cada um DECLARA). O teste ao lado
 * (`varredura-schemas-aninhados.test.ts`) conta, julga e trava a contagem.
 *
 * **Enumera pelo versionamento** (`git ls-files`, a régua da casa): 65% do que
 * o disco devolve em sessão com agentes é cópia de worktree órfão.
 *
 * ## Os pontos cegos, declarados
 *
 * 1. **Só enxerga objeto aninhado** (propriedade que resolve para outro schema
 *    por `$ref`). Campo escalar declarado e não preenchido não aparece aqui —
 *    a maioria sai de `select()` sem recorte, e o zod da resposta os cobra.
 * 2. **A FRONTEIRA.** Só se pergunta por um caminho cujo PAI a operação
 *    entrega: promessa que não se alcança não é promessa. `a.b.c` só é contada
 *    quando `a.b` chegou.
 * 3. **O `with` é lido por TEXTO**, expandindo constantes (`ATENDIMENTO_WITH`,
 *    `...MAE_DO_BLOQUEIO`) e o literal montado à mão na resposta
 *    (`res.json`, `.parse({…})`, `return {…}`). Serializador que mora em
 *    OUTRA função — `lib/backup.ts`, `montarOrcamentoPublico` — não é seguido,
 *    e por isso o que ele monta cai na tabela `MONTADO_FORA_DO_HANDLER` do
 *    teste, com o endereço escrito.
 */

export const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");
export const SPEC = "lib/api-spec/openapi.yaml";

export function versionado(arquivo: string): string {
  const saida = execFileSync("git", ["ls-files", arquivo], { cwd: RAIZ, encoding: "utf8" }).trim();
  if (!saida) throw new Error(`${arquivo} não está versionado — a varredura leria o disco`);
  return readFileSync(path.join(RAIZ, arquivo), "utf8");
}

// ───────────────────────── o spec, com `$ref` resolvido ─────────────────────

type LinhaYaml = { indent: number; texto: string; n: number };
const REF = /\$ref:\s*"#\/components\/schemas\/([A-Za-z0-9_]+)"/;
const METODOS = ["get", "post", "patch", "put", "delete"];

export type Propriedade = { nome: string; ref: string | null; linha: number };
export type Operacao = { rota: string; metodo: string; operationId: string; raiz: string | null };

function linhasDoYaml(fonte: string): LinhaYaml[] {
  const out: LinhaYaml[] = [];
  fonte.split("\n").forEach((l, i) => {
    if (!l.trim()) return;
    const texto = l.trim();
    if (texto.startsWith("#")) return;
    out.push({ indent: l.length - l.trimStart().length, texto, n: i + 1 });
  });
  return out;
}

/** O spec lido: cada schema com as propriedades que apontam OUTRO schema. */
export function lerSpec(fonte: string): { schemas: Map<string, Propriedade[]>; operacoes: Operacao[] } {
  const linhas = linhasDoYaml(fonte);
  const filhos = (i: number): number[] => {
    const base = linhas[i]!.indent;
    const out: number[] = [];
    for (let j = i + 1; j < linhas.length; j++) {
      if (linhas[j]!.indent <= base) break;
      out.push(j);
    }
    return out;
  };
  const textoDosFilhos = (i: number) => filhos(i).map((j) => linhas[j]!.texto).join("\n");

  const schemas = new Map<string, Propriedade[]>();
  const iSchemas = linhas.findIndex((l) => l.indent === 2 && l.texto === "schemas:");
  for (const j of filhos(iSchemas)) {
    if (linhas[j]!.indent !== 4) continue;
    const m = /^([A-Za-z0-9_]+):$/.exec(linhas[j]!.texto);
    if (!m) continue;
    const props: Propriedade[] = [];
    for (const k of filhos(j)) {
      if (linhas[k]!.indent !== 6 || linhas[k]!.texto !== "properties:") continue;
      for (const p of filhos(k)) {
        if (linhas[p]!.indent !== 8) continue;
        const pm = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(linhas[p]!.texto);
        if (!pm) continue;
        // A propriedade inteira: a cauda da própria linha (forma inline) mais o
        // bloco abaixo dela (`$ref:`, `items:`, `anyOf:`).
        const corpo = [pm[2]!, textoDosFilhos(p)].join("\n");
        const r = REF.exec(corpo);
        props.push({ nome: pm[1]!, ref: r ? r[1]! : null, linha: linhas[p]!.n });
      }
    }
    schemas.set(m[1]!, props);
  }

  const operacoes: Operacao[] = [];
  const iPaths = linhas.findIndex((l) => l.indent === 0 && l.texto === "paths:");
  for (const j of filhos(iPaths)) {
    if (linhas[j]!.indent !== 2) continue;
    const pm = /^(\/[^:]*):$/.exec(linhas[j]!.texto);
    if (!pm) continue;
    for (const k of filhos(j)) {
      if (linhas[k]!.indent !== 4) continue;
      const mm = /^([a-z]+):$/.exec(linhas[k]!.texto);
      if (!mm || !METODOS.includes(mm[1]!)) continue;
      let operationId = "";
      let raiz: string | null = null;
      for (const c of filhos(k)) {
        const o = /^operationId:\s*(\S+)$/.exec(linhas[c]!.texto);
        if (o && linhas[c]!.indent === 6) operationId = o[1]!;
        if (linhas[c]!.indent === 6 && linhas[c]!.texto === "responses:") {
          for (const r of filhos(c)) {
            if (linhas[r]!.indent !== 8) continue;
            if (!/^"2\d\d":$/.test(linhas[r]!.texto)) continue;
            const rf = REF.exec(textoDosFilhos(r));
            if (rf) raiz = rf[1]!;
          }
        }
      }
      operacoes.push({ rota: pm[1]!, metodo: mm[1]!, operationId, raiz });
    }
  }
  return { schemas, operacoes };
}

// ───────────────────────── o código, com o `with` lido ──────────────────────

/** Tira comentário sem tirar `//` de dentro de string — o repo tem URLs. */
export function semComentarios(txt: string): string {
  let out = "";
  let i = 0;
  while (i < txt.length) {
    const c = txt[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const aspa = c;
      out += c;
      i++;
      while (i < txt.length) {
        if (txt[i] === "\\") { out += txt[i]! + (txt[i + 1] ?? ""); i += 2; continue; }
        out += txt[i]!;
        if (txt[i] === aspa) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && txt[i + 1] === "/") { while (i < txt.length && txt[i] !== "\n") i++; continue; }
    if (c === "/" && txt[i + 1] === "*") { i += 2; while (i < txt.length && !(txt[i] === "*" && txt[i + 1] === "/")) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

function recorte(txt: string, abre: number): string {
  let d = 0;
  for (let i = abre; i < txt.length; i++) {
    if (txt[i] === "{") d++;
    else if (txt[i] === "}") { d--; if (d === 0) return txt.slice(abre, i + 1); }
  }
  return txt.slice(abre);
}

/** As chaves de primeiro nível de `{ … }`, com o corpo de cada uma. */
function chaves(literal: string, constantes: Map<string, string>): { chave: string; corpo: string }[] {
  const corpo = literal.slice(1, -1);
  const partes: string[] = [];
  let d = 0;
  let ini = 0;
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i]!;
    if (c === "{" || c === "(" || c === "[") d++;
    else if (c === "}" || c === ")" || c === "]") d--;
    else if (c === "," && d === 0) { partes.push(corpo.slice(ini, i)); ini = i + 1; }
  }
  partes.push(corpo.slice(ini));
  const out: { chave: string; corpo: string }[] = [];
  for (const p of partes) {
    const t = p.trim();
    if (!t) continue;
    const espalha = /^\.\.\.([A-Za-z0-9_]+)/.exec(t);
    if (espalha) {
      const lit = constantes.get(espalha[1]!);
      if (lit) out.push(...chaves(lit, constantes));
      continue;
    }
    const km = /^([A-Za-z0-9_]+)\s*:?/.exec(t);
    if (!km) continue;
    out.push({ chave: km[1]!, corpo: t.slice(km[0].length).replace(/^\s*:?\s*/, "") });
  }
  return out;
}

const NAO_E_RELACAO = new Set(["columns", "orderBy", "where", "limit", "offset", "extras"]);

/** Os caminhos que um literal de `with:` carrega — `bloqueio`, `bloqueio.vestido`, … */
function caminhosDoWith(literal: string, constantes: Map<string, string>, pref: string[] = []): string[] {
  const out: string[] = [];
  for (const { chave, corpo } of chaves(literal, constantes)) {
    if (NAO_E_RELACAO.has(chave)) continue;
    out.push([...pref, chave].join("."));
    const iw = corpo.indexOf("with:");
    if (iw >= 0) {
      const porNome = /^with:\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/.exec(corpo.slice(iw));
      const lit = porNome ? constantes.get(porNome[1]!) : undefined;
      if (lit) out.push(...caminhosDoWith(lit, constantes, [...pref, chave]));
      else {
        const abre = corpo.indexOf("{", iw);
        if (abre >= 0) out.push(...caminhosDoWith(recorte(corpo, abre), constantes, [...pref, chave]));
      }
    }
    const soIdentificador = /^([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(corpo.trim());
    const lit = soIdentificador ? constantes.get(soIdentificador[1]!) : undefined;
    if (lit) out.push(...caminhosDoWith(lit, constantes, [...pref, chave]));
  }
  return out;
}

export type Handler = { arquivo: string; metodo: string; rota: string; corpo: string; linha: number };

export function lerRotas(): { handlers: Handler[]; constantes: Map<string, string> } {
  const arquivos = execFileSync("git", ["ls-files", "artifacts/api-server/src"], { cwd: RAIZ, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f.endsWith(".ts") && !f.includes("__tests__"));
  const fontes = new Map<string, string>();
  for (const f of arquivos) fontes.set(f, semComentarios(readFileSync(path.join(RAIZ, f), "utf8")));

  const constantes = new Map<string, string>();
  for (const [, txt] of fontes) {
    const re = /(?:export\s+)?const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const abre = txt.indexOf("{", m.index + m[0].length - 1);
      if (!constantes.has(m[1]!)) constantes.set(m[1]!, recorte(txt, abre));
    }
  }

  const handlers: Handler[] = [];
  for (const [f, txt] of fontes) {
    const re = /^router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const fim = txt.indexOf("\n});", m.index);
      handlers.push({
        arquivo: f,
        metodo: m[1]!,
        rota: m[2]!,
        corpo: txt.slice(m.index, fim < 0 ? txt.length : fim),
        linha: txt.slice(0, m.index).split("\n").length,
      });
    }
  }
  return { handlers, constantes };
}

/** O que ESTE handler entrega: o `with` da consulta mais o que ele monta à mão. */
export function entreguesPor(h: Handler, constantes: Map<string, string>): { caminhos: Set<string>; aMao: Set<string>; temWith: boolean } {
  const caminhos = new Set<string>();
  let iw = h.corpo.indexOf("with:");
  while (iw >= 0) {
    const porNome = /^with:\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/.exec(h.corpo.slice(iw));
    const lit = porNome ? constantes.get(porNome[1]!) : undefined;
    if (lit) for (const c of caminhosDoWith(lit, constantes)) caminhos.add(c);
    else {
      const abre = h.corpo.indexOf("{", iw);
      if (abre >= 0) for (const c of caminhosDoWith(recorte(h.corpo, abre), constantes)) caminhos.add(c);
    }
    iw = h.corpo.indexOf("with:", iw + 5);
  }
  const aMao = new Set<string>();
  const re = /(?:\.parse\(|res\.json\(|return\s|=>\s*\(?\s*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h.corpo))) {
    const abre = h.corpo.indexOf("{", m.index + m[0].length - 1);
    const anda = (lit: string, fundo: number) => {
      if (fundo > 4) return;
      for (const { chave, corpo } of chaves(lit, constantes)) {
        aMao.add(chave);
        const t = corpo.trim();
        if (t.startsWith("{")) anda(recorte(t, 0), fundo + 1);
      }
    };
    anda(recorte(h.corpo, abre), 0);
  }
  return { caminhos, aMao, temWith: caminhos.size > 0 };
}

// ───────────────────────────── o cruzamento ─────────────────────────────────

export type Par = {
  op: string;
  caminho: string;
  aresta: string;
  alvo: string;
  linhaNoSpec: number;
  arquivo: string;
  entregue: boolean;
};

export type Cruzamento = {
  operacoes: number;
  comSchemaDeResposta: number;
  comRelacao: number;
  semHandler: string[];
  montadasAMao: string[];
  pares: Par[];
  /** aresta → quantas vezes prometida na fronteira e quantas entregues */
  arestas: Map<string, { promete: number; entrega: number; alvo: string; linhaNoSpec: number; ondeFalta: string[] }>;
};

export function cruzar(): Cruzamento {
  const { schemas, operacoes } = lerSpec(versionado(SPEC));
  const { handlers, constantes } = lerRotas();
  const rotaDoSpec = (r: string) => r.replace(/\{([A-Za-z0-9_]+)\}/g, ":$1");

  const semHandler: string[] = [];
  const montadasAMao: string[] = [];
  const pares: Par[] = [];
  let comRelacao = 0;

  for (const o of operacoes) {
    if (!o.raiz) continue;
    if (!(schemas.get(o.raiz) ?? []).some((p) => p.ref)) continue;
    comRelacao++;
    const nome = `${o.metodo.toUpperCase()} ${o.rota}`;
    const h = handlers.find((x) => x.rota === rotaDoSpec(o.rota) && x.metodo === o.metodo);
    if (!h) { semHandler.push(nome); continue; }
    const { caminhos, aMao, temWith } = entreguesPor(h, constantes);
    if (!temWith) montadasAMao.push(nome);

    // A fronteira: só se pergunta pelo filho de um pai que chegou.
    const fila: { schema: string; pref: string[] }[] = [{ schema: o.raiz, pref: [] }];
    const vistos = new Set<string>();
    while (fila.length) {
      const { schema, pref } = fila.shift()!;
      for (const p of schemas.get(schema) ?? []) {
        if (!p.ref) continue;
        const caminho = [...pref, p.nome].join(".");
        if (vistos.has(caminho)) continue;
        vistos.add(caminho);
        const entregue = caminhos.has(caminho) || aMao.has(p.nome);
        pares.push({
          op: nome, caminho, aresta: `${schema}.${p.nome}`, alvo: p.ref,
          linhaNoSpec: p.linha, arquivo: `${h.arquivo}:${h.linha}`, entregue,
        });
        if (entregue) fila.push({ schema: p.ref, pref: [...pref, p.nome] });
      }
    }
  }

  const arestas: Cruzamento["arestas"] = new Map();
  for (const p of pares) {
    if (!arestas.has(p.aresta)) arestas.set(p.aresta, { promete: 0, entrega: 0, alvo: p.alvo, linhaNoSpec: p.linhaNoSpec, ondeFalta: [] });
    const a = arestas.get(p.aresta)!;
    a.promete++;
    if (p.entregue) a.entrega++;
    else a.ondeFalta.push(`${p.op} :: ${p.caminho}`);
  }

  return {
    operacoes: operacoes.length,
    comSchemaDeResposta: operacoes.filter((o) => o.raiz).length,
    comRelacao,
    semHandler,
    montadasAMao,
    pares,
    arestas,
  };
}
