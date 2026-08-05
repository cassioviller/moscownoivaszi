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
  CONCILIACAO_MARCADA: "Movimentos conferidos com o extrato",
  RESERVA_REMOVIDA: "Reserva removida",
  BLOQUEIO_REMOVIDO: "Bloqueio de vestido removido",
  ATENDIMENTO_REMOVIDO: "Atendimento removido da agenda",
  ORCAMENTO_REMOVIDO: "Orçamento removido",
  AVARIA_REMOVIDA: "Avaria removida",
  // E120: a venda que trocou de dona entre o orçamento e o contrato — é ela
  // que decide de quem é a comissão, por isso a linha existe e é filtrável.
  CONTRATO_VENDEDORA_DIVERGENTE: "Contrato com a venda em nome de outra pessoa",
  // E123: o desfazer da cobrança registrada por engano — depois do DELETE a
  // trilha é o único lugar que lembra o que o registro dizia.
  REGISTRO_COBRANCA_DESFEITO: "Registro de cobrança desfeito",
};

/** As ações filtráveis, na ordem em que o select as oferece. */
export const ACOES_FILTRAVEIS = [
  "PARCELA_RECEBIDA",
  "RECEBIMENTO_ESTORNADO",
  "CONTA_PAGA",
  "PAGAMENTO_REGISTRADO",
  "PAGAMENTO_ESTORNADO",
  "ESTORNO_COMISSAO_BAIXADO",
  "COMISSAO_FECHAMENTO_REABERTO",
  "CONTRATO_CANCELADO",
  "MEMBRO_ADICIONADO",
  "MEMBRO_ALTERADO",
  "MEMBRO_REMOVIDO",
  "CONVITE_CRIADO",
  "CONVITE_CANCELADO",
  "PERMISSOES_ALTERADAS",
  "PERMISSOES_RESTAURADAS",
  "ORCAMENTO_ACEITO",
  "PROVA_CONFIRMADA",
  "LEADS_ANONIMIZADOS",
  "REMARCACAO_PEDIDA",
  "CONTA_PAGAR_REMOVIDA",
  "CONTABILIDADE_ENVIADA",
  "LEAD_REMOVIDO",
  "PARCELA_REMOVIDA",
  "CONCILIACAO_MARCADA",
  "RESERVA_REMOVIDA",
  "BLOQUEIO_REMOVIDO",
  "ATENDIMENTO_REMOVIDO",
  "ORCAMENTO_REMOVIDO",
  "AVARIA_REMOVIDA",
  "CONTRATO_VENDEDORA_DIVERGENTE",
  "REGISTRO_COBRANCA_DESFEITO",
] as const;

export type AcaoFiltravel = (typeof ACOES_FILTRAVEIS)[number];

/**
 * Estreita o `?acao=` da URL para a união fechada. Valor desconhecido vira
 * `undefined` — a URL é editável e compartilhável, e um `?acao=XPTO` colado
 * torto deve mostrar a trilha inteira, não pedir 400 ao servidor.
 */
export function acaoFiltravel(valor: string | null): AcaoFiltravel | undefined {
  return valor && (ACOES_FILTRAVEIS as readonly string[]).includes(valor)
    ? (valor as AcaoFiltravel)
    : undefined;
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
