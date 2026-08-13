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
  it("120 `type: integer` no spec, e o zod gerado não traduz nenhum", () => {
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
    ).toBe(128);

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
   */
  it("839 datas coercidas — as datas coercidas estão contadas — `null` vira 1970 e o zod aprova", () => {
    const coeridas = (zod.match(/coerce\.date\(\)/g) ?? []).length;
    expect(
      coeridas,
      "mudou o número de datas coercidas? A guarda do V12 (`reservas.ts`) é campo a campo, não global",
    ).toBe(839);
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
