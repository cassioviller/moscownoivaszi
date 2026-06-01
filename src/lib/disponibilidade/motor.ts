import type { Bloqueio, Conflito, ErroBloqueio, Janela, Regras, Veredito } from "./tipos";
import { addDias, parseDiaUTC, janelasSobrepoem } from "./datas";

/**
 * Sentinela de "fim em aberto": usada quando o vestido está fora da loja por
 * tempo indeterminado (retirado e ainda não devolvido — Grill 2). Mantém a
 * janela de uso válida (inicio <= fim) e bloqueando qualquer consulta futura
 * até a devolução real ser registrada.
 */
export const FUTURO_DISTANTE = new Date(Date.UTC(9999, 11, 31));

/** true quando o vestido foi retirado mas a devolução ainda não foi registrada. */
export function pendenteDevolucao(bloqueio: Bloqueio): boolean {
  return bloqueio.retiradaDataReal != null && bloqueio.devolucaoDataReal == null;
}

/** Garante a invariante de calendário: toda janela projetada tem inicio <= fim. */
function validarJanela(j: Janela, bloqueioId: string): Janela {
  if (j.inicio.getTime() > j.fim.getTime()) {
    throw new Error(
      `Janela ${j.tipo} invertida no bloqueio ${bloqueioId}: ` +
        `inicio ${j.inicio.toISOString()} > fim ${j.fim.toISOString()}.`,
    );
  }
  return j;
}

/**
 * Projeta as janelas bloqueadas de um bloqueio, segundo as regras da loja.
 * - reserva_casamento → [prova, uso, (lavagem)], ancoradas em datas reais quando houver.
 * - manutencao        → [manutencao], de retiradaDataReal até devolucaoDataReal (ou FUTURO_DISTANTE se em aberto).
 * Lança se faltarem datas obrigatórias ou se alguma janela ficar invertida.
 */
export function calcularJanelas(bloqueio: Bloqueio, regras: Regras): Janela[] {
  if (bloqueio.tipo === "manutencao") {
    if (!bloqueio.retiradaDataReal) {
      throw new Error(`Bloqueio de manutenção ${bloqueio.id} exige retiradaDataReal.`);
    }
    // Manutenção em aberto (sem devolução registrada): vestido fora por tempo
    // indeterminado → bloqueia até a volta ser registrada, simétrico ao Grill 2.
    const inicio = parseDiaUTC(bloqueio.retiradaDataReal);
    const fim = bloqueio.devolucaoDataReal
      ? parseDiaUTC(bloqueio.devolucaoDataReal)
      : FUTURO_DISTANTE;
    return [validarJanela({ tipo: "manutencao", inicio, fim }, bloqueio.id)];
  }

  // reserva_casamento
  if (!bloqueio.casamentoData) {
    throw new Error(`Bloqueio de reserva ${bloqueio.id} exige casamentoData.`);
  }
  const casamento = parseDiaUTC(bloqueio.casamentoData);

  const provaInicio = bloqueio.provaDataReal
    ? parseDiaUTC(bloqueio.provaDataReal)
    : addDias(casamento, -regras.provaDiasAntes);
  const provaFim = addDias(provaInicio, regras.provaDuracao);

  const usoInicio = bloqueio.retiradaDataReal
    ? parseDiaUTC(bloqueio.retiradaDataReal)
    : addDias(casamento, -regras.usoDiasAntes);

  const janelas: Janela[] = [{ tipo: "prova", inicio: provaInicio, fim: provaFim }];

  if (bloqueio.devolucaoDataReal) {
    // Devolução registrada: uso fecha na devolução; lavagem segue a partir dela.
    const devolucao = parseDiaUTC(bloqueio.devolucaoDataReal);
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: devolucao });
    janelas.push({
      tipo: "lavagem",
      inicio: devolucao,
      fim: addDias(devolucao, regras.lavagemDiasDepois),
    });
  } else if (bloqueio.retiradaDataReal) {
    // Grill 2: retirou e NÃO devolveu → vestido fora por tempo indeterminado.
    // Uso aberto até a devolução real ser registrada; sem projeção e sem lavagem.
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: FUTURO_DISTANTE });
  } else {
    // Projeção pura a partir do casamento.
    const devolucao = addDias(casamento, regras.usoDiasDepois);
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: devolucao });
    janelas.push({
      tipo: "lavagem",
      inicio: devolucao,
      fim: addDias(devolucao, regras.lavagemDiasDepois),
    });
  }

  return janelas.map((j) => validarJanela(j, bloqueio.id));
}

export interface VestidoDisponivelParams {
  /** Vestido sendo avaliado; só bloqueios deste vestido entram na conta. */
  vestidoId: string;
  /** Data de casamento hipotética ("YYYY-MM-DD") para a qual queremos saber se o vestido está livre. */
  casamentoDataCandidata: string;
  regras: Regras;
  /** Bloqueios existentes (idealmente já filtrados por loja+vestido na query). */
  bloqueiosExistentes: Bloqueio[];
  /**
   * Ao revalidar/editar uma reserva já existente, passe seu id aqui para que ela
   * não colida consigo mesma. Sem isso, mover a data de uma reserva sempre daria
   * "indisponível" porque a versão atual ainda está em bloqueiosExistentes.
   */
  excluirBloqueioId?: string;
}

/**
 * Um vestido está LIVRE para a data candidata quando as janelas projetadas dessa
 * data (como se fosse uma nova reserva) não se sobrepõem a nenhuma janela dos
 * bloqueios existentes do mesmo vestido. Filtra por vestidoId por segurança.
 */
export function vestidoDisponivel(params: VestidoDisponivelParams): Veredito {
  const { vestidoId, casamentoDataCandidata, regras, bloqueiosExistentes, excluirBloqueioId } = params;

  const candidato: Bloqueio = {
    id: "__candidato__",
    vestidoId,
    tipo: "reserva_casamento",
    casamentoData: casamentoDataCandidata,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  };
  const janelasCandidata = calcularJanelas(candidato, regras);

  const conflitos: Conflito[] = [];
  const errosBloqueio: ErroBloqueio[] = [];
  for (const bloqueio of bloqueiosExistentes) {
    if (bloqueio.vestidoId !== vestidoId) continue;
    if (excluirBloqueioId && bloqueio.id === excluirBloqueioId) continue; // edição: não colide consigo mesma
    let janelasExistente: Janela[];
    try {
      janelasExistente = calcularJanelas(bloqueio, regras);
    } catch (e) {
      // Fail-safe (decisão #6): um bloqueio que não projeta NÃO é pulado em
      // silêncio (isso liberaria o vestido) nem derruba a consulta. Ele bloqueia
      // o vestido e o erro é reportado para a UI corrigir o dado.
      errosBloqueio.push({
        bloqueioId: bloqueio.id,
        motivo: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    for (const janelaCandidata of janelasCandidata) {
      for (const janelaExistente of janelasExistente) {
        if (janelasSobrepoem(janelaCandidata, janelaExistente)) {
          conflitos.push({ bloqueioId: bloqueio.id, janelaCandidata, janelaExistente });
        }
      }
    }
  }

  return {
    disponivel: conflitos.length === 0 && errosBloqueio.length === 0,
    conflitos,
    errosBloqueio,
  };
}
