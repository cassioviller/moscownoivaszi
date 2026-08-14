import { brl, centavos, reais } from "./dinheiro";
import { addDias, diaLocal } from "./datas";

/**
 * **A rescisão calcula** — E217, cláusulas 8ª §2º, 11ª, 12ª, 13ª (e §3º) e 18ª
 * do instrumento de locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **8ª §2º** — O valor referente à reserva **não será devolvido sob qualquer
 * > hipótese**, mesmo em caso de cancelamento do contrato.
 * >
 * > **11ª** — Caso o LOCATÁRIO já tenha realizado o pagamento pelo serviço, e
 * > mesmo assim requisite a rescisão imotivada, terá o valor da quantia paga
 * > devolvido, **deduzindo-se 60%**, na qualidade de multa de rescisão.
 * >
 * > **12ª** — Se tratar de rescisão de vestido exclusivo para primeiro
 * > aluguel, será cobrado, na qualidade de multa de rescisão, **o valor
 * > integral do aluguel**.
 * >
 * > **13ª** — Caso seja a LOCADORA quem requeira a rescisão imotivada, deverá
 * > devolver a quantia que se refere aos serviços por ele não prestados.
 * > **§3º** — [...] o prazo para a devolução do valor devido pela LOCADORA ao
 * > LOCATÁRIO será de **30 dias**.
 * >
 * > **18ª** — Em caso de pagamento total do aluguel no ato da reserva, o
 * > cliente receberá o valor excedente ao valor da reserva [...] se comunicar
 * > o cancelamento até ___ dias antes da data de retirada.
 *
 * O E216 entregou o predicado da 12ª (`exclusividade.ts`) e deixou declarado
 * o que faltava decidir aqui: a base do "valor integral do aluguel" é o
 * **item**, não o contrato — é o que a peça exclusiva causou, e é o que a tela
 * do E216 já anuncia (*"a multa é o valor integral do aluguel [da peça]"*).
 *
 * ## A ordem da dedução, e por que ela não é uma conta só
 *
 * Um contrato pode ter peças exclusivas e comuns misturadas, e as três
 * cláusulas de dinheiro tratam o pago de formas diferentes. A ordem que fecha
 * sem sobra nem dobra:
 *
 * 1. **A reserva (`numero=0`) sai da conta primeiro, e não volta nunca** —
 *    8ª §2º é absoluta, e não distingue peça exclusiva de comum.
 * 2. **O restante se rateia pelo valor dos itens** — a fração que corresponde
 *    às peças exclusivas fica **inteira** com a loja (12ª); só a fração dos
 *    itens comuns segue para a régua da 11ª (ou da 18ª).
 * 3. **A régua da 11ª deduz 60%** do que sobrou, salvo a exceção da 18ª.
 *
 * ## A exceção da 18ª, e a leitura que ela pede
 *
 * O texto fala em pagar o total **"no ato da reserva"**, mas o sistema não
 * registra QUANDO cada centavo entrou em relação à assinatura — só quanto foi
 * recebido até agora. **Adotada a leitura operacional**: "pagamento total"
 * é o contrato estar com o carnê (`origem: PLANO`) inteiramente quitado no
 * momento do cancelamento, não importa em quantas parcelas. É interpretação,
 * não medição, e está aqui para a dona corrigir em uma linha — trocar
 * `totalPagoC >= valorTotalC` pela condição que ela quis dizer.
 *
 * Cumprida essa leitura **e** o prazo (`prazoDevolucaoReservaDias`, D3,
 * contado da retirada), a 18ª **substitui** a dedução de 60% da 11ª para a
 * fração dos itens comuns: devolve o excedente inteiro, sem multa. Sem prazo
 * preenchido no contrato, a cláusula não dispara — o sistema não inventa um
 * número que ninguém negociou.
 *
 * ## A 13ª — quando é a LOJA quem cancela
 *
 * Nada no sistema registra "quanto do serviço já foi prestado" — a fração
 * consumida antes da retirada. **Adotada a leitura literal e conservadora**:
 * cancelamento pela loja devolve **tudo** que entrou, reserva incluída, porque
 * reter o sinal puniria uma noiva que não causou a rescisão. Se um dia a peça
 * já tiver saído (retirada real) antes do cancelamento pela loja, este módulo
 * não desconta o uso já ocorrido — fica contável, não é o caso comum.
 */

