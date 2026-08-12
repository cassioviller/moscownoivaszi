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
/**
 * S-M25 (rodada 2, achado 2#2): a janela do orçamento é em DIAS, não em ms.
 * A validade é data de NEGÓCIO (âncora meio-dia SP — representação do dia,
 * não prazo), e compará-la como instante declarava o orçamento "vencido" às
 * 12:00:01 do próprio dia de validade: a fila parava de oferecer o lembrete
 * exatamente na tarde do último dia, quando "sua proposta vence hoje" mais
 * converte. A régua do resto do sistema (`estaAtrasada`) conta DIAS — vencido
 * é só no dia seguinte — e esta passa a ser a mesma.
 */
export const JANELA_ORCAMENTO_DIAS = 3;

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
  return naJanela(atendimentos, agora, faltaProcurar);
}

/**
 * S-O21 (E181) — o RECORTE das três filas, escrito uma vez.
 *
 * As três funções desta seção respondem perguntas diferentes sobre a mesma
 * janela de 48h, e as três repetiam a conta e a ordenação. O recorte não é
 * decisão de nenhuma delas: é o horário que ainda dá para remarcar.
 */
function naJanela<T extends AtendimentoDaFila>(
  atendimentos: readonly T[],
  agora: number,
  pergunta: (a: AtendimentoDaFila) => boolean,
): T[] {
  return atendimentos
    .filter((a) => {
      if (!pergunta(a)) return false;
      const t = new Date(a.inicio).getTime();
      return t >= agora && t <= agora + JANELA_CONFIRMACAO_MS;
    })
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

/**
 * S-O21 (E181) — **ela já respondeu**, e os fatos que dizem isso moram aqui.
 *
 * O E97/F6 separou "a loja procurou" (`contatadoEm`) de "a noiva respondeu"
 * (`confirmadoEm`); o F37/E100 acrescentou o terceiro fato — quem pede
 * remarcação também respondeu, respondeu "não posso". Duas filas dependem
 * dessa mesma resposta, e as duas a escreviam por conta própria: uma pela
 * afirmativa (`faltaProcurar`), outra pela negativa
 * (`jaContatadasNaJanela` — `|| a.confirmadoEm || a.remarcacaoPedidaEm`).
 *
 * As duas grafias concordam hoje. A que a regra 26 descreve é a de amanhã: o
 * quarto fato entraria numa e não na outra, e a noiva que respondeu sairia de
 * uma fila e continuaria na outra — com o botão "Não procurei" oferecido para
 * um contato que ela já respondeu.
 */
export function respondeu(a: AtendimentoDaFila): boolean {
  return !!a.confirmadoEm || !!a.remarcacaoPedidaEm;
}

/**
 * G14 (E168) — a régua "falta procurar", sem a janela: os TRÊS fatos, num
 * lugar só.
 *
 * `aContatarNaJanela` é esta pergunta MAIS o recorte de 48h. A fila da agenda
 * do dia (`agenda/index.tsx:216`) precisa da pergunta sem o recorte — ela
 * mostra o dia que está na tela, que pode ser daqui a duas semanas — e por
 * isso re-derivava a régua à mão: `!a.contatadoEm && !a.confirmadoEm`,
 * **esquecendo `remarcacaoPedidaEm`**. A recepção mandava *"confirme sua
 * presença hoje às 14h"* para quem tinha avisado às 9h que não podia vir.
 *
 * Extrair o predicado é o que faz as duas filas serem a mesma pergunta: quem
 * acrescentar um quarto fato à família acrescenta aqui, e as duas telas o
 * ganham juntas.
 */
export function faltaProcurar(a: AtendimentoDaFila): boolean {
  return a.situacao === "AGENDADO" && !a.contatadoEm && !respondeu(a);
}

/**
 * A irmã exata: procurada e ainda sem resposta. A ÚNICA diferença para a de
 * cima é o sinal do `contatadoEm` — e é isso que a S-O21 pede que fique
 * visível, em vez de ser reconstruído pela negativa lá embaixo.
 */
export function jaFoiProcurada(a: AtendimentoDaFila): boolean {
  return a.situacao === "AGENDADO" && !!a.contatadoEm && !respondeu(a);
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
  return naJanela(
    atendimentos,
    agora,
    (a) => a.situacao === "AGENDADO" && !!a.remarcacaoPedidaEm,
  );
}

/** Procuradas na janela e ainda sem resposta — a linha que o desfazer atende. */
export function jaContatadasNaJanela<T extends AtendimentoDaFila>(
  atendimentos: readonly T[],
  agora: number,
): T[] {
  return naJanela(atendimentos, agora, jaFoiProcurada);
}

/**
 * Orçamentos ENVIADOS vencendo na janela — os já vencidos não entram.
 *
 * `hoje` é o dia LOCAL da loja (`hojeLocal()`), e a conta inteira é por dia:
 * a validade ancorada ao meio-dia de São Paulo tem o dia UTC igual ao dia de
 * negócio (é a propriedade da âncora), então `slice(0, 10)` do ISO já é o dia
 * certo. O orçamento vale o dia INTEIRO da validade.
 */
export function orcamentosVencendoNaJanela<T extends OrcamentoDaFila>(
  orcamentos: readonly T[],
  hoje: string,
): T[] {
  const limite = new Date(`${hoje}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + JANELA_ORCAMENTO_DIAS);
  const diaLimite = limite.toISOString().slice(0, 10);
  return orcamentos
    .filter((o) => {
      if (o.status !== "ENVIADO" || !o.validade) return false;
      const dia = new Date(o.validade).toISOString().slice(0, 10);
      return dia >= hoje && dia <= diaLimite;
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
 * S-D13 — a metade PERSISTENTE da marca de cobrada, derivada do banco.
 *
 * A marca de sessão (acima) morre no F5 com os registros ainda gravados: a
 * recepcionista recarregava a tela e a fila voltava a pedir a cobrança que ela
 * acabou de fazer — e o segundo clique gravava o segundo registro do dia. O
 * `ultimoContatoEm` que a parcela passou a embutir responde isso: se o último
 * contato caiu no dia de HOJE no fuso da loja, a noiva já foi procurada hoje,
 * por esta sessão ou por qualquer outra.
 *
 * A comparação é contra o DIA DE NEGÓCIO, não "houve contato": um contato de
 * anteontem não pode tirar a linha da fila de hoje — era o segundo erro que a
 * sobra apontava no diagnóstico original.
 *
 * A marca derivada não tem `registroId` de propósito: o desfazer só existe
 * para o registro que ESTA sessão criou (é a resposta do POST); o de ontem ou
 * o de outra pessoa se desfaz pelo histórico da noiva, com nome e hora.
 */
export function marcasPersistentesDeCobranca(
  noivas: readonly { leadId?: string | null; ultimoContatoEm?: string | null }[],
  hoje: string,
  diaDoInstante: (instante: string) => string,
): MarcasCobranca {
  const marcas = new Map<string, MarcaCobranca>();
  for (const n of noivas) {
    if (!n.leadId || !n.ultimoContatoEm) continue;
    if (diaDoInstante(n.ultimoContatoEm) === hoje) marcas.set(n.leadId, { quando: n.ultimoContatoEm });
  }
  return marcas;
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
