import { randomUUID } from "node:crypto";
import request from "supertest";
import { reancorarDataDeNegocio } from "@workspace/financeiro-core";
import {
  db,
  pool,
  lojasTable,
  perfisTable,
  usuariosTable,
  usuariosLojasTable,
  vestidosTable,
  leadsTable,
  reservasTable,
  bloqueioVestidosTable,
  regraDisponibilidadeTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  type Vestido,
  type Lead,
  type Reserva,
  type BloqueioVestido,
  type RegraDisponibilidade,
  type Orcamento,
  type OrcamentoItem,
  type Contrato,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { hashSenha } from "../lib/auth";
import app from "../app";
import {
  buscarRegra,
  ocupacaoFisica,
  type BloqueioJanelasInput,
} from "../lib/disponibilidade";

export const SENHA_TESTE = "senha-teste-123";

export interface Fixture {
  lojaId: string;
  perfilId: string;
  /** Perfil do superadmin na loja — SEPARADO do da vendedora de propósito. */
  perfilAdminId: string;
  vendedoraId: string;
  vendedoraEmail: string;
  superAdminId: string;
  superAdminEmail: string;
}

// Cria loja/perfil/usuários exclusivos deste teste (sufixo aleatório) para não
// depender nem interferir nos dados existentes do banco de desenvolvimento.
export async function criarFixture(): Promise<Fixture> {
  const sufixo = randomUUID().slice(0, 8);
  const senhaHash = await hashSenha(SENHA_TESTE);

  const lojaId = randomUUID();
  await db.insert(lojasTable).values({ id: lojaId, nome: `Loja Teste ${sufixo}` });

  const perfilId = randomUUID();
  const perfilAdminId = randomUUID();
  // Módulo × ação, o formato que o E147 tornou canônico. A fixture escrevia o
  // formato PLANO antigo ({ leads: true }) a cada execução da suíte — era a
  // FONTE que a S-D26 mandou fechar: qualquer UPDATE no banco seria desfeito
  // pela passada seguinte. `true` valia ver+criar+editar, e é isso que se
  // escreve por extenso agora (a semântica não muda um bit).
  //
  // E172: `orcamentos` e `contratos` entraram nos dois. A fixture descreve a
  // VENDEDORA — quem vende, aprova a proposta, fecha contrato e recebe a
  // parcela na mão da noiva (a decisão B9 de 2026-07-27, agora com nome
  // próprio) —, e sem estas chaves a suíte passaria a medir um 403 de permissão
  // em vez do comportamento que ela existe para pregar: **41 testes de
  // orçamento** caíram assim quando `orcamentos` saiu de `leads`, e 92 de
  // contrato e parcela cairiam pelo mesmo motivo.
  const TUDO = { ver: true, criar: true, editar: true };
  await db.insert(perfisTable).values([
    {
      id: perfilId,
      nome: `Perfil Teste ${sufixo}`,
      acessosModulos: { leads: TUDO, orcamentos: TUDO, contratos: TUDO, vestidos: TUDO, agenda: TUDO },
    },
    {
      id: perfilAdminId,
      nome: `Perfil Admin Teste ${sufixo}`,
      acessosModulos: {
        leads: TUDO,
        orcamentos: TUDO,
        contratos: TUDO,
        vestidos: TUDO,
        agenda: TUDO,
        admin: TUDO,
        financeiro: TUDO,
        comissao: TUDO,
      },
    },
  ]);

  const vendedoraId = randomUUID();
  const vendedoraEmail = `vendedora-${sufixo}@teste.local`;
  const superAdminId = randomUUID();
  const superAdminEmail = `superadmin-${sufixo}@teste.local`;

  await db.insert(usuariosTable).values([
    { id: vendedoraId, nome: `Vendedora Teste ${sufixo}`, email: vendedoraEmail, senhaHash },
    { id: superAdminId, nome: `Super Admin Teste ${sufixo}`, email: superAdminEmail, senhaHash, isSuperAdmin: true },
  ]);

  // Os DOIS entram na loja. O superadmin já era tratado como gente da loja
  // pelos testes (fecha contrato, tem escada de comissão, aparece no ranking);
  // o vínculo só passou a ser obrigatório com o E91, que exige prova de
  // pertencimento para todo id de pessoa que entra numa escrita. Sem ele, a
  // fixture descrevia alguém que a UI nunca ofereceria como vendedora — o
  // `GET /equipe`, que alimenta o seletor, lista exatamente estes vínculos.
  //
  // Em PERFIL PRÓPRIO, e isso importa: mudar permissão derruba as sessões de
  // quem tem AQUELE perfil na loja (E56/E60). Compartilhando o perfil, todo
  // teste que personaliza a matriz derrubaria a própria sessão do admin.
  await db.insert(usuariosLojasTable).values([
    { usuarioId: vendedoraId, lojaId, perfilId },
    { usuarioId: superAdminId, lojaId, perfilId: perfilAdminId },
  ]);

  return { lojaId, perfilId, perfilAdminId, vendedoraId, vendedoraEmail, superAdminId, superAdminEmail };
}

// Remove somente o que a fixture criou. Usuários cascateiam sessões e vínculos;
// a loja cascateia entidades de teste criadas sob ela.
//
// A ORDEM importa desde o E91: as FKs de vendedora deixaram de ser CASCADE e
// viraram RESTRICT (apagar a pessoa não pode apagar contrato, parcela paga,
// orçamento, atendimento nem fechamento de comissão). Some primeiro o que é da
// LOJA e só então as pessoas. Os contratos saem numa instrução própria porque
// `contratos.leadId` é RESTRICT: deixar o cascade da loja apagar lead e
// contrato na mesma varredura depende da ordem em que o Postgres dispara os
// gatilhos, que não é garantida.
export async function limparFixture(f: Fixture): Promise<void> {
  await db.delete(contratosTable).where(eq(contratosTable.lojaId, f.lojaId));

  /**
   * S18 — quem a fixture NÃO criou, mas nasceu dentro da loja dela.
   *
   * A limpeza apagava usuário por ID, e só os dois que o `Fixture` conhece.
   * Toda pessoa criada pela ROTA (`POST /lojas/:id/equipe`, o caminho que a
   * própria suíte exercita dezenas de vezes) tem id que nunca entra no
   * `Fixture`: o cascade da loja levava só o VÍNCULO, e a pessoa ficava órfã no
   * banco para sempre.
   *
   * Medido em 2026-08-05: **1.629 usuários órfãos, 98% dos 1.667** do banco de
   * dev — e 2,7× o que o E100 mediu, porque cada passada da suíte acrescenta.
   * O custo não é o disco: `GET /admin/usuarios` não pagina e devolve a tabela
   * inteira, e uma varredura por e-mail passa a atravessar milhares de linhas
   * de lixo.
   *
   * Os vínculos são lidos ANTES de a loja sumir (o cascade os apaga junto), e
   * só se apaga quem ficou sem vínculo NENHUM — uma pessoa pode legitimamente
   * pertencer a outra loja, e a fixture não é dona dela.
   */
  const daLoja = await db
    .select({ usuarioId: usuariosLojasTable.usuarioId })
    .from(usuariosLojasTable)
    .where(eq(usuariosLojasTable.lojaId, f.lojaId));

  await db.delete(lojasTable).where(eq(lojasTable.id, f.lojaId));

  const candidatos = [
    ...new Set([...daLoja.map((v) => v.usuarioId), f.vendedoraId, f.superAdminId]),
  ];
  if (candidatos.length > 0) {
    const aindaVinculados = await db
      .select({ usuarioId: usuariosLojasTable.usuarioId })
      .from(usuariosLojasTable)
      .where(inArray(usuariosLojasTable.usuarioId, candidatos));
    const presos = new Set(aindaVinculados.map((v) => v.usuarioId));
    const orfaos = candidatos.filter((id) => !presos.has(id));
    if (orfaos.length > 0) {
      // Sessões e vínculos cascateiam do usuário; contratos e orçamentos são
      // RESTRICT, e já sumiram com a loja logo acima.
      await db.delete(usuariosTable).where(inArray(usuariosTable.id, orfaos));
    }
  }

  await db.delete(perfisTable).where(inArray(perfisTable.id, [f.perfilId, f.perfilAdminId]));
}

export async function fecharPool(): Promise<void> {
  await pool.end();
}

// Autentica a vendedora e seleciona a loja ativa; retorna o agent com cookies.
export async function loginComLoja(email: string, lojaId: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, senha: SENHA_TESTE }).expect(200);
  await agent.post("/api/auth/selecionar-loja").send({ lojaId }).expect(200);
  return agent;
}

