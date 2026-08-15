/**
 * **As 21 cláusulas do instrumento, com os números vindos das RÉGUAS** — E220.
 *
 * A cláusula 6ª manda a LOCADORA entregar *"a cópia do presente instrumento"*,
 * e até aqui o PDF do sistema era um resumo financeiro sem uma cláusula
 * (`contrato-pdf.ts`, E100–E165). Este módulo é o texto do papel transcrito em
 * `docs/revisao/2026-08-13-contrato-de-papel/A-transcricao.md`, com uma
 * diferença que é a razão de ele existir: **nenhum número que o sistema pratica
 * está escrito aqui**. A 14ª imprime `TAXA_LIMPEZA_MINIMA`, a 16ª imprime
 * `DIAS_PARA_EXTRAVIO`, a 8ª imprime `RESERVA_PCT` — as mesmas constantes que
 * as portas cobram. Mudou a régua, muda o papel no mesmo commit; o contrato
 * impresso não envelhece como os manuais envelheceram (E184).
 *
 * O que É literal aqui está declarado em `NUMEROS_SO_DO_PAPEL`: são os números
 * que o contrato nomeia e o sistema **não pratica** — honorários de cobrança
 * judicial, aviso prévio da rescisão imotivada, validade do crédito de
 * pandemia. Nenhum deles tem porta; ficam como constante nomeada para a régua
 * poder dizer que sabe deles.
 *
 * Puro de propósito: sem banco, sem Express, sem data. Quem sabe o dia é o
 * montador (`contrato-do-papel.ts`); aqui entram strings já formatadas.
 *
 * ## Onde o papel é omisso, o texto declara a convenção
 *
 * - **5ª sem instante** — 779 dos 780 contratos do `heliumdb` não têm
 *   `dataRetirada` (medido em 15/08). Para eles a cláusula sai com a lacuna do
 *   molde (`___/___/____ às __:__`), como o papel de mão. Com o instante gravado
 *   (E222/E224), sai o dia E a hora, que é o que a 4ª e a 5ª existem para fixar.
 * - **18ª sem prazo** — `null` é "não pactuado" (D3/E217), e a cláusula DIZ
 *   isso em vez de deixar um vazio que convide a caneta a inventar um número
 *   que o sistema não conhece.
 * - **21ª sem cidade** — o cadastro da loja guarda `endereco` numa string só
 *   e não tem coluna de cidade (a coluna é território da D7, junto com
 *   representante e PIX). Sem ela, o foro sai como *"o município da sede da
 *   LOCADORA, indicado na identificação das partes"* — a mesma cidade que a
 *   qualificação imprime, dita por remissão em vez de repetida.
 * - **O fecho** diz *"de igual teor e forma"* — a transcrição achou o molde
 *   truncado em *"de igual"* (defeito 4 do papel), e o instrumento impresso não
 *   herda a truncagem.
 */

import {
  DEDUCAO_DA_RESCISAO_PCT,
  DIAS_PARA_EXTRAVIO,
  DIAS_VEDADOS_DA_TROCA,
  JUROS_DE_MORA_MENSAL_PCT,
  MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL,
  MULTA_DE_ATRASO,
  MULTA_DE_MORA_PCT,
  MULTIPLICADOR_DE_EXTRAVIO,
  NOME_DO_DIA,
  PERCENTUAIS_DA_TROCA_DE_DATA,
  PRAZO_ANTES_DA_RETIRADA_DIAS,
  PRAZO_DA_TROCA_DIAS,
  PRAZO_DEVOLUCAO_DA_LOJA_DIAS,
  RESERVA_PCT,
  TAXA_LIMPEZA_MAXIMA,
  TAXA_LIMPEZA_MINIMA,
  TETO_DO_DANO_EM_ALUGUEIS,
} from "@workspace/financeiro-core";

/**
 * Os números que o contrato nomeia e o sistema NÃO pratica — declarados, e
 * não escondidos na prosa. Cada um tem a razão de não ter porta.
 */
export const NUMEROS_SO_DO_PAPEL = {
  /** 9ª § único — cobrança judicial é do advogado, não do sistema. */
  HONORARIOS_ADVOCATICIOS_PCT: 20,
  /** 10ª — o aviso prévio da rescisão imotivada; a auditoria o registra como inaplicável na prática. */
  AVISO_PREVIO_DA_RESCISAO_DIAS: 365,
  /** 13ª §2º — a validade do crédito de pandemia; a D5 manteve a cláusula como está. */
  VALIDADE_DO_CREDITO_ANOS: 1,
} as const;

