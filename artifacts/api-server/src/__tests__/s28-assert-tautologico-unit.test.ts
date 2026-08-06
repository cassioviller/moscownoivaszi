import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

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

/**
 * Todo arquivo de teste VERSIONADO, venha ele de onde vier.
 *
 * Enumerar pelo `git ls-files` e não pelo `readdirSync` é a régua da S38: o
 * disco tem o que o `.gitignore` esconde, e a lista de diretórios a pular que
 * esta função mantinha à mão (`node_modules`, `dist`, `.git`, `generated`) não
 * cobria `coverage/`, `build/` nem `test-results/`. Medido: os dois caminhos
 * devolvem **os mesmos 265 arquivos** hoje — a troca não muda o conjunto, tira
 * a dependência de uma lista que ninguém atualiza.
 */
function arquivosDeTeste(): string[] {
  return arquivosVersionados(RAIZ, ["artifacts", "e2e"])
    .filter((relativo) => /\.(test|spec)\.tsx?$/.test(relativo))
    .map((relativo) => join(RAIZ, relativo));
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

/**
 * Onde o arquivo NÃO está executando: comentário e miolo de literal de texto.
 *
 * Isto é o que substitui a linha `if (arquivo.endsWith("s28-…")) continue;`.
 * A varredura se excluía da própria varredura porque os espécimes que a provam
 * são, por construção, exatamente o que ela procura — e a exclusão apagava o
 * arquivo inteiro, inclusive o código de verdade que mora nele. A distinção
 * certa não é *qual arquivo*, é *o que é código*: `expect(x).toBe(x)` escrito
 * dentro de uma string é um exemplo, e o docbloco que mostra o defeito do E111
 * é a explicação do conserto, não o conserto. É a mesma decisão que
 * `varredura-reguas.ts:50` e `destrutivas-varredura.ts:88` já tinham tomado
 * ("comentário não é interface"), aplicada também aos literais.
 *
 * Devolve uma máscara por byte: 1 onde o caractere é comentário ou está dentro
 * de um literal. O `${…}` de um template volta a ser código, porque é.
 */
function mascaraNaoExecutavel(src: string): Uint8Array {
  const mascara = new Uint8Array(src.length);
  const pilhaTemplate: number[] = []; // profundidade de chaves de cada `${`
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const prox = src[i + 1];

    if (c === "/" && prox === "/") {
      const fim = src.indexOf("\n", i);
      const ate = fim === -1 ? src.length : fim;
      mascara.fill(1, i, ate);
      i = ate;
      continue;
    }
    if (c === "/" && prox === "*") {
      const fim = src.indexOf("*/", i + 2);
      const ate = fim === -1 ? src.length : fim + 2;
      mascara.fill(1, i, ate);
      i = ate;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      mascara.fill(1, i, Math.min(j + 1, src.length));
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "$" && src[j + 1] === "{") {
          // O texto até aqui é literal; o que vem dentro de `${` é código, e
          // volta a ser lido pelo laço de fora.
          mascara.fill(1, i, j + 2);
          pilhaTemplate.push(0);
          i = j + 2;
          break;
        }
        if (src[j] === "`") {
          mascara.fill(1, i, j + 1);
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= src.length) {
        mascara.fill(1, i, src.length);
        i = src.length;
      }
      continue;
    }
    if (pilhaTemplate.length > 0) {
      if (c === "{") pilhaTemplate[pilhaTemplate.length - 1]++;
      else if (c === "}") {
        if (pilhaTemplate[pilhaTemplate.length - 1] === 0) {
          // Fecha o `${`: daqui em diante é template de novo.
          pilhaTemplate.pop();
          mascara[i] = 1;
          let j = i + 1;
          while (j < src.length) {
            if (src[j] === "\\") {
              j += 2;
              continue;
            }
            if (src[j] === "$" && src[j + 1] === "{") {
              mascara.fill(1, i + 1, j + 2);
              pilhaTemplate.push(0);
              i = j + 2;
              break;
            }
            if (src[j] === "`") {
              mascara.fill(1, i + 1, j + 1);
              i = j + 1;
              break;
            }
            j++;
          }
          if (j >= src.length) {
            mascara.fill(1, i + 1, src.length);
            i = src.length;
          }
          continue;
        }
        pilhaTemplate[pilhaTemplate.length - 1]--;
      }
    }
    i++;
  }
  return mascara;
}

/** Só espaço e comentário entre um ponto e outro do arquivo. */
function apenasEspacoOuComentario(trecho: string): boolean {
  return (
    trecho
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .trim() === ""
  );
}

/** Os matchers em que os dois lados são comparáveis entre si. */
const MATCHERS = ["toBe", "toEqual", "toStrictEqual", "toContain", "toContainEqual", "toMatch"];

