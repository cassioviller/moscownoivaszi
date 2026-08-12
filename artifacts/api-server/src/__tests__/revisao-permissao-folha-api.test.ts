import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { auditLogTable, db, perfisTable, recorrenciasTable, usuariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * Três defeitos que a pessoa sente no balcão, no fim do mês e na entrada.
 */
describe("Quem pode editar recebe o Pix", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * O perfil "Gerente de loja": revisa noiva cadastrada por outra, não abre
   * lead novo. `{ver, criar: false, editar: true}` é estado válido — é assim
   * que `normalizarAcessos` o reconcilia — e era o que travava.
   *
   * ANTES: o `router.use("/lojas/:lojaId/parcelas", requireModulo(…))` roda
   * ANTES do guard da rota e derivava `criar` do POST. Receber uma parcela
   * passava a exigir `criar` E `editar` no mesmo módulo: a gerente clicava em
   * Receber com os R$ 700 do Pix na mão e levava
   * `403 {error: "ACESSO_NEGADO_MODULO", acao: "criar"}` — culpando uma ação
   * que ela não estava tentando fazer. O dinheiro ficava fora do sistema.
   *
   * E172: o módulo da parcela deixou de ser `leads` e passou a ser
   * `contratos` — a tese deste teste é a DERIVAÇÃO DA AÇÃO, e ela não muda de
   * lado nenhum; o que muda é em qual caixa a gerente precisa do `editar`.
   */
  async function comEditarSemCriar(modulo: "leads" | "contratos" | "financeiro" | "vestidos" | "agenda") {
    const fx = await criarFixture();
    await db
      .update(perfisTable)
      .set({ acessosModulos: { [modulo]: { ver: true, criar: false, editar: true } } })
      .where(eq(perfisTable.id, fx.perfilId));
    return { fx, agent: await loginComLoja(fx.vendedoraEmail, fx.lojaId) };
  }

  it("a gerente com `editar` e sem `criar` registra o recebimento da parcela", async () => {
    const { fx, agent } = await comEditarSemCriar("contratos");
    try {
      const lead = await criarLead(fx);
      const contrato = await criarContrato(fx, {
        leadId: lead.id,
        valorTotal: 700,
        fechadoEm: dataFutura(-5),
      });
      const parcela = await agent
        .post(`/api/lojas/${fx.lojaId}/contratos/${contrato.id}/parcelas`)
        .send({ valorPrevisto: 700, vencimento: dataFutura(5).toISOString(), descricao: "Entrada" })
        // Criar parcela É criar: continua barrado, e isso está certo.
        .expect(403);
      expect(parcela.body.acao).toBe("criar");

      // A parcela existe (criada por quem pode); receber é dela.
      const admin = await loginComLoja(fx.superAdminEmail, fx.lojaId);
      const criada = await admin
        .post(`/api/lojas/${fx.lojaId}/contratos/${contrato.id}/parcelas`)
        .send({ valorPrevisto: 700, vencimento: dataFutura(5).toISOString(), descricao: "Entrada" })
        .expect(201);

      await agent
        .post(`/api/lojas/${fx.lojaId}/parcelas/${criada.body.id}/receber`)
        .send({ valorRecebido: 700, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
        .expect(200);
    } finally {
      await limparFixture(fx);
    }
  });

  it("e o mesmo vale para pagar conta, cobrar reparo e reenviar convite", async () => {
    // Aqui interessa só a AÇÃO exigida: os ids são inexistentes de propósito,
    // porque o 403 do guard vem antes de qualquer busca.
    const casos = [
      { modulo: "financeiro" as const, rota: "contas-pagar/qualquer/pagar" },
      { modulo: "vestidos" as const, rota: "avarias/qualquer/cobrar" },
      { modulo: "admin" as const, rota: "equipe/convites/qualquer/reenviar" },
    ];
    for (const caso of casos) {
      const fx = await criarFixture();
      try {
        await db
          .update(perfisTable)
          .set({ acessosModulos: { [caso.modulo]: { ver: true, criar: true, editar: false } } })
          .where(eq(perfisTable.id, fx.perfilId));
        const agent = await loginComLoja(fx.vendedoraEmail, fx.lojaId);
        const r = await agent.post(`/api/lojas/${fx.lojaId}/${caso.rota}`).send({}).expect(403);
        expect({ rota: caso.rota, acao: r.body.acao }).toEqual({ rota: caso.rota, acao: "editar" });
      } finally {
        await limparFixture(fx);
      }
    }
  });
});

describe("A folha para quando a pessoa sai", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  async function comSalario(fx: Fixture, usuarioId: string) {
    const [r] = await db
      .insert(recorrenciasTable)
      .values({
        id: randomUUID(),
        lojaId: fx.lojaId,
        tipo: "SALARIO",
        usuarioId,
        descricao: "Salário",
        valor: 2800,
        diaVencimento: 5,
      })
      .returning();
    return r;
  }

  /**
   * ANTES: sair da equipe apagava o vínculo e os convites e não tocava em
   * `recorrencias`. No mês seguinte, "Gerar folha" lia todas as recorrências
   * ATIVAS da loja — sem nenhuma junção com `usuarios_lojas` — e a conta de
   * R$ 2.800 de quem já não trabalha ali nascia de novo, na tela de Pagar, no
   * "a pagar dos próximos 30 dias" e no DRE previsto. Todo mês, para sempre.
   */
  it("remover da equipe DESATIVA o salário — e a trilha diz quantos", async () => {
    const admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    const salario = await comSalario(f, f.vendedoraId);

    await admin.delete(`/api/lojas/${f.lojaId}/equipe/${f.vendedoraId}`).expect(204);

    const [depois] = await db
      .select()
      .from(recorrenciasTable)
      .where(eq(recorrenciasTable.id, salario.id));
    expect(depois.ativo).toBe(false);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.acao, "MEMBRO_REMOVIDO"),
        eq(auditLogTable.entidadeId, f.vendedoraId),
      ));
    expect((linha.detalhe as { recorrenciasDesativadas: number }).recorrenciasDesativadas).toBe(1);
  });

  /**
   * ANTES: a guarda contava 4 das 6 FKs. `recorrencias.usuario_id` é CASCADE —
   * a costureira com salário ativo e nada mais passava, e o banco apagava o
   * salário junto com ela. A folha do mês seguinte vinha R$ 2.800 menor, sem
   * erro e sem nenhuma linha que explicasse.
   */
  it("excluir do cadastro quem tem salário ativo é 409, não um sumiço silencioso", async () => {
    const fx = await criarFixture();
    try {
      const salario = await comSalario(fx, fx.vendedoraId);
      const admin = await loginComLoja(fx.superAdminEmail, fx.lojaId);

      const r = await admin.delete(`/api/admin/usuarios/${fx.vendedoraId}`).expect(409);
      expect(r.body.error).toBe("USUARIO_COM_HISTORICO");
      expect(r.body.detalhe).toContain("recorrente");

      const [viva] = await db
        .select()
        .from(recorrenciasTable)
        .where(eq(recorrenciasTable.id, salario.id));
      expect(viva).toBeDefined();
    } finally {
      await limparFixture(fx);
    }
  });
});

