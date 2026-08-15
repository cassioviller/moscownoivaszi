import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db/schema";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * O ENUMERADOR das portas de escrita nas quatro tabelas quentes (E171).
 *
 * A varredura que consome este arquivo é `varredura-portas-sob-tranca.test.ts`;
 * aqui mora só a enumeração, que é o que decide a qualidade da régua. As quatro
 * varreduras anteriores de tranca — S-M7, S-M18, S-M22, S-M24 — **acertaram o
 * padrão e erraram o alcance**: a revisão da ótica dos papéis mediu 14 portas
 * abertas DEPOIS delas. Uma régua que não enxerga nasce verde, e verde por não
 * ter olhado é o pior resultado possível: ela AUTORIZA.
 *
 * Por isso a enumeração não é `grep`:
 *
 * - `grep -n "\.update(contratosTable"` acha a linha e **não sabe** se ela está
 *   dentro de `db.transaction`, se o receptor é o `tx` daquela transação ou o
 *   `db` do pool, se há `FOR UPDATE` antes, nem o que o `where` da escrita
 *   carrega. Todas as quatro perguntas são estruturais.
 * - A população sai de `git ls-files` (S38/S-D30). Em 2026-08-06 dois worktrees
 *   órfãos deixaram 1,04 GB no disco e uma varredura ingênua lia **4.791
 *   arquivos onde havia 1.681** — 65% do que o disco devolvia era cópia. Este
 *   agente roda dentro de `.claude/worktrees/`, que é exatamente o lugar.
 *
 * ## O que é uma porta
 *
 * Uma chamada `X.insert(T)`, `X.update(T)` ou `X.delete(T)` onde `T` é uma das
 * quatro tabelas quentes — `bloqueio_vestidos`, `reservas`, `contratos`,
 * `orcamentos`. São as quatro em que uma corrida perdida custa peça prometida
 * duas vezes ou dinheiro preso no caixa.
 *
 * ## As três disciplinas que a varredura aceita
 *
 * **TRANCA** — a escrita roda dentro de `db.transaction`, pelo executor DAQUELA
 * transação, existe `.for("update")` sobre a tabela alvo ou sobre uma linha-pai
 * declarada em `PAIS`, e a guarda é RELIDA depois da tranca (§ `releituraDaGuarda`).
 * É a forma do `aceite-orcamento.ts:68-79`.
 *
 * **CAS** — a escrita repete no próprio `where` a condição de estado que a
 * guarda leu (`eq(contratosTable.status, "ATIVO")`). O UPDATE é atômico por si:
 * zero linhas quer dizer "mudou no meio". É o idioma que o E158 nomeou a partir
 * do DELETE de parcela (`contratos.ts:1058-1071`) e que o `PATCH /contratos`
 * (`:1072`) usa hoje.
 *
 * **ABERTA** — nem uma nem outra. Toda porta ABERTA tem de estar na tabela de
 * dívida reconhecida da varredura, **com a contagem travada**.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * As pastas varridas. `artifacts/moscow-noivas/src` entra de propósito mesmo
 * sendo frontend: o dia em que um `contratosTable` aparecer lá, a varredura
 * fala. `scripts` e `lib` entram pelo mesmo motivo — seed e migração escrevem.
 */
const PASTAS = [
  "artifacts/api-server/src",
  "artifacts/moscow-noivas/src",
  "lib",
  "scripts",
] as const;

/**
 * As sete tabelas quentes. Quatro pela D4 (E171), `parcelas` pelo E180
 * (S-O34) e — **E238 (S-O108)** — `comissao_fechamentos` e `contas_pagar`: a
 * S-O107 morava numa tabela que a régua não contava, achada por leitura, como
 * o E180 achou `parcelas`; e `contas_pagar` já tinha degrau em
 * `DEGRAUS_DA_ORDEM` sem ser contada como porta. Custaram 10 portas de uma
 * vez (6 com disciplina, 4 na dívida declarada) e uma exceção nova, a tabela
 * cujo estado é existir (§ ESTADO_E_A_EXISTENCIA).
 */
export const TABELAS_QUENTES = [
  "bloqueioVestidosTable",
  "reservasTable",
  "contratosTable",
  "orcamentosTable",
  "parcelasTable",
  "comissaoFechamentosTable",
  "contasPagarTable",
] as const;
export type TabelaQuente = (typeof TABELAS_QUENTES)[number];

/**
 * O nome quente ↔ a tabela do drizzle, escrito uma vez.
 *
 * É a ponte que faz as duas derivações deste arquivo existirem — a das colunas
 * de estado (S-C33) e a dos nomes no banco (S-C55) —, e ela é EXPLÍCITA de
 * propósito: um `schema[nome]` indexado por string passaria por cima do
 * compilador e um erro de digitação viraria "tabela sem coluna de estado", que
 * é a régua aprovando em silêncio. Tabela quente nova custa uma linha aqui e
 * uma em `PAIS` — e nenhuma em `COLUNAS_DE_ESTADO` nem em `NOMES_NO_BANCO`, que
 * é o que as duas sobras compraram.
 *
 * **E a ponte é PREGADA desde a S-C55**, porque ela é o que sobrou da mão:
 * escrever `contratosTable: schema.orcamentosTable` aqui TYPECHECKA — as duas
 * são `PgTable` — e faria as colunas de estado e o nome no banco de `contratos`
 * serem os de `orcamentos`, com a sonda verde medindo a tabela errada. A
 * conferência é a chave do mapa contra o nome derivado
 * (`varredura-portas-sob-tranca.test.ts`, § "a ponte aponta para a tabela
 * certa").
 */
const TABELAS_DO_SCHEMA: Record<TabelaQuente, PgTable> = {
  bloqueioVestidosTable: schema.bloqueioVestidosTable,
  reservasTable: schema.reservasTable,
  contratosTable: schema.contratosTable,
  orcamentosTable: schema.orcamentosTable,
  parcelasTable: schema.parcelasTable,
  comissaoFechamentosTable: schema.comissaoFechamentosTable,
  contasPagarTable: schema.contasPagarTable,
};

/**
 * Os nomes de tabela, como o Postgres os conhece — para a peneira de SQL cru.
 *
 * ## S-C55 — o nome sai do DRIZZLE, e não da mão de quem leu
 *
 * Até 2026-08-13 esta constante era um mapa escrito à mão, e é ele que a
 * peneira de `sqlCruEscrevendoEmTabelaQuente` monta em `RegExp`. **Um nome
 * errado ali faz a regex nunca casar e a peneira devolver `[]`** — verde por
 * não ter olhado, que é o pior resultado possível numa sonda e é exatamente o
 * que a abertura deste arquivo diz não querer ser. Os cinco batiam, e nada
 * obrigava: `bloqueio_vestidos` escrito `bloqueios_vestidos` apagaria a sonda
 * inteira daquela tabela sem uma linha vermelha em lugar nenhum.
 *
 * É a mesma classe da S-C33 — lista curada que o schema já sabe —, e o drizzle
 * responde direto: `getTableConfig(t).name` é o nome que o `CREATE TABLE`
 * usou. Tabela renomeada no schema renomeia a peneira no mesmo commit.
 *
 * A derivação tira o erro de digitação e **não prova que a peneira enxerga** —
 * hoje ela dá zero sobre o repositório, e zero é o que ela daria estando cega.
 * Quem prova é o autoteste com template sintético
 * (`varredura-portas-sob-tranca.test.ts`, § "a peneira de SQL cru enxerga").
 */
export const NOMES_NO_BANCO: Record<TabelaQuente, string> = Object.fromEntries(
  TABELAS_QUENTES.map((t) => [t, getTableConfig(TABELAS_DO_SCHEMA[t]).name]),
) as Record<TabelaQuente, string>;

/**
 * A cadeia de trancas, escrita uma vez.
 *
 * O E158 fixou a ordem do módulo de contratos em `contratos.ts:643`
 * (`lead → contrato → parcelas → bloqueios`) e o E159 a estendeu em
 * `reservas.ts:65` (`linha-pai da rota → contrato → parcelas → bloqueios
 * ORDENADOS → vestidos ORDENADOS`). Sem ordem comum, duas portas se matam em
 * deadlock em vez de fazer fila. **A ordem é conferida desde o E180** —
 * `DEGRAUS_DA_ORDEM`, abaixo.
 *
 * Para cada tabela quente, quais linhas servem de tranca. Trancar a linha-PAI é
 * legítimo e às vezes é a única opção: o `POST /contratos` tranca o LEAD porque
 * o invariante que ele defende ("um lead, um contrato ativo") fala do lead, e a
 * linha do lead existe mesmo quando não há contrato nenhum para trancar
 * (`contratos.ts:611-613`).
 */
