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
//
// **E220 — o PDF vira o INSTRUMENTO.** Até aqui ele era um resumo financeiro
// (dados da noiva, itens, valores, datas, observações, assinaturas) — útil, e
// não o que a 6ª manda entregar: *"a cópia do presente instrumento, contendo
// todas as especificidades da locação contratada"*. Agora o papel tem a forma
// do molde de mão: identificação das partes (a locadora do cadastro, a
// locatária da qualificação congelada no E215), a cláusula 1ª com a tabela do
// objeto (onde o resumo financeiro continua morando, inteiro), as outras vinte
// cláusulas com os números lidos das réguas (`contrato-clausulas.ts`), o fecho
// e as assinaturas. O que era o PDF antigo está TODO dentro do novo — o que
// mudou é que agora ele diz também a que a noiva se obrigou.

import { EXPEDIENTE_DE_RETIRADA_PADRAO, descricaoDoExpedienteDeRetirada } from "@workspace/agenda-core";
import {
  FECHO_DO_INSTRUMENTO,
  clausulasDoInstrumento,
  type DadosDoInstrumento,
} from "./contrato-clausulas";
import { desenharPdf, montadorDeTokens, quebrarTexto, type Token } from "./pdf-desenhista";

// O `quebrarTexto` continua endereçável por aqui: ele é a régua de quebra do
// papel, e o teste do E165 (P13) o importa deste módulo desde então.
export { quebrarTexto };

/** A qualificação da LOCATÁRIA, como o papel a pede — já formatada, rótulos prontos. */
export type QualificacaoNoPapel = {
  rg?: string;
  estadoCivil?: string;
  profissao?: string;
  nascimento?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
};

export type DadosContrato = {
  lojaNome: string;
  /** E220 — a LOCADORA como o cabeçalho a qualifica; tudo do cadastro da loja. */
  lojaCnpj?: string;
  lojaEndereco?: string;
  lojaTelefone?: string;
  /** D7 aberta: o cadastro ainda não guarda o representante; ausente = lacuna. */
  lojaRepresentante?: string;
  /** D7 aberta: o cadastro não tem cidade; ausente = a 21ª remete à sede. */
  lojaCidade?: string;
  noivaNome: string;
  /**
   * P10: a tarja do contrato cancelado — desenhada GRANDE, logo abaixo do
   * título. O papel de um contrato morto não pode parecer um vivo.
   */
  tarja?: string;
  cpf?: string;
  whatsapp?: string;
  /** E220 — os outros doze da qualificação (E215), na frase da identificação. */
  qualificacao?: QualificacaoNoPapel;
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
  /** E220 — a segunda tabela da 1ª: ENTRADA e RESTANTE A PAGAR, já formatados. */
  entrada?: string;
  restante?: string;
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
  /** E220 — a 4ª por extenso; ausente = o expediente do papel (o padrão do sistema). */
  expediente?: string;
  /** E220 — a 18ª: o prazo pactuado, ou nulo/ausente = "não pactuado". */
  prazoDevolucaoReservaDias?: number | null;
};

/**
 * O expediente que o PAPEL fixa (4ª) — o `EXPEDIENTE_DE_RETIRADA_PADRAO` do
 * `agenda-core`, na frase que a guarda do E222 cita. O montador de dados manda
 * o efetivo da loja; sem ele (o teste puro), sai o do contrato — LIDO, não copiado.
 */
const EXPEDIENTE_DO_PAPEL = descricaoDoExpedienteDeRetirada(EXPEDIENTE_DE_RETIRADA_PADRAO);

const ou = (v: string | undefined, lacuna = "-") => (v && v.trim() ? v.trim() : lacuna);

