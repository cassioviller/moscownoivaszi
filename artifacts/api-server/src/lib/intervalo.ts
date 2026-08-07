/**
 * O par `de`/`ate` das rotas de listagem e exportação — S35.
 *
 * O bloco "parseia a query, responde 400 se o schema recusar, responde 400 se
 * `de > ate`" estava copiado NOVE vezes (sete em financeiro.ts, uma em
 * vestidos.ts, uma em agenda.ts), com as mesmas duas frases. Regra 26: quando
 * o mesmo cuidado aparece em nove grafias, o sítio que esquecer uma é o que
 * quebra. As mensagens são EXATAMENTE as que as rotas já respondiam — duas
 * rotas (pagamentos e agenda) tinham um corpo próprio para o parse recusado,
 * e ele se preserva pelo `erroParse` opcional.
 */

type ErroParse = { error: string; detalhe?: string };

/** A resposta que este helper precisa — estrutural para testar sem Express. */
type RespostaJson = {
  status(code: number): { json(corpo: unknown): unknown };
};

/** O retorno de um `safeParse` do zod, no recorte que interessa aqui. */
type Parseado<Q> = { success: true; data: Q } | { success: false; error?: unknown };

const ERRO_PARSE_PADRAO: ErroParse = {
  error: "INTERVALO_INVALIDO",
  detalhe: "de/ate esperam AAAA-MM-DD",
};

const ERRO_ORDEM: ErroParse = {
  error: "INTERVALO_INVALIDO",
  detalhe: "'de' não pode ser depois de 'ate'",
};

/**
 * Devolve os dados parseados com `de`/`ate` coerentes, ou responde o 400 e
 * devolve null — quem chama só faz `if (!q) return;`. A comparação é
 * lexicográfica, que para AAAA-MM-DD é a cronológica; só dispara com as DUAS
 * pontas presentes (rotas de listagem têm as duas opcionais).
 */
export function intervaloValidado<Q extends { de?: string; ate?: string }>(
  res: RespostaJson,
  parsed: Parseado<Q>,
  erroParse: ErroParse = ERRO_PARSE_PADRAO,
): Q | null {
  if (!parsed.success) {
    res.status(400).json(erroParse);
    return null;
  }
  const { de, ate } = parsed.data;
  if (de && ate && de > ate) {
    res.status(400).json(ERRO_ORDEM);
    return null;
  }
  return parsed.data;
}
