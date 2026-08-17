/**
 * **E273 — o motor da importação do caderno, num lugar só.**
 *
 * Ele nasceu dentro do script de console (E272) e saiu de lá quando a
 * importação ganhou BOTÃO: script e rota fazem exatamente o mesmo trabalho, e
 * duas cópias divergiriam no primeiro conserto — é a regra 26, e este
 * repositório já pagou por ela.
 *
 * As quatro regras do E272 continuam sendo as regras, e agora elas valem para
 * os dois gestos:
 *
 * 1. **Ensaio e aplicação são a MESMA conta.** `planejar` devolve o que
 *    entraria; `aplicar` recebe esse plano e escreve. Quem aperta "Importar"
 *    aplica o que leu na tela, não outra coisa.
 * 2. **Só INSERE.** Não há UPDATE e não há DELETE aqui dentro. Peça cujo código
 *    já existe na loja é PULADA — a loja pode ter corrigido o nome ou o preço na
 *    tela, e o pacote é mais velho que a correção.
 * 3. **Id derivado**, para a segunda passada não duplicar: a peça vira
 *    `legado-<codigo>` e a noiva vira `legado-lead-<posição>`.
 * 4. **O catálogo casa por NOME.** `Tipo de peça → Noiva` é resolvido contra os
 *    atributos que o seed criou NESTA instalação; casar por id seria casar com
 *    o id de outro banco. Classificação sem casa é relatada e pulada.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  vestidosTable,
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
  leadsTable,
} from "@workspace/db";

export type PecaDoPacote = {
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

export type LeadDoPacote = {
  noivaNome: string;
  etapa: string;
  origem: string;
  casamentoData: string | null;
  casamentoLocal: string | null;
  whatsapp: string | null;
};

export type PacoteDoLegado = {
  versao: number;
  origem?: { loja?: string; lojaId?: string };
  pecas: PecaDoPacote[];
  leads: LeadDoPacote[];
};

export type PlanoDaImportacao = {
  arquivo: string;
  pecasNoPacote: number;
  pecasJaNaLoja: number;
  pecasAInserir: number;
  leadsNoPacote: number;
  leadsJaNaLoja: number;
  leadsAInserir: number;
  /** Classificações que o catálogo desta instalação não conhece — a peça entra sem elas. */
  semCasa: string[];
};

/**
 * A pasta dos pacotes. No contêiner ela é `/app/legado` (a imagem os copia);
 * fora dele, `docs/legado` a partir da raiz do repositório.
 */
export function pastaDosPacotes(): string {
  return process.env.LEGADO_DIR ?? path.resolve(process.cwd(), "../../docs/legado");
}

export type PacoteListado = { arquivo: string; bytes: number };

/** Os pacotes que ESTA instalação tem no disco, para a tela oferecer o que existe. */
export function pacotesDisponiveis(): PacoteListado[] {
  const pasta = pastaDosPacotes();
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ arquivo: f, bytes: statSync(path.join(pasta, f)).size }));
}

/**
 * Lê um pacote pelo NOME do arquivo, nunca por caminho.
 *
 * O nome é validado contra a lista do disco em vez de ser concatenado: a rota
 * recebe esse nome de fora, e `../../etc/algo` seria leitura arbitrária de
 * arquivo com sessão de superadmin. É a mesma defesa que o download de backup
 * faz com o dump (`lib/backup.ts:179`).
 */
export function lerPacote(arquivo: string): PacoteDoLegado {
  const disponiveis = pacotesDisponiveis().map((p) => p.arquivo);
  if (!disponiveis.includes(arquivo)) {
    throw new Error(
      `Pacote “${arquivo}” não existe nesta instalação. Há ${disponiveis.length}: ${disponiveis.join(", ") || "nenhum"}`,
    );
  }
  const cru = JSON.parse(readFileSync(path.join(pastaDosPacotes(), arquivo), "utf8")) as PacoteDoLegado;
  if (cru.versao !== 1) throw new Error(`Pacote de versão ${cru.versao}; este motor lê a 1.`);
  if (!Array.isArray(cru.pecas) || !Array.isArray(cru.leads)) {
    throw new Error("Pacote sem `pecas` ou sem `leads` — não é um pacote de legado.");
  }
  return cru;
}

/** O código vira id estável: `legado-L001`. */
export function idDaPeca(codigo: string): string {
  return `legado-${codigo}`;
}

/** A posição vira id estável: a noiva não tem chave natural (ver a regra 3). */
export function idDoLead(posicao: number): string {
  return `legado-lead-${String(posicao + 1).padStart(4, "0")}`;
}

type CatalogoPorNome = Map<string, { atributoId: string; opcaoId: string }>;

/**
 * O catálogo da loja, indexado por "atributo opção".
 *
 * O par guarda os DOIS ids: `vestido_atributos` tem `atributo_id` NOT NULL ao
 * lado de `opcao_id`, e a chave primária é (vestido, ATRIBUTO). Medido antes de
 * estar escrito: com só o id da opção a primeira peça morre em 23502.
 */
