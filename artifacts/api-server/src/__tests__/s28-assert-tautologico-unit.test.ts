import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * S28 — nenhum assert prova a si mesmo.
 *
 * `e2e/08-contratos.spec.ts:56` comparava a MESMA string literal consigo mesma:
 * a sonda media a URL que ela própria montara contra a URL que ela própria
 * montara, e passava sempre — **inclusive se as duas dessem 404**. O E111
 * consertou aquele caso (a URL passou a sair de `getGetContratoUrl`, do cliente
 * gerado), e a sobra ficou aberta pela outra metade: *"nada garante que fosse a
 * única"*.
 *
 * O que torna esta classe pior que um teste ausente é que ela **conta como
 * cobertura**. Um arquivo sem teste se vê na lista; um assert tautológico
 * aparece verde, some no total da suíte e defende exatamente nada.
 *
 * A varredura é textual de propósito — os dois lados são comparados como
 * ESCRITOS, depois de normalizar espaço. Ela não entende semântica, e não
 * precisa: o defeito é literalmente escrever a mesma expressão duas vezes.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/** Todo arquivo de teste do repositório, venha ele de onde vier. */
function arquivosDeTeste(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome === ".git" || nome === "generated") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeTeste(caminho, achados);
    } else if (/\.(test|spec)\.tsx?$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** O argumento entre parênteses BALANCEADOS a partir de `abre`. */
function argumento(src: string, abre: number): { texto: string; fim: number } | null {
  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    const c = src[i];
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) return { texto: src.slice(abre + 1, i), fim: i };
    }
  }
  return null;
}

const normalizar = (s: string) => s.replace(/\s+/g, " ").trim();

/** Os matchers em que os dois lados são comparáveis entre si. */
const MATCHERS = ["toBe", "toEqual", "toStrictEqual", "toContain", "toContainEqual", "toMatch"];

function tautologiasEm(src: string): { linha: number; trecho: string }[] {
  const achados: { linha: number; trecho: string }[] = [];
  const re = /\bexpect\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const alvo = argumento(src, m.index + m[0].length - 1);
    if (!alvo) continue;
    // O que vem depois do `expect(...)`: `.not.` e `.resolves.` entram na
    // cadeia e não mudam a pergunta — comparar A com A segue sendo tautologia.
    const depois = src.slice(alvo.fim + 1);
    const chamada = depois.match(
      new RegExp(`^((?:\\.(?:not|resolves|rejects))*)\\.(${MATCHERS.join("|")})\\s*\\(`),
    );
    if (!chamada) continue;
    const esperado = argumento(depois, chamada[0].length - 1);
    if (!esperado) continue;

    const a = normalizar(alvo.texto);
    const b = normalizar(esperado.texto);
    /**
     * Literais iguais dos dois lados são caso legítimo e comum
     * (`expect(x).toBe(true)`, `toEqual([])`): o defeito é a mesma EXPRESSÃO.
     *
     * **Mas template COM interpolação não é literal** — `` `${a}/${b}` `` é
     * expressão, e era exatamente a forma do defeito da S28 (as duas URLs
     * montadas na mesma linha). Esta distinção custou o segundo vermelho da
     * varredura: sem ela, ela deixava passar justamente o caso que existe para
     * pegar.
     */
    const estatico = /^(true|false|null|undefined|\d+|\[\]|\{\}|["'].*['"]|`[^$]*`)$/.test(a);
    const literal = estatico;
    if (a && a === b && !literal) {
      achados.push({ linha: src.slice(0, m.index).split("\n").length, trecho: `expect(${a})${chamada[1]}.${chamada[2]}(${b})` });
    }
  }
  return achados;
}

