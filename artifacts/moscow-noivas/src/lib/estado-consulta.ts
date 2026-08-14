/**
 * E121 — a tela só afirma um número (ou um vazio) depois que a consulta
 * respondeu.
 *
 * O defeito que este módulo fecha tinha três caras com a mesma raiz: derivar
 * tudo de `query.data ?? []` faz carregando e erro ficarem indistinguíveis de
 * "não há nada". A conciliação desenhava "Bateu 0 · Só no banco 45" com o lado
 * do sistema ainda em voo — e a instrução ao lado ensinava a RELANÇAR dinheiro
 * que o sistema já tinha; a fila do dia afirmava "Fila vazia — ninguém
 * esperando mensagem" numa oscilação de rede; o painel da dona virava a falha
 * em "A receber R$ 0,00".
 *
 * A decisão mora aqui, uma vez, em função pura (a mesma razão do
 * `estado-erro.test.ts`: o app não tem infraestrutura de render, então o que
 * se testa é a DECISÃO que a tela encapsula):
 *
 * - **erro ganha de carregando.** Se uma consulta já falhou, esperar a outra
 *   só adia a mesma notícia — e o "Tentar novamente" refaz as duas de uma vez.
 * - **pronto é unânime.** Basta UMA consulta sem resposta para a tela não ter
 *   o direito de afirmar zero.
 * - Consulta DESLIGADA (gate de permissão, `enabled: false`) não conta:
 *   no react-query ela fica com `isLoading` e `isError` falsos, então não
 *   prende a tela em "carregando" para quem não vê aquele módulo.
 */

import { ehSemPermissao } from "./erro-api";

/** O recorte mínimo de uma query do react-query que a decisão precisa ler. */
export type ConsultaDeTela = {
  isLoading: boolean;
  isError: boolean;
  /** O erro em si — só o `estadoDoCard` o lê, para separar o 403 do resto. */
  error?: unknown;
};

export type EstadoDeConsultas = "carregando" | "erro" | "pronto";

export function estadoDasConsultas(...consultas: ConsultaDeTela[]): EstadoDeConsultas {
  if (consultas.some((c) => c.isError)) return "erro";
  if (consultas.some((c) => c.isLoading)) return "carregando";
  return "pronto";
}

/**
 * S-C120 — a consulta DESLIGADA era o buraco que o parágrafo acima deixou.
 *
 * O `estadoDasConsultas` declara, com todas as letras, que consulta desligada
 * por gate de permissão "não conta" — e conta: no react-query ela fica com
 * `isLoading` e `isError` falsos, então cai em **"pronto"**, e a tela ganha o
 * direito de afirmar o zero que o `?? []` fabricou. É o mesmo defeito do E121
 * uma casa adiante: lá o vazio se confundia com CARREGANDO, aqui ele se confunde
 * com **"você não pode ver"**.
 *
 * `estadoDoCard` é a decisão de um card só, e por isso ela tem o eixo que a
 * outra não tem: a PERMISSÃO. A ordem é do mais informativo para o menos:
 *
 * - **sem-permissão ganha de tudo.** Quem não vê o módulo não disparou consulta
 *   nenhuma; não há o que esperar nem o que tentar de novo.
 * - **403 do servidor é a mesma frase.** O espelho do cliente pode estar certo e
 *   a chamada ser recusada assim mesmo (loja errada na sessão, perfil mudado no
 *   meio) — e a frase honesta continua sendo *você não pode ver isto*.
 * - **erro ganha de carregando**, e **pronto é a última** — as duas regras do
 *   E121, intactas.
 */
export type EstadoDoCard = "sem-permissao" | "erro" | "carregando" | "pronto";

export function estadoDoCard(podeVer: boolean, consulta: ConsultaDeTela): EstadoDoCard {
  if (!podeVer) return "sem-permissao";
  if (consulta.isError) return ehSemPermissao(consulta.error) ? "sem-permissao" : "erro";
  if (consulta.isLoading) return "carregando";
  return "pronto";
}
