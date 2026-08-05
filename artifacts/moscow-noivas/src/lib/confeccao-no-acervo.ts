/**
 * E156 — quando o trabalho da fila pode virar peça do acervo, e com que ficha
 * ele abre o cadastro.
 *
 * A dona respondeu (P4) que a peça confeccionada **vira** item do acervo depois
 * do casamento. O que este módulo guarda é que isso é um **gesto**, e as três
 * condições dele:
 *
 * · **CONFECÇÃO, não ajuste.** Bainha não é peça nova — não há o que cadastrar.
 * · **Já FEITA.** A manga não existe até a costureira terminar; oferecer o gesto
 *   antes disso poria no acervo uma peça que ninguém pode alugar.
 * · **Ainda não virou.** Uma vez no acervo, a linha da fila mostra a PEÇA, não o
 *   gesto — senão a mesma confecção viraria duas peças, cada uma com um código.
 *
 * O que NÃO mora aqui, de propósito: o preço. `ajustes.custo` é o que a
 * costureira cobrou; `vestidos.precoBase` é o que a noiva paga para alugar.
 * Derivar um do outro seria inventar margem — o preço é digitado.
 */
export interface TrabalhoDaFila {
  tipo?: string;
  status?: string;
  descricao: string;
  pecaDoAcervo?: { id: string; codigo: string; nome: string } | null;
  atendimento?: { lead?: { noivaNome?: string } | null } | null;
}

export function podeVirarPecaDoAcervo(trabalho: TrabalhoDaFila): boolean {
  return (
    trabalho.tipo === "CONFECCAO" &&
    trabalho.status === "FEITO" &&
    !trabalho.pecaDoAcervo
  );
}

/**
 * A ficha com que o cadastro abre. Só o que a fila realmente sabe: o nome da
 * peça é a descrição do trabalho, e a observação registra para quem ela foi
 * feita — a peça sai da produção, mas de onde ela veio é história do acervo.
 *
 * Código e preço ficam em branco de propósito: são decisão da loja, e um
 * palpite ali nasceria errado em toda peça.
 */
export function fichaDaConfeccao(trabalho: TrabalhoDaFila): {
  nome: string;
  observacoes: string;
} {
  const noiva = trabalho.atendimento?.lead?.noivaNome?.trim();
  return {
    nome: trabalho.descricao,
    observacoes: noiva
      ? `Peça confeccionada para ${noiva}.`
      : "Peça confeccionada sob medida.",
  };
}
