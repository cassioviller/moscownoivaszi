/**
 * S-C89 — o cache da fila de atrasos, por loja, no SERVIDOR (decisão da dona,
 * 14/08/2026).
 *
 * O sino (E68) refaz o `GET /contratos-com-atraso` a cada 5 min em TODA tela
 * aberta, e a tela de Contratos o pede de novo ao montar. A fila custa, medido
 * no molde da régua (`s-c89-...test.ts`): **2 consultas fixas** (regra da loja
 * + varredura larga) **+ 3 por contrato atrasado** (bloqueios do contrato,
 * aluguel da peça no rol, cobrança viva) **+ 1 pelas órfãs** — a sobra dizia
 * "2 por contrato" e são 3. Três abas abertas numa loja com cinco atrasos são
 * 3 × (2 + 15 + 1) consultas a cada 5 minutos, todas para produzir a MESMA
 * resposta.
 *
 * O TTL é o MESMO poll do sino (5 min), de propósito: o pior atraso de aviso
 * que o cache adiciona é um ciclo que o sino já tinha. E o dado envelhece bem:
 * a fila só muda por gesto (as portas abaixo derrubam o cache da loja) ou pela
 * meia-noite (os dias de atraso crescem), e 5 min não atravessam meia-noite
 * por margem que importe.
 *
 * **Quem derruba o cache** — toda porta que muda um fato que a fila lê:
 * cobrar o atraso, criar/cancelar/trocar-peça de contrato, mexer no bloqueio
 * (retirada/devolução real, datas, cancelamento), mexer na reserva-mãe,
 * estornar/apagar parcela (a cobrança viva), e o PUT da regra de
 * disponibilidade (a janela de uso). Fixture de teste que escreve DIRETO no
 * banco não passa por porta nenhuma — teste que mede a fila depois de um
 * `db.insert` derruba o cache à mão (`derrubarFilaDeAtrasos()`).
 *
 * **S-C280 — a conta acima envelheceu para melhor: são 2 por contrato, não 3.**
 * `pecasAtrasadasDoContrato` rebuscava `regra_disponibilidade` a cada volta do
 * laço, idêntica à que a fila já tinha lido — uma consulta evitável POR
 * CONTRATO. A regra virou parâmetro, e a régua mediu a queda no vermelho
 * `expected 7 to be 9` (dois contratos atrasados). A frase acima fica como
 * está, com esta emenda ao lado, porque ela conta a história de por que o
 * cache existe.
 *
 * ## S-C282 — este cache é POR PROCESSO, e a decisão é mantê-lo assim
 *
 * `porLoja` é um `Map` na memória do processo. Com uma segunda réplica atrás de
 * balanceador, `derrubarFilaDeAtrasos` só derruba o cache da réplica que
 * atendeu o gesto — a outra continua servindo a fila velha **até o TTL**.
 *
 * **Fica, e o que sustenta a decisão é o teto de dano, não a esperança:**
 *
 * - o pior caso é uma fila com **até 5 minutos de atraso** numa réplica, que é
 *   exatamente o ciclo do poll do sino — o mesmo atraso que existia ANTES do
 *   cache, quando cada aba refazia a consulta a cada 5 min;
 * - a fila é **aviso, não decisão**: quem cobra o atraso passa pelo
 *   `POST /contratos/:id/cobranca-de-atraso`, que lê o banco e não o cache, e
 *   tem guarda própria contra cobrar duas vezes. Uma fila velha mostra uma
 *   linha a mais ou a menos por alguns minutos; ela não faz ninguém cobrar
 *   errado;
 * - a topologia de hoje é **um processo** (`pnpm start`, um `node`), então a
 *   divergência não tem onde acontecer. Trocar isto por um cache compartilhado
 *   seria comprar uma dependência nova para um problema que ainda não existe.
 *
 * **O dia em que a topologia mudar, o que muda aqui**: ou o cache sai (a fila
 * volta a custar as 7 consultas por aba), ou vira compartilhado e a
 * invalidação passa a ser uma mensagem. Quem for fazer isso comece pela régua
 * da S-C89: ela trava o número de consultas e é o que diz se a troca ganhou.
 */

const TTL_MS = 5 * 60_000;

type Entrada = { em: number; corpo: unknown; geracao: number };

const porLoja = new Map<string, Entrada>();
/**
 * B7 da conferência (16/08): a GERAÇÃO por loja. Um `derrubar` no meio de um
 * GET (a rota lê o banco, alguém cobra o atraso, o GET grava a fila velha)
 * deixava o corpo antigo até 5 min. Cada `derrubar` sobe a geração; o
 * `guardar` só grava se a geração que a rota leu ANTES de consultar o banco
 * ainda é a atual. Nenhuma escrita depende do cache — o custo do defeito era
 * uma fila envelhecida por 5 min, e o conserto é uma comparação.
 */
const geracaoPorLoja = new Map<string, number>();
/**
 * **S-R18 — a cerca do B7 era inócua para a loja que ninguém tinha derrubado
 * pelo nome.** O `derrubar()` sem argumento subia a geração percorrendo
 * `geracaoPorLoja`, e esse `Map` só ganha chave quando alguém derruba a loja
 * POR NOME. Loja nunca derrubada pelo nome tem geração 0 antes e 0 depois do
 * `clear()` global: um GET em voo que leu 0, foi ao banco, e voltou depois do
 * `derrubar()` grava a fila velha — que é exatamente a janela que o B7 existe
 * para fechar, e ela continuava aberta por até 5 min.
 *
 * A geração de uma loja passa a ser **global + a dela**. As duas parcelas só
 * crescem, então a soma cresce a cada `derrubar`, com nome ou sem — não há
 * como duas gerações diferentes darem o mesmo número para a mesma loja, que é
 * o que a comparação do `guardar` precisa.
 */
let geracaoGlobal = 0;
export function geracaoDaFila(lojaId: string): number {
  return geracaoGlobal + (geracaoPorLoja.get(lojaId) ?? 0);
}

/** A resposta pronta da loja, ou null se não há (ou envelheceu). */
export function lerFilaDeAtrasos(lojaId: string): unknown | null {
  const entrada = porLoja.get(lojaId);
  if (!entrada) return null;
  if (Date.now() - entrada.em > TTL_MS) {
    porLoja.delete(lojaId);
    return null;
  }
  return entrada.corpo;
}

/** `geracaoLida`: a geração que a rota leu ANTES de ir ao banco (B7). Sem ela, grava sempre. */
export function guardarFilaDeAtrasos(lojaId: string, corpo: unknown, geracaoLida?: number): void {
  if (geracaoLida !== undefined && geracaoLida !== geracaoDaFila(lojaId)) return;
  porLoja.set(lojaId, { em: Date.now(), corpo, geracao: geracaoDaFila(lojaId) });
}

/** Sem argumento derruba TUDO — é o gesto dos testes e do seed, não das rotas. */
export function derrubarFilaDeAtrasos(lojaId?: string): void {
  if (lojaId === undefined) {
    porLoja.clear();
    // S-R18: uma parcela GLOBAL, e não um laço pelas lojas já conhecidas — a
    // loja que nunca foi derrubada pelo nome não está no Map e ficava de fora.
    geracaoGlobal += 1;
  } else {
    porLoja.delete(lojaId);
    geracaoPorLoja.set(lojaId, geracaoDaFila(lojaId) + 1);
  }
}
