// src/app/(app)/loja/[lojaId]/vestidos/fotos-vestido.tsx
// Gestão das 2 fotos do vestido (modo edição). Server component: cada slot é um
// <form> com Server Action (sem JS de cliente). A foto é servida por route próprio
// (já otimizada em WebP); ?v=<versao> busta o cache ao trocar.
import type { FotoMeta } from "@/lib/vestidos/fotos";
import { subirFotoAction, removerFotoAction } from "./fotos-actions";

export function FotosVestido({
  lojaId,
  vestidoId,
  fotos,
  erro,
  ok,
}: {
  lojaId: string;
  vestidoId: string;
  fotos: FotoMeta[];
  erro?: string;
  ok?: boolean;
}) {
  const porOrdem = new Map(fotos.map((f) => [f.ordem, f]));
  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-[12px] font-medium tracking-[0.01em] text-grafite">Fotos do vestido</p>
        <p className="text-[12px] text-cinza-fumo">Até 2 — otimizadas para abrir rápido.</p>
      </div>

      {erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {erro}
        </p>
      )}
      {ok && <p className="text-[13px] text-grafite">Foto atualizada.</p>}

      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((ordem) => (
          <Slot key={ordem} lojaId={lojaId} vestidoId={vestidoId} ordem={ordem} foto={porOrdem.get(ordem)} />
        ))}
      </div>
    </div>
  );
}

function Slot({
  lojaId,
  vestidoId,
  ordem,
  foto,
}: {
  lojaId: string;
  vestidoId: string;
  ordem: number;
  foto?: FotoMeta;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[3/4] overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave">
        {foto ? (
          // Foto já otimizada (WebP) servida pelo route escopado; <img> simples de
          // propósito (next/image não cabe num route dinâmico autenticado).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/loja/${lojaId}/vestidos/${vestidoId}/foto/${ordem}?v=${foto.versao}`}
            alt={`Foto ${ordem + 1} do vestido`}
            width={foto.largura}
            height={foto.altura}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-cinza-fumo">
            Sem foto
          </div>
        )}
      </div>

      <form action={subirFotoAction} className="flex flex-col gap-1.5">
        <input type="hidden" name="vestidoId" value={vestidoId} />
        <input type="hidden" name="ordem" value={ordem} />
        <input
          type="file"
          name="foto"
          accept="image/*"
          required
          className="text-[12px] text-grafite file:mr-2 file:rounded-md file:border file:border-borda
            file:bg-papel-elevado file:px-2.5 file:py-1.5 file:text-[12px] file:text-grafite
            hover:file:border-cinza-fumo"
        />
        <button
          type="submit"
          className="w-fit rounded-md border border-borda bg-papel-elevado px-3 py-1.5 text-[12px]
            text-grafite transition-colors duration-150 ease-out hover:border-cinza-fumo hover:text-tinta
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          {foto ? "Trocar foto" : "Adicionar foto"}
        </button>
      </form>

      {foto && (
        <form action={removerFotoAction}>
          <input type="hidden" name="vestidoId" value={vestidoId} />
          <input type="hidden" name="ordem" value={ordem} />
          <button
            type="submit"
            className="rounded-sm text-[12px] text-cinza-fumo underline decoration-borda underline-offset-4
              transition-colors hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-bordo"
          >
            Remover
          </button>
        </form>
      )}
    </div>
  );
}
