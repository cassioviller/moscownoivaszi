import { useParams } from "react-router";
import {
  useGetLookbookPublico,
  getGetLookbookPublicoQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/formatos";

/**
 * Página PÚBLICA do lookbook (/lookbook/:token) — a noiva revê em casa os
 * vestidos que provou, sem login; irmã da /orcamento/:token (E13). O token
 * fica no path do FRONT (SPA); para a API vai em query, fora do log. As fotos
 * saem da rota pública irmã, escopada ao MESMO token.
 */

const ERROS: Record<string, string> = {
  LINK_EXPIRADO: "Este lookbook expirou. Peça um novo para a sua vendedora.",
  LINK_INVALIDO: "Link inválido — confira se ele veio inteiro do WhatsApp.",
};

const fotoUrl = (token: string, vestidoId: string, ordem: number, atualizadaEm: string) =>
  `/api/lookbooks/publico/foto?token=${encodeURIComponent(token)}&vestidoId=${vestidoId}&ordem=${ordem}&v=${new Date(atualizadaEm).getTime()}`;

export default function LookbookPublico() {
  const { token } = useParams();

  const params = { token: token! };
  const lookbook = useGetLookbookPublico(params, {
    query: {
      queryKey: getGetLookbookPublicoQueryKey(params),
      enabled: !!token,
      retry: false, // 404/410 são veredito, não falha transitória
    },
  });

  const erro = lookbook.error as { data?: { error?: string } } | null;
  const dados = lookbook.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-4 py-10">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif text-primary">{dados?.lojaNome ?? "Moscow Noivas"}</h1>
          <p className="text-muted-foreground">
            {dados ? `Lookbook de ${dados.noivaNome}` : "Lookbook"}
          </p>
        </div>

        {lookbook.isPending ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
            ))}
          </div>
        ) : lookbook.isError ? (
          <p className="text-sm text-center">{ERROS[erro?.data?.error ?? ""] ?? ERROS.LINK_INVALIDO}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {dados!.vestidos.map((v) => (
                <figure key={v.vestidoId} className="overflow-hidden rounded-lg border bg-card">
                  {v.fotos.length > 0 ? (
                    <div className={`grid ${v.fotos.length > 1 ? "grid-cols-2" : ""} gap-px`}>
                      {v.fotos.map((f) => (
                        <img
                          key={f.ordem}
                          src={fotoUrl(token!, v.vestidoId, f.ordem, String(f.atualizadaEm))}
                          alt={v.nome}
                          loading="lazy"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center text-sm text-muted-foreground">
                      Sem foto
                    </div>
                  )}
                  <figcaption className="space-y-1 p-3 text-center">
                    <p className="font-serif text-lg">{v.nome}</p>
                    <p className="text-sm font-medium text-primary">R$ {brl(v.precoBase)}</p>
                    {v.atributos.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {v.atributos.map((a) => `${a.atributo}: ${a.valor}`).join(" · ")}
                      </p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Gostou de algum? É só responder à sua vendedora no WhatsApp.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
