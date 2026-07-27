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
  /** Tem contrato ATIVO? A etapa sozinha não responde depois do fechamento. */
  temContratoAtivo: boolean;
  contratoAtivoId?: string | null;
  /** Já existe orçamento em qualquer status? */
  temOrcamento: boolean;
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

  switch (e.etapa) {
    case "NOVO":
      return {
        titulo: "Agendar o primeiro atendimento",
        detalhe: "Ela entrou no funil e ainda não tem horário marcado.",
        href: `/atendimentos/novo?noiva=${e.leadId}`,
        rotuloAcao: "Agendar",
      };
    case "INTERESSES_PREENCHIDOS":
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
      return {
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
