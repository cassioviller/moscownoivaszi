import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DUPLICADO_POR_INDICE, SEM_FRASE_POR_DECISAO } from "../lib/erros";
import { arquivosDeRota, contradizPredicado, escritasDeRota, escritasQueAlcancam, tabelasEscritasCruas, type EscritaDeRota, type IndiceUnico } from "./escritas-de-rota";

/** A raiz do repositório — `arquivosDeRota()` devolve caminhos a partir dela. */
const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");

/**
 * E186 / S-O61 — **a conta que faltava: quantas restrições únicas uma pessoa
 * consegue violar por HTTP, e quantas delas sabem dizer o quê.**
 *
 * O E180 fechou a classe pela tradução (`DUPLICADO_POR_INDICE`, 11 índices) e
 * abriu a S-O61 com a frase que este arquivo executa: *"não há régua que conte
 * isso — a varredura prega que toda chave EXISTE, não que todo índice alcançável
 * por HTTP tenha frase"*. Sem a conta, o mapa é um passivo que só cresce quando
 * alguém tropeça: nada liga um índice novo do schema a uma decisão sobre ele.
 *
 * **A conta corrigiu o diagnóstico, e para menos.** A S-O61 dizia *"11 das 27, e
 * as 16 restantes seguem genéricas"*. Medido:
 *
 * | | |
 * |---|---|
 * | restrições únicas que não são PK | **27** |
 * | alcançáveis por rota, sem `onConflict` | **23** |
 * | com frase própria | **15** (eram 11) |
 * | sem frase, com julgamento escrito | **8** (a sobra dizia 16) |
 *
 * As **4** que saíram da conta — `lead_interesses_lead_id_unique`,
 * `regra_disponibilidade_loja_id_unique`,
 * `saldos_referencia_loja_id_data_referencia_unique` e
 * `vestido_fotos_vestido_id_ordem_unique` — não são alcançáveis porque a única
 * escrita de rota naquelas tabelas declara `onConflictDoUpdate`: o upsert
 * resolve a colisão dentro do INSERT e o 23505 nunca chega ao
 * `classificarErro`. Frase ali seria texto que ninguém lê.
 *
 * **E as outras 4 viraram frase neste épico** — convite pendente repetido,
 * regra de comissão no mesmo dia, conta paga duas vezes e versão de proposta
 * congelada duas vezes.
 *
 * **E238 (S-O83) — a conta passou a ser por COLUNA, e o passivo caiu de 8 para
 * 6.** A sobra dizia que a conta por tabela errava para MAIS em dois dos 23,
 * e a medição achou dois — não os dois que ela nomeava (a prosa de
 * `escritas-de-rota.ts` conta os três). Saem `contas_pagar_recorrencia_unica`
 * (a única porta que preenche `recorrencia_id` declara `onConflictDoNothing`
 * sobre ESSE índice; o `POST /contas-pagar` espalha um schema que não tem a
 * coluna) e `portal_tokens_lead_unq` (a única escrita crua é o UPDATE de
 * revogação, que não toca `lead_id`). As duas tinham julgamento manual em
 * `SEM_FRASE_POR_DECISAO` dizendo exatamente isso — e julgamento sobre índice
 * que ninguém alcança é dívida imaginária (a régua do órfão, abaixo, é quem
 * cobrou a baixa). `convites_loja_email_pendente_unq` FICA alcançável: dois
 * convites no mesmo segundo caem nele.
 *
 * | | |
 * |---|---|
 * | restrições únicas que não são PK | **27** |
 * | alcançáveis por rota, por coluna | **21** (eram 23 por tabela) |
 * | com frase própria | **15** |
 * | sem frase, com julgamento escrito | **6** (eram 8) |
 */
