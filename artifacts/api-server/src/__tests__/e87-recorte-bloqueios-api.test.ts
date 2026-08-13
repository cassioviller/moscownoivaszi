import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarBloqueio,
  type Fixture,
} from "./helpers";
import { addDias, diaLocal } from "../lib/disponibilidade";

/**
 * E87 — o livro de reservas pede o recorte: GET /bloqueios?futuras=true|false
 * separa casamentos por dia LOCAL (America/Sao_Paulo) contra hoje. A fronteira
 * importa: um casamento ontem às 22h de SP já é "hoje" em UTC — truncar o
 * timestamptz direto classificaria errado. Passadas saem em ordem desc do
 * servidor; sem o param, o contrato antigo segue intacto (tudo, sem ordem).
 */
describe("Recorte futuras/passadas de bloqueios (E87)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadId: string;
  let passadaFronteira: string; // ontem 22h SP — dia UTC já é hoje
  let passadaDistante: string; // 30 dias atrás
  let futuraHoje: string; // hoje de manhã — hoje conta como futura
  let futuraDistante: string; // daqui a 60 dias
  let manutencao: string; // sem casamentoData — fora dos dois recortes

  const hoje = diaLocal(new Date());

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    leadId = (await criarLead(f)).id;

    /**
     * `ancorarCasamento: false` (S-O119) — aqui o instante CRU é o assunto.
     *
     * O helper ancora por padrão desde o E197, porque é o que a porta faz. Este
     * teste precisa do oposto: ele grava *"ontem às 22h de São Paulo"*, cujo dia
     * UTC já é hoje, para provar que o recorte `futuras` classifica pelo dia da
     * LOJA e não pelo do timestamptz. Com a âncora, aquela linha viraria
     * meio-dia de hoje e o caso de fronteira deixaria de existir — o teste
     * passaria sem provar nada, que é a regra 34.
     *
     * É também o retrato da linha LEGADA: tudo que foi gravado antes do E197
     * pode ter esta forma, e o recorte continua respondendo por ela.
     */
    const reserva = async (casamentoData: Date) =>
      (
        await criarBloqueio(f, {
          tipo: "RESERVA_CASAMENTO",
          vestidoId: (await criarVestido(f)).id,
          leadId,
          casamentoData,
          ancorarCasamento: false,
        })
      ).id;

    // Fronteiras em horário explícito de SP (offset fixo -03:00, sem DST).
    passadaFronteira = await reserva(new Date(`${addDias(hoje, -1)}T22:00:00-03:00`));
    passadaDistante = await reserva(new Date(`${addDias(hoje, -30)}T12:00:00-03:00`));
    futuraHoje = await reserva(new Date(`${hoje}T09:00:00-03:00`));
    futuraDistante = await reserva(new Date(`${addDias(hoje, 60)}T12:00:00-03:00`));
    manutencao = (
      await criarBloqueio(f, {
        tipo: "MANUTENCAO",
        vestidoId: (await criarVestido(f)).id,
        inicio: new Date(`${addDias(hoje, 100)}T12:00:00-03:00`),
        fim: new Date(`${addDias(hoje, 102)}T12:00:00-03:00`),
      })
    ).id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("futuras=true devolve de hoje em diante (dia local, hoje inclusivo), em ordem asc", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios?futuras=true`).expect(200);
    // Ontem às 22h de SP já é "hoje" em UTC — se aparecer aqui, o recorte
    // truncou o timestamptz no fuso errado.
    expect(res.body.map((b: { id: string }) => b.id)).toEqual([futuraHoje, futuraDistante]);
  });

  it("futuras=false devolve só o que já passou (dia local), em ordem desc", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios?futuras=false`).expect(200);
    // Desc: a passada mais recente (ontem) antes da mais antiga (30 dias).
    expect(res.body.map((b: { id: string }) => b.id)).toEqual([passadaFronteira, passadaDistante]);
  });

  it("sem casamentoData (manutenção) fica fora dos dois recortes, mas segue na lista cheia", async () => {
    const tudo = await agent.get(`/api/lojas/${f.lojaId}/bloqueios`).expect(200);
    const ids = tudo.body.map((b: { id: string }) => b.id);
    expect(ids).toHaveLength(5);
    expect(ids).toContain(manutencao);
  });

  it("futuras= compõe com leadId=; valor inválido é 400", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/bloqueios?leadId=${leadId}&futuras=false`)
      .expect(200);
    expect(res.body.map((b: { id: string }) => b.id)).toEqual([passadaFronteira, passadaDistante]);

    await agent.get(`/api/lojas/${f.lojaId}/bloqueios?futuras=talvez`).expect(400);
  });
});