// ────────────────── Datas de negócio (Lote 3) ──────────────────
// Nunca `new Date()` para datas de negócio: âncora literal ao meio-dia de
// São Paulo (offset explícito; SP não tem DST desde 2019).

export const DATA_BASE_CASAMENTO = new Date("2027-09-15T12:00:00-03:00");

const MS_POR_DIA = 86_400_000;

/** DATA_BASE_CASAMENTO + offsetDias, preservando o meio-dia local. */
export function dataFutura(offsetDias: number): Date {
  return new Date(DATA_BASE_CASAMENTO.getTime() + offsetDias * MS_POR_DIA);
}

// ────────────────── Fixtures por inserção direta (Lote 3) ──────────────────
// Tudo pendurado em f.lojaId: o delete da loja cascateia a limpeza.

export async function criarVestido(
  f: Fixture,
  overrides: Partial<typeof vestidosTable.$inferInsert> = {},
): Promise<Vestido> {
  const sufixo = randomUUID().slice(0, 8);
  const [vestido] = await db
    .insert(vestidosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      codigo: `VT-${sufixo}`,
      nome: `Vestido Teste ${sufixo}`,
      precoBase: 5000,
      ...overrides,
    })
    .returning();
  return vestido;
}

export async function criarLead(
  f: Fixture,
  overrides: Partial<typeof leadsTable.$inferInsert> = {},
): Promise<Lead> {
  const sufixo = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(leadsTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      noivaNome: `Noiva Teste ${sufixo}`,
      /**
       * E215 — a noiva de teste nasce com a ficha COMPLETA, e é o default certo
       * por duas razões.
       *
       * A primeira é de fidelidade: desde o E215 o `POST /contratos` recusa
       * fechar sem a qualificação de quem assina, então uma noiva sem CPF, RG
       * e endereço não é "uma noiva simples" — é uma noiva que **não pode
       * fechar contrato**. Fixture que não fecha contrato não representa a
       * população que os testes de contrato querem exercitar.
       *
       * A segunda é de custo: sem isto, **43 arquivos de teste** que batem no
       * `POST /api/lojas/:id/contratos` passariam a reprovar de uma vez — o
       * vermelho medido foi `expected 201 "Created", got 422` e
       * `expected 'QUALIFICACAO_INCOMPLETA' to be 'DATA_DIVERGE_DA_RESERVA'`,
       * que é a guarda nova comendo a asserção de outra guarda. Consertar 43
       * arquivos à mão seria 43 chances de escrever o dado de teste diferente,
       * e o plano do E215 avisava: estreitar a porta sem olhar reprova a suíte
       * por DADO DE TESTE, não por defeito.
       *
       * Quem testa a guarda passa `cpf: null` (ou o campo que quiser derrubar)
       * pelos overrides — é o que `e215-qualificacao-api.test.ts` faz.
       */
      cpf: "390.533.447-05",
      rg: "12.345.678-9",
      estadoCivil: "SOLTEIRA",
      profissao: "Professora",
      nascimento: new Date("1996-03-12T12:00:00-03:00"),
      email: `noiva.${sufixo}@exemplo.com.br`,
      enderecoLogradouro: "Rua das Noivas",
      enderecoNumero: "123",
      enderecoBairro: "Centro",
      enderecoCep: "12243-260",
      enderecoCidade: "São José dos Campos",
      enderecoEstado: "SP",
      ...overrides,
    })
    .returning();
  return lead;
}