export const PAIS: Record<TabelaQuente, readonly string[]> = {
  contratosTable: ["contratosTable", "leadsTable"],
  reservasTable: ["reservasTable", "leadsTable"],
  orcamentosTable: ["orcamentosTable", "leadsTable"],
  bloqueioVestidosTable: [
    "bloqueioVestidosTable",
    "vestidosTable",
    "reservasTable",
    "contratosTable",
    "leadsTable",
  ],
  parcelasTable: ["parcelasTable", "contratosTable", "leadsTable"],
  /**
   * E238 (S-O108) — as duas tabelas do fechamento de comissão. O parentesco
   * é o das FKs que o schema declara: `comissao_fechamentos.conta_pagar_id`
   * aponta para a conta (o reabrir tranca a CONTA antes de apagar o
   * fechamento, S-M22); `contas_pagar.origem_comissao_fechamento_id` e
   * `contas_pagar.origem_contrato_id` apontam para o fechamento e para o
   * contrato (a conta da comissão nasce sob a tranca dos fechamentos, E238; a
   * conta da DEVOLUÇÃO nasce sob a tranca do contrato, E217).
   */
  comissaoFechamentosTable: ["comissaoFechamentosTable", "contasPagarTable"],
  contasPagarTable: ["contasPagarTable", "comissaoFechamentosTable", "contratosTable"],
};

/**
 * E238 (S-O108) — **a tabela cujo estado é EXISTIR.**
 *
 * `comissao_fechamentos` não tem `status` nem fato datado anulável: a linha
 * existe enquanto a competência está fechada e some quando é reaberta. O
 * critério de `ehColunaDeEstado` devolve vazio para ela — e vazio, na régua
 * das colunas, era o sinal de sonda cega. Aqui não é: é a forma do estado.
 *
 * O que isso muda na leitura das portas: o `DELETE … RETURNING` sobre uma
 * tabela destas É o CAS — o `where` repete a condição lida (a linha existe) e
 * o `returning()` vazio é "mudou no meio", que é exatamente a frase do E158
 * para o CAS de `status`. É a guarda que o reabrir do fechamento usa desde a
 * S-O79 (`comissao.ts`, *"o `returning()` é quem responde"*).
 */
export const ESTADO_E_A_EXISTENCIA: ReadonlySet<TabelaQuente> = new Set<TabelaQuente>(["comissaoFechamentosTable"]);

/**
 * E238 (S-O110) — **as FILHAS de cada tabela quente, derivadas das FKs do schema.**
 *
 * A pergunta que uma porta relê nem sempre é sobre a linha alvo ou o pai dela:
 * o `DELETE /reservas/:id` (`reservas.ts`, S-M22/R2-V8) tranca a reserva e
 * reconta a HISTÓRIA — os bloqueios da reserva, e as avarias, provas e
 * contratos presos a eles. É uma releitura da guarda, e ela lê para BAIXO. A
 * peneira da releitura aceita, então, a tabela alvo, uma linha-pai declarada
 * em `PAIS` ou uma filha — e filha é o que o schema diz: tabela com FK que
 * aponta para a quente. Derivada, não escrita à mão (é a S-C33 de novo).
 */
function filhasDe(quente: TabelaQuente): string[] {
  const alvo = getTableConfig(TABELAS_DO_SCHEMA[quente]).name;
  const filhas: string[] = [];
  for (const [nome, valor] of Object.entries(schema as Record<string, unknown>)) {
    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(valor as PgTable);
    } catch {
      continue; // não é tabela — o pacote exporta enums, tipos e relações
    }
    if (nome === quente) continue;
    const aponta = config.foreignKeys.some((fk) => getTableConfig(fk.reference().foreignTable).name === alvo);
    if (aponta && !filhas.includes(nome)) filhas.push(nome);
  }
  return filhas;
}
const filhasPorTabela: Partial<Record<TabelaQuente, readonly string[]>> = {};
for (const t of TABELAS_QUENTES) filhasPorTabela[t] = filhasDe(t);
export const FILHAS = filhasPorTabela as Record<TabelaQuente, readonly string[]>;

/** As tabelas cuja leitura, depois da tranca, conta como releitura da guarda do alvo. */
export function tabelasDaGuarda(tabela: TabelaQuente): string[] {
  return [...new Set([...PAIS[tabela], ...FILHAS[tabela]])];
}

/**
 * As colunas que decidem ESTADO em cada tabela — as que uma corrida muda embaixo
 * de quem já leu. São elas que a releitura tem de trazer e que o CAS tem de
 * repetir no `where`.
 *
 * ## S-C33 — a lista sai do SCHEMA, e não da mão de quem leu
 *
 * Até 2026-08-13 esta constante era uma lista escrita à mão, e **coluna de
 * estado nova nascia invisível para a detecção de CAS**. Isso custou dois
 * épicos seguidos, e nos dois a régua acusou código CERTO — que é a direção
 * cara, porque manda consertar o que não está quebrado:
 *
 * - **E212** — `contratos.atrasoParcelaId` fora da lista, e a varredura leu a
 *   porta como ABERTA enquanto o `where` da escrita repetia exatamente a
 *   condição lida.
 * - **E213** — `parcelas.moraPerdoadaEm` fora da lista, e as DUAS portas do
 *   perdão apareceram abertas estando sob CAS de verdade: `contratos.ts` contava
 *   **3** portas sem disciplina onde há **1**.
 *
 * Os dois consertos foram POR COLUNA, o que não impede a terceira vez. É a
 * mesma classe que a conferência de 2026-08-05 achou na S30 (*"trava a lista,
 * não a contagem"*), agora do lado das colunas.
 *
 * ## O CRITÉRIO, declarado
 *
 * Uma coluna de estado responde **"em que ponto isto está?"** ou **"isto já
 * aconteceu?"**. No schema deste repositório ela tem exatamente duas grafias, e
 * as duas são legíveis pelo drizzle sem adivinhação:
 *
 * 1. **`status`** — a coluna `pgEnum` que nomeia o estágio. Cinco tabelas
 *    quentes, quatro têm uma (`bloqueio_vestidos` não tem: quem cancela um
 *    bloqueio data o cancelamento).
 * 2. **O FATO DATADO** — `timestamp` **ANULÁVEL** cujo nome diz que o ato
 *    aconteceu. Este repositório soletra isso de duas maneiras, e as duas
 *    contam: sufixo **`Em`** (`moraPerdoadaEm`, `canceladoEm`) e sufixo
 *    **`DataReal`** (`bloqueio_vestidos.retiradaDataReal`, `devolucaoDataReal`,
 *    `provaDataReal` — o "real" existe justamente para separar o que ACONTECEU
 *    do que estava previsto, e é sobre `devolucaoDataReal` que a cláusula 16ª
 *    decide se a peça voltou). A **anulabilidade** é o que faz o sufixo
 *    significar alguma coisa: `contratos.fechadoEm` é `notNull` com default,
 *    nasce preenchida e nunca responde "já?"; `parcelas.moraPerdoadaEm` nasce
 *    vazia e a resposta é a presença. `createdAt`/`updatedAt` ficam de fora
 *    pelas duas peneiras — sufixo `At` e `notNull`. E o **PRAZO** fica de fora
 *    por exclusão dita (S-C56): `publicoExpiraEm` termina em `Em` e responde
 *    *"até quando"*, não *"já aconteceu"* — os sufixos `ExpiraEm`/`VenceEm`
 *    saem antes da grafia do fato, com o motivo no código.
 *
 * O critério é conservador de propósito na direção que importa. Coluna de
 * estado FORA da lista faz a varredura acusar código certo (E212, E213);
 * coluna que não é estado DENTRO da lista faz a varredura **aprovar** porta sem
 * disciplina, que é a régua que autoriza. Por isso as grafias são estreitas e o
 * que elas não pegam entra à mão, uma exceção por vez, com o motivo escrito.
 *
 * ## O que a grafia NÃO pega, e por que a exceção é melhor que abrir o critério
 *
 * `contratos.atrasoParcelaId` é estado — responde *"este atraso já virou
 * parcela?"* — e está escrito como **vínculo**, não como data. Abrir o critério
 * para "FK anulável" pegaria junto `contratos.orcamentoId`,
 * `contratos.bloqueioVestidoId`, `bloqueio_vestidos.leadId`,
 * `bloqueio_vestidos.reservaId` e `orcamentos.atendimentoId` — **cinco colunas
 * de PARENTESCO**, que dizem de quem a linha é e não em que ponto ela está.
 * Cinco falsos por um verdadeiro, na direção que autoriza: a exceção nomeada
 * custa menos e diz mais.
 */
