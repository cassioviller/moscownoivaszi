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
/**
 * **A moeda em português, e ela mora aqui porque o conceito é deste módulo.**
 *
 * Nasceu no E214, dentro de `avaria.ts`, e a `varredura-reguas` reprovou —
 * com razão. A doutrina dela é explícita: formatador que é CÓPIA de função que
 * já existe se **consolida**, não se declara como dívida (foi o que a S30 fez
 * com cinco deles em 2026-08-07).
 *
 * O `brl` das telas (`moscow-noivas/src/lib/formatos.ts`) é a mesma conta, e
 * o `financeiro-core` não pode importá-lo — a dependência aponta ao contrário.
 * Então o formatador desce para o módulo que **possui** o conceito de dinheiro,
 * e quem precisar de moeda em regra de negócio pede aqui.
 *
 * As duas casas são EXPLÍCITAS: sem elas, um teto de 5 × R$ 1.750,50 sairia
 * "R$ 8.752,5".
 */
const moedaFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Reais → "R$ 1.234,56". */
export function brl(valor: number): string {
  return moedaFmt.format(valor);
}

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
 *
 * **S-O13 (E181) — a resposta vem com o NÚMERO garantido.** As telas que ainda
 * escreviam `descontoTipo && descontoValor` à mão ganhavam de graça a estreita
 * do tipo: dentro do `&&`, o valor é `number`. Trocar a expressão pela função
 * custaria um `!` em cada sítio — trocar uma régua não nomeada por uma asserção
 * é piorar o negócio (é a S-O16 do lado do dinheiro). Com o predicado, quem
 * pergunta recebe as duas coisas: a resposta e a estreita.
 */
