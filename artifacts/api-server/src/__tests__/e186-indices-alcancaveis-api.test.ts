import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DUPLICADO_POR_INDICE, SEM_FRASE_POR_DECISAO } from "../lib/erros";
import { arquivosDeRota, escritasDeRota, tabelasEscritasCruas } from "./escritas-de-rota";

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
 */
describe("E186 — os índices que uma rota alcança têm frase ou têm julgamento", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let alcancaveis: string[] = [];

  beforeAll(async () => {
    f = await criarFixture();
    // Convidar é ato de administração — o perfil da vendedora não passa do gate.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const r = await db.execute(sql`
      SELECT t.relname AS tabela, i.relname AS indice
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND ix.indisunique AND NOT ix.indisprimary
      ORDER BY t.relname, i.relname`);
    const cruas = tabelasEscritasCruas();
    alcancaveis = (r.rows as { tabela: string; indice: string }[])
      .filter((x) => cruas.has(x.tabela))
      .map((x) => x.indice);
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
  it("e o passivo sem frase é 8 — a contagem trava, não a lista", () => {
    const semFrase = alcancaveis.filter((i) => !(i in DUPLICADO_POR_INDICE));
    expect(semFrase).toHaveLength(8);
    expect(Object.keys(SEM_FRASE_POR_DECISAO)).toHaveLength(8);
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
});
