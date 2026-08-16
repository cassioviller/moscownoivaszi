import { brl, centavos, reais } from "./dinheiro";
import { addDias, diaDeNegocio, diaLocal } from "./datas";

/**
 * **O atraso na devolução** — cláusula 16ª e seus dois parágrafos do instrumento
 * de locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **16ª** — A não devolução no prazo de **10 (dez) dias** a contar da data
 * > prevista, dos trajes e/ou acessórios descritos nesse contrato, será
 * > considerada **EXTRAVIO ou ROUBO**, sendo que o LOCATÁRIO terá que pagar
 * > **quatro vezes** o valor do aluguel de cada peça.
 * >
 * > **§1º** — Se for ultrapassada a data prevista para a devolução dos trajes
 * > e/ou acessórios, em prazo **inferior ao descrito no caput**, o LOCATÁRIO
 * > pagará o valor equivalente a **um dia de aluguel extra para cada dia de
 * > atraso**, acrescido de **multa de R$ 250,00**.
 * >
 * > **§2º** — Os valores descritos no §1º e no caput poderão ser aplicados
 * > **proporcionalmente** a trajes e/ou acessórios avulsos, constantes do rol
 * > de produtos locados, que não foram devolvidos na data prevista.
 *
 * O sistema **já enxerga** o atraso desde sempre: `disponibilidade.ts` tem o
 * motivo `ATRASO_DEVOLUCAO` e o aplica quando há retirada sem devolução depois
 * do fim do uso previsto. A peça aparece atrasada na tela e **nenhuma cobrança
 * nascia**. Este módulo é a conta que faltava.
 *
 * ## As duas faixas são EXCLUSIVAS, e é o texto que diz isso
 *
 * O §1º só vale *"em prazo inferior ao descrito no caput"*. Então 1 a 9 dias é
 * diária + multa; 10 dias ou mais é extravio, 4× o aluguel — **e sem a multa
 * dos R$ 250,00, que o caput não menciona**. Não é esquecimento do redator: a
 * multa é o preço do transtorno de esperar; o extravio já cobra a peça inteira
 * quatro vezes.
 *
 * ## "Um dia de aluguel" — a leitura, decidida pela dona em 13/08/2026
 *
 * O sistema não tem "diária": ele tem o **valor do aluguel da peça**
 * (`contrato_itens.valor_unitario`), que é preço fechado por uma janela de uso
 * de 6 dias no padrão da loja (`usoDiasAntes` 3 + o dia + `usoDiasDepois` 2).
 * Duas leituras cabiam, e a diferença é de 6×:
 *
 * 1. **a diária é o aluguel ÷ os dias da janela** — R$ 3.000,00 / 6 = R$ 500,00;
 * 2. a diária é o aluguel INTEIRO, por dia — R$ 3.000,00.
 *
 * **Adotamos a (1)**, e a razão não é preferência: a (2) quebra a escada do
 * próprio contrato. Com ela, nove dias de atraso custam R$ 27.250,00 e o décimo
 * dia — que é EXTRAVIO, o pior caso que o instrumento prevê — custa R$
 * 12.000,00. **Atrasar mais devolveria R$ 15.250,00 ao locatário.** Nenhuma
 * cláusula sustenta uma escada que desce, e a (1) sobe: R$ 4.750,00 aos nove
 * dias, R$ 12.000,00 aos dez.
 *
 * Quem quiser a outra leitura muda `diasDeAluguel` na chamada, não a conta.
 *
 * ## A multa é UMA, e a diária é por peça
 *
 * O §1º descreve um evento — a devolução que passou da data — e cobra dele uma
 * multa. O §2º é que manda **ratear por peça**, e o que rateia naturalmente é a
 * diária, porque cada peça tem o seu aluguel. Uma noiva que atrasa vestido, véu
 * e tiara paga três diárias e **uma** multa de R$ 250,00; cobrar R$ 750,00 de
 * multa seria ler o §2º como se ele multiplicasse o §1º em vez de reparti-lo.
 */

/** 16ª §1º — a multa fixa que acompanha o atraso. Uma por devolução atrasada. */
export const MULTA_DE_ATRASO = 250;

/** 16ª caput — a partir daqui não é atraso, é extravio. */
export const DIAS_PARA_EXTRAVIO = 10;

