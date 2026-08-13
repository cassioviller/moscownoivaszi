import { gerarContratoPdf } from "./contrato-pdf";
import type { Contrato, ContratoItem, Parcela, Lead, Loja } from "@workspace/db";
import { brutoEmCentavos, linhaDeDesconto } from "@workspace/financeiro-core";

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
 * a divergência era permanente porque o PDF é regerado do mesmo campo.
 *
 * **S-C36/E224 — esta nota dizia "casamento, RETIRADA, vencimento" como dias
 * civis, e a retirada saiu da lista.** Era verdade até o E222, que fez a HORA
 * dos dois campos decidir o veredito da porta (cláusula 4ª, 10:30 às 19:00):
 * `dataRetirada` e `dataDevolucao` são INSTANTES desde então, e o formatador de
 * dia civil os lia em UTC. Casamento e vencimento continuam sendo dias.
 */
export const dataBRInstante = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/**
 * **O instante da locação, como o papel tem de dizê-lo: dia E hora.**
 *
 * A 5ª fixa que a locação começa às **10:30** do dia da retirada e termina às
 * **18:00** do dia da devolução — e *"Retirada: 06/09/2028"* não diz à noiva a
 * que horas ela vem buscar o vestido, que é a informação que as cláusulas 4ª e
 * 5ª existem para fixar. Enquanto os dois campos estavam em 1 de 723 contratos
 * (S-C35) a omissão não aparecia; o gesto do E224 os põe em toda venda.
 */
const dataHoraBRInstante = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
export function instanteDaLocacaoBR(instante: Date | null | undefined): string | undefined {
  // O pt-BR separa dia e hora por vírgula ("06/09/2028, 10:30"); o papel lê
  // melhor com a preposição, e a frase é a mesma da cláusula.
  return instante ? dataHoraBRInstante.format(instante).replace(", ", " às ") : undefined;
}
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
  const cancelado = contrato.status === "CANCELADO";

  /**
   * P10 (E165, decisão do plano: tarja) — o contrato CANCELADO imprimia igual
   * a um vivo: o filtro descartava as CANCELADAs, a seção do plano sumia, e o
   * papel parecia um contrato à vista em aberto — sem uma palavra sobre o
   * cancelamento. Num cancelado, as parcelas FICAM no documento, marcadas: o
   * papel conta a história verdadeira, com a tarja em cima.
   *
   * P12 — e o plano separa o CARNÊ (origem PLANO, que soma o valor total) das
   * cobranças que nasceram depois (avaria, multa, avulsa): a parcela de avaria
   * entrava na mesma lista e o papel listava R$ 5.350,00 sob "Valor total:
   * R$ 5.000,00", sem linha que reconciliasse — e como o PDF é regerado a cada
   * download, o contrato assinado por um valor passava a imprimir outro.
   */
  const vivasOuTodas = [...contrato.parcelas]
    .filter((p) => cancelado || p.status !== "CANCELADA")
    .sort((a, b) => a.numero - b.numero);
  const formatar = (p: (typeof vivasOuTodas)[number]) => ({
    // O NÚMERO manda sobre a descrição: quem cria o contrato grava um genérico
    // "Parcela 0", mas entrada é definida por numero 0 (mesma regra da tela).
    descricao:
      (p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`) +
      (p.status === "CANCELADA" ? " (cancelada)" : ""),
    valor: brl(p.valorPrevisto),
    vencimento: dataBR.format(p.vencimento),
    forma: rotuloForma(p.formaRecebimento),
  });
  const parcelas = vivasOuTodas.filter((p) => p.origem === "PLANO").map(formatar);
  const extras = vivasOuTodas.filter((p) => p.origem !== "PLANO").map(formatar);
  const totalExtrasC = vivasOuTodas
    .filter((p) => p.origem !== "PLANO" && p.status !== "CANCELADA")
    .reduce((s, p) => s + Math.round(p.valorPrevisto * 100), 0);

  return gerarContratoPdf({
    lojaNome: contrato.loja.nome,
    noivaNome: contrato.lead?.noivaNome ?? "",
    tarja:
      cancelado && contrato.canceladoEm
        ? `CANCELADO EM ${dataBRInstante.format(contrato.canceladoEm)}`
        : cancelado
          ? "CANCELADO"
          : undefined,
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
      // S-O64/E187: e a CONTA também. `brutoEmCentavos` do core (E95/C1) já
      // somava aqui, mas a subtração era escrita à mão, como em mais quatro
      // telas — e as duas do portal da noiva a escreviam ERRADA. O papel que
      // ela assina é o pior lugar para uma cópia divergir; agora ele não tem
      // cópia nenhuma.
      const desc = linhaDeDesconto(
        brutoEmCentavos(contrato.itens),
        Math.round(contrato.valorTotal * 100),
        contrato.descontoTipo,
        contrato.descontoValor,
      );
      if (!desc) return {};
      // P14/E165: o sinal é o hífen ASCII — o U+2212 que morava aqui virava
      // "?" no desenhista WinAnsi, e o papel imprimia «Desconto: ?R$ 500,00»:
      // o abatimento sem sinal, lido como mais uma cobrança. O desenhista
      // também traduz (cinto duplo), mas o montador é a origem certa.
      return {
        subtotal: brl(desc.subtotalC / 100),
        desconto: `-${brl(desc.abatimentoC / 100)}${desc.rotulo}`,
      };
    })(),
    valorTotal: brl(contrato.valorTotal),
    formaPagamento: rotuloForma(contrato.formaPagamento),
    parcelas,
    cobrancasExtras: extras.length > 0 ? extras : undefined,
    totalExtras: extras.length > 0 ? brl(totalExtrasC / 100) : undefined,
    dataCasamento: contrato.dataCasamento ? dataBR.format(contrato.dataCasamento) : undefined,
    // S-C36/E224: INSTANTES, com a hora da 5ª e no relógio da loja — não dias.
    dataRetirada: instanteDaLocacaoBR(contrato.dataRetirada),
    dataDevolucao: instanteDaLocacaoBR(contrato.dataDevolucao),
    dataContrato: dataBRInstante.format(contrato.fechadoEm),
    observacao: contrato.observacoes ?? undefined,
  });
}

/** O nome do arquivo, também o mesmo dos dois lados. */
export function nomeDoArquivo(contrato: ContratoComPapel): string {
  return `contrato-${slug(contrato.lead?.noivaNome ?? "")}.pdf`;
}
