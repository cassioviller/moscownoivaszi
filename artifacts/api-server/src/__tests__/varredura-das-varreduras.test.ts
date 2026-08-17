import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { comArquivoSintetico } from "./populacao-da-varredura";

/**
 * **S-C260 — o julgamento retrato×população passa a ser uma régua, e não um
 * gesto.**
 *
 * A S-C75 passou o critério da S-C46 por 16 varreduras, uma a uma, à mão. A
 * sobra que sobrou dizia que **10 nunca tinham passado** — as da grafia
 * `*-varredura.test.ts`, que o glob daquele dia não via. Medido agora, o buraco
 * é maior e tem **duas dimensões, não uma**:
 *
 * |  | `varredura-*` | `*-varredura` |
 * |---|---|---|
 * | `api-server` | 15 | 1 |
 * | `moscow-noivas` | 5 | 10 |
 *
 * **São 31, e o julgamento cobriu uma célula.** O que escapou não foi só a
 * segunda grafia: as 5 da PRIMEIRA grafia que moram no frontend também nunca
 * foram julgadas, e nenhuma sobra falava delas. Enumerar por uma grafia é a
 * S-C79 ao vivo — *"onze arquivos entraram em dois dias sob um piso verde"* —,
 * e enumerar por um pacote é o mesmo defeito com outro eixo.
 *
 * **E o julgamento achou um buraco real, na régua mais nova do repositório:**
 * a `varredura-codegen-em-dia` (nascida na S-C152, dois dias atrás) comparava
 * duas fotografias sem piso nenhum. Com os dois `generated/` vazios, `antes` e
 * `depois` seriam a mesma string vazia e ela passaria verde — verde por não ter
 * olhado, dentro da régua que existe para não deixar passar despercebido. O
 * piso entrou no mesmo commit.
 *
 * ## O que esta régua exige, e por quê
 *
 * Uma varredura afirma *"não existe X no repositório"*. A afirmação só vale se
 * o conjunto varrido for grande — conjunto vazio aprova tudo. O critério da
 * S-C46 é que **cada varredura diga o tamanho do que olhou**, de uma destas
 * três formas, que são as que a casa usa:
 *
 * 1. **piso** — `expect(populacao().length).toBeGreaterThan(N)`;
 * 2. **retrato** — a lista dos sítios travada por igualdade (`toEqual([...])`),
 *    que é piso e dívida ao mesmo tempo;
 * 3. **âncora** — `expect(enumerados).toContain("arquivo/que/tem/de/estar")`,
 *    para a varredura cujo conjunto é pequeno e nomeável (o critério que a
 *    S-C75 já tinha dado à `varredura-fronteira-loja`).
 *
 * Quem não mostra nenhuma das três é denunciada pelo nome. A régua **não julga
 * se o número está certo** — isso continua sendo leitura humana; ela cobra que
 * o número EXISTA, que é o que ninguém lembra de fazer duas vezes seguidas.
 *
 * ## O que ela não faz
 *
 * ✘ Não lê a semântica: uma varredura pode ter piso e mesmo assim estar
 *   contando a coisa errada (foi o caso da própria `varredura-portas-sob-tranca`
 *   na S-C79, cujo piso `> 200` não sentiu onze arquivos novos). Piso presente
 *   é o mínimo, não o suficiente.
 * ✘ Não alcança régua que não se chame "varredura" — e é a fronteira honesta
 *   desta régua, escrita aqui para a terceira grafia não nascer calada. A
 *   `varredura-reguas` cobre o outro lado (o formatador novo fora da régua).
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");

/** Toda varredura versionada, nas duas grafias e em todos os pacotes. */
function varreduras(): string[] {
  return execSync("git ls-files", { cwd: RAIZ, maxBuffer: 32 * 1024 * 1024 })
    .toString("utf8")
    .split("\n")
    .filter((r) => /varredura[a-z0-9-]*\.test\.tsx?$/.test(path.basename(r)));
}

/**
 * As formas de dizer o tamanho do que se olhou.
 *
 * O `RETRATO` exige lista **não vazia** de propósito, e essa exigência é a
 * parte da régua que quase se enganou sozinha: `expect(denuncias).toEqual([])`
 * é a DENÚNCIA de toda varredura da casa — o que ela afirma não existir. Aceitá-la
 * como prova de população faria esta régua aprovar exatamente o defeito que
 * ela existe para pegar, porque toda varredura muda tem essa linha.
 */