const ESTADO_QUE_A_GRAFIA_NAO_PEGA: Partial<Record<TabelaQuente, readonly string[]>> = {
  // E212, cláusula 16ª — o CAS sobre ela é a guarda inteira do duplo clique.
  // Removê-la é medível: `reservas.ts` vai de 4 para 5 e a dívida de 13 para 14.
  contratosTable: ["atrasoParcelaId"],
};

/** Uma coluna do drizzle, no pouco que este critério precisa saber dela. */
export type ColunaDoSchema = { columnType: string; notNull: boolean };

/**
 * O critério, em código — as duas grafias e nada mais.
 *
 * Exportado separado de `colunasDeEstadoDe` porque é ele que o autoteste da
 * varredura prega com colunas sintéticas: o critério nasce VERDE sobre o schema
 * de hoje, e régua que nunca se viu vermelha é decoração. Aqui o vermelho fica
 * gravado — a coluna que ele TEM de recusar está escrita ao lado da que ele tem
 * de aceitar.
 */
export function ehColunaDeEstado(chave: string, coluna: ColunaDoSchema): boolean {
  if (chave === "status" && coluna.columnType === "PgEnumColumn") return true;
  // S-C56 — o PRAZO não é o FATO. `orcamentos.publicoExpiraEm` termina em `Em`
  // e responde "até quando", não "já aconteceu": a linha nasce com a data no
  // futuro, e a presença dela não é o ato ter acontecido. Incluí-la AFROUXA na
  // direção que autoriza — uma escrita que repetisse `publico_expira_em` no
  // `where` sem ter lido o valor seria promovida a CAS de graça. As duas
  // grafias de prazo do vocabulário deste schema saem do critério.
  if (/(ExpiraEm|VenceEm)$/.test(chave)) return false;
  return /(Em|DataReal)$/.test(chave) && coluna.columnType === "PgTimestamp" && !coluna.notNull;
}

/** As colunas que a grafia recusa e que a exceção nomeada devolve. */
export function excecoesDe(tabela: TabelaQuente): readonly string[] {
  return ESTADO_QUE_A_GRAFIA_NAO_PEGA[tabela] ?? [];
}

/**
 * As colunas de estado de UMA tabela, pelo critério acima. Exportada porque é
 * o critério que a varredura prega — não o resultado dele.
 */
export function colunasDeEstadoDe(tabela: TabelaQuente): string[] {
  const colunas = getTableColumns(TABELAS_DO_SCHEMA[tabela]);
  const derivadas = Object.entries(colunas)
    .filter(([chave, coluna]) => ehColunaDeEstado(chave, coluna))
    .map(([chave]) => chave);
  return [...derivadas, ...excecoesDe(tabela)];
}

const derivadasPorTabela: Partial<Record<TabelaQuente, readonly string[]>> = {};
for (const t of TABELAS_QUENTES) derivadasPorTabela[t] = colunasDeEstadoDe(t);
export const COLUNAS_DE_ESTADO = derivadasPorTabela as Record<TabelaQuente, readonly string[]>;

/**
 * A ORDEM em que as trancas se tomam, em degraus — S-O33, o ponto cego 4 do E171.
 *
 * As duas cadeias que o repositório já declarava em prosa dizem a MESMA coisa,
 * e é ela que está aqui:
 *
 * - `contratos.ts:643` (E158): `lead → contrato → parcelas → bloqueios`
 * - `reservas.ts:63` (E159): `linha-pai da rota (lead · reserva · avaria) →
 *   contrato → parcelas → bloqueios ORDENADOS → vestidos ORDENADOS`
 *
 * Ordem não é preferência: é o que impede DEADLOCK. Duas transações que tomam
 * as mesmas duas linhas em ordens contrárias — uma segurando o lead e esperando
 * o bloqueio, outra segurando o bloqueio e esperando o lead — se matam em ciclo
 * em vez de fazerem fila, e o Postgres derruba uma delas com 40P01. A varredura
 * do E171 contava a tranca e **não a ordem**: uma porta nova invertida passava
 * verde e travava a produção.
 *
 * Tabelas do MESMO degrau são intercambiáveis: `leads`, `reservas`, `avarias` e
 * `contas_pagar` são as quatro "linha-pai da rota", e nenhuma rota tranca duas
 * delas.
 *
 * `orcamentos` entra entre o lead e o contrato porque é onde a jornada o põe —
 * e a colocação é livre de consequência hoje, por medida: das 28 transações que
 * trancam, **nenhuma tranca `orcamentos` junto de outra tabela**. Ela está aqui
 * para que a primeira que o fizer seja conferida, não para reconstituir uma
 * ordem que alguém já tenha escolhido.
 *
 * **S-O60/E186 — `contas_pagar` entrou no primeiro degrau, e entrou porque a
 * S-O59 a obrigou.** Enquanto a conta da ordem não seguia o executor para
 * dentro de `trancarContratos`, as duas transações que trancam `contas_pagar`
 * (`comissao.ts:1046`, `financeiro.ts:435`) pareciam trancá-la SOZINHAS. Com o
 * helper visível, a de `comissao.ts` passa a tomar `contas_pagar` e depois
 * `contratos` na mesma transação — a ordem entre as duas existe desde o E176 e
 * ninguém a tinha declarado.
 *
 * Ela fica no degrau da **linha-pai da rota** porque é ali que ela é tomada nas
 * DUAS transações (o `DELETE /comissao/fechamentos/:id` reabre o fechamento
 * pela conta; o `DELETE /financeiro/contas/:id` apaga a própria conta), o mesmo
 * papel que `leads`, `reservas` e `avarias` já tinham. A régua daquele degrau
 * continua valendo, e foi remedida: **nenhuma rota tranca duas linhas dele.**
 *
 * **E os EIXOS DA AGENDA entraram junto, e a S-O60 não os previa.** Seguir o
 * executor não achou uma tabela sem degrau: achou TRÊS. `trancarEixos`
 * (`agenda.ts:98`, E161) tranca `cabines` e depois `usuarios`, e a transação que
 * conclui a prova segue para `bloqueio_vestidos` e `vestidos` — quatro tabelas
 * numa cadeia só, duas delas sem degrau declarado. **A ordem já estava escrita
 * em prosa no arquivo** (*"a ordem é cabine → vendedora, sempre, nas duas
 * portas"*, `agenda.ts:86`); o que faltava era ela ser executável. Elas ganham
 * degrau PRÓPRIO cada uma, e não um degrau compartilhado, justamente porque a
 * mesma transação toma as duas: tabelas do mesmo degrau são as que nenhuma rota
 * pede juntas.
 */
export const DEGRAUS_DA_ORDEM: readonly (readonly string[])[] = [
  ["cabinesTable"],
  ["usuariosTable"],
  ["leadsTable", "reservasTable", "avariasTable", "contasPagarTable"],
  /**
   * E238 (S-O106/S-O107) — o fechamento de comissão ganhou tranca própria
   * (`trancarFechamentosDasVendedoras`), tomada DEPOIS da conta a pagar e ANTES
   * do contrato: o reabrir toma a conta (S-M22), apaga o fechamento (o
   * `DELETE` segura a linha) e só então tranca contratos; fechar e baixar à mão
   * tomam os fechamentos e depois os contratos. Degrau próprio, e não o da
   * linha-pai da rota, porque o reabrir toma a conta E o fechamento na mesma
   * transação — tabelas do mesmo degrau são as que nenhuma rota pede juntas.
   */
  ["comissaoFechamentosTable"],
  ["orcamentosTable"],
  ["contratosTable"],
  ["parcelasTable"],
  ["bloqueioVestidosTable"],
  ["vestidosTable"],
];

/** O degrau de uma tabela na cadeia, ou `null` quando ela não está declarada. */
export function degrauDaTranca(tabela: string): number | null {
  const i = DEGRAUS_DA_ORDEM.findIndex((d) => d.includes(tabela));
  return i === -1 ? null : i;
}

/** Os identificadores por onde uma escrita sai para o banco. */
const EXECUTORES = new Set(["db", "tx", "executor", "exec"]);
const VERBOS = new Set(["insert", "update", "delete"]);

