import { brl } from "@/lib/formatos";

/**
 * **S-C32 — a fila do atraso: o que a tela DIZ, não o que ela calcula.**
 *
 * A conta da cláusula 16ª é do `financeiro-core` (`atraso.ts`, E212) e chega
 * pronta do servidor — diária, multa, extravio, total. Este módulo não refaz
 * nada disso: ele só monta as FRASES que a fila e o sino imprimem, a partir dos
 * números que a porta devolveu.
 *
 * A separação é a lição do E187, que achou **cinco grafias da mesma conta de
 * desconto, três acertando por cópia e duas errando** — `expected 10 to be 500`,
 * R$ 10,00 na tela onde o desconto era R$ 500,00. Aqui a conta tem uma grafia
 * só, e ela mora do outro lado da rede.
 */

/** O que a fila devolve, no mínimo que estas frases precisam saber. */
export type LinhaDaFilaDeAtraso = {
  maiorAtraso: number;
  valor: number;
  temExtravio: boolean;
  semAluguel: string[];
  jaCobrada: boolean;
};

/**
 * O aviso do sino, em uma frase.
 *
 * Ele existe porque **ausência não notifica ninguém**: a peça que não voltou
 * não dispara gesto nenhum, e o E212 só a mostrava a quem abrisse a ficha
 * daquela reserva. O sino é o lugar do sistema que avisa quem não perguntou
 * (E68), e é onde este fato passa a existir para quem não foi procurar.
 */
export function avisoDoAtraso(
  fila: { itens: LinhaDaFilaDeAtraso[]; pecas: number; valor: number } | undefined,
): { titulo: string; detalhe: string; urgente: boolean; assinatura: string } | null {
  const itens = fila?.itens ?? [];
  if (itens.length === 0) return null;

  const pecas = fila!.pecas;
  const maiorAtraso = Math.max(...itens.map((i) => i.maiorAtraso));
  const temExtravio = itens.some((i) => i.temExtravio);
  const semAluguel = itens.some((i) => i.semAluguel.length > 0);

  const titulo = `${pecas} peça${pecas === 1 ? "" : "s"} fora do prazo de devolução`;

  // O extravio é o degrau em que a 16ª deixa de cobrar diária e passa a cobrar
  // 4× o aluguel — dizer só "há 12 dias" esconderia a mudança de faixa.
  const quanto = temExtravio
    ? `${maiorAtraso} dias sem devolução — a 16ª já trata isso como extravio.`
    : `A mais antiga está fora há ${maiorAtraso} dia${maiorAtraso === 1 ? "" : "s"}.`;

  // O valor sobe todo dia, e é a única cobrança do sistema de que isso é
  // verdade — dizê-lo é o que separa um aviso de um número solto.
  const dinheiro =
    fila!.valor > 0
      ? ` A cláusula 16ª já cobra ${brl(fila!.valor)}, e o valor sobe a cada dia.`
      : semAluguel
        ? " Nenhuma delas está no rol de itens do contrato: não há aluguel de onde tirar a conta."
        : "";

  return {
    titulo,
    detalhe: `${quanto}${dinheiro}`,
    // Extravio é o pior caso que o instrumento prevê: 4× o aluguel de cada peça.
    urgente: temExtravio,
    // O sino guarda "dispensadas" por ID, e o ID carrega a assinatura do estado
    // (E68): amanhã o atraso é outro, e o aviso volta sozinho.
    assinatura: `${pecas}:${maiorAtraso}:${fila!.valor}`,
  };
}

/** O rótulo da linha na fila: quantos dias, e de qual faixa da 16ª. */
export function faixaDaLinha(linha: LinhaDaFilaDeAtraso): string {
  if (linha.temExtravio) {
    return `${linha.maiorAtraso} dias sem devolução — extravio (16ª)`;
  }
  return `fora do prazo há ${linha.maiorAtraso} dia${linha.maiorAtraso === 1 ? "" : "s"}`;
}