const PISO = /toBeGreaterThan(?:OrEqual)?\s*\(/;
const RETRATO = /toEqual\s*\(\s*\[(?!\s*\])/;
const ANCORA = /toContain\s*\(/;
/** População travada por igualdade: `expect(todas.length, …).toBe(29)`. */
const CONTAGEM = /\.length[\s\S]{0,300}?\.toBe\(\s*\d+\s*\)/;

function dizOTamanho(texto: string): boolean {
  return PISO.test(texto) || RETRATO.test(texto) || ANCORA.test(texto) || CONTAGEM.test(texto);
}

describe("S-C260 — toda varredura diz o tamanho do que olhou", () => {
  it("a enumeração cobre as duas grafias e os dois pacotes — o retrato é 36", () => {
    /**
     * Igualdade, e não piso: varredura nova tem de ser JULGADA, e o vermelho
     * aqui é onde alguém escreve que julgou. É o critério que a S-C75 aplicou
     * às dívidas, virado para a lista das próprias réguas.
     *
     * **E este número já esteve errado, pela razão que a S-C182 descreve.**
     * Ele nasceu 29 porque foi medido enquanto ESTE arquivo ainda não tinha
     * passado por `git add`: a régua enumera pelo `git ls-files` e **não se
     * enxergava**. Verde na medição, vermelho no commit seguinte — e o que
     * pegou foi a suíte inteira, não a rodada do arquivo sozinho. A S-C182
     * escreveu esse degrau para as encenações (*"o `git add` é obrigatório,
     * porque a população vem do `git ls-files`"*); ele vale igual para a régua
     * que se conta entre os contados.
     */
    const todas = varreduras();
    // E236: 31 → 32. A `varredura-manuais-prints` (frontend): toda âncora `data-print`
    // tem captura versionada, nenhuma captura é órfã, o manifesto bate, todo manual
    // tem PDF no git — a quinta régua de manual, e a primeira sobre as IMAGENS.
    // E239: 32 → 35, as três do lote B das 🔵, todas na API: a
    // `varredura-banco-virgem-cobre-as-migracoes` (S-O103 — as migrações que
    // backfillam × os specs do banco virgem), a `varredura-campo-escalar-do-spec`
    // (S-O115 — o escalar do spec que ninguém preenche) e a
    // `varredura-teto-do-texto-livre` (S-O109 — o `maxLength` do texto livre).
    // E250: 35 → 36. A `varredura-migracoes-por-loja` (S-R9 — junção por VÍRGULA
    // numa migração que escreve dado, que é a única grafia em que o produto
    // cartesiano não aparece escrito; e S-R5 — a marca do IPCA de exemplo é a
    // mesma no seed e no DELETE da faxina). A primeira régua sobre `docs/migracoes`
    // que julga o SQL, e não a cobertura dele.
    // E256: 36 → 37. A `campo-id-em-field-array-varredura` (frontend, S-RM8 —
    // um campo `id` dentro do `z.array(z.object({…}))` de um `useFieldArray` é
    // sobrescrito pela chave do hook, a identidade some da linha e o alvo do
    // gesto volta a ser resolvido por POSIÇÃO, que foi a S-R7). A população da
    // classe é **um** arquivo, e ele já está pago: a régua nasce como cerca do
    // segundo, não como retrato de dívida.
    // E262: 37 → 38. A `varredura-aspa-reta` (frontend, S-RM19/20/21/22 — a
    // aspa reta em frase que uma pessoa lê). Ela alcança três formas
    // decidíveis (template literal, aspa escapada, aspa encostada em expressão
    // JSX) e DECLARA a que não alcança: a aspa reta em texto JSX nu, que tem a
    // mesma forma léxica de um argumento de função. Os 13 sítios em que a aspa
    // é da NORMA — `ETag`, `Content-Disposition`, campo de CSV, console de
    // script, JSON de exemplo — são passivo julgado no formato da regra 31.
    expect(todas.length, `varreduras encontradas:\n${todas.join("\n")}`).toBe(38);

    // E as duas dimensões, nomeadas: a sobra descrevia só a grafia, e o
    // julgamento de 14/08 também tinha perdido as 5 da primeira grafia que
    // moram no frontend.
    const porGrafia = (re: RegExp) => todas.filter((r) => re.test(path.basename(r))).length;
    expect(porGrafia(/^varredura-/)).toBe(26); // E236: +1, a `varredura-manuais-prints`; E239: +3, na API; E250: +1, a `varredura-migracoes-por-loja`; E262: +1, a `varredura-aspa-reta`
    expect(porGrafia(/-varredura\./)).toBe(12); // E256: +1, a `campo-id-em-field-array-varredura`
    expect(todas.filter((r) => r.startsWith("artifacts/moscow-noivas/")).length).toBe(18); // E236: +1, no frontend; E256: +1; E262: +1
  });

  it("nenhuma varredura afirma sobre um conjunto cujo tamanho ela não diz", () => {
    const mudas = varreduras().filter(
      (relativo) => !dizOTamanho(readFileSync(path.join(RAIZ, relativo), "utf8")),
    );
    expect(
      mudas,
      "varredura sem piso, retrato ou âncora: ela afirma 'não existe X' sobre um conjunto que " +
        "pode estar vazio — e conjunto vazio aprova tudo (S-C46). Diga o tamanho do que olhou.",
    ).toEqual([]);
  });
});

describe("S-C260 — a peneira prova que enxerga, e que não confunde as três formas", () => {
  it("aceita as quatro formas de dizer o tamanho", () => {
    expect(dizOTamanho(`expect(fontes().length).toBeGreaterThan(140);`)).toBe(true);
    expect(dizOTamanho(`expect(sitios).toEqual(["a", "b"]);`)).toBe(true);
    expect(dizOTamanho(`expect(versionados).toContain(FICHA_DA_NOIVA);`)).toBe(true);
    expect(dizOTamanho("expect(todas.length, `lista:\\n${x}`).toBe(29);")).toBe(true);
  });

  it("recusa a varredura que só denuncia — a forma exata do buraco da S-C152", () => {
    // O corpo da `varredura-codegen-em-dia` antes do conserto: duas fotografias
    // comparadas, e nada dizendo que havia o que fotografar.
    expect(dizOTamanho(`expect(depois, "…").toBe(antes);`)).toBe(false);
  });

  it("acusa a varredura nova que nasce muda — plantada no pacote do FRONTEND (S-C261)", () => {
    /**
     * **S-C261 fecha aqui, por medição em vez de adiamento.**
     *
     * A sobra dizia que a utilitária do arquivo sintético *"mora só no pacote
     * da API"* e que uma encenação de varredura de frontend *"precisará da
     * cópia por pacote"*. Medido: **ela não precisa.** O
     * `comArquivoSintetico` recebe a RAIZ como argumento e não importa nada do
     * servidor — o que ele exige é `git add -N`, que é do repositório e não do
     * pacote. E a varredura que mais precisa dele é justamente esta, que mora
     * na API e enumera os dois pacotes.
     *
     * A prova é a encenação abaixo: o arquivo sintético nasce em
     * `artifacts/moscow-noivas/src/lib/`, com a grafia da segunda família (a
     * que a S-C260 dizia nunca ter sido julgada), e a régua o acusa daqui.
     */
    const relativo = "artifacts/moscow-noivas/src/lib/sintetica-sem-piso-varredura.test.ts";
    const mudas = comArquivoSintetico(
      RAIZ,
      relativo,
      // Inerte para as outras varreduras: uma denúncia vazia e nada mais — que
      // é exatamente a forma do defeito.
      'import { expect } from "vitest";\nexpect([]).toEqual([]);\n',
      () => varreduras().filter((r) => !dizOTamanho(readFileSync(path.join(RAIZ, r), "utf8"))),
    );

    expect(mudas).toEqual([relativo]);
  });

  it("a lista vazia da denúncia NÃO conta como população — o quase-engano da régua", () => {
    // Toda varredura da casa termina em `expect(denuncias).toEqual([])`. Se o
    // retrato aceitasse a lista vazia, esta régua aprovaria todas as 29 sem
    // olhar nenhuma — verde por não ter olhado, dentro da régua contra o verde
    // por não ter olhado.
    expect(dizOTamanho(`expect(denuncias).toEqual([]);`)).toBe(false);
    expect(dizOTamanho(`expect(mudas).toEqual([ ]);`)).toBe(false);
    // Mas a lista COM sítio nomeado conta: é retrato, que é piso e dívida juntos.
    expect(dizOTamanho(`expect(sitios).toEqual([\n  "pages/x.tsx#q",\n]);`)).toBe(true);
  });
});
