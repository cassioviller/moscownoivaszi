// src/components/dashboard/aviso-vencidas.tsx
// Atenção imediata de financeiro: contas vencidas (a receber/a pagar). Só renderiza com
// dado (o chamador já checou financeiro:ver). Bordô como joia — atraso pede atenção.
import Link from "next/link";
import type { Vencidas } from "@/lib/financeiro/vencidas";
import { brl } from "@/lib/dinheiro";

export function AvisoVencidas({ lojaId, vencidas }: { lojaId: string; vencidas: Vencidas }) {
  if (vencidas.receberQtd === 0 && vencidas.pagarQtd === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-bordo/30 bg-papel-elevado p-4">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-bordo">Contas vencidas</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-tinta">
        {vencidas.receberQtd > 0 && (
          <Link href={`/loja/${lojaId}/financeiro/receber`} className="hover:text-bordo">
            {vencidas.receberQtd} a receber · {brl(vencidas.receberTotal)}
          </Link>
        )}
        {vencidas.pagarQtd > 0 && (
          <Link href={`/loja/${lojaId}/financeiro/pagar`} className="hover:text-bordo">
            {vencidas.pagarQtd} a pagar · {brl(vencidas.pagarTotal)}
          </Link>
        )}
      </div>
    </div>
  );
}