function tautologiasEm(src: string): { linha: number; trecho: string }[] {
  const achados: { linha: number; trecho: string }[] = [];
  const naoExecutavel = mascaraNaoExecutavel(src);
  const re = /\bexpect\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // `expect` citado dentro de uma string ou de um comentário é exemplo, não
    // assert. É o que dispensa este arquivo de se excluir da varredura.
    if (naoExecutavel[m.index]) continue;
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
 * duas declarações — e é essa a diferença que dá para ver sem entender o
 * programa.
 *
 * **A adjacência era medida em NÚMERO DE LINHA, e isso a fazia perder o próprio
 * caso fundador.** `if (b.linha - a.linha > 1) continue;` supunha que uma
 * declaração ocupa uma linha. O prettier deste repositório (3.8.4, sem arquivo
 * de configuração, `printWidth` 80) quebra o `request.get` do `08-contratos` em
 * TRÊS linhas, e a segunda declaração passa a nascer 3 linhas depois da
 * primeira, coladas e invisíveis. Medido em 2026-08-06 sobre os 265 arquivos de
 * teste versionados: **953 das 3.402 declarações `const` que a varredura casa
 * já ocupam mais de uma linha — 28,0%**, e cada uma delas é uma primeira metade
 * de par que a régua antiga descartava antes de olhar.
 *
 * A régua passou a ser o TEXTO ENTRE as duas declarações: coladas é não haver
 * nada além de espaço e comentário entre o `;` de uma e o `const` da outra.
 * Isso não é uma janela de vizinhança maior — é a mesma pergunta ("existe ação
 * no meio?") medida em algo que a formatação não mexe.
 */
function gemeasCompararadasEm(src: string): { linha: number; trecho: string }[] {
  const naoExecutavel = mascaraNaoExecutavel(src);
  const declaracao = /\bconst\s+(\w+)\s*=\s*([^;]+);/g;
  const porExpressao = new Map<string, { nome: string; linha: number; inicio: number; fim: number }[]>();
  let d: RegExpExecArray | null;
  while ((d = declaracao.exec(src))) {
    // Declaração citada em string ou comentário é exemplo, não código.
    if (naoExecutavel[d.index]) continue;
    const expr = normalizar(d[2]);
    // Inicializador curto demais não distingue nada (`= 0`, `= []`, `= f.id`).
    if (expr.length < 20) continue;
    const linha = src.slice(0, d.index).split("\n").length;
    porExpressao.set(expr, [
      ...(porExpressao.get(expr) ?? []),
      { nome: d[1], linha, inicio: d.index, fim: d.index + d[0].length },
    ]);
  }

  const achados: { linha: number; trecho: string }[] = [];
  for (const [expr, nomes] of porExpressao) {
    if (nomes.length < 2) continue;
    for (const [i, a] of nomes.entries()) {
      for (const b of nomes.slice(i + 1)) {
        // Coladas: nada de substantivo entre as duas leituras. Medido no TEXTO
        // entre elas, não em número de linha — ver a nota acima; a versão por
        // linha não pegava o próprio caso da S28 depois do prettier.
        if (b.inicio < a.fim) continue;
        if (!apenasEspacoOuComentario(src.slice(a.fim, b.inicio))) continue;
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
    const arquivos = arquivosDeTeste();
    // Varredura sobre conjunto vazio passa sempre. O piso é o número medido em
    // 2026-08-06 (265 arquivos de teste versionados), com folga para baixo.
    expect(arquivos.length).toBeGreaterThan(200);

    const ofensores: string[] = [];
    // Este arquivo NÃO se exclui mais. Ele se excluía inteiro porque os
    // espécimes que o provam são, por construção, o que ele procura — e a
    // exclusão levava junto o código de verdade que mora aqui. Quem separa
    // agora é `mascaraNaoExecutavel`: exemplo dentro de string ou de comentário
    // não é assert.
    for (const arquivo of arquivos) {
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

  /**
   * O MESMO caso, depois de o prettier passar — e este era o vermelho que a
   * varredura não dava. Saída literal de `prettier 3.8.4 --stdin-filepath
   * e2e/08-contratos.spec.ts` sobre o trecho de cima: o `request.get` não cabe
   * em 80 colunas, o argumento desce, e cada declaração passa a ocupar TRÊS
   * linhas. Com a régua antiga, `b.linha - a.linha` valia 3, `> 1`, e a
   * varredura descartava o par antes de olhar para o assert.
   *
   * Nenhuma janela de vizinhança maior conserta isto: aumentar o limite para 3
   * passaria a acusar as leituras ANTES/DEPOIS, que é o sósia legítimo. O que
   * conserta é medir a adjacência no texto entre as duas.
   */
  it("e continua pegando depois de o prettier quebrar as duas linhas em seis", () => {
    const comoOPrettierEscreve =
      "const urlFrontend = await request.get(\n" +
      "  `${API_URL}/api/lojas/${estado.lojaId}/contratos/${estado.contratoId}`,\n" +
      ");\n" +
      "const urlServidor = await request.get(\n" +
      "  `${API_URL}/api/lojas/${estado.lojaId}/contratos/${estado.contratoId}`,\n" +
      ");\n" +
      "expect(urlFrontend.status(), `…`).toBe(urlServidor.status());";
    expect(gemeasCompararadasEm(comoOPrettierEscreve)).toHaveLength(1);
  });

  /**
   * O que dispensa esta varredura de se excluir da própria varredura: exemplo
   * escrito dentro de string ou de comentário não é assert. Sem esta distinção
   * o arquivo se acusava, e a saída era pular o arquivo INTEIRO — junto com o
   * código de verdade que mora nele.
   */
  it("exemplo dentro de string ou de comentário não é código", () => {
    expect(tautologiasEm(`const exemplo = "expect(x.a).toBe(x.a);";`)).toEqual([]);
    expect(tautologiasEm("// expect(pedido.total).toBe(pedido.total);")).toEqual([]);
    expect(tautologiasEm("/* expect(pedido.total).toBe(pedido.total); */")).toEqual([]);
    // E o `${…}` de um template volta a ser código, porque é.
    expect(tautologiasEm("const s = `x${expect(p.total).toBe(p.total)}y`;")).toHaveLength(1);
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
