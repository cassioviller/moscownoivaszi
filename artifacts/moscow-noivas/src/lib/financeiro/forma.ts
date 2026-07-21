import type { Parcela, ReceberParcelaInputFormaRecebimento } from "@workspace/api-client-react";
import { entradasDoIntervalo, type Intervalo } from "@workspace/financeiro-core";
import { centavos, reais } from "./dinheiro";

/**
 * Forma de pagamento (vocabulário de TELA) — o predicado de atraso mora no
 * motor único (@workspace/financeiro-core), o mesmo do api-server (E25).
 * forma.test.ts ao lado prova o core.
 */
export {
  estaAtrasada,
  vencidas,
  estaAberta,
  saldoAberto,
  teveRecebimento,
  type Vencidas,
} from "@workspace/financeiro-core";

/**
 * Tipado pelo enum gerado: se o backend mudar as formas, o openapi regenera e
 * este mapa falha no typecheck em vez de virar 422 em produção.
 */
export const ROTULO_FORMA: Record<ReceberParcelaInputFormaRecebimento, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};

export const FORMAS = Object.keys(ROTULO_FORMA) as ReceberParcelaInputFormaRecebimento[];

/** Rótulo PT-BR de uma forma; devolve o valor cru se vier algo fora do enum. */
export function rotuloForma(forma: string | null | undefined): string | null {
  if (!forma) return null;
  return ROTULO_FORMA[forma as ReceberParcelaInputFormaRecebimento] ?? forma;
}

export type LinhaPorForma = {
  /** O código cru (chave estável) ou null para o que não tem forma registrada. */
  forma: string | null;
  rotulo: string;
  total: number;
  qtd: number;
};

export type RecebimentosPorForma = {
  /** Maior total primeiro; "Não informado" sempre por último. */
  linhas: LinhaPorForma[];
  total: number;
};

const SEM_FORMA = "Não informado";

/**
 * Recebimentos do intervalo agrupados pelo MEIO (E50).
 *
 * `formaRecebimento` era gravada desde sempre e nenhum relatório a lia — e é
 * dela que a loja precisa para conciliar: a taxa do cartão bate contra a
 * maquininha, o Pix contra o extrato, o dinheiro contra a gaveta. Reusa
 * `entradasDoIntervalo`, então o total daqui fecha por construção com o
 * "Recebimentos" do DRE e com as entradas do fluxo.
 *
 * RESSALVA que o dado impõe: a parcela tem UMA forma, a do último recebimento.
 * Desde a E49 ela pode ser paga em partes, e metade no Pix + metade no cartão
 * aparece inteira no cartão. Registrar a forma por recebimento exigiria um
 * livro de recebimentos que a parcela não tem — quem lê precisa saber disso, e
 * por isso a tela diz.
 */
export function recebimentosPorForma(
  parcelas: readonly Parcela[],
  intervalo: Intervalo,
): RecebimentosPorForma {
  const porForma = new Map<string | null, { totalC: number; qtd: number }>();
  let totalC = 0;

  for (const p of entradasDoIntervalo(parcelas, intervalo)) {
    const chave = p.formaRecebimento ?? null;
    const valorC = centavos(p.valorRecebido ?? 0);
    const atual = porForma.get(chave) ?? { totalC: 0, qtd: 0 };
    atual.totalC += valorC;
    atual.qtd += 1;
    porForma.set(chave, atual);
    totalC += valorC;
  }

  const linhas = [...porForma.entries()]
    .map(([forma, { totalC: c, qtd }]) => ({
      forma,
      rotulo: rotuloForma(forma) ?? SEM_FORMA,
      total: reais(c),
      qtd,
    }))
    // "Não informado" no fim: é lacuna de cadastro, não um meio de pagamento.
    .sort((a, b) => {
      if (a.forma === null) return 1;
      if (b.forma === null) return -1;
      return b.total - a.total;
    });

  return { linhas, total: reais(totalC) };
}
