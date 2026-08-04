import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaLocal } from "../lib/disponibilidade";

/**
 * E152 — a lavagem tem fim REAL, e o vestido volta ao mercado quando volta da
 * lavanderia.
 *
 * O caso do caderno: `Adelita` sai em duas semanas consecutivas, para noivas
 * diferentes — *"Novo que chegou / 1º Aluguel"* numa, *"Realuguel"* na
 * seguinte. O ateliê fez; o sistema recusava e **não oferecia caminho nenhum**,
 * porque a lavagem era sempre sete dias por soma.
 *
 * A régua continua sendo sete dias (P1: *"uma semana, lavagem externa"*). O que
 * muda é que agora alguém pode AFIRMAR que a peça voltou — e o fato fica
 * gravado, como toda data real do bloqueio.
 */
describe("E152 — a volta da lavanderia libera a peça", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma peça alugada e já devolvida — o estado em que a lavagem existe. */
  async function pecaDevolvida(offsetCasamento: number) {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const casamento = dataFutura(offsetCasamento);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: casamento,
      retiradaDataReal: new Date(casamento.getTime() - 3 * 86_400_000),
      devolucaoDataReal: new Date(casamento.getTime() + 2 * 86_400_000),
    });
    return { vestido, bloqueio, casamento };
  }

  const patch = (bloqueioId: string, data: Record<string, unknown>) =>
    agent.patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}`).send(data);

  it("registrar a volta encurta a ocupação materializada", async () => {
    const { bloqueio, casamento } = await pecaDevolvida(100);
    const fimUso = new Date(casamento.getTime() + 2 * 86_400_000);

    // Sem a volta: a ocupação vai até o sétimo dia depois do uso.
    expect(bloqueio.ocupacaoFim).toBe(diaLocal(new Date(fimUso.getTime() + 7 * 86_400_000)));

    const voltou = new Date(fimUso.getTime() + 2 * 86_400_000);
    const r = await patch(bloqueio.id, { lavagemConcluidaEm: voltou.toISOString() }).expect(200);

    expect(r.body.lavagemConcluidaEm).toBeTruthy();
    // Cinco dias voltaram ao mercado, e é o ponto do épico. (A coluna é `date`
    // e a resposta a serializa como instante — o dia é o que interessa.)
    expect(String(r.body.ocupacaoFim).slice(0, 10)).toBe(diaLocal(voltou));
  });

  /** Uma segunda reserva da MESMA peça, `dias` depois do fim do uso da primeira. */
  function segundaLocacao(vestidoId: string, fimUso: Date, dias: number) {
    return async () => {
      const noiva = await criarLead(f);
      return agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
        vestidoId,
        leadId: noiva.id,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: new Date(fimUso.getTime() + dias * 86_400_000).toISOString(),
      });
    };
  }

  it("a volta antecipada devolve cinco dias de mercado — 409 vira 201", async () => {
    const { vestido, bloqueio, casamento } = await pecaDevolvida(200);
    const fimUso = new Date(casamento.getTime() + 2 * 86_400_000);

    // Casamento em fimUso+20: a PROVA da segunda noiva começa em fimUso+6, e
    // a LAVAGEM prevista da primeira vai até fimUso+7 — sobrepõem por um dia.
    const tentar = segundaLocacao(vestido.id, fimUso, 20);

    const recusado = await tentar();
    expect(recusado.status).toBe(409);
    expect(recusado.body.conflitos.some((c: { motivo: string }) => c.motivo === "LAVAGEM")).toBe(true);

    // A dona diz que a peça voltou da lavanderia dois dias depois do uso.
    await patch(bloqueio.id, {
      lavagemConcluidaEm: new Date(fimUso.getTime() + 2 * 86_400_000).toISOString(),
    }).expect(200);

    // A lavagem passa a terminar em fimUso+2, e a segunda locação entra.
    expect((await tentar()).status).toBe(201);
  });

  /**
   * **O que o plano errou.** A spec afirma que este épico torna o caso
   * *Adelita* — a mesma peça alugada de novo em 7 dias — registrável. **Não
   * torna**, e o teste existe para ninguém acreditar nisso de novo.
   *
   * Com casamento em D e regra padrão, a primeira peça ocupa
   * `USO [D−3, D+2]`. A segunda reserva, uma semana depois, traz a própria
   * janela de PROVA de 14 dias — `[D+4, D+14]` para um casamento em D+7 —, e a
   * régua recusa PROVA × FÍSICA. **O que barra o realuguel em 7 dias é a janela
   * de prova da segunda noiva, não a lavagem da primeira.**
   *
   * A lavagem era o alvo certo do A1 e este épico a resolveu; o realuguel
   * curto é outro problema, e agora tem número (vira sobra).
   */
  it("o realuguel em 7 dias continua recusado — e a razão NÃO é mais a lavagem", async () => {
    const { vestido, bloqueio, casamento } = await pecaDevolvida(700);
    const fimUso = new Date(casamento.getTime() + 2 * 86_400_000);

    // A peça voltou no MESMO dia da devolução: não houve lavagem, e não sobra
    // janela nenhuma de lavagem para culpar.
    await patch(bloqueio.id, { lavagemConcluidaEm: fimUso.toISOString() }).expect(200);

    const r = await segundaLocacao(vestido.id, fimUso, 5)();
    expect(r.status).toBe(409);
    const motivos = (r.body.conflitos as { motivo: string }[]).map((c) => c.motivo);
    expect(motivos).toContain("USO");
    expect(motivos).not.toContain("LAVAGEM");
  });

  it("desfazer a volta devolve a janela prevista — a régua não se perde", async () => {
    const { bloqueio, casamento } = await pecaDevolvida(300);
    const fimUso = new Date(casamento.getTime() + 2 * 86_400_000);

    await patch(bloqueio.id, {
      lavagemConcluidaEm: new Date(fimUso.getTime() + 1 * 86_400_000).toISOString(),
    }).expect(200);

    const r = await patch(bloqueio.id, { lavagemConcluidaEm: null }).expect(200);
    expect(r.body.lavagemConcluidaEm).toBeNull();
    expect(String(r.body.ocupacaoFim).slice(0, 10)).toBe(
      diaLocal(new Date(fimUso.getTime() + 7 * 86_400_000)),
    );
  });

  it("a peça não volta da lavanderia sem ter voltado da noiva", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const casamento = dataFutura(400);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: casamento,
    });

    const r = await patch(bloqueio.id, {
      lavagemConcluidaEm: new Date(casamento.getTime() + 5 * 86_400_000).toISOString(),
    }).expect(400);
    expect(r.body.error).toBe("LAVAGEM_SEM_DEVOLUCAO");
  });

  it("desfazer a DEVOLUÇÃO com a lavagem registrada é recusado — data órfã não fica", async () => {
    const { bloqueio, casamento } = await pecaDevolvida(500);
    const fimUso = new Date(casamento.getTime() + 2 * 86_400_000);
    await patch(bloqueio.id, {
      lavagemConcluidaEm: new Date(fimUso.getTime() + 1 * 86_400_000).toISOString(),
    }).expect(200);

    const r = await patch(bloqueio.id, { devolucaoDataReal: null }).expect(400);
    expect(r.body.error).toBe("LAVAGEM_SEM_DEVOLUCAO");
    // E a frase diz o caminho, em vez de só recusar.
    expect(r.body.detalhe).toMatch(/desfaça a volta da lavanderia primeiro/i);
  });
});
