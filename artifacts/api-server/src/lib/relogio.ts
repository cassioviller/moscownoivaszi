/**
 * E223 — o relógio das portas que decidem POR DATA.
 *
 * `hoje` sempre foi injetado nas FUNÇÕES desta trilha (`calcularRescisao`,
 * `moraDe`, `verificarDisponibilidade` recebem `hoje` por parâmetro desde o
 * E211), mas a ROTA que as chama escrevia `new Date()` — e regra que depende
 * do dia da semana em que o pedido chega (a 17ª §1º veda troca às sextas e
 * sábados) não tem como ser exercitada por teste de API sem controlar esse
 * instante: a suíte ficaria verde cinco dias por semana e vermelha dois, que
 * é a classe que a S-O119 nomeou ("régua que depende da hora em que roda não
 * é régua").
 *
 * É um objeto, e não uma função solta, para o teste poder trocar `agora` por
 * `vi.spyOn(relogio, "agora")` sem mexer no grafo de módulos. Produção nunca
 * o sobrescreve.
 */
export const relogio = {
  agora: (): Date => new Date(),
};
