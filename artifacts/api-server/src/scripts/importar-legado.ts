/**
 * **E272 — o caderno de papel entra na instalação real, e entra sem apagar nada.**
 *
 *   node dist/importar-legado.mjs /app/legado/2026-08-17-caderno.json          # ENSAIO
 *   node dist/importar-legado.mjs /app/legado/2026-08-17-caderno.json --aplicar
 *
 * O pacote é o que `scripts/exportar-legado.ts` monta a partir do banco da loja
 * — 132 peças com código L001–L132 e as noivas do caderno como leads. Este
 * script o lê e ESCREVE na instalação de produção.
 *
 * As quatro regras dele, e cada uma existe por um defeito que dá para prever:
 *
 * 1. **Ensaio por default.** Sem `--aplicar` ele conta o que faria e não abre
 *    transação nenhuma. Importação que escreve por engano num banco em uso é o
 *    tipo de gesto que não tem desfazer.
 * 2. **Só INSERE.** Nunca atualiza, nunca apaga. Peça cujo código já existe na
 *    loja é PULADA — a loja pode ter corrigido o nome ou o preço na tela, e o
 *    pacote é mais velho que a correção.
 * 3. **Id derivado, para a segunda passada não duplicar.** A peça vira
 *    `legado-<codigo>` e a noiva vira `legado-lead-<posição>`; rodar de novo
 *    esbarra na chave e não escreve. Lead não tem chave natural — duas noivas
 *    podem se chamar Mariane, e o caderno tem exatamente isso.
 * 4. **O catálogo casa por NOME.** `Tipo de peça → Noiva` é resolvido contra os
 *    atributos que o seed criou NESTA instalação; casar por id seria casar com
 *    o id de outro banco. Classificação que não encontra casa é RELATADA e
 *    pulada — a peça entra, sem o atributo.
 *
 * Ele não cria loja, não cria usuário, não cria contrato e não toca em dinheiro
 * nenhum. A loja e o catálogo vêm da configuração inicial (o seed), que roda na
 * primeira subida.
 */
import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  lojasTable,
  vestidosTable,
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
  leadsTable,
} from "@workspace/db";

type PecaDoPacote = {
  codigo: string;
  nome: string;
  precoBase: string | number;
  precoRealuguel: string | number | null;
  tamanho: string | null;
  cor: string | null;
  categoria: string | null;
  status: string;
  exclusiva: boolean;
  observacoes: string | null;
  atributos: { atributo: string; opcao: string }[];
};

type LeadDoPacote = {
  noivaNome: string;
  etapa: string;
  origem: string;
  casamentoData: string | null;
  casamentoLocal: string | null;
  whatsapp: string | null;
};

type Pacote = {
  versao: number;
  origem?: { loja?: string; lojaId?: string };
  pecas: PecaDoPacote[];
  leads: LeadDoPacote[];
};

const arquivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
const lojaPedida = (() => {
  const i = process.argv.indexOf("--loja");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

function lerPacote(caminho: string): Pacote {
  const cru = JSON.parse(readFileSync(caminho, "utf8")) as Pacote;
  if (cru.versao !== 1) {
    throw new Error(`Pacote de versão ${cru.versao}; este script lê a 1.`);
  }
  if (!Array.isArray(cru.pecas) || !Array.isArray(cru.leads)) {
    throw new Error("Pacote sem `pecas` ou sem `leads` — não é um pacote de legado.");
  }
  return cru;
}

/** O código vira id estável: `legado-L001`. */
function idDaPeca(codigo: string): string {
  return `legado-${codigo}`;
}

/** A posição vira id estável: a noiva não tem chave natural (ver a regra 3). */
function idDoLead(posicao: number): string {
  return `legado-lead-${String(posicao + 1).padStart(4, "0")}`;
}

async function main(): Promise<void> {
  if (!arquivo) {
    throw new Error(
      "Uso: node dist/importar-legado.mjs <pacote.json> [--loja <id|nome>] [--aplicar]",
    );
  }

  const pacote = lerPacote(arquivo);

  const lojas = await db.select({ id: lojasTable.id, nome: lojasTable.nome }).from(lojasTable);
  const loja = lojaPedida
    ? lojas.find((l) => l.id === lojaPedida || l.nome === lojaPedida)
    : lojas.length === 1
      ? lojas[0]
      : undefined;

  if (!loja) {
    throw new Error(
      lojas.length === 0
        ? "Esta instalação não tem loja — a configuração inicial ainda não rodou."
        : `Escolha a loja com --loja: ${lojas.map((l) => `${l.nome} (${l.id})`).join(", ")}`,
    );
  }

  console.log(`[importar-legado] pacote: ${arquivo}`);
  console.log(`[importar-legado] loja alvo: ${loja.nome} (${loja.id})`);
  if (pacote.origem?.lojaId && pacote.origem.lojaId !== loja.id) {
    console.log(
      `[importar-legado] o pacote saiu da loja ${pacote.origem.lojaId} e entra na ${loja.id} — ` +
        "os ids não são reusados, o que casa é código de peça e nome de atributo.",
    );
  }

  // ── O que já existe ────────────────────────────────────────────────────────
  const codigos = pacote.pecas.map((p) => p.codigo);
  const jaExistem = codigos.length
    ? await db
        .select({ codigo: vestidosTable.codigo })
        .from(vestidosTable)
        .where(and(eq(vestidosTable.lojaId, loja.id), inArray(vestidosTable.codigo, codigos)))
    : [];
  const existentes = new Set(jaExistem.map((v) => v.codigo));

  const idsDeLead = pacote.leads.map((_, i) => idDoLead(i));
  const leadsJaExistem = idsDeLead.length
    ? await db.select({ id: leadsTable.id }).from(leadsTable).where(inArray(leadsTable.id, idsDeLead))
    : [];
  const leadsExistentes = new Set(leadsJaExistem.map((l) => l.id));

  // ── O catálogo desta instalação, por nome ──────────────────────────────────
  const opcoes = await db
    .select({
      opcaoId: atributoOpcoesTable.id,
      atributoId: atributosTable.id,
      opcao: atributoOpcoesTable.valor,
      atributo: atributosTable.nome,
    })
    .from(atributoOpcoesTable)
    .innerJoin(atributosTable, eq(atributosTable.id, atributoOpcoesTable.atributoId))
    .where(eq(atributosTable.lojaId, loja.id));
  /**
   * O par guarda os DOIS ids, e não só o da opção. `vestido_atributos` tem
   * `atributo_id` NOT NULL ao lado de `opcao_id`, e a chave primária é
   * **(vestido, ATRIBUTO)** — é ela que garante uma classificação por atributo
   * em cada peça. Medido antes de estar escrito: com só o `opcao_id` a primeira
   * peça morre em `23502 null value in column "atributo_id"`, e a transação
   * inteira volta.
   */
  const porNome = new Map(
    opcoes.map((o) => [`${o.atributo} ${o.opcao}`, { atributoId: o.atributoId, opcaoId: o.opcaoId }]),
  );

  const pecasNovas = pacote.pecas.filter((p) => !existentes.has(p.codigo));
  const leadsNovos = pacote.leads.filter((_, i) => !leadsExistentes.has(idDoLead(i)));
  const semCasa = pacote.pecas
    .flatMap((p) => p.atributos.map((a) => ({ codigo: p.codigo, ...a })))
    .filter((a) => !porNome.has(`${a.atributo} ${a.opcao}`));

  console.log(
    `[importar-legado] peças: ${pacote.pecas.length} no pacote · ${existentes.size} já na loja · ` +
      `${pecasNovas.length} a inserir`,
  );
  console.log(
    `[importar-legado] noivas: ${pacote.leads.length} no pacote · ${leadsExistentes.size} já na loja · ` +
      `${leadsNovos.length} a inserir`,
  );
  if (semCasa.length > 0) {
    console.log(
      `[importar-legado] ${semCasa.length} classificações sem casa nesta instalação (a peça entra sem elas): ` +
        [...new Set(semCasa.map((a) => `${a.atributo} → ${a.opcao}`))].join(", "),
    );
  }

  if (!aplicar) {
    console.log("[importar-legado] ENSAIO — nada foi escrito. Repita com --aplicar.");
    return;
  }

  // ── A escrita, numa transação só ───────────────────────────────────────────
  await db.transaction(async (tx) => {
    if (pecasNovas.length > 0) {
      await tx
        .insert(vestidosTable)
        .values(
          pecasNovas.map((p) => ({
            id: idDaPeca(p.codigo),
            lojaId: loja.id,
            codigo: p.codigo,
            nome: p.nome,
            // `numeric` neste schema entra e sai como NÚMERO — o pacote pode
            // trazer texto (um JSON editado à mão), e a conversão é aqui.
            precoBase: Number(p.precoBase),
            precoRealuguel: p.precoRealuguel === null ? null : Number(p.precoRealuguel),
            tamanho: p.tamanho,
            cor: p.cor,
            categoria: p.categoria,
            status: p.status,
            exclusiva: p.exclusiva,
            observacoes: p.observacoes,
          })),
        )
        .onConflictDoNothing();

      const classificacoes = pecasNovas.flatMap((p) =>
        p.atributos
          .map((a) => {
            const casa = porNome.get(`${a.atributo} ${a.opcao}`);
            return casa ? { vestidoId: idDaPeca(p.codigo), ...casa } : null;
          })
          .filter((c): c is { vestidoId: string; atributoId: string; opcaoId: string } => c !== null),
      );
      if (classificacoes.length > 0) {
        await tx.insert(vestidoAtributosTable).values(classificacoes).onConflictDoNothing();
      }
    }

    if (leadsNovos.length > 0) {
      await tx
        .insert(leadsTable)
        .values(
          pacote.leads
            .map((l, i) => ({ l, id: idDoLead(i) }))
            .filter(({ id }) => !leadsExistentes.has(id))
            .map(({ l, id }) => ({
              id,
              lojaId: loja.id,
              noivaNome: l.noivaNome,
              etapa: l.etapa as typeof leadsTable.$inferInsert.etapa,
              origem: l.origem as typeof leadsTable.$inferInsert.origem,
              casamentoData: l.casamentoData ? new Date(l.casamentoData) : null,
              casamentoLocal: l.casamentoLocal,
              whatsapp: l.whatsapp,
            })),
        )
        .onConflictDoNothing();
    }
  });

  const pecasDepois = await db
    .select({ codigo: vestidosTable.codigo })
    .from(vestidosTable)
    .where(eq(vestidosTable.lojaId, loja.id));
  const leadsDepois = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.lojaId, loja.id));

  console.log(
    `[importar-legado] aplicado. A loja tem agora ${pecasDepois.length} peças e ${leadsDepois.length} noivas.`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[importar-legado] falhou:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
