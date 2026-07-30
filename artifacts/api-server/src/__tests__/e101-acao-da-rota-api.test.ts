import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { db, perfisTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { POST_QUE_MUTA, POST_QUE_MUTA_POR_CAMINHO } from "../lib/permissoes";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E101/B5 — a ação exigida por uma rota corresponde ao que ela FAZ com o dado.
 *
 * `acaoDoRequest` deriva a ação do método HTTP e abriu exceção para dois nomes
 * (`/cancelar`, `/estornar`) porque "a rota mentia sobre o que faz" — **e a
 * lista parou ali**. Todo o resto dos POST de ação continuou valendo `criar`,
 * que é a permissão mais fácil de conceder.
 *
 * O caso caro é o expurgo: um perfil com `{ver, criar}` e SEM `editar` — estado
 * válido e comum, "a estagiária cadastra noiva mas não altera" — podia disparar
 * `POST /leads/expurgo` com `mesesInatividade: 0` e anonimizar TODAS as noivas
 * PERDIDAS da loja de uma vez, numa operação que o próprio comentário do código
 * chama de irreversível por desenho.
 */
describe("E101 — a ação vem do que a rota faz, não do sufixo", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  /** Um perfil que CRIA mas não EDITA — o estado que o achado descreve. */
  async function comCriarSemEditar(modulo: "leads" | "financeiro" | "vestidos" | "agenda") {
    const fx = await criarFixture();
    await db
      .update(perfisTable)
      .set({ acessosModulos: { [modulo]: { ver: true, criar: true, editar: false } } })
      .where(eq(perfisTable.id, fx.perfilId));
    const agent = await loginComLoja(fx.vendedoraEmail, fx.lojaId);
    return { fx, agent };
  }

  it("o expurgo — a operação mais destrutiva do sistema — exige `editar`", async () => {
    const { fx, agent } = await comCriarSemEditar("leads");
    try {
      const r = await agent
        .post(`/api/lojas/${fx.lojaId}/leads/expurgo`)
        .send({ mesesInatividade: 0 })
        .expect(403);
      expect(r.body.error).toBe("ACESSO_NEGADO_MODULO");
      expect(r.body.acao).toBe("editar");
    } finally {
      await limparFixture(fx);
    }
  });

  it("aprovar, recusar e gerar link de orçamento exigem `editar`", async () => {
    const { fx, agent } = await comCriarSemEditar("leads");
    try {
      const lead = await criarLead(fx);
      const orc = await criarOrcamento(fx, { leadId: lead.id, status: "ENVIADO" });

      for (const rota of ["aprovar", "recusar", "link"]) {
        const r = await agent
          .post(`/api/lojas/${fx.lojaId}/orcamentos/${orc.id}/${rota}`)
          .expect(403);
        expect(r.body.acao, `POST /${rota} deveria exigir editar`).toBe("editar");
      }
    } finally {
      await limparFixture(fx);
    }
  });

  it("receber dinheiro de uma parcela exige `editar` — mexer no caixa não é criar", async () => {
    const { fx, agent } = await comCriarSemEditar("leads");
    try {
      const r = await agent
        .post(`/api/lojas/${fx.lojaId}/parcelas/qualquer-id/receber`)
        .send({ valorRecebido: 100, recebidoEm: new Date().toISOString() })
        .expect(403);
      expect(r.body.acao).toBe("editar");
    } finally {
      await limparFixture(fx);
    }
  });

  it("pagar uma conta exige `editar` no financeiro", async () => {
    const { fx, agent } = await comCriarSemEditar("financeiro");
    try {
      const r = await agent
        .post(`/api/lojas/${fx.lojaId}/contas-pagar/qualquer-id/pagar`)
        .send({ data: new Date().toISOString() })
        .expect(403);
      expect(r.body.acao).toBe("editar");
    } finally {
      await limparFixture(fx);
    }
  });

  it("criar continua criando — a régua ficou mais estrita, não quebrada", async () => {
    const { fx, agent } = await comCriarSemEditar("leads");
    try {
      await agent
        .post(`/api/lojas/${fx.lojaId}/leads`)
        .send({ noivaNome: "Continua entrando" })
        .expect(201);
    } finally {
      await limparFixture(fx);
    }
  });
});

