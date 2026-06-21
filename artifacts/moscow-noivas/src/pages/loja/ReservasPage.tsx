import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

export default function ReservasPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [reservas, setReservas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/reservas`).then((d) => { setReservas(d.reservas); setLoading(false); }).catch(() => setLoading(false));
  }, [lojaId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Reservas</h1>
        <p className="text-[13px] text-cinza-fumo">{reservas.length} reserva(s)</p>
      </header>

      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : reservas.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhuma reserva cadastrada.</p>
        : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {reservas.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{r.noivaNome}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    Casamento: {new Date(r.casamentoData).toLocaleDateString("pt-BR")} · {r.vestidos} vestido(s)
                  </span>
                </div>
                <span className="text-[12px] text-grafite">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
