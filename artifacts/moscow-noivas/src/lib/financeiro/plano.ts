/**
 * E95: o carnê mora no motor único (@workspace/financeiro-core) — a MESMA
 * função que o `gerar-plano` do servidor usa e que o `POST /contratos` vai
 * validar. Porta local; `plano.test.ts` ao lado prova o core pela borda em que
 * a divergência aparecia — a tela, onde 1,77% dos carnês saíam diferentes do
 * que o servidor teria gerado, em silêncio.
 */
import { montarPlanoParcelas, type ParcelaPlanejada } from "@workspace/financeiro-core";
import { centavos, parseValor } from "./dinheiro";

export {
  montarPlanoParcelas,
  ratearRestante,
  addMeses,
  ancoraDeNegocio,
  type ParcelaPlanejada,
  type PlanoParams,
} from "@workspace/financeiro-core";

/**
 * S10 — o carnê a partir do que está DIGITADO, com as frases de erro juntas.
 *
 * Nasceu como o `useMemo` da tela de orçamento (F16/E95); quando a tela de
 * contrato ganhou a mesma prévia, a validação da digitação viraria uma segunda
 * grafia — e cinco grafias do mesmo cuidado é como a regra 26 diz que ele
 * deixa de ser cumprido. As duas telas chamam ISTO, e a prévia das duas é a
 * mesma função que o servidor executa.
 *
 * Erro `null` com linhas `null` é formulário pela metade (sem a data da
 * 1ª parcela), não defeito: a prévia simplesmente ainda não existe.
 */
export function planoDaDigitacao(params: {
  totalCentavos: number;
  entradaDigitada: string;
  numParcelasDigitado: string;
  primeiroVencimento: string;
  /** O dia de negócio de HOJE no fuso da loja (`hojeLocal()`), não o instante. */
  vencimentoEntrada: string;
}): { erro: string | null; linhas: ParcelaPlanejada[] | null } {
  const totalC = params.totalCentavos;
  if (totalC <= 0) return { erro: "Adicione itens antes de gerar o contrato.", linhas: null };

  const entrada = parseValor(params.entradaDigitada);
  if (entrada !== null && !Number.isFinite(entrada)) {
    return { erro: "Entrada inválida — use apenas números.", linhas: null };
  }
  const entradaC = entrada === null ? 0 : centavos(entrada);
  if (entradaC < 0) return { erro: "A entrada não pode ser negativa.", linhas: null };
  if (entradaC > totalC) return { erro: "A entrada não pode superar o total.", linhas: null };

  const numParcelas = Math.trunc(Number(params.numParcelasDigitado) || 0);
  if (totalC - entradaC > 0 && numParcelas < 1) {
    return { erro: "Informe o número de parcelas.", linhas: null };
  }
  // Sem a data ainda não há carnê a mostrar — e isso não é erro, é formulário
  // pela metade: o toast só aparece se ela tentar enviar assim.
  if (!params.primeiroVencimento) return { erro: null, linhas: null };

  try {
    return {
      erro: null,
      linhas: montarPlanoParcelas({
        totalCentavos: totalC,
        entradaCentavos: entradaC,
        numParcelas,
        primeiroVencimento: params.primeiroVencimento,
        vencimentoEntrada: params.vencimentoEntrada,
      }),
    };
  } catch {
    return { erro: "Não consegui montar o carnê com esses valores.", linhas: null };
  }
}

/**
 * S-M19 — "este contrato já tem carnê?" pela MESMA pergunta do servidor; e,
 * desde o E169 (P7/P8), quanto ele SOMA e quanto FALTA nele.
 *
 * As três subiram para o core no E169: o `gerar-plano` do servidor passou a
 * precisar do mesmo `faltanteDoCarneCentavos` que esta tela usa para reabrir o
 * formulário, e uma segunda grafia da conta é a classe de defeito que o
 * `financeiro-core` existe para matar.
 */
export { temCarne, totalDoCarneCentavos, faltanteDoCarneCentavos } from "@workspace/financeiro-core";
export type { ParcelaDoCarne } from "@workspace/financeiro-core";
