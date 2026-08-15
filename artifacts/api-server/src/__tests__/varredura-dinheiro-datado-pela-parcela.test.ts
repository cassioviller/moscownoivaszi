import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **S-C52/S-C53 — quem ainda soma dinheiro pelo ÚLTIMO pedaço, e por quê.**
 *
 * `parcelas.recebido_em` guarda **o instante do último recebimento**, não de
 * cada um. Uma parcela com R$ 300,00 em 01/03 e R$ 700,00 em 15/03 tem
 * `recebido_em = 15/03` e `valor_recebido = 1000`: quem soma por essa coluna
 * data os R$ 300,00 de março no dia em que eles não entraram.
 *
 * A S-C31 consertou as TRÊS leituras do realizado (fluxo, CSV do fluxo e DRE)
 * com `realizadoPorRecebimento` — a parcela vira uma linha por ato. A sobra
 * S-C53 dizia que outras três *"ficaram fora do escopo de propósito"* e pedia
 * que fossem contadas.
 *
 * ## O que a medição achou, e uma das três não é dívida
 *
 * | leitura | veredito |
 * |---|---|
 * | `GET /financeiro/parcelas/exportar` | **não é dívida** — o CSV é uma linha por PARCELA, e a coluna "Recebido Em" diz o que promete: quando a parcela foi recebida (por último). Dividir ali seria mudar o que o arquivo É |
 * | `GET /financeiro/alerta-caixa` | **dívida, e o conserto não é aplicar a divisão** — ver abaixo |
 * | consolidado da rede (`admin.ts`) | **dívida**, e o conserto é caro pelo eixo errado — ver abaixo |
 *
 * ### O alerta-caixa: era CONSTRAINT, não omissão
 *
 * A consulta dele serve **dois motores com uma lista só**: o saldo olha para
 * trás pelo recebimento, a curva olha para frente pelo vencimento, e cada motor
 * recorta. `PARCIAL` conta como ABERTO (`STATUS_ABERTO = [PREVISTA, PARCIAL]`),
 * então uma parcela meio recebida está **nas duas pernas ao mesmo tempo** — o
 * `or` a traz uma vez de propósito.
 *
 * Aplicar `porRecebimento` a essa lista dividiria a PARCIAL em N linhas, e a
 * curva somaria o previsto dela **N vezes**. O erro que isso criaria (uma
 * projeção de entrada dobrada) é maior que o que corrige (o saldo datar um
 * pedaço no dia errado). **O conserto de verdade é partir a consulta em duas
 * listas, uma por motor** — e isso muda a assinatura de `alertaDeCaixa`.
 *
 * ### O consolidado da rede: o eixo é a LOJA, e a divisão é por loja
 *
 * `admin.ts` faz `sum(valor_recebido) GROUP BY loja_id WHERE recebido_em >=
 * inicioMes` — uma consulta agregada no SQL, para todas as lojas. A divisão
 * por ato precisa da trilha de UMA loja por vez (`realizadoPorRecebimento`
 * recebe `lojaId`): usá-la aqui trocaria uma consulta agregada por N consultas
 * mais N leituras de trilha, para uma tela de visão geral da rede.
 *
 * ## Por que isto é DÍVIDA DECLARADA e não conserto adiado sem data
 *
 * **A população é zero, e foi medida:** no `heliumdb`, `PARCELA_RECEBIDA` tem
 * **1193 atos para 1193 parcelas distintas** — nenhuma parcela foi recebida em
 * mais de um pedaço, nunca. O defeito está armado e não disparado, exatamente
 * como a S-C150 e a S-C220 estavam.
 *
 * Esta régua é o que impede a dívida de crescer calada: ela enumera quem soma
 * dinheiro por `recebido_em` e exige que cada um esteja **na lista de quem usa
 * a divisão** ou **na lista da dívida, com o motivo**. Leitura nova que some
 * dinheiro por essa coluna reprova aqui, e o vermelho é onde se decide de que
 * lado ela fica.
 *
 * ## E a S-C52, que é o mesmo carimbo pelo outro lado
 *
 * `contabilidade/enviar` seleciona parcelas por `recebido_em`, então o carimbo
 * fica meio passo atrás do CSV do fluxo, que já divide. Medido: **a coluna
 * `parcelas.enviado_contabilidade_em` não tem NENHUM leitor** além do `isNull`
 * do próprio carimbo (que o torna idempotente). O `pendentesEnvio` da tela da
 * folha lê `pagamentos`, não parcelas — a sobra generalizou do irmão.
 *
 * Ou seja: o descompasso existe e **não tem consequência**, porque ninguém
 * pergunta à parcela se ela já foi declarada. A dívida é o dia em que alguém
 * perguntar — e é isso que a segunda garantia abaixo prega.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");

