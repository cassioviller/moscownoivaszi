import type { Contrato, Lead, Loja, Parcela, AuditLog } from "@workspace/db";
import { centavos } from "@workspace/financeiro-core";
import { desenharPdf, montadorDeTokens, type Token } from "./pdf-desenhista";
import { brl, dataBR, dataBRInstante, pixDaLoja, rotuloForma, slug } from "./contrato-do-papel";

/**
 * E221 — o RECIBO da cláusula 7ª.
 *
 * > **CLÁUSULA 7ª** — A LOCADORA deverá fornecer **todos os recibos de
 * > pagamentos efetuados pelo LOCATÁRIO.**
 *
 * O sistema registra o recebimento desde sempre (`parcelas.valorRecebido`,
 * `recebidoEm`, `formaRecebimento`) e a noiva nunca recebeu comprovante de
 * nada: medido na auditoria do contrato de papel, **zero ocorrências de
 * "recibo" no código**.
 *
 * ## A leitura da cláusula, declarada porque ela decide o desenho inteiro
 *
 * *"todos os recibos de pagamentos EFETUADOS"* — o documento é do PAGAMENTO,
 * não da parcela. **O recibo é por RECEBIMENTO.**
 *
 * A diferença não é acadêmica: uma parcela deste sistema recebe em pedaços
 * (E49, `POST /parcelas/:id/receber` acumula e marca PARCIAL). A noiva que paga
 * R$ 300,00 em dinheiro hoje efetuou um pagamento hoje, e a cláusula manda dar
 * o recibo dele hoje — não daqui a um mês, quando os R$ 700,00 restantes
 * quitarem a parcela. Se o recibo fosse por PARCELA, o único papel possível
 * diria *"R$ 1.000,00 em 15/03"*, e o pagamento de 01/03 ficaria sem documento
 * nenhum. Um recibo que não prova o dia em que o dinheiro entrou não prova o
 * que a cláusula manda provar.
 *
 * ## De onde saem os atos, e por que NÃO é uma tabela nova
 *
 * A parcela guarda só o ACUMULADO: `valorRecebido` é a soma, `recebidoEm` é o
 * instante do último recebimento. Os atos individuais existem em um lugar só —
 * a trilha, uma linha `PARCELA_RECEBIDA` por recebimento, escrita **dentro da
 * mesma transação do dinheiro** (`contratos.ts`, o `registrarAuditoria` logo
 * abaixo do CAS). Nenhum recebimento entra sem a linha, e nenhuma linha existe
 * sem o recebimento.
 *
 * Uma tabela `recebimentos` seria o mesmo fato gravado duas vezes, com o dever
 * eterno de somar igual à parcela e à trilha. Ela nasceria já como a terceira
 * verdade sobre o mesmo dinheiro.
 *
 * **E isto NÃO contradiz a decisão 2 do E211** (*"o degrau é coluna, não
 * contagem da trilha"*): lá o JSON de auditoria decidiria quanto COBRAR — uma
 * conta de dinheiro futuro dependendo do formato de um campo que existe para
 * narrar. Aqui o papel DECLARA um fato passado, que é exatamente o que a trilha
 * é. A diferença entre calcular com a trilha e narrar a partir dela é a mesma
 * entre orçar e dar quitação.
 *
 * ## E o papel não confia na trilha sozinha: ele CONCILIA
 *
 * A soma dos atos válidos é conferida contra o `valorRecebido` da parcela antes
 * de qualquer recibo ser emitido. Duas saídas, e as duas estão declaradas:
 *
 * - **soma > recebido** — a parcela devolveu dinheiro por um caminho que este
 *   módulo não conhece. **Nenhum recibo sai** (falha fechada): recibo de
 *   dinheiro estornado é documento falso, e essa é a única falha possível que
 *   custa caro.
 * - **soma < recebido** — há dinheiro na parcela sem ato registrado. É o caso
 *   do legado e do seed, que gravam parcela paga direto no banco. Os recibos
 *   que existem saem; o resto **não é inventado**. O sistema não emite recibo
 *   de recebimento que ele não viu acontecer.
 *
 * ## S-C50 — o que a soma soma, e por que não é o valor pago
 *
 * Um pagamento pode quitar DUAS linhas do carnê. Quem deve R$ 500,00 vencidos
 * há 30 dias paga **R$ 515,00** (multa de 2% = R$ 10,00 + juros de 1% ao mês
 * *pro rata die* = R$ 5,00), e o E213 quita a parcela no principal e
 * cristaliza os R$ 15,00 numa linha própria de origem `MORA`, nascida PAGA na
 * mesma transação. A parcela fica com `valorRecebido = 500`; o ato da trilha
 * diz `valorRecebido = 515`.
 *
 * A conciliação comparava os dois e via **515 > 500** — a falha fechada
 * disparava e **nenhum papel saía**, nem o do principal nem o da multa. Não
 * era dinheiro devolvido: era dinheiro que foi para outra linha, viva e
 * contável. Por isso o que fecha com a parcela é `valorNaParcela`
 * (`detalhe.aoPrincipal`), e o que o papel imprime é `valor` — o que a noiva
 * pagou. **A guarda não afrouxou; ela passou a comparar o que é comparável.**
 *
 * E o recibo continua sendo **UM por pagamento**: a linha de `MORA` não emite
 * papel próprio, porque o dinheiro dela já está no recibo do pagamento que a
 * criou. Ela não tem ato `PARCELA_RECEBIDA` — o `MORA_RECEBIDA` do E213 narra
 * o nascimento da linha, não um segundo recebimento.
 */

