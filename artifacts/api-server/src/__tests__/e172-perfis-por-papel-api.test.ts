import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, perfisTable, usuariosTable, usuariosLojasTable, type Lead } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";
import { PERFIS_PADRAO } from "../lib/configuracao-inicial";
import { hashSenha } from "../lib/auth";

/**
 * E172 — o que cada papel pode, medido pela porta e não pelo organograma.
 *
 * Os quatro perfis padrão nunca tiveram teste que os exercitasse COMO PESSOA:
 * o `e147-configuracao-inicial-unit` confere a matriz (o que está escrito no
 * seed) e o `lote7-permissoes-api` confere o gate (o que a porta faz), e entre
 * os dois havia a pergunta que ninguém fazia — *o perfil que existe para
 * atender o telefone consegue assinar um contrato de R$ 5.000,00?*
 *
 * Conseguia. Este arquivo é a régua que passa a cobrar, perfil a perfil, com o
 * usuário logado de verdade e a resposta HTTP real.
 */

type PerfilDeTeste = { perfilId: string; email: string };

async function criarPessoaComPerfil(f: Fixture, nomeDoPerfilPadrao: string): Promise<PerfilDeTeste> {
  const padrao = PERFIS_PADRAO.find((p) => p.nome === nomeDoPerfilPadrao);
  if (!padrao) throw new Error(`PERFIS_PADRAO não tem "${nomeDoPerfilPadrao}"`);

  const sufixo = randomUUID().slice(0, 8);
  const perfilId = randomUUID();
  const usuarioId = randomUUID();
  const email = `${nomeDoPerfilPadrao.toLowerCase().replace(/\W/g, "")}-${sufixo}@teste.local`;

  await db.insert(perfisTable).values({
    id: perfilId,
    nome: `${padrao.nome} ${sufixo}`,
    acessosModulos: padrao.acessos,
  });
  await db.insert(usuariosTable).values({
    id: usuarioId,
    nome: `${padrao.nome} Teste ${sufixo}`,
    email,
    senhaHash: await hashSenha(SENHA_TESTE),
  });
  await db.insert(usuariosLojasTable).values({ usuarioId, lojaId: f.lojaId, perfilId });

  return { perfilId, email };
}