const reais = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const porExtenso: Record<number, string> = {
  1: "um",
  2: "dois",
  3: "três",
  4: "quatro",
  5: "cinco",
  6: "seis",
  7: "sete",
  8: "oito",
  9: "nove",
  10: "dez",
};
/** "10 (dez)" — a grafia do papel; acima de dez, só o algarismo. */
const numeral = (n: number) => (porExtenso[n] ? `${n} (${porExtenso[n]})` : String(n));

export type DadosDoInstrumento = {
  /** O nome da LOCADORA, como aparece no cabeçalho. */
  lojaNome: string;
  /** A 4ª por extenso: "terça a sexta, das 10:30 às 19:00; sábado, das 10:30 às 18:00". */
  expediente: string;
  /** A 5ª — o instante da retirada, já formatado ("06/09/2028 às 10:30"); ausente = lacuna. */
  inicioDaLocacao?: string;
  /** A 5ª — o instante da devolução, já formatado; ausente = lacuna. */
  terminoDaLocacao?: string;
  /** A 8ª — o valor total, já formatado. */
  valorTotal?: string;
  /** A 18ª — o prazo pactuado, ou `null`/ausente = "não pactuado". */
  prazoDevolucaoReservaDias?: number | null;
  /** A 21ª — a cidade do foro; ausente = remissão à sede da LOCADORA. */
  foro?: string;
};

export type ParagrafoDoInstrumento = {
  /** "CLÁUSULA 1ª", "PARÁGRAFO ÚNICO", "PARÁGRAFO PRIMEIRO"… */
  rotulo: string;
  texto: string;
  /**
   * A 1ª é a única cláusula com uma TABELA no meio: os itens, o total, a
   * entrada e o restante. O montador do PDF injeta o bloco onde este marcador
   * aparece; o módulo de cláusulas não sabe desenhar tabela nem precisa.
   */
  insercao?: "OBJETO";
};

export type SecaoDoInstrumento = {
  titulo: string;
  paragrafos: ParagrafoDoInstrumento[];
};

const LACUNA_DE_INSTANTE = "___/___/____ às __:__";

