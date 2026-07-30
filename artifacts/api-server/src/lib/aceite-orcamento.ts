import { db, orcamentosTable, orcamentoVersoesTable, auditLogTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/**
 * E74 — a rotina do aceite, num lugar só: grava instante, versão enviada e
 * hash (E75), avança para APROVADO e deixa a linha na auditoria com a noiva
 * como autora (sem sessão: o token é a capability). Nasceu na rota
 * /orcamentos/publico/aceite e virou função quando o portal (E78) passou a
 * aceitar TAMBÉM — dois caminhos, uma transação, um invariante.
 *
 * Pré-condições (quem chama decide o status HTTP):
 * - `aceitoEm` já preenchido → devolva o existente (idempotência).
 * - status !== "ENVIADO" → 422.
 */
export async function aceitarOrcamentoEnviado(
  orcamento: { id: string; lojaId: string },
  noivaNome: string,
): Promise<Date> {
  const [versao] = await db
    .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  const agora = new Date();
  const aceito = await db.transaction(async (tx) => {
    // UPDATE condicional: duas abas aceitando ao mesmo tempo gravam UM aceite.
    const [atualizado] = await tx
      .update(orcamentosTable)
      .set({
        aceitoEm: agora,
        aceiteVersao: versao?.numero ?? null,
        aceiteHash: versao?.hash ?? null,
        status: "APROVADO",
        aprovadoEm: agora,
        updatedAt: agora,
      })
      .where(and(eq(orcamentosTable.id, orcamento.id), isNull(orcamentosTable.aceitoEm)))
      .returning();
    if (!atualizado) return null;

    // Direto na tabela, não pelo helper: o aceite não tem sessão — o autor é
    // a noiva, com usuarioId nulo e o nome desnormalizado, como o schema (E10)
    // sempre permitiu.
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: orcamento.lojaId,
      usuarioId: null,
      usuarioNome: `${noivaNome} (link público)`,
      acao: "ORCAMENTO_ACEITO",
      entidade: "orcamento",
      entidadeId: orcamento.id,
      detalhe: { versao: versao?.numero ?? null, hash: versao?.hash ?? null },
    });
    return atualizado;
  });

  // Quem PERDEU a corrida devolvia `agora` — o instante desta requisição —, e a
  // resposta afirmava uma hora de aceite que não existe no banco. O aceite é o
  // carimbo que a noiva vê ("aceito em ..."), e nas duas abas ele saía
  // diferente para o MESMO fato. Perdida a corrida, o que vale é o que ficou
  // gravado: relê-se a linha.
  if (aceito?.aceitoEm) return aceito.aceitoEm;
  const [jaAceito] = await db
    .select({ aceitoEm: orcamentosTable.aceitoEm })
    .from(orcamentosTable)
    .where(eq(orcamentosTable.id, orcamento.id));
  return jaAceito?.aceitoEm ?? agora;
}
