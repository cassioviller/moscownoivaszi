import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FOTO_MAX_BYTES } from "./limites";

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

    const m = /export const CORPO_MAX_FOTO_BYTES = ([^;]+);/.exec(servidor);
    expect(m, "a constante única do corpo mudou de nome ou de forma").toBeTruthy();
    expect(m![1], "o teto do corpo tem de SAIR do teto da foto, senão os dois divergem de novo").toContain(
      "FOTO_MAX_BYTES",
    );

    // eslint-disable-next-line no-eval
    const corpo = eval(m![1]!.replace("FOTO_MAX_BYTES", String(FOTO_MAX_BYTES))) as number;
    const fotoEmBase64 = Math.ceil(FOTO_MAX_BYTES * (4 / 3));
    expect(
      corpo,
      "o corpo tem de caber a foto codificada — senão a recusa vem do parser, sem a frase que explica",
    ).toBeGreaterThan(fotoEmBase64);
    // E a folga é do tamanho de um envelope, não de uma segunda foto: teto de
    // corpo generoso demais é o processo montando JSON que a guarda vai recusar.
    expect(corpo - fotoEmBase64).toBeLessThan(FOTO_MAX_BYTES);
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
  });
});
