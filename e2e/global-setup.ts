import { execSync } from "node:child_process";
import { escolherLojaDaSuite } from "./loja-da-suite";
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
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
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
 * O INSTANTE de uma data de negócio: meio-dia de São Paulo (S-O119).
 *
 * A fixture abaixo escreve `casamentoData` **direto no banco**, sem passar por
 * porta — e portas ancoram desde o E197. Sem ancorar aqui, o que fica gravado é
 * um instante com a HORA em que a suíte subiu, e `diaDeNegocio` (que é como o
 * servidor lê a data do casamento) discorda de `diaLocal` (que é como esta
 * fixture calcula a ocupação) durante três horas por noite.
 *
 * Mesma conta de `ancoraDeNegocio` no `financeiro-core`, escrita aqui porque o
 * `global-setup` roda antes de qualquer build de workspace e importa só o db.
 */
function ancoraDeNegocioLocal(d: Date): Date {
  return new Date(`${diaLocal(d)}T12:00:00-03:00`);
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
   * A loja da suíte é a do ID configurado, e banco sem ela é erro — a S-D27
   * tirou daqui a eleição por IDADE, e o porquê está em `loja-da-suite.ts`.
   *
   * Este bloco descrevia a régua antiga desde `e01bff4`, o commit que a
   * aposentou: dizia "a MAIS ANTIGA do banco" sobre uma função que casa
   * `LOJA_DA_SUITE_PADRAO` e ESTOURA se não achar. A idade era frágil pelo
   * mesmo motivo que o `limit(1)` sem `order by` que ela substituiu — qualquer
   * `UPDATE` em `lojas` reescreve a linha no fim do heap, e as 23 "Loja Teste"
   * que as fixtures de API deixam no banco de dev eram candidatas.
   *
   * O sintoma nunca foi um teste vermelho: era o seed estourando com
   * `duplicate key ... regra_disponibilidade_pkey`, porque a regra abaixo
   * sobrevivia apontando para a loja da eleição anterior. É o caso 1 do bloco
   * da regra de disponibilidade, e continua tratado lá.
   */
  const loja = escolherLojaDaSuite(await db.select().from(lojasTable));

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

  /**
   * A COR do vestido da suíte é atributo do catálogo, e a coluna é legado
   * (S-O73/E188).
   *
   * `vestidos.cor` acima segue gravada de propósito — é o que um cadastro
   * antigo tem, e o E149 a deixou como legado LIDO. O que a ficha desenha em
   * "Características", porém, sai de `vestido_atributos` (`vestidos/[id].tsx`
   * monta `rotularSelecoes(catalogo, vestido.atributos)`), e o filtro do
   * acervo compara por id de OPÇÃO. No banco de dev este vestido tem o
   * atributo porque a migração `docs/migracoes/2026-08-04-e149-cor-para-
   * atributo.sql` rodou lá uma vez; num banco de hoje, `vestido_atributos`
   * nasce vazio para ele — e `04-vestidos.spec.ts:80` reprovava com
   * `element(s) not found` procurando "Cor: Marfim", medido em
   * `1 failed · 6 passed`.
   *
   * A fixture faz aqui o que a migração fez lá: casa a cor com a OPÇÃO do
   * atributo semeado, pelos ids que o seed deriva da loja. Fica FORA do
   * `garantir` do vestido de propósito — o vestido já existe em todo banco que
   * já rodou a suíte, e é justamente ali que o atributo falta.
   */
  const [atributoCor] = await db
    .select()
    .from(atributosTable)
    .where(and(eq(atributosTable.lojaId, loja.id), eq(atributosTable.nome, "Cor")));
  if (!atributoCor) throw new Error("[e2e-setup] a loja não tem o atributo Cor — o seed do catálogo não rodou");
  const [opcaoMarfim] = await db
    .select()
    .from(atributoOpcoesTable)
    .where(and(eq(atributoOpcoesTable.atributoId, atributoCor.id), eq(atributoOpcoesTable.valor, "Marfim")));
  if (!opcaoMarfim) throw new Error("[e2e-setup] o atributo Cor não tem a opção Marfim");
  await db
    .insert(vestidoAtributosTable)
    .values({ vestidoId: "e2e-vestido-1", atributoId: atributoCor.id, opcaoId: opcaoMarfim.id })
    .onConflictDoNothing();

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

  // Regra de disponibilidade da loja. A loja do seed abre TODOS os dias (E38):
  // assim os testes que criam atendimento "hoje" não dependem de o dia da suíte
  // cair num dia fechado. O teste do E38 gere e restaura sua própria
  // configuração de dias.
  //
  // A tabela tem DUAS restrições únicas — `regra_disponibilidade_pkey (id)` e
  // `regra_disponibilidade_loja_id_unique (loja_id)`, medidas em `pg_constraint`
  // — e um `ON CONFLICT` cobre uma só. Os dois conflitos acontecem, em bancos
  // diferentes, e por isso não há alvo único que sirva:
  //
  // 1. **run anterior com OUTRA loja:** a linha `e2e-regra-disp` sobrevive
  //    apontando para a loja velha e a loja de hoje não tem regra — o conflito
  //    é no `id`, e reapontar é o conserto. Era o estado que a eleição por
  //    idade produzia sozinha, e continua alcançável de propósito: quem aponta
  //    `E2E_LOJA_ID` para outra loja cai exatamente aqui;
  // 2. **banco virgem:** o seed acabou de criar o horário da loja com id
  //    `<loja>-horario` (`configuracao-inicial.ts:533`), então a loja de hoje
  //    JÁ TEM regra e `e2e-regra-disp` não existe — o conflito é no `loja_id`,
  //    e o alvo `id` não o cobria. Medido num banco novo: o setup morria com
  //    23505 `regra_disponibilidade_loja_id_unique` antes de a suíte começar,
  //    logo depois de o seed rodar.
  //
  // Ler a regra da loja ANTES resolve os dois: se ela existe, o que importa é o
  // conteúdo e o id é o que o banco já tinha; se não existe, o `id` volta a ser
  // o alvo, para reapontar a linha órfã do caso 1. O ajuste grava os cinco
  // campos em vez de só os dias — hoje os números do E2E e os do
  // `HORARIO_PADRAO` do seed são idênticos, e a fixture não pode depender disso
  // continuar verdade.
  const AJUSTE_E2E = {
    provaDiasAntes: 14,
    usoDiasAntes: 3,
    usoDiasDepois: 2,
    lavagemDiasDepois: 7,
    diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
    // S-D42: a hora de fechamento era a que o banco tivesse — 19 no banco de
    // dev (anterior à S-A8), 20 num banco novo — e nada no repositório dizia
    // qual expediente a suíte pretendia testar. Fixado no 20, que é a decisão
    // da dona (S-A8: as provas das 18:30 que o fechamento às 19h recusava).
    atendimentoFechamentoHora: 20,
  };
  const [regraDaLoja] = await db.select().from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, loja.id));
  if (regraDaLoja) {
    await db.update(regraDisponibilidadeTable).set(AJUSTE_E2E)
      .where(eq(regraDisponibilidadeTable.id, regraDaLoja.id));
  } else {
    await db.insert(regraDisponibilidadeTable)
      .values({ id: "e2e-regra-disp", lojaId: loja.id, ...AJUSTE_E2E })
      .onConflictDoUpdate({ target: regraDisponibilidadeTable.id, set: { lojaId: loja.id, ...AJUSTE_E2E } });
  }

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
    // S-O119: ancorado, para que o dia que o servidor lê (`diaDeNegocio`, dia
    // UTC) e o dia que a ocupação abaixo grava (`diaLocal`) sejam o MESMO a
    // qualquer hora em que a suíte suba.
    const casamento = ancoraDeNegocioLocal(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
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
    // S-D39: `bloqueioId` foi gravado aqui por 60 specs sem um leitor — a
    // interface E2EState nunca o declarou, e quem precisa do bloqueio da
    // fixture o acha pelo nome da noiva (13-onda2) ou cria o seu (23, 48).
  };
  mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
  writeFileSync(path.join(__dirname, ".state.json"), JSON.stringify(state, null, 2));
  console.log("[e2e-setup] dados prontos:", JSON.stringify({ loja: loja.nome, contrato: !!contrato }));

  await pool.end();
}
