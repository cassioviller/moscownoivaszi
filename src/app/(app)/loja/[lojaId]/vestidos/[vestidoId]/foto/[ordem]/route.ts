// Serve os bytes de uma foto do vestido. Escopado à loja ativa da sessão; o
// route confirma o vestido na loja antes de devolver. Cache imutável + a URL leva
// ?v=<versao> (ver FotosVestido), então trocar a foto gera nova URL e busta o cache.
import { getSessaoComLoja } from "@/lib/auth";
import { obterFotoBytes } from "@/lib/vestidos/fotos";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lojaId: string; vestidoId: string; ordem: string }> },
) {
  const sc = await getSessaoComLoja();
  if (!sc) return new Response("Não autorizado", { status: 401 });

  const { lojaId, vestidoId, ordem } = await params;
  if (lojaId !== sc.loja.id) return new Response("Não encontrado", { status: 404 });

  const ord = Number(ordem);
  if (ord !== 0 && ord !== 1) return new Response("Não encontrado", { status: 404 });

  const foto = await obterFotoBytes(sc.loja.id, vestidoId, ord).catch(() => null);
  if (!foto) return new Response("Não encontrado", { status: 404 });

  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "Content-Type": foto.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${vestidoId}-${ord}-${foto.versao}"`,
    },
  });
}
