import { conciliacaoDeRecebimentosTable, db, pagamentosTable, parcelasTable } from "@workspace/db";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { addDias, diaLocal, inicioDoDia } from "@workspace/financeiro-core";
import { realizadoPorRecebimento, recebidasNaJanela } from "./recibos-do-banco";

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

  const movimentos: MovimentoDoSistema[] = [];
  for (const d of divididas) {
    if (!d.recebidoEm || !d.valorRecebido) continue;
    const dia = diaLocal(d.recebidoEm);
    if (dia < deYMD || dia > ateYMD) continue;
    const ehAto = d.id !== d.parcelaId;
    const rotulo = `${d.numero === 0 ? "Entrada" : `Parcela ${d.numero}`}${d.descricao ? ` · ${d.descricao}` : ""}`;
    movimentos.push({
      id: ehAto ? `recibo:${d.id}` : `parcela:${d.id}`,
      data: dia,
      valor: Number(d.valorRecebido),
      tipo: "recebimento",
      descricao: rotulo,
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
