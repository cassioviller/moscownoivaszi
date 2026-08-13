import { db, regraDisponibilidadeTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  descricaoDoExpedienteDeRetirada,
  expedienteDeRetirada,
  foraDoExpedienteDeRetirada,
  fraseDaRecusaDeRetirada,
} from "@workspace/agenda-core";

/**
 * **A guarda da cláusula 4ª, num lugar só** — E222.
 *
 * Duas portas gravam `dataRetirada` e `dataDevolucao` (o `POST /contratos` que
 * fecha e o `PATCH /contratos/:id` que corrige), e as duas passam por aqui. A
 * conta é a mesma do módulo puro (`@workspace/agenda-core`); o que este arquivo
 * acrescenta é a leitura da regra da loja e o **formato do recado**.
 *
 * O recado cita o expediente por extenso, e não um código: quem lê é a vendedora
 * com a noiva na frente, e *"FORA_DO_EXPEDIENTE"* não diz a que horas voltar.
 */

export type RecusaDeExpediente = {
  error: "RETIRADA_FORA_DO_EXPEDIENTE" | "DEVOLUCAO_FORA_DO_EXPEDIENTE";
  detalhe: string;
  campos: { campo: string; motivo: string }[];
};

/**
 * A recusa da 4ª para este par de datas, ou `null` quando as duas cabem.
 *
 * **Nada é obrigatório aqui**, e é decisão medida: 723 contratos no banco, **1**
 * com data de retirada e **nenhum** com data de devolução (E222). Uma régua que
 * exigisse as datas recusaria o fecho de contrato que sempre funcionou — a
 * cláusula diz a que horas a loja abre, não que toda locação tenha de declarar a
 * hora.
 */
export async function recusaDeExpedienteDeRetirada(
  lojaId: string,
  datas: { dataRetirada?: Date | string | null; dataDevolucao?: Date | string | null },
): Promise<RecusaDeExpediente | null> {
  if (
    (datas.dataRetirada === null || datas.dataRetirada === undefined) &&
    (datas.dataDevolucao === null || datas.dataDevolucao === undefined)
  ) {
    return null;
  }

  const [regra] = await db
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  const exp = expedienteDeRetirada(regra);
  const expediente = descricaoDoExpedienteDeRetirada(exp);

  const retirada = foraDoExpedienteDeRetirada(datas.dataRetirada, exp);
  if (retirada) {
    return {
      error: "RETIRADA_FORA_DO_EXPEDIENTE",
      // E224: a frase saiu daqui para o módulo puro, que a TELA também importa.
      detalhe: fraseDaRecusaDeRetirada(retirada, exp),
      campos: [{ campo: "dataRetirada", motivo: `Expediente de retirada: ${expediente}` }],
    };
  }
  const devolucao = foraDoExpedienteDeRetirada(datas.dataDevolucao, exp);
  if (devolucao) {
    return {
      error: "DEVOLUCAO_FORA_DO_EXPEDIENTE",
      detalhe: fraseDaRecusaDeRetirada(devolucao, exp),
      campos: [{ campo: "dataDevolucao", motivo: `Expediente de retirada: ${expediente}` }],
    };
  }
  return null;
}