describe("E172 — os perfis padrão exercitados como gente", () => {
  let f: Fixture;
  let recepcao: PerfilDeTeste;
  let costureira: PerfilDeTeste;
  let vendedora: PerfilDeTeste;
  let lead: Lead;

  beforeAll(async () => {
    f = await criarFixture();
    recepcao = await criarPessoaComPerfil(f, "Recepção");
    costureira = await criarPessoaComPerfil(f, "Costureira");
    vendedora = await criarPessoaComPerfil(f, "Vendedora");
    lead = await criarLead(f, { noivaNome: "Noiva do Telefone Torto" });
  });

  afterAll(async () => {
    await limparFixture(f);
    await db
      .delete(perfisTable)
      .where(inArray(perfisTable.id, [recepcao.perfilId, costureira.perfilId, vendedora.perfilId]));
    await fecharPool();
  });

  describe("Recepção — S-O41: corrige o que ela mesma digitou", () => {
    it("edita a ficha da noiva que cadastrou (o dígito errado do WhatsApp)", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      await agent
        .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
        .send({ whatsapp: "11962220147" })
        .expect(200);
    });
  });

  describe("Recepção — S-O40: não fecha contrato", () => {
    /**
     * O corpo vazio é de PROPÓSITO: o que se mede aqui é o GATE, não o
     * conteúdo. Passar do gate dá 400 (validação); ser barrado dá 403. Antes
     * do E172 esta chamada respondia 400 — a Recepção atravessava.
     */
    it("o POST de contrato responde 403 no módulo contratos", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      const res = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({}).expect(403);
      expect(res.body.error).toBe("ACESSO_NEGADO_MODULO");
      expect(res.body.modulo).toBe("contratos");
    });

    it("nem lista contratos, nem recebe parcela", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      await agent.get(`/api/lojas/${f.lojaId}/contratos`).expect(403);
      await agent.post(`/api/lojas/${f.lojaId}/parcelas/${randomUUID()}/receber`).send({}).expect(403);
    });
  });

  describe("Recepção — S-O40 outra vez, um passo antes: não aprova a proposta", () => {
    /**
     * A porta ao lado da que o épico abriu. `aprovar`, `recusar` e `link` pedem
     * `editar` — a MESMA ação que corrige um telefone —, e o aceite congela a
     * versão que o gate do E115 confere contra o contrato: quem aprova decide o
     * preço que o contrato cobra. Fechar só o contrato era meio conserto.
     *
     * Medido em 2026-08-12, com a Recepção já com `leads: TUDO` e o contrato já
     * fora: os três respondiam **404**, não 403 — ela atravessava o gate e só
     * não achava o id.
     */
    it("não aprova, não recusa e não gera o link da proposta", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      const id = randomUUID();
      for (const porta of ["aprovar", "recusar", "link"]) {
        const res = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${id}/${porta}`).send({});
        expect(res.status, `POST /orcamentos/:id/${porta}`).toBe(403);
        expect(res.body.modulo).toBe("orcamentos");
      }
    });

    it("LÊ a proposta — é o que ela responde ao telefone", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      await agent.get(`/api/lojas/${f.lojaId}/orcamentos`).expect(200);
    });

    it("não abre orçamento novo — quem vende é que abre", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      await agent.post(`/api/lojas/${f.lojaId}/orcamentos`).send({}).expect(403);
    });
  });

  describe("Recepção — o que o `editar` NÃO passou a dar", () => {
    /**
     * O expurgo anonimiza a carteira de leads PERDIDOS da loja inteira, é
     * irreversível por desenho, e pedia `leads.editar` — a mesma ação que
     * corrige um telefone. A tela já o mostrava só sob `admin`
     * (`configuracoes/index.tsx:51`): quem divergia era a porta.
     */
    it("não anonimiza a carteira de leads perdidos", async () => {
      const agent = await loginComLoja(recepcao.email, f.lojaId);
      const res = await agent.post(`/api/lojas/${f.lojaId}/leads/expurgo`).send({}).expect(403);
      expect(res.body.modulo).toBe("admin");
    });
  });

  describe("Costureira — S-O36: a fila de ajustes sem a carteira de leads", () => {
    it("abre a agenda e a fila de ajustes", async () => {
      const agent = await loginComLoja(costureira.email, f.lojaId);
      await agent.get(`/api/lojas/${f.lojaId}/atendimentos`).expect(200);
      await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    });

    /**
     * Os dois botões da ficha de trabalho dela — "Abrir a reserva"
     * (`ajustes/[ajusteId].tsx:124,251`) e o nome do vestido (`:167,226`). O
     * perfil nasceu com `agenda` e nada mais, e os dois respondiam **403**: as
     * provas e a movimentação da peça ficavam do outro lado de um muro, num
     * botão que a própria tela dela desenha. Medido em 2026-08-12, antes da
     * decisão da dona — que foi dar-lhe o acervo só de leitura.
     */
    it("abre a reserva e o vestido do trabalho dela — os dois botões da ficha", async () => {
      const agent = await loginComLoja(costureira.email, f.lojaId);
      await agent.get(`/api/lojas/${f.lojaId}/reservas`).expect(200);
      await agent.get(`/api/lojas/${f.lojaId}/vestidos`).expect(200);
    });

    it("lê o acervo e não escreve nele", async () => {
      const agent = await loginComLoja(costureira.email, f.lojaId);
      const res = await agent.post(`/api/lojas/${f.lojaId}/vestidos`).send({});
      expect(res.status, "criar vestido é do acervo, não da costureira").toBe(403);
    });

    it("não vê a carteira de leads, nem contrato, nem dinheiro", async () => {
      const agent = await loginComLoja(costureira.email, f.lojaId);
      await agent.get(`/api/lojas/${f.lojaId}/leads`).expect(403);
      await agent.get(`/api/lojas/${f.lojaId}/contratos`).expect(403);
      await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).expect(403);
      await agent.get(`/api/lojas/${f.lojaId}/comissao/regras`).expect(403);
    });
  });

  describe("Vendedora — S-O37: fecha contrato, e agora está escrito", () => {
    /**
     * A decisão da dona em 2026-08-12: **é ela quem vende, então é ela quem
     * fecha**. O que mudou não é o poder, é o nome dele — antes vinha embutido
     * em `leads`, onde ninguém que lesse os perfis o encontraria.
     */
    it("atravessa o gate do contrato (400 de validação, não 403 de acesso)", async () => {
      const agent = await loginComLoja(vendedora.email, f.lojaId);
      const res = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({});
      expect(res.status, "a Vendedora não pode ser barrada no módulo contratos").toBe(400);
    });

    it("e o da proposta — ela aprova, que é o passo antes", async () => {
      const agent = await loginComLoja(vendedora.email, f.lojaId);
      const res = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${randomUUID()}/aprovar`).send({});
      expect(res.status, "a Vendedora não pode ser barrada no módulo orcamentos").not.toBe(403);
    });
  });
});
