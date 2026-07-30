/**
 * E130 (A1, decide P6) — a gramática do badge de status, num lugar só.
 *
 * Medido pela trilha A: 6 combinações contraditórias em 7 telas. "Agendado"
 * era rosa no dashboard e cinza na fila — onde "Faltou" era o MESMO cinza de
 * "Agendado": o estado que pede reação indistinguível do que está em dia sem
 * ler o texto. Cabine ativa era `default`/inativa `secondary` enquanto vestido
 * ativo era `secondary`/inativo `outline`; "Cancelado" era `destructive` e
 * "Recusado" (a mesma notícia, um passo antes) era `outline`.
 *
 * A tabela é a decisão P6 do backlog (default conservador, aplicado):
 *
 *   em dia            → default      (rosa da marca: o estado saudável)
 *   em andamento      → default      (acontecendo agora é saudável também)
 *   terminou bem      → secondary    (registro, não notícia)
 *   terminou mal      → destructive  (Cancelado E Recusado — a mesma classe)
 *   inativo           → outline      (apagado, não alarmante)
 *   precisa de reação → aviso        (Faltou: alguém precisa fazer algo)
 *
 * O mesmo movimento que o E99 fez com a escala de dinheiro: a decisão mora
 * aqui, as telas só chamam. A varredura em `status-badge.test.ts` impede o
 * mapeamento inline de voltar às 7 telas.
 *
 * (A3, a outra metade do épico, mora no componente de navegação — a decisão
 * das duas línguas está escrita lá.)
 */

export type SemanticaDeStatus =
  | "emDia"
  | "emAndamento"
  | "terminouBem"
  | "terminouMal"
  | "inativo"
  | "precisaDeReacao";

export type VarianteBadge = "default" | "secondary" | "destructive" | "outline" | "aviso";

export const VARIANTE_DA_SEMANTICA: Record<SemanticaDeStatus, VarianteBadge> = {
  emDia: "default",
  emAndamento: "default",
  terminouBem: "secondary",
  terminouMal: "destructive",
  inativo: "outline",
  precisaDeReacao: "aviso",
};

/** AGENDADO/EM_ATENDIMENTO/CONCLUIDO/FALTOU — agenda, fila e dashboard. */
export function varianteSituacao(situacao: string): VarianteBadge {
  const semantica: Record<string, SemanticaDeStatus> = {
    AGENDADO: "emDia",
    EM_ATENDIMENTO: "emAndamento",
    CONCLUIDO: "terminouBem",
    FALTOU: "precisaDeReacao",
  };
  return VARIANTE_DA_SEMANTICA[semantica[situacao] ?? "emDia"];
}

/** RASCUNHO/ENVIADO/APROVADO/RECUSADO — a lista de orçamentos. */
export function varianteStatusOrcamento(status: string): VarianteBadge {
  const semantica: Record<string, SemanticaDeStatus> = {
    RASCUNHO: "emAndamento",
    ENVIADO: "emAndamento",
    APROVADO: "terminouBem",
    RECUSADO: "terminouMal",
  };
  return VARIANTE_DA_SEMANTICA[semantica[status] ?? "emAndamento"];
}

/** ATIVO/CANCELADO — a lista de contratos. */
export function varianteStatusContrato(status: string): VarianteBadge {
  return VARIANTE_DA_SEMANTICA[status === "CANCELADO" ? "terminouMal" : "emDia"];
}

/** O par cadastral ativo/inativo — cabines, vestidos. */
export function varianteAtivo(ativo: boolean): VarianteBadge {
  return VARIANTE_DA_SEMANTICA[ativo ? "emDia" : "inativo"];
}