/** 16ª caput — quatro vezes o aluguel de cada peça extraviada. */
export const MULTIPLICADOR_DE_EXTRAVIO = 4;

export type TipoDoAtraso = "ATRASO" | "EXTRAVIO";

/** Uma peça que não voltou na data, com o que a conta precisa saber dela. */
export type PecaAtrasada = {
  /** Como a peça aparece na linha da cobrança. */
  descricao: string;
  /** O aluguel DESTA peça neste contrato, em reais (`contrato_itens.valor_unitario`). */
  aluguel: number;
  /** Os dias da janela de uso prevista — o divisor da diária. */
  diasDeAluguel: number;
  /** Dias de atraso desta peça. */
  dias: number;
};

export type LinhaDoAtraso = {
  descricao: string;
  tipo: TipoDoAtraso;
  clausula: string;
  dias: number;
  /** A diária desta peça, em reais — o número que a tela imprime. */
  diaria: number;
  valorC: number;
  valor: number;
};

export type CobrancaDoAtraso = {
  linhas: LinhaDoAtraso[];
  /** `MULTA_DE_ATRASO` quando alguma peça está na faixa do §1º; 0 quando todas extraviaram. */
  multa: number;
  multaC: number;
  valorC: number;
  valor: number;
  /** Alguma peça passou dos 10 dias. */
  temExtravio: boolean;
  /** O maior atraso da cobrança — o que a tela usa para o título. */
  maiorAtraso: number;
};

/**
 * **E244 — o dia até o qual a peça pode estar fora sem atraso: o que o PAPEL
 * manda, senão a janela.**
 *
 * A 16ª contava o atraso do fim da JANELA de uso (`casamento + usoDiasDepois`),
 * e o instrumento (E224) imprime outra data de devolução: a sugestão empurra
 * a devolução para a frente até dia de expediente (36 de 127 reservas caíam
 * em dia fechado — domingo e segunda no padrão da loja). Casamento sábado
 * 12/09, `usoDiasDepois = 2` → a janela termina segunda 14/09 (fechado) → o
 * papel diz **terça 15/09 18:00**; na terça de manhã `dias = 1`, a noiva
 * entrava na fila de atrasos e a 16ª §1º cobrava R$ 500,00 + R$ 250,00 =
 * **R$ 750,00 por devolver no dia que o papel manda.**
 *
 * Decisão (16/08/2026, na recomendação): **o papel é a régua** — é o que a
 * noiva assinou. Quando o contrato tem `dataDevolucao`, o fim previsto é o
 * DIA dela (instante lido em SP); sem ela (contrato anterior ao E224, ou
 * peça órfã sem contrato ativo), a janela continua sendo a régua. UMA função
 * nos três sítios da conta (a prévia/cobrança, a fila, as órfãs), pela lição
 * do E187 — a terceira grafia é a que diverge.
 */
export function fimPrevistoDaDevolucao(p: {
  casamentoData: Date | string;
  usoDiasDepois: number;
  /** `contratos.data_devolucao` — INSTANTE (E224); `null`/ausente = sem papel. */
  dataDevolucao?: Date | string | null;
}): string {
  if (p.dataDevolucao) return diaLocal(p.dataDevolucao);
  return addDias(diaDeNegocio(p.casamentoData), p.usoDiasDepois);
}

/**
 * Dias de atraso entre o fim do uso previsto e a volta, em dias de NEGÓCIO
 * (`YYYY-MM-DD`) — nunca negativo.
 *
 * Devolver no dia do fim previsto é **zero**, não um: a janela inclui o próprio
 * `fimUsoPrevisto`, que é o último dia em que a peça pode estar fora sem
 * atraso. Contar a partir dele cobraria uma diária de quem cumpriu o contrato.
 */
