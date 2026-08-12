/**
 * S-O20 (E181) — "o contrato ATIVO da noiva" é UM, e quem garante é o banco.
 *
 * Duas telas faziam `contratos.find((c) => c.status === "ATIVO")`: a ficha da
 * reserva (para a cobrança do reparo virar parcela) e a ficha da noiva (para o
 * "próximo passo"). A sobra descrevia o risco assim: *"é o PRIMEIRO ATIVO da
 * lista — com dois contratos ativos da mesma noiva, o reparo entra no que a
 * tela escolheu, sem dizer qual"*.
 *
 * **A correção é do tamanho do achado: dois ativos não existem.** O índice
 * parcial `contratos_lead_ativo_unico` (`lib/db/src/schema/contratos.ts:82`,
 * migração `0014`) é único em `lead_id` onde `status = 'ATIVO'`, e ele nasceu
 * no **E158**, nove épicos ANTES do E167 que escreveu a sobra. O `find` não
 * escolhe entre dois: ele acha o único.
 *
 * O que sobra é o que uma régua nomeada resolve, e é o que esta função faz:
 *
 * 1. **a invariante fica escrita** onde a tela pergunta, em vez de morar num
 *    índice que ninguém lê ao editar a tela;
 * 2. **a escolha deixa de depender da ORDEM que o servidor devolveu.** Se um
 *    dia o índice cair (ou um dump antigo chegar com dois), a tela responde o
 *    MAIS RECENTE por `fechadoEm` — determinístico, e o mais recente é o que a
 *    loja está cumprindo. Hoje a rota já ordena por `fechadoEm` decrescente
 *    (`contratos.ts:161-164`), então o resultado não muda; o que muda é a tela
 *    não depender disso para acertar.
 */
export interface ContratoDaNoiva {
  id: string;
  status: string;
  fechadoEm?: string | null;
}

export function contratoAtivoDaNoiva<T extends ContratoDaNoiva>(
  contratos: readonly T[] | null | undefined,
): T | null {
  const ativos = (contratos ?? []).filter((c) => c.status === "ATIVO");
  if (ativos.length <= 1) return ativos[0] ?? null;
  return [...ativos].sort(
    (a, b) => new Date(b.fechadoEm ?? 0).getTime() - new Date(a.fechadoEm ?? 0).getTime(),
  )[0]!;
}