/**
 * ## S-O59/E186 — a conta SEGUE o executor para dentro do helper
 *
 * O ponto cego 2 do E171 dizia que a varredura "não entra no helper", e a S-O59
 * mediu o preço disso numa função só: `trancarContratos` (`comissao.ts:224`)
 * recebe o `tx` da transação, tranca contratos ORDENADO por id, e **nenhuma das
 * contas o via** — nem a da ordem, nem a do laço, nem a que decide a disciplina
 * das três portas que ele protege desde o E176. Eram **3 laços contados e 4
 * existentes**, e a dívida declarada de `comissao.ts` dizia 3 portas abertas
 * sobre 3 portas FECHADAS.
 *
 * O que fecha o buraco é seguir o argumento: quando uma chamada dentro da
 * transação passa o `tx` para uma função do MESMO módulo, o parâmetro que o
 * recebe vira o executor daquela função, e as trancas de lá contam como se
 * estivessem escritas no ponto da chamada.
 *
 * **O que ficava de fora até o E238, e a S-O82 nomeava:** a resolução era de
 * MÓDULO — helper importado de outro arquivo seguia invisível, tanto para a
 * conta das trancas quanto para a da releitura. Hoje são zero helpers
 * importados que tranquem com o `tx` do chamador (os dois de `lib/` que tomam
 * `FOR UPDATE` abrem a PRÓPRIA transação), e o primeiro que nascesse passaria
 * verde. Desde o E238 o `import` relativo (`../lib/x`) e o de pacote do
 * repositório (`@workspace/x` → `lib/x/src`) são RESOLVIDOS: o arquivo
 * importado é parseado, a função exportada é encontrada — inclusive atrás de
 * `export * from` / `export { x } from` —, e as trancas e as perguntas de lá
 * contam como se estivessem no ponto da chamada. O que não se resolve
 * (pacote de fora do repositório, `import * as ns`) continua sendo caso a
 * decidir, não silêncio: a chamada que passa o `tx` para o que a varredura
 * não alcança fica registrada em `delegacoesInvisiveis` da porta, e a
 * varredura trava a contagem em zero.
 */
type Modulo = {
  sf: ts.SourceFile;
  /** As funções declaradas no topo do módulo, por nome. */
  locais: Map<string, FuncaoLocal>;
  /** Os nomes importados: `nome local → { especificador, nome original }`. */
  importados: Map<string, { spec: string; original: string }>;
  /** Os re-exports (`export * from "x"`, `export { a as b } from "x"`). */
  reexports: { spec: string; nomes: Map<string, string> | null }[];
};
type FuncaoLocal = { params: string[]; corpo: ts.Node; modulo: Modulo };

/**
 * Dois caches, e a diferença é deliberada: o módulo de um `SourceFile` já
 * parseado é guardado pelo OBJETO (os autotestes parseiam dezenas de textos
 * diferentes com o mesmo `fileName` sintético — guardar por nome faria o
 * segundo texto herdar as funções do primeiro); o módulo alcançado por IMPORT
 * é guardado pelo caminho, que é o que o identifica.
 */
const cacheModulosPorFonte = new WeakMap<ts.SourceFile, Modulo>();
const cacheModulosPorCaminho = new Map<string, Modulo | null>();

/** O módulo de um `SourceFile` — as funções, os imports e os re-exports dele. */
function moduloDe(sf: ts.SourceFile): Modulo {
  const pronto = cacheModulosPorFonte.get(sf);
  if (pronto) return pronto;
  const modulo: Modulo = { sf, locais: new Map(), importados: new Map(), reexports: [] };
  const guardar = (nome: string, fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): void => {
    if (fn.body) modulo.locais.set(nome, { params: fn.parameters.map((p) => p.name.getText(sf)), corpo: fn.body, modulo });
  };
  // As funções são colhidas em QUALQUER profundidade — o `contarHistoria` do
  // `DELETE /reservas/:id` é uma const dentro do handler, e é ele que relê a
  // guarda. Nome repetido em escopos diferentes: o primeiro no arquivo vence.
  const colher = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && !modulo.locais.has(n.name.text)) guardar(n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && !modulo.locais.has(n.name.text)) {
      guardar(n.name.text, n.initializer);
    }
    n.forEachChild(colher);
  };
  colher(sf);
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          modulo.importados.set(el.name.text, { spec: stmt.moduleSpecifier.text, original: el.propertyName?.text ?? el.name.text });
        }
      }
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const nomes = stmt.exportClause && ts.isNamedExports(stmt.exportClause)
        ? new Map(stmt.exportClause.elements.map((el) => [el.name.text, el.propertyName?.text ?? el.name.text]))
        : null;
      modulo.reexports.push({ spec: stmt.moduleSpecifier.text, nomes });
    }
  }
  cacheModulosPorFonte.set(sf, modulo);
  return modulo;
}

/**
 * Resolve um especificador de import para o arquivo do repositório, ou `null`
 * quando ele aponta para fora (pacote de terceiros, `node:*`).
 *
 * `fileName` dos módulos varridos é RELATIVO à raiz do repositório
 * (`artifacts/api-server/src/routes/comissao.ts`); os módulos alcançados por
 * import ganham o mesmo formato, para que o achado seja legível.
 */
function resolverEspecificador(deArquivo: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith(".")) {
    base = join(dirname(deArquivo), spec);
  } else if (spec.startsWith("@workspace/")) {
    const [pacote, ...resto] = spec.slice("@workspace/".length).split("/");
    base = join("lib", pacote!, "src", ...(resto.length > 0 ? resto : ["index"]));
  } else {
    return null;
  }
  for (const candidato of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(join(RAIZ, candidato))) return candidato;
  }
  return null;
}

/** O módulo atrás de um especificador, parseado uma vez — `null` quando não se resolve. */
function moduloImportado(deArquivo: string, spec: string): Modulo | null {
  const rel = resolverEspecificador(deArquivo, spec);
  if (!rel) return null;
  if (cacheModulosPorCaminho.has(rel)) return cacheModulosPorCaminho.get(rel)!;
  const sf = ts.createSourceFile(rel, readFileSync(join(RAIZ, rel), "utf8"), ts.ScriptTarget.Latest, true);
  const modulo = moduloDe(sf);
  cacheModulosPorCaminho.set(rel, modulo);
  return modulo;
}

/**
 * A função que um nome alcança de dentro de um módulo: declarada nele, ou
 * importada — seguindo re-exports até três degraus. `undefined` quando o nome
 * não é função visível (ou o import não se resolve dentro do repositório).
 */
function funcaoAlcancavel(modulo: Modulo, nome: string, degraus = 3): FuncaoLocal | undefined {
  const local = modulo.locais.get(nome);
  if (local) return local;
  const imp = modulo.importados.get(nome);
  if (!imp) return undefined;
  const alvo = moduloImportado(modulo.sf.fileName, imp.spec);
  return alvo ? exportadaDe(alvo, imp.original, degraus) : undefined;
}

function exportadaDe(modulo: Modulo, nome: string, degraus: number): FuncaoLocal | undefined {
  const local = modulo.locais.get(nome);
  if (local) return local;
  if (degraus <= 0) return undefined;
  for (const re of modulo.reexports) {
    const original = re.nomes === null ? nome : re.nomes.get(nome);
    if (!original) continue;
    const alvo = moduloImportado(modulo.sf.fileName, re.spec);
    const fn = alvo ? exportadaDe(alvo, original, degraus - 1) : undefined;
    if (fn) return fn;
  }
  return undefined;
}

/** A chamada passa o `tx` para o que a varredura não alcança — o nome, para o achado. */
function chamadaInvisivel(modulo: Modulo, chamada: ts.CallExpression): string | null {
  const alvo = chamada.expression;
  if (ts.isIdentifier(alvo)) {
    if (funcaoAlcancavel(modulo, alvo.text)) return null;
    // Nome que não é import nem função local — método de objeto, callback,
    // parâmetro: a varredura não tem como segui-lo.
    return alvo.text;
  }
  // `ns.fn(tx)`, `obj.metodo(tx)` — fora do que a resolução por nome alcança.
  return alvo.getText(modulo.sf);
}

/** Uma tranca vista dentro de um corpo, com a posição que a ORDENA na transação. */
type TrancaBruta = {
  tabela: string;
  linha: number;
  laco: string | null;
  lacoOrdenado: boolean;
  /** A posição que decide a ordem: a da tranca, ou a da CHAMADA que a alcança. */
  posicao: number;
  /** O nome do helper por onde ela foi alcançada, quando não é direta. */
  viaHelper: string | null;
};