async function catalogoDaLoja(lojaId: string): Promise<CatalogoPorNome> {
  const opcoes = await db
    .select({
      opcaoId: atributoOpcoesTable.id,
      atributoId: atributosTable.id,
      opcao: atributoOpcoesTable.valor,
      atributo: atributosTable.nome,
    })
    .from(atributoOpcoesTable)
    .innerJoin(atributosTable, eq(atributosTable.id, atributoOpcoesTable.atributoId))
    .where(eq(atributosTable.lojaId, lojaId));
  return new Map(
    opcoes.map((o) => [`${o.atributo} ${o.opcao}`, { atributoId: o.atributoId, opcaoId: o.opcaoId }]),
  );
}

/** O ensaio: o que entraria, sem escrever nada. */
export async function planejarImportacao(
  lojaId: string,
  arquivo: string,
  pacote: PacoteDoLegado,
): Promise<PlanoDaImportacao> {
  const codigos = pacote.pecas.map((p) => p.codigo);
  const jaExistem = codigos.length
    ? await db
        .select({ codigo: vestidosTable.codigo })
        .from(vestidosTable)
        .where(and(eq(vestidosTable.lojaId, lojaId), inArray(vestidosTable.codigo, codigos)))
    : [];
  const existentes = new Set(jaExistem.map((v) => v.codigo));

  const idsDeLead = pacote.leads.map((_, i) => idDoLead(i));
  const leadsJaExistem = idsDeLead.length
    ? await db.select({ id: leadsTable.id }).from(leadsTable).where(inArray(leadsTable.id, idsDeLead))
    : [];
  const leadsExistentes = new Set(leadsJaExistem.map((l) => l.id));

  const catalogo = await catalogoDaLoja(lojaId);
  const semCasa = [
    ...new Set(
      pacote.pecas
        .flatMap((p) => p.atributos)
        .filter((a) => !catalogo.has(`${a.atributo} ${a.opcao}`))
        .map((a) => `${a.atributo} → ${a.opcao}`),
    ),
  ];

  return {
    arquivo,
    pecasNoPacote: pacote.pecas.length,
    pecasJaNaLoja: existentes.size,
    pecasAInserir: pacote.pecas.length - existentes.size,
    leadsNoPacote: pacote.leads.length,
    leadsJaNaLoja: leadsExistentes.size,
    leadsAInserir: pacote.leads.length - leadsExistentes.size,
    semCasa,
  };
}

/**
 * A escrita, numa transação só: ou entra tudo, ou não entra nada.
 *
 * Ela recalcula o que já existe em vez de confiar no plano que veio de fora —
 * entre o ensaio e o clique pode ter entrado peça pela tela, e o `onConflict`
 * sozinho deixaria a classificação órfã apontando para uma peça de outro dono.
 */
export async function aplicarImportacao(
  lojaId: string,
  arquivo: string,
  pacote: PacoteDoLegado,
): Promise<PlanoDaImportacao> {
  const plano = await planejarImportacao(lojaId, arquivo, pacote);
  const catalogo = await catalogoDaLoja(lojaId);

  const codigos = pacote.pecas.map((p) => p.codigo);
  const jaExistem = codigos.length
    ? await db
        .select({ codigo: vestidosTable.codigo })
        .from(vestidosTable)
        .where(and(eq(vestidosTable.lojaId, lojaId), inArray(vestidosTable.codigo, codigos)))
    : [];
  const existentes = new Set(jaExistem.map((v) => v.codigo));
  const pecasNovas = pacote.pecas.filter((p) => !existentes.has(p.codigo));

  const idsDeLead = pacote.leads.map((_, i) => idDoLead(i));
  const leadsJaExistem = idsDeLead.length
    ? await db.select({ id: leadsTable.id }).from(leadsTable).where(inArray(leadsTable.id, idsDeLead))
    : [];
  const leadsExistentes = new Set(leadsJaExistem.map((l) => l.id));

  await db.transaction(async (tx) => {
    if (pecasNovas.length > 0) {
      await tx
        .insert(vestidosTable)
        .values(
          pecasNovas.map((p) => ({
            id: idDaPeca(p.codigo),
            lojaId,
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
            const casa = catalogo.get(`${a.atributo} ${a.opcao}`);
            return casa ? { vestidoId: idDaPeca(p.codigo), ...casa } : null;
          })
          .filter((c): c is { vestidoId: string; atributoId: string; opcaoId: string } => c !== null),
      );
      if (classificacoes.length > 0) {
        await tx.insert(vestidoAtributosTable).values(classificacoes).onConflictDoNothing();
      }
    }

    const leadsNovos = pacote.leads
      .map((l, i) => ({ l, id: idDoLead(i) }))
      .filter(({ id }) => !leadsExistentes.has(id));
    if (leadsNovos.length > 0) {
      await tx
        .insert(leadsTable)
        .values(
          leadsNovos.map(({ l, id }) => ({
            id,
            lojaId,
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

  return plano;
}