/** Um item do contrato, com o que a conta da rescisão precisa saber dele. */
export type ItemDaRescisao = {
  descricao: string;
  /** `contrato_itens.valor_unitario × quantidade`, em reais. */
  valor: number;
  /** O predicado da 12ª (`ehExclusivaDePrimeiroAluguel`), já resolvido. */
  exclusivaDePrimeiroAluguel: boolean;
};

export type EntradaDaRescisao = {
  iniciativa: "LOCATARIA" | "LOJA";
  itens: readonly ItemDaRescisao[];
  /** `contratos.valor_total`, em reais — a base para o rateio dos itens. */
  valorTotalContrato: number;
  /** Soma de `parcelas.valor_recebido` das parcelas `origem: PLANO`. */
  totalPagoPlano: number;
  /** `valorRecebido` da parcela `numero=0` (a reserva/entrada), ou 0. */
  reservaPaga: number;
  /** D3 — dias exigidos de antecedência da retirada para a 18ª disparar. `null` = cláusula não pactuada. */
  prazoDevolucaoReservaDias: number | null;
  dataRetirada: Date | string | null;
  /** O dia do cancelamento — passado de fora para a função ficar pura. */
  hoje: Date | string;
};

export type LinhaDaRescisao = {
  descricao: string;
  clausula: string;
  /** O que a loja RETÉM desta linha, em reais. */
  retido: number;
  /** O que a loja DEVOLVE desta linha, em reais. */
  devolvido: number;
};

export type Rescisao = {
  linhas: LinhaDaRescisao[];
  /** Soma do que a loja devolve — vira `contas_pagar` (13ª §3º) quando > 0. */
  devolucaoTotal: number;
  /** Soma do que a loja retém como multa/sinal. */
  retencaoTotal: number;
  /** A exceção da 18ª disparou. */
  aplicou18a: boolean;
  explicacao: string;
};

/**
 * **S-C140 — o estorno que o instrumento não autoriza.**
 *
 * O diálogo de cancelar tem, desde antes do E217, uma escolha sobre o dinheiro
 * que já entrou: *"mantém no caixa"* ou *"devolvi o valor — estorna tudo"*. A
 * segunda devolve **100% do recebido**, e a 8ª §2º diz que a reserva não volta
 * **sob qualquer hipótese**: num contrato com R$ 1.200,00 de reserva e mais
 * R$ 1.000,00 de carnê pagos, a cláusula retém R$ 1.800,00 e devolve R$ 400,00
 * — o estorno devolve os R$ 2.200,00 inteiros, R$ 1.800,00 a mais do que o
 * instrumento autoriza.
 *
 * **A régua não impede a dona de decidir: obriga a dizer por quê** — é o molde
 * do E214, onde a taxa de avaria fora da faixa entra com justificativa e vai
 * para a trilha nomeada. A mesma função responde à TELA (que avisa antes do
 * clique) e ao SERVIDOR (que grava a divergência), para as duas não divergirem.
 *
 * `null` é "não há divergência": ou o caixa segue a régua (`manter`), ou não há
 * o que reter (rescisão pela loja, contrato sem um centavo pago).
 */
export function estornoContraARescisao(
  rescisao: Pick<Rescisao, "retencaoTotal">,
  destinoPago: "manter" | "estornar",
): string | null {
  if (destinoPago !== "estornar" || rescisao.retencaoTotal <= 0) return null;
  return `O contrato manda RETER ${brl(rescisao.retencaoTotal)}. Estornar tudo devolve esse valor contra as cláusulas 8ª §2º/11ª/12ª — escreva no motivo por que a loja decidiu devolver.`;
}

