// O que o CONTRATO diz, em tokens. Os bytes são do desenhista
// (`lib/pdf-desenhista.ts`), que este arquivo abrigou do E100 ao E221 e que
// saiu daqui quando o recibo da cláusula 7ª virou o segundo papel do sistema.
//
// Ser função pura — sem banco, sem Express — é uma qualidade deliberada: o
// layout roda em teste unitário e pode ser trocado por um template real (ou uma
// lib) sem tocar na rota. O layout é propositalmente simples.
//
// E165 (P11): o desenhista PAGINA. A versão anterior era uma página única com o
// y descendo sem freio — a partir de 15 parcelas as assinaturas eram desenhadas
// em y NEGATIVO (medido: entrada + 18 parcelas punha o bloco de assinatura em
// y=−15..−77): o PDF saía válido, abria normalmente, e não tinha onde a noiva e
// a loja assinam. Com 24 parcelas sumia a seção de observações; `numParcelas`
// aceita até 360. Agora nenhuma linha desce abaixo da margem: acabou a página,
// nasce outra — e o bloco de assinaturas nunca se separa no meio.

import { desenharPdf, montadorDeTokens, quebrarTexto, type Token } from "./pdf-desenhista";

// O `quebrarTexto` continua endereçável por aqui: ele é a régua de quebra do
// papel, e o teste do E165 (P13) o importa deste módulo desde então.
export { quebrarTexto };

export type DadosContrato = {
  lojaNome: string;
  noivaNome: string;
  /**
   * P10: a tarja do contrato cancelado — desenhada GRANDE, logo abaixo do
   * título. O papel de um contrato morto não pode parecer um vivo.
   */
  tarja?: string;
  cpf?: string;
  whatsapp?: string;
  vestido?: string;
  // Snapshot dos itens contratados; o valor já vem formatado (a formatação de
  // moeda é responsabilidade de quem monta os dados, não do desenhista).
  itens?: { descricao: string; valor: string }[];
  // Subtotal (soma bruta dos itens) e desconto só aparecem quando há desconto —
  // aí o valorTotal é o líquido e a linha explica por que itens ≠ total. Já
  // formatados por quem monta os dados.
  subtotal?: string;
  desconto?: string;
  valorTotal?: string;
  formaPagamento?: string;
  // Plano de pagamento (entrada = parcela nº 0). Fonte única da entrada.
  // P12: aqui entram SÓ as parcelas do carnê (origem PLANO) — são elas que
  // somam o valorTotal. O resto vai em `cobrancasExtras`.
  parcelas?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];
  /**
   * P12: as cobranças que nasceram DEPOIS do fecho (avaria, multa, avulsa) —
   * listadas em seção própria, com o subtotal delas, para o papel nunca somar
   * mais do que o "Valor total" sem uma linha que reconcilie. Antes, a parcela
   * de avaria entrava no plano e o PDF listava R$ 5.350,00 sob "Valor total:
   * R$ 5.000,00" — e como o PDF é regerado a cada download, o contrato
   * assinado por um valor passava a imprimir outro.
   */
  cobrancasExtras?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];
  totalExtras?: string;
  dataCasamento?: string;
  dataRetirada?: string;
  dataDevolucao?: string;
  dataContrato?: string;
  observacao?: string;
};

function montarTokens(d: DadosContrato): Token[] {
  const { tokens, add, vazio, dado, bloco } = montadorDeTokens();

  add("CONTRATO DE LOCACAO DE VESTIDO", 16);
  // P10: a tarja vem ANTES de qualquer dado — é a primeira coisa que o papel
  // de um contrato morto tem a dizer.
  if (d.tarja) {
    add(`*** ${d.tarja} ***`, 14);
  }
  vazio();
  add(d.lojaNome, 12);
  dado("Data do contrato", d.dataContrato);
  vazio();

  add("DADOS DA NOIVA", 12);
  dado("Nome", d.noivaNome);
  dado("CPF", d.cpf);
  dado("WhatsApp", d.whatsapp);
  vazio();

  add("VESTIDO", 12);
  dado("Modelo", d.vestido);
  if (d.itens && d.itens.length > 0) {
    vazio();
    add("Itens contratados:", 11);
    for (const it of d.itens) {
      add(`  ${it.descricao}: ${it.valor}`, 10);
    }
  }
  vazio();

  add("VALORES E PAGAMENTO", 12);
  if (d.desconto) {
    dado("Subtotal", d.subtotal);
    dado("Desconto", d.desconto);
  }
  dado("Valor total", d.valorTotal);
  dado("Forma de pagamento", d.formaPagamento);
  if (d.parcelas && d.parcelas.length > 0) {
    vazio();
    add("Plano de pagamento:", 11);
    for (const p of d.parcelas) {
      const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
      const forma = p.forma ? ` · ${p.forma}` : "";
      add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
    }
  }
  // P12: o que não é carnê fica em seção própria — o plano soma o valor total,
  // e as cobranças extras têm o subtotal delas.
  if (d.cobrancasExtras && d.cobrancasExtras.length > 0) {
    vazio();
    add("Cobrancas fora do valor total (avaria, multa, avulsa):", 11);
    for (const p of d.cobrancasExtras) {
      const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
      const forma = p.forma ? ` · ${p.forma}` : "";
      add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
    }
    if (d.totalExtras) add(`  Total das cobrancas extras: ${d.totalExtras}`, 10);
  }
  vazio();

  add("DATAS", 12);
  dado("Casamento", d.dataCasamento);
  dado("Retirada", d.dataRetirada);
  dado("Devolucao", d.dataDevolucao);
  vazio();

  add("OBSERVACOES", 12);
  const obs = d.observacao && d.observacao.trim() ? d.observacao.trim() : "-";
  for (const linha of quebrarTexto(obs)) add(linha || " ");

  // P11: as assinaturas são um BLOCO indivisível — ou cabem inteiras na página,
  // ou nascem na próxima. É o bloco que estava sendo desenhado em y negativo.
  bloco([
    { text: "__________________________________", size: 11 },
    { text: d.noivaNome && d.noivaNome.trim() ? d.noivaNome.trim() : "Noiva", size: 11 },
    { text: " ", size: 11 },
    { text: "__________________________________", size: 11 },
    { text: d.lojaNome, size: 11 },
  ]);

  return tokens;
}

export function gerarContratoPdf(d: DadosContrato): Uint8Array {
  return desenharPdf(montarTokens(d));
}
