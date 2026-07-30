/**
 * F7/E98 — a régua da fila de mensagens, num lugar só.
 *
 * "Mensagens de hoje" (E69) já sabia contar: o `totalFila` da tela produz a
 * frase *"N mensagens prontas para enviar"*. O que faltava era o dashboard
 * dizer o mesmo número — ele promete "o que precisa da sua atenção agora" e não
 * mencionava a única tela que responde isso.
 *
 * A tentação era contar de novo no dashboard. Duas contagens da mesma fila
 * divergem no primeiro ajuste de janela — e divergir aqui é pior que não
 * contar: o painel prometeria três mensagens e a fila mostraria cinco. As
 * regras saíram da tela para cá, e as duas passaram a derivar delas.
 *
 * As janelas são as do E69 e continuam sendo decisão de produto: 48h para
 * confirmar presença (dá tempo de a noiva remarcar), 72h para o orçamento que
 * vence (dá tempo de ela decidir).
 */

export const JANELA_CONFIRMACAO_MS = 48 * 3_600_000;
export const JANELA_ORCAMENTO_MS = 72 * 3_600_000;

/** O mínimo que a régua precisa saber de um atendimento. */
export type AtendimentoDaFila = {
  situacao: string;
  inicio: string;
  contatadoEm?: string | null;
  confirmadoEm?: string | null;
  /** F37/E100 — ela respondeu, e a resposta foi "não posso". */
  remarcacaoPedidaEm?: string | null;
};

/** O mínimo que a régua precisa saber de um orçamento. */
export type OrcamentoDaFila = {
  status: string;
  validade?: string | null;
};

/**
 * Quem a loja ainda NÃO procurou nas próximas 48h.
 *
 * O E97/F6 separou dois fatos que moravam na mesma coluna: `contatadoEm` é a
 * loja ter procurado, `confirmadoEm` é a noiva ter respondido. Quem já
 * respondeu sai da fila também — não há o que perguntar a ela.
 *
 * **F37/E100 acrescentou o terceiro fato**, e ele sai da fila pelo MESMO motivo:
 * quem pediu remarcação respondeu — respondeu "não posso". Perguntar "você vem?"
 * a quem acabou de avisar que não vem é a forma mais rápida de a noiva concluir
 * que ninguém leu o aviso dela. Ela entra na fila de REMARCAR, que é outra.
 */