/** A ação da trilha que É um recebimento. */
const ACAO_RECEBIMENTO = "PARCELA_RECEBIDA";

/**
 * O que anula os recibos anteriores de uma parcela.
 *
 * O estorno deste repositório é tudo-ou-nada (E49: *"a parcela não tem livro de
 * recebimentos, só o acumulado"*), então ele não anula UM ato: anula todos os
 * que vieram antes dele. Depois do estorno a contagem recomeça do zero, e os
 * recebimentos novos valem normalmente.
 *
 * São dois caminhos, e os dois zeram dinheiro que já tinha entrado:
 * `RECEBIMENTO_ESTORNADO` (o estorno avulso, entidade parcela) e
 * `CONTRATO_CANCELADO` com `destinoPago: "estornar"` (entidade contrato, que
 * marca as pagas como CANCELADA e limpa o `valorRecebido`). Com
 * `destinoPago: "manter"` o dinheiro FICA — e o recibo dele continua valendo,
 * porque o pagamento aconteceu e não foi devolvido.
 */
function ehEstorno(linha: LinhaDaTrilha, parcela: ParcelaDoRecibo): boolean {
  if (linha.acao === "RECEBIMENTO_ESTORNADO") return linha.entidadeId === parcela.id;
  if (linha.acao === "CONTRATO_CANCELADO" && linha.entidadeId === parcela.contratoId) {
    const detalhe = linha.detalhe as { destinoPago?: unknown } | null;
    return detalhe?.destinoPago === "estornar";
  }
  return false;
}

/**
 * O que este módulo precisa saber de uma parcela — id, contrato e o acumulado.
 *
 * ESTRUTURAL de propósito, e não `Parcela` (S-C31): o caixa realizado passa a
 * ler os mesmos atos para datar cada recebimento pelo dia dele, e ele monta a
 * consulta com o recorte que precisa, não com a linha inteira do drizzle. A
 * linha do drizzle continua entrando igual — ela tem os três campos.
 */
export type ParcelaDoRecibo = {
  id: string;
  contratoId: string;
  valorRecebido?: number | null;
};

/** A linha de trilha que este módulo lê — o subconjunto de `AuditLog`. */
export type LinhaDaTrilha = Pick<
  AuditLog,
  "id" | "acao" | "entidadeId" | "usuarioNome" | "criadoEm" | "detalhe"
>;