/**
 * A varredura, no molde da que o E96 provou valer.
 *
 * O defeito de origem não foi a lista estar errada — foi ela **parar**. Um
 * `POST /:id/<verbo>` novo volta a valer `criar` em silêncio, e o sintoma é uma
 * permissão frouxa, que ninguém vê até alguém usá-la.
 *
 * A estrutura NÃO distingue os dois casos, e é por isso que a lista explícita é
 * a saída certa: `/orcamentos/:id/itens` (cria um item) e
 * `/orcamentos/:id/aprovar` (muda o orçamento) têm exatamente a mesma forma.
 * Só o nome do verbo sabe a diferença — então o que dá para automatizar é
 * cobrar que cada verbo novo seja classificado à mão.
 */
describe("nenhum POST de ação escapa da classificação (B5)", () => {
  const raiz = join(__dirname, "..", "routes");

  /** Sub-coleções: POST aqui CRIA um recurso filho. */
  const SUBCOLECOES = new Set([
    "itens", "opcoes", "checklist", "cobrancas", "avarias", "parcelas", "portal",
  ]);

  it("todo POST em /:id/<verbo> é sub-coleção ou declara a ação", () => {
    const naoClassificados: string[] = [];

    for (const arquivo of readdirSync(raiz).filter((f) => f.endsWith(".ts"))) {
      const conteudo = readFileSync(join(raiz, arquivo), "utf8");
      const re = /router\.post\(\s*"([^"]+)"\s*(,\s*requireModulo\([^)]*\))?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(conteudo)) !== null) {
        const [, caminho, comRequire] = m;
        const partes = caminho.split("/").filter(Boolean);
        const ultimo = partes[partes.length - 1];
        const penultimo = partes[partes.length - 2];

        // Só interessa POST cujo último segmento é literal e vem depois do id
        // de um RECURSO. O `:lojaId` é prefixo de tenant, não id de recurso:
        // `/lojas/:lojaId/leads` é POST de COLEÇÃO, e criar é o certo ali.
        if (!ultimo || ultimo.startsWith(":") || !penultimo?.startsWith(":")) continue;
        if (penultimo === ":lojaId") continue;
        if (SUBCOLECOES.has(ultimo)) continue;
        // Rotas públicas do portal não têm sessão nem módulo — quem confirma é
        // a noiva, pelo token. O gate delas é o TTL, não a permissão.
        if (caminho.startsWith("/portal")) continue;

        // Já tratado por `acaoDoRequest`, ou declarado na própria rota. A lista
        // é IMPORTADA, não recopiada: a varredura existe porque a régua para de
        // crescer, e uma segunda cópia dela aqui teria o mesmo defeito.
        const naRegex = POST_QUE_MUTA.test(`/${ultimo}`);
        if (naRegex || comRequire?.includes('"editar"')) continue;

        naoClassificados.push(`${arquivo}: POST ${caminho}`);
      }
    }

    expect(naoClassificados).toEqual([]);
  });

  /**
   * E115 — a segunda forma que a varredura acima não via: POST em
   * `<literal>/<segmento>`, sem id de recurso no caminho. Foi por essa fresta
   * que `conciliacao/marcar` e `contabilidade/enviar` — que CARIMBAM linhas
   * existentes — derivaram `criar` por dois épicos: a estagiária com
   * `{ver, criar}` fechava o mês à contadora, e a gerente com `{ver, editar}`
   * levava 403 numa ação dela.
   */

  /** Coleções sob namespace literal: POST aqui CRIA um recurso. */
  const COLECOES_LITERAIS = new Set([
    "token", "fechamentos", "regras", "convites", "contas-pagar",
    "recorrencias", "saldos-referencia",
  ]);

  /**
   * Verbos que CRIAM (ou não escrevem nada) — perdão com razão, um por linha:
   * - `simular`: não escreve; é POST só porque carrega corpo de cenário.
   * - `gerar`: a folha do mês — cria as contas da competência, idempotente.
   * - `gerar-plano`: cria o carnê. "Criar parcela É criar" (decisão E111).
   */
  const VERBOS_QUE_CRIAM = new Set(["simular", "gerar", "gerar-plano"]);

  /** Sem sessão de loja ou sem gate de módulo — a régua deles é outra. */
  const FORA_DO_GATE = ["/auth/", "/portal", "/admin/", "/captacao/", "/orcamentos/publico", "/equipe/convites/aceitar"];

  it("todo POST <literal>/<segmento> é coleção, criação perdoada ou classificado", () => {
    const naoClassificados: string[] = [];

    for (const arquivo of readdirSync(raiz).filter((f) => f.endsWith(".ts"))) {
      const conteudo = readFileSync(join(raiz, arquivo), "utf8");
      const re = /router\.post\(\s*"([^"]+)"\s*(,\s*requireModulo\([^)]*\))?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(conteudo)) !== null) {
        const [, caminho, comRequire] = m;
        if (FORA_DO_GATE.some((p) => caminho.startsWith(p) || caminho.includes(p))) continue;
        const partes = caminho.split("/").filter(Boolean);
        const ultimo = partes[partes.length - 1];
        const penultimo = partes[partes.length - 2];

        // Aqui é o complemento exato do bloco acima: último E penúltimo
        // literais. Coleção sob o tenant (`/lojas/:lojaId/leads`) tem
        // penúltimo `:lojaId` e continua sendo assunto do outro bloco.
        if (!ultimo || ultimo.startsWith(":") || !penultimo || penultimo.startsWith(":")) continue;

        if (COLECOES_LITERAIS.has(ultimo)) continue;
        if (VERBOS_QUE_CRIAM.has(ultimo)) continue;
        const classificado =
          POST_QUE_MUTA.test(`/${ultimo}`) || POST_QUE_MUTA_POR_CAMINHO.test(caminho);
        if (classificado || comRequire?.includes('"editar"')) continue;

        naoClassificados.push(`${arquivo}: POST ${caminho}`);
      }
    }

    // VERMELHO ANTES do E115: conciliacao/marcar, contabilidade/enviar e
    // financeiro/pagamentos apareciam aqui — dois carimbos e a porta que a
    // tela de Pagar usa, todos derivando `criar`.
    expect(naoClassificados).toEqual([]);
  });
});

