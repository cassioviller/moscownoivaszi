import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bloqueioVestidosTable, db, leadsTable, reservasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-O117 — **`casamentoData` é data de NEGÓCIO, e agora a PORTA obriga.**
 *
 * O defeito não aparecia clicando, e é por isso que sobreviveu à trilha
 * inteira: a tela ancora o dia ao meio-dia de São Paulo antes de mandar
 * (`diaParaISO`, `formatos.ts:151`). Quem fala com a API direto não ancora —
 * `new Date("2028-09-05")` em JavaScript é `2028-09-05T00:00:00.000Z`, que é
 * 21h do dia **4** em São Paulo. Lido como INSTANTE, o dia do casamento andava
 * um dia para trás, e com ele as três janelas: prova, uso e lavagem.
 *
 * Medido no unit (`lote3-disponibilidade-unit.test.ts`): PROVA `2028-08-21` em
 * vez de `2028-08-22`, USO `2028-09-01` em vez de `2028-09-02`, LAVAGEM
 * `2028-09-07` em vez de `2028-09-08`.
 *
 * Este arquivo prega o outro lado — o que a porta GRAVA. A âncora da casa
 * (`ancoraDeNegocio`, meio-dia SP = 15:00Z) passou a valer para a data do
 * casamento em toda porta que a aceita, e é isso que faz a comparação em SQL
 * (`gte(casamentoData, hoje)` do recorte `futuras`) e o `to_char at time zone`
 * da sazonalidade acertarem o dia sem saberem desta régua.
 *
 * População em `moscow_base` quando o épico abriu: **352 linhas com a data
 * preenchida (118 reservas · 116 bloqueios · 118 noivas), e ZERO fora do
 * meio-dia SP.** O que estava aberto era o mecanismo, não o dado — a mesma
 * forma do E185.
 */
