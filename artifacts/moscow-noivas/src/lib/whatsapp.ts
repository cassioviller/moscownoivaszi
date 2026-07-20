/**
 * WhatsApp sem integração paga: deep-links `wa.me` com mensagem pronta.
 * Nasceu no financeiro (cobrança) e virou módulo neutro quando a agenda
 * passou a confirmar atendimento por aqui também (E8).
 */

/**
 * Deep-link wa.me. Prefixa o DDI 55 só se o número for nacional (10–11
 * dígitos) e mantém quando já vem com DDI (12–13 começando em 55); qualquer
 * outro tamanho é implausível e vira null em vez de um link quebrado.
 */
export function linkWhatsApp(whatsapp: string | null | undefined, mensagem: string): string | null {
  if (!whatsapp) return null;
  let digitos = whatsapp.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) {
    digitos = `55${digitos}`;
  } else if (!(digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith("55"))) {
    return null;
  }
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// `inicio` do atendimento é um INSTANTE; a mensagem fala a hora da loja, não
// a do navegador — fuso fixo para o dia não escorregar em telefone viajando.
const diaFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const horaFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

export type ConfirmacaoAtendimento = {
  noivaNome?: string | null;
  tipo?: string | null;
  inicio: string | Date;
  lojaNome?: string | null;
  endereco?: string | null;
};

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type Cobranca = {
  noivaNome?: string | null;
  /** Total vencido da noiva, em reais. */
  totalVencido: number;
  /** Dias de atraso da parcela mais antiga (≥1 — o aging descarta o que vence hoje). */
  diasMaisAntigo: number;
  lojaNome?: string | null;
};

/**
 * Mensagem de cobrança pronta. Sucede o `msgPadrao` genérico que vivia na tela:
 * aquele só dizia "uma parcela em aberto", sem valor nem atraso — a noiva não
 * sabia do que se tratava e a loja repetia o número à mão.
 *
 * Cita o valor e há quanto tempo, mas mantém o tom concierge que a tela escolheu
 * (a cobrança do atelier é um lembrete afetuoso, não uma régua): a saída para
 * "já paguei" vem escrita, para a noiva em dia não se sentir cobrada por erro.
 */
export function msgCobranca(p: Cobranca): string {
  const quem = p.noivaNome || "noiva";
  const daLoja = p.lojaNome ? `da ${p.lojaNome}` : "do atelier";
  const atraso = p.diasMaisAntigo === 1 ? "desde ontem" : `há ${p.diasMaisAntigo} dias`;
  return [
    `Olá, ${quem}! Aqui é ${daLoja}.`,
    `Passando com carinho para lembrar de um valor em aberto: ${brlFmt.format(p.totalVencido)}, ${atraso}.`,
    "Se já tiver acertado, é só desconsiderar. Qualquer dúvida, estou à disposição.",
  ].join("\n");
}

/** Mensagem de confirmação do atendimento/prova — criação e véspera usam a mesma. */
export function msgConfirmacaoAtendimento(p: ConfirmacaoAtendimento): string {
  const quando = `${diaFmt.format(new Date(p.inicio))} às ${horaFmt.format(new Date(p.inicio))}`;
  const compromisso = p.tipo === "PROVA" ? "sua prova" : "seu atendimento";
  const onde = p.lojaNome ? ` na ${p.lojaNome}` : "";
  const linhas = [
    `Olá, ${p.noivaNome || "noiva"}! Confirmando ${compromisso}${onde}: ${quando}.`,
  ];
  if (p.endereco) linhas.push(`Endereço: ${p.endereco}.`);
  linhas.push("Qualquer imprevisto, é só avisar por aqui.");
  return linhas.join("\n");
}