/** A rescisão, sempre — mesmo pagamento zero devolve/retém zero, com a linha dizendo por quê. */
export function calcularRescisao(e: EntradaDaRescisao): Rescisao {
  const totalPagoC = centavos(e.totalPagoPlano);

  if (e.iniciativa === "LOJA") {
    // 13ª — a loja devolve o que entrou; nada é retido (ver nota do módulo).
    const linhas: LinhaDaRescisao[] =
      totalPagoC > 0
        ? [{ descricao: "Rescisão pela locadora", clausula: "13ª", retido: 0, devolvido: reais(totalPagoC) }]
        : [];
    return {
      linhas,
      devolucaoTotal: reais(totalPagoC),
      retencaoTotal: 0,
      aplicou18a: false,
      explicacao:
        totalPagoC > 0
          ? `Rescisão pela locadora (cláusula 13ª): devolve o que foi pago, ${brl(reais(totalPagoC))}.`
          : "Rescisão pela locadora (cláusula 13ª): nada foi pago, nada a devolver.",
    };
  }

  // 8ª §2º — a reserva sai primeiro, e não volta nunca.
  const reservaRetidaC = Math.min(centavos(e.reservaPaga), totalPagoC);
  const restanteC = totalPagoC - reservaRetidaC;

  // O restante se rateia pelo valor dos itens — a fração exclusiva fica
  // inteira com a loja (12ª); só a comum segue para a 11ª/18ª.
  const valorTotalItensC = centavos(
    e.itens.reduce((s, it) => s + it.valor, 0) || e.valorTotalContrato,
  );
  const valorExclusivoC = centavos(
    e.itens.filter((it) => it.exclusivaDePrimeiroAluguel).reduce((s, it) => s + it.valor, 0),
  );
  const restanteExclusivoC =
    valorTotalItensC > 0 ? Math.round((restanteC * valorExclusivoC) / valorTotalItensC) : 0;
  const restanteComumC = restanteC - restanteExclusivoC;

  // 18ª — só para a fração COMUM: pagamento total do carnê + prazo pactuado
  // (D3) cumprido conta da retirada.
  const pagouIntegral = totalPagoC >= centavos(e.valorTotalContrato) && centavos(e.valorTotalContrato) > 0;
  const dentroDoPrazo18a =
    e.prazoDevolucaoReservaDias != null && e.dataRetirada != null
      ? diaLocal(e.hoje) <= addDias(diaLocal(e.dataRetirada), -e.prazoDevolucaoReservaDias)
      : false;
  const aplicou18a = pagouIntegral && dentroDoPrazo18a;

  const devolucaoComumC = aplicou18a ? restanteComumC : Math.round(restanteComumC * 0.4);
  const multaComumC = restanteComumC - devolucaoComumC;

  const linhas: LinhaDaRescisao[] = [];
  if (reservaRetidaC > 0) {
    linhas.push({
      descricao: "Reserva",
      clausula: "8ª §2º",
      retido: reais(reservaRetidaC),
      devolvido: 0,
    });
  }
  if (restanteExclusivoC > 0) {
    linhas.push({
      descricao: "Peça(s) exclusiva(s) de primeiro aluguel",
      clausula: "12ª",
      retido: reais(restanteExclusivoC),
      devolvido: 0,
    });
  }
  if (restanteComumC > 0) {
    linhas.push({
      descricao: aplicou18a ? "Demais peças (18ª — sem dedução)" : "Demais peças (multa de 60%)",
      clausula: aplicou18a ? "18ª" : "11ª",
      retido: reais(multaComumC),
      devolvido: reais(devolucaoComumC),
    });
  }

  const devolucaoTotalC = devolucaoComumC;
  const retencaoTotalC = reservaRetidaC + restanteExclusivoC + multaComumC;

  const partes = linhas.map((l) =>
    l.devolvido > 0
      ? `${l.descricao} (${l.clausula}): retém ${brl(l.retido)}, devolve ${brl(l.devolvido)}`
      : `${l.descricao} (${l.clausula}): retém ${brl(l.retido)}`,
  );
  const explicacao =
    partes.length > 0
      ? `${partes.join("; ")}. Total devolvido: ${brl(reais(devolucaoTotalC))}.`
      : "Nada foi pago — nada a reter, nada a devolver.";

  return {
    linhas,
    devolucaoTotal: reais(devolucaoTotalC),
    retencaoTotal: reais(retencaoTotalC),
    aplicou18a,
    explicacao,
  };
}
