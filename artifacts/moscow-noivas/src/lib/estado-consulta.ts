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

/** O recorte mínimo de uma query do react-query que a decisão precisa ler. */
export type ConsultaDeTela = {
  isLoading: boolean;
  isError: boolean;
};

export type EstadoDeConsultas = "carregando" | "erro" | "pronto";

export function estadoDasConsultas(...consultas: ConsultaDeTela[]): EstadoDeConsultas {
  if (consultas.some((c) => c.isError)) return "erro";
  if (consultas.some((c) => c.isLoading)) return "carregando";
  return "pronto";
}
