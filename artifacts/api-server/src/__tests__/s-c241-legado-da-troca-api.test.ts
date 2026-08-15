import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, bloqueioVestidosTable, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { relogio } from "../lib/relogio";
import { diaDaSemana, diaLocal } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C241 — a coluna singular legada não sobrevive a uma troca dizendo a peça
 * velha.**
 *
 * `contratos.bloqueio_vestido_id` é o vínculo de antes do E72, declarado em
 * dois arquivos como *"lido, nunca mais escrito"*. A sobra dizia que **nenhum
 * leitor decide por ele**, e isso está certo — mas medido, ele é lido em
 * **três**, e sempre da mesma forma: em **UNIÃO** com o N:N.
 *
 * ```ts
 * ...(contrato.bloqueioVestidoId ? [contrato.bloqueioVestidoId] : []),   // visao-noiva.ts:228
 * ...contratos.flatMap((c) => (c.bloqueioVestidoId ? [c.bloqueioVestidoId] : [])),  // portal.ts:772
 * ```
 *
 * União não decide, mas **acrescenta**. Depois de trocar a peça, o N:N aponta
 * a reserva nova e a coluna singular continua apontando a antiga: o contrato
 * passa a carregar um vínculo que só pode estar errado.
 *
 * **O dano visível hoje é ZERO, e a medição obrigou a escrever isso em vez do
 * contrário** — a primeira redação deste arquivo afirmava que o portal passava
 * a mostrar duas peças, e a cena que provaria isso não é construível. O porquê
 * está na segunda cena, e é uma cadeia de guardas alheias.
 *
 * ## A população diz que está armado, não disparado
 *
 * **772 contratos no `heliumdb`, ZERO com a coluna preenchida.** O app nunca a
 * escreve — a tela manda `bloqueioVestidoIds` (plural) e o servidor grava o N:N.
 * Mas a porta ACEITA o singular (`CreateContratoBody.bloqueioVestidoId`) e o
 * grava (`contratos.ts:955`), então quem entra pela API o alcança. É o mesmo
 * formato do E185, da S-C150 e da S-C220: o mecanismo está aberto e só falta
 * alguém passar por ele.
 *
 * ## A decisão: ele ZERA na troca, e não é repontado
 *
 * A sobra pedia para *"medir os leitores e decidir se ele zera na troca"*.
 * Zera — e a razão é que repontar seria fingir que ele consegue dizer a
 * verdade. **Um contrato pode ter várias reservas**; a coluna é singular por
 * ser de antes do E72. Depois de uma troca ela só pode estar certa por acaso, e
 * campo que só pode mentir é pior que campo ausente: os três leitores em união
 * já sabem viver sem ele (é o caso de 772 dos 772 contratos de hoje).
 */
describe("S-C241 — a coluna legada não sobrevive à troca apontando a peça velha", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    // E219 — a 17ª §1º veda troca às sextas e aos sábados, e esta cena é sobre
    // a COLUNA, não sobre o calendário. Relógio pregado na próxima quarta: sem
    // isso o arquivo fica verde cinco dias por semana (S-O119).
    let quarta = new Date();
    while (diaDaSemana(diaLocal(quarta)) !== 3) quarta = new Date(quarta.getTime() + 86_400_000);
    vi.spyOn(relogio, "agora").mockReturnValue(quarta);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma venda fechada pela API COM o singular legado preenchido. */
  async function vendaComLegado() {
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const bloqueioA = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoA.id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });
    const orcamento = await criarOrcamento(f, { leadId: lead.id });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      descricao: vestidoA.nome,
      valorUnitario: 5000,
      vestidoId: vestidoA.id,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: 5000,
        // O caminho que só a API alcança: o singular legado, que a tela nunca
        // manda. É por aqui que a coluna deixa de ser zero.
        bloqueioVestidoId: bloqueioA.id,
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
    return { lead, vestidoA, bloqueioA, contratoId: criado.body.id as string };
  }

  it("a coluna legada zera quando a peça que ela aponta é trocada", async () => {
    const { lead, vestidoA, bloqueioA, contratoId } = await vendaComLegado();

    const [antes] = await db
      .select({ legado: contratosTable.bloqueioVestidoId })
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));
    // A cena só vale se a coluna estiver mesmo preenchida — senão o verde
    // abaixo seria verde por não ter olhado (S-C46).
    expect(antes!.legado, "a porta parou de aceitar o singular legado?").toBe(bloqueioA.id);

    const vestidoB = await criarVestido(f, { precoBase: 7000 });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(200);

    const [depois] = await db
      .select({ legado: contratosTable.bloqueioVestidoId })
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));
    expect(depois!.legado).toBeNull();

    void vestidoA;
    void vestidoB;
  });

  /**
   * **O dano é LATENTE, e a medição obrigou a dizer isso em vez de o contrário.**
   *
   * A primeira redação deste arquivo afirmava que o portal passava a mostrar
   * duas peças. **Não passa**, e a cena que provaria isso não é construível.
   * Os três leitores em união estão protegidos hoje, por dois motivos
   * diferentes — e nenhum dos dois é a coluna:
   *
   * | leitor | o que o protege |
   * |---|---|
   * | `visao-noiva.ts` (o portal) | `isNull(canceladoEm)` no WHERE |
   * | `portal.ts` (a foto) | `isNull(canceladoEm)` no WHERE |
   * | `leads.ts` (as datas REAIS da ficha) | **nada no WHERE** — quem o salva é a guarda da PORTA |
   *
   * O terceiro é o recorte estreito do E229/S-C121 e **não filtra reserva
   * cancelada**; ele desempata por `orderBy(asc(createdAt)).limit(1)`, e a
   * reserva antiga é sempre a mais velha. Com a coluna legada apontando para
   * ela, a ficha leria as datas REAIS da peça trocada.
   *
   * O que impede isso não está em `leads.ts`: é o `TROCA_APOS_RETIRADA` do
   * E223 — **a peça que já saiu não pode ser trocada**, então a reserva
   * abandonada por uma troca nunca tem datas reais para vazar. É a cena
   * abaixo, e ela é a razão de esta sobra ser 🔵 e não 🟠.
   *
   * **Duas coisas independentes teriam de mudar para virar defeito visível**:
   * alguém preencher a coluna pela API (0 de 772 hoje) e o
   * `TROCA_APOS_RETIRADA` afrouxar. A primeira o conserto fecha; a segunda esta
   * cena prega, para que afrouxar a guarda reprove aqui em vez de na ficha da
   * noiva.
   */
  it("a peça que já saiu não é trocável — é esta guarda que mantém a coluna legada inofensiva", async () => {
    const { bloqueioA, contratoId } = await vendaComLegado();

    await db
      .update(bloqueioVestidosTable)
      .set({ retiradaDataReal: dataFutura(80) })
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));

    const vestidoB = await criarVestido(f, { precoBase: 7000 });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id });

    expect(r.status).toBe(422);
    expect(r.body.error).toBe("TROCA_APOS_RETIRADA");
  });
});