describe("E186 — os índices que uma rota alcança têm frase ou têm julgamento", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let alcancaveis: string[] = [];
  let porTabela: string[] = [];

  beforeAll(async () => {
    f = await criarFixture();
    // Convidar é ato de administração — o perfil da vendedora não passa do gate.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    // E238: as COLUNAS de cada índice vêm junto — é por elas que a conta decide.
    const r = await db.execute(sql`
      SELECT t.relname AS tabela, i.relname AS indice,
             (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS colunas,
             pg_get_expr(ix.indpred, ix.indrelid) AS predicado
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND ix.indisunique AND NOT ix.indisprimary
      ORDER BY t.relname, i.relname`);
    const indices: IndiceUnico[] = (r.rows as { tabela: string; indice: string; colunas: string; predicado: string | null }[]).map((x) => ({
      tabela: x.tabela,
      indice: x.indice,
      colunas: x.colunas.split(","),
      predicado: x.predicado,
    }));
    const escritas = escritasDeRota();
    alcancaveis = indices.filter((i) => escritasQueAlcancam(i, escritas).length > 0).map((i) => i.indice);
    const cruas = tabelasEscritasCruas();
    porTabela = indices.filter((i) => cruas.has(i.tabela)).map((i) => i.indice);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * Os pisos. Enumeração vazia aprova tudo em silêncio — verde por não ter
   * olhado é o pior resultado possível numa régua, e é a frase que o E180
   * escreveu sobre si mesmo.
   */
  it("olha para as rotas versionadas e para os índices do banco, e não para conjuntos vazios", () => {
    expect(arquivosDeRota().length, "a enumeração das rotas veio vazia").toBeGreaterThanOrEqual(15);
    expect(escritasDeRota().length, "nenhuma escrita de rota foi reconhecida").toBeGreaterThanOrEqual(80);
    expect(alcancaveis.length, "nenhum índice alcançável — a peneira cegou").toBeGreaterThanOrEqual(15);
  });

  /**
   * S-O123 — o predicado do índice PARCIAL entra na conta quando a escrita o
   * contradiz com um literal. Os dois lados: o INSERT que grava
   * `status: "CANCELADO"` não alcança `contratos_lead_ativo_unico`
   * (`WHERE status = ATIVO`); o que grava `"ATIVO"`, ou não grava literal
   * nenhum, continua alcançando — a régua só desconta o que LÊ.
   */
  it("S-O123 — o literal que contradiz o predicado do índice parcial tira a escrita da conta; o resto fica", () => {
    const indice: IndiceUnico = { tabela: "contratos", indice: "contratos_lead_ativo_unico", colunas: ["lead_id"], predicado: "(status = 'ATIVO'::contrato_status)" };
    const escrita = (literais: Array<[string, string | boolean | null]>): EscritaDeRota => ({
      arquivo: "sintetico.ts", linha: 1, verbo: "insert", tabela: "contratos", onConflict: false, onConflictColunas: null,
      colunas: ["lead_id", "status"], literais: new Map(literais),
    });
    expect(escritasQueAlcancam(indice, [escrita([["status", "CANCELADO"]])])).toHaveLength(0);
    expect(escritasQueAlcancam(indice, [escrita([["status", "ATIVO"]])])).toHaveLength(1);
    expect(escritasQueAlcancam(indice, [escrita([])])).toHaveLength(1);
    // As outras três formas que o schema usa, e a conjunção.
    expect(contradizPredicado("((ativo = true) AND (usuario_id IS NOT NULL))", new Map([["ativo", false]]))).toBe(true);
    expect(contradizPredicado("((ativo = true) AND (usuario_id IS NOT NULL))", new Map([["usuario_id", null]]))).toBe(true);
    expect(contradizPredicado("((ativo = true) AND (usuario_id IS NOT NULL))", new Map([["ativo", true]]))).toBe(false);
    expect(contradizPredicado("(usado_em IS NULL)", new Map([["usado_em", "2026-01-01"]]))).toBe(true);
    expect(contradizPredicado("(recorrencia_id IS NOT NULL)", new Map())).toBe(false);
    // E o que ela não lê não desconta.
    expect(contradizPredicado("(valor > 0)", new Map([["valor", "0"]]))).toBe(false);
    // No repositório: o único INSERT literal em contratos grava ATIVO — o índice continua alcançável.
    expect(alcancaveis).toContain("contratos_lead_ativo_unico");
  });

  /**
   * A conta. **Toda restrição única que uma rota alcança tem frase própria ou
   * tem o motivo do silêncio escrito** — e é a segunda metade que faz esta régua
   * valer: sem ela, "não traduzimos este" e "esquecemos deste" são o mesmo
   * arquivo verde.
   */
  it("todo índice alcançável por rota tem frase própria ou julgamento escrito", () => {
    const semJulgamento = alcancaveis.filter((i) => !(i in DUPLICADO_POR_INDICE) && !(i in SEM_FRASE_POR_DECISAO));
    expect(
      semJulgamento,
      "índice novo alcançável por HTTP: ou ganha frase em DUPLICADO_POR_INDICE, ou ganha o motivo do silêncio em SEM_FRASE_POR_DECISAO",
    ).toEqual([]);
  });

  /**
   * A contagem travada, do lado do passivo. É a régua 31 na letra: a lista de
   * nomes não trava nada — quem trava é o número, e ele cai quando alguém baixa
   * a dívida, ficando vermelho para cobrar a baixa aqui.
   */
  it("e o passivo sem frase é 6 — a contagem trava, não a lista", () => {
    const semFrase = alcancaveis.filter((i) => !(i in DUPLICADO_POR_INDICE));
    expect(semFrase).toHaveLength(6);
    expect(Object.keys(SEM_FRASE_POR_DECISAO)).toHaveLength(6);
  });

  /**
   * E238 (S-O83) — a conta por coluna contra a conta por tabela: a diferença é
   * o que a sobra chamava de "erra para MAIS", e ela está NOMEADA. Índice que
   * entrar aqui é um que a conta antiga cobraria julgamento e a nova não — e
   * o vermelho desta linha é o que obriga a explicar o terceiro.
   */
  it("a conta por coluna dispensa exatamente dois índices que a conta por tabela cobrava", () => {
    const dispensados = porTabela.filter((i) => !alcancaveis.includes(i)).sort();
    expect(dispensados).toEqual(["contas_pagar_recorrencia_unica", "portal_tokens_lead_unq"]);
    // E nunca o contrário: por coluna não alcança o que por tabela não alcança.
    expect(alcancaveis.filter((i) => !porTabela.includes(i))).toEqual([]);
  });

  /**
   * O outro lado: julgamento de silêncio sobre índice que ninguém alcança é
   * dívida imaginária, e ela envelhece igual — foi o que a S-A20 mediu quando
   * quatro nomes divergiram e só um gritou.
   */
  it("não há julgamento órfão — todo silêncio declarado é sobre índice alcançável", () => {
    const orfaos = Object.keys(SEM_FRASE_POR_DECISAO).filter((i) => !alcancaveis.includes(i));
    expect(orfaos, "silêncio declarado sobre índice que rota nenhuma alcança").toEqual([]);
    for (const [indice, motivo] of Object.entries(SEM_FRASE_POR_DECISAO)) {
      expect(motivo.length, indice).toBeGreaterThan(20);
    }
  });

  /**
   * As quatro que este épico promoveu a frase, pela porta de verdade — o
   * caminho inteiro (rota → banco → error handler → JSON), que é a metade que
   * uma função pura não prova.
   *
   * O convite é a mais barata de todas e a mais provável: a rota confere *"já é
   * membro desta loja"* e não confere convite pendente, então convidar duas
   * vezes o mesmo e-mail — o gesto de quem não sabe se o primeiro saiu — caía no
   * genérico.
   */
  it("o convite repetido diz que já há um em aberto, e não `REGISTRO_DUPLICADO`", async () => {
    const email = `e186-${randomUUID().slice(0, 8)}@exemplo.com`;
    const perfilId = f.perfilId;

    await agent
      .post(`/api/lojas/${f.lojaId}/equipe/convites`)
      .send({ nome: "Convidada", email, perfilId })
      .expect(201);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/equipe/convites`)
      .send({ nome: "Convidada de novo", email, perfilId })
      .expect(409);

    expect(r.body.error).toBe("CONVITE_PENDENTE");
    expect(r.body.detalhe).toContain("convite pendente");
  });

  /**
   * S-O80/E191 — **nenhuma rota traduz o 23505 por conta própria.**
   *
   * O E186 tirou o `catch` local de `equipe.ts` e achou o segundo no mesmo
   * gesto: `comissao.ts:1240` respondia `409 COMPETENCIA_JA_FECHADA` para
   * QUALQUER violação de unicidade da transação que fecha a competência — e ela
   * escreve em três tabelas (`contas_pagar`, `comissao_fechamentos`,
   * `contratos`). Achar o segundo lendo o primeiro é a regra 26 na letra: quando
   * o mesmo cuidado aparece escrito de duas formas, uma delas está errada.
   *
   * A régua enumera as rotas versionadas e cobra que a tradução de unicidade
   * more num lugar só — `DUPLICADO_POR_INDICE`, com o nome do índice. Sem ela, o
   * terceiro `catch` nasce sem ninguém notar, e ele nasce sempre com a frase da
   * recusa que o autor tinha em mente, sobre um índice que ele não conferiu.
   *
   * **A peneira é o IMPORT, não o nome.** A primeira versão procurava
   * `ehViolacaoUnica` no texto e acusou `equipe.ts`, cujo `catch` o E186 já
   * tinha tirado — o que sobrou lá é o comentário que CONTA a remoção. Régua
   * que confunde a prosa com o código cobra o conserto de quem já consertou.
   */
  const IMPORTA_A_PENEIRA = /import\s*\{[^}]*\behViolacaoUnica\b[^}]*\}\s*from\s*["'][^"']*lib\/erros["']/;

  it("nenhuma rota traduz a violação de unicidade por conta própria (S-O80)", () => {
    const rotas = arquivosDeRota();
    expect(rotas.length, "a enumeração das rotas veio vazia").toBeGreaterThanOrEqual(15);
    const comCatchLocal = rotas.filter((f) =>
      IMPORTA_A_PENEIRA.test(readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(
      comCatchLocal,
      "uma rota voltou a traduzir o 23505 sozinha — a frase dela vale para o índice que ela imaginou, não para o que estourou",
    ).toEqual([]);
  });
});