/** Um recibo: um recebimento que aconteceu e não foi desfeito. */
export type Recibo = {
  /** O id da linha da trilha — imutável, e é por ele que a rota endereça. */
  id: string;
  parcelaId: string;
  contratoId: string;
  /** O rótulo da parcela NO MOMENTO do ato: "Entrada" ou "Parcela 3". */
  parcela: string;
  /** O que a noiva pagou NESTE ato — principal + multa e juros. */
  valor: number;
  /**
   * **S-C50 — quanto deste pagamento quitou a PARCELA**, e quanto foi a multa
   * da cláusula 9ª.
   *
   * Um pagamento pode quitar duas linhas do carnê: quem deve R$ 500,00
   * vencidos há 30 dias e paga R$ 515,00 quita a parcela **e** faz nascer a
   * linha de `MORA` de R$ 15,00 (E213, PAGA na mesma transação). O papel é UM
   * — a cláusula 7ª é do PAGAMENTO —, e ele diz a divisão em vez de mostrar um
   * total que não bate com a parcela que a noiva está olhando.
   *
   * É `valorNaParcela` que a conciliação compara com o `valorRecebido` dela:
   * comparar o valor PAGO acusaria divergência em todo recebimento com multa e
   * calaria os dois papéis, que era o defeito.
   */
  valorNaParcela: number;
  /** Multa e juros da cláusula 9ª pagos neste ato — `0` quando não houve. */
  mora: number;
  /**
   * O dia do PAGAMENTO — `recebidoEm`, que a vendedora informa e pode ser
   * anterior ao lançamento (o dinheiro entrou sábado, ela lançou segunda).
   *
   * O `??` é a dívida honesta: a trilha só passou a gravar `recebidoEm` no
   * E221, e o recibo de um recebimento anterior data pelo instante em que a
   * linha foi escrita. Para esses o papel diz o dia do LANÇAMENTO, que é o
   * único dia que o sistema guardou.
   */
  pagoEm: Date;
  forma: string | null;
  /** Quem lançou — para a loja saber a quem perguntar. */
  lancadoPor: string;
  /** O acumulado e o que sobrou DEPOIS deste recebimento. */
  totalRecebido: number;
  saldoRestante: number;
};

export type RecibosDaParcela = {
  recibos: Recibo[];
  /** A soma dos recibos bate com o `valorRecebido` da parcela. */
  confere: boolean;
  somaC: number;
  recebidoC: number;
};

/**
 * Os recibos de UMA parcela, a partir da trilha dela. Pura: sem banco, sem
 * Express — quem carrega as linhas é a rota, que é quem tem o escopo.
 */
