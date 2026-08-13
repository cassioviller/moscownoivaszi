import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AVARIA_DESCRICAO_MAX_CHARS,
  AVARIA_JUSTIFICATIVA_MAX_CHARS,
  FOTO_MAX_BYTES,
} from "./limites";

/**
 * S-O19 — **o teto da foto era declarado três vezes, independentes.**
 *
 * `FOTO_MAX_BYTES` (`vestidos.ts`), `AVARIA_FOTO_MAX_BYTES` (`reservas.ts`) e o
 * `arquivo.size > 2 * 1024 * 1024` inline da ficha da reserva: três números
 * iguais por coincidência. O `express.json({ limit })` do `app.ts` é derivado
 * deles **de cabeça**, e o comentário de lá conta o que aconteceu quando as
 * declarações mentiram — o corpo chegava com 2.000.080 bytes contra um limite
 * de 1 MiB, e a foto do celular morria no parser, antes de qualquer guarda que
 * soubesse explicar.
 *
 * As duas do servidor viraram uma (`api-server/src/lib/limites.ts`). A da tela
 * não pode importar aquela — pacotes diferentes —, então esta varredura prega
 * que as duas são o MESMO número. Mesma forma do espelho da trilha (S-O1):
 * quando não dá para compartilhar, prega-se a igualdade.
 */
const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");
const DO_SERVIDOR = "artifacts/api-server/src/lib/limites.ts";
const O_SPEC = "lib/api-spec/openapi.yaml";

function fonteDoServidor(): string {
  const versionado = execFileSync("git", ["ls-files", DO_SERVIDOR], {
    cwd: RAIZ,
    encoding: "utf8",
  }).trim();
  if (!versionado) throw new Error(`${DO_SERVIDOR} não está versionado`);
  return readFileSync(path.join(RAIZ, DO_SERVIDOR), "utf8");
}

