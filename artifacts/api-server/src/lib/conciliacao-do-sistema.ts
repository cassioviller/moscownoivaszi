import { conciliacaoDeRecebimentosTable, db, pagamentosTable, parcelasTable } from "@workspace/db";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { addDias, diaLocal, inicioDoDia } from "@workspace/financeiro-core";
import { realizadoPorRecebimento, recebidasNaJanela, trilhaDosRecebimentos } from "./recibos-do-banco";
import { recibosDaParcela } from "./recibo-do-papel";

/**
 * **E235 (S-C51) — os movimentos do sistema que a conciliação compara com o
 * extrato, um por PAGAMENTO.**
 *
 * ## O defeito, com o número
 *
 * A tela montava um `MovimentoSistema` por PARCELA (`conciliacao.tsx:147-158`),
 * datado pelo `recebidoEm` — que é o instante do ÚLTIMO pedaço. Contra um
 * extrato que traz as DUAS linhas do banco (R$ 300,00 em 01/03 e R$ 700,00 em
 * 15/03) de uma parcela de R$ 1.000,00, ela produzia **três divergências
 * falsas** — duas "só no banco" e uma "só no sistema" — de um pagamento
 * perfeitamente correto. Contadora, 15/08/2026: *por pagamento*, porque é o
 * que o extrato traz linha a linha.
 *
 * ## A leitura é a do CAIXA, não uma nova
 *
 * O sistema já sabe listar os atos: o recibo da 7ª (E221) os monta da trilha e
 * o caixa realizado (S-C31) data cada pedaço por eles. Aqui é a **mesma
 * leitura** — `recebidasNaJanela` + `realizadoPorRecebimento` — e por isso as
 * decisões da S-C31 valem inteiras: a parcela só se divide quando a trilha
 * FECHA com o `valorRecebido`; **um ato só não se divide** (o `recebidoEm` da
 * parcela é o dia dele); a parcela sem ato (o legado — 2 de 303 hoje — e o
 * seed) continua UM movimento, como sempre. Duas leituras do mesmo fato seriam
 * duas verdades sobre o mesmo dinheiro.
 *
 * ## Os três ids, e o carimbo de cada um
 *
 * | id | o que é | onde mora o carimbo |
 * |---|---|---|
 * | `recibo:<atoId>` | um pedaço de parcela dividida — o id da linha da trilha, o mesmo que o recibo cita | `conciliacao_de_recebimentos` (por ato) — ou, se a parcela inteira já tinha carimbo antes do E235, o dela |
 * | `parcela:<id>` | parcela que não se divide (um ato, sem ato, ou trilha que não fecha) | `parcelas.conciliado_em`, como sempre |
 * | `pagamento:<id>` | saída de caixa | `pagamentos.conciliado_em`, como sempre |
 *
 * O `MovimentoSistema` do motor de casamento (`conciliarExtrato`) NÃO ganha o
 * carimbo — aquele tipo é do E70 e compara valor e data; o carimbo vai ao
 * lado, no mesmo formato de sempre da tela (`carimboPorMovimento`).
 *
 * ## O que este montador NÃO decide
 *
 * O valor do pedaço é o que entrou NA PARCELA (`valorNaParcela`, S-C50): a
 * multa da 9ª paga no mesmo PIX vive numa linha de `MORA` própria, que entra
 * aqui como outro movimento. Para o extrato, o PIX foi um só de R$ 715,00 —
 * e nem R$ 700,00 nem R$ 15,00 casam com ele. É a S-C310, declarada no
 * rastreador; população medida em 15/08: **zero** parcelas de MORA no
 * `heliumdb`.
 */
