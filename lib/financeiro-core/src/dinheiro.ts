/**
 * Dinheiro no financeiro: a API fala em reais (number), mas toda soma acontece
 * em CENTAVOS INTEIROS. Somar floats em reais acumula erro (0.1 + 0.2 !== 0.3)
 * e um DRE que fecha com um centavo de diferença do fluxo não tem conserto
 * depois — a divergência vira desconfiança no número.
 *
 * Regra: converta na borda (centavos), some inteiro, volte para reais só ao
 * exibir. Mesma convenção do gerar-plano e do rateio de pagamento no backend.
 */

/** Reais → centavos inteiros. */
export function centavos(reais: number): number {
  return Math.round(reais * 100);
}

/** Centavos inteiros → reais. */
export function reais(cents: number): number {
  return cents / 100;
}

/** Soma um campo em reais de uma lista, em centavos inteiros. */
export function somaCentavos<T>(itens: readonly T[], valorDe: (item: T) => number | null | undefined): number {
  return itens.reduce((total, item) => total + centavos(valorDe(item) ?? 0), 0);
}

/**
 * Bruto de um orçamento/contrato em CENTAVOS: soma item a item, convertendo
 * cada valor unitário antes de multiplicar pela quantidade.
 *
 * A ordem importa. Somar os reais em float e converter no fim
 * (`round2(Σ qtd × valor)`, o que a rota de orçamento, a visão da noiva e a
 * tela faziam) acumula erro dentro da soma; converter primeiro mantém a conta
 * inteira do começo ao fim.
 */
export function brutoEmCentavos(
  itens: readonly { valorUnitario: number; quantidade: number }[],
): number {
  return itens.reduce((total, it) => total + centavos(it.valorUnitario) * it.quantidade, 0);
}

/**
 * Líquido em centavos a partir do bruto e do desconto — a régua ÚNICA do que
 * um orçamento vale (E95/C1).
 *
 * Havia duas fórmulas para o MESMO número: esta, em centavos inteiros (que o
 * `POST /contratos` usa para validar), e `round2(bruto × (1 − v/100))` em reais
 * float (que a rota de orçamento, a visão da noiva e a tela usavam para
 * exibir). São algebricamente iguais e numericamente diferentes: quando o
 * resultado cai exatamente em meio centavo, o caminho float chega ali por
 * baixo (`950.4749999999999`) e arredonda para o outro lado.
 *
 * Medido pela trilha C: **1,32% das vendas com desconto percentual** batiam num
 * 422 `VALOR_TOTAL_NAO_BATE` — e a vendedora não tinha como destravar, porque o
 * número que a tela mostrava era justamente o único que o servidor recusava.
 * Pior: com versão ENVIADA, o valor float ficava congelado no snapshot E NO
 * HASH — a noiva aceitava 950,47 e o único contrato gerável era de 950,48.
 *
 * Unificar no `round2` fecharia o 422 e deixaria a conta errada nos quatro
 * lugares de forma consistente; por isso a régua é esta, em centavos.
 */
/**
 * P15 (E163) — a pergunta "este registro TEM desconto?" tem UMA resposta.
 *
 * `descontoValor === 0` era "sem desconto" para a régua do dinheiro (o `!valor`
 * de `liquidoEmCentavos` logo abaixo) e "com desconto" para o papel e para a
 * tela do contrato, que só olhavam `descontoTipo` — o mesmo registro, dois
 * arquivos, duas respostas: o PDF imprimia "Desconto − R$ 0,00" num contrato
 * que o dinheiro tratava como sem desconto. Quem pergunta, pergunta AQUI.
 */
export function temDesconto(
  tipo: string | null | undefined,
  valor: number | null | undefined,
): boolean {
  return !!tipo && !!valor && valor > 0;
}

export function liquidoEmCentavos(
  brutoC: number,
  tipo: string | null | undefined,
  valor: number | null | undefined,
): number {
  if (!tipo || !valor) return brutoC;
  if (tipo === "PERCENTUAL") return Math.max(0, Math.round((brutoC * (100 - valor)) / 100));
  return Math.max(0, brutoC - centavos(valor)); // VALOR
}

/**
 * Lê reais como o usuário os escreve — a outra borda, a do teclado.
 *
 * Vazio é `null` (não digitou) e lixo é `NaN` (digitou errado): quem chama
 * precisa distinguir "deixou em branco" de "escreveu bobagem". "1.234,56" e
 * "1234.56" são a mesma quantia; "1.234" são mil duzentos e trinta e quatro,
 * não um e pouco — ponto de milhar é o padrão pt-BR, e ler isso errado por
 * mil vezes é o tipo de engano que só aparece no fechamento.
 *
 * O SINAL entra no reconhecedor de milhar (`^[+-]?`) e não é detalhe: sem ele,
 * `-1.234` reprovava o casamento por começar em `-`, caía no `Number` cru e
 * virava −1,23. O caixa fecha no vermelho e a conferência aceita negativo de
 * propósito (`validarConferencia`), então a âncora de saldo era gravada mil
 * vezes menor — a curva de `projetarCaixa` inteira nascia R$ 1.232,77 acima do
 * caixa real e o alerta do dashboard parava de acusar o dia negativo que
 * existe. O mesmo texto SEM o menos já era lido certo: a interpretação mudava
 * por mil só por causa do sinal.
 */
export function parseValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  let normalizado: string;
  if (t.includes(",")) {
    normalizado = t.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) {
    normalizado = t.replace(/\./g, "");
  } else {
    normalizado = t;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : Number.NaN;
}
