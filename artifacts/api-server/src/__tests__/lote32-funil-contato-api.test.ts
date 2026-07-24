import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, registrosCobrancaTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E27: o funil kanban precisa saber há quanto tempo cada lead está parado sem
 * contato — e a única fonte disso é `registros_cobranca`, que a listagem não
 * agregava. `ultimoContatoEm` é esse agregado, exposto no contrato do Lead.
 *
 * O que se prova aqui: o campo aparece na listagem sem uma consulta por card,
 * traz o contato MAIS RECENTE (não qualquer um), vem `null` para quem nunca foi
 * contatada, e o card não pode ser arrastado para trás no funil.
 */

async function registrarContato(lojaId: string, leadId: string, contatoData: Date) {
  await db.insert(registrosCobrancaTable).values({
    id: randomUUID(),
    lojaId,
    leadId,
    contatoData,
    canal: "WHATSAPP",
  });
}

describe("Funil — último contato e transições (E27)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const listar = (query = "") => ag.get(`/api/lojas/${f.lojaId}/leads${query}`);

  it("traz o contato mais recente, não o primeiro", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Contatada" });
    const antigo = new Date("2026-05-01T14:00:00-03:00");
    const recente = new Date("2026-06-20T10:00:00-03:00");
    // Inseridos fora de ordem de propósito: `max` não pode depender da inserção.
    await registrarContato(f.lojaId, lead.id, recente);
    await registrarContato(f.lojaId, lead.id, antigo);

    const res = await listar();
    expect(res.status).toBe(200);
    const achado = res.body.itens.find((l: { id: string }) => l.id === lead.id);
    expect(new Date(achado.ultimoContatoEm).toISOString()).toBe(recente.toISOString());
  });

  it("lead sem contato registrado vem com ultimoContatoEm null", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Silenciosa" });

    const res = await listar();
    const achado = res.body.itens.find((l: { id: string }) => l.id === lead.id);
    expect(achado.ultimoContatoEm).toBeNull();
  });

  it("o contato de uma noiva não vaza para o card da outra", async () => {
    const contatada = await criarLead(f, { noivaNome: "Noiva A" });
    const semContato = await criarLead(f, { noivaNome: "Noiva B" });
    await registrarContato(f.lojaId, contatada.id, new Date("2026-06-01T09:00:00-03:00"));

    const res = await listar();
    const itens: Array<{ id: string; ultimoContatoEm: string | null }> = res.body.itens;
    expect(itens.find((l) => l.id === contatada.id)!.ultimoContatoEm).not.toBeNull();
    expect(itens.find((l) => l.id === semContato.id)!.ultimoContatoEm).toBeNull();
  });

  it("o campo sobrevive ao recorte por etapa — é o que cada coluna do funil pede", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Em Atendimento", etapa: "EM_ATENDIMENTO" });
    await registrarContato(f.lojaId, lead.id, new Date("2026-06-10T16:00:00-03:00"));

    const res = await listar("?etapa=EM_ATENDIMENTO&pagina=1&porPagina=25");
    expect(res.status).toBe(200);
    const achado = res.body.itens.find((l: { id: string }) => l.id === lead.id);
    expect(achado.ultimoContatoEm).not.toBeNull();
  });

  it("também aparece no GET de um lead só", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Detalhe" });
    await registrarContato(f.lojaId, lead.id, new Date("2026-06-15T11:00:00-03:00"));

    const res = await ag.get(`/api/lojas/${f.lojaId}/leads/${lead.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ultimoContatoEm).not.toBeNull();
  });

  it("ordem=recentes coloca a noiva que acabou de chegar no topo da coluna", async () => {
    // O default (antigos) manda o lead novo para o fim; numa coluna de 36 com
    // página de 25 ele sumiria da tela justamente quando é mais urgente.
    const novissima = await criarLead(f, { noivaNome: "Noiva Recém-Chegada", etapa: "NOVO" });

    const recentes = await listar("?etapa=NOVO&ordem=recentes&pagina=1&porPagina=5");
    expect(recentes.status).toBe(200);
    expect(recentes.body.itens[0].id).toBe(novissima.id);

    const antigos = await listar("?etapa=NOVO&ordem=antigos&pagina=1&porPagina=5");
    expect(antigos.body.itens[0].id).not.toBe(novissima.id);
  });

  it("ordem inválida é recusada, não silenciosamente ignorada", async () => {
    const res = await listar("?ordem=aleatoria");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("FILTRO_INVALIDO");
  });

  it("arrastar para trás no funil é recusado — a coluna anterior não recebe", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Avançada", etapa: "ORCAMENTO_ABERTO" });

    const res = await ag
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "NOVO" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("TRANSICAO_INVALIDA");
  });

  it("soltar em PERDIDO sem motivo é recusado — o diálogo do funil existe por isto", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Perdida", etapa: "EM_ATENDIMENTO" });

    const semMotivo = await ag
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO" });
    expect(semMotivo.status).toBe(422);
    expect(semMotivo.body.error).toBe("MOTIVO_OBRIGATORIO");

    const comMotivo = await ag
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO", perdidaMotivo: "PRECO" });
    expect(comMotivo.status).toBe(200);
    expect(comMotivo.body.etapa).toBe("PERDIDO");
  });
});
