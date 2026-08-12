import type { AuditoriaItem } from "@workspace/api-client-react";
import { ROTULO_ACAO } from "@workspace/financeiro-core";
import { brl } from "@/lib/formatos";

/**
 * O núcleo puro da trilha de auditoria: como cada linha vira texto e para onde
 * ela aponta. Nasceu dentro da tela e saiu daqui (E47) quando a trilha ganhou
 * filtros, CSV e deep-link — a tela ficou grande e estas três regras passaram
 * a merecer teste próprio. `auditoria.test.ts` ao lado.
 */

/**
 * S-O52/E186 — **o mapa de rótulos deixou de ser o SEGUNDO.**
 *
 * Era um espelho à mão de `api-server/src/lib/auditoria.ts`, e o comentário de
 * lá declarava o pacto desde o E47: *"a planilha da contadora e a tela têm de
 * chamar a mesma coisa pelo mesmo nome"*. A `auditoria-espelho` passou a cobrar
 * as CHAVES no E178 — e o texto de **três dos 43** rótulos divergia
 * (`CARNE_COMPLETADO`, `USUARIO_EXCLUIDO`, `LOJA_EXCLUIDA`), que é exatamente o
 * que uma varredura de chaves não vê.
 *
 * Ele mora em `@workspace/financeiro-core` e é reexportado daqui — nenhuma tela
 * mudou de import. **A frouxidão continua existindo e mudou de lugar**: era do
 * MAPA (`Record<string, string>`, para tela velha não quebrar lendo trilha nova)
 * e passou a ser de `rotuloDaAcao`, que é onde o valor desconhecido de verdade
 * chega — o `acao` de uma linha do banco. O mapa, agora fechado, cobra do
 * TypeScript o rótulo de toda ação nova, garantia que só o servidor tinha.
 */
export { ROTULO_ACAO, rotuloDaAcao } from "@workspace/financeiro-core";

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
 * O tipo é `string`, e **a razão mudou no E186** — antes era o preço da
 * derivação (`keyof Record<string, string>` é `string`), e o mapa agora é
 * fechado, então `Object.keys` continua devolvendo `string[]` mas a união
 * existe. Ele fica assim de propósito: o valor vem da **URL**, em tempo de
 * execução, e é `acaoFiltravel` que o barra. Prometer união fechada num valor
 * que nasce de `searchParams.get` é a garantia que engana.
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