export type MovimentoDoSistema = {
  id: string;
  /** "YYYY-MM-DD" do movimento, no dia LOCAL de São Paulo. */
  data: string;
  descricao: string;
  /** Reais, sempre positivo. */
  valor: number;
  tipo: "recebimento" | "pagamento";
  /** O carimbo "casou com o extrato" deste movimento; `null` = ainda não. */
  conciliadoEm: string | null;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function movimentosDoSistema(
  lojaId: string,
  deYMD: string,
  ateYMD: string,
): Promise<MovimentoDoSistema[]> {
  const [parcelas, pagamentos] = await Promise.all([
    db.query.parcelasTable.findMany({
      where: await recebidasNaJanela(lojaId, deYMD, ateYMD),
      columns: {
        id: true,
        contratoId: true,
        numero: true,
        descricao: true,
        status: true,
        origem: true,
        recebidoEm: true,
        valorRecebido: true,
        formaRecebimento: true,
        conciliadoEm: true,
      },
    }),
    db.query.pagamentosTable.findMany({
      where: and(
        eq(pagamentosTable.lojaId, lojaId),
        gte(pagamentosTable.data, inicioDoDia(deYMD)),
        lt(pagamentosTable.data, inicioDoDia(addDias(ateYMD, 1))),
      ),
      with: { colaborador: { columns: { nome: true } } },
    }),
  ]);

  // O `parcelaId` sobrevive à divisão (o spread do `porRecebimento` o preserva);
  // o `id` de cada pedaço passa a ser o da linha da trilha.
  const divididas = await realizadoPorRecebimento(
    lojaId,
    parcelas.map((p) => ({ ...p, parcelaId: p.id })),
  );

  const atoIds = divididas.filter((d) => d.id !== d.parcelaId).map((d) => d.id);
  const carimboDoAto = new Map<string, Date>();
  if (atoIds.length > 0) {
    const linhas = await db
      .select({ atoId: conciliacaoDeRecebimentosTable.atoId, conciliadoEm: conciliacaoDeRecebimentosTable.conciliadoEm })
      .from(conciliacaoDeRecebimentosTable)
      .where(and(eq(conciliacaoDeRecebimentosTable.lojaId, lojaId), inArray(conciliacaoDeRecebimentosTable.atoId, atoIds)));
    for (const l of linhas) carimboDoAto.set(l.atoId, l.conciliadoEm);
  }


  /**
   * **S-C310 — para o banco, o pedaço vale o que a noiva PAGOU.**
   *
   * O PIX de R$ 715,00 que pagou R$ 700,00 de parcela e R$ 15,00 de multa
   * (cláusula 9ª) é UMA linha no extrato. No sistema são duas coisas: o ato
   * (`aoPrincipal` 700, `aMora` 15, `valorRecebido` 715) e a linha de `MORA`
   * que o E213 cria PAGA na mesma transação. Antes deste conserto a conciliação
   * mostrava R$ 700,00 + R$ 15,00 e nenhum casava com os R$ 715,00 do banco —
   * a S-C51 um andar abaixo. Aqui o movimento do ato vale o PAGO e a linha de
   * MORA que ELE criou não entra como movimento próprio (ela é o mesmo
   * dinheiro, visto do carnê). O caixa (`porRecebimento`) continua dividindo em
   * principal + MORA — lá a pergunta é "quanto entrou na parcela"; aqui é
   * "quanto passou pelo banco".
   *
   * A ligação é a que a porta grava: `PARCELA_RECEBIDA.detalhe.moraParcelaId`.
   * Para o ato DIVIDIDO (`recibo:`), o pago é o `valorRecebido` da linha da
   * trilha; para a parcela de um ato só (`parcela:`), é o `valorRecebido` da
   * parcela mais a soma das linhas de MORA que os atos dela criaram.
   */
  /**
   * **E243 (A3 da conferência) — os atos que contam são os VÁLIDOS.**
   *
   * Aqui se somava o `aMora` de TODAS as `PARCELA_RECEBIDA` da parcela, sem o
   * corte do estorno que `recibosDaParcela` aplica: ato A paga R$ 515,00 (mora
   * 15, nasce a linha MORA), estorno avulso (a parcela volta a PREVISTA e a
   * MORA cai), ato B paga R$ 500,00 — e o movimento `parcela:` dizia
   * **R$ 515,00 "inclui multa e juros"** contra R$ 500,00 no extrato:
   * divergência falsa dos dois lados. Agora a mora de cada parcela sai dos
   * MESMOS recibos que o papel emite e que `porRecebimento` usa para dividir
   * — o ato anterior ao estorno não é recibo, logo não é mora. Uma leitura,
   * três usos.
   */
  const trilha = await trilhaDosRecebimentos(lojaId, parcelas.flatMap((p) => [p.id, p.contratoId]));
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
  /** id da linha da trilha → a linha de MORA que aquele ato criou. */
  const moraCriadaPeloAto = new Map<string, string>();
  for (const l of trilha) {
    if (l.acao !== "PARCELA_RECEBIDA") continue;
    const d = (l.detalhe ?? {}) as Record<string, unknown>;
    if (typeof d.moraParcelaId === "string") moraCriadaPeloAto.set(l.id, d.moraParcelaId);
  }
  /** ato → { pago } — só atos válidos (depois do último estorno). */
  const doAto = new Map<string, { pago: number }>();
  /** parcela de origem → soma da mora dos atos VÁLIDOS dela (para a parcela que não se divide). */
  const moraDaParcela = new Map<string, number>();
  /** linha de MORA → a parcela de origem (só absorvida se a origem entrar na janela). */
  const origemDaMora = new Map<string, string>();
  for (const p of parcelas) {
    if (p.origem === "MORA") continue;
    for (const r of recibosDaParcela(p, trilha).recibos) {
      doAto.set(r.id, { pago: r.valor });
      const moraId = moraCriadaPeloAto.get(r.id);
      if (moraId && num(r.mora) > 0) {
        moraDaParcela.set(p.id, (moraDaParcela.get(p.id) ?? 0) + num(r.mora));
        origemDaMora.set(moraId, p.id);
      }
    }
  }
  const naJanela = (d: { recebidoEm?: Date | string | null; valorRecebido?: number | null }) => {
    if (!d.recebidoEm || !d.valorRecebido) return false;
    const dia = diaLocal(d.recebidoEm);
    return dia >= deYMD && dia <= ateYMD;
  };
  const parcelasEmitidas = new Set(divididas.filter((d) => d.origem !== "MORA" && naJanela(d)).map((d) => d.parcelaId));
  const movimentos: MovimentoDoSistema[] = [];
  for (const d of divididas) {
    if (!d.recebidoEm || !d.valorRecebido) continue;
    // A linha de MORA criada por um ato que está nesta janela é o mesmo dinheiro.
    if (d.origem === "MORA" && parcelasEmitidas.has(origemDaMora.get(d.parcelaId) ?? "")) continue;
    const dia = diaLocal(d.recebidoEm);
    if (dia < deYMD || dia > ateYMD) continue;
    const ehAto = d.id !== d.parcelaId;
    const moraJunto = ehAto ? (doAto.get(d.id)?.pago ?? Number(d.valorRecebido)) - Number(d.valorRecebido) : (moraDaParcela.get(d.parcelaId) ?? 0);
    const valorPago = Number(d.valorRecebido) + Math.max(0, moraJunto);
    const rotulo = `${d.numero === 0 ? "Entrada" : `Parcela ${d.numero}`}${d.descricao ? ` · ${d.descricao}` : ""}`;
    movimentos.push({
      id: ehAto ? `recibo:${d.id}` : `parcela:${d.id}`,
      data: dia,
      valor: valorPago,
      tipo: "recebimento",
      // C6 (E243): o número inclui a correção quando há IPCA — o rótulo diz os três termos (S-C330).
      descricao: moraJunto > 0 ? `${rotulo} · inclui multa, juros e correção da 9ª` : rotulo,
      // A parcela inteira carimbada ANTES do E235 cobre os pedaços dela.
      conciliadoEm: iso(ehAto ? (carimboDoAto.get(d.id) ?? d.conciliadoEm) : d.conciliadoEm),
    });
  }
  for (const pg of pagamentos) {
    const dia = diaLocal(pg.data);
    if (dia < deYMD || dia > ateYMD) continue;
    movimentos.push({
      id: `pagamento:${pg.id}`,
      data: dia,
      valor: Number(pg.valorPago),
      tipo: "pagamento",
      descricao: pg.colaborador?.nome ?? pg.observacoes ?? "Pagamento",
      conciliadoEm: iso(pg.conciliadoEm),
    });
  }
  movimentos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));
  return movimentos;
}
