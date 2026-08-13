import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A régua (c) dos manuais — **o manual promete citar a tela literalmente, e
 * nada cobrava isso.**
 *
 * Cada manual fecha com a mesma frase: *"Os nomes de botão e os recados de erro
 * são citados literalmente da tela — se algum não bater com o que você vê, o
 * manual envelheceu, e vale avisar."* Essa promessa é a razão de o manual ser
 * usável no meio de um atendimento: a vendedora procura na tela o chip que leu
 * aqui. Se o texto divergir, ela procura o que não existe — e desconfia do
 * resto do manual, que é o custo real.
 *
 * As outras duas réguas cobrem o que envelhece SOZINHO:
 * - `varredura-manuais` — o MENU de cada perfil (sidebar × perfis semeados);
 * - `varredura-manuais-prazos` — os NÚMEROS (9 células contra 5 constantes).
 *
 * Faltava a terceira dimensão, e é a maior das três: **146 chips de botão e 35
 * linhas de recado**, todos prosa que ninguém conferia. Um rótulo trocado numa
 * tela não reprovava nada.
 *
 * ## O que a medição achou ao abrir isto (E210)
 *
 * - **100 nomes de botão distintos: 96 batem literalmente**, e 3 são MOLDE em
 *   5 citações — o rótulo é montado com um valor dentro
 *   (`Mover para ${diaMesAno(...)}`), e o manual o cita com um exemplo
 *   preenchido. O quinto foi a PRÓPRIA régua que achou: eu marcara o
 *   `Criar e copiar link` do manual da noiva e esquecera o gêmeo no da
 *   vendedora.
 * - **35 recados: 33 batem, 2 estavam TRUNCADOS** — o manual cortava o fim, e o
 *   fim é justamente a parte que diz o que fazer:
 *   *"…crie uma reserva de casamento."* onde o sistema diz *"…crie uma reserva
 *   de casamento **para vendê-la**."*, e o recado da data do casamento sem o
 *   *"Ajuste a data ou a reserva."*.
 *
 * ## `data-tela`: o molde diz qual é a parte literal
 *
 * Molde e citação literal eram indistinguíveis na marcação, e uma régua que
 * exigisse os 100 reprovaria nos 4 — errar para mais, que é a doença da S-O83.
 * A saída é o autor DECLARAR: `data-tela="Mover para "` diz *"o que a tela tem
 * é este pedaço"*, e a régua confere esse pedaço. Sem `data-tela`, exige-se o
 * texto inteiro.
 *
 * **Enumera com `git ls-files`** (regra da casa).
 */

const RAIZ = path.resolve(__dirname, "../../../..");

function porGit(padroes: string[]): string[] {
  return execFileSync("git", ["ls-files", ...padroes], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), "utf8");

const manuais = () => porGit(["docs/manuais/*.html"]).filter((f) => f.endsWith(".html"));

/**
 * A TELA, em uma corda só: o frontend (onde moram os rótulos de botão) e o
 * servidor (onde moram os recados que a tela repete). Os dois porque o manual
 * não distingue quem escreveu a frase — para quem lê, é tudo "a tela".
 */
function textoDaTela(): string {
  return porGit([
    "artifacts/moscow-noivas/src/**/*.tsx",
    "artifacts/moscow-noivas/src/**/*.ts",
    "artifacts/api-server/src/routes/*.ts",
    "artifacts/api-server/src/lib/*.ts",
    "lib/**/*.ts",
  ])
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map(ler)
    .join("\n");
}

interface Citacao {
  manual: string;
  tipo: "botão" | "recado";
  exibido: string;
  /** O pedaço que a tela tem de conter. Igual ao exibido, salvo molde. */
  esperado: string;
  molde: boolean;
}

/** Os chips `class="btn"`, com o `data-tela` quando o rótulo é montado. */
function botoes(manual: string): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const m of html.matchAll(/<span class="btn"([^>]*)>([^<]+)<\/span>/g)) {
    const atributos = m[1] ?? "";
    const exibido = m[2]!.trim();
    const declarado = /data-tela="([^"]+)"/.exec(atributos)?.[1];
    achados.push({
      manual,
      tipo: "botão",
      exibido,
      esperado: declarado ?? exibido,
      molde: declarado !== undefined,
    });
  }
  return achados;
}

/** As linhas das tabelas "O recado" — o texto entre aspas curvas da 1ª célula. */
function recados(manual: string): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const tabela of html.matchAll(/<th>O recado<\/th>[\s\S]*?<\/tbody>/g)) {
    for (const linha of tabela[0].matchAll(/<tr><td([^>]*)>“([^”]+)”<\/td>/g)) {
      const atributos = linha[1] ?? "";
      const exibido = linha[2]!.trim();
      const declarado = /data-tela="([^"]+)"/.exec(atributos)?.[1];
      achados.push({
        manual,
        tipo: "recado",
        exibido,
        esperado: declarado ?? exibido,
        molde: declarado !== undefined,
      });
    }
  }
  return achados;
}

const todas = () => manuais().flatMap((m) => [...botoes(m), ...recados(m)]);

describe("varredura — o manual cita a tela LITERALMENTE (E210)", () => {
  it("a varredura tem o que varrer — piso de população", () => {
    // Regra 34: sem piso, renomear a classe do chip deixaria tudo verde por
    // vacuidade, e a régua passaria a atestar o que não olha.
    const citacoes = todas();
    expect(manuais().length).toBe(5);
    expect(citacoes.filter((c) => c.tipo === "botão").length).toBeGreaterThanOrEqual(140);
    expect(citacoes.filter((c) => c.tipo === "recado").length).toBeGreaterThanOrEqual(35);
  });

  it("todo nome de botão e todo recado citados existem na tela", () => {
    const tela = textoDaTela();
    const divergem = todas()
      .filter((c) => !tela.includes(c.esperado))
      .map((c) => `${c.manual} · ${c.tipo}${c.molde ? " (molde)" : ""}: «${c.esperado}»`);

    expect(
      [...new Set(divergem)],
      `o manual cita o que a tela não tem:\n${[...new Set(divergem)].join("\n")}`,
    ).toEqual([]);
  });

  it("molde é a exceção declarada, e continua sendo exceção", () => {
    /**
     * Se os moldes crescerem, a promessa "citamos literalmente" vira letra
     * morta sem ninguém decidir isso. Seis era o que a medição do E210 achou:
     * 5 chips de botão (3 rótulos distintos) e 1 recado.
     *
     * **E224 subiu para 9, e os três novos têm a MESMA causa**: os recados das
     * cláusulas 4ª e 8ª §único são montados com a CONFIGURAÇÃO da loja dentro
     * (o expediente de retirada vem de `regra_disponibilidade`, o prazo vem de
     * `PRAZO_ANTES_DA_RETIRADA_DIAS`), então não existe no código a frase
     * inteira que a vendedora lê — existe o pedaço fixo e o resto é dado. É o
     * mesmo caso do `Mover para ${diaMesAno(...)}` que criou este mecanismo.
     */
    const moldes = todas().filter((c) => c.molde);
    expect(moldes.length).toBe(9);
    // E o molde tem de ser mais curto que o exibido — senão não é molde, é uma
    // citação literal com um atributo pendurado.
    for (const m of moldes) {
      expect(m.esperado.length, `${m.manual}: «${m.esperado}» não encurta «${m.exibido}»`)
        .toBeLessThan(m.exibido.length);
    }
  });
});