// Upsert: regra_disponibilidade tem UNIQUE por loja.
export async function criarRegraDisponibilidade(
  f: Fixture,
  valores: Partial<Omit<typeof regraDisponibilidadeTable.$inferInsert, "id" | "lojaId">> = {},
): Promise<RegraDisponibilidade> {
  const [regra] = await db
    .insert(regraDisponibilidadeTable)
    .values({ id: randomUUID(), lojaId: f.lojaId, ...valores })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.lojaId,
      set: { ...valores, lojaId: f.lojaId },
    })
    .returning();
  return regra;
}

export async function criarOrcamento(
  f: Fixture,
  params: {
    leadId: string;
    status?: Orcamento["status"];
    vendedoraId?: string;
    descontoTipo?: "PERCENTUAL" | "VALOR";
    descontoValor?: number;
  },
): Promise<Orcamento> {
  const status = params.status ?? "APROVADO";
  const [orcamento] = await db
    .insert(orcamentosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      vendedoraId: params.vendedoraId ?? f.vendedoraId,
      status,
      descontoTipo: params.descontoTipo ?? null,
      descontoValor: params.descontoValor ?? null,
      aprovadoEm: status === "APROVADO" ? new Date() : null,
    })
    .returning();
  return orcamento;
}

export async function criarOrcamentoItem(
  f: Fixture,
  params: {
    orcamentoId: string;
    tipo?: OrcamentoItem["tipo"];
    descricao?: string;
    valorUnitario?: number;
    quantidade?: number;
    vestidoId?: string | null;
    itemEstoqueId?: string | null;
  },
): Promise<OrcamentoItem> {
  const sufixo = randomUUID().slice(0, 8);
  const [item] = await db
    .insert(orcamentoItensTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      orcamentoId: params.orcamentoId,
      tipo: params.tipo ?? "VESTIDO",
      descricao: params.descricao ?? `Item ${sufixo}`,
      valorUnitario: params.valorUnitario ?? 5000,
      quantidade: params.quantidade ?? 1,
      vestidoId: params.vestidoId ?? null,
      itemEstoqueId: params.itemEstoqueId ?? null,
    })
    .returning();
  return item;
}

