/**
 * S-O97 — **a prova não segue a data do casamento**, e por que ela é derivada.
 *
 * `PATCH /reservas/:id` com `casamentoData` nova propaga o dia para os
 * bloqueios vinculados (`reservas.ts:395-453`) e, desde o E173, para o contrato
 * ATIVO. Ele **não** toca em `atendimentos`: a prova marcada para a janela do
 * casamento ANTIGO continua exatamente onde estava.
 *
 * Medido em 2026-08-12, com a régua de fábrica (prova 14 dias antes, uso 3):
 *
 * ```
 * casamento 05/09 → prova marcada 26/08   (dentro da janela 22/08–01/09)
 * PATCH casamentoData = 16/08             : 200
 * janela de prova nova                    : 02/08–12/08
 * a prova continua em                     : 26/08   ← 10 dias DEPOIS do casamento
 * ```
 *
 * **Mover para trás é o caso pior**: a noiva vem experimentar um vestido que ela
 * já usou. Mover para a frente deixa a prova longe demais — e naquele dia a peça
 * pode estar reservada para outra noiva, porque a janela dela andou junto.
 *
 * **É aviso, não recusa**, pela mesma razão que a prova órfã
 * ([[prova-orfa]]): o `POST /atendimentos` aceita prova em qualquer dia de
 * propósito (G1/E161), e quem move a data da reserva não é quem decide o
 * horário da noiva. O servidor CONTA na trilha (`RESERVA_DATA_MOVIDA`), a tela
 * MARCA, e quem fala com a noiva decide.
 *
 * **Não há coluna nova, e é de propósito** (regra 26). O atendimento já carrega
 * o `bloqueio` inteiro em toda resposta de `GET /atendimentos`
 * (`agenda.ts:ATENDIMENTO_WITH`), e `casamentoData` viaja nele. O que faltava
 * era a pergunta.
 */

import { janelaDeProvaDoDia } from "@workspace/agenda-core";
import { diaDeNegocio, diaLocal } from "@/lib/financeiro/datas";

/** O que basta saber sobre o atendimento para responder à pergunta. */
export type AtendimentoParaJanela = {
  tipo?: string | null;
  situacao?: string | null;
  inicio?: string | Date | null;
  bloqueio?: { casamentoData?: string | Date | null } | null;
};

/** Os dois números da régua da loja que definem a janela de prova. */
export type RegraDaJanela = {
  provaDiasAntes?: number | null;
  usoDiasAntes?: number | null;
};

/**
 * A janela de PROVA prevista para um casamento: `[D − provaDiasAntes,
 * D − usoDiasAntes − 1]`. `null` quando a régua não deixa dia nenhum — é a
 * S-A23, e ali a pergunta desta lib não tem resposta útil.
 *
 * **E240/S-O116 — era a mesma conta de
 * `api-server/src/lib/disponibilidade.ts:janelaDeProvaPrevista`, escrita uma
 * segunda vez aqui** porque o servidor não a manda mastigada, e as duas só
 * estavam presas pelos MESMOS números nos dois testes. Agora as duas importam
 * `janelaDeProvaDoDia` do `@workspace/agenda-core`; o que sobra deste lado é
 * a conversão do casamento para DIA — e ela era o defeito armado: a régua
 * fazia `diaLocal` sobre uma data de NEGÓCIO, e `2028-09-05T00:00:00Z` dava
 * 04/09 (janela 21/08–31/08) onde o servidor dizia 22/08–01/09. Zero linhas
 * desancoradas no banco desde o E197 — armado, não disparado.
 */
export function janelaDeProva(
  casamento: string | Date,
  regra: RegraDaJanela,
): { inicio: string; fim: string } | null {
  return janelaDeProvaDoDia(diaDeNegocio(casamento), {
    provaDiasAntes: regra.provaDiasAntes ?? 0,
    usoDiasAntes: regra.usoDiasAntes ?? 0,
  });
}

/**
 * A prova ficou para trás quando a reserva mudou de data.
 *
 * `situacao` entra na conta pela razão da prova órfã: CONCLUIDO ou FALTOU é
 * história, e avisar sobre o dia de um fato passado é ruído. Sem a régua da
 * loja carregada, a resposta é `null` — selo que aparece por default errado é
 * pior que selo que demora um piscar.
 */
export function provaForaDaJanela(
  a: AtendimentoParaJanela | null | undefined,
  regra: RegraDaJanela | null | undefined,
): "DEPOIS_DO_CASAMENTO" | "FORA_DA_JANELA" | null {
  if (!a || !regra) return null;
  if (a.tipo !== "PROVA") return null;
  if (a.situacao !== "AGENDADO" && a.situacao !== "EM_ATENDIMENTO") return null;
  const casamento = a.bloqueio?.casamentoData;
  if (!casamento || !a.inicio) return null;

  // A prova é INSTANTE (dia local); o casamento é data de NEGÓCIO (S-O117).
  const diaProva = diaLocal(a.inicio);
  const diaCasamento = diaDeNegocio(casamento);
  if (diaProva > diaCasamento) return "DEPOIS_DO_CASAMENTO";

  const janela = janelaDeProva(casamento, regra);
  if (!janela) return null;
  return diaProva < janela.inicio || diaProva > janela.fim ? "FORA_DA_JANELA" : null;
}

/**
 * A frase, num lugar só — a mesma razão da S-M9 que o selo da prova órfã já
 * pagou. Ela diz a CONSEQUÊNCIA, não o estado interno: quem lê quer saber que a
 * noiva vai vir no dia errado, não que um intervalo deixou de conter uma data.
 */
export const PROVA_FORA_DA_JANELA_SELO: Record<
  "DEPOIS_DO_CASAMENTO" | "FORA_DA_JANELA",
  string
> = {
  DEPOIS_DO_CASAMENTO: "Prova depois do casamento",
  FORA_DA_JANELA: "Prova fora da janela",
};

export const PROVA_FORA_DA_JANELA_EXPLICACAO: Record<
  "DEPOIS_DO_CASAMENTO" | "FORA_DA_JANELA",
  string
> = {
  DEPOIS_DO_CASAMENTO:
    "A data do casamento mudou e esta prova ficou para depois dele. Combine outro dia com a noiva.",
  FORA_DA_JANELA:
    "A data do casamento mudou e esta prova ficou fora do período de prova da reserva — " +
    "naquele dia o vestido pode já estar com outra noiva. Confirme o dia com ela.",
};

/** Quantas provas de uma lista ficaram para trás. Zero é o normal. */
export function contarProvasForaDaJanela(
  atendimentos: readonly AtendimentoParaJanela[],
  regra: RegraDaJanela | null | undefined,
): number {
  return atendimentos.filter((a) => provaForaDaJanela(a, regra) !== null).length;
}
