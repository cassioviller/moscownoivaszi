import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll } from "vitest";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * S-O3 — **o gerador de zod perde restrições do spec, e a classe nunca foi
 * contada.**
 *
 * O `openapi.yaml` é a fonte da verdade do contrato, e o `orval` traduz cada
 * schema para um zod que as rotas usam. A tradução **não é total**, e cada
 * buraco dela já custou um achado fechado na rota, um de cada vez:
 *
 * - **P5** — `numParcelas: { type: integer, minimum: 1, maximum: 360 }` virou
 *   `zod.number().min(1).max(...)`. **O `integer` sumiu.** `numParcelas: 2.5`
 *   atravessava, e o carnê nascia com duas parcelas e meia.
 * - **V12** — `zod.coerce.date()` sobre `null` devolve **01/01/1970** com
 *   `success: true`, porque `new Date(null)` é a época Unix e é uma data
 *   válida. A reserva nascia com casamento em 1970.
 *
 * Os dois foram consertados **na rota**. A classe ficou, e ela não é greppável
 * pelo spec — só comparando as duas pontas se descobre quantas são.
 *
 * **Medido em 2026-08-12: 115 `type: integer` no spec, ZERO `.int()` no zod
 * gerado.** Não é "alguns escaparam": é a tradução inteira do `integer` que não
 * existe.
 *
 * Esta varredura não conserta nada — ela **conta**, e trava a contagem. É a
 * mesma forma da `varredura-portas-sob-tranca` (E171): enquanto o gerador for
 * este, a dívida é conhecida e não cresce em silêncio. O dia em que alguém
 * acrescentar um `integer` que precise mesmo ser inteiro, a régua o lista aqui
 * e a decisão é consciente — guardar na rota, como P5 e V12, ou trocar o
 * gerador.
 *
 * **Enumera pelo versionamento** (regra da casa): 65% do que o disco devolve em
 * sessão com agentes é cópia de worktree órfão.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");
const SPEC = "lib/api-spec/openapi.yaml";
const ZOD = "lib/api-zod/src/generated/api.ts";

function versionado(arquivo: string): string {
  const saida = execFileSync("git", ["ls-files", arquivo], { cwd: RAIZ, encoding: "utf8" }).trim();
  if (!saida) throw new Error(`${arquivo} não está versionado — a varredura leria o disco`);
  return readFileSync(path.join(RAIZ, arquivo), "utf8");
}

/**
 * Os campos `type: integer` do spec, com o nome da propriedade.
 *
 * O spec escreve as duas formas — inline (`pagina: { type: integer, ... }`) e
 * em bloco. As duas entram: o que se conta é a INTENÇÃO declarada, não a
 * grafia.
 */
function inteirosDoSpec(): string[] {
  const fonte = versionado(SPEC);
  const nomes: string[] = [];
  for (const linha of fonte.split("\n")) {
    // Inline: `nome: { type: integer, ... }`
    const inline = /^\s*([A-Za-z0-9_]+):\s*\{[^}]*type:\s*integer/.exec(linha);
    if (inline) {
      nomes.push(inline[1]!);
      continue;
    }
    // Bloco: `type: integer` numa linha só — o nome está acima, e para a
    // CONTAGEM ele não é necessário.
    if (/^\s*type:\s*integer\s*$/.test(linha)) nomes.push("(bloco)");
  }
  return nomes;
}

