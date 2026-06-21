// src/app/(app)/loja/[lojaId]/contratos/[contratoId]/pdf/route.ts
// Baixa o PDF do contrato PERSISTIDO (GET por id) — substitui o POST stateless antigo.
// Auth + tenant: dadosParaPdf é escopado por loja (id de outra loja → null → 404).
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { gerarContratoPdf } from "@/lib/contratos/pdf";
import { dadosParaPdf } from "@/lib/contratos/contratos";

export const runtime = "nodejs";

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "noiva"
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ contratoId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) return new Response("Não autenticado.", { status: 401 });
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) {
    return new Response("Sem permissão.", { status: 403 });
  }
  const { contratoId } = await params;
  const dados = await dadosParaPdf(sc.loja.id, contratoId);
  if (!dados) return new Response("Contrato não encontrado.", { status: 404 });

  const pdf = gerarContratoPdf(dados);
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contrato-${slug(dados.noivaNome)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
