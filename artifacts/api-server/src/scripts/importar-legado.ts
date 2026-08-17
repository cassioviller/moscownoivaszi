/**
 * **E272/E273 — o caderno de papel pela linha de comando.**
 *
 *   node dist/importar-legado.mjs 2026-08-17-caderno.json            # ENSAIO
 *   node dist/importar-legado.mjs 2026-08-17-caderno.json --aplicar
 *
 * O trabalho todo mora em `lib/importar-legado.ts`, que a TELA também usa
 * (E273): duas cópias do mesmo motor divergiriam no primeiro conserto. Aqui
 * ficam só o gesto de console e o que ele imprime.
 *
 * O argumento é o NOME do pacote dentro de `LEGADO_DIR` (na imagem,
 * `/app/legado`), não um caminho — quem escolhe onde a pasta fica é a
 * instalação, e o motor recusa nome que não esteja nela.
 */
import { eq } from "drizzle-orm";
import { db, pool, lojasTable, vestidosTable, leadsTable } from "@workspace/db";
import {
  aplicarImportacao,
  lerPacote,
  pacotesDisponiveis,
  planejarImportacao,
} from "../lib/importar-legado";

const arquivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
const lojaPedida = (() => {
  const i = process.argv.indexOf("--loja");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

async function main(): Promise<void> {
  if (!arquivo) {
    const lista = pacotesDisponiveis()
      .map((p) => `${p.arquivo} (${Math.round(p.bytes / 1024)} KB)`)
      .join(", ");
    throw new Error(
      "Uso: node dist/importar-legado.mjs <pacote.json> [--loja <id|nome>] [--aplicar]\n" +
        `Pacotes nesta instalação: ${lista || "nenhum"}`,
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

  const plano = aplicar
    ? await aplicarImportacao(loja.id, arquivo, pacote)
    : await planejarImportacao(loja.id, arquivo, pacote);

  console.log(
    `[importar-legado] peças: ${plano.pecasNoPacote} no pacote · ${plano.pecasJaNaLoja} já na loja · ` +
      `${plano.pecasAInserir} a inserir`,
  );
  console.log(
    `[importar-legado] noivas: ${plano.leadsNoPacote} no pacote · ${plano.leadsJaNaLoja} já na loja · ` +
      `${plano.leadsAInserir} a inserir`,
  );
  if (plano.semCasa.length > 0) {
    console.log(
      `[importar-legado] ${plano.semCasa.length} classificações sem casa nesta instalação ` +
        `(a peça entra sem elas): ${plano.semCasa.join(", ")}`,
    );
  }

  if (!aplicar) {
    console.log("[importar-legado] ENSAIO — nada foi escrito. Repita com --aplicar.");
    return;
  }

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