/**
 * B7/E101 — o dashboard é o painel de todo mundo, e os números de dinheiro só
 * entram para quem tem o gate do dinheiro.
 *
 * Decisão do dono em 2026-07-27. Era uma das duas únicas rotas de loja sem
 * `requireModulo`: a costureira com `agenda: {ver}` abria a tela inicial e
 * recebia a previsão de caixa da loja inteira — a informação que o gate
 * `financeiro` existe para restringir, entregue pela porta ao lado.
 */
describe("E101/B7 — o dashboard não entrega dinheiro por fora do gate", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("sem `financeiro: ver`, os campos de dinheiro não vêm na resposta", async () => {
    const fx = await criarFixture();
    try {
      await db
        .update(perfisTable)
        .set({ acessosModulos: { agenda: { ver: true, criar: false, editar: false } } })
        .where(eq(perfisTable.id, fx.perfilId));
      const agent = await loginComLoja(fx.vendedoraEmail, fx.lojaId);

      const r = await agent.get(`/api/lojas/${fx.lojaId}/dashboard`).expect(200);

      // A home continua existindo — a decisão foi "painel de todo mundo".
      expect(r.body.totalLeadsAtivos).toBeDefined();
      expect(r.body.atendimentosHoje).toBeDefined();
      // Mas o dinheiro não sai.
      expect(r.body.receberProximos30Dias).toBeUndefined();
      expect(r.body.pagarProximos30Dias).toBeUndefined();
    } finally {
      await limparFixture(fx);
    }
  });

  it("com `financeiro: ver`, os campos voltam", async () => {
    const fx = await criarFixture();
    try {
      await db
        .update(perfisTable)
        .set({ acessosModulos: { financeiro: { ver: true, criar: false, editar: false } } })
        .where(eq(perfisTable.id, fx.perfilId));
      const agent = await loginComLoja(fx.vendedoraEmail, fx.lojaId);

      const r = await agent.get(`/api/lojas/${fx.lojaId}/dashboard`).expect(200);
      expect(r.body.receberProximos30Dias).toBeDefined();
      expect(r.body.pagarProximos30Dias).toBeDefined();
    } finally {
      await limparFixture(fx);
    }
  });
});
