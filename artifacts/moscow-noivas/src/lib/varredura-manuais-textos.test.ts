import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chipsDe, lerDoRepo, manuaisVersionados } from "./manuais-do-repositorio";

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

// S-C271 — a leitura e o enumerador dos manuais vêm de um lugar só. O `porGit`
// acima fica: esta varredura também enumera a TELA (`pages/**`, `routes/**`),
// que não é assunto do módulo dos manuais.
const ler = lerDoRepo;

const manuais = manuaisVersionados;

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
  tipo: "botão" | "recado" | "cláusula";
  exibido: string;
  /** O pedaço que a tela tem de conter. Igual ao exibido, salvo molde. */
  esperado: string;
  molde: boolean;
}

/**
 * Os chips `class="btn"`, com o `data-tela` quando o rótulo é montado.
 *
 * S-C271 — a extração do chip saiu daqui e da `varredura-manuais-contradicao`
 * para `manuais-do-repositorio.ts`. Eram duas cópias do mesmo regex com captura
 * diferente (uma pegava os atributos, a outra não), e a diferença não era
 * decisão: era o segundo autor não ter visto o primeiro.
 */
function botoes(manual: string): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const { atributos, rotulo: exibido } of chipsDe(html)) {
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

/**
 * **S-R14/S-R15 — a terceira família: a citação que NOMEIA uma cláusula.**
 *
 * As duas colheitas acima leem lugares fixos da marcação: o chip
 * `<span class="btn">` e a 1ª célula das tabelas *"O recado"*. Uma frase que o
 * sistema escreve e o manual cita **em prosa** — num `<li>`, num `<p>`, num
 * `<p class="nota">` — não passava por régua nenhuma. Foi assim que o E248
 * trocou *"multa e juros"* por *"multa, juros e correção"* em três telas e no
 * `whatsapp.ts:115`, atualizou o que estava em `<td>`, e deixou **cinco
 * citações** vivas na forma velha: `noiva.html:370, 420, 421` e
 * `vendedora.html:800, 806` — frases entre aspas que o código não escreve mais,
 * e que a noiva procura no portal sem achar.
 *
 * **A família é definida pelo conteúdo da própria citação, não por um atributo
 * que o autor lembre de pôr**: uma citação que diz *"cláusula 9ª"*, *"(18ª)"*,
 * *"cláusula 5ª §3º" é, por construção, uma frase que o SISTEMA imprime — a
 * prosa do manual cita as cláusulas sem aspas curvas, e as 15 medidas em 17/08
 * são 15 frases de sistema, sem um único falso positivo. Citação nova que nomeie
 * cláusula entra sozinha: não há como escrevê-la e ficar de fora da régua.
 *
 * **O que esta colheita NÃO alcança, e está declarado**: as outras citações de
 * prosa. Medido em 17/08 sobre os cinco manuais: **161 fragmentos entre aspas
 * curvas em `<em>`, dos quais 82 batem literalmente com a tela e 79 não** — e
 * os 79 são uma mistura de molde, de fala da vendedora (*"quanto ficou mesmo?"*)
 * e de frase de sistema. Separá-los é classificação manual de 79 itens com um
 * mecanismo de declaração novo, e é épico próprio. O `vendedora.html:800`
 * (*"· inclui R$ 15,00 de multa e juros"*, que não nomeia cláusula) é a prova
 * de que a fresta continua: ele foi corrigido à mão aqui, e nenhuma régua o
 * guarda.
 */
const CITA_CLAUSULA = /cláusula\s+\d+ª|\(\d+ª\)/i;

function clausulas(manual: string): Citacao[] {
  const html = ler(manual);
  // O que a colheita de RECADO já lê não é recolhido de novo — lá o `data-tela`
  // já mora no `<td>`, e uma segunda exigência sobre a mesma frase seria só uma
  // segunda chance de errar.
  const jaColhido = new Set(recados(manual).map((c) => c.exibido));

  const achados: Citacao[] = [];
  for (const linha of html.split("\n")) {
    for (const q of linha.matchAll(/“([^”]+)”/g)) {
      const cru = q[1]!.trim();
      const exibido = cru
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (jaColhido.has(exibido) || jaColhido.has(cru)) continue;
      if (!CITA_CLAUSULA.test(exibido)) continue;
      // O `data-tela` mora na tag que ABRE a citação — o `<em>` da prosa, ou o
      // `<p>` quando a citação é o parágrafo inteiro.
      const antes = linha.slice(0, q.index!);
      const abre = [...antes.matchAll(/<([a-z]+)((?:[^>"]|"[^"]*")*)>/gi)].at(-1);
      const declarado = abre ? /data-tela="([^"]+)"/.exec(abre[2] ?? "")?.[1] : undefined;
      achados.push({
        manual,
        tipo: "cláusula",
        exibido,
        esperado: declarado ?? exibido,
        molde: declarado !== undefined,
      });
    }
  }
  return achados;
}

const todas = () => manuais().flatMap((m) => [...botoes(m), ...recados(m), ...clausulas(m)]);

describe("varredura — o manual cita a tela LITERALMENTE (E210)", () => {
  it("a varredura tem o que varrer — piso de população", () => {
    // Regra 34: sem piso, renomear a classe do chip deixaria tudo verde por
    // vacuidade, e a régua passaria a atestar o que não olha.
    const citacoes = todas();
    expect(manuais().length).toBe(5);
    expect(citacoes.filter((c) => c.tipo === "botão").length).toBeGreaterThanOrEqual(140);
    expect(citacoes.filter((c) => c.tipo === "recado").length).toBeGreaterThanOrEqual(35);
    // S-R15: 13 citações que nomeiam cláusula fora das tabelas de recado,
    // medidas em 17/08 (5 estavam na forma que o E248 aposentou).
    expect(citacoes.filter((c) => c.tipo === "cláusula").length).toBeGreaterThanOrEqual(13);
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
     *
     * **S-C213 subiu para 11, e os dois são a dívida que o lote de S-C96
     * deixou declarada**: o manual do proprietário descrevia em prosa os dois
     * recados que não existem como frase contígua no código — o do carnê
     * depois do prazo tem a constante interpolada (`reserva.ts:152`) e o da
     * peça fora do rol está partido em três linhas de JSX
     * (`reservas/[bloqueioId].tsx:1117-1119`). Quatro agentes em paralelo não
     * podiam subir esta contagem; em série, os dois viraram citação com o
     * pedaço literal declarado.
     */
    /**
     * **E248 subiu para 12, pela mesma causa de sempre**: o recado da
     * qualificação (`orcamentos/[id].tsx`, "O contrato qualifica quem assina, e
     * a ficha ainda não tem:") termina na LISTA dos campos que faltam — não
     * existe a frase inteira no código. Os três outros recados que o E248 pôs
     * no manual do proprietário (o reabrir do último, o estorno em dobro, a
     * conta de comissão) são frases contíguas em `MENSAGENS_ERRO` e entraram
     * como citação literal, sem molde.
     */
    /**
     * **S-R15 sobe para 23, e os 11 novos são a família das cláusulas.** A
     * colheita nova recolhe 13 citações; 2 batem literalmente com a tela
     * (*"Prazo de devolução antecipada da reserva (cláusula 18ª)"*, o rótulo do
     * campo, citado igual nos manuais do proprietário e da vendedora) e 11 são
     * molde pela razão de sempre — o valor está DENTRO da frase (o acréscimo em
     * reais, os dias de atraso, o expediente da loja, o percentual do reajuste,
     * o código da peça). Onze declarações de uma vez é o preço de estrear uma
     * família inteira, e não deve se repetir: daqui para a frente, citação nova
     * que nomeie cláusula ou bate literal, ou declara o pedaço.
     */
    const moldes = todas().filter((c) => c.molde);
    expect(moldes.length).toBe(23);
    // E o molde tem de ser mais curto que o exibido — senão não é molde, é uma
    // citação literal com um atributo pendurado.
    for (const m of moldes) {
      expect(m.esperado.length, `${m.manual}: «${m.esperado}» não encurta «${m.exibido}»`)
        .toBeLessThan(m.exibido.length);
    }
  });
});