/** A expressão do laço que envolve a tranca, como texto — `null` sem laço. */
function textoDoLaco(sf: ts.SourceFile, chamada: ts.Node, corpo: ts.Node): string | null {
  const laco = lacoQueEnvolve(chamada, corpo);
  if (!laco) return null;
  return ts.isForOfStatement(laco) ? laco.expression.getText(sf) : laco.getText(sf).split("\n")[0]!.slice(0, 60);
}

/**
 * As trancas de um corpo, seguindo o executor para dentro das funções que o
 * módulo alcança — as dele e, desde o E238 (S-O82), as importadas.
 *
 * `visitados` corta a recursão de uma função que chame a si mesma passando o
 * executor adiante — não há nenhuma hoje, e uma varredura que trava é pior que
 * uma que não vê.
 */
function trancasNoCorpo(
  modulo: Modulo,
  corpo: ts.Node,
  executor: string,
  visitados: ReadonlySet<string> = new Set(),
): TrancaBruta[] {
  const sf = modulo.sf;
  const out: TrancaBruta[] = [];

  for (const chamada of chamadasDe(corpo, "for")) {
    if (raizDoReceptor((chamada.expression as ts.PropertyAccessExpression).expression) !== executor) continue;
    const texto = textoDoLaco(sf, chamada, corpo);
    out.push({
      tabela: tabelaDoFrom(cadeiaCompleta(chamada)) ?? "?",
      linha: sf.getLineAndCharacterOfPosition(chamada.getStart(sf)).line + 1,
      laco: texto,
      lacoOrdenado: texto !== null && /\.sort\s*\(/.test(texto),
      posicao: chamada.getStart(sf),
      viaHelper: null,
    });
  }

  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && !visitados.has(n.expression.text)) {
      const fn = funcaoAlcancavel(modulo, n.expression.text);
      if (fn) {
        const i = n.arguments.findIndex((a) => ts.isIdentifier(a) && a.text === executor);
        const param = i === -1 ? undefined : fn.params[i];
        if (param) {
          const nome = fn.modulo === modulo ? n.expression.text : `${n.expression.text} (${fn.modulo.sf.fileName})`;
          for (const t of trancasNoCorpo(fn.modulo, fn.corpo, param, new Set([...visitados, n.expression.text]))) {
            out.push({ ...t, posicao: n.getStart(sf), viaHelper: t.viaHelper ?? nome });
          }
        }
      }
    }
    n.forEachChild(v);
  };
  v(corpo);

  return out.sort((a, b) => a.posicao - b.posicao);
}

/**
 * ## S-O110/E238 — a releitura é reconhecida pelo que PERGUNTA, não pela forma
 *
 * Até o E238 a regra 3c aceitava como releitura *qualquer* chamada que
 * recebesse o `tx` depois da tranca. `relerEstornosSobATranca` cumpre o que o
 * nome diz — e um helper que recebesse o `tx` para ESCREVER (o
 * `registrarAuditoria` está em toda transação desta casa) passava pela mesma
 * porta. O E186 já tinha recortado o caso oposto (`chamadasQueSoTrancam`);
 * esta é a peneira simétrica: a chamada só conta como releitura se o corpo do
 * helper — seguindo as funções que ele chama, dentro do módulo dele e nos que
 * ele importa — tiver um `select` (ou `query.<tabela>`) da tabela ALVO ou de
 * uma linha-pai declarada em `PAIS`, por um executor que não seja o `db` do
 * pool. Devolve a tabela perguntada, para o achado dizer o quê.
 */
function tabelaPerguntadaPor(
  fn: FuncaoLocal,
  tabelas: readonly string[],
  visitados: ReadonlySet<FuncaoLocal> = new Set(),
): string | null {
  const sf = fn.modulo.sf;
  const apelidos = apelidosDasQuentes(sf);
  const canonico = (nome: string): string => apelidos.get(nome) ?? nome;
  let achada: string | null = null;
  const v = (n: ts.Node): void => {
    if (achada) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const nome = n.expression.name.text;
      if (nome === "select" && raizDoReceptor(n.expression.expression) !== "db") {
        const de = tabelaDoFrom(cadeiaCompleta(n));
        if (de && tabelas.includes(canonico(de))) achada = canonico(de);
      }
      // `tx.query.contratosTable.findFirst(...)` — a leitura relacional do drizzle.
      if ((nome === "findFirst" || nome === "findMany") && ts.isPropertyAccessExpression(n.expression.expression)) {
        const tabela = n.expression.expression.name.text;
        const query = n.expression.expression.expression;
        if (
          ts.isPropertyAccessExpression(query) &&
          query.name.text === "query" &&
          raizDoReceptor(query) !== "db" &&
          tabelas.includes(canonico(tabela))
        ) {
          achada = canonico(tabela);
        }
      }
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const outra = funcaoAlcancavel(fn.modulo, n.expression.text);
      if (outra && !visitados.has(outra)) {
        const t = tabelaPerguntadaPor(outra, tabelas, new Set([...visitados, fn]));
        if (t) achada = t;
      }
    }
    if (!achada) n.forEachChild(v);
  };
  v(fn.corpo);
  return achada;
}

export type Disciplina = "TRANCA" | "CAS" | "ABERTA";

export type Porta = {
  arquivo: string;
  linha: number;
  verbo: string;
  tabela: TabelaQuente;
  /** O identificador que executa a escrita: `tx` (transação) ou `db` (pool). */
  executor: string;
  /** O parâmetro da `db.transaction(...)` que envolve a escrita, se houver. */
  txNome: string | null;
  /** As tabelas que a transação trancou com `FOR UPDATE` ANTES desta escrita. */
  trancadas: string[];
  /** Alguma das trancas cobre a tabela alvo ou uma linha-pai declarada. */
  trancaNoAlvoOuPai: boolean;
  /** Como a guarda foi relida depois da tranca — null quando não foi. */
  releituraDaGuarda: string | null;
  /** As colunas de estado que o `where` da própria escrita repete. */
  casNoWhere: string[];
  /**
   * E238 (S-O82/S-O110) — as chamadas que passam o `tx` adiante, depois da
   * tranca, para o que a varredura NÃO alcança (import que não se resolve
   * dentro do repositório, método de objeto). Nenhuma delas conta como
   * releitura; a varredura trava a contagem em zero.
   */
  delegacoesInvisiveis: string[];
  disciplina: Disciplina;
};

function raizDoReceptor(no: ts.Node): string {
  let n: ts.Node = no;
  while (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) n = n.expression;
  return ts.isIdentifier(n) ? n.text : `<${ts.SyntaxKind[n.kind]}>`;
}

/** Sobe do `.insert(T)` até o fim da cadeia `.set().where().returning()`. */
function cadeiaCompleta(no: ts.Node): ts.Node {
  let n: ts.Node = no;
  for (;;) {
    const p = n.parent;
    if (p && ts.isPropertyAccessExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isCallExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isAwaitExpression(p)) {
      n = p;
      continue;
    }
    return n;
  }
}

function chamadasDe(raiz: ts.Node, nome: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === nome) {
      out.push(n);
    }
    n.forEachChild(v);
  };
  v(raiz);
  return out;
}

/** O `.from(X)` da cadeia de um select — qual linha a tranca segura. */
function tabelaDoFrom(cadeia: ts.Node): string | null {
  const froms = chamadasDe(cadeia, "from");
  for (const f of froms) {
    const a = f.arguments[0];
    if (a && ts.isIdentifier(a)) return a.text;
  }
  return null;
}

/**
 * Os apelidos locais das tabelas quentes.
 *
 * `import { contratosTable as ct }` faria a busca por identificador perder a
 * porta inteira — é o buraco clássico de qualquer varredura por nome. Resolver
 * o apelido no `import` fecha o buraco de vez. O acesso por namespace
 * (`schema.contratosTable`) NÃO é resolvido aqui: ele cai na peneira de
 * `escritasComTabelaDinamica`, que a varredura exige em zero.
 */
function apelidosDasQuentes(sf: ts.SourceFile): Map<string, TabelaQuente> {
  const mapa = new Map<string, TabelaQuente>();
  for (const q of TABELAS_QUENTES) mapa.set(q, q);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const original = el.propertyName?.text;
      if (original && (TABELAS_QUENTES as readonly string[]).includes(original)) {
        mapa.set(el.name.text, original as TabelaQuente);
      }
    }
  }
  return mapa;
}

