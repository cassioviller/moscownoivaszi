/**
 * **E272 — o legado do papel, empacotado para viajar até a instalação real.**
 *
 *   DATABASE_URL="…/moscow_base" pnpm --filter @workspace/api-server exec \
 *     tsx ../../scripts/exportar-legado.ts > docs/legado/2026-08-17-caderno.json
 *
 * O caderno do ateliê são **29 fotos** transcritas em
 * `docs/revisao/2026-08-04-arqueologia-legado/transcricao-2026-08-10.json` (14
 * semanas de saídas, 61 dias de agenda, 136 saídas, 130 nomes de noiva, 124
 * grafias de peça). Aquele arquivo é a LEITURA da caligrafia; o que está no
 * `moscow_base` é o que a loja CUROU a partir dela — 132 peças com código
 * L001–L132, 131 já classificadas por Tipo de peça (S-A27), e as noivas como
 * leads.
 *
 * **Este script exporta o curado, não a leitura**, e a diferença importa: a
 * transcrição tem dúvida de caligrafia registrada (`Ijatara` ou `Ijatana`), tem
 * a mesma noiva em duas semanas e tem peça que aparece com dois nomes. Quem já
 * resolveu isso foi a loja, peça a peça, e o resultado é o que se leva para
 * produção.
 *
 * O JSON que ele escreve é o que o `importar-legado` do servidor lê — e ele
 * carrega NOME de atributo e de opção, não id: os ids do catálogo nascem do
 * seed de cada instalação, e casar por id seria casar com a sorte.
 *
 * Ele não escreve NADA no banco. Lê, monta e imprime no stdout.
 */
import {
  db,
  pool,
  lojasTable,
  vestidosTable,
  leadsTable,
  vestidoAtributosTable,
  atributoOpcoesTable,
  atributosTable,
} from "../lib/db/src/index";
import { eq, asc } from "drizzle-orm";

/** A loja de onde se exporta. Sem argumento, a única loja do banco. */
const lojaPedida = process.argv[2];

type PecaExportada = {
  codigo: string;
  nome: string;
  // O drizzle devolve `numeric` como NÚMERO na leitura deste schema, e o JSON
  // sai com número. O importador aceita os dois e converte para texto na
  // escrita, que é o que a coluna pede.
  precoBase: number;
  precoRealuguel: number | null;
  tamanho: string | null;
  cor: string | null;
  categoria: string | null;
  status: string;
  exclusiva: boolean;
  observacoes: string | null;
  /** Pares "atributo → opção", por NOME. Ver o cabeçalho. */
  atributos: { atributo: string; opcao: string }[];
};

type LeadExportado = {
  noivaNome: string;
  etapa: string;
  origem: string;
  casamentoData: string | null;
  casamentoLocal: string | null;
  whatsapp: string | null;
};

/**
 * **As colunas saem NOMEADAS, e não por `select()`.**
 *
 * O `moscow_base` — o banco da loja, de onde este pacote sai — está ATRÁS do
 * schema do código: medido em 17/08/2026, `select * from lojas` morre com
 * `column "cidade" does not exist` (42703), porque as migrações que o dev
 * aplica no `heliumdb` nunca correram lá. Pedir só o que se exporta faz o
 * script atravessar essa diferença em vez de morrer nela — e o que ele exporta
 * é justamente o que não mudou: código, nome, preço, tamanho e o nome da noiva.
 */