describe("S-O117 — a data do casamento é dia de negócio, e a porta ancora", () => {
  let f: Fixture;

  /** O dia CRU, como um cliente de API o escreve sem pensar no fuso. */
  const CRU = "2028-09-05T00:00:00.000Z";

  /** Meio-dia de São Paulo é 15:00Z — a âncora que a casa grava. */
  const HORA_DA_ANCORA = 15;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("POST /reservas grava o dia 5 ancorado, não a meia-noite crua do dia 5", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/reservas`)
      .send({ leadId: lead.id, casamentoData: CRU });
    expect(res.status).toBe(201);

    const [gravada] = await db
      .select({ casamentoData: reservasTable.casamentoData })
      .from(reservasTable)
      .where(eq(reservasTable.id, res.body.id));

    expect(gravada.casamentoData.toISOString()).toBe("2028-09-05T15:00:00.000Z");
    expect(gravada.casamentoData.getUTCHours()).toBe(HORA_DA_ANCORA);
    // O dia UTC e o dia de São Paulo passam a ser o MESMO — que é o que a
    // âncora compra, e o que faz tanto faz por qual régua o leitor pergunta.
    expect(gravada.casamentoData.toISOString().slice(0, 10)).toBe("2028-09-05");
  });

  it("POST /bloqueios põe as três janelas nos dias do casamento, não um dia antes", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);

    const criado = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: CRU,
    });
    expect(criado.status).toBe(201);

    const [bloqueio] = await db
      .select({
        casamentoData: bloqueioVestidosTable.casamentoData,
        ocupacaoInicio: bloqueioVestidosTable.ocupacaoInicio,
        ocupacaoFim: bloqueioVestidosTable.ocupacaoFim,
      })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, criado.body.id));

    expect(bloqueio.casamentoData!.toISOString()).toBe("2028-09-05T15:00:00.000Z");
    // REGRA_DEFAULT (14/3/2/7) sobre D = 2028-09-05: o envelope FÍSICO
    // materializado é USO + LAVAGEM, [D−3, D+2+7] = [2028-09-02, 2028-09-14].
    expect(bloqueio.ocupacaoInicio).toBe("2028-09-02");
    expect(bloqueio.ocupacaoFim).toBe("2028-09-14");
  });

  it("o catálogo responde o MESMO para o dia cru e para o dia ancorado, em toda a borda", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    /** Duas peças idênticas, reservadas para o MESMO dia escrito de dois jeitos. */
    const reservarPara = async (casamentoData: string) => {
      const vestido = await criarVestido(f);
      const criado = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
        vestidoId: vestido.id,
        leadId: lead.id,
        tipo: "RESERVA_CASAMENTO",
        casamentoData,
      });
      expect(criado.status).toBe(201);
      return vestido.id;
    };
    const peloCru = await reservarPara(CRU);
    const peloAncorado = await reservarPara("2028-09-05T12:00:00-03:00");

    /**
     * A rota pergunta *"se eu reservar para um casamento NESTE dia, o que
     * conflita?"* — é candidato contra candidato, e a resposta muda de dia em
     * dia ao longo de toda a borda. Por isso a régua é a INVARIÂNCIA: as duas
     * peças descrevem o mesmo casamento, então nenhum dia pode distingui-las.
     * Com o dia andado, elas divergiam nas quatro pontas das três janelas.
     */
    /**
     * TODO dia de 01/08 a 30/09, não uma lista escolhida a dedo.
     *
     * A primeira grafia deste teste listava quinze dias que eu julguei serem a
     * borda, e ela passava VERDE com o defeito de pé (medido) — as janelas do
     * candidato são largas (24 dias), e um dia de deslocamento só vira resposta
     * diferente em pouquíssimos dias do calendário. Escolher a dedo era
     * escolher errado; a varredura inteira não tem essa chance.
     */
    const varredura = Array.from({ length: 61 }, (_, i) => {
      const d = new Date(Date.UTC(2028, 7, 1, 12) + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    });

    // Em SÉRIE: 61 GETs simultâneos no mesmo agente derrubam a conexão
    // (`Error: read ECONNRESET`, medido). É a régua da sessão — escrever em
    // paralelo, medir em série — na escala de um teste.
    const respostas: { dia: string; cru: string; ancorado: string }[] = [];
    for (const dia of varredura) {
      const res = await agent.get(`/api/lojas/${f.lojaId}/vestidos/disponibilidade?data=${dia}`);
      expect(res.status).toBe(200);
      const statusDe = (id: string) =>
        res.body.itens.find((i: { vestidoId: string }) => i.vestidoId === id)?.status;
      respostas.push({ dia, cru: statusDe(peloCru), ancorado: statusDe(peloAncorado) });
    }

    expect(respostas.map((r) => `${r.dia}:${r.cru}`)).toEqual(
      respostas.map((r) => `${r.dia}:${r.ancorado}`),
    );
    // E a varredura precisa MORDER: se todo dia respondesse DISPONIVEL, a igualdade
    // acima seria verde de nascença (regra 34).
    expect(respostas.some((r) => r.cru !== "DISPONIVEL")).toBe(true);
    expect(respostas.some((r) => r.cru === "DISPONIVEL")).toBe(true);
  });

  it("POST /leads ancora a data da ficha, que é a que a sazonalidade agrupa por mês", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    // 01/10 cru é 30/09 em São Paulo: a virada de mês é onde o dia andado
    // muda o BUCKET da curva, não só o dia.
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Noiva da Virada", casamentoData: "2028-10-01T00:00:00.000Z" });
    expect(res.status).toBe(201);

    const [lead] = await db
      .select({ casamentoData: leadsTable.casamentoData })
      .from(leadsTable)
      .where(eq(leadsTable.id, res.body.id));

    expect(lead.casamentoData!.toISOString()).toBe("2028-10-01T15:00:00.000Z");
  });

  it("a guarda de divergência não acusa o dia ancorado contra o dia cru", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);

    // A reserva nasce pela API com o dia CRU...
    const bloqueio = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: CRU,
    });
    expect(bloqueio.status).toBe(201);

    // ...e o contrato vem da TELA, que ancora ao meio-dia. São o mesmo dia, e
    // antes da âncora na porta a guarda lia dois dias e recusava com 422
    // DATA_DIVERGE_DA_RESERVA — o contrato barrado por um fuso.
    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      dataCasamento: "2028-09-05T15:00:00.000Z",
      bloqueioVestidoIds: [bloqueio.body.id],
    });

    expect(contrato.status).toBe(201);
    expect(contrato.body.dataCasamento).toBe("2028-09-05T15:00:00.000Z");
  });
});