export function recibosDaParcela(
  parcela: ParcelaDoRecibo,
  trilha: readonly LinhaDaTrilha[],
): RecibosDaParcela {
  const corte = trilha
    .filter((l) => ehEstorno(l, parcela))
    .reduce<Date | null>((maior, l) => (!maior || l.criadoEm > maior ? l.criadoEm : maior), null);

  const atos = trilha
    .filter(
      (l) =>
        l.acao === ACAO_RECEBIMENTO &&
        l.entidadeId === parcela.id &&
        (!corte || l.criadoEm > corte),
    )
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());

  const recibos = atos.map((l): Recibo => {
    const d = (l.detalhe ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
    // S-C50: a divisão só passou a ser gravada depois do E213 ter começado a
    // criar a linha de MORA. Sem ela o pagamento foi inteiro para a parcela —
    // é o que era verdade de todo ato anterior, e a queda diz exatamente isso.
    const valorNaParcela = d.aoPrincipal === undefined ? num(d.valorRecebido) : num(d.aoPrincipal);
    return {
      id: l.id,
      parcelaId: parcela.id,
      contratoId: parcela.contratoId,
      // O NÚMERO manda sobre a descrição, a mesma régua do PDF do contrato: a
      // entrada é definida por `numero === 0`, e a trilha guarda o número do
      // momento do ato (o `gerar-plano` renumera depois — P2/E94).
      parcela: num(d.numero) === 0 ? "Entrada" : `Parcela ${num(d.numero)}`,
      valor: num(d.valorRecebido),
      valorNaParcela,
      mora: num(d.aMora),
      pagoEm: d.recebidoEm ? new Date(String(d.recebidoEm)) : l.criadoEm,
      forma: typeof d.formaRecebimento === "string" ? d.formaRecebimento : null,
      lancadoPor: l.usuarioNome,
      totalRecebido: num(d.totalRecebido),
      saldoRestante: num(d.saldoRestante),
    };
  });

  /**
   * **S-C72 — dentro de cada ato, os dois destinos têm de fechar com o pago.**
   *
   * A S-C50 conferiu a soma dos atos contra o `valorRecebido` da PARCELA — um
   * andar acima. Dentro de um ato ninguém conferia nada: a porta divide o que
   * entrou em `aoPrincipal` (o que fica na parcela) e `aMora` (o que vira linha
   * própria da 9ª), e por construção `aoPrincipalC + aMoraC === entrandoC`
   * (`contratos.ts:2550-2551`). Mas a construção é de UM lado; a leitura é do
   * outro, e nada as amarrava.
   *
   * Um terceiro destino do mesmo pagamento — uma taxa, um arredondamento, uma
   * fatia que fosse para outro lugar — entraria **calado**: o recibo mostraria
   * o valor pago inteiro, a parcela receberia só a sua parte, e a diferença não
   * apareceria em lugar nenhum. É a classe exata da S-C50, um andar abaixo.
   *
   * **Falha FECHADA**, como a guarda logo abaixo: se os destinos não fecham,
   * `confere` é falso e a divisão não acontece — a parcela entra no caixa como
   * uma linha só, datada pelo `recebidoEm`, que é o comportamento de antes da
   * S-C31. Dividir com base numa conta que não fecha seria espalhar o erro por
   * várias datas em vez de mantê-lo numa.
   *
   * Só vale para o ato que TEM a divisão: antes do E213 o `detalhe` não trazia
   * `aoPrincipal`, e o pagamento foi inteiro para a parcela — é o que era
   * verdade, e exigir a soma de campos que não existem reprovaria a história.
   */
  const atoQueNaoFecha = atos.find((l) => {
    const d = (l.detalhe ?? {}) as Record<string, unknown>;
    if (d.aoPrincipal === undefined) return false;
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
    return (
      centavos(num(d.aoPrincipal)) + centavos(num(d.aMora)) !== centavos(num(d.valorRecebido))
    );
  });
  if (atoQueNaoFecha) {
    return { recibos: [], confere: false, somaC: 0, recebidoC: centavos(parcela.valorRecebido ?? 0) };
  }

  // S-C50: o que se compara com o `valorRecebido` da parcela é o que os atos
  // puseram NELA. O valor pago é maior sempre que a cláusula 9ª incidiu, e a
  // diferença está viva noutra linha do carnê — não é dinheiro que sumiu.
  const somaC = recibos.reduce((s, r) => s + centavos(r.valorNaParcela), 0);
  const recebidoC = centavos(parcela.valorRecebido ?? 0);
  // Falha FECHADA: soma maior que o recebido significa dinheiro devolvido por
  // um caminho que `ehEstorno` não conhece. Nada sai.
  if (somaC > recebidoC) {
    return { recibos: [], confere: false, somaC, recebidoC };
  }
  return { recibos, confere: somaC === recebidoC, somaC, recebidoC };
}

/** Os recibos de um contrato inteiro, na ordem do pagamento. */
export function recibosDoContrato(parcelas: Parcela[], trilha: LinhaDaTrilha[]): Recibo[] {
  return parcelas
    .flatMap((p) => recibosDaParcela(p, trilha).recibos)
    .sort((a, b) => a.pagoEm.getTime() - b.pagoEm.getTime());
}

export type DadosDoRecibo = {
  recibo: Recibo;
  loja: Loja;
  lead: Lead | null;
  contrato: Contrato;
};

/**
 * O papel. O que ele tem de dizer para VALER como recibo — quem pagou, quanto,
 * quando, por qual forma, referente a quê, e quem emitiu — está uma linha por
 * pergunta, e os dados da loja saem do CADASTRO, nunca de código (é por isso
 * que a P3 do plano manda a dona preencher *Configurações → Dados da loja*:
 * enquanto o CNPJ for o exemplo do seed, o recibo sai com o exemplo).
 */