function montarTokens(d: DadosContrato): Token[] {
  const { tokens, add, vazio, dado, bloco } = montadorDeTokens();

  add(d.lojaNome.toUpperCase(), 16);
  add("INSTRUMENTO PARTICULAR DE LOCAÇÃO DE VESTUÁRIO", 14);
  // P10: a tarja vem ANTES de qualquer dado — é a primeira coisa que o papel
  // de um contrato morto tem a dizer.
  if (d.tarja) {
    add(`*** ${d.tarja} ***`, 14);
  }
  vazio();

  // ── 1. As partes ───────────────────────────────────────────────────────────
  add("1. IDENTIFICAÇÃO DAS PARTES", 12);
  add(
    `LOCADORA: ${d.lojaNome}, situada à ${ou(d.lojaEndereco, "________________")}, inscrita no CNPJ sob o ` +
      `nº ${ou(d.lojaCnpj, "____________")}, telefone ${ou(d.lojaTelefone, "____________")}, neste ato ` +
      `representada por ${ou(d.lojaRepresentante, "________________________________")}.`,
    10,
  );
  vazio();
  const q = d.qualificacao ?? {};
  add(
    `LOCATÁRIO: ${ou(d.noivaNome, "________________")}, estado civil ${ou(q.estadoCivil)}, profissão ` +
      `${ou(q.profissao)}, Carteira de Identidade nº ${ou(q.rg)}, data de nascimento ${ou(q.nascimento)}, ` +
      `CPF nº ${ou(d.cpf)}, telefone ${ou(d.whatsapp)}, residente e domiciliado na ${ou(q.logradouro)}, ` +
      `nº ${ou(q.numero)}${q.complemento && q.complemento.trim() ? `, ${q.complemento.trim()}` : ""}, ` +
      `bairro ${ou(q.bairro)}, CEP ${ou(q.cep)}, cidade ${ou(q.cidade)}, no Estado ${ou(q.estado)}, ` +
      `e-mail ${ou(q.email)}.`,
    10,
  );
  vazio();
  add(
    "As partes identificadas acima têm, entre si, justo e acertado o presente Contrato de Locação de Artigos " +
      "de Vestuário, que se regerá pelas cláusulas seguintes e pelas condições de preço, forma e termo de " +
      "pagamento descritas no presente.",
    10,
  );
  vazio();

  // ── 2–9. As cláusulas, com a tabela do objeto dentro da 1ª ─────────────────
  const dadosDoInstrumento: DadosDoInstrumento = {
    lojaNome: d.lojaNome,
    expediente: d.expediente ?? EXPEDIENTE_DO_PAPEL,
    inicioDaLocacao: d.dataRetirada,
    terminoDaLocacao: d.dataDevolucao,
    valorTotal: d.valorTotal,
    prazoDevolucaoReservaDias: d.prazoDevolucaoReservaDias,
    foro: d.lojaCidade,
  };
  for (const secao of clausulasDoInstrumento(dadosDoInstrumento)) {
    add(secao.titulo, 12);
    for (const p of secao.paragrafos) {
      add(`${p.rotulo} — ${p.texto}`, 10);
      if (p.insercao === "OBJETO") objeto(d);
    }
    vazio();
  }

  function objeto(d: DadosContrato) {
    vazio();
    dado("Modelo", d.vestido);
    if (d.itens && d.itens.length > 0) {
      add("Itens contratados:", 11);
      for (const it of d.itens) {
        add(`  ${it.descricao}: ${it.valor}`, 10);
      }
    }
    if (d.desconto) {
      dado("Subtotal", d.subtotal);
      dado("Desconto", d.desconto);
    }
    dado("TOTAL", d.valorTotal);
    // A segunda tabela do molde: ENTRADA · RESTANTE A PAGAR · forma do restante.
    dado("Entrada", d.entrada);
    dado("Restante a pagar", d.restante);
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
      add("Cobranças fora do valor total (avaria, multa, avulsa):", 11);
      for (const p of d.cobrancasExtras) {
        const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
        const forma = p.forma ? ` · ${p.forma}` : "";
        add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
      }
      if (d.totalExtras) add(`  Total das cobranças extras: ${d.totalExtras}`, 10);
    }
    vazio();
    dado("Data do casamento", d.dataCasamento);
    dado("Retirada", d.dataRetirada);
    dado("Devolução", d.dataDevolucao);
    const obs = d.observacao && d.observacao.trim() ? d.observacao.trim() : "";
    if (obs) {
      add("Observações:", 11);
      for (const linha of quebrarTexto(obs)) add(`  ${linha}` || " ", 10);
    }
    vazio();
  }

  // ── Fecho e assinaturas ────────────────────────────────────────────────────
  // P11: as assinaturas são um BLOCO indivisível — ou cabem inteiras na página,
  // ou nascem na próxima. É o bloco que estava sendo desenhado em y negativo.
  bloco(
    [
      { text: FECHO_DO_INSTRUMENTO, size: 10 },
      { text: " ", size: 11 },
      { text: `${ou(d.lojaCidade, "____________________")}, ${ou(d.dataContrato, "____ de ____________ de ______")}.`, size: 10 },
      { text: " ", size: 11 },
      { text: " ", size: 11 },
      { text: "__________________________________", size: 11 },
      { text: `${d.lojaNome} — LOCADORA`, size: 11 },
      { text: `CNPJ ${ou(d.lojaCnpj, "____________")}`, size: 10 },
      { text: " ", size: 11 },
      { text: " ", size: 11 },
      { text: "__________________________________", size: 11 },
      { text: `${ou(d.noivaNome, "Noiva")} — LOCATÁRIO`, size: 11 },
      { text: `CPF: ${ou(d.cpf, "____________")}`, size: 10 },
    ],
    20,
  );

  return tokens;
}

export function gerarContratoPdf(d: DadosContrato): Uint8Array {
  return desenharPdf(montarTokens(d));
}