export function temDesconto(
  tipo: string | null | undefined,
  valor: number | null | undefined,
): valor is number {
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

/** O que a linha "Desconto" mostra: o abatimento real e o rótulo do tipo. */
export interface LinhaDeDesconto {
  /** A soma dos itens, em centavos — a primeira linha do bloco. */
  subtotalC: number;
  /** O que SAIU do subtotal: bruto − líquido, sempre ≥ 0 e sempre reconciliando. */
  abatimentoC: number;
  /** ` (10%)` para o percentual, `""` para o valor — contexto, nunca o número. */
  rotulo: string;
}

/**
 * S-O64 (E187) — o desconto que se EXIBE é a diferença real, e a régua é uma só.
 *
 * O O9 (E166) consertou isto uma vez, na página pública: a linha imprimia o
 * `descontoValor` cru, e um desconto em VALOR maior que a soma dos itens saía
 * como **"Soma R$ 4.800,00 · Desconto R$ 5.000,00 · Total R$ 0,00"** — uma
 * subtração de −R$ 200,00 apresentada como zero no documento que decide a
 * compra (o líquido clampa em zero desde sempre, `liquidoEmCentavos` acima).
 *
 * O conserto ficou no arquivo, não na régua, e o portal da noiva seguiu
 * imprimindo o valor cru nos DOIS blocos. **A mesma proposta, aberta nos dois
 * links que a loja manda pelo WhatsApp, dizia "− R$ 4.800,00" numa tela e
 * "Desconto R$ 5.000,00" na outra** — e é a mesma noiva lendo as duas.
 *
 * Eram CINCO grafias da mesma conta em 2026-08-12, e a medida da regra 26 é
 * exatamente essa: três acertavam por cópia (a página pública, a tela do
 * contrato e o PDF, cada uma com a sua subtração à mão) e duas erravam. Quem
 * pergunta "quanto de desconto eu mostro?" pergunta aqui.
 *
 * `null` é "sem desconto" — a mesma resposta do `temDesconto`, para o bloco
 * inteiro não ser desenhado.
 */
export function linhaDeDesconto(
  brutoC: number,
  liquidoC: number,
  tipo: string | null | undefined,
  valor: number | null | undefined,
): LinhaDeDesconto | null {
  if (!temDesconto(tipo, valor)) return null;
  return {
    subtotalC: brutoC,
    abatimentoC: brutoC - liquidoC,
    rotulo: tipo === "PERCENTUAL" ? ` (${valor}%)` : "",
  };
}

/**
 * O6 (E169) — a QUANTIDADE tem a mesma borda que o valor, e não tinha régua.
 *
 * A tela de orçamento lia o valor unitário com `parseValor` (que separa "não
 * digitou" de "digitou bobagem" desde o C3) e a quantidade ao lado com
 * `Math.trunc(Number(texto) || 1)`. `Number("3un")` é `NaN`, `NaN || 1` é `1`,
 * e a guarda `quantidade < 1` nunca dispara: **3 véus de R$ 800,00 entravam
 * como 1 — R$ 1.600,00 a menos**, sem um toast. E é esse total que o hash da
 * versão certifica e que a noiva aceita.
 *
 * Mesma convenção do `parseValor`: `null` é "não digitou" (quem chama decide o
 * padrão), `NaN` é "digitou errado" (quem chama recusa). Fracionário é bobagem
 * — "2,5" véus não existe, e truncar em silêncio é a classe do defeito acima.
 */
export function parseQuantidade(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  // Sem ponto de milhar e sem vírgula decimal de propósito: quantidade de peça
  // é inteiro pequeno, e aceitar "1.000" aqui seria abrir a mesma ambiguidade
  // que o `parseValor` precisa carregar por ser dinheiro.
  if (!/^[+-]?\d+$/.test(t)) return Number.NaN;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

/**
 * A07.3 (E169) — o teto do desconto, para os DOIS tipos, num lugar só.
 *
 * O S-M23 (`db45820`) fechou metade: `PERCENTUAL > 100` passa a ser 422 porque
 * o clamp de `liquidoEmCentavos` (`:83`) engole o excesso e o orçamento zera em
 * silêncio. A linha de baixo (`:84`, o ramo VALOR) faz exatamente a mesma
 * coisa e não tinha teto em porta nenhuma — e a mensagem do 422 mandava a
 * vendedora para lá: *"para um valor em reais, troque o tipo para VALOR"*.
 *
 * **Medido:** orçamento de R$ 5.000,00 com desconto de R$ 6.000,00 em VALOR sai
 * como **R$ 0,00** — bruto 500000c, `Math.max(0, 500000 − 600000)` = 0. Com a
 * versão ENVIADA, é esse zero que congela no snapshot e no hash que a noiva
 * assina, o mesmo estrago do S-M23 por outra porta.
 *
 * `brutoCentavos` nulo significa **não há itens contra os quais comparar** — é
 * o caso do `POST /orcamentos`, cujo corpo não aceita itens: o orçamento nasce
 * sempre com bruto zero, e recusar ali um desconto em reais proibiria o
 * caminho legítimo "crio com o desconto combinado, lanço os itens depois". Só a
 * regra do percentual vale sem itens.
 */
export type MotivoDaRecusaDeDesconto = "PERCENTUAL_ACIMA_DE_100" | "VALOR_ACIMA_DO_BRUTO";

/**
 * E240/S-O85 — **a DECISÃO, separada do TEXTO.**
 *
 * `recusaDeDesconto` montava a frase para quem só queria o sim/não: a lista de
 * itens presos pelo desconto (`itensPresosPeloDesconto`, E187) chama a régua
 * uma vez por item, e cada chamada que recusa paga dois `toLocaleString` para
 * um `detalhe` que ninguém mostra. Medido em 15/08 (Node 24, 20 mil passadas
 * de 8 itens todos presos, duas rodadas): **frase 413–430 µs · veredito
 * 1,0–1,15 µs** — a frase custa ~400× o veredito, a mesma ordem que a sobra
 * media (862 × 2,0 = 430×).
 *
 * Esta é a régua; `recusaDeDesconto` é ela mais a frase. Não há segunda
 * grafia da conta: quem quer o texto passa por aqui também.
 */
export function motivoDaRecusaDeDesconto(
  tipo: string | null | undefined,
  valor: number | null | undefined,
  brutoCentavos: number | null,
): MotivoDaRecusaDeDesconto | null {
  if (typeof valor !== "number") return null;
  if (tipo === "PERCENTUAL" && valor > 100) return "PERCENTUAL_ACIMA_DE_100";
  if (tipo === "VALOR" && brutoCentavos != null && centavos(valor) > brutoCentavos) return "VALOR_ACIMA_DO_BRUTO";
  return null;
}

export function recusaDeDesconto(
  tipo: string | null | undefined,
  valor: number | null | undefined,
  brutoCentavos: number | null,
): { error: string; detalhe: string } | null {
  const motivo = motivoDaRecusaDeDesconto(tipo, valor, brutoCentavos);
  if (motivo === null) return null;
  if (motivo === "PERCENTUAL_ACIMA_DE_100") {
    return {
      error: "DESCONTO_INVALIDO",
      detalhe: "Desconto percentual não passa de 100 — para um valor em reais, troque o tipo para VALOR.",
    };
  }
  // O veredito só é VALOR_ACIMA_DO_BRUTO com `valor` numérico e `brutoCentavos` não nulo.
  return {
    error: "DESCONTO_INVALIDO",
    detalhe:
      `Desconto de ${brlSimples(valor as number)} é maior que os itens do orçamento ` +
      `(${brlSimples(reais(brutoCentavos as number))}) — o total sairia zerado.`,
  };
}

/**
 * Reais em texto para a frase de recusa acima. Não é o `brl` da tela (que traz
 * NBSP e mora no frontend): é o mínimo que o servidor precisa para o `detalhe`
 * do 422 dizer o número em vez de descrevê-lo.
 */
function brlSimples(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