export async function criarReserva(
  f: Fixture,
  params: { leadId: string; casamentoData: Date; status?: Reserva["status"] },
): Promise<Reserva> {
  const [reserva] = await db
    .insert(reservasTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      // S-O119: a fixture escreve DIRETO no banco, e a porta ancora desde o
      // E197. Sem ancorar aqui, um teste que passe `new Date(Date.now() + N)`
      // grava um instante com a hora em que a suíte rodou, e o servidor — que lê
      // esta coluna como dia de NEGÓCIO — enxerga outro dia por três horas
      // toda noite. Fixture que grava direto imita a porta, ou mente sobre ela.
      casamentoData: reancorarDataDeNegocio(params.casamentoData),
      status: params.status,
    })
    .returning();
  return reserva;
}

// Inserção direta com fechadoEm/estorno controlados — para testes de comissão
// por competência (a rota sempre usa new Date() no fechadoEm).
export async function criarContrato(
  f: Fixture,
  params: {
    leadId: string;
    vendedoraId?: string;
    orcamentoId?: string;
    valorTotal: number;
    fechadoEm: Date;
    canceladoEm?: Date | null;
    comissaoEstornadaEm?: Date | null;
  },
): Promise<Contrato> {
  const cancelado = params.canceladoEm ?? params.comissaoEstornadaEm ?? null;
  const [contrato] = await db
    .insert(contratosTable)
    .values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: params.leadId,
      orcamentoId: params.orcamentoId ?? null,
      vendedoraId: params.vendedoraId ?? f.vendedoraId,
      valorTotal: params.valorTotal,
      fechadoEm: params.fechadoEm,
      status: cancelado ? "CANCELADO" : "ATIVO",
      canceladoEm: cancelado,
      comissaoEstornadaEm: params.comissaoEstornadaEm ?? null,
    })
    .returning();
  return contrato;
}

