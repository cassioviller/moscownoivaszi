import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import {
  db,
  pool,
  lojasTable,
  usuariosTable,
  usuariosLojasTable,
  perfisTable,
  vestidosTable,
  leadsTable,
  cabinesTable,
  regraDisponibilidadeTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  bloqueioVestidosTable,
  comissaoRegrasTable,
  comissaoFaixasTable,
} from "../lib/db/src/index";

/** Dia local (America/Sao_Paulo) no formato YYYY-MM-DD das colunas de ocupação. */
function diaLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Setup de dados E2E — idempotente (IDs fixos "e2e-*"; roda quantas vezes
 * for preciso sem duplicar). Se o banco estiver virgem (sem admin), roda o
 * seed oficial primeiro. Os IDs criados vão para e2e/.state.json, lido
 * pelos specs.
 */

const ADMIN_EMAIL = "admin@moscownoivas.com";
const MARIA_EMAIL = "maria@moscownoivas.com";
const SENHA = "admin123";

async function garantir<T>(atual: T | undefined, criar: () => Promise<unknown>): Promise<void> {
  if (!atual) await criar();
}

export default async function globalSetup() {
  // 0. Banco virgem? Roda o seed oficial do repositório.
  let [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
  if (!admin) {
    console.log("[e2e-setup] banco sem admin — rodando o seed oficial…");
    execSync("pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });
    [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
    if (!admin) throw new Error("[e2e-setup] seed não criou o admin");
  }

  /**
   * A loja da suíte é a MAIS ANTIGA do banco, e a ordem é explícita.
   *
   * Era `limit(1)` sem `order by`, o que em Postgres devolve a linha que a
   * varredura encontrar primeiro — ou seja, **posição física no heap**. Duas
   * coisas quebram isso, e as duas estão neste banco:
   *
   * 1. qualquer `UPDATE` em `lojas` reescreve a linha no fim do heap e reelege
   *    outra loja no run seguinte (foi o que aconteceu: o spec 45 passou a
   *    gravar telefone/endereço da loja para o rodapé do E100/F35);
   * 2. as "Loja Teste" que as fixtures de API deixam no banco de dev (sobra do
   *    E104) são candidatas à eleição — e uma delas ganhou.
   *
   * O sintoma não foi um teste vermelho: foi o SEED estourando com `duplicate
   * key ... regra_disponibilidade_pkey`, porque a regra abaixo já existia
   * apontando para a loja da eleição anterior. A loja de verdade é a primeira
   * que existiu; fixture nasce sempre depois.
   */
  const todasAsLojas = await db.select().from(lojasTable);
  const loja = todasAsLojas.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )[0];
  if (!loja) throw new Error("[e2e-setup] nenhuma loja no banco");

  // E93/D1: uma SEGUNDA loja da mesma pessoa. Sem ela a fixture não conseguia
  // exprimir a divergência "URL em B, sessão em A" — que é o estado exato em
  // que os dois efeitos de sincronização se reativavam até o React abortar.
  // Um bookmark e duas abas são os dois caminhos normais até aqui, e nenhum
  // deles era testável com uma loja só.
  const [lojaB] = await db.select().from(lojasTable).where(eq(lojasTable.id, "e2e-loja-b"));
  await garantir(lojaB, () =>
    db.insert(lojasTable).values({ id: "e2e-loja-b", nome: "E2E Segunda Loja" }),
  );

  /**
   * A vendedora da suíte é fixture DAQUI, não do seed (E147).
   *
   * Ela vinha do `scripts/seed.ts`, que era um seed de demonstração; agora
   * aquele script aplica a CONFIGURAÇÃO inicial de um ateliê — perfis, cabines,
   * horário, catálogo, escada, recorrências — e não cadastra gente que a loja
   * não contratou. "Vendedora Maria" é personagem de teste e passa a ser criada
   * e mantida por quem a usa, como o E146 fez com o resto das fixtures.
   *
   * O hash vem do admin em vez de ser gerado: as duas contas usam a mesma
   * `SENHA`, e copiá-lo evita uma dependência de bcrypt só para o setup.
   */
  let [maria] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, MARIA_EMAIL));
  if (!maria) {
    [maria] = await db
      .insert(usuariosTable)
      .values({
        id: "e2e-vendedora-maria",
        nome: "Vendedora Maria",
        email: MARIA_EMAIL,
        senhaHash: admin.senhaHash,
        ativo: true,
        isSuperAdmin: false,
      })
      .returning();
  }
  if (!maria) throw new Error("[e2e-setup] vendedora maria não existe");

  // 1. Vínculo da vendedora à loja (o seed original não cria — bug C12).
  const [perfilVendedora] = await db.select().from(perfisTable).where(eq(perfisTable.nome, "Vendedora"));
  const [vinculo] = await db.select().from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, maria.id), eq(usuariosLojasTable.lojaId, loja.id)));
  await garantir(vinculo, () =>
    db.insert(usuariosLojasTable).values({
      usuarioId: maria.id,
      lojaId: loja.id,
      perfilId: perfilVendedora?.id ?? "perfil-vendedora",
    }),
  );

  // 1b. Vínculo da admin com a segunda loja (E93/D1). A admin é superadmin e
  // `buscarLojasUsuario` já lhe devolveria as duas — mas o vínculo explícito é
  // o que o E91 passou a cobrar em toda escrita, e é ele que faz o cenário do
  // bookmark valer para gente comum e não só para quem tem a chave-mestra.
  const [perfilAdmin] = await db.select().from(perfisTable).where(eq(perfisTable.sistema, true));
  const [vinculoAdminB] = await db.select().from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, admin.id), eq(usuariosLojasTable.lojaId, "e2e-loja-b")));
  await garantir(vinculoAdminB, () =>
    db.insert(usuariosLojasTable).values({
      usuarioId: admin.id,
      lojaId: "e2e-loja-b",
      perfilId: perfilAdmin?.id ?? perfilVendedora?.id ?? "perfil-admin",
    }),
  );

  // 2. Entidades E2E com IDs fixos.
  const [vestido] = await db.select().from(vestidosTable).where(eq(vestidosTable.id, "e2e-vestido-1"));
  await garantir(vestido, () =>
    db.insert(vestidosTable).values({
      id: "e2e-vestido-1",
      lojaId: loja.id,
      codigo: "E2E-V900",
      nome: "E2E Vestido Playwright",
      precoBase: 4200,
      tamanho: "38",
      cor: "Marfim",
      categoria: "Princesa",
    }),
  );

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, "e2e-lead-1"));
  await garantir(lead, () =>
    db.insert(leadsTable).values({
      id: "e2e-lead-1",
      lojaId: loja.id,
      noivaNome: "E2E Noiva Playwright",
      whatsapp: "(11) 90000-0000",
      origem: "LOJA",
    }),
  );

  const [cabine] = await db.select().from(cabinesTable).where(eq(cabinesTable.id, "e2e-cabine-1"));
  await garantir(cabine, () =>
    db.insert(cabinesTable).values({ id: "e2e-cabine-1", lojaId: loja.id, nome: "E2E Cabine" }),
  );

  // Regra de disponibilidade da loja (upsert — unique por loja). A loja do seed
  // abre TODOS os dias (E38): assim os testes que criam atendimento "hoje" não
  // dependem de o dia da suíte cair num dia fechado. O teste do E38 gere e
  // restaura sua própria configuração de dias.
  // O conflito é resolvido pelo `id`, e não pelo `lojaId`: a tabela tem as duas
  // restrições únicas, e só a do `id` cobre o caso que estourou — a linha
  // `e2e-regra-disp` sobrevivendo de um run que elegeu OUTRA loja. Reapontar é
  // o conserto; recusar era o bug.
  await db.insert(regraDisponibilidadeTable)
    .values({ id: "e2e-regra-disp", lojaId: loja.id, provaDiasAntes: 14, usoDiasAntes: 3, usoDiasDepois: 2, lavagemDiasDepois: 7, diasFuncionamento: [0, 1, 2, 3, 4, 5, 6] })
    .onConflictDoUpdate({ target: regraDisponibilidadeTable.id, set: { lojaId: loja.id, diasFuncionamento: [0, 1, 2, 3, 4, 5, 6] } });

  // Escada de comissão da admin — alvo da tela de comissões. Vigência bem no
  // passado para valer em qualquer competência que o teste olhe. As faixas são
  // aninhadas na regra: elas não existem fora dela.
  const [regraComissao] = await db.select().from(comissaoRegrasTable).where(eq(comissaoRegrasTable.id, "e2e-comissao-regra-1"));
  await garantir(regraComissao, async () => {
    await db.insert(comissaoRegrasTable).values({
      id: "e2e-comissao-regra-1",
      lojaId: loja.id,
      vendedoraId: admin.id,
      vigenciaInicio: new Date("2020-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
    });
    await db.insert(comissaoFaixasTable).values([
      {
        id: "e2e-comissao-faixa-1",
        lojaId: loja.id,
        regraId: "e2e-comissao-regra-1",
        minAcumulado: 0,
        maxAcumulado: 10000,
        percentual: 5,
      },
      {
        id: "e2e-comissao-faixa-2",
        lojaId: loja.id,
        regraId: "e2e-comissao-regra-1",
        minAcumulado: 10000,
        maxAcumulado: null,
        percentual: 8,
      },
    ]);
  });

  // Orçamento com item — alvo do teste de detalhe.
  const [orcamento] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, "e2e-orcamento-1"));
  await garantir(orcamento, async () => {
    await db.insert(orcamentosTable).values({
      id: "e2e-orcamento-1",
      lojaId: loja.id,
      leadId: "e2e-lead-1",
      vendedoraId: admin.id,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: "e2e-orcitem-1",
      lojaId: loja.id,
      orcamentoId: "e2e-orcamento-1",
      tipo: "VESTIDO",
      descricao: "E2E Item Vestido",
      valorUnitario: 4200,
      quantidade: 1,
    });
  });

  // Reserva de casamento — alvo das telas de reservas/provas (Onda 2). A data é
  // sempre futura (90 dias) para cair na lente "próximas" da /reservas. O
  // envelope de ocupação é gravado à mão: o serviço de disponibilidade só roda
  // nas rotas, e a constraint EXCLUDE do banco lê estas colunas.
  const [bloqueio] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, "e2e-bloqueio-1"));
  await garantir(bloqueio, () => {
    const casamento = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const retirada = new Date(casamento.getTime() - 3 * 24 * 60 * 60 * 1000);
    const devolucao = new Date(casamento.getTime() + 2 * 24 * 60 * 60 * 1000);
    return db.insert(bloqueioVestidosTable).values({
      id: "e2e-bloqueio-1",
      lojaId: loja.id,
      vestidoId: "e2e-vestido-1",
      leadId: "e2e-lead-1",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
      ocupacaoInicio: diaLocal(retirada),
      ocupacaoFim: diaLocal(devolucao),
    });
  });

  const [contrato] = await db.select().from(contratosTable).where(eq(contratosTable.lojaId, loja.id)).limit(1);

  // 3. Estado compartilhado com os specs.
  const state = {
    lojaId: loja.id,
    lojaNome: loja.nome,
    // E93/D1: a segunda loja da admin — o "B" do bookmark com a sessão em A.
    lojaBId: "e2e-loja-b",
    lojaBNome: "E2E Segunda Loja",
    adminEmail: ADMIN_EMAIL,
    mariaEmail: MARIA_EMAIL,
    senha: SENHA,
    vestidoId: "e2e-vestido-1",
    leadId: "e2e-lead-1",
    orcamentoId: "e2e-orcamento-1",
    contratoId: contrato?.id ?? null,
    cabineId: "e2e-cabine-1",
    bloqueioId: "e2e-bloqueio-1",
  };
  mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
  writeFileSync(path.join(__dirname, ".state.json"), JSON.stringify(state, null, 2));
  console.log("[e2e-setup] dados prontos:", JSON.stringify({ loja: loja.nome, contrato: !!contrato }));

  await pool.end();
}
