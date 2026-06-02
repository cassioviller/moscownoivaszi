// src/app/(app)/loja/[lojaId]/contratos/gerar/route.ts
// Recebe o POST do formulário de contrato e devolve um PDF como download
// (Content-Disposition: attachment). Stateless — não persiste nada (ainda).
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { gerarContratoPdf } from "@/lib/contratos/pdf";

export const runtime = "nodejs";

// "Ana Lima" → "ana-lima" (nome de arquivo ASCII seguro p/ o header).
function slug(s: string): string {
  return (
    s
      .normalize("NFD") // "á" → "a" + acento; o acento cai no filtro [^a-z0-9] abaixo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "noiva"
  );
}

export async function POST(request: Request) {
  const sc = await getSessaoComLoja();
  if (!sc) return new Response("Não autenticado.", { status: 401 });
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) {
    return new Response("Sem permissão.", { status: 403 });
  }

  const form = await request.formData();
  const v = (k: string) => {
    const x = form.get(k);
    return typeof x === "string" ? x : "";
  };

  const pdf = gerarContratoPdf({
    lojaNome: sc.loja.nome,
    noivaNome: v("noivaNome"),
    cpf: v("cpf"),
    whatsapp: v("whatsapp"),
    vestido: v("vestido"),
    valorTotal: v("valorTotal"),
    entrada: v("entrada"),
    formaPagamento: v("formaPagamento"),
    dataCasamento: v("dataCasamento"),
    dataRetirada: v("dataRetirada"),
    dataDevolucao: v("dataDevolucao"),
    dataContrato: v("dataContrato"),
    observacao: v("observacao"),
  });

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contrato-${slug(v("noivaNome"))}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
