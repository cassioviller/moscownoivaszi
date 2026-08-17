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
 * **Remedido em 17/08 (E252): 1416 atos para 1396 entidades distintas** — 20
 * pares apareceram —, e **nenhum deles é parcela VIVA**: as 20 são rastro de
 * E2E que a `parcelas` já não tem, e a trilha não é apagada em lugar nenhum. As
 * 301 parcelas vivas com ato continuam tendo um ato cada. A população segue
 * zero; o que mudou é que agora ela precisa da junção com `parcelas` para ser
 * contada — contar `audit_log` sozinho passou a dizer que existe o que não
 * existe.
 *
 * Esta régua é o que impede a dívida de crescer calada: ela enumera quem soma
 * dinheiro por `recebido_em` e exige que cada um esteja **na lista de quem usa
 * a divisão** ou **na lista da dívida, com o motivo**. Leitura nova que some
 * dinheiro por essa coluna reprova aqui, e o vermelho é onde se decide de que
 * lado ela fica.
 *
 * ## E a S-C52, que era o mesmo carimbo pelo outro lado — FECHADA no E252
 *
 * `contabilidade/enviar` selecionava parcelas por `recebido_em`, e o carimbo
 * ficava meio passo atrás do CSV do fluxo, que já divide. Esta régua dizia, na
 * letra, *"conserte o carimbo (carimbar por ATO, que pede a casa da S-C51)
 * antes de construir leitura em cima dele"* — e foi o que o **E252 (S-R6)**
 * fez: cada ato ganha uma linha em `envio_contabilidade_de_recebimentos`, e
 * `parcelas.enviado_contabilidade_em` passa a ser DERIVADO (todos os atos
 * válidos declarados). A janela do envio é a do ATO, a mesma do caixa.
 *
 * **A garantia abaixo fica**, e o motivo mudou de lado: a coluna agora responde
 * *"todos os atos desta parcela foram declarados?"*, e não *"quantos"* — quem
 * precisar do detalhe lê a tabela por ato, que é onde ele mora. Ler a coluna
 * como se fosse a lista de recebimentos declarados continua sendo a pergunta
 * errada, e é nela que a régua faz tropeçar. Medido: fora do próprio carimbo,
 * **nenhum leitor** — o `pendentesEnvio` da tela da folha lê `pagamentos`.
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
    // E247 (G4): o piso contava FONTES, não achados da peneira — um regex
    // envelhecido devolveria `[]` e a lista vazia passaria verde. A peneira tem
    // de continuar achando quem se SABE que soma por `recebido_em`: os dois que
    // usam a divisão e a dívida declarada. Se algum sumir daqui, ou o arquivo
    // mudou (aí a lista muda com ele) ou o regex parou de ver — e é a segunda
    // que este assert existe para pegar.
    const achados = somamPorRecebidoEm();
    expect(achados).toEqual(expect.arrayContaining([...USAM_A_DIVISAO, ...Object.keys(DIVIDA_DECLARADA)]));
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(achados.length).toBeGreaterThanOrEqual(USAM_A_DIVISAO.length + Object.keys(DIVIDA_DECLARADA).length);
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
     * **E252 — o carimbo foi consertado, e é por isso que esta régua continua.**
     *
     * Ela pedia, na letra, *"conserte o carimbo (carimbar por ATO) antes de
     * construir leitura em cima dele"*, e o E252 (S-R6) o fez: o envio enumera
     * ATOS, cada um com linha em `envio_contabilidade_de_recebimentos`, e a
     * coluna da parcela é DERIVADA de todos eles.
     *
     * O que ela pega agora é a pergunta errada, não o carimbo torto: a coluna
     * responde *"tudo desta parcela foi declarado?"* e nada mais. Quem quiser
     * saber QUAIS recebimentos entraram em qual pacote lê a tabela por ato — e
     * uma tela de "pendentes de envio" montada sobre a coluna voltaria a somar
     * a parcela inteira num mês só.
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
      "alguém passou a LER `parcelas.enviado_contabilidade_em`. Desde o E252 ela responde uma " +
        "pergunta só — 'todos os atos desta parcela foram declarados?' —, e uma parcela recebida " +
        "em partes tem o dinheiro dela em pacotes DIFERENTES. Quem precisa saber qual recebimento " +
        "entrou em qual pacote lê `envio_contabilidade_de_recebimentos`, que é por ATO.",
    ).toEqual([]);
  });
});
