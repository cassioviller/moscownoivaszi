import type { AuditoriaItem } from "@workspace/api-client-react";
import { brl } from "@/lib/formatos";

/**
 * O núcleo puro da trilha de auditoria: como cada linha vira texto e para onde
 * ela aponta. Nasceu dentro da tela e saiu daqui (E47) quando a trilha ganhou
 * filtros, CSV e deep-link — a tela ficou grande e estas três regras passaram
 * a merecer teste próprio. `auditoria.test.ts` ao lado.
 */

/**
 * ESPELHO de `ROTULO_ACAO` em api-server/src/lib/auditoria.ts, que rotula o
 * CSV — tela e planilha têm de chamar a mesma coisa pelo mesmo nome. Aqui o
 * mapa é FROUXO (`Record<string, …>` com fallback no código cru) de propósito:
 * ação nova nasce no servidor, e tela velha lendo trilha nova não pode quebrar.
 */
export const ROTULO_ACAO: Record<string, string> = {
  PARCELA_RECEBIDA: "Parcela recebida",
  RECEBIMENTO_ESTORNADO: "Recebimento estornado",
  CONTA_PAGA: "Conta paga",
  PAGAMENTO_REGISTRADO: "Pagamento registrado",
  PAGAMENTO_ESTORNADO: "Pagamento estornado",
  ESTORNO_COMISSAO_BAIXADO: "Estorno de comissão baixado",
  COMISSAO_FECHAMENTO_REABERTO: "Fechamento de comissão reaberto",
  CONTRATO_CANCELADO: "Contrato cancelado",
  MEMBRO_ADICIONADO: "Membro adicionado",
  MEMBRO_ALTERADO: "Membro alterado",
  MEMBRO_REMOVIDO: "Membro removido",
  CONVITE_CRIADO: "Convite criado",
  CONVITE_CANCELADO: "Convite cancelado",
  PERMISSOES_ALTERADAS: "Permissões do perfil alteradas",
  PERMISSOES_RESTAURADAS: "Permissões do perfil restauradas ao padrão",
  ORCAMENTO_ACEITO: "Orçamento aceito pela noiva",
  ORCAMENTO_ACEITE_DESFEITO: "Aceite do orçamento desfeito (gerencial)",
  PROVA_CONFIRMADA: "Prova confirmada pela noiva",
  LEADS_ANONIMIZADOS: "Noivas perdidas anonimizadas (LGPD)",
  // O espelho tinha PARADO: estas cinco já existiam (ou passam a existir) no
  // servidor e caíam no código cru na tela. O mapa é frouxo de propósito para
  // não quebrar, mas "CONTABILIDADE_ENVIADA" na coluna Ação não é rótulo.
  REMARCACAO_PEDIDA: "Remarcação pedida pela noiva",
  CONTA_PAGAR_REMOVIDA: "Conta a pagar removida",
  CONTABILIDADE_ENVIADA: "Período declarado à contabilidade",
  LEAD_REMOVIDO: "Noiva removida do cadastro",
  PARCELA_REMOVIDA: "Parcela removida",
  // P2/E158: o carnê gerado depois empurra as avulsas para o fim da fila. O
  // detalhe guarda o de→para por parcela — é a linha que explica por que a
  // trilha de um recebimento antigo cita um número que a tela não mostra mais.
  PARCELAS_RENUMERADAS: "Parcelas renumeradas",
  CONCILIACAO_MARCADA: "Movimentos conferidos com o extrato",
  RESERVA_REMOVIDA: "Reserva removida",
  BLOQUEIO_REMOVIDO: "Bloqueio de vestido removido",
  ATENDIMENTO_REMOVIDO: "Atendimento removido da agenda",
  ORCAMENTO_REMOVIDO: "Orçamento removido",
  AVARIA_REMOVIDA: "Avaria removida",
  // S-M1: o sexto DELETE cru da família. Só chega aqui a cabine SEM agenda — a
  // que tem é recusada com 409 —, e o detalhe guarda o nome dela.
  CABINE_REMOVIDA: "Cabine removida",
  // S-M16: os três deletes que a conferência da S-M1 achou fora da régua.
  ITEM_ESTOQUE_REMOVIDO: "Item de estoque removido",
  AJUSTE_REMOVIDO: "Trabalho de costura removido da fila",
  COMISSAO_REGRA_REMOVIDA: "Regra de comissão removida",
  // E120: a venda que trocou de dona entre o orçamento e o contrato — é ela
  // que decide de quem é a comissão, por isso a linha existe e é filtrável.
  CONTRATO_VENDEDORA_DIVERGENTE: "Contrato com a venda em nome de outra pessoa",
  // E123: o desfazer da cobrança registrada por engano — depois do DELETE a
  // trilha é o único lugar que lembra o que o registro dizia.
  REGISTRO_COBRANCA_DESFEITO: "Registro de cobrança desfeito",
  // S-O1 — as SEIS que a trilha gravava e o filtro não oferecia. A varredura
  // `auditoria-espelho` passou a cobrar a união inteira do servidor, para a
  // lista não voltar a envelhecer em silêncio.
  //
  // E157/P7: o carnê que perdeu uma parcela ganhou as que faltavam — quem lê o
  // extrato depois precisa achar esta linha para entender por que há duas
  // gerações de carnê no mesmo contrato.
  CARNE_COMPLETADO: "Carnê completado",
  // S-M24: cancelar a reserva solta os vestidos da noiva.
  RESERVA_CANCELADA: "Reserva cancelada (vestidos liberados)",
  // S-O4/E173: mover a data da reserva move a do contrato ATIVO junto — o que
  // muda ali é o papel que a noiva assinou.
  CONTRATO_DATA_SEGUIU_RESERVA: "Data do casamento do contrato seguiu a reserva",
  // S-O11/E173: a reserva aberta na noiva errada passou a ter conserto, e
  // trocar a dona é mexer em de quem é a peça.
  RESERVA_DONA_TROCADA: "Reserva passou para outra noiva",
  // S3: os dois atos GLOBAIS de superadmin. Eles gravam `loja_id` nulo, então
  // não aparecem na trilha de loja nenhuma — mas o rótulo existe para o CSV e
  // para o console da rede não cair no código cru.
  USUARIO_EXCLUIDO: "Usuário excluído do sistema",
  LOJA_EXCLUIDA: "Loja excluída do sistema",
};