/**
 * Enumera as portas de UM texto-fonte. Exportada porque é ela que o autoteste
 * da varredura chama com fonte sintética: uma régua que nunca se viu vermelha é
 * decoração, e este é o vermelho que fica gravado.
 */
export function portasNoTexto(caminho: string, texto: string): Porta[] {
  return portasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function portasNaFonte(sf: ts.SourceFile): Porta[] {
  const apelidos = apelidosDasQuentes(sf);
  const modulo = moduloDe(sf);
  const portas: Porta[] = [];

  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
      const arg = no.arguments[0];
      const tabela = arg && ts.isIdentifier(arg) ? apelidos.get(arg.text) : undefined;
      if (tabela) {
        portas.push(analisar(modulo, no, no.expression.name.text, tabela));
      }
    }
    no.forEachChild(visitar);
  };
  visitar(sf);
  return portas;
}

function analisar(
  modulo: Modulo,
  escrita: ts.CallExpression,
  verbo: string,
  tabela: TabelaQuente,
): Porta {
  const sf = modulo.sf;
  const inicio = escrita.getStart(sf);
  const linha = sf.getLineAndCharacterOfPosition(inicio).line + 1;
  const executor = raizDoReceptor((escrita.expression as ts.PropertyAccessExpression).expression);

  // 1. Transação presente: existe um `.transaction(cb)` acima, e o executor da
  //    escrita é o parâmetro DAQUELE callback (não o `db` do pool por dentro).
  let txNome: string | null = null;
  let corpoTx: ts.Node | null = null;
  for (let p: ts.Node | undefined = escrita.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === "transaction") {
      const cb = p.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        txNome = cb.parameters[0]?.name.getText(sf) ?? null;
        corpoTx = cb.body;
      }
      break;
    }
  }

  const trancadas: string[] = [];
  let releituraDaGuarda: string | null = null;
  let posPrimeiraTranca = Number.POSITIVE_INFINITY;
  /**
   * S-O59/E186 — **uma chamada que TRANCA não é, por isso, uma chamada que
   * PERGUNTA.** A regra 3c abaixo aceita como releitura qualquer chamada que
   * receba o `tx` depois da tranca, e é uma aproximação boa: quem passa o
   * executor adiante costuma estar delegando a guarda. `trancarContratos` é o
   * contra-exemplo — ele só toma `FOR UPDATE`, com `select({ id })`, e não
   * relê estado nenhum. Enquanto a varredura não entrava no helper ela não
   * tinha como saber; agora tem, e as chamadas que ela já contou como TRANCA
   * saem da conta de releitura. Sem isto, seguir o executor promoveria a
   * `comissao.ts:1071` a TRANCA por um motivo falso.
   */
  const chamadasQueSoTrancam = new Set<number>();
  const delegacoesInvisiveis: string[] = [];

  if (corpoTx && txNome) {
    // 2. `FOR UPDATE` na linha certa: um `.for(...)` do MESMO executor, ANTES
    //    da escrita. A tabela vem do `.from(X)` da mesma cadeia.
    for (const chamada of chamadasDe(corpoTx, "for")) {
      if (chamada.getStart(sf) >= inicio) continue;
      if (raizDoReceptor((chamada.expression as ts.PropertyAccessExpression).expression) !== txNome) continue;
      const cadeia = cadeiaCompleta(chamada);
      const alvo = tabelaDoFrom(cadeia) ?? "?";
      trancadas.push(alvo);
      posPrimeiraTranca = Math.min(posPrimeiraTranca, chamada.getStart(sf));

      // 3a. A releitura mais comum é o PRÓPRIO select da tranca, quando ele
      //     projeta a coluna de estado (`{ status: ... }`) ou tudo (`select()`).
      //     É a forma de `reservas.ts:200-206` e `contratos.ts:1159-1163`.
      //     E238 (S-O110): vale também para a tranca numa LINHA-PAI quente —
      //     a conta da DEVOLUÇÃO (`contratos.ts`, E217) nasce sob a tranca do
      //     contrato que projeta `contratos.status`, e é esse status a guarda.
      const sel = chamadasDe(cadeia, "select")[0];
      if (sel && PAIS[tabela].includes(alvo) && (TABELAS_QUENTES as readonly string[]).includes(alvo)) {
        const proj = sel.arguments[0];
        const sufixo = alvo === tabela ? "" : " (linha-pai)";
        if (!proj) {
          releituraDaGuarda ??= `tranca com select() inteiro em ${alvo}${sufixo}`;
        } else if (ts.isObjectLiteralExpression(proj)) {
          const txt = proj.getText(sf);
          for (const col of COLUNAS_DE_ESTADO[alvo as TabelaQuente]) {
            if (txt.includes(`${alvo}.${col}`)) releituraDaGuarda ??= `tranca lê ${alvo}.${col}${sufixo}`;
          }
        }
      }
    }

    // 2b. S-O59/E186: e as trancas que o helper toma com o `tx` que recebeu. É
    //     a mesma tranca, escrita uma vez e chamada de três lugares — o que
    //     mudou é que a varredura passou a enxergá-la.
    for (const t of trancasNoCorpo(modulo, corpoTx, txNome)) {
      if (t.viaHelper === null || t.posicao >= inicio) continue;
      trancadas.push(t.tabela);
      posPrimeiraTranca = Math.min(posPrimeiraTranca, t.posicao);
      chamadasQueSoTrancam.add(t.posicao);
    }

    // 3b. Ou um select SEM `for` depois da tranca — E238 (S-O110): da tabela
    //     ALVO ou de uma linha-pai declarada, e não de qualquer tabela; 3c. ou
    //     um helper que recebe o executor da transação e faz a pergunta lá
    //     dentro (`verificarDisponibilidade({ executor: tx })`) — E238: e a
    //     pergunta é conferida no corpo dele (§ tabelaPerguntadaPor), inclusive
    //     quando o helper vem de outro arquivo (S-O82).
    const depoisDaTranca = (n: ts.Node): boolean => n.getStart(sf) > posPrimeiraTranca && n.getStart(sf) < inicio;
    const guarda = tabelasDaGuarda(tabela);
    const recebeOTx = (n: ts.CallExpression): boolean =>
      n.arguments.some(
        (a) =>
          (ts.isIdentifier(a) && a.text === txNome) ||
          (ts.isObjectLiteralExpression(a) &&
            a.properties.some(
              (pr) => ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.initializer) && pr.initializer.text === txNome,
            )),
      );
    const v = (n: ts.Node): void => {
      if (depoisDaTranca(n) && ts.isCallExpression(n)) {
        if (
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "select" &&
          raizDoReceptor(n.expression.expression) === txNome &&
          chamadasDe(cadeiaCompleta(n), "for").length === 0
        ) {
          const de = tabelaDoFrom(cadeiaCompleta(n));
          if (de && guarda.includes(de)) {
            releituraDaGuarda ??= `releitura em ${de}${FILHAS[tabela].includes(de) ? " (filha)" : ""}`;
          }
        }
        if (recebeOTx(n) && !chamadasQueSoTrancam.has(n.getStart(sf))) {
          const nome = n.expression.getText(sf);
          const fn = ts.isIdentifier(n.expression) ? funcaoAlcancavel(modulo, n.expression.text) : undefined;
          if (fn) {
            const pergunta = tabelaPerguntadaPor(fn, guarda);
            if (pergunta) {
              const onde = fn.modulo === modulo ? "" : ` em ${fn.modulo.sf.fileName}`;
              releituraDaGuarda ??= `guarda delegada a ${nome} (lê ${pergunta}${onde})`;
            }
          } else {
            const invisivel = chamadaInvisivel(modulo, n);
            if (invisivel && !delegacoesInvisiveis.includes(invisivel)) delegacoesInvisiveis.push(invisivel);
          }
        }
      }
      n.forEachChild(v);
    };
    v(corpoTx);
  }

  // 4. CAS: o `where` da própria escrita repete uma coluna de estado do alvo.
  const casNoWhere: string[] = [];
  for (const w of chamadasDe(cadeiaCompleta(escrita), "where")) {
    const txt = w.arguments.map((a) => a.getText(sf)).join(" ");
    for (const col of COLUNAS_DE_ESTADO[tabela]) {
      if (txt.includes(`${tabela}.${col}`) && !casNoWhere.includes(col)) casNoWhere.push(col);
    }
  }
  // E238 (S-O108): na tabela cujo estado é existir, o `DELETE … RETURNING` é o
  // CAS — a linha que a transação removeu é a resposta (§ ESTADO_E_A_EXISTENCIA).
  if (
    ESTADO_E_A_EXISTENCIA.has(tabela) &&
    verbo === "delete" &&
    chamadasDe(cadeiaCompleta(escrita), "returning").length > 0
  ) {
    casNoWhere.push("<a linha existir>");
  }

  const trancaNoAlvoOuPai = trancadas.some((t) => PAIS[tabela].includes(t));
  const naTransacao = txNome !== null && executor === txNome;
  const disciplina: Disciplina =
    naTransacao && trancaNoAlvoOuPai && (releituraDaGuarda !== null || casNoWhere.length > 0)
      ? "TRANCA"
      : casNoWhere.length > 0
        ? "CAS"
        : "ABERTA";

  return {
    arquivo: sf.fileName,
    linha,
    verbo,
    tabela,
    executor,
    txNome,
    trancadas,
    trancaNoAlvoOuPai,
    releituraDaGuarda,
    casNoWhere,
    delegacoesInvisiveis,
    disciplina,
  };
}

