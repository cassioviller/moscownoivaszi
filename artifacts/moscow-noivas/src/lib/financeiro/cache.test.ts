import { describe, it, expect } from "vitest";
import { chavesDoCaixa } from "./cache";

const LOJA = "loja-1";

describe("chavesDoCaixa — o que um movimento de caixa muda", () => {
  const chaves = chavesDoCaixa(LOJA).map((c) => String(c[0]));

  it("cobre os DOIS lados da operação, os TRÊS agregados e o dashboard", () => {
    // D9: `receber.tsx` invalidava só as parcelas. Estes são os endpoints que
    // um recebimento/pagamento muda de fato — o fluxo, o DRE e o alerta são o
    // número que a dona lê no dashboard e no sino, em toda tela.
    //
    // E115: o dashboard entrou — os cards "a receber/pagar (30 dias)" somam as
    // MESMAS tabelas, e sem a chave aqui nenhuma mutation do app o invalidava:
    // receber R$ 5.000,00 e voltar ao painel mostrava um a-receber que ainda
    // somava o que acabou de entrar (o staleTime segurava o número velho).
    expect(chaves).toEqual([
      `/api/lojas/${LOJA}/financeiro/parcelas`,
      `/api/lojas/${LOJA}/financeiro/contas-pagar`,
      `/api/lojas/${LOJA}/financeiro/pagamentos`,
      `/api/lojas/${LOJA}/financeiro/fluxo`,
      `/api/lojas/${LOJA}/financeiro/dre`,
      `/api/lojas/${LOJA}/financeiro/alerta-caixa`,
      `/api/lojas/${LOJA}/dashboard`,
    ]);
  });

  it("as chaves são PREFIXO: alcançam a mesma query com janela", () => {
    // O TanStack casa por prefixo, e é isso que faz uma chave sem params
    // invalidar `receber.tsx` (que pede {de, ate}) e `conciliacao.tsx` (que
    // pede outra janela) de uma vez só.
    const parcelas = chavesDoCaixa(LOJA)[0];
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]).toBe(`/api/lojas/${LOJA}/financeiro/parcelas`);
  });

  it("é escopada por loja: a chave de outra loja não colide", () => {
    const outras = chavesDoCaixa("loja-2").map((c) => String(c[0]));
    expect(outras.some((c) => chaves.includes(c))).toBe(false);
  });
});