/**
 * As ações filtráveis — **derivadas do mapa de rótulos, não copiadas dele.**
 *
 * S-O1: esta era uma lista curada à mão, e ela nascia incompleta e envelhecia
 * pior: `PARCELAS_RENUMERADAS` (E158) e `RESERVA_CANCELADA` (S-M24) tinham
 * rótulo no mapa acima e **não apareciam no select** — a trilha as gravava e o
 * filtro não as oferecia, então quem procurasse por elas não achava. Eram 35
 * numa lista e 37 no mapa, e a diferença era invisível.
 *
 * Derivar mata a segunda cópia (regra 26): ação que ganha rótulo ganha filtro,
 * no mesmo gesto. A ORDEM continua sendo a do mapa, que é a ordem em que as
 * ações foram nascendo — dinheiro primeiro, administração depois, remoções por
 * último. O select a oferece assim de propósito: é a ordem em que a contadora
 * pensa.
 */
export const ACOES_FILTRAVEIS: readonly string[] = Object.keys(ROTULO_ACAO);

/**
 * O tipo é `string`, e **é o preço da derivação** — não descuido. `ROTULO_ACAO`
 * é frouxo de propósito (o comentário dele diz por quê), e `keyof
 * Record<string, string>` é `string`: derivar a lista do mapa custa a união
 * fechada que a lista curada dava de graça.
 *
 * A troca vale porque a garantia que importa nunca foi a do compilador. Ninguém
 * escreve `AcaoFiltravel` à mão — o valor vem da URL, em tempo de execução, e é
 * a conferência de `acaoFiltravel` que o barra. O que a união fechada pegaria a
 * mais é um literal digitado errado no código, e não há nenhum; o que a lista
 * curada deixava passar era ação sem filtro, e isso a trilha inteira sentiu.
 */
export type AcaoFiltravel = string;

/**
 * Confere o `?acao=` da URL contra as ações que o select oferece. Valor
 * desconhecido vira `undefined` — a URL é editável e compartilhável, e um
 * `?acao=XPTO` colado torto deve mostrar a trilha inteira, não pedir 400 ao
 * servidor. A conferência é em TEMPO DE EXECUÇÃO, que é onde o valor nasce.
 */
export function acaoFiltravel(valor: string | null): AcaoFiltravel | undefined {
  return valor && ACOES_FILTRAVEIS.includes(valor) ? valor : undefined;
}