/** Os arquivos-fonte versionados que a varredura lê. */
export function arquivosVarridos(): string[] {
  return arquivosVersionados(RAIZ, PASTAS).filter(
    (rel) =>
      /\.tsx?$/.test(rel) &&
      !rel.includes(".test.") &&
      !rel.split("/").includes("__tests__") &&
      !rel.split("/").includes("generated"),
  );
}

/**
 * As fontes já parseadas, uma vez só.
 *
 * As três peneiras do arquivo percorrem a MESMA população; sem o cache, o
 * `git ls-files` roda três vezes e os 266 arquivos são lidos e parseados três
 * vezes. A varredura inteira leva ~1 s com o cache.
 */
let cacheDasFontes: ts.SourceFile[] | null = null;
function fontesVarridas(): ts.SourceFile[] {
  cacheDasFontes ??= arquivosVarridos().map((rel) =>
    ts.createSourceFile(rel, readFileSync(join(RAIZ, rel), "utf8"), ts.ScriptTarget.Latest, true),
  );
  return cacheDasFontes;
}

export function enumerarPortas(): Porta[] {
  const portas: Porta[] = [];
  for (const sf of fontesVarridas()) portas.push(...portasNaFonte(sf));
  return portas;
}

/**
 * As escritas cuja tabela NÃO é um identificador simples —
 * `db.update(schema.contratosTable)`, `tx.insert(tabelas[i])`.
 *
 * A enumeração acima não as classifica, e uma delas escondendo uma tabela
 * quente seria a porta que a régua não vê. Hoje são **zero**, e a varredura
 * cobra que continue zero: no dia em que a primeira nascer, ela vira decisão —
 * ou a escrita volta ao identificador simples, ou o enumerador aprende a
 * resolvê-la. O que não pode é passar em silêncio.
 *
 * **S-C76 — e zero é o que a peneira daria estando CEGA.** Desde o E171 esta
 * função devolvia `[]` sobre o repositório e a única régua era
 * `toEqual([])`: um refactor da AST que parasse de reconhecer
 * `db.update(tabelas[i])` deixaria a régua verde, e o dia em que a primeira
 * escrita dinâmica nascesse ela passaria despercebida. É a mesma classe da
 * S-C55, na peneira ao lado, e o conserto é o mesmo: a versão por texto
 * (`escritasComTabelaDinamicaNoTexto`) existe para o autoteste plantar a
 * escrita que a peneira TEM de achar, ao lado das que ela tem de ignorar.
 */
export function escritasComTabelaDinamica(): string[] {
  return fontesVarridas().flatMap(escritasDinamicasNaFonte);
}

/**
 * A peneira das escritas dinâmicas sobre UM texto-fonte — exportada pelo mesmo
 * motivo de `sqlCruNoTexto`: sonda que nunca se viu achando alguma coisa não se
 * distingue de sonda cega (S-C76).
 */
export function escritasComTabelaDinamicaNoTexto(caminho: string, texto: string): string[] {
  return escritasDinamicasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function escritasDinamicasNaFonte(sf: ts.SourceFile): string[] {
  const achados: string[] = [];
  const rel = sf.fileName;
  const v = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
      const arg = no.arguments[0];
      const receptor = raizDoReceptor(no.expression.expression);
      if (arg && !ts.isIdentifier(arg) && EXECUTORES.has(receptor)) {
        const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
        achados.push(`${rel}:${linha} ${receptor}.${no.expression.name.text}(${arg.getText(sf).slice(0, 50)})`);
      }
    }
    no.forEachChild(v);
  };
  v(sf);
  return achados;
}

/**
 * ## A ORDEM das trancas (S-O33)
 *
 * O E171 mediu a disciplina de cada porta e declarou, no ponto cego 4, que ela
 * conta a tranca e **não a ordem**. O que segue fecha essa metade — e fecha só
 * o que a AST pode saber, que é a razão de o E171 tê-la deixado de fora.
 *
 * A pergunta do deadlock tem duas metades, e elas se respondem com evidências
 * diferentes:
 *
 * 1. **ENTRE tabelas** — a sequência de `FOR UPDATE` de uma transação sobe os
 *    degraus de `DEGRAUS_DA_ORDEM` sem descer nenhum. A tabela de cada tranca
 *    sai do `.from(X)` da própria cadeia: isto a AST sabe, e sabe inteiro.
 * 2. **DENTRO da tabela** — os bloqueios e os vestidos vão ORDENADOS por id,
 *    porque duas transações que trancam b1 e b2 em ordens contrárias se matam
 *    igual, mesmo estando as duas no degrau certo. **Aqui a AST não sabe qual
 *    LINHA cada tranca segura** — o id é valor de tempo de execução —, e o que
 *    ela sabe é o laço: uma tranca dentro de um `for…of` percorre a coleção na
 *    ordem em que ela vem, então a coleção tem de estar ORDENADA na expressão
 *    do laço. É uma régua LÉXICA e está declarada como tal.
 */

/** Uma tranca tomada dentro de uma transação. */
export type Tranca = {
  arquivo: string;
  linha: number;
  /** A tabela do `.from(X)` da cadeia — `?` quando a cadeia não a declara. */
  tabela: string;
  /** O degrau dela em `DEGRAUS_DA_ORDEM`, ou `null` quando não está declarada. */
  degrau: number | null;
  /** A expressão do laço que envolve a tranca, quando há um. */
  laco: string | null;
  /** Com laço: a coleção percorrida está explicitamente ordenada. */
  lacoOrdenado: boolean;
  /**
   * S-O59 — o helper por onde a tranca foi alcançada, ou `null` quando ela está
   * escrita na própria transação. É o que separa "a varredura viu" de "a
   * varredura seguiu o executor".
   */
  viaHelper: string | null;
};

/** O `for`/`for…of`/`for…in` mais interno que envolve o nó, dentro do corpo dado. */
function lacoQueEnvolve(no: ts.Node, limite: ts.Node): ts.Node | null {
  for (let p: ts.Node | undefined = no.parent; p && p !== limite.parent; p = p.parent) {
    if (ts.isForOfStatement(p) || ts.isForStatement(p) || ts.isForInStatement(p)) return p;
  }
  return null;
}

/** As trancas de UM texto-fonte, agrupadas por transação. Exportada para o autoteste. */
export function trancasNoTexto(caminho: string, texto: string): Map<string, Tranca[]> {
  return trancasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function trancasNaFonte(sf: ts.SourceFile): Map<string, Tranca[]> {
  const mapa = new Map<string, Tranca[]>();
  const rel = sf.fileName;
  const modulo = moduloDe(sf);
  const v = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === "transaction"
    ) {
      const cb = no.arguments[0];
      const txNome =
        cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? (cb.parameters[0]?.name.getText(sf) ?? null) : null;
      if (cb && txNome) {
        const corpo = (cb as ts.ArrowFunction | ts.FunctionExpression).body;
        /**
         * A ORDEM é a da POSIÇÃO na transação, não a do número de linha: a
         * tranca alcançada por helper mora numa função declarada lá em cima
         * (`comissao.ts:229` para uma transação de `:1035`), e ordená-la por
         * linha a poria antes de trancas que ela sucede. `trancasNoCorpo` já
         * devolve ordenado pela posição da CHAMADA.
         */
        const trancas: Tranca[] = trancasNoCorpo(modulo, corpo, txNome).map((t) => ({
          arquivo: rel,
          linha: t.linha,
          tabela: t.tabela,
          degrau: degrauDaTranca(t.tabela),
          laco: t.laco,
          lacoOrdenado: t.lacoOrdenado,
          viaHelper: t.viaHelper,
        }));
        if (trancas.length > 0) {
          mapa.set(`${rel}:${sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1}`, trancas);
        }
      }
    }
    no.forEachChild(v);
  };
  v(sf);
  return mapa;
}