export function diasDeAtraso(fimUsoPrevisto: string, diaDaVolta: string): number {
  const ms = Date.parse(`${diaDaVolta}T00:00:00Z`) - Date.parse(`${fimUsoPrevisto}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** A faixa em que este atraso cai. */
export function tipoDoAtraso(dias: number): TipoDoAtraso {
  return dias >= DIAS_PARA_EXTRAVIO ? "EXTRAVIO" : "ATRASO";
}

/**
 * A diária desta peça, em CENTAVOS.
 *
 * **Arredonda aqui, e de propósito** — é o inverso da escolha do E211, e a razão
 * é outra. Lá o percentual do reajuste nunca aparece decomposto na tela, então
 * arredondar uma vez só no total é exatidão de graça. Aqui a diária é IMPRESSA:
 * a tela diz *"R$ 500,00 × 9 dias"*, e a vendedora confere a conta no papel. Se
 * o total viesse de `aluguel × dias ÷ janela` arredondado uma vez, a
 * multiplicação da tela não bateria com a linha da parcela por alguns centavos,
 * e uma conta que não fecha na frente da noiva é pior que meio centavo.
 *
 * O erro que essa escolha aceita está medido: no máximo meio centavo por dia,
 * ou **4 centavos** nos nove dias que a faixa do §1º admite.
 */
export function diariaEmCentavos(aluguel: number, diasDeAluguel: number): number {
  if (diasDeAluguel <= 0) return 0;
  return Math.round(centavos(aluguel) / diasDeAluguel);
}

/**
 * A cobrança do atraso, ou `null` quando não há atraso nenhum.
 *
 * `null` é a resposta certa da devolução no prazo, que é a maioria delas — a
 * porta só cobra o que a cláusula manda cobrar.
 */
export function cobrancaDoAtraso(pecas: readonly PecaAtrasada[]): CobrancaDoAtraso | null {
  const atrasadas = pecas.filter((p) => p.dias > 0);
  if (atrasadas.length === 0) return null;

  const linhas: LinhaDoAtraso[] = atrasadas.map((p) => {
    const tipo = tipoDoAtraso(p.dias);
    if (tipo === "EXTRAVIO") {
      const valorC = centavos(p.aluguel) * MULTIPLICADOR_DE_EXTRAVIO;
      return {
        descricao: p.descricao,
        tipo,
        clausula: "16ª",
        dias: p.dias,
        diaria: reais(diariaEmCentavos(p.aluguel, p.diasDeAluguel)),
        valorC,
        valor: reais(valorC),
      };
    }
    const diariaC = diariaEmCentavos(p.aluguel, p.diasDeAluguel);
    const valorC = diariaC * p.dias;
    return {
      descricao: p.descricao,
      tipo,
      clausula: "16ª §1º",
      dias: p.dias,
      diaria: reais(diariaC),
      valorC,
      valor: reais(valorC),
    };
  });

  // A multa é do §1º, e o §1º não alcança quem extraviou. Só entra se alguma
  // peça caiu na faixa dele — e entra UMA vez, não uma por peça.
  const temAtrasoSimples = linhas.some((l) => l.tipo === "ATRASO");
  const multaC = temAtrasoSimples ? centavos(MULTA_DE_ATRASO) : 0;

  const valorC = linhas.reduce((s, l) => s + l.valorC, 0) + multaC;
  return {
    linhas,
    multa: reais(multaC),
    multaC,
    valorC,
    valor: reais(valorC),
    temExtravio: linhas.some((l) => l.tipo === "EXTRAVIO"),
    maiorAtraso: Math.max(...linhas.map((l) => l.dias)),
  };
}

/**
 * A frase que a tela mostra e que a descrição da parcela grava — **a mesma**.
 *
 * Lição do E214 aplicada ao texto: duas grafias da mesma explicação divergiriam
 * no dia em que a régua mudasse, e a vendedora leria na tela uma conta que a
 * porta não praticou.
 */
export function explicacaoDoAtraso(c: CobrancaDoAtraso): string {
  const partes = c.linhas.map((l) =>
    l.tipo === "EXTRAVIO"
      ? `${l.descricao}: ${l.dias} dias — extravio (cláusula 16ª), ${MULTIPLICADOR_DE_EXTRAVIO}× o aluguel = ${brl(l.valor)}`
      : `${l.descricao}: ${l.dias} dia(s) × ${brl(l.diaria)} = ${brl(l.valor)}`,
  );
  if (c.multaC > 0) partes.push(`multa de atraso (cláusula 16ª §1º): ${brl(c.multa)}`);
  return `${partes.join("; ")}. Total ${brl(c.valor)}.`;
}
