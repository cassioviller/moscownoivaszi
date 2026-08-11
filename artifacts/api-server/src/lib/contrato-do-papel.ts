import { gerarContratoPdf } from "./contrato-pdf";
import type { Contrato, ContratoItem, Parcela, Lead, Loja } from "@workspace/db";
import { brutoEmCentavos, temDesconto } from "@workspace/financeiro-core";

/**
 * E100/F21 — o contrato como PAPEL, com uma régua só.
 *
 * O documento nasceu dentro de `GET /lojas/:lojaId/contratos/:id/pdf` e ali
 * ficou bem enquanto a loja era a única a baixá-lo. O F21 dá o PDF à noiva pelo
 * token do portal, e aí a montagem passa a ter dois chamadores — que é
 * exatamente quando um bloco inline vira duas versões do mesmo papel: a loja
 * arruma uma linha e a da noiva fica para trás, sem ninguém notar, porque
 * ninguém compara dois PDFs.
 *
 * O que fica de fora, de propósito: o **escopo**. Quem carrega o contrato é a
 * rota, porque as duas provam coisas diferentes — a da loja prova a loja da
 * URL, a do portal prova o token. Misturar as duas provas num parâmetro seria
 * dar à função pública a chance de aceitar a prova errada.
 *
 * `gerarContratoPdf` continua sendo o DESENHISTA puro (sem banco, sem Express);
 * esta é a camada que traduz o registro em texto lido por gente.
 */

// Rótulos PT-BR das formas de pagamento — o documento é lido pela noiva, não
// pela máquina, então o enum cru (CARTAO_CREDITO) não pode vazar para o papel.
const ROTULO_FORMA: Record<string, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};
export const rotuloForma = (f: string | null | undefined) =>
  f ? (ROTULO_FORMA[f] ?? f) : undefined;

// UTC no formato de data: vencimento/casamento são dias civis gravados à
// meia-noite UTC; formatar no fuso local jogaria o dia para trás.
export const dataBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * O dia de um INSTANTE, no fuso da loja — a outra metade da régua do repo
 * ("data de negócio ≠ instante").
 *
 * `contrato.fechadoEm` é `timestamp defaultNow()`, não um dia civil: um
 * contrato fechado às 21h30 de 28/07 em São Paulo grava `2026-07-29T00:30Z`, e
 * o formatador UTC imprimia "29/07/2026" no papel que a noiva assina. Todo
 * contrato fechado entre 21h e a meia-noite saía com a data um dia à frente, e
 * a divergência era permanente porque o PDF é regerado do mesmo campo. As
 * outras datas do documento (casamento, retirada, vencimento) SÃO dias civis e
 * continuam em UTC — é por isso que existem dois formatadores.
 */
export const dataBRInstante = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
export const brl = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Nome de arquivo seguro: só ASCII, pois o header Content-Disposition não
// carrega acento sem codificação extra.
export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "noiva"
  );
}

export type ContratoComPapel = Contrato & {
  loja: Loja;
  lead: Lead | null;
  parcelas: Parcela[];
  itens: ContratoItem[];
};

/** O PDF do contrato, byte por byte igual dos dois lados. */
export function pdfDoContrato(contrato: ContratoComPapel): Uint8Array {
  // Canceladas não entram no documento: o papel mostra o que a noiva deve.
  const parcelas = [...contrato.parcelas]
    .filter((p) => p.status !== "CANCELADA")
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({
      // O NÚMERO manda sobre a descrição: quem cria o contrato grava um genérico
      // "Parcela 0", mas entrada é definida por numero 0 (mesma regra da tela).
      descricao: p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`,
      valor: brl(p.valorPrevisto),
      vencimento: dataBR.format(p.vencimento),
      forma: rotuloForma(p.formaRecebimento),
    }));

  return gerarContratoPdf({
    lojaNome: contrato.loja.nome,
    noivaNome: contrato.lead?.noivaNome ?? "",
    // O CPF do contrato manda: é o que foi conferido no fechamento.
    cpf: contrato.cpf ?? undefined,
    whatsapp: contrato.lead?.whatsapp ?? undefined,
    vestido: contrato.vestidoDescricao ?? undefined,
    itens: contrato.itens.map((it) => ({
      descricao: `${it.quantidade}x ${it.descricao}`,
      // Centavos inteiros na multiplicação: 3 × 0.1 em reais viraria 0.30000000000000004.
      valor: brl((it.quantidade * Math.round(it.valorUnitario * 100)) / 100),
    })),
    // Com desconto, o subtotal (bruto) e o abatimento explicam por que a soma
    // dos itens não é o total. O abatimento é bruto − total: reconcilia sempre.
    ...(() => {
      // P15/E163: a pergunta é da régua única — tipo com valor 0 é SEM desconto,
      // como o dinheiro sempre tratou; o papel imprimia "Desconto − R$ 0,00".
      if (!temDesconto(contrato.descontoTipo, contrato.descontoValor)) return {};
      // `brutoEmCentavos` do core (E95/C1) — era a mesma conta reescrita à mão,
      // e o papel que a noiva assina é o pior lugar para uma cópia divergir.
      const brutoC = brutoEmCentavos(contrato.itens);
      const abatimentoC = brutoC - Math.round(contrato.valorTotal * 100);
      const rotulo = contrato.descontoTipo === "PERCENTUAL" ? ` (${contrato.descontoValor}%)` : "";
      return { subtotal: brl(brutoC / 100), desconto: `−${brl(abatimentoC / 100)}${rotulo}` };
    })(),
    valorTotal: brl(contrato.valorTotal),
    formaPagamento: rotuloForma(contrato.formaPagamento),
    parcelas,
    dataCasamento: contrato.dataCasamento ? dataBR.format(contrato.dataCasamento) : undefined,
    dataRetirada: contrato.dataRetirada ? dataBR.format(contrato.dataRetirada) : undefined,
    dataDevolucao: contrato.dataDevolucao ? dataBR.format(contrato.dataDevolucao) : undefined,
    dataContrato: dataBRInstante.format(contrato.fechadoEm),
    observacao: contrato.observacoes ?? undefined,
  });
}

/** O nome do arquivo, também o mesmo dos dois lados. */
export function nomeDoArquivo(contrato: ContratoComPapel): string {
  return `contrato-${slug(contrato.lead?.noivaNome ?? "")}.pdf`;
}