async function main(): Promise<void> {
  const lojas = await db
    .select({ id: lojasTable.id, nome: lojasTable.nome })
    .from(lojasTable)
    .orderBy(asc(lojasTable.createdAt));
  const loja = lojaPedida
    ? lojas.find((l) => l.id === lojaPedida || l.nome === lojaPedida)
    : lojas[0];

  if (!loja) {
    throw new Error(
      `Loja não encontrada${lojaPedida ? ` para "${lojaPedida}"` : ""}. ` +
        `O banco tem ${lojas.length}: ${lojas.map((l) => `${l.nome} (${l.id})`).join(", ")}`,
    );
  }
  if (!lojaPedida && lojas.length > 1) {
    throw new Error(
      `O banco tem ${lojas.length} lojas e nenhuma foi escolhida — passe o id ou o nome ` +
        `como argumento. Exportar da loja errada é o defeito que a S-R9 pagou caro: ` +
        lojas.map((l) => `${l.nome} (${l.id})`).join(", "),
    );
  }

  const pecas = await db
    .select({
      id: vestidosTable.id,
      codigo: vestidosTable.codigo,
      nome: vestidosTable.nome,
      precoBase: vestidosTable.precoBase,
      precoRealuguel: vestidosTable.precoRealuguel,
      tamanho: vestidosTable.tamanho,
      cor: vestidosTable.cor,
      categoria: vestidosTable.categoria,
      status: vestidosTable.status,
      exclusiva: vestidosTable.exclusiva,
      observacoes: vestidosTable.observacoes,
    })
    .from(vestidosTable)
    .where(eq(vestidosTable.lojaId, loja.id))
    .orderBy(asc(vestidosTable.codigo));

  const classificacoes = await db
    .select({
      vestidoId: vestidoAtributosTable.vestidoId,
      atributo: atributosTable.nome,
      opcao: atributoOpcoesTable.valor,
    })
    .from(vestidoAtributosTable)
    .innerJoin(atributoOpcoesTable, eq(atributoOpcoesTable.id, vestidoAtributosTable.opcaoId))
    .innerJoin(atributosTable, eq(atributosTable.id, atributoOpcoesTable.atributoId));

  const porVestido = new Map<string, { atributo: string; opcao: string }[]>();
  for (const c of classificacoes) {
    const lista = porVestido.get(c.vestidoId) ?? [];
    lista.push({ atributo: c.atributo, opcao: c.opcao });
    porVestido.set(c.vestidoId, lista);
  }

  const leads = await db
    .select({
      noivaNome: leadsTable.noivaNome,
      etapa: leadsTable.etapa,
      origem: leadsTable.origem,
      casamentoData: leadsTable.casamentoData,
      casamentoLocal: leadsTable.casamentoLocal,
      whatsapp: leadsTable.whatsapp,
      createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .where(eq(leadsTable.lojaId, loja.id))
    .orderBy(asc(leadsTable.createdAt));

  const pecasExportadas: PecaExportada[] = pecas.map((p) => ({
    codigo: p.codigo,
    nome: p.nome,
    precoBase: p.precoBase,
    precoRealuguel: p.precoRealuguel,
    tamanho: p.tamanho,
    cor: p.cor,
    categoria: p.categoria,
    status: p.status,
    exclusiva: p.exclusiva,
    observacoes: p.observacoes,
    atributos: porVestido.get(p.id) ?? [],
  }));

  const leadsExportados: LeadExportado[] = leads.map((l) => ({
    noivaNome: l.noivaNome,
    etapa: l.etapa,
    origem: l.origem,
    casamentoData: l.casamentoData ? l.casamentoData.toISOString() : null,
    casamentoLocal: l.casamentoLocal,
    whatsapp: l.whatsapp,
  }));

  const pacote = {
    _sobre:
      "O legado do caderno de papel do ateliê (29 fotos, transcritas em 2026-08-10 e " +
      "curadas na loja), empacotado para a instalação de produção. Gerado por " +
      "scripts/exportar-legado.ts. Só peças e noivas: nada de contrato, parcela ou dinheiro.",
    versao: 1,
    origem: { loja: loja.nome, lojaId: loja.id },
    pecas: pecasExportadas,
    leads: leadsExportados,
  };

  process.stdout.write(JSON.stringify(pacote, null, 2) + "\n");
  console.error(
    `[exportar-legado] ${pecasExportadas.length} peças (${
      pecasExportadas.filter((p) => p.atributos.length > 0).length
    } classificadas) e ${leadsExportados.length} noivas da loja "${loja.nome}"`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[exportar-legado] falhou:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