/**
 * Enumera as trancas de cada transação da população, em ORDEM DE POSIÇÃO.
 *
 * A chave do mapa é o `arquivo:linha` da chamada `.transaction(`, que é o que
 * identifica a transação para quem for ler o vermelho.
 */
export function trancasPorTransacao(): Map<string, Tranca[]> {
  const mapa = new Map<string, Tranca[]>();
  for (const sf of fontesVarridas()) {
    for (const [chave, trancas] of trancasNaFonte(sf)) mapa.set(chave, trancas);
  }
  return mapa;
}

/**
 * As trancas que DESCEM um degrau — a inversão que produz o deadlock.
 *
 * Só compara trancas de degrau declarado: o par com tabela fora de
 * `DEGRAUS_DA_ORDEM` sai pela peneira de `trancasSemDegrauDeclarado`, e uma
 * comparação inventada valeria menos que nenhuma.
 *
 * **O que ela não vê, e é o mesmo ponto cego 1 do E171:** a régua é LÉXICA. Duas
 * trancas em ramos EXCLUSIVOS de um `if/else` são lidas como sequência, e uma
 * tranca dentro de um `if` que não roda não é tomada. A leitura em ordem de
 * arquivo é a aproximação certa para o caso comum — o bloco linear de uma rota —
 * e erra para MAIS, nunca para menos: ela acusa ordem que talvez não aconteça,
 * jamais aprova inversão que aconteça.
 */
export function trancasForaDeOrdem(): string[] {
  const fora: string[] = [];
  for (const [transacao, trancas] of trancasPorTransacao()) {
    const comDegrau = trancas.filter((t) => t.degrau !== null);
    for (let i = 1; i < comDegrau.length; i += 1) {
      const antes = comDegrau[i - 1]!;
      const agora = comDegrau[i]!;
      if (agora.degrau! < antes.degrau!) {
        fora.push(
          `${agora.arquivo}:${agora.linha} tranca ${agora.tabela} (degrau ${agora.degrau}) DEPOIS de ` +
            `${antes.tabela} (degrau ${antes.degrau}), na transação de ${transacao}`,
        );
      }
    }
  }
  return fora;
}

/**
 * As trancas sobre tabela que a cadeia não declara.
 *
 * Não são erro: são DECISÃO adiada. Uma tabela sem degrau não pode ser ordenada
 * contra as outras, então a primeira transação que a trancar junto de uma tabela
 * da cadeia abre um ciclo que ninguém conferiu. A varredura trava a CONTAGEM
 * delas pelo mesmo motivo que trava a da dívida.
 */
export function trancasSemDegrauDeclarado(): string[] {
  const sem: string[] = [];
  for (const trancas of trancasPorTransacao().values()) {
    for (const t of trancas) {
      if (t.degrau === null) sem.push(`${t.arquivo}:${t.linha} tranca ${t.tabela}`);
    }
  }
  return sem;
}

/**
 * As trancas tomadas DENTRO de um laço sobre coleção que não está ordenada.
 *
 * É a metade "ORDENADOS por id" da cadeia. Duas transações que trancam os
 * mesmos dois bloqueios em ordens contrárias se matam em ciclo mesmo estando as
 * duas no degrau certo: o degrau ordena as TABELAS, o `.sort()` ordena as
 * LINHAS dentro de uma delas.
 *
 * **A régua é léxica e a limitação está declarada:** ela reconhece a ordenação
 * pelo `.sort(` na expressão do laço, que é a grafia das quatro que existem
 * (`contratos.ts:700`, `reservas.ts:253`, `:349`, `comissao.ts:229`). Uma
 * coleção que chegasse ordenada de um `ORDER BY` do SQL passaria por aqui como
 * não-ordenada; no dia em que a primeira nascer, a saída é ordenar no laço
 * também — custa uma chamada e dispensa quem lê de reconstituir a origem.
 */
export function trancasEmLacoNaoOrdenado(): string[] {
  const soltas: string[] = [];
  for (const trancas of trancasPorTransacao().values()) {
    for (const t of trancas) {
      if (t.laco !== null && !t.lacoOrdenado) soltas.push(`${t.arquivo}:${t.linha} tranca ${t.tabela} em \`${t.laco}\``);
    }
  }
  return soltas;
}

/**
 * SQL cru que escreve numa tabela quente.
 *
 * **Aqui a peneira é regex, e o motivo é que não existe AST para olhar:** o
 * conteúdo de uma template string `sql\`UPDATE contratos …\`` é texto para o
 * TypeScript — o parser entrega um `NoSubstitutionTemplateLiteral`, não uma
 * árvore de SQL. O que a AST dá, e é usado, é o recorte: só o texto de
 * templates com a tag `sql` entra na peneira, então um comentário ou uma string
 * de mensagem que cite "UPDATE contratos" não dispara.
 *
 * O que ela NÃO vê: SQL montado por concatenação (`sql.raw(alvo + " SET …")`) e
 * o nome da tabela vindo de variável. Hoje o repositório tem **zero** template
 * `sql` com verbo de escrita em qualquer tabela, quente ou fria.
 *
 * **E zero é o número que ela daria estando CEGA** — foi a S-C55: o nome de cada
 * tabela vinha de um mapa escrito à mão, e um erro de digitação nele fazia a
 * `RegExp` nunca casar sem uma linha vermelha em lugar nenhum. Hoje o nome sai
 * de `getTableConfig` (§ `NOMES_NO_BANCO`) e o autoteste com template sintético
 * (`sqlCruNoTexto`) prega que a peneira ENXERGA, que é a metade que a derivação
 * sozinha não compra.
 *
 * **S-C78 — os dois comportamentos que ninguém tinha escrito, agora ditos e
 * pregados:**
 *
 * 1. **A caixa não importa, de propósito.** O Postgres normaliza identificador
 *    sem aspas para minúsculo, então `UPDATE Contratos` e `UPDATE contratos`
 *    são a MESMA tabela — a peneira casa as duas (`RegExp` com `i`), e recusar
 *    a maiúscula seria um buraco, não um rigor.
 * 2. **Um achado por SÍTIO, com as tabelas citadas nomeadas juntas.** A forma
 *    antiga empurrava um achado por TABELA, e um template que citasse
 *    `contratos` e `parcelas` aparecia DUAS vezes com o mesmo `arquivo:linha` —
 *    quem contasse as linhas da saída como sítios contaria errado no dia em que
 *    o primeiro nascesse. Hoje a linha é uma, `arquivo:linha [contratos,
 *    parcelas] …`, e contar linhas é contar sítios.
 */
export function sqlCruEscrevendoEmTabelaQuente(): string[] {
  return fontesVarridas().flatMap(sqlCruNaFonte);
}

/**
 * A peneira de SQL cru sobre UM texto-fonte. Exportada pelo mesmo motivo de
 * `portasNoTexto` e `trancasNoTexto`: a peneira de verdade dá zero, e sonda que
 * nunca se viu achando alguma coisa não se distingue de sonda cega.
 */
export function sqlCruNoTexto(caminho: string, texto: string): string[] {
  return sqlCruNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function sqlCruNaFonte(sf: ts.SourceFile): string[] {
  const achados: string[] = [];
  const verbo = /\b(insert\s+into|update|delete\s+from)\b/i;
  const rel = sf.fileName;
  const v = (no: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(no) && raizDoReceptor(no.tag) === "sql") {
      const txt = no.template.getText(sf);
      if (verbo.test(txt)) {
        // Todas as quentes citadas entram no MESMO achado: um sítio, uma linha
        // de saída (S-C78) — e a caixa não importa, porque para o Postgres
        // `Contratos` sem aspas É `contratos`.
        const citadas = TABELAS_QUENTES.filter((q) =>
          new RegExp(`\\b${NOMES_NO_BANCO[q]}\\b`, "i").test(txt),
        ).map((q) => NOMES_NO_BANCO[q]);
        if (citadas.length > 0) {
          const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
          achados.push(`${rel}:${linha} [${citadas.join(", ")}] ${txt.replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    no.forEachChild(v);
  };
  v(sf);
  return achados;
}
