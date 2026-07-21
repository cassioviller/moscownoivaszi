import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E47 — a trilha vira consultável e exportável. O lote20 já prova que as ações
 * ESCREVEM na trilha; aqui se prova a LEITURA: os filtros, o recorte de dia
 * local (onde mora o erro de fuso), os autores e o CSV.
 *
 * As linhas entram por inserção direta de propósito: só assim dá para carimbar
 * `criadoEm` na borda do dia e simular o autor que saiu da equipe — as duas
 * coisas que os filtros precisam acertar e que uma ação real não deixa
 * escolher.
 */

/** Instante no fuso da loja — é assim que a trilha é lida e filtrada. */
const emSP = (iso: string) => new Date(`${iso}-03:00`);

describe("Trilha de auditoria — filtros, autores e CSV (E47)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);

    await db.insert(auditLogTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        usuarioId: f.superAdminId,
        usuarioNome: "Super Admin Teste",
        acao: "PARCELA_RECEBIDA",
        entidade: "parcela",
        entidadeId: "parc-1",
        detalhe: { valorRecebido: 1000, contratoId: "ctr-1" },
        criadoEm: emSP("2026-03-10T09:00:00"),
      },
      {
        // 23:30 do dia 10 em SP = 02:30 do dia 11 em UTC. Filtrar por
        // `ate=2026-03-10` tem de PEGAR esta linha: ler em UTC a empurraria
        // para o dia seguinte e ela sumiria do dia em que de fato aconteceu.
        id: randomUUID(),
        lojaId: f.lojaId,
        usuarioId: f.vendedoraId,
        usuarioNome: "Vendedora Teste",
        acao: "CONTA_PAGA",
        entidade: "conta_pagar",
        entidadeId: "conta-1",
        detalhe: { descricao: "Aluguel", valorPago: 500 },
        criadoEm: emSP("2026-03-10T23:30:00"),
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        usuarioId: f.vendedoraId,
        usuarioNome: "Vendedora Teste",
        acao: "PAGAMENTO_ESTORNADO",
        entidade: "pagamento",
        entidadeId: "pag-1",
        // Vírgula e aspas no detalhe: sem o escape RFC 4180 isto quebraria a
        // linha em colunas extras e a contadora importaria valor na coluna
        // errada — o erro que ninguém vê até o fechamento.
        detalhe: { descricao: 'Estorno "parcial", com aspas' },
        criadoEm: emSP("2026-03-11T00:10:00"),
      },
      {
        // Injeção de fórmula pelo NOME: o nome vem de entrada do usuário e o
        // arquivo abre na planilha da contadora sem desconfiança.
        id: randomUUID(),
        lojaId: f.lojaId,
        usuarioId: null,
        usuarioNome: "=cmd|'/c calc'!A1",
        acao: "PAGAMENTO_REGISTRADO",
        entidade: "pagamento",
        entidadeId: "pag-2",
        detalhe: null,
        criadoEm: emSP("2026-03-09T08:00:00"),
      },
      {
        // Autor que saiu da equipe: a linha fica, o vínculo vai a NULL.
        id: randomUUID(),
        lojaId: f.lojaId,
        usuarioId: null,
        usuarioNome: "Quem Já Saiu",
        acao: "CONTA_PAGA",
        entidade: "conta_pagar",
        entidadeId: "conta-2",
        detalhe: null,
        criadoEm: emSP("2026-03-12T10:00:00"),
      },
    ]);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const trilha = `/api/lojas/${"%s"}/financeiro/auditoria`;
  const url = (sufixo = "") => trilha.replace("%s", f.lojaId) + sufixo;

  it("sem filtro, devolve a trilha inteira da loja, da mais recente para a mais antiga", async () => {
    const res = await admin.get(url()).expect(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].usuarioNome).toBe("Quem Já Saiu");
  });

  it("filtra por ação", async () => {
    const res = await admin.get(url("?acao=CONTA_PAGA")).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((l: { acao: string }) => l.acao === "CONTA_PAGA")).toBe(true);
  });

  it("filtra por autor", async () => {
    const res = await admin.get(url(`?usuarioId=${f.vendedoraId}`)).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((l: { usuarioNome: string }) => l.usuarioNome === "Vendedora Teste")).toBe(true);
  });

  it("o período é dia LOCAL, inclusivo nas duas pontas", async () => {
    const res = await admin.get(url("?de=2026-03-10&ate=2026-03-10")).expect(200);
    // Pega a das 9h e a das 23h30 do dia 10; não pega a das 00h10 do dia 11.
    expect(res.body).toHaveLength(2);
    expect(res.body.map((l: { entidadeId: string }) => l.entidadeId).sort()).toEqual([
      "conta-1",
      "parc-1",
    ]);
  });

  it("os filtros se combinam com E, não com OU", async () => {
    const res = await admin
      .get(url(`?acao=CONTA_PAGA&usuarioId=${f.vendedoraId}&de=2026-03-10&ate=2026-03-10`))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].entidadeId).toBe("conta-1");
  });

  it("intervalo invertido é 400, não busca vazia", async () => {
    await admin.get(url("?de=2026-03-12&ate=2026-03-10")).expect(400);
    await admin.get(url("?de=12/03/2026")).expect(400);
  });

  it("os autores saem da trilha, sem quem já não tem id, do mais recente ao mais antigo", async () => {
    const res = await admin.get(url("/autores")).expect(200);
    // "Quem Já Saiu" tem usuarioId nulo: não dá para filtrar por ele, então
    // não é oferecido como opção.
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ usuarioId: f.vendedoraId, nome: "Vendedora Teste", total: 2 });
    expect(res.body[1]).toMatchObject({ usuarioId: f.superAdminId, total: 1 });
  });

  it("o CSV traz os mesmos filtros, com rótulo legível e BOM para o Excel", async () => {
    const res = await admin
      .get(url(`/exportar?acao=CONTA_PAGA`))
      .expect(200)
      .expect("Content-Type", /text\/csv/);

    expect(res.headers["content-disposition"]).toContain("auditoria");
    expect(res.text.startsWith("﻿")).toBe(true);

    const linhas = res.text.replace("﻿", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Quando,Ação,Autor,Entidade,ID da entidade,Detalhe");
    expect(linhas).toHaveLength(3); // cabeçalho + as duas CONTA_PAGA
    // Rótulo humano, não o código cru — é a planilha de quem concilia.
    expect(linhas[1]).toContain("Conta paga");
    // Instante no fuso da loja, com hora: "quem estornou às 23h50" é metade
    // da pergunta.
    expect(linhas[2]).toContain("10/03/2026 23:30");
  });

  it("o CSV neutraliza o nome que a planilha executaria como fórmula", async () => {
    const res = await admin.get(url("/exportar?acao=PAGAMENTO_REGISTRADO")).expect(200);
    // O apóstrofo faz a planilha tratar como texto; sem ele, `=cmd|…` roda ao
    // abrir o arquivo.
    expect(res.text).toContain(",'=cmd|'/c calc'!A1,");
  });

  it("o CSV escapa vírgula e aspas do detalhe em vez de deslocar colunas", async () => {
    const res = await admin.get(url("/exportar?acao=PAGAMENTO_ESTORNADO")).expect(200);
    const linhas = res.text.replace("﻿", "").trim().split("\r\n");
    expect(linhas).toHaveLength(2);

    // O detalhe é a última coluna: tem vírgula E aspas dentro, então precisa
    // vir entre aspas com as internas dobradas (RFC 4180). O que importa é o
    // round-trip — desfazendo o escape, volta o JSON exato. Sem isso, a
    // vírgula abriria uma 7ª coluna e a contadora importaria torto.
    const marca = ",pag-1,";
    const celula = linhas[1].slice(linhas[1].indexOf(marca) + marca.length);
    expect(celula.startsWith('"') && celula.endsWith('"')).toBe(true);
    expect(celula.slice(1, -1).replace(/""/g, '"')).toBe(
      JSON.stringify({ descricao: 'Estorno "parcial", com aspas' }),
    );
  });

  it("as rotas novas ficam sob o mesmo gate do módulo financeiro", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get(url("/autores")).expect(403);
    await vendedora.get(url("/exportar")).expect(403);
  });
});
