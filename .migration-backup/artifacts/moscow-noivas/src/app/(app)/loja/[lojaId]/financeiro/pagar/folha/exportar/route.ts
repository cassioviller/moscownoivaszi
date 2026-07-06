// src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/exportar/route.ts
// GET …/financeiro/pagar/folha/exportar?ini&fim → baixa os pagamentos do período em
// XLSX e marca como enviados à contabilidade. Gate em financeiro:ver.
import { exigirAcesso } from "@/lib/server/acoes";
import { resolverIntervalo } from "@/lib/financeiro/intervalo";
import { itensPagosNoIntervalo, marcarEnviadosNoIntervalo } from "@/lib/financeiro/contabilidade";
import { montarPlanilhaContabilidade } from "@/lib/financeiro/planilha-contabilidade";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await exigirAcesso("financeiro");
  await params; // escopo já vem de sc.loja.id
  const url = new URL(req.url);
  const intervalo = resolverIntervalo(url.searchParams.get("ini") ?? undefined, url.searchParams.get("fim") ?? undefined);
  const itens = await itensPagosNoIntervalo(sc.loja.id, { gte: intervalo.gte, lt: intervalo.lt });
  const buffer = await montarPlanilhaContabilidade(itens);
  await marcarEnviadosNoIntervalo(sc.loja.id, { gte: intervalo.gte, lt: intervalo.lt });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contabilidade-${intervalo.iniYMD}-a-${intervalo.fimYMD}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