describe("varredura — o que o gerador de zod perde do spec (S-O3)", () => {
  const spec = versionado(SPEC);
  const zod = versionado(ZOD);

  /**
   * O piso. Conjunto vazio aprova tudo em silêncio, que é a falha mais cara de
   * uma sonda — verde por não ter olhado.
   */
  it("olha para os dois arquivos, e eles são grandes", () => {
    expect(spec.length).toBeGreaterThan(100_000);
    expect(zod.length).toBeGreaterThan(100_000);
    expect(inteirosDoSpec().length).toBeGreaterThanOrEqual(100);
  });

  /**
   * **A dívida do `integer`, travada.**
   *
   * O número não é uma meta: é o retrato. Ele SOBE quando alguém acrescenta um
   * `type: integer` ao spec — e é aí que a régua serve, porque obriga a
   * perguntar se aquele campo precisa mesmo ser inteiro na borda. Se precisar,
   * a rota guarda (como P5) e o número aqui sobe junto, com a decisão escrita.
   */
  it("133 `type: integer` no spec, e o zod gerado não traduz nenhum", () => {
    const inteiros = inteirosDoSpec();
    expect(
      inteiros.length,
      "acrescentou um `integer` ao spec? Confira se a rota precisa guardá-lo (P5) e atualize esta contagem",
      // E211: 115 → 116. O novo é `Contrato.reajustesDeData`, e a decisão que
      // esta régua obriga a tomar está tomada: ele é campo de RESPOSTA, não de
      // entrada — ninguém o manda pela borda, então não há rota para guardá-lo.
      // A tela o lê para saber qual degrau da escada do §3º vem agora.
      //
      // E212: 116 → 119, e os três são da cláusula 16ª. Dois são de RESPOSTA —
      // `CobrancaDeAtrasoLinha.dias` e `CobrancaDeAtraso.maiorAtraso`, contagens
      // que o servidor calcula e ninguém manda pela borda. O terceiro,
      // `CobrarAtrasoInput.prazoDias`, É de entrada, e a rota o guarda: o spec
      // prega `minimum: 0, maximum: 365` e o handler cai no default de 7 quando
      // ele não vem — a mesma decisão que o `prazoDias` do `CobrarAvariaInput`
      // já tinha tomado.
      //
      // E213: 119 → 120. O novo é `MoraDaParcela.dias`, e é de RESPOSTA — dias
      // corridos desde o vencimento, que o servidor conta e ninguém manda pela
      // borda. Não há rota para guardá-lo.
      //
      // E222: 120 → 128, e são OITO porque o expediente de retirada aparece
      // duas vezes no spec — os quatro campos em `RegraDisponibilidade`
      // (resposta) e os mesmos quatro em `RegraDisponibilidadeInput` (entrada).
      // Os três de minutos são `retiradaAberturaMinutos`,
      // `retiradaFechamentoMinutos` e `retiradaFechamentoSabadoMinutos`; o
      // quarto é o `items` de `retiradaDias`, que conta como integer por dentro
      // do array.
      //
      // **Os de ENTRADA a rota guarda**, e é a decisão que esta régua obriga a
      // tomar: o `PUT /disponibilidade/regras` recusa abertura ≥ fechamento
      // (`HORARIO_DE_RETIRADA_INVALIDO`, e no sábado também) e semana sem dia
      // nenhum (`SEM_DIA_DE_RETIRADA`). Sem essas duas paredes o expediente
      // salvaria invertido e `foraDoExpedienteDeRetirada` recusaria as 24 horas
      // do dia — a mesma parede que o expediente de ATENDIMENTO já tinha, agora
      // no segundo.
      //
      // S-C32: 128 → 130, e os dois são de RESPOSTA. `AtrasoNaFila.maiorAtraso`
      // é a mesma contagem de dias que `CobrancaDeAtraso` já declarava, agora
      // por linha da fila; `FilaDeAtrasos.pecas` é quantas peças estão fora do
      // prazo na loja inteira. Os dois o servidor calcula e ninguém manda pela
      // borda — a fila é só leitura, e não há rota para guardá-los.
      //
      // S-C86: 130 → 131. O novo é `PecaForaSemContrato.dias` — há quantos dias
      // a peça sem contrato ATIVO está fora da arara. É a MESMA contagem de
      // `AtrasoNaFila.maiorAtraso` do lado que não tem preço, e é de RESPOSTA
      // pela mesma razão: `diasDeAtraso` a calcula do fim do uso previsto até
      // hoje, e nenhuma borda a manda.
      //
      // E217: 131 → 133, e os dois são de ENTRADA — a régua guarda os dois.
      // `ContratoInput.prazoDevolucaoReservaDias` e
      // `ContratoUpdate.prazoDevolucaoReservaDias` (D3, cláusula 18ª): o
      // `POST /contratos` grava explicitamente
      // (`prazoDevolucaoReservaDias: contratoData.prazoDevolucaoReservaDias ??
      // null`) e o `PATCH` grava por `...parsed.data` — os dois viram coluna.
      // O terceiro sítio, `Contrato.prazoDevolucaoReservaDias` na RESPOSTA, é
      // `type: ["integer", "null"]` — a forma em array não casa com este
      // regex (`type: integer` literal), e por isso não conta aqui.
      //
      // S-C232: 133 → 132. O `ContratoUpdate.prazoDevolucaoReservaDias` virou
      // `type: ["integer", "null"]` (apagar o prazo da 18ª é gesto legítimo, e
      // `null` passou a APAGAR), então ele saiu deste regex pelo MESMO motivo
      // do parágrafo acima. A guarda de entrada não mudou: o `PATCH` continua
      // gravando por `...parsed.data`, agora inclusive o `null`.
      //
      // E235: 132 → 133. `MarcarConciliadoResultado.recibos` — quantos ATOS o
      // carimbo marcou. É RESPOSTA, montada por extenso no handler (`atos.length`);
      // nenhuma entrada nova de inteiro.
      //
      // E239/S-O112: 133 → 134. `ContratoParcela.numero` — o recorte da parcela
      // que viaja DENTRO do contrato repete o `numero` da `Parcela`; a conta é
      // de linhas do spec, não de portas. Nenhuma entrada nova de inteiro.
    ).toBe(134);

    // A outra ponta: se um dia o gerador aprender `.int()`, este número deixa
    // de ser zero e a régua acima vira ruído — é o sinal de trocar a varredura
    // por uma conferência campo a campo.
    const traduzidos = (zod.match(/\.int\(\)/g) ?? []).length;
    expect(
      traduzidos,
      "o gerador passou a traduzir `integer`! Troque esta varredura por uma conferência campo a campo",
    ).toBe(0);
  });

  /**
   * **A outra metade da classe: `coerce.date()` sobre `null` é 1970.**
   *
   * `new Date(null)` é a época Unix, e é uma data VÁLIDA — o zod diz
   * `success: true` e a rota grava 01/01/1970. O V12 o fechou em `reservas.ts`
   * com uma guarda de corpo cru, campo a campo; nas outras 815 ocorrências, o
   * `null` explícito continua virando 1970 se alguém o mandar.
   *
   * O que salva a maioria é o corpo NÃO trazer a chave (ausente ≠ null), e por
   * isso a dívida é 🔵 e não 🟠. Mas ela é a mesma classe, e está contada.
   *
   * **929 → 956 no E179, e o vermelho foi o lembrete (regra 31).** A porta nova
   * `GET /reservas/:id` reusa o schema `Reserva`, que aninha `BloqueioVestido`
   * e `Lead`: **27 datas coercidas a mais, e nenhuma delas é campo de ENTRADA**
   * — a operação não tem corpo. É o retrato subindo por RESPOSTA, que é a
   * metade inofensiva da dívida: `coerce.date()` sobre o que o servidor acabou
   * de ler do banco não recebe `null` de ninguém. A conta sobe assim mesmo,
   * porque o dia em que ela parar de subir por porta nova é o dia em que ela
   * deixa de contar a dívida inteira.
   *
   * **956 → 816 no E192, e desta vez o vermelho foi PRÊMIO.** A S-O75 tirou do
   * spec uma subárvore que cinco portas de atendimento prometiam e nenhuma
   * preenchia (`ajustes[].atendimento`, com `lead` e `bloqueio` dentro): o zod
   * gerado perdeu **140 `coerce.date()` de uma vez**, **15% da dívida de datas
   * do repositório inteiro**, sem uma linha de rota mudar. É a medida do que
   * custava a promessa vazia — e a prova de que este número conta a dívida de
   * verdade, porque ele desceu quando a dívida desceu.
   *
   * **816 → 818 no E221**, e as duas são o caso inofensivo do E179: o `pagoEm`
   * do `Recibo` (loja) e o do `PortalRecibo` (noiva) são campos de RESPOSTA —
   * o recibo é lido, nunca enviado, e não há corpo em que um `null` entre. A
   * conta sobe assim mesmo, pelo motivo escrito acima.
   *
   * **838 → 839 na S-C11**, e a única é o `criadaEm` do `Avaria` visto pela
   * porta nova: o `PATCH /avarias/:id` devolve o mesmo schema que o `POST`, e o
   * gerador escreve um `coerce.date()` por OPERAÇÃO, não por schema. É o caso
   * inofensivo de sempre — campo de RESPOSTA, sem corpo em que um `null` entre.
   *
   * **839 → 892 no E215, e este salto é o MAIOR da história deste número —
   * 53 de uma vez.** Ele tem uma causa só: o campo `nascimento`, acrescentado a
   * `Lead`, `LeadInput`, `LeadUpdate` e `Contrato`. Como o gerador escreve um
   * `coerce.date()` por OPERAÇÃO, e `Lead` e `Contrato` são devolvidos por
   * dezenas delas, um campo de data vira 53 linhas.
   *
   * **E pela primeira vez a subida NÃO é toda inofensiva, o que é exatamente o
   * que esta régua existe para obrigar alguém a olhar.** Os casos anteriores
   * eram campos de RESPOSTA — não há corpo em que um `null` entre. Aqui há:
   * `LeadUpdate.nascimento` aceita `null` **de propósito**, para apagar dado
   * pessoal errado sem esperar o expurgo de 24 meses. Se o `coerce`
   * transformasse esse `null` numa data, a noiva passaria a ter nascido em
   * **01/01/1970** — e o contrato congelaria isso no papel que ela assina.
   *
   * **Medido pela porta, e não deduzido do YAML:** o gerador escreve
   * `zod.coerce.date().nullish()`, e o `nullish` deixa o `null` passar ANTES da
   * coerção. O `PATCH` com `nascimento: null` apaga a coluna —
   * `e215-qualificacao-api.test.ts`, *"apagar o `nascimento` com null APAGA —
   * não grava 1970 (V12)"*. A dívida sobe, o caso é seguro, e agora há teste
   * dizendo por quê em vez de um comentário afirmando.
   *
   * ────────────────────────────────────────────────────────────────────────
   *
   * **S-C281 — e o parágrafo acima é a lição, virada do avesso.**
   *
   * Ele mediu o caso SEGURO (`nullish`, onde o `null` curto-circuita) e
   * concluiu pela CLASSE: *"a dívida sobe, o caso é seguro"*. Os outros dois
   * casos nunca foram medidos, e nos dois o `null` chegava à coerção:
   *
   * - `dataDoCorpo().optional()` — o `optional` só olha `undefined`;
   * - `dataDoCorpo()` cru, **obrigatório** — nada olha nada.
   *
   * Medido na porta, com dinheiro: `POST /parcelas/:id/receber` com
   * `recebidoEm: null` respondia **200** e gravava
   * `parcelas.recebido_em = 1970-01-01T00:00:00Z`. Eram **113 campos** assim
   * no gerado — não os 22 que a grafia `.optional()` deixava contar.
   *
   * O conserto trocou o dono: o codegen escreve `dataDoCorpo()`
   * (`lib/api-zod/src/data-do-corpo.ts`), que recusa `null` antes de coagir e
   * preserva o `nullish` deste parágrafo. **O título desta régua dizia
   * "`null` vira 1970 e o zod aprova" — deixou de ser verdade, e o número
   * mudou de nome junto**, porque régua cujo enunciado envelheceu é régua que
   * ensina errado (a lição do E184, do lado dos testes). Quem conta agora são
   * as chamadas peneiradas; a garantia de que nenhuma escapou é da
   * `varredura-datas-nao-aceitam-nulo`, que mede por EFEITO.
   */
  it("930 datas coercidas — todas peneiradas pelo `dataDoCorpo()`, que recusa o `null`", () => {
    // E228: 892 → 910. O `orfaoSeguraAte` (S-C60) entrou no `BloqueioVestido`,
    // que viaja em 18 respostas — uma coluna nova num schema compartilhado
    // multiplica pelo número de portas que o serializam. Todas são SAÍDA
    // (resposta), onde o 1970 não nasce: o servidor escreve o campo, o cliente
    // só lê.
    // E229: 910 → 912 — `retirada` e `devolucao` da `LocacaoDoLead`, o recorte
    // estreito da Recepção. Também SAÍDA, e de uma rota só.
    // E230: 912 → 914 — `devolucaoPrevista`/`devolucaoFeitaEm` do
    // `VestidoDaNoiva` (S-C92). SAÍDA do portal, uma rota.
    // E231: 914 → 916 — as duas REAIS da `LocacaoDoLead` (S-C121). SAÍDA.
    // S-C240: 916 → 926, e são DEZ porque `Contrato.pecas[]` traz duas datas
    // (`retiradaFeitaEm`, `devolucaoFeitaEm`) e o `Contrato` é devolvido por
    // cinco operações — a mesma multiplicação do E215, que fez 53 de um campo
    // só. Todas são SAÍDA: a tela do contrato as LÊ para dizer "na loja",
    // "retirada em…" ou "devolvida em…", e nenhuma borda as manda.
    //
    // E desde a S-C281 elas nascem peneiradas: `dataDoCorpo()` recusa o `null`
    // antes de coagir, então nem as de saída podem virar 1970.
    const coeridas = (zod.match(/dataDoCorpo\(\)/g) ?? []).length;
    expect(
      coeridas,
      "mudou o número de datas coercidas? A guarda do V12 (`reservas.ts`) é campo a campo, não global",
      // E235: 926 → 927. `MovimentoDoSistema.conciliadoEm` (`date-time`, nullable) na
      // RESPOSTA do `listMovimentosConciliacao` — `dataDoCorpo().nullable()`, e o `null`
      // é o valor legítimo ("ainda não conferido"); a guarda do V12 não muda.
      // E236: 927 → 928. `ManualDeUso.atualizadoEm` (`date-time`, nullable) na RESPOSTA
      // do `listManuais` — o mtime do PDF versionado; `null` = a instalação subiu sem ele.
      // E237: 928 → 930. `IndiceMonetario.atualizadoEm` (resposta do GET/PUT de índices) e nada de entrada.
      // E239/S-O112: 930 → 925 — e DESCE porque uma promessa vazia deixou de ser
      // feita: `Contrato.parcelas` virou `ContratoParcela`, sem a volta
      // `contrato → lead`, então o `ParcelaLead.ultimoContatoEm` que as CINCO
      // operações de contrato prometiam dentro de cada parcela (e só o
      // `POST /contratos` cumpria) saiu do Zod delas. As quatro datas da
      // própria parcela continuam, sob o nome novo. Nenhuma entrada mudou.
    ).toBe(925);

    // S-C281 — e nenhuma sobrou crua. O hook do `orval.config.ts` é um gesto
    // que se pode desligar; se alguém o desligar, o número acima continua 916
    // pela outra grafia e só esta linha acusa.
    expect(
      (zod.match(/zod\.coerce\.date\(\)/g) ?? []).length,
      "voltou a haver `zod.coerce.date()` cru no gerado — a peneira da S-C281 saiu do codegen",
    ).toBe(0);
  });

  /**
   * A prova de que a perda é real, e não uma leitura minha do YAML: o campo do
   * P5 está no spec como `integer` e no zod como `number`, e o teste cita os
   * dois literalmente.
   */
  it("o caso do P5 continua sendo a prova viva da perda", () => {
    expect(spec).toContain("numParcelas: { type: integer, minimum: 1, maximum: 360 }");
    expect(zod).toMatch(/"numParcelas":\s*zod\.number\(\)\.min\(1\)/);
    expect(zod, "se aparecer `.int()` aqui, o gerador mudou").not.toMatch(
      /"numParcelas":\s*zod\.number\(\)\.int\(\)/,
    );
  });
});