export function aContatarNaJanela<T extends AtendimentoDaFila>(
  atendimentos: readonly T[],
  agora: number,
): T[] {
  return atendimentos
    .filter((a) => {
      if (a.situacao !== "AGENDADO" || a.contatadoEm || a.confirmadoEm || a.remarcacaoPedidaEm) {
        return false;
      }
      const t = new Date(a.inicio).getTime();
      return t >= agora && t <= agora + JANELA_CONFIRMACAO_MS;
    })
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

/**
 * F37/E100 — quem avisou que NÃO pode ir, e ainda tem horário preso.
 *
 * É a fila que devolve cabine, vendedora e vestido à loja. Ela existe separada
 * das outras duas porque o gesto é outro: não é mandar mensagem, é **remarcar**.
 */
export function pediramRemarcacaoNaJanela<T extends AtendimentoDaFila>(
  atendimentos: readonly T[],
  agora: number,
): T[] {
  return atendimentos
    .filter((a) => {
      if (a.situacao !== "AGENDADO" || !a.remarcacaoPedidaEm) return false;
      const t = new Date(a.inicio).getTime();
      return t >= agora && t <= agora + JANELA_CONFIRMACAO_MS;
    })
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

/** Procuradas na janela e ainda sem resposta — a linha que o desfazer atende. */
export function jaContatadasNaJanela<T extends AtendimentoDaFila>(
  atendimentos: readonly T[],
  agora: number,
): T[] {
  return atendimentos
    .filter((a) => {
      if (a.situacao !== "AGENDADO" || !a.contatadoEm || a.confirmadoEm || a.remarcacaoPedidaEm) {
        return false;
      }
      const t = new Date(a.inicio).getTime();
      return t >= agora && t <= agora + JANELA_CONFIRMACAO_MS;
    })
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

/** Orçamentos ENVIADOS vencendo na janela — os já vencidos não entram. */
export function orcamentosVencendoNaJanela<T extends OrcamentoDaFila>(
  orcamentos: readonly T[],
  agora: number,
): T[] {
  return orcamentos
    .filter((o) => {
      if (o.status !== "ENVIADO" || !o.validade) return false;
      const t = new Date(o.validade).getTime();
      return t >= agora && t <= agora + JANELA_ORCAMENTO_MS;
    })
    .sort((a, b) => new Date(a.validade!).getTime() - new Date(b.validade!).getTime());
}

/**
 * E123/B3 — a marca de "já cobrada" da fila de inadimplentes.
 *
 * A seção irmã ("Procurar para confirmar") tira a linha da fila no clique e
 * oferece "Não procurei" — porque o carimbo dela mora no atendimento e a query
 * recarrega. A cobrança não tem esse luxo: a fila deriva do aging das PARCELAS,
 * que o registro de cobrança não altera. A marca vive então na sessão de tela
 * (o mesmo lugar do dedup que já existia): sobrevive à interrupção do telefone
 * — o cenário do B3 — e morre no F5, quando os registros continuam no banco.
 *
 * `registroId` chega DEPOIS (é a resposta do POST): o desfazer só ganha alvo
 * quando ele existe, e é por isso que o botão espera por ele.
 */
export type MarcaCobranca = {
  /** Instante do clique (ISO) — vira o "cobrada às HH:mm" da linha. */
  quando: string;
  /** O id que o servidor devolveu; sem ele o desfazer ainda não tem alvo. */
  registroId?: string;
};

export type MarcasCobranca = ReadonlyMap<string, MarcaCobranca>;

/** O clique marca. O SEGUNDO clique não remarca nem duplica: o primeiro manda. */
export function comMarcaDeCobranca(
  marcas: MarcasCobranca,
  leadId: string,
  quando: string,
): MarcasCobranca {
  if (marcas.has(leadId)) return marcas;
  return new Map(marcas).set(leadId, { quando });
}

/** A resposta do POST chegou: o desfazer ganha alvo. Marca já desfeita não ressuscita. */
export function comRegistroDaCobranca(
  marcas: MarcasCobranca,
  leadId: string,
  registroId: string,
): MarcasCobranca {
  const marca = marcas.get(leadId);
  if (!marca) return marcas;
  return new Map(marcas).set(leadId, { ...marca, registroId });
}

/** O desfazer (ou o POST que falhou): a linha volta para a fila. */
export function semMarcaDeCobranca(marcas: MarcasCobranca, leadId: string): MarcasCobranca {
  if (!marcas.has(leadId)) return marcas;
  const proximo = new Map(marcas);
  proximo.delete(leadId);
  return proximo;
}

/**
 * A fila em duas: quem falta cobrar e quem já saiu — na MESMA ordem da fila
 * (piores primeiro), para a recepcionista interrompida achar onde parou.
 * Noiva sem `leadId` não é marcável (o registro é por noiva) e fica na fila.
 */
export function particionaPorCobranca<T extends { leadId?: string | null }>(
  noivas: readonly T[],
  marcas: MarcasCobranca,
): { aCobrar: T[]; cobradas: { noiva: T; marca: MarcaCobranca }[] } {
  const aCobrar: T[] = [];
  const cobradas: { noiva: T; marca: MarcaCobranca }[] = [];
  for (const noiva of noivas) {
    const marca = noiva.leadId ? marcas.get(noiva.leadId) : undefined;
    if (marca) cobradas.push({ noiva, marca });
    else aCobrar.push(noiva);
  }
  return { aCobrar, cobradas };
}

/**
 * A frase da fila, com o total.
 *
 * `null` quando não há nada a enviar, e isso é o item inteiro do F7: o cartão
 * do dashboard **some** quando a fila está vazia, como o `AlertaCaixa`. Um
 * cartão que fica para sempre vira banner, e banner vira paisagem — a mesma
 * disciplina que o E103 aplicou ao alarme de caixa.
 */
export function resumoDaFila(total: number): { total: number; frase: string } | null {
  if (total <= 0) return null;
  return {
    total,
    frase:
      total === 1
        ? "1 mensagem pronta para enviar"
        : `${total} mensagens prontas para enviar`,
  };
}
