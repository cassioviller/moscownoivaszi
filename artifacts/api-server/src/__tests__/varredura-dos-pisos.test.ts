import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **S-RM33 (E268) — nenhum piso `>=` segue sem julgamento.**
 *
 * O E263 achou que o E259 tinha publicado *"136/118 citações com casa"* quando
 * eram **139/121**, e nada tinha mudado nos manuais entre uma medição e a
 * outra: o que escondeu foi a forma da assertiva. `toBeGreaterThanOrEqual(139)`
 * fica verde com 139, com 200 e com 2.000 — então quem lê o número na linha lê
 * uma MEDIDA, e o que está ali é um PISO.
 *
 * Contados para este épico: **26 pisos em 12 varreduras**, fora os quatro do
 * `varredura-manuais-textos`, que foram do E267. O veredito foi dado um a um, e
 * o critério não é a folga em por cento — é se o conjunto é **fechado ou
 * aberto**:
 *
 * - **conjunto FECHADO** (os cinco manuais, os cinco perfis, as quatro páginas
 *   públicas, os três SPECS do banco virgem, as 99 anotações `data-regua`) —
 *   ele só muda por decisão de alguém, e essa decisão tem de passar por uma
 *   linha alterada aqui. **Cinco viraram `toBe`.** O caso mais próximo da
 *   S-RM33 é o das anotações: o piso dizia **97** e a população é **99** —
 *   duas apareceram sem que a assertiva piscasse;
 * - **conjunto ABERTO** (schemas do spec, colunas do drizzle, rotas, migrações,
 *   specs de E2E, campos de texto livre) — ele cresce a cada épico que não tem
 *   nada a ver com a varredura, e um número exato ali seria uma linha de
 *   manutenção por semana sem nenhum defeito pego. **Vinte e um continuam
 *   `>=`** — e passam a dizer na letra que são piso.
 *
 * **Esta régua é o que impede o vigésimo sétimo de nascer calado.** Ela não
 * proíbe o `>=`: obriga a marca, e a marca é onde o autor declara que pensou.
 */
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const MARCA = "piso anti-vacuidade";

/**
 * As varreduras e sondas de todo o repositório, dos dois pacotes — menos ESTA.
 *
 * Ela se acusou na primeira execução, em dois sítios: o pedaço de código que
 * procura o padrão é, ele mesmo, o padrão. Uma régua que se lê é a fresta da
 * S-RM30 noutra roupa, e aqui ela é barata de fechar.
 */
function varreduras(): string[] {
  return arquivosVersionados(RAIZ, ["artifacts", "lib"]).filter(
    (f) =>
      /\.test\.tsx?$/.test(f) &&
      /varredura|sonda/i.test(f) &&
      !f.endsWith("varredura-dos-pisos.test.ts"),
  );
}

/**
 * **E excluir a si mesma não bastou: a segunda execução caiu num COMENTÁRIO de
 * outro arquivo.**
 *
 * A nota que o E268 escreveu em `varredura-das-varreduras.test.ts:142` — a nota
 * que CONTA que esta régua se lia — cita o pedaço de código entre crases, e ela
 * foi lida como um piso sem marca. **É a S-RM30 pela quinta vez no mesmo dia**,
 * depois do E265 (comentário), do E266 (a própria declaração), do E267 (o
 * corpus dos manuais) e da autoexclusão acima. A classe é uma só: **varredura
 * escrita por busca em fonte lê tudo o que se PARECE com o objeto, e prosa
 * sobre o objeto se parece com ele.**
 *
 * As posições ficam de pé — o comentário vira branco, não some —, porque a
 * acusação nomeia a LINHA e um docblock de doze linhas apagado deslocaria todo
 * número abaixo dele. E a MARCA continua sendo lida no fonte CRU: ela vive num
 * comentário de propósito.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (linha, antes: string) => antes + " ".repeat(linha.length - antes.length));
}

describe("S-RM33 — todo piso `>=` de varredura diz que é piso", () => {
  it("a régua tem o que varrer", () => {
    // A mesma regra 34 que as varreduras que ela varre: sem população, ela
    // atestaria o vazio. Medido em 17/08: 13 varreduras com piso, de 39.
    const todas = varreduras();
    expect(todas.length).toBeGreaterThan(20);
    const comPiso = todas.filter((f) =>
      semComentarios(readFileSync(join(RAIZ, f), "utf8")).includes("toBeGreaterThanOrEqual"),
    );
    expect(comPiso.length).toBeGreaterThan(5);
  });

  it("nenhum `toBeGreaterThanOrEqual` de varredura fica sem a marca", () => {
    const semMarca: string[] = [];
    for (const relativo of varreduras()) {
      const cru = readFileSync(join(RAIZ, relativo), "utf8").split("\n");
      // O PISO se procura no código sem comentário; a MARCA se procura no fonte
      // cru, porque ela mora justamente num comentário.
      const codigo = semComentarios(cru.join("\n")).split("\n");
      codigo.forEach((linha, i) => {
        if (!linha.includes(".toBeGreaterThanOrEqual(")) return;
        // A marca vive na linha de cima ou na própria linha; um docblock que
        // fale do assunto não conta — ela é literal de propósito, para um
        // `grep` responder "quantos pisos há hoje?" sem abrir arquivo nenhum.
        const vizinhas = [cru[i - 1] ?? "", cru[i] ?? "", cru[i - 2] ?? ""];
        if (vizinhas.some((l) => l.includes(MARCA))) return;
        semMarca.push(`${relativo}:${i + 1} — ${(cru[i] ?? "").trim().slice(0, 80)}`);
      });
    }
    expect(
      semMarca,
      `piso sem julgamento: \`toBeGreaterThanOrEqual(N)\` fica verde com N, com 2N e com 20N, ` +
        `e quem lê a linha lê o N como medida. Se o conjunto é FECHADO, use \`toBe\`; se é ABERTO, ` +
        `escreva "${MARCA}" na linha de cima e diga por quê (S-RM33)`,
    ).toEqual([]);
  });

  /**
   * O contrário da anterior: marca posta onde não há piso é ruído que ensina a
   * ignorar a marca, e daí a próxima régua nasce sem ela sem que ninguém note.
   */
  it("nenhuma marca sobra num arquivo que já não tem piso", () => {
    const orfas: string[] = [];
    for (const relativo of varreduras()) {
      const cru = readFileSync(join(RAIZ, relativo), "utf8").split("\n");
      const codigo = semComentarios(cru.join("\n")).split("\n");
      cru.forEach((linha, i) => {
        if (!linha.includes(MARCA)) return;
        const abaixo = [codigo[i + 1] ?? "", codigo[i + 2] ?? "", codigo[i] ?? ""];
        if (abaixo.some((l) => l.includes(".toBeGreaterThanOrEqual("))) return;
        orfas.push(`${relativo}:${i + 1}`);
      });
    }
    expect(orfas, `marca de piso sem piso embaixo:\n${orfas.join("\n")}`).toEqual([]);
  });
});
