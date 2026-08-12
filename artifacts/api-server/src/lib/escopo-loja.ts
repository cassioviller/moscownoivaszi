import {
  db,
  leadsTable,
  cabinesTable,
  usuariosLojasTable,
  reservasTable,
  vestidosTable,
  atributosTable,
  atributoOpcoesTable,
  atendimentosTable,
  bloqueioVestidosTable,
  itensEstoqueTable,
  ajustesTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
// S-O56/E185 — a régua do dono, a mesma que as portas de leitura respondem.
import { donoDoBloqueio } from "./dono-do-bloqueio";

/**
 * Guardas de escopo por loja para as ESCRITAS.
 *
 * O `requireModulo` garante que o usuário acessa a loja da URL — não que os IDs
 * que ele manda no corpo são dessa loja. Sem estas checagens, a loja A referencia
 * um `leadId`/`cabineId` da loja B, e o GET enriquecido puxa os dados da outra
 * loja para dentro dela: vazamento de tenant por FK forjada. A FK do banco só
 * garante que o id EXISTE, não a que loja pertence.
 *
 * Cada função responde "este id é desta loja?". A rota traduz `false` em 404.
 */

export async function leadNaLoja(leadId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId))).limit(1);
  return !!r;
}

export async function cabineNaLoja(cabineId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: cabinesTable.id }).from(cabinesTable)
    .where(and(eq(cabinesTable.id, cabineId), eq(cabinesTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/**
 * Usuário pertence à loja pelo vínculo `usuarios_lojas`, não por uma coluna.
 *
 * É a MESMA pergunta para vendedora, colaborador e membro da equipe — a tabela
 * `usuarios` é GLOBAL, e o que amarra alguém a uma loja é só este vínculo. Toda
 * escrita que recebe um id de gente (do corpo OU do path) passa por aqui antes
 * de escrever: sem isso, o id existe, a FK aceita, e a loja A mexe na loja B.
 */
export async function usuarioNaLoja(usuarioId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: usuariosLojasTable.usuarioId }).from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, usuarioId), eq(usuariosLojasTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/** Alias histórico de `usuarioNaLoja` — a pergunta é a mesma. */
export const vendedoraNaLoja = usuarioNaLoja;

export async function vestidoNaLoja(vestidoId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: vestidosTable.id }).from(vestidosTable)
    .where(and(eq(vestidosTable.id, vestidoId), eq(vestidosTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/**
 * Os pares (atributo, opção) que a ficha do vestido carrega são todos desta
 * loja, e cada opção é do atributo com que ela vem?
 *
 * `vestido_atributos` tem FK para as duas tabelas, e FK só prova que o id
 * EXISTE. `atributos.loja_id` é quem diz de quem ele é; `atributo_opcoes` não
 * tem coluna de loja nenhuma — herda a do atributo pai —, então a opção é
 * conferida pelo pai, o que também barra "Marfim" do atributo Cor entrando no
 * atributo Tamanho.
 */
export async function atributosDaLoja(
  pares: readonly { atributoId: string; opcaoId: string }[],
  lojaId: string,
): Promise<boolean> {
  if (pares.length === 0) return true;
  const opcaoIds = [...new Set(pares.map((p) => p.opcaoId))];
  const linhas = await db
    .select({ atributoId: atributoOpcoesTable.atributoId, opcaoId: atributoOpcoesTable.id })
    .from(atributoOpcoesTable)
    .innerJoin(atributosTable, eq(atributosTable.id, atributoOpcoesTable.atributoId))
    .where(and(inArray(atributoOpcoesTable.id, opcaoIds), eq(atributosTable.lojaId, lojaId)));
  const donoDaOpcao = new Map(linhas.map((l) => [l.opcaoId, l.atributoId]));
  return pares.every((p) => donoDaOpcao.get(p.opcaoId) === p.atributoId);
}

export async function reservaNaLoja(reservaId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: reservasTable.id }).from(reservasTable)
    .where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/**
 * E115 — o ajuste de costura referencia um atendimento pelo corpo, e era a
 * única FK de corpo do módulo sem prova: um `atendimentoId` da loja B entrava
 * na fila de costura de A, e o GET enriquecido (ajuste → atendimento → lead)
 * trazia a ficha da noiva da outra loja para dentro desta.
 */
export async function atendimentoNaLoja(atendimentoId: string, lojaId: string): Promise<boolean> {
  const [a] = await db.select({ id: atendimentosTable.id }).from(atendimentosTable)
    .where(and(eq(atendimentosTable.id, atendimentoId), eq(atendimentosTable.lojaId, lojaId))).limit(1);
  return !!a;
}

/**
 * E154 — o `itemEstoqueId` que o item de orçamento aponta é desta loja?
 *
 * Mesma família das de cima: a FK prova que o saiote EXISTE, e `itens_estoque`
 * é por loja. Sem esta prova, o orçamento da loja A comprometeria o estoque da
 * loja B — e o aviso da B contaria uma peça que ela nunca vendeu.
 */
export async function itemEstoqueNaLoja(itemEstoqueId: string, lojaId: string): Promise<boolean> {
  const [i] = await db.select({ id: itensEstoqueTable.id }).from(itensEstoqueTable)
    .where(and(eq(itensEstoqueTable.id, itemEstoqueId), eq(itensEstoqueTable.lojaId, lojaId))).limit(1);
  return !!i;
}

/**
 * E155 — o `ajusteId` que o item do orçamento aponta é da loja **e da noiva**?
 *
 * A pergunta é mais forte que a das irmãs de propósito, e a lição é do S2/E107:
 * provar só a loja deixava o contrato da noiva A prender a reserva da B. Aqui
 * seria o orçamento de A cobrando a manga que a costureira faz para B — e as
 * duas leriam, cada uma na sua tela, que a peça está paga.
 *
 * O dono do ajuste é o lead do ATENDIMENTO que o gerou (`ajustes.atendimentoId`
 * é obrigatório): a fila não tem coluna de noiva, tem a conversa que a marcou.
 */
export async function ajusteDaNoiva(
  ajusteId: string,
  lojaId: string,
  leadId: string,
): Promise<boolean> {
  const [a] = await db.select({ id: ajustesTable.id })
    .from(ajustesTable)
    .innerJoin(atendimentosTable, eq(atendimentosTable.id, ajustesTable.atendimentoId))
    .where(and(
      eq(ajustesTable.id, ajusteId),
      eq(ajustesTable.lojaId, lojaId),
      eq(atendimentosTable.leadId, leadId),
    )).limit(1);
  return !!a;
}

/**
 * E161/G2 — a reserva de vestido é DESTA noiva?
 *
 * Irmã do `ajusteDaNoiva` acima, escrita para a mesma pergunta um nível ao
 * lado. As rotas provavam o `bloqueioId` contra a LOJA e paravam aí, e o
 * pareamento noiva↔vestido ficava por conta do formulário: uma prova na ficha
 * da Ana com o vestido da Beatriz é aceita, e ao concluir o carimbo do E37 cai
 * no bloqueio da Beatriz — a janela dela colapsa para um dia em que ela não
 * provou nada, e a peça é liberada antes da hora.
 *
 * **SEM DONA passa, e é decisão, não descuido:** é o caso comum (61 das
 * 63 avarias do dev vivem em bloqueio sem noiva — a loja segurou a peça antes
 * de saber de quem seria) e recusá-lo trocaria um defeito raro por uma parede
 * diária. Sem dona não há o que comparar; com dona, tem de ser a mesma.
 *
 * **S-O56/E185 — "sem dona" é `donoDoBloqueio`, não `lead_id`.** O véu
 * pendurado na reserva-mãe da noiva B tem dona sem ter `lead_id` próprio: a
 * leitura antiga o via como sem dona e deixava marcar uma prova da noiva A em
 * cima dele — que é exatamente o caso que esta função nasceu para recusar, com
 * o carimbo do E37 caindo no bloqueio de B ao concluir. A mesma correção vale
 * na porta que decide o contrato (`contratos.ts`).
 */
export async function bloqueioDaNoiva(
  bloqueioId: string,
  lojaId: string,
  leadId: string,
): Promise<boolean> {
  const [b] = await db.select({
    leadId: bloqueioVestidosTable.leadId,
    reservaId: bloqueioVestidosTable.reservaId,
  })
    .from(bloqueioVestidosTable)
    .where(and(
      eq(bloqueioVestidosTable.id, bloqueioId),
      eq(bloqueioVestidosTable.lojaId, lojaId),
    )).limit(1);
  if (!b) return false;
  const dono = await donoDoBloqueio(b);
  return dono === null || dono === leadId;
}

/**
 * E164/R5 — a reserva (agrupadora) é DESTA noiva?
 *
 * `reservas.lead_id` é NOT NULL — toda reserva TEM dona, e por isso aqui não
 * há o ramo do nulo que `bloqueioDaNoiva` acima precisa ter. O POST de
 * bloqueio aceitava `leadId` da noiva A com `reservaId` da noiva B provando
 * cada um só contra a LOJA: o bloqueio da A pendurava na reserva da B, e a
 * consequência era de dinheiro — a guarda de avaria (V3) passa a cair para
 * `reservas.lead_id`, então o reparo do vestido que A alugou só podia ser
 * cobrado no carnê de B, e cobrá-lo em A devolvia 422 AVARIA_DE_OUTRA_NOIVA.
 */
export async function reservaDaNoiva(
  reservaId: string,
  lojaId: string,
  leadId: string,
): Promise<boolean> {
  const [r] = await db.select({ leadId: reservasTable.leadId })
    .from(reservasTable)
    .where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)))
    .limit(1);
  return !!r && r.leadId === leadId;
}

