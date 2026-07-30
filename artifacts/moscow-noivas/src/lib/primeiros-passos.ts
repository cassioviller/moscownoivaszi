/**
 * F41/E103 — o que falta configurar numa loja nova.
 *
 * A ordem real de montar uma loja — cabines e horário → atributos → vestidos →
 * escada de comissão → recorrências → primeira noiva — **não estava escrita em
 * lugar nenhum**. E pular a escada de comissão faz o cartão de comissão
 * simplesmente não aparecer, sem erro e sem explicação: a pessoa conclui que o
 * sistema não tem aquilo.
 *
 * É a irmã do tour do E24, e a diferença importa: o tour responde "o que você
 * PODE fazer"; isto responde "o que FALTA configurar". Um é catálogo, o outro é
 * dívida.
 *
 * Regra pura, das contagens que o sistema já faz. A ordem da lista é a ordem de
 * execução — não a de importância —, porque montar vestido antes de ter atributo
 * obriga a voltar.
 */

export type PassoPendente = {
  chave: string;
  titulo: string;
  porque: string;
  href: string;
};

export type ContagensDaLoja = {
  cabines: number;
  /** Tem regra de disponibilidade/horário configurada? */
  temHorario: boolean;
  atributos: number;
  vestidos: number;
  escadasDeComissao: number;
  recorrencias: number;
};

export function primeirosPassos(c: ContagensDaLoja): PassoPendente[] {
  const passos: PassoPendente[] = [];

  if (c.cabines === 0 || !c.temHorario) {
    passos.push({
      chave: "cabines",
      titulo: "Cadastrar cabines e o horário de funcionamento",
      porque: "Sem elas a agenda não tem onde encaixar um atendimento.",
      href: "/atendimentos/config",
    });
  }

  if (c.atributos === 0) {
    passos.push({
      chave: "atributos",
      titulo: "Definir os atributos do acervo",
      porque: "Decote, tecido, cauda — é por eles que a noiva vai filtrar o vestido.",
      href: "/catalogo",
    });
  }

  if (c.vestidos === 0) {
    passos.push({
      chave: "vestidos",
      titulo: "Cadastrar os primeiros vestidos",
      porque: "O acervo é o que a vendedora mostra e o que a reserva bloqueia.",
      href: "/vestidos",
    });
  }

  if (c.escadasDeComissao === 0) {
    passos.push({
      chave: "comissao",
      titulo: "Montar a escada de comissão",
      porque:
        "Sem regra, a vendedora não comissiona e o cartão de comissão nem aparece — sem erro e sem explicação.",
      href: "/comissoes",
    });
  }

  if (c.recorrencias === 0) {
    passos.push({
      chave: "recorrencias",
      titulo: "Cadastrar aluguel, salários e o que se repete todo mês",
      porque: "É o que faz a folha e a projeção de caixa dizerem a verdade.",
      href: "/financeiro/folha",
    });
  }

  return passos;
}

/**
 * `true` quando não há nada pendente — e é o sinal para o cartão SUMIR.
 *
 * Cuidado (a) do épico: isto ocupa o lugar mais visível do sistema, e um cartão
 * que fica para sempre vira banner, e banner vira paisagem. A mesma disciplina
 * do `AlertaCaixa`.
 */
export function lojaConfigurada(c: ContagensDaLoja): boolean {
  return primeirosPassos(c).length === 0;
}
