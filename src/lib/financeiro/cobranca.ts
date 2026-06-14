// src/lib/financeiro/cobranca.ts
// Cobrança/inadimplência: aging por faixa de atraso + histórico de cobranças por noiva.
// faixaDeAtraso e linkWhatsApp são PUROS (testáveis). As demais funções leem/escrevem.

const DIA_MS = 86_400_000;

export type Faixa = "ate30" | "d31a60" | "mais60";

/** Classifica dias de atraso (≥1) em faixa. Vencendo hoje (0) não é atraso e não chega aqui. */
export function faixaDeAtraso(diasDeAtraso: number): Faixa {
  if (diasDeAtraso <= 30) return "ate30";
  if (diasDeAtraso <= 60) return "d31a60";
  return "mais60";
}

/** Deep-link wa.me (DDI Brasil) com a mensagem encodada. null se a noiva não tem whatsapp. */
export function linkWhatsApp(whatsapp: string | null, mensagem: string): string | null {
  if (!whatsapp) return null;
  const digitos = whatsapp.replace(/\D/g, "");
  if (digitos === "") return null;
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(mensagem)}`;
}