describe("Corrigir o e-mail no console não tranca ninguém para fora", () => {
  let f: Fixture;

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * ANTES: o PATCH espalhava `parsed.data` direto no update, sem o
   * `.toLowerCase().trim()` que o cadastro e o login aplicam. O superadmin
   * corrigia o nome de Ana e digitava o e-mail como ela escreve no WhatsApp —
   * `Ana@Moscow.com` —, e o login passava a procurar por `ana@moscow.com` (já
   * minúsculo), não achava linha nenhuma e devolvia 401 com a senha certa. Como
   * a unicidade é sobre o texto CRU, as duas grafias ainda podiam conviver e só
   * uma logava.
   */
  it("o e-mail é normalizado na gravação, e a pessoa continua entrando", async () => {
    f = await criarFixture();
    const admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    const novo = `Ana.${randomUUID().slice(0, 8)}@Moscow.COM`;

    await admin
      .patch(`/api/admin/usuarios/${f.vendedoraId}`)
      .send({ email: novo })
      .expect(200);

    const [linha] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, f.vendedoraId));
    expect(linha.email).toBe(novo.toLowerCase().trim());

    await request(app)
      .post("/api/auth/login")
      .send({ email: novo.toLowerCase().trim(), senha: SENHA_TESTE })
      .expect(200);
  });
});