export interface CriarBloqueioParams {
  vestidoId: string;
  tipo: BloqueioVestido["tipo"];
  casamentoData?: Date | null;
  /**
   * S-O119 — a saída explícita da âncora, para quem TESTA o instante cru.
   *
   * Por padrão o helper ancora, porque fixture que grava direto no banco tem de
   * imitar a porta (que ancora desde o E197) — senão a suíte exercita um estado
   * que o sistema não sabe mais produzir. Mas há teste cujo assunto É o
   * instante de fronteira: o E87 grava *"ontem às 22h de São Paulo"*, cujo dia
   * UTC já é hoje, justamente para provar que o recorte `futuras` classifica
   * pelo dia da LOJA. Ancorar aquilo apagaria o caso sob teste.
   *
   * Quem passa `false` está dizendo *"quero a linha legada, não a que a porta
   * escreveria"* — e tem de dizer por quê, no lugar da chamada.
   */
  ancorarCasamento?: boolean;
  leadId?: string | null;
  reservaId?: string | null;
  provaDataReal?: Date | null;
  retiradaDataReal?: Date | null;
  devolucaoDataReal?: Date | null;
  lavagemConcluidaEm?: Date | null;
  inicio?: Date | null;
  fim?: Date | null;
  canceladoEm?: Date | null;
}

// Como a rota: materializa o envelope físico (ocupacao_inicio/fim) via
// ocupacaoFisica do serviço, com a regra efetiva da loja.
export async function criarBloqueio(
  f: Fixture,
  params: CriarBloqueioParams,
): Promise<BloqueioVestido> {
  const id = randomUUID();
  const candidato: BloqueioJanelasInput = {
    id,
    tipo: params.tipo,
    // S-O119: mesma âncora de `criarReserva`, e pela mesma razão — este helper
    // é `db.insert` direto, e a ocupação logo abaixo é derivada desta data.
    // `ancorarCasamento: false` é a saída para quem testa o instante cru.
    casamentoData:
      params.casamentoData && params.ancorarCasamento !== false
        ? reancorarDataDeNegocio(params.casamentoData)
        : (params.casamentoData ?? null),
    provaDataReal: params.provaDataReal ?? null,
    retiradaDataReal: params.retiradaDataReal ?? null,
    devolucaoDataReal: params.devolucaoDataReal ?? null,
    lavagemConcluidaEm: params.lavagemConcluidaEm ?? null,
    inicio: params.inicio ?? null,
    fim: params.fim ?? null,
  };
  const regra = await buscarRegra(f.lojaId);
  const ocupacao = ocupacaoFisica(candidato, regra);
  const [bloqueio] = await db
    .insert(bloqueioVestidosTable)
    .values({
      id,
      lojaId: f.lojaId,
      vestidoId: params.vestidoId,
      leadId: params.leadId ?? null,
      reservaId: params.reservaId ?? null,
      tipo: params.tipo,
      casamentoData: candidato.casamentoData,
      provaDataReal: candidato.provaDataReal,
      retiradaDataReal: candidato.retiradaDataReal,
      devolucaoDataReal: candidato.devolucaoDataReal,
      inicio: candidato.inicio,
      fim: candidato.fim,
      canceladoEm: params.canceladoEm ?? null,
      ocupacaoInicio: ocupacao?.inicio ?? null,
      ocupacaoFim: ocupacao?.fim ?? null,
    })
    .returning();
  return bloqueio;
}