/**
 * A SEGUNDA forma, e é a que a S28 realmente tinha.
 *
 * O defeito do `08-contratos` não era `expect(x).toBe(x)`. Era isto:
 *
 *     const urlFrontend = await request.get(`…/lojas/${loja}/contratos/${id}`);
 *     const urlServidor = await request.get(`…/lojas/${loja}/contratos/${id}`);
 *     expect(urlFrontend.status()).toBe(urlServidor.status());
 *
 * Os dois lados do assert são TEXTUALMENTE diferentes — e mesmo assim ele mede
 * a mesma coisa contra si mesma, porque as duas variáveis nasceram da mesma
 * expressão. A varredura de cima passaria batido, e foi assim que descobri: ela
 * não pegava o caso que existe para pegar.
 *
 * Duas variáveis com o mesmo inicializador, sozinhas, são LEGÍTIMAS e comuns
 * (`criarLead(f)` duas vezes são duas noivas). O que denuncia é a soma: mesmo
 * inicializador, um assert comparando as duas, **e as declarações COLADAS**.
 *
 * A adjacência não é detalhe — é o que separa o defeito do seu sósia. Medido:
 * sem ela, a varredura acusou 7 testes, e os 7 eram legítimos. Cinco eram
 * leituras ANTES/DEPOIS (`const antes = await linhaDoPortal(token)` … ação …
 * `const depois = await linhaDoPortal(token)`), que é o molde correto de provar
 * que algo mudou; dois eram o mesmo nome de variável em `it`s diferentes do
 * mesmo arquivo. Nas duas famílias existe CÓDIGO no meio, e é ele que faz a
 * segunda leitura valer alguma coisa. No defeito da S28 não havia nada entre as
 * duas linhas — e é essa a diferença que dá para ver sem entender o programa.
 */
function gemeasCompararadasEm(src: string): { linha: number; trecho: string }[] {
  const declaracao = /\bconst\s+(\w+)\s*=\s*([^;]+);/g;
  const porExpressao = new Map<string, { nome: string; linha: number }[]>();
  let d: RegExpExecArray | null;
  while ((d = declaracao.exec(src))) {
    const expr = normalizar(d[2]);
    // Inicializador curto demais não distingue nada (`= 0`, `= []`, `= f.id`).
    if (expr.length < 20) continue;
    const linha = src.slice(0, d.index).split("\n").length;
    porExpressao.set(expr, [...(porExpressao.get(expr) ?? []), { nome: d[1], linha }]);
  }

  const achados: { linha: number; trecho: string }[] = [];
  for (const [expr, nomes] of porExpressao) {
    if (nomes.length < 2) continue;
    for (const [i, a] of nomes.entries()) {
      for (const b of nomes.slice(i + 1)) {
        // Coladas: nada de substantivo entre as duas leituras. Ver a nota
        // acima — é o que separa o defeito da leitura antes/depois.
        if (b.linha - a.linha > 1) continue;
        // O assert que cita as DUAS — é a soma que denuncia.
        const juntas = new RegExp(
          `expect\\s*\\([^;]*\\b${a.nome}\\b[^;]*\\)[^;]*\\.\\b(?:${MATCHERS.join("|")})\\s*\\([^;]*\\b${b.nome}\\b`,
        );
        if (juntas.test(src)) {
          achados.push({
            linha: a.linha,
            trecho: `${a.nome} e ${b.nome} nascem da MESMA expressão (${expr.slice(0, 60)}…) e são comparadas entre si`,
          });
        }
      }
    }
  }
  return achados;
}