/**
 * S-O3, a outra ponta — **o que a perda causa, e como ela passou a soar.**
 *
 * Consertar campo a campo seriam 115 guardas, e o P5 já mostrou que se conserta
 * um por vez conforme dói. O que fecha a CLASSE é a tradução do erro: o valor
 * fracionário atravessa a borda inteira e morre no `INSERT` com **22P02**
 * (*invalid input syntax for type integer*).
 *
 * **Vermelho medido em 2026-08-12:** `quantidade: 2.5` num item de orçamento
 * respondia **500 ERRO_INTERNO** — "quebrei", onde a verdade é "você mandou um
 * número que não é inteiro".
 */
describe("S-O3 — o inteiro perdido chega ao banco, e o banco agora é legível", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("quantidade fracionária responde 400 legível, não 500", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Dois véus e meio", valorUnitario: 1000, quantidade: 2.5 });

    expect(r.status, "era 500 ERRO_INTERNO — o zod não traduz `integer` e o banco recusou").toBe(400);
    expect(r.body.error).toBe("VALOR_FORA_DO_FORMATO");
    expect(r.body.detalhe, "a frase diz o que conferir").toMatch(/casas decimais/i);
  });

  it("quantidade inteira continua passando — a régua não fechou a porta certa", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Dois véus", valorUnitario: 1000, quantidade: 2 })
      .expect(201);
  });
});