describe("varredura — o teto da foto é o mesmo dos dois lados (S-O19)", () => {
  const servidor = fonteDoServidor();

  it("o servidor declara 2 MiB, e a tela declara o mesmo", () => {
    const m = /export const FOTO_MAX_BYTES = ([^;]+);/.exec(servidor);
    expect(m, "a constante do servidor mudou de nome ou de forma").toBeTruthy();
    // eslint-disable-next-line no-eval
    const doServidor = eval(m![1]!) as number;
    expect(doServidor).toBe(2 * 1024 * 1024);
    expect(
      FOTO_MAX_BYTES,
      "mudou o teto de um lado só — a tela recusaria o que o servidor aceita, ou o contrário",
    ).toBe(doServidor);
  });

  /**
   * S-O51/E180 — **o teto do corpo é UM, e é conta.**
   *
   * Eram dois (`"6mb"` e `"4mb"`), protegendo a MESMA foto pelas duas portas
   * que a recebem, diferentes por motivo histórico e não por decisão. Esta
   * varredura pregava que **cada um** cabe a foto codificada — nunca que são o
   * mesmo número, porque não eram. Agora prega as três coisas de uma vez: que
   * há UM, que ele é DERIVADO de `FOTO_MAX_BYTES` (e não um literal que
   * envelhece sozinho), e que o `app.ts` monta os dois parsers com ele.
   */
  it("há UM teto de corpo, derivado da foto — e não um literal de MB por porta", () => {
    const literais = [...servidor.matchAll(/export const CORPO_MAX_[A-Z_]+ = "(\d+)mb";/g)];
    expect(literais.map((x) => x[0]), "o teto do corpo voltou a ser literal").toEqual([]);

    const m = /export const CORPO_MAX_FOTO_BYTES =\s*([^;]+);/.exec(servidor);
    expect(m, "a constante única do corpo mudou de nome ou de forma").toBeTruthy();
    expect(m![1], "o teto do corpo tem de SAIR do teto da foto, senão os dois divergem de novo").toContain(
      "FOTO_MAX_BYTES",
    );
    // S-O62/E186: e da MINIATURA, que viaja no mesmo corpo. Antes ela não
    // aparecia na conta e respondia por 67% da folga chamada de "envelope".
    expect(m![1], "o teto do corpo tem de SAIR também do teto da miniatura").toContain("THUMB_MAX_BYTES");
  });

  /**
   * S-O62/E186 — **a conta do teto de CORPO cabe tudo o que a guarda ACEITA.**
   *
   * O E180 pregava só que o corpo cabe a foto codificada, e a folga que sobrava
   * foi rotulada de "envelope". Medido: a porta do vestido manda **duas**
   * imagens no mesmo corpo, e a miniatura sozinha ocupa **699.052 bytes em
   * base64** — dois terços daquele 1 MiB. O invariante que faltava é este: o
   * pior corpo que as guardas do servidor aprovam tem de CABER no parser, senão
   * o 413 mudo chega antes do 422 que sabe explicar.
   *
   * Sem ele, subir `THUMB_MAX_BYTES` de 512 KiB para 1 MiB — uma linha — faria o
   * parser recusar um corpo que a rota aceitaria, e nenhuma suíte falaria.
   */
  it("e a conta dele cabe a foto MAIS a miniatura, com margem para o 422 chegar", () => {
    const base64 = (n: number) => 4 * Math.ceil(n / 3);
    /**
     * O valor sai da FONTE versionada do servidor, resolvendo as constantes
     * umas nas outras — nenhum número deste arquivo entra na conta. Repetir o
     * total aqui seria a segunda declaração que a S-O19 existe para matar.
     */
    const resolvidas: Record<string, number> = { FOTO_MAX_BYTES };
    const constante = (nome: string): number => {
      const m = new RegExp(`export const ${nome} =\\s*([^;]+);`).exec(servidor);
      expect(m, `${nome} sumiu de lib/limites.ts`).toBeTruthy();
      let expr = m![1]!;
      for (const [k, v] of Object.entries(resolvidas)) expr = expr.replace(new RegExp(k, "g"), String(v));
      // eslint-disable-next-line no-eval
      const valor = eval(expr.replace(/base64Bytes\(/g, "((n)=>4*Math.ceil(n/3))(")) as number;
      resolvidas[nome] = valor;
      return valor;
    };
    const thumb = constante("THUMB_MAX_BYTES");
    const envelope = constante("ENVELOPE_MAX_BYTES");
    const margem = constante("MARGEM_DO_422_BYTES");
    const corpo = constante("CORPO_MAX_FOTO_BYTES");

    // O pior corpo que as guardas aprovam: a foto no teto, a miniatura no teto.
    const piorCorpoAceito = base64(FOTO_MAX_BYTES) + base64(thumb) + envelope;
    expect(
      corpo,
      "o parser recusaria um corpo que as guardas aceitam — o 413 mudo chegando antes do 422",
    ).toBeGreaterThan(piorCorpoAceito);

    // E a margem existe para o EXCESSO chegar: quem passa do teto da foto por
    // pouco tem de ouvir o 422 que nomeia o teto, não o 413 do parser.
    expect(margem, "sem margem, a foto de 2 MiB + 1 KB morre no parser").toBeGreaterThan(base64(64 * 1024));
    // Teto superior: folga generosa demais é o processo montando JSON que a
    // guarda vai recusar de qualquer jeito.
    expect(margem).toBeLessThan(base64(FOTO_MAX_BYTES) / 2);
  });

  it("e as duas portas que recebem foto montam o parser com ESSE teto", () => {
    const app = readFileSync(path.join(RAIZ, "artifacts/api-server/src/app.ts"), "utf8");
    const limites = [...app.matchAll(/express\.json\(\{ limit: ([A-Za-z_]+) \}\)/g)].map((x) => x[1]);
    expect(limites.length, "as duas portas de foto saíram do `app.ts`").toBe(2);
    expect(new Set(limites), "as duas portas voltaram a ter tetos diferentes").toEqual(
      new Set(["CORPO_MAX_FOTO_BYTES"]),
    );
  });

  it("ninguém declara o teto por conta própria — nem rota, nem tela", () => {
    /**
     * O que a S-O19 pede: TRÊS declarações viram uma. Duas eram do servidor
     * (`vestidos.ts`, `reservas.ts`) e **a terceira era da tela** — o
     * `arquivo.size > 2 * 1024 * 1024` inline da ficha da reserva —, então
     * varrer só as rotas guardaria dois terços do que a sobra nomeou.
     *
     * O piso de população é a régua da varredura (regra do `git ls-files`):
     * enumerar pelo versionamento, nunca pelo disco, e recusar-se a passar
     * verde por ter enumerado nada.
     */
    const versionados = (dir: string, ext: string[]) =>
      execFileSync("git", ["ls-files", dir], { cwd: RAIZ, encoding: "utf8" })
        .split("\n")
        .filter((f) => ext.some((e) => f.endsWith(e)));

    const rotas = versionados("artifacts/api-server/src/routes", [".ts"]);
    expect(rotas.length, "a enumeração das rotas veio vazia").toBeGreaterThanOrEqual(15);

    const telas = versionados("artifacts/moscow-noivas/src/pages", [".tsx"]).concat(
      versionados("artifacts/moscow-noivas/src/components", [".tsx"]),
    );
    expect(telas.length, "a enumeração das telas veio vazia").toBeGreaterThanOrEqual(50);

    const reincidentes = [...rotas, ...telas].filter((f) =>
      /2\s*\*\s*1024\s*\*\s*1024/.test(readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(reincidentes, "o teto voltou a ser escrito à mão").toEqual([]);

    /**
     * S-O62/E186 — **e o da MINIATURA junto, que era a quarta declaração.**
     *
     * `THUMB_MAX_BYTES = 512 * 1024` vivia em `vestidos.ts:641`, literal, três
     * linhas abaixo do comentário que anunciava a consolidação da S-O19. A
     * varredura enumerava as três que a sobra nomeou e passava verde sobre a
     * quarta — é a régua guardando o que já foi consertado em vez da classe.
     */
    const thumbAMao = rotas.filter((f) => /512\s*\*\s*1024/.test(readFileSync(path.join(RAIZ, f), "utf8")));
    expect(thumbAMao, "o teto da miniatura voltou a ser escrito à mão numa rota").toEqual([]);
  });

  /**
   * S-O81/E191 — **a descrição da avaria cabe no envelope que a conta reserva
   * para ela.**
   *
   * `AvariaInput.descricao` tinha `minLength: 1` e nenhum teto, então o único
   * limite do texto era o do parser: `CORPO_MAX_FOTO_BYTES` cabe **3.848.880
   * bytes**, e uma colagem acidental de **3,8 MiB** virava linha no banco e
   * viajava de volta em toda listagem de avarias daquela reserva.
   *
   * O número do `maxLength` não é gosto: o E186 mediu o envelope da avaria em
   * **54 bytes** (`{"descricao":"","custoReparo":1234.56,"fotoBase64":""}`) e
   * declarou `ENVELOPE_MAX_BYTES` = 4 KiB **exatamente para este campo**. O que
   * esta régua prega é que a promessa é cumprida — e ela lê o SPEC, que é a
   * fonte da verdade, não o zod gerado nem a constante da tela.
   */
  const PIOR_BYTE_POR_CARACTERE = 3; // o travessão "—" em UTF-8; os de 4 bytes ocupam 2 chars
  /**
   * **E214 — o envelope passou a ter DOIS campos de texto livre, e a régua
   * somava um só.**
   *
   * A `justificativaDaTaxa` entrou no `AvariaInput` no mesmo corpo que carrega a
   * foto. Deixada de fora desta conta, a régua continuaria verde enquanto a
   * promessa do `ENVELOPE_MAX_BYTES` deixava de ser verdade — a classe exata que
   * o E186 e o E199 acharam em outras varreduras: **a régua que mede menos do
   * que anuncia**.
   *
   * A conta declarada, e é ela que este teste prega:
   * 1.000 × 3 + 300 × 3 + 79 = **3.979** dos 4.096, com 117 de folga.
   */
  const CAMPOS_DE_TEXTO_DA_AVARIA = ["descricao", "justificativaDaTaxa"] as const;
  const ENVELOPE_DA_AVARIA_BYTES = JSON.stringify({
    descricao: "",
    justificativaDaTaxa: "",
    custoReparo: 1234.56,
    fotoBase64: "",
  }).length;

  it("os textos da avaria têm teto no spec, e os DOIS cabem no envelope reservado (S-O81/E214)", () => {
    const spec = readFileSync(path.join(RAIZ, O_SPEC), "utf8");
    const bloco = /\n {4}AvariaInput:\n([\s\S]*?)\n {4}\w/.exec(spec);
    expect(bloco, "o `AvariaInput` mudou de nome ou de indentação no spec").toBeTruthy();

    const tetos = CAMPOS_DE_TEXTO_DA_AVARIA.map((campo) => {
      const m = new RegExp(`${campo}:\\s*\\{[^}]*maxLength:\\s*(\\d+)`).exec(bloco![1]!);
      expect(
        m,
        `\`${campo}\` voltou a ser texto sem teto — o único limite passa a ser o do parser, 3,8 MiB`,
      ).toBeTruthy();
      return Number(m![1]);
    });
    const [descricaoDoSpec, justificativaDoSpec] = tetos as [number, number];

    expect(ENVELOPE_DA_AVARIA_BYTES).toBe(79);
    const envelope = /export const ENVELOPE_MAX_BYTES = ([^;]+);/.exec(fonteDoServidor());
    // eslint-disable-next-line no-eval
    const reservado = eval(envelope![1]!) as number;
    expect(
      tetos.reduce((s, t) => s + t * PIOR_BYTE_POR_CARACTERE, 0) + ENVELOPE_DA_AVARIA_BYTES,
      "os textos da avaria não cabem mais nos bytes que a conta do corpo reserva para eles",
    ).toBeLessThanOrEqual(reservado);

    // E a tela, que não importa o api-zod, repete os mesmos números — a forma do
    // espelho da S-O19: quando não dá para compartilhar, prega-se a igualdade.
    expect(
      AVARIA_DESCRICAO_MAX_CHARS,
      "o teto mudou de um lado só — o campo aceitaria o que o servidor recusa, ou o contrário",
    ).toBe(descricaoDoSpec);
    expect(
      AVARIA_JUSTIFICATIVA_MAX_CHARS,
      "o teto da justificativa mudou de um lado só",
    ).toBe(justificativaDoSpec);

    // E214: o `CobrarAvariaInput` carrega o MESMO campo, e o teto tem de ser o
    // mesmo — dois números para uma decisão é a marca de que ela não foi tomada
    // (a lição do E186 sobre os dois tetos de corpo da mesma foto).
    const cobrar = /\n {4}CobrarAvariaInput:\n([\s\S]*?)\n {4}\w/.exec(spec);
    const naCobranca = /justificativaDaTaxa:\s*\{[^}]*maxLength:\s*(\d+)/.exec(cobrar![1]!);
    expect(
      Number(naCobranca![1]),
      "a justificativa tem dois tetos — o mesmo campo aceitaria tamanhos diferentes por porta",
    ).toBe(justificativaDoSpec);
  });
});
