import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  orcamentosTable,
  orcamentoItensTable,
  portalTokensTable,
  atendimentosTable,
  cabinesTable,
  lojasTable,
  contratosTable,
  contratoItensTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E78+E74): a vendedora gera o portal na ficha; a noiva abre
 * SEM login, vê a proposta e aceita — e a gestão reflete o aprovado. Revogar
 * mata o link na hora.
 */
test.describe("Portal da noiva (E78)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Portal ${stamp}`;
  let leadId: string;
  let orcamentoId: string;
  let provaId: string;
  let lojaAntes: { endereco: string | null; telefone: string | null };
  const cabineId = `e2e-cabine-portal-${stamp}`;
  const TELEFONE_DA_LOJA = "11955554444";
  const ENDERECO_DA_LOJA = `Rua do Ateliê ${stamp}, 42`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // F35: o rodapé precisa dos dados PÚBLICOS da loja, e a semente não os tem.
    // Guardados aqui, devolvidos no afterAll — a loja é compartilhada.
    const [lojaSemente] = await db
      .select({ endereco: lojasTable.endereco, telefone: lojasTable.telefone })
      .from(lojasTable)
      .where(eq(lojasTable.id, estado.lojaId));
    lojaAntes = lojaSemente;
    await db
      .update(lojasTable)
      .set({ endereco: ENDERECO_DA_LOJA, telefone: TELEFONE_DA_LOJA })
      .where(eq(lojasTable.id, estado.lojaId));

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome, whatsapp: "11977776666" },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = (await lead.json()).id;

    /**
     * A proposta ENVIADA — direto no banco, como as fixtures de API.
     *
     * **O desconto é fixture, e é PERCENTUAL de propósito (S-O86/E190).** Os
     * dois orçamentos que este spec montava não tinham desconto nenhum, e o
     * portal era assertado só pelo TOTAL: por essa fresta o defeito do S-O64
     * atravessou o E166 e só caiu no E187 — a página imprimia o próprio
     * percentual (`R$ 10,00` onde o desconto era R$ 750,00) enquanto o gêmeo
     * público (`61-link-publico.spec.ts:87`) já pregava a conta inteira. O 61
     * semeia desconto em VALOR; aqui é PERCENTUAL, que é a grafia em que a
     * conta errava — as duas telas passam a ter as duas.
     */
    orcamentoId = randomUUID();
    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    await db.insert(orcamentosTable).values({
      id: orcamentoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ENVIADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId,
      tipo: "VESTIDO",
      descricao: `Vestido E2E ${stamp}`,
      valorUnitario: 7500,
      quantidade: 1,
    });

    // Uma prova futura em cabine própria — o E85 confirma por ela.
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: estado.lojaId, nome: cabineId });
    provaId = randomUUID();
    await db.insert(atendimentosTable).values({
      id: provaId,
      lojaId: estado.lojaId,
      leadId,
      cabineId,
      vendedoraId: admin!.id,
      tipo: "PROVA",
      inicio: new Date(Date.now() + 5 * 86_400_000),
    });
  });

  test.afterAll(async () => {
    /**
     * O contrato sai AQUI, e não no fim do teste que o cria (E190).
     *
     * `contratos.lead_id` é RESTRICT, e enquanto o `delete` do contrato morava
     * na última linha do corpo do teste, qualquer falha antes dela deixava o
     * contrato de pé — e aí este `afterAll` estourava em
     * `Failed query: delete from "leads"`, levando junto a cabine (que os
     * atendimentos do lead seguravam). Medido durante a medição da S-O86: dois
     * runs vermelhos deixaram **2 leads, 2 contratos e 2 cabines** no banco de
     * dev, e a cabine extra derrubou `18-agenda-grade` no run seguinte —
     * "arrastar para outra cabine muda a coluna" desenha a grade por cabine.
     * É a classe que o `replit.md` descreve: rastro de spec vira vermelho em
     * OUTRO arquivo, um run depois, e se lê como flake.
     */
    if (leadId) await db.delete(contratosTable).where(eq(contratosTable.leadId, leadId));
    // O cascade do lead leva orçamento, itens, portal_token e atendimentos.
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    await db.delete(cabinesTable).where(eq(cabinesTable.id, cabineId));
    // F35: a loja da semente é COMPARTILHADA — devolve como estava.
    await db
      .update(lojasTable)
      .set({ endereco: lojaAntes.endereco, telefone: lojaAntes.telefone })
      .where(eq(lojasTable.id, estado.lojaId));
  });

  test("a vendedora gera o link na ficha; a noiva abre sem login e aceita; a gestão reflete", async ({
    page,
    browser,
  }) => {
    // — A ficha: o card do portal gera (e copia) o link. —
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadId}`);
    const gerar = page.getByTestId("gerar-portal");
    await expect(gerar).toBeVisible();
    await gerar.click();
    await expect(page.getByText(/Link copiado|Não deu para copiar/).first()).toBeVisible();

    const [portal] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.leadId, leadId));
    expect(portal).toBeTruthy();

    // O card agora sabe que existe — e que ela ainda não abriu.
    await expect(page.getByText("Ela ainda não abriu.")).toBeVisible();

    // — A noiva, SEM sessão: contexto limpo. —
    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${portal.token}`);

    await expect(noiva.getByText(`O lugar de ${noivaNome}`)).toBeVisible();
    await expect(noiva.getByText(`Vestido E2E ${stamp}`)).toBeVisible();
    await expect(noiva.getByText("R$ 7.500,00").first()).toBeVisible();

    // S-O86: a conta FECHA na tela dela — soma, abatimento REAL e total. O
    // rótulo traz o percentual e o valor ao lado dele é a diferença, não o
    // percentual: R$ 750,00 sobre R$ 7.500,00, e o total desce para R$ 6.750,00.
    await expect(noiva.getByText("Soma dos itens")).toBeVisible();
    await expect(noiva.getByText("Desconto (10%)")).toBeVisible();
    await expect(noiva.getByText(/−\s*R\$\s*750,00/)).toBeVisible();
    await expect(noiva.getByText(/R\$\s*6\.750,00/).first()).toBeVisible();

    // O aceite (E74) — a página vira comprovante.
    await noiva.getByTestId("aceitar-portal").click();
    await expect(noiva.getByText(/Você aceitou esta proposta em/)).toBeVisible();

    // E85: a prova está lá, e confirmar é um clique — o badge assume o lugar.
    await noiva.getByTestId(`confirmar-prova-${provaId}`).click();
    await expect(noiva.getByText("Confirmada")).toBeVisible();
    const [prova] = await db
      .select()
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, provaId));
    expect(prova.confirmadoEm).not.toBeNull();
    await semLogin.close();

    // — A gestão reflete: o orçamento aprovou com rastro. —
    const [orcamento] = await db
      .select()
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId));
    expect(orcamento.status).toBe("APROVADO");
    expect(orcamento.aceitoEm).not.toBeNull();

    // E o card da vendedora sabe que ela abriu.
    await page.reload();
    await expect(page.getByText(/Ela abriu (agora há pouco|há \d)/)).toBeVisible();
  });

  test("revogar mata o link na hora", async ({ page, browser }) => {
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadId}`);
    const [antes] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.leadId, leadId));

    // E10/E99: revogar passou a confirmar — o link que a noiva guardou morre na
    // hora, e o diálogo nomeia de quem é o portal antes de deixar apagar.
    await page.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText(new RegExp(`O link que .*${noivaNome}`))).toBeVisible();
    await page.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText("Portal revogado").first()).toBeVisible();

    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${antes.token}`);
    await expect(noiva.getByText(/Link inválido/)).toBeVisible();
    await semLogin.close();
  });

  /**
   * E100 parte 3 — o portal deixa de ser um beco (F35) e o prazo dele deixa de
   * correr contra quem usa (F38).
   *
   * O portal pedia "fale com a sua vendedora" em três lugares sem um telefone
   * em lugar nenhum; e o link vencia 30 dias depois de gerado, num noivado que
   * dura um ano — quando vencia, a cobrança do E84 passava a sair sem ele,
   * calada. Os dois se veem na MESMA visita: é a abertura da noiva que renova.
   *
   * O portal é gerado aqui dentro em vez de herdado do primeiro teste, porque o
   * segundo revoga o dele — recurso próprio por execução (a lição da S7).
   */
  test("o rodapé leva ao WhatsApp da loja, e abrir o link empurra o vencimento", async ({
    request,
    browser,
  }) => {
    const novo = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/leads/${leadId}/portal`,
    );
    expect(novo.status(), await novo.text()).toBe(201);
    const token = (await novo.json()).token as string;

    // A véspera do fim: um dia de vida pela régua antiga.
    await db
      .update(portalTokensTable)
      .set({ expiraEm: new Date(Date.now() + 86_400_000) })
      .where(eq(portalTokensTable.token, token));

    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${token}`);

    // F35: o endereço responde "onde eu vou?"; o botão responde "como falo?".
    await expect(noiva.getByText(ENDERECO_DA_LOJA)).toBeVisible();
    const falar = noiva.getByTestId("falar-com-a-loja");
    const href = await falar.getAttribute("href");
    expect(href).toContain(`wa.me/55${TELEFONE_DA_LOJA}`);
    // A mensagem já sai com o nome dela: quem atende o número da LOJA recebe um
    // "oi" de um número desconhecido no meio de dezenas.
    expect(decodeURIComponent(href!)).toContain(`Aqui é a ${noivaNome}`);

    await semLogin.close();

    // F38: a mesma visita renovou o prazo. ANTES: continuava valendo um dia.
    const [depois] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.token, token));
    const diasQueFaltam = (depois.expiraEm.getTime() - Date.now()) / 86_400_000;
    expect(diasQueFaltam).toBeGreaterThan(29);
    expect(diasQueFaltam).toBeLessThan(31);
  });

  /**
   * E100 parte 4 / F21 — o contrato assinado chega até ela.
   *
   * Era o único artefato do sistema sem caminho até a noiva: o PDF só descia no
   * computador da loja (`<a download>` na tela do contrato), e o portal mostrava
   * a PROPOSTA, nunca o contrato. Quando ela perdia o arquivo — e ela perde —,
   * a vendedora baixava, trocava para o WhatsApp e anexava tudo de novo.
   *
   * O F39 ("O seu vestido") fica com os 14 testes de API: ele é 🔵, não estreia
   * rota nenhuma e não muda o que a loja opera. **O que este spec cobre e a API
   * não cobre é a QUINTA rota pública com documento financeiro dentro** — que a
   * tela dela realmente a alcança, com o token certo na URL.
   */
  test("o contrato aparece no portal e o PDF desce pelo link dela", async ({
    request,
    browser,
  }) => {
    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    const contratoId = randomUUID();
    /**
     * S-O86: o bloco do contrato dentro do portal é o QUARTO sítio da mesma
     * conta (S-O13) e o segundo que imprimia o valor cru (S-O64). Aqui os itens
     * somam R$ 9.200,00 e o contrato fechou em R$ 7.360,00 — os 20% de desconto
     * valem R$ 1.840,00, e é isso que a linha tem de dizer.
     *
     * O percentual é **20 e não 10** porque esta página mostra a proposta E o
     * contrato ao mesmo tempo: com o mesmo número, `getByText("Desconto (10%)")`
     * casa nos dois blocos e o Playwright recusa em modo estrito (medido:
     * *"strict mode violation: resolved to 2 elements"*). Percentuais distintos
     * pregam cada bloco no seu, sem amarrar o teste à estrutura do DOM.
     */
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      valorTotal: 7360,
      descontoTipo: "PERCENTUAL",
      descontoValor: 20,
      fechadoEm: new Date(),
    });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      contratoId,
      tipo: "VESTIDO",
      descricao: `Vestido contratado ${stamp}`,
      valorUnitario: 9200,
      quantidade: 1,
    });

    const novo = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/leads/${leadId}/portal`,
    );
    const token = (await novo.json()).token as string;

    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${token}`);

    await expect(noiva.getByText("Seu contrato")).toBeVisible();
    await expect(noiva.getByText(`Vestido contratado ${stamp}`)).toBeVisible();
    await expect(noiva.getByText("R$ 9.200,00").first()).toBeVisible();
    await expect(noiva.getByText("Desconto (20%)")).toBeVisible();
    await expect(noiva.getByText(/−\s*R\$\s*1\.840,00/)).toBeVisible();
    await expect(noiva.getByText(/R\$\s*7\.360,00/).first()).toBeVisible();

    // O PDF pelo MESMO token — a resposta é o papel, não uma página de erro.
    const href = await noiva.getByTestId("baixar-contrato-portal").getAttribute("href");
    expect(href).toContain(`token=${encodeURIComponent(token)}`);
    const pdf = await noiva.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // O contrato é apagado no `afterAll`, junto do lead — aqui ele morreria só
    // no caminho verde, que é justamente quando não faz falta.
    await semLogin.close();
  });
});