/**
 * E156 — o `origemAjusteId` que a peça nova declara é uma confecção desta loja,
 * e já pronta?
 *
 * São DUAS perguntas com respostas diferentes de propósito, e por isso o retorno
 * não é booleano:
 *
 * · **`FORA_DA_LOJA`** é a pergunta de tenancy das irmãs acima — a FK prova que
 *   o trabalho existe, não de quem ele é. Sem ela, o acervo de A nasceria
 *   apontando a manga que a costureira faz para a noiva de B, e a fila de B
 *   passaria a mostrar a peça de A como "já no acervo".
 * · **`NAO_ESTA_PRONTA`** é a régua do épico: só vira peça do acervo o trabalho
 *   de **CONFECÇÃO** (bainha não é peça nova) e já **FEITO** (a manga não existe
 *   até a costureira terminar).
 */
export type VeredictoConfeccao = "OK" | "FORA_DA_LOJA" | "NAO_ESTA_PRONTA" | "JA_VIROU_PECA";

export async function confeccaoPodeVirarPeca(
  ajusteId: string,
  lojaId: string,
): Promise<VeredictoConfeccao> {
  const [a] = await db
    .select({ tipo: ajustesTable.tipo, status: ajustesTable.status })
    .from(ajustesTable)
    .where(and(eq(ajustesTable.id, ajusteId), eq(ajustesTable.lojaId, lojaId)))
    .limit(1);
  if (!a) return "FORA_DA_LOJA";
  if (a.tipo !== "CONFECCAO" || a.status !== "FEITO") return "NAO_ESTA_PRONTA";
  // S-M8 — "uma vez só" vivia apenas no botão da tela: dois cliques criavam
  // duas peças do mesmo trabalho. Este é o veredicto amigável; o cinto de
  // verdade é o unique `vestidos_origem_ajuste_id_unique`, que fecha a
  // corrida que esta leitura não fecha.
  const [jaVirou] = await db
    .select({ id: vestidosTable.id })
    .from(vestidosTable)
    .where(eq(vestidosTable.origemAjusteId, ajusteId))
    .limit(1);
  if (jaVirou) return "JA_VIROU_PECA";
  return "OK";
}

/** E115 — irmã da de cima: o `bloqueioId` opcional do POST /atendimentos. */
export async function bloqueioNaLoja(bloqueioId: string, lojaId: string): Promise<boolean> {
  const [b] = await db.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId))).limit(1);
  return !!b;
}