function versionados(...globs: string[]): string[] {
  return execFileSync("git", ["ls-files", ...globs], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** O fonte do servidor, sem testes — é onde o dinheiro é somado. */
function fontesDoServidor(): string[] {
  return versionados("artifacts/api-server/src/**/*.ts").filter((f) => !f.includes("__tests__"));
}

/**
 * Quem SOMA dinheiro filtrando por `recebidoEm`: a soma e o filtro no mesmo
 * arquivo. É grafia, e a grafia é o que dá para afirmar sem parser — o que ela
 * não alcança está no cabeçalho.
 */
function somamPorRecebidoEm(): string[] {
  return fontesDoServidor().filter((rel) => {
    const texto = ler(rel);
    const soma = /sum\(\s*\$\{?\s*parcelasTable\.valorRecebido|valorRecebido\b[\s\S]{0,80}reduce|resumoCaixa|alertaDeCaixa|dreDoIntervalo|movimentosDoFluxo/.test(texto);
    const filtra = /parcelasTable\.recebidoEm|recebido_em/.test(texto);
    return soma && filtra;
  });
}

/**
 * Os que já datam cada pedaço pelo dia dele (S-C31).
 *
 * `recebimentos-do-caixa.ts` está aqui porque **ele É a divisão** — a régua o
 * acusou na primeira rodada, e é o falso positivo esperado de medir por grafia:
 * o motor cita `recebidoEm` e os nomes dos motores de dinheiro justamente
 * porque é ele quem os alimenta. Deixá-lo fora da lista seria pedir que o
 * conserto se conserte.
 */
const USAM_A_DIVISAO = [
  "artifacts/api-server/src/routes/financeiro.ts",
  "artifacts/api-server/src/lib/recebimentos-do-caixa.ts",
];

/** A dívida, com o motivo — nome sem motivo não entra. */
const DIVIDA_DECLARADA: Record<string, string> = {
  "artifacts/api-server/src/routes/admin.ts":
    "o consolidado da rede agrega no SQL por loja (`sum GROUP BY loja_id`), e a divisão por ato " +
    "é POR LOJA (`realizadoPorRecebimento` recebe `lojaId`): usá-la trocaria uma consulta por N " +
    "consultas mais N leituras de trilha, numa tela de visão geral. População medida em 15/08: " +
    "1193 atos para 1193 parcelas distintas — nenhuma parcela recebida em pedaços, nunca.",
};

describe("S-C53 — quem soma dinheiro por `recebido_em` está contado", () => {
  it("a varredura tem o que varrer — piso (S-C46/S-C260)", () => {
    expect(fontesDoServidor().length).toBeGreaterThan(40);
  });

  it("toda leitura que soma por `recebido_em` usa a divisão ou é dívida com MOTIVO", () => {
    const semLado = somamPorRecebidoEm().filter(
      (rel) => !USAM_A_DIVISAO.includes(rel) && !DIVIDA_DECLARADA[rel],
    );
    expect(
      semLado,
      "leitura nova que soma dinheiro por `parcelas.recebido_em`: ela data o pedaço antigo no dia " +
        "do último (S-C31/S-C53). Ou passe pela divisão (`realizadoPorRecebimento`), ou declare a " +
        "dívida COM O MOTIVO em DIVIDA_DECLARADA — e o motivo tem de dizer por que a divisão não cabe.",
    ).toEqual([]);
  });

  it("a dívida declarada é curta e cada linha diz por quê", () => {
    // A lição do E186: tabela de dívida também envelhece. Duas direções — nome
    // sem motivo não entra, e arquivo declarado que sumiu do repositório reprova.
    for (const [rel, motivo] of Object.entries(DIVIDA_DECLARADA)) {
      expect(versionados(rel), `${rel} saiu do versionamento — a dívida envelheceu`).toContain(rel);
      expect(motivo.length, `${rel} foi declarado sem motivo escrito`).toBeGreaterThan(120);
    }
    expect(Object.keys(DIVIDA_DECLARADA).length).toBe(1);
  });
});

describe("S-C52 — o carimbo da contadora na parcela não tem leitor, e é isso que o segura", () => {
  it("`parcelas.enviadoContabilidadeEm` só é lido pelo `isNull` do próprio carimbo", () => {
    /**
     * O carimbo seleciona por `recebido_em`, então ele fica meio passo atrás do
     * CSV do fluxo, que já divide por ato. Isso **não tem consequência hoje**
     * porque ninguém pergunta à parcela se ela já foi declarada — o
     * `pendentesEnvio` da folha lê `pagamentos`.
     *
     * O dia em que alguém ler, a resposta virá torta: uma parcela com pedaço em
     * fevereiro e o último em março é carimbada em março, e um "pendentes de
     * envio" construído sobre isso diria que fevereiro está fechado quando não
     * está. Por isso a régua não pede que o carimbo mude — pede que **quem for
     * lê-lo tropece aqui primeiro**, e conserte o carimbo antes.
     */
    const leitores = fontesDoServidor().filter((rel) => {
      const texto = ler(rel);
      if (!/parcelasTable\.enviadoContabilidadeEm/.test(texto)) return false;
      // O próprio carimbo: escreve com `.set({...})` e se protege com `isNull`.
      const soOCarimbo =
        /\.set\(\{ enviadoContabilidadeEm: agora \}\)/.test(texto) ||
        /enviadoContabilidadeEm: null/.test(texto);
      return !soOCarimbo;
    });

    expect(
      leitores,
      "alguém passou a LER `parcelas.enviado_contabilidade_em`. O carimbo seleciona por " +
        "`recebido_em` (o último pedaço), então a resposta vem meio mês atrasada para toda parcela " +
        "recebida em partes — S-C52. Conserte o carimbo (carimbar por ATO, que pede a casa da " +
        "S-C51) antes de construir leitura em cima dele.",
    ).toEqual([]);
  });
});
