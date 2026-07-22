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
  MEMBRO_ADICIONADO: "Membro adicionado",
  MEMBRO_ALTERADO: "Membro alterado",
  MEMBRO_REMOVIDO: "Membro removido",
  CONVITE_CRIADO: "Convite criado",
  CONVITE_CANCELADO: "Convite cancelado",
  PERMISSOES_ALTERADAS: "Permissões do perfil alteradas",
  PERMISSOES_RESTAURADAS: "Permissões do perfil restauradas ao padrão",
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
  "MEMBRO_ADICIONADO",
  "MEMBRO_ALTERADO",
  "MEMBRO_REMOVIDO",
  "CONVITE_CRIADO",
  "CONVITE_CANCELADO",
  "PERMISSOES_ALTERADAS",
  "PERMISSOES_RESTAURADAS",
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

/** Uma frase com o que a ação mexeu, extraída do detalhe jsonb. */
export function resumoDetalhe(item: AuditoriaItem): string | null {
  const d = (item.detalhe ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  const valor = d.valorRecebido ?? d.valorPago ?? d.valorBaixado;
  if (typeof valor === "number") partes.push(`R$ ${brl(valor)}`);
  if (typeof d.descricao === "string") partes.push(d.descricao);
  if (typeof d.competencia === "string") partes.push(`competência ${d.competencia}`);
  if (typeof d.motivo === "string" && d.motivo) partes.push(`motivo: ${d.motivo}`);
  if (Array.isArray(d.contas)) partes.push(`${d.contas.length} conta${d.contas.length === 1 ? "" : "s"}`);
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