/** Os nomes dos dias vedados pela 17ª §1º, no plural do papel: "às sextas-feiras e aos sábados". */
function diasVedadosPorExtenso(): string {
  const plural = (d: number) => {
    const nome = NOME_DO_DIA[d]!;
    // "sexta-feira" → "sextas-feiras"; "sábado" → "sábados".
    return nome.includes("-") ? nome.split("-").map((p) => `${p}s`).join("-") : `${nome}s`;
  };
  // Sábado e domingo são masculinos ("aos"); os dias de "-feira", femininos ("às").
  const nomes = ([...DIAS_VEDADOS_DA_TROCA] as number[]).map(
    (d) => `${NOME_DO_DIA[d]!.includes("-feira") ? "às" : "aos"} ${plural(d)}`,
  );
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** As 21 cláusulas, em nove seções, com os números lidos das réguas. */
export function clausulasDoInstrumento(d: DadosDoInstrumento): SecaoDoInstrumento[] {
  const [pct1, pct2, pct3] = PERCENTUAIS_DA_TROCA_DE_DATA;
  const exclusivaIntegral = MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL === 100;

  return [
    {
      titulo: "2. DO OBJETO DO CONTRATO",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 1ª",
          texto: "É objeto do presente contrato a locação dos seguintes trajes e acessórios:",
          insercao: "OBJETO",
        },
        {
          rotulo: "PARÁGRAFO ÚNICO",
          texto:
            `Em caso de parcelamento, o restante do valor deverá ser pago em até ${PRAZO_ANTES_DA_RETIRADA_DIAS} dias ` +
            "antes da data da retirada dos itens objetos de locação citados anteriormente (em caso de parcelamento no " +
            "boleto, não excluindo o dever de pagar os boletos em suas respectivas datas de vencimento).",
        },
      ],
    },
    {
      titulo: "3. OBRIGAÇÕES DO LOCATÁRIO",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 2ª",
          texto:
            "O LOCATÁRIO deverá fornecer à LOCADORA todas as informações necessárias à realização do aluguel, " +
            "devendo especificar os detalhes necessários à perfeita consecução do mesmo.",
        },
        {
          rotulo: "CLÁUSULA 3ª",
          texto: "O LOCATÁRIO deverá efetuar o pagamento na forma e condições estabelecidas na Cláusula 8ª.",
        },
      ],
    },
    {
      titulo: "4. OBRIGAÇÕES DA LOCADORA",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 4ª",
          texto:
            "A LOCADORA estará com sua loja aberta para a retirada dos trajes e/ou acessórios locados e respectiva " +
            `devolução de ${d.expediente}.`,
        },
        {
          rotulo: "CLÁUSULA 5ª",
          texto:
            `A locação terá início no dia ${d.inicioDaLocacao ?? LACUNA_DE_INSTANTE} e término no dia ` +
            `${d.terminoDaLocacao ?? LACUNA_DE_INSTANTE}.`,
        },
        {
          rotulo: "PARÁGRAFO PRIMEIRO",
          texto:
            "A LOCADORA não se responsabilizará pelos trajes que não forem retirados no dia e horário estabelecidos " +
            "no caput da presente cláusula.",
        },
        {
          rotulo: "PARÁGRAFO SEGUNDO",
          texto:
            "A LOCADORA se compromete a entregar os trajes e seus respectivos acessórios devidamente lavados e " +
            "passados e em perfeito estado de conservação e uso, na data estabelecida na cláusula 5ª.",
        },
        {
          rotulo: "PARÁGRAFO TERCEIRO",
          texto:
            "Caso seja constatado algum dano nos trajes ou acessórios locados, no momento da locação, a LOCADORA se " +
            "compromete a efetuar a substituição ou troca dos mesmos, independente do seu preço de locação, tudo " +
            "conforme a disponibilidade do produto ou conveniência da LOCADORA.",
        },
        {
          rotulo: "PARÁGRAFO QUARTO",
          texto:
            "No momento da retirada dos bens de locação citados no contrato, se faz obrigatória a assinatura pelo " +
            "locatário de nota promissória em favor da locadora como meio de garantia, a qual será devolvida no ato " +
            "da devolução dos bens locados.",
        },
        {
          rotulo: "CLÁUSULA 6ª",
          texto:
            "É dever da LOCADORA oferecer ao LOCATÁRIO a cópia do presente instrumento, contendo todas as " +
            "especificidades da locação contratada.",
        },
        {
          rotulo: "CLÁUSULA 7ª",
          texto: "A LOCADORA deverá fornecer todos os recibos de pagamentos efetuados pelo LOCATÁRIO.",
        },
      ],
    },
    {
      titulo: "5. DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 8ª",
          texto:
            `A presente locação será remunerada pela quantia total de ${d.valorTotal ?? "R$ ________"}, referente aos ` +
            "produtos efetivamente locados, devendo ser pago em dinheiro ou no cartão de débito/crédito, ou outra " +
            "forma de pagamento em que ocorra a prévia concordância de ambas as partes.",
        },
        {
          rotulo: "PARÁGRAFO PRIMEIRO",
          texto:
            "O LOCATÁRIO poderá fazer reserva antecipada dos trajes e/ou acessórios mediante o pagamento antecipado " +
            `de ${RESERVA_PCT}% do valor total do aluguel e assinatura do presente instrumento.`,
        },
        {
          rotulo: "PARÁGRAFO SEGUNDO",
          texto:
            "O valor referente à reserva não será devolvido sob qualquer hipótese, mesmo em caso de cancelamento do " +
            "contrato.",
        },
      ],
    },
    {
      titulo: "6. DO INADIMPLEMENTO, DO DESCUMPRIMENTO E DA MULTA",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 9ª",
          texto:
            "Em caso de inadimplemento por parte do LOCATÁRIO quanto ao pagamento do aluguel, deverá incidir sobre o " +
            `valor do presente instrumento multa pecuniária de ${MULTA_DE_MORA_PCT}%, juros de mora de ` +
            `${JUROS_DE_MORA_MENSAL_PCT}% ao mês e correção monetária.`,
        },
        {
          rotulo: "PARÁGRAFO ÚNICO",
          texto:
            "Em caso de cobrança judicial, devem ser acrescidas custas processuais e " +
            `${NUMEROS_SO_DO_PAPEL.HONORARIOS_ADVOCATICIOS_PCT}% de honorários advocatícios.`,
        },
      ],
    },
    {
      titulo: "7. DA RESCISÃO IMOTIVADA",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 10ª",
          texto:
            "Poderá o presente instrumento ser rescindido por qualquer uma das partes, em qualquer momento, sem que " +
            "haja qualquer tipo de motivo relevante, não obstante a outra parte deverá ser avisada previamente por " +
            `escrito, no prazo de ${NUMEROS_SO_DO_PAPEL.AVISO_PREVIO_DA_RESCISAO_DIAS} dias, por se tratar de locação ` +
            "de vestuário para casamentos.",
        },
        {
          rotulo: "CLÁUSULA 11ª",
          texto:
            "Caso o LOCATÁRIO já tenha realizado o pagamento pelo serviço, e mesmo assim requisite a rescisão " +
            `imotivada do presente contrato, terá o valor da quantia paga devolvido, deduzindo-se ${DEDUCAO_DA_RESCISAO_PCT}% ` +
            "do valor, na qualidade de multa de rescisão contratual.",
        },
        {
          rotulo: "CLÁUSULA 12ª",
          texto:
            "Em se tratando de rescisão de vestido exclusivo para primeiro aluguel, será cobrado, na qualidade de " +
            `multa de rescisão contratual, ${exclusivaIntegral ? "o valor integral" : `${MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL}% do valor`} ` +
            "do aluguel.",
        },
        {
          rotulo: "CLÁUSULA 13ª",
          texto:
            "Caso seja a LOCADORA quem requeira a rescisão imotivada, deverá devolver a quantia que se refere aos " +
            "serviços por ela não prestados ao LOCATÁRIO.",
        },
        {
          rotulo: "PARÁGRAFO PRIMEIRO",
          texto:
            "Caso o LOCATÁRIO queira rescindir o contrato por motivos de decretos restritivos relativos à Pandemia " +
            "(Covid-19), a LOCADORA pede a compreensão para que a rescisão se transforme em CRÉDITO para novas datas " +
            "de locação de vestuários/acessórios, para preservar a saúde financeira da empresa LOCADORA, mediante " +
            "assinatura de TERMO ADITIVO.",
        },
        {
          rotulo: "PARÁGRAFO SEGUNDO",
          texto:
            "O prazo para o uso do crédito mencionado no parágrafo primeiro da cláusula 13ª é de " +
            `${NUMEROS_SO_DO_PAPEL.VALIDADE_DO_CREDITO_ANOS === 1 ? "UM ANO" : `${NUMEROS_SO_DO_PAPEL.VALIDADE_DO_CREDITO_ANOS} ANOS`}, ` +
            "da data da assinatura do aditivo contratual e mediante disponibilidade do modelo escolhido, sendo " +
            "possível a troca de modelo em caso de indisponibilidade de datas.",
        },
        {
          rotulo: "PARÁGRAFO TERCEIRO",
          texto:
            "Caso o LOCATÁRIO ainda assim opte pela rescisão contratual e já tenha efetuado o pagamento integral da " +
            "locação, o prazo para a devolução do valor devido pela LOCADORA ao LOCATÁRIO será de " +
            `${PRAZO_DEVOLUCAO_DA_LOJA_DIAS} dias.`,
        },
      ],
    },
    {
      titulo: "8. DAS CONDIÇÕES GERAIS",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 14ª",
          texto:
            "Caso os trajes e/ou acessórios sejam devolvidos com excesso de sujeira ou manchas, será cobrada uma " +
            `taxa a partir de ${reais(TAXA_LIMPEZA_MINIMA)} até ${reais(TAXA_LIMPEZA_MAXIMA)} para a limpeza das ` +
            "peças (caso de sujeira extraordinária, como por exemplo tinta, esmalte, vômito, sangue, ou a barra com " +
            "muita sujeira de terra ou barro), a qual será avaliada pelo grau de dificuldade durante o recebimento, " +
            "na devolução dos objetos de locação.",
        },
        {
          rotulo: "CLÁUSULA 15ª",
          texto:
            "Se houver qualquer dano aos trajes e/ou acessórios locados, ou sujeira ou mancha que não possam ser " +
            "removidas com lavagem, o LOCATÁRIO pagará uma taxa a ser definida no momento da devolução de acordo com " +
            `o tipo de dano, não excedendo ${numeral(TETO_DO_DANO_EM_ALUGUEIS)} vezes o valor do aluguel de cada peça danificada.`,
        },
        {
          rotulo: "CLÁUSULA 16ª",
          texto:
            `A não devolução no prazo de ${numeral(DIAS_PARA_EXTRAVIO)} dias a contar da data prevista, dos trajes ` +
            "e/ou acessórios descritos neste contrato, será considerada EXTRAVIO ou ROUBO, sendo que o LOCATÁRIO " +
            `terá que pagar ${numeral(MULTIPLICADOR_DE_EXTRAVIO)} vezes o valor do aluguel de cada peça.`,
        },
        {
          rotulo: "PARÁGRAFO PRIMEIRO",
          texto:
            "Se for ultrapassada a data prevista para a devolução dos trajes e/ou acessórios, em prazo inferior ao " +
            "descrito no caput da presente cláusula, o LOCATÁRIO pagará o valor equivalente a um dia de aluguel " +
            `extra para cada dia de atraso, acrescido de multa de ${reais(MULTA_DE_ATRASO)}.`,
        },
        {
          rotulo: "PARÁGRAFO SEGUNDO",
          texto:
            "Os valores descritos no parágrafo primeiro e no caput da presente cláusula poderão ser aplicados " +
            "proporcionalmente a trajes e/ou acessórios avulsos, constantes do rol de produtos locados, que não " +
            "foram devolvidos na data prevista.",
        },
        {
          rotulo: "CLÁUSULA 17ª",
          texto:
            // A letra do papel, sem a convenção do sistema ("do fecho"): a P5
            // ainda espera a dona, e o instrumento não decide por ela.
            `Não será permitida a troca de trajes e/ou acessórios após ${numeral(PRAZO_DA_TROCA_DIAS)} dias da data ` +
            "da locação.",
        },
        {
          rotulo: "PARÁGRAFO PRIMEIRO",
          texto: `Não será permitida troca de modelos ${diasVedadosPorExtenso()}.`,
        },
        {
          rotulo: "PARÁGRAFO SEGUNDO",
          texto:
            `As trocas de datas para o ano seguinte sofrerão reajuste automático de ${pct1}% do valor total do contrato.`,
        },
        {
          rotulo: "PARÁGRAFO TERCEIRO",
          texto:
            `A partir da segunda troca haverá reajuste de ${pct2}%, e de ${pct3}% na terceira, somando o valor ` +
            "adicional da troca, caso houver.",
        },
        {
          rotulo: "CLÁUSULA 18ª",
          texto:
            "Em caso de pagamento total do aluguel no ato da reserva, o cliente receberá o valor excedente ao valor " +
            "da reserva estabelecido no parágrafo primeiro da Cláusula 8ª, se comunicar o cancelamento até " +
            `${
              d.prazoDevolucaoReservaDias != null
                ? `${d.prazoDevolucaoReservaDias} dias antes da data de retirada dos produtos locados.`
                : "o prazo pactuado antes da data de retirada dos produtos locados (prazo NÃO PACTUADO neste contrato)."
            }`,
        },
        {
          rotulo: "CLÁUSULA 19ª",
          texto:
            "Fica pactuada entre as partes a total inexistência de vínculo trabalhista entre as partes contratadas, " +
            "excluindo as obrigações previdenciárias e os encargos sociais, não havendo entre LOCADORA e LOCATÁRIO " +
            "qualquer tipo de relação de subordinação.",
        },
        {
          rotulo: "CLÁUSULA 20ª",
          texto:
            "Salvo com a expressa autorização da LOCADORA, não pode o LOCATÁRIO transferir ou subcontratar os trajes " +
            "e/ou acessórios definidos neste instrumento, sob o risco de ocorrer a rescisão imediata.",
        },
      ],
    },
    {
      titulo: "9. DO FORO",
      paragrafos: [
        {
          rotulo: "CLÁUSULA 21ª",
          texto:
            "Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da comarca " +
            (d.foro && d.foro.trim()
              ? `deste município de ${d.foro.trim().toUpperCase()}.`
              : "do município da sede da LOCADORA, indicado na identificação das partes."),
        },
      ],
    },
  ];
}

/** O fecho, com a frase inteira que o molde truncou. */
export const FECHO_DO_INSTRUMENTO =
  "Por estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor e forma.";