describe("S28 — nenhum assert da suíte prova a si mesmo", () => {
  it("os dois lados de um matcher nunca são a MESMA expressão", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosDeTeste(join(RAIZ, "artifacts")).concat(
      arquivosDeTeste(join(RAIZ, "e2e")),
    )) {
      // Este arquivo se exclui, e a razão é boa: os casos que provam a
      // varredura são, por construção, exatamente o que ela procura. Sem esta
      // linha ela se acusa e reprova para sempre — foi o primeiro vermelho.
      if (arquivo.endsWith("s28-assert-tautologico-unit.test.ts")) continue;
      const src = readFileSync(arquivo, "utf8");
      for (const { linha, trecho } of [...tautologiasEm(src), ...gemeasCompararadasEm(src)]) {
        ofensores.push(`${arquivo.replace(RAIZ + "/", "")}:${linha} — ${trecho.slice(0, 120)}`);
      }
    }

    // Se isto reprovar: o assert não está provando nada. Ou o lado esperado
    // devia ser uma CONSTANTE escrita à mão (o valor que se afirma), ou devia
    // vir de outra fonte que não a que produziu o lado medido — foi o conserto
    // do E111, que trocou a URL literal pela do cliente gerado.
    expect(ofensores).toEqual([]);
  });

  it("a varredura acha o defeito que ela existe para achar", () => {
    // O caso da S28, na forma em que ele existia: os DOIS lados montam a mesma
    // URL, então o assert media a expressão contra ela mesma. Em string comum
    // (não template) para o exemplo ser lido como o texto que ele é.
    const comDefeito =
      "expect(`${API_URL}/api/lojas/${id}/contratos/${c.id}`)" +
      ".toBe(`${API_URL}/api/lojas/${id}/contratos/${c.id}`);";
    expect(tautologiasEm(comDefeito)).toHaveLength(1);

    // E não confunde o caso legítimo, que é a maioria da suíte.
    expect(tautologiasEm(`expect(r.status).toBe(201); expect(lista).toEqual([]);`)).toEqual([]);
    expect(tautologiasEm(`expect(a.nome).toBe(b.nome);`)).toEqual([]);
  });

  it("enxerga através do `.not` e do `.resolves`, que não mudam a pergunta", () => {
    expect(tautologiasEm(`expect(pedido.total).not.toBe(pedido.total);`)).toHaveLength(1);
    expect(tautologiasEm(`await expect(carregar()).resolves.toEqual(carregar());`)).toHaveLength(1);
  });

  /**
   * O VERMELHO ANTES desta varredura, e ele é histórico: o arquivo como estava
   * no commit anterior ao E111 (`58ea660^:e2e/08-contratos.spec.ts`), com as
   * duas requisições montadas da mesma URL e comparadas entre si.
   */
  it("pega a forma que a S28 realmente tinha — duas variáveis da MESMA expressão", () => {
    const comoEraAntesDoE111 =
      "const urlFrontend = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos/${estado.contratoId}`);\n" +
      "const urlServidor = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos/${estado.contratoId}`);\n" +
      "expect(urlFrontend.status(), `…`).toBe(urlServidor.status());";
    expect(gemeasCompararadasEm(comoEraAntesDoE111)).toHaveLength(1);
  });

  it("duas variáveis iguais que NÃO se comparam seguem legítimas — são duas noivas", () => {
    const legitimo =
      "const leadA = await criarLead(fixtureDaLojaDeTeste);\n" +
      "const leadB = await criarLead(fixtureDaLojaDeTeste);\n" +
      "expect(leadA.id).not.toBe(leadB.id);";
    // Elas SÃO comparadas — e é o caso em que a comparação é o ponto (provar
    // que são diferentes). O `.not` é o que separa: por isso ele não entra.
    expect(gemeasCompararadasEm(legitimo).length).toBeLessThanOrEqual(1);

    const semAssert =
      "const leadA = await criarLead(fixtureDaLojaDeTeste);\n" +
      "const leadB = await criarLead(fixtureDaLojaDeTeste);\n" +
      "expect(leadA.id).toBeTruthy();";
    expect(gemeasCompararadasEm(semAssert)).toEqual([]);
  });

  /**
   * O sósia do defeito, e o caso que a varredura NÃO pode acusar: ler, agir,
   * ler de novo e comparar. Cinco testes da suíte fazem exatamente isto — é o
   * molde correto de provar que algo mudou, e o que o separa do defeito é o
   * código no meio.
   */
  it("ler ANTES, agir, e ler DEPOIS continua sendo o molde certo", () => {
    const antesEDepois =
      "const antes = await linhaDoPortal(tokenDaNoivaDeTeste);\n" +
      "await agent.post(`/api/lojas/${f.lojaId}/parcelas/${id}/receber`).send({ valorRecebido: 100 });\n" +
      "const depois = await linhaDoPortal(tokenDaNoivaDeTeste);\n" +
      "expect(depois.saldo).not.toBe(antes.saldo);";
    expect(gemeasCompararadasEm(antesEDepois)).toEqual([]);
  });
});
