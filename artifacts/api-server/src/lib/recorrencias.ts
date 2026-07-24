/**
 * O motor de recorrência — o núcleo PURO que decide quais contas a competência
 * ainda deve ganhar.
 *
 * Nasceu dentro de `folha.ts` sabendo pagar só GENTE (E48). Aluguel, assinatura
 * e fornecedor fixo eram relançados à mão todo mês ao lado de uma idempotência
 * pronta que não os enxergava — então o motor foi generalizado, não duplicado:
 * a segunda implementação da idempotência é que seria cara.
 *
 * Puro de propósito (sem banco, sem Express): gerar duas vezes não pode dobrar
 * a conta de ninguém, e isso é exatamente o que um teste unitário rápido prova.
 */

/** Os tipos de conta que uma recorrência sabe gerar. */
export const TIPOS_RECORRENCIA = ["SALARIO", "DESPESA", "FORNECEDOR"] as const;
export type TipoRecorrencia = (typeof TIPOS_RECORRENCIA)[number];

export function tipoRecorrenciaValido(s: string): s is TipoRecorrencia {
  return (TIPOS_RECORRENCIA as readonly string[]).includes(s);
}

/** O que a geração precisa saber de uma recorrência. */
export type RecorrenciaParaGerar = {
  id: string;
  tipo: string;
  /** Só SALARIO tem colaborador. */
  usuarioId: string | null;
  /** O que a conta vai dizer. SALARIO não usa (a descrição é derivada). */
  descricao: string | null;
  categoria: string | null;
  fornecedor: string | null;
  valor: number;
  diaVencimento: number;
  ativo: boolean;
};

/** O que a geração precisa saber de uma conta já existente na competência. */
export type ContaGeradaExistente = {
  colaboradorId: string | null;
  recorrenciaId: string | null;
};

/** Uma conta a pagar pronta para inserir (sem id/lojaId — quem grava resolve). */
export type ContaRecorrente = {
  tipo: TipoRecorrencia;
  colaboradorId: string | null;
  competencia: string;
  descricao: string;
  categoria: string | null;
  fornecedor: string | null;
  valorPrevisto: number;
  vencimento: Date;
  recorrenciaId: string;
};

/**
 * Vencimento da conta gerada: o `diaVencimento` combinado, dentro da
 * competência, ancorado ao MEIO-DIA de São Paulo — `vencimento` é data de
 * NEGÓCIO, e nascer à meia-noite a faria escorregar um dia ao ser lida em UTC
 * (mesma âncora de vencimentoComissao e de diaParaISO no frontend).
 *
 * O dia é grampeado ao último dia do mês: um aluguel combinado para o dia 31
 * não existe em fevereiro, e "31/02" viraria 03/03 na aritmética do Date —
 * a conta de fevereiro venceria em março, calada.
 */
export function vencimentoDaCompetencia(competencia: string, diaVencimento: number): Date {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7)); // 1..12
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(Math.max(diaVencimento, 1), ultimoDia);
  const pad = (v: number) => String(v).padStart(2, "0");
  return new Date(`${competencia}-${pad(dia)}T12:00:00-03:00`);
}

/**
 * As contas que FALTAM para a competência estar completa.
 *
 * A idempotência mora aqui, e o critério de "já feita" depende do tipo:
 *
 *  - SALARIO dedup por `recorrenciaId` OU `colaboradorId` — uma UNIÃO
 *    deliberada. O segundo critério pega o salário lançado à mão e o que veio
 *    de uma recorrência antiga que foi trocada. O critério largo erra para o
 *    lado seguro: no pior caso falta uma conta e alguém a lança à mão; o
 *    estreito pagaria a mesma pessoa duas vezes, e isso só aparece no extrato.
 *  - DESPESA/FORNECEDOR dedup SÓ por `recorrenciaId`. Não há colaborador, e
 *    deduplicar por descrição bloquearia um segundo aluguel legítimo — a loja
 *    que tem duas salas tem duas contas de aluguel, e o motor não tem como
 *    saber que não são a mesma.
 *
 * Recorrência inativa não entra: `ativo: false` é a forma de tirar algo da
 * geração sem apagar o histórico das contas que já originou.
 */
export function montarContasDaCompetencia(
  competencia: string,
  recorrencias: readonly RecorrenciaParaGerar[],
  jaFeitas: readonly ContaGeradaExistente[],
): ContaRecorrente[] {
  const porRecorrencia = new Set(
    jaFeitas.map((c) => c.recorrenciaId).filter((id): id is string => !!id),
  );
  const porColaborador = new Set(
    jaFeitas.map((c) => c.colaboradorId).filter((id): id is string => !!id),
  );

  const contas: ContaRecorrente[] = [];
  for (const r of recorrencias) {
    if (!r.ativo) continue;
    if (!tipoRecorrenciaValido(r.tipo)) continue;
    if (porRecorrencia.has(r.id)) continue;

    if (r.tipo === "SALARIO") {
      // Salário sem colaborador não é salário; e o dedup largo só vale aqui.
      if (!r.usuarioId || porColaborador.has(r.usuarioId)) continue;
      contas.push({
        tipo: "SALARIO",
        colaboradorId: r.usuarioId,
        competencia,
        descricao: `Salário ${competencia}`,
        categoria: r.categoria,
        fornecedor: null,
        valorPrevisto: r.valor,
        vencimento: vencimentoDaCompetencia(competencia, r.diaVencimento),
        recorrenciaId: r.id,
      });
      continue;
    }

    // Sem descrição não há conta: melhor faltar uma linha do que aparecer
    // "undefined 2026-07" na lista de contas a pagar. A rota já recusa criar
    // recorrência assim — isto é a rede para o dado que entrou por outra porta.
    if (!r.descricao) continue;
    contas.push({
      tipo: r.tipo,
      colaboradorId: null,
      competencia,
      descricao: `${r.descricao} ${competencia}`,
      categoria: r.categoria,
      fornecedor: r.fornecedor,
      valorPrevisto: r.valor,
      vencimento: vencimentoDaCompetencia(competencia, r.diaVencimento),
      recorrenciaId: r.id,
    });
  }
  return contas;
}
