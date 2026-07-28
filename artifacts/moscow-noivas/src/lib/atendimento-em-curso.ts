/**
 * F13/E98 — o DURANTE do atendimento.
 *
 * O sistema sabia do ANTES (a fila do dia, o E36 medindo o início) e do DEPOIS
 * (o E61 encurtando o caminho até o orçamento). O durante era um buraco: a
 * vendedora clicava "Iniciar atendimento", saía da fila para preencher
 * interesses com a noiva do lado, e **nenhuma outra tela do app sabia que havia
 * um atendimento acontecendo**. Nada dizia "você está atendendo Marina", nada
 * oferecia o caminho de volta, e concluir dependia de ela lembrar.
 *
 * O custo não é de navegação, é de dado: quando "deixa eu voltar ali" fica
 * caro, a vendedora anota num papel e lança no fim do dia — e aí o `atendidoEm`,
 * o desfecho e os interesses não entram, ou entram errados.
 *
 * A régua mora aqui, e não na barra, por dois motivos. O primeiro é o de
 * sempre: o vitest do front só coleta `src/lib` (sobra S15), então o que está
 * num componente não é testado. O segundo é o do F7 — se um dia o dashboard
 * quiser dizer a mesma coisa, ele lê daqui em vez de recontar.
 */

/** O mínimo que a régua precisa saber de um atendimento. */
export type AtendimentoEmCursoLike = {
  id: string;
  leadId: string;
  vendedoraId: string;
  situacao: string;
  inicio: string;
  atendidoEm?: string | null;
  lead?: { noivaNome?: string | null } | null;
};

/**
 * O atendimento que ESTA pessoa está conduzindo agora, ou `null`.
 *
 * Três decisões, e as três são sobre não mostrar barra errada:
 *
 * 1. **Só o da pessoa logada.** Numa loja com três vendedoras há vários
 *    `EM_ATENDIMENTO` ao mesmo tempo; uma barra dizendo "Atendendo Marina" para
 *    quem não está atendendo Marina é pior que barra nenhuma — ela convida ao
 *    clique em "Concluir" de um atendimento alheio.
 * 2. **Um só, e o mais recente.** Duas linhas abertas ao mesmo tempo é estado
 *    sujo (alguém esqueceu de concluir ontem), não um caso a suportar: a barra
 *    mostra o que a pessoa começou por último, que é o que ela tem na frente.
 *    O antigo continua na fila, onde se conclui.
 * 3. **Ordena por `atendidoEm`, não por `inicio`.** `inicio` é a hora AGENDADA;
 *    `atendidoEm` é quando o botão foi clicado — e o F11/E97 existe justamente
 *    porque as duas divergem. Quem começou por último é quem tem a noiva na
 *    cabine agora, mesmo que o horário marcado dela fosse mais cedo.
 */
export function atendimentoEmCurso<T extends AtendimentoEmCursoLike>(
  atendimentos: readonly T[] | undefined,
  usuarioId: string | undefined,
): T | null {
  if (!usuarioId) return null;
  const meus = (atendimentos ?? []).filter(
    (a) => a.situacao === "EM_ATENDIMENTO" && a.vendedoraId === usuarioId,
  );
  if (meus.length === 0) return null;
  return [...meus].sort((a, b) => instante(b) - instante(a))[0];
}

/** `atendidoEm` quando existe; o horário agendado é o fallback honesto. */
function instante(a: AtendimentoEmCursoLike): number {
  return new Date(a.atendidoEm ?? a.inicio).getTime();
}