// Estornos desfazem dinheiro — merecem olho mais atento na lista.
const ACOES_DESTAQUE = new Set(["RECEBIMENTO_ESTORNADO", "PAGAMENTO_ESTORNADO"]);

export function acaoEmDestaque(acao: string): boolean {
  return ACOES_DESTAQUE.has(acao);
}

/** Quantas contas de uma saída cabem na linha antes de virar "e mais N". */
const CONTAS_NA_LINHA = 3;

/**
 * As descrições das contas que uma saída quitou.
 *
 * A2/E94: quando havia duas portas de pagar, a single gravava `descricao` no
 * detalhe e a linha da trilha dizia "R$ 500,00 · Aluguel". Unificadas as portas
 * em `PAGAMENTO_REGISTRADO`, o detalhe passou a trazer `contas: [{id,
 * descricao}]` — e este resumo só sabia contá-las, então a mesma ação virou
 * "R$ 500,00 · 1 conta". A trilha ficou uniforme e MENOS legível, que não era o
 * objetivo. Agora as descrições aparecem, e a saída que quita muitas contas
 * corta com "e mais N" em vez de esticar a linha.
 */
function descricoesDasContas(contas: unknown[]): string | null {
  const nomes = contas
    .map((c) => (c as { descricao?: unknown } | null)?.descricao)
    .filter((d): d is string => typeof d === "string" && d.length > 0);
  if (nomes.length === 0) {
    return `${contas.length} conta${contas.length === 1 ? "" : "s"}`;
  }
  if (nomes.length <= CONTAS_NA_LINHA) return nomes.join(", ");
  const restantes = nomes.length - CONTAS_NA_LINHA;
  return `${nomes.slice(0, CONTAS_NA_LINHA).join(", ")} e mais ${restantes}`;
}

/** Uma frase com o que a ação mexeu, extraída do detalhe jsonb. */
export function resumoDetalhe(item: AuditoriaItem): string | null {
  const d = (item.detalhe ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  const valor = d.valorRecebido ?? d.valorPago ?? d.valorBaixado ?? d.totalEstornado;
  if (typeof valor === "number") partes.push(brl(valor));
  if (typeof d.descricao === "string") partes.push(d.descricao);
  if (typeof d.competencia === "string") partes.push(`competência ${d.competencia}`);
  if (typeof d.motivo === "string" && d.motivo) partes.push(`motivo: ${d.motivo}`);
  if (Array.isArray(d.contas)) {
    const contas = descricoesDasContas(d.contas);
    if (contas) partes.push(contas);
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}

export type DestinoAuditoria = { href: string; rotulo: string };

/**
 * Para onde a linha aponta (E47). A trilha grava `entidade`+`entidadeId` desde
 * o E10 e ninguém os lia: "quem estornou esta parcela?" tinha resposta, mas
 * chegar até a parcela era garimpo.
 *
 * A régua é uma só: só vira link quando o destino MOSTRA a entidade da linha.
 *
 *  - `contrato` → a ficha do contrato, pelo id da própria linha;
 *  - `parcela`  → a ficha do contrato DELA, que é onde a parcela aparece —
 *    `detalhe.contratoId` é gravado desde o E10; sem ele não há link, porque
 *    o id da parcela sozinho não abre tela nenhuma;
 *  - `conta_pagar`/`pagamento` → a tela de Contas a pagar, que lista as duas
 *    (mesmo destino que o fluxo de caixa já dá aos seus movimentos).
 *
 * Entidade desconhecida devolve null em vez de chutar: um link que erra o
 * destino gasta a confiança de quem clicou e não volta a ser clicado.
 */
export function destinoDaLinha(item: AuditoriaItem, lojaId: string): DestinoAuditoria | null {
  const contratoDoDetalhe = (item.detalhe as Record<string, unknown> | null)?.contratoId;

  switch (item.entidade) {
    case "contrato":
      return { href: `/loja/${lojaId}/contratos/${item.entidadeId}`, rotulo: "Ver contrato" };
    case "parcela":
      return typeof contratoDoDetalhe === "string" && contratoDoDetalhe
        ? { href: `/loja/${lojaId}/contratos/${contratoDoDetalhe}`, rotulo: "Ver contrato" }
        : null;
    case "conta_pagar":
    case "pagamento":
      return { href: `/loja/${lojaId}/financeiro/pagar`, rotulo: "Ver em contas a pagar" };
    default:
      return null;
  }
}
