import { createHash } from "node:crypto";
import { brutoEmCentavos, liquidoEmCentavos, reais } from "@workspace/financeiro-core";

export type ItemVivoDeOrcamento = {
  tipo: string;
  descricao: string;
  valorUnitario: number;
  quantidade: number;
  createdAt: string | Date;
};

/**
 * E115 — o CONTEÚDO que um envio congela, numa régua só.
 *
 * Três leitores olhavam o mesmo orçamento e viam três coisas: o aceite
 * certificava a versão CONGELADA no envio (hash), o portal mostrava essa
 * versão, e o `POST /contratos` validava contra os itens VIVOS — que o E75
 * deixa editar depois do envio de propósito (a noiva vê a versão enviada,
 * não o rascunho). Editado o item de R$ 5.000 para R$ 5.500 com o link na mão
 * da noiva, ela aceitava R$ 5.000 e o único contrato que o servidor criava era
 * de R$ 5.500.
 *
 * Esta função é usada nos DOIS lados: `criarVersaoEnviada` congela por ela, e
 * o `POST /contratos` — quando há aceite — reconstrói o conteúdo vivo por ela
 * e compara com `aceiteHash`. O formato do `conteudo` é CONTRATO: mudar uma
 * chave invalida todo hash já gravado.
 */
export function conteudoEnviado(
  itensVivos: readonly ItemVivoDeOrcamento[],
  descontoTipo: "PERCENTUAL" | "VALOR" | null,
  descontoValor: number | null,
) {
  const itens = [...itensVivos]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));
  const brutoC = brutoEmCentavos(itens);
  const totalBruto = reais(brutoC);
  const totalLiquido = reais(liquidoEmCentavos(brutoC, descontoTipo, descontoValor));
  const conteudo = { itens, descontoTipo, descontoValor, totalBruto, totalLiquido };
  const hash = createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
  return { itens, totalBruto, totalLiquido, hash };
}
