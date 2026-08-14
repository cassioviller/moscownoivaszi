import type { LocacaoDoLead } from "@workspace/api-client-react";

/**
 * **S-C91 — a ficha da noiva mostrava a RESERVA e não mostrava a LOCAÇÃO.**
 * **E229/S-C220 — e a fonte mudou: a régua lê o RECORTE, não a lista de
 * contratos.**
 *
 * O E222 pôs a régua do expediente na porta (cláusulas 4ª e 5ª) e o E224 pôs o
 * gesto na tela; a S-C91 trouxe as duas datas para a ficha da noiva — derivadas
 * de `contratosDaNoiva`, que para a Recepção é `[]` desde o E172. A única
 * pessoa cujo trabalho a sobra nomeava (*"quem atende o telefone"*) era a única
 * sem acesso à entrega.
 *
 * A decisão da dona (14/08/2026) criou a LEITURA ESTREITA:
 * `GET /leads/:id/locacao`, sob o módulo `leads`, devolve as duas datas do
 * contrato ATIVO e nada de dinheiro. Quem escolhe o contrato (ATIVO, único
 * pelo índice parcial) e quem corta o CANCELADO passou a ser o SERVIDOR — uma
 * régua, atrás da porta, para todos os perfis. O que fica aqui é a decisão de
 * TELA:
 *
 * **Campo vazio não vira linha vazia.** Sem NENHUMA das duas datas não há o
 * que mostrar, e é a esmagadora maioria: medido em `heliumdb` em 2026-08-13 —
 * **733 contratos, 1 com retirada, 0 com devolução, 311 ativos**. Uma linha
 * *"Retirada: a informar"* em 310 das 311 fichas seria moldura, que é o que a
 * régua do `<Dado>` da própria ficha já recusa.
 *
 * O que a régua NÃO faz é esconder a metade que falta quando a outra existe:
 * contrato com retirada e sem devolução é registro pela metade, e a 10ª cobra
 * multa pelo atraso na devolução que ninguém marcou. Aí a ficha diz que falta.
 */

export interface LocacaoDaNoiva {
  /** De qual contrato saíram as datas — a ficha lista mais de um. */
  contratoId: string;
  /** Instantes ISO, para o relógio da LOJA formatar (`instanteCurto`). */
  retirada: string | null;
  devolucao: string | null;
}

export function locacaoDaNoiva(
  recorte: LocacaoDoLead | null | undefined,
): LocacaoDaNoiva | null {
  if (!recorte) return null;
  const retirada = recorte.retirada ?? null;
  const devolucao = recorte.devolucao ?? null;
  if (!retirada && !devolucao) return null;
  return { contratoId: recorte.contratoId, retirada, devolucao };
}
