/**
 * F5/E98 — o próximo passo da noiva, derivado da etapa.
 *
 * A ficha mostra oito cards, e quando a noiva é nova quase todos estão vazios:
 * a vendedora lê os oito para descobrir que o que falta é marcar o primeiro
 * atendimento. A informação para responder isso sempre esteve na `etapa` — o
 * funil inteiro do E31 gira em torno dela; ninguém a tinha traduzido em uma
 * frase e um botão.
 *
 * Regra pura de propósito: dá para testar sem montar tela, e é o tipo de coisa
 * que muda quando o funil muda.
 */

export type ProximoPasso = {
  /** O que fazer, em imperativo curto. */
  titulo: string;
  /** Por que agora — some quando não acrescenta nada. */
  detalhe?: string;
  /** Caminho relativo à loja (`/noivas/x` vira `/loja/:id/noivas/x` na tela). */
  href: string;
  rotuloAcao: string;
};

export type EntradaProximoPasso = {
  etapa: string;
  leadId: string;
  /**
   * Tem contrato ATIVO? A etapa sozinha não responde depois do fechamento.
   *
   * **S-C120 — `undefined` é "não se sabe", e a ficha passou a saber a
   * diferença.** Quem não vê o módulo `contratos` (a Recepção, desde o E172)
   * não dispara a consulta, e a lista dela chegava aqui como `[]`: o mesmo
   * `false` de "não tem contrato". O banner então mandava **fechar o contrato**
   * que já estava fechado, para quem não pode fechá-lo — a versão mais alta do
   * defeito que os dois cards da ficha cometiam em voz baixa.
   *
   * A ausência segue o idioma que os dois campos abaixo já usavam: quando não se
   * sabe, o passo que DEPENDE de saber cala.
   */
  temContratoAtivo?: boolean;
  contratoAtivoId?: string | null;
  /** Já existe orçamento em qualquer status? */
  temOrcamento: boolean;
  /**
   * E125 (D3): há atendimento/prova FUTURA marcada? A etapa não sabe da
   * agenda (criar atendimento não a avança), e o banner sugeria "Agendar"
   * com o horário já marcado. Ausente = não se sabe (a ficha só chama com a
   * agenda respondida; quem não vê o módulo agenda cai no comportamento
   * antigo).
   */
  temVisitaFutura?: boolean;
  /**
   * S-O12 — há orçamento que a noiva ACEITOU e ainda não virou contrato?
   *
   * A etapa não responde isso: ela para em ORCAMENTO_ABERTO depois do aceite,
   * porque não existe etapa "ACEITO" no funil (S-O10, decisão de produto
   * adiada). Sem este campo a faixa mandava ENVIAR a proposta que a noiva já
   * tinha aceitado. Ausente = não se sabe, e vale o comportamento antigo.
   */
  temAceiteSemContrato?: boolean;
};

/**
 * O passo que falta, ou `null` quando a jornada está em dia — e o `null` é
 * significativo: uma faixa que aparece sempre vira moldura e ninguém lê.
 */
export function proximoPasso(e: EntradaProximoPasso): ProximoPasso | null {
  if (e.etapa === "PERDIDO") return null;

  // Depois do contrato o assunto é dinheiro, e ele não mora na etapa: uma noiva
  // pode estar em EM_PROVAS com parcelas vencendo.
  if (e.temContratoAtivo) {
    return {
      titulo: "Acompanhar o pagamento",
      detalhe: "O contrato está ativo — as parcelas dela vivem no carnê.",
      href: e.contratoAtivoId ? `/contratos/${e.contratoAtivoId}` : "/financeiro/receber",
      rotuloAcao: "Ver parcelas",
    };
  }

  /**
   * S-C120 — daqui para baixo, todo passo que fala de PROPOSTA afirma, no meio
   * da frase, que não existe contrato ativo: *"o vestido só fica dela quando o
   * contrato fechar"*. Sem saber, o passo honesto é nenhum — e os três primeiros
   * (agendar, preencher interesses) seguem, porque não dependem do contrato e
   * são justamente os da Recepção, que é quem não o vê.
   */
  const seiDoContrato = e.temContratoAtivo !== undefined;

  switch (e.etapa) {
    case "NOVO":
      // E125: com visita já marcada, sugerir "Agendar" é mandar marcar de
      // novo o que existe — o preparo que falta é o mesmo do agendado.
      if (e.temVisitaFutura) {
        return {
          titulo: "Registrar os interesses dela",
          detalhe: "O horário já está marcado — chegar sabendo o estilo encurta o atendimento.",
          href: `/noivas/${e.leadId}/interesses`,
          rotuloAcao: "Preencher",
        };
      }
      return {
        titulo: "Agendar o primeiro atendimento",
        detalhe: "Ela entrou no funil e ainda não tem horário marcado.",
        href: `/atendimentos/novo?noiva=${e.leadId}`,
        rotuloAcao: "Agendar",
      };
    case "INTERESSES_PREENCHIDOS":
      // E125: interesses prontos e visita marcada — a jornada está em dia, e
      // uma faixa que aparece sempre vira moldura.
      if (e.temVisitaFutura) return null;
      return {
        titulo: "Agendar o atendimento",
        detalhe: "Você já sabe o que ela procura — falta marcar a visita.",
        href: `/atendimentos/novo?noiva=${e.leadId}`,
        rotuloAcao: "Agendar",
      };
    case "ATENDIMENTO_AGENDADO":
      return {
        titulo: "Registrar os interesses dela",
        detalhe: "Chegar à prova sabendo o estilo e o teto encurta o atendimento.",
        href: `/noivas/${e.leadId}/interesses`,
        rotuloAcao: "Preencher",
      };
    case "EM_ATENDIMENTO":
      if (!seiDoContrato) return null;
      return e.temOrcamento
        ? {
            titulo: "Fechar o orçamento",
            detalhe: "Ela está na loja — o orçamento aberto é o próximo passo da conversa.",
            href: `/noivas/${e.leadId}`,
            rotuloAcao: "Ver orçamentos",
          }
        : {
            titulo: "Montar o orçamento",
            detalhe: "Ela está em atendimento e ainda não tem proposta.",
            href: `/noivas/${e.leadId}`,
            rotuloAcao: "Criar orçamento",
          };
    case "ORCAMENTO_ABERTO":
      /**
       * S-O12 — o aceite dela muda o passo, e a etapa não sabe disso.
       *
       * O funil para em ORCAMENTO_ABERTO depois do aceite (não há etapa
       * "ACEITO" — S-O10), então a faixa mandava "Enviar a proposta" para quem
       * já tinha dito SIM: o passo cumprido de volta, no lugar do que falta. E
       * o que falta é o contrato — é ele que tira o vestido do mercado.
       */
      if (!seiDoContrato) return null;
      return e.temAceiteSemContrato
        ? {
            titulo: "Fechar o contrato",
            detalhe: "Ela já disse sim — o vestido só fica dela quando o contrato fechar.",
            href: `/noivas/${e.leadId}`,
            rotuloAcao: "Ver orçamentos",
          }
        : {
            titulo: "Enviar a proposta para ela",
            detalhe: "Orçamento aberto que não chega à noiva não vira contrato.",
            href: `/noivas/${e.leadId}`,
            rotuloAcao: "Ver orçamentos",
          };
    default:
      // CONTRATO_FECHADO sem contrato ativo, EM_PROVAS, RETIRADO, DEVOLVIDO,
      // CASAMENTO_REALIZADO: ou já foi tratado acima, ou a jornada acabou.
      return null;
  }
}