export function pdfDoRecibo(d: DadosDoRecibo): Uint8Array {
  return desenharPdf(montarTokensDoRecibo(d));
}

function montarTokensDoRecibo(d: DadosDoRecibo): Token[] {
  const { tokens, add, vazio, dado, bloco } = montadorDeTokens();
  const { recibo, loja, lead, contrato } = d;

  add("RECIBO DE PAGAMENTO", 16);
  // O número do recibo é o id da linha da trilha, encurtado para caber na boca
  // de quem cita ("o recibo 3F2A9C1B"). Não é numeração fiscal sequencial, e o
  // papel não finge que é — ver a linha de rodapé.
  add(`No ${numeroDoRecibo(recibo.id)}`, 12);
  vazio();

  // Quem EMITE, com o CNPJ: sem ele o papel não identifica a locadora.
  add("RECEBEMOS DE", 12);
  dado("Nome", lead?.noivaNome ?? "");
  dado("CPF", contrato.cpf ?? undefined);
  vazio();

  add("A QUANTIA DE", 12);
  add(brl(recibo.valor), 14);
  dado("Data do pagamento", dataBR.format(recibo.pagoEm));
  dado("Forma de pagamento", rotuloForma(recibo.forma));
  vazio();

  add("REFERENTE A", 12);
  dado("Contrato", `${contrato.id.slice(0, 8).toUpperCase()} de ${dataBRInstante.format(contrato.fechadoEm)}`);
  dado("Parcela", recibo.parcela);
  /**
   * S-C50 — um pagamento pode quitar duas linhas, e o papel diz quais.
   *
   * Sem estas duas linhas o recibo diria R$ 515,00 ao lado de uma parcela de
   * R$ 500,00 sem explicar a diferença — que é a mesma classe de defeito da
   * S-C34, onde a mensagem de cobrança cita o total com multa e não a nomeia.
   * Número maior sem conta ao lado é o que gera a ligação para a loja.
   */
  if (recibo.mora > 0) {
    dado("Quitacao desta parcela", brl(recibo.valorNaParcela));
    dado("Multa e juros (cláusula 9ª)", brl(recibo.mora));
  }
  dado("Valor total do contrato", brl(contrato.valorTotal));
  // O acumulado e o saldo: é o que faz o recibo de um recebimento PARCIAL
  // dizer o que ele é, em vez de parecer a quitação da parcela.
  dado("Ja recebido nesta parcela", brl(recibo.totalRecebido));
  dado("Saldo desta parcela", brl(recibo.saldoRestante));
  vazio();

  add("EMITIDO POR", 12);
  add(loja.nome, 12);
  dado("CNPJ", loja.cnpj ?? undefined);
  dado("Endereco", loja.endereco ?? undefined);
  dado("Telefone", loja.telefone ?? undefined);
  // E234: o recibo é o papel do PAGAMENTO, e a chave é onde se paga — sai
  // quando o cadastro a tem; sem chave, a linha não sai (não é lacuna do molde).
  if (loja.pixChave) dado("PIX", pixDaLoja(loja));
  dado("Lancado por", recibo.lancadoPor);
  vazio();

  add("Este recibo comprova o recebimento acima e nao substitui documento fiscal.", 9);

  bloco(
    [
      { text: "__________________________________", size: 11 },
      { text: loja.nome, size: 11 },
      { text: "Locadora", size: 9 },
    ],
    30,
  );

  return tokens;
}

/** "3F2A9C1B" — os 8 primeiros do id da trilha, em caixa alta. */
export function numeroDoRecibo(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** O nome do arquivo, o mesmo dos dois lados (loja e portal). */
export function nomeDoArquivoDoRecibo(recibo: Recibo, lead: Lead | null): string {
  return `recibo-${numeroDoRecibo(recibo.id).toLowerCase()}-${slug(lead?.noivaNome ?? "")}.pdf`;
}
