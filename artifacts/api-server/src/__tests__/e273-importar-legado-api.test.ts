import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  vestidosTable,
  leadsTable,
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";
import { pacotesDisponiveis } from "../lib/importar-legado";

/**
 * **E273 — a importação do caderno de papel tem BOTÃO, e o botão não escreve
 * sem ser mandado.**
 *
 * O E272 empacotou as 29 fotos do caderno (132 peças, 163 noivas) e deu a elas
 * um comando de console. Quem instalou o sistema não tem terminal no contêiner
 * — a pergunta que abriu este épico foi literalmente *"onde está o botão de
 * importação?"*, e a resposta era "não existe".
 *
 * O que esta suíte cobra é o que separa um botão de importação de um estrago:
 *
 * - **ensaio não escreve.** O `POST` sem `aplicar` devolve a mesma contagem e
 *   deixa o banco como estava — é o que a tela mostra antes de perguntar;
 * - **aplicar escreve o que o ensaio prometeu**, e a segunda passada insere
 *   ZERO. Os ids são derivados (`legado-L001`, `legado-lead-0001`);
 * - **nome de pacote é conferido contra o disco**, e não concatenado: um
 *   `../../etc/passwd` seria leitura arbitrária de arquivo com sessão de
 *   superadmin;
 * - **o gate é superadmin.** A vendedora da fixture não passa.
 */
describe("E273 — importar o caderno de papel pela tela", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;
  const PACOTE = "2026-08-17-caderno.json";
  const atributoId = "e273-atributo-tipo";
  const opcaoNoivaId = "e273-opcao-noiva";

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);

    /**
     * **O catálogo da fixture nasce com METADE do que o pacote classifica, e é
     * de propósito.**
     *
     * A loja da fixture não roda o seed, então ela não tem os 9 atributos da
     * instalação de verdade. Criando só *Tipo de peça → Noiva*, um mesmo
     * pacote exercita os DOIS caminhos: as 126 peças de noiva casam por NOME e
     * ganham a classificação, e as 5 de *Acessório* entram sem ela e aparecem
     * em `semCasa`. Era isto que a primeira versão deste teste não via — ela
     * pedia classificação a uma loja sem catálogo nenhum e lia zero como
     * defeito, quando zero era a resposta certa.
     */
    await db.insert(atributosTable).values({ id: atributoId, lojaId: f.lojaId, nome: "Tipo de peça" });
    await db
      .insert(atributoOpcoesTable)
      .values({ id: opcaoNoivaId, atributoId, valor: "Noiva" });
  });

  afterAll(async () => {
    // A fixture leva a loja e tudo o que cascateia dela — as peças e as noivas
    // importadas entraram NA loja da fixture, então saem com ela.
    await limparFixture(f);
    await fecharPool();
  });

  it("o pacote versionado está no disco desta árvore", () => {
    // Sem população a suíte inteira atestaria o vazio (regra 34): se o pacote
    // sumisse de `docs/legado`, todos os testes abaixo passariam contando zero.
    const nomes = pacotesDisponiveis().map((p) => p.arquivo);
    expect(nomes, `pacotes vistos: ${nomes.join(", ") || "nenhum"}`).toContain(PACOTE);
  });

  it("GET /admin/legado lista os pacotes com o tamanho", async () => {
    const r = await admin.get("/api/admin/legado").expect(200);
    const pacote = r.body.pacotes.find((p: { arquivo: string }) => p.arquivo === PACOTE);
    expect(pacote).toBeTruthy();
    // 157 KB em 17/08/2026 — o piso é só contra arquivo truncado ou vazio.
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(pacote.bytes).toBeGreaterThanOrEqual(50_000);
  });

  it("a vendedora não importa nada — o gate é superadmin", async () => {
    await vendedora.get("/api/admin/legado").expect(403);
    await vendedora
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: f.lojaId, aplicar: true })
      .expect(403);
  });

  it("o ENSAIO conta o que entraria e não escreve nada", async () => {
    const antesPecas = await db
      .select({ id: vestidosTable.id })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, f.lojaId));
    expect(antesPecas.length).toBe(0);

    const r = await admin
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: f.lojaId })
      .expect(200);

    expect(r.body.aplicado).toBe(false);
    expect(r.body.pecasNoPacote).toBeGreaterThan(100);
    expect(r.body.pecasJaNaLoja).toBe(0);
    expect(r.body.pecasAInserir).toBe(r.body.pecasNoPacote);
    expect(r.body.leadsAInserir).toBe(r.body.leadsNoPacote);

    const depoisPecas = await db
      .select({ id: vestidosTable.id })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, f.lojaId));
    expect(depoisPecas.length, "o ensaio escreveu no banco").toBe(0);
  });

  it("aplicar escreve o que o ensaio prometeu, e a segunda passada não duplica", async () => {
    const ensaio = await admin
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: f.lojaId })
      .expect(200);

    const aplicado = await admin
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: f.lojaId, aplicar: true })
      .expect(200);

    expect(aplicado.body.aplicado).toBe(true);
    expect(aplicado.body.pecasAInserir).toBe(ensaio.body.pecasAInserir);

    const pecas = await db
      .select({ id: vestidosTable.id })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, f.lojaId));
    const noivas = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(eq(leadsTable.lojaId, f.lojaId));
    expect(pecas.length).toBe(ensaio.body.pecasNoPacote);
    expect(noivas.length).toBe(ensaio.body.leadsNoPacote);

    // A classificação por Tipo de peça acompanha a peça — e casou por NOME
    // contra o catálogo DESTA loja, não pelo id do banco de onde o pacote saiu.
    const classificadas = await db
      .select({ vestidoId: vestidoAtributosTable.vestidoId })
      .from(vestidoAtributosTable)
      .where(inArray(vestidoAtributosTable.vestidoId, pecas.map((p) => p.id)));
    // 126 peças de noiva casaram com a opção que a fixture criou.
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(classificadas.length).toBeGreaterThanOrEqual(100);

    // E as que o catálogo desta loja não conhece foram RELATADAS, não caladas:
    // a fixture só tem "Noiva", então "Acessório" tinha de aparecer aqui.
    expect(ensaio.body.semCasa).toContain("Tipo de peça → Acessório");

    // A segunda passada: tudo já está lá, nada a inserir.
    const segunda = await admin
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: f.lojaId, aplicar: true })
      .expect(200);
    expect(segunda.body.pecasAInserir).toBe(0);
    expect(segunda.body.leadsAInserir).toBe(0);

    const pecasDepois = await db
      .select({ id: vestidosTable.id })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, f.lojaId));
    expect(pecasDepois.length, "a segunda passada duplicou").toBe(pecas.length);
  });

  it("pacote que não está no disco é 404, e caminho montado não lê arquivo nenhum", async () => {
    const inexistente = await admin
      .post("/api/admin/legado")
      .send({ arquivo: "nao-existe.json", lojaId: f.lojaId })
      .expect(404);
    expect(inexistente.body.error).toBe("PACOTE_NAO_ENCONTRADO");

    const traversal = await admin
      .post("/api/admin/legado")
      .send({ arquivo: "../../../etc/passwd", lojaId: f.lojaId })
      .expect(404);
    expect(traversal.body.error).toBe("PACOTE_NAO_ENCONTRADO");
  });

  it("loja que não existe é 404 — e o pacote não é nem lido", async () => {
    const r = await admin
      .post("/api/admin/legado")
      .send({ arquivo: PACOTE, lojaId: "loja-que-nao-existe", aplicar: true })
      .expect(404);
    expect(r.body.error).toBe("LOJA_NAO_ENCONTRADA");
  });
});
