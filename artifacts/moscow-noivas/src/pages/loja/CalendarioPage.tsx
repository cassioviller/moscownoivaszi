import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

export default function CalendarioPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) {
      setLoading(true);
      api.get(`/loja/${lojaId}/calendario?mes=${mes}&ano=${ano}`).then((d) => {
        setAtendimentos(d.atendimentos); setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [lojaId, mes, ano]);

  function navMes(delta: number) {
    let m = mes + delta, a = ano;
    if (m > 12) { m = 1; a++; }
    if (m < 1) { m = 12; a--; }
    setMes(m); setAno(a);
  }

  const nomeMes = new Date(ano, mes - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[24px] font-light tracking-tight text-tinta capitalize">Calendário · {nomeMes}</h1>
        <div className="flex gap-2">
          <button onClick={() => navMes(-1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md hover:border-cinza-fumo">←</button>
          <button onClick={() => navMes(1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md hover:border-cinza-fumo">→</button>
        </div>
      </header>

      <div className="flex justify-end">
        <Link href={`/loja/${lojaId}/atendimentos/novo`}
          className="inline-flex items-center rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90">
          + Agendar
        </Link>
      </div>

      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : atendimentos.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhum atendimento neste mês.</p>
        : (
          <ul className="flex flex-col gap-3">
            {atendimentos.map((a) => (
              <li key={a.id} className="flex items-start gap-4 rounded-md border border-borda bg-papel-elevado px-4 py-3">
                <div className="flex flex-col items-center min-w-[48px] text-center">
                  <span className="text-[20px] font-light text-tinta">{new Date(a.inicio).getDate()}</span>
                  <span className="text-[11px] uppercase tracking-wide text-cinza-fumo">
                    {new Date(a.inicio).toLocaleString("pt-BR", { weekday: "short" })}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{a.noivaNome}</span>
                  <span className="text-[13px] text-grafite">
                    {new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.cabineNome}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">{a.vendedoraNome} · {a.situacao}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
