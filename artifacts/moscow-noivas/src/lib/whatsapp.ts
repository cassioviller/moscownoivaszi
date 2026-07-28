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
  /** E84: o link do portal VIVO da noiva; ausente, a mensagem fica como era. */
  portalUrl?: string | null;
};

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type Cobranca = {
  noivaNome?: string | null;
  /** Total vencido da noiva, em reais. */
  totalVencido: number;
  /** Dias de atraso da parcela mais antiga (≥1 — o aging descarta o que vence hoje). */
  diasMaisAntigo: number;
  lojaNome?: string | null;
  /** E84: o link do portal VIVO da noiva; ausente, a mensagem fica como era. */
  portalUrl?: string | null;
};

/** A linha do portal, quando há portal — o mesmo fecho em toda mensagem. */
function linhaPortal(portalUrl: string | null | undefined): string[] {
  return portalUrl ? [`Tudo sobre o seu vestido está aqui: ${portalUrl}`] : [];
}

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
    ...linhaPortal(p.portalUrl),
  ].join("\n");
}

export type OrcamentoVencendo = {
  noivaNome?: string | null;
  /** Validade do orçamento (instante). */
  validade: string | Date;
  lojaNome?: string | null;
  /** E84: o link do portal VIVO da noiva; ausente, a mensagem fica como era. */
  portalUrl?: string | null;
};

/**
 * Lembrete de orçamento vencendo (E69) — o empurrão gentil antes da validade
 * passar em silêncio. Mesmo tom concierge da cobrança: convite, não pressão.
 */
export function msgOrcamentoVencendo(p: OrcamentoVencendo): string {
  const quem = p.noivaNome || "noiva";
  const daLoja = p.lojaNome ? `da ${p.lojaNome}` : "do atelier";
  const ate = diaFmt.format(new Date(p.validade));
  return [
    `Olá, ${quem}! Aqui é ${daLoja}.`,
    `Seu orçamento está guardado até ${ate} — depois disso os valores podem mudar.`,
    "Se quiser conversar sobre qualquer detalhe, estou por aqui.",
    ...linhaPortal(p.portalUrl),
  ].join("\n");
}

/**
 * E100/F35 — a ÚNICA mensagem que vai no sentido contrário: da noiva para o
 * atelier, disparada pelo rodapé do portal.
 *
 * Ela existe por um motivo prático: o número que atende é o da LOJA, e quem
 * chega por ali chega sem contexto — "oi" de um número desconhecido, no meio de
 * dezenas. O nome dela na primeira linha é o que transforma isso num
 * atendimento em vez de numa pergunta ("quem é?") antes da pergunta.
 */
export function msgDaNoivaParaAtelier(noivaNome?: string | null): string {
  const quem = noivaNome?.trim();
  return quem
    ? `Oi! Aqui é a ${quem}. Vim pelo meu link e queria tirar uma dúvida.`
    : "Oi! Vim pelo meu link do atelier e queria tirar uma dúvida.";
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
  linhas.push(...linhaPortal(p.portalUrl));
  return linhas.join("\n");
}
