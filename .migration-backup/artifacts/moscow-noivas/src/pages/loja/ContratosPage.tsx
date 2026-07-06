import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

export default function ContratosPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [contratos, setContratos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) {
      setLoading(true);
      api.get(`/loja/${lojaId}/contratos?pagina=${pagina}`).then((d) => {
        setContratos(d.contratos); setTotal(d.total); setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [lojaId, pagina]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Contratos</h1>
        <p className="text-[13px] text-cinza-fumo">{total} {total === 1 ? "contrato" : "contratos"}</p>
      </header>

      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : contratos.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhum contrato encontrado.</p>
        : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {contratos.map((c) => (
              <li key={c.id}>
                <Link href={`/loja/${lojaId}/contratos/${c.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-champagne/10">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] text-tinta">{c.noivaNome}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {new Date(c.fechadoEm).toLocaleDateString("pt-BR")} · {c.vendedoraNome}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[14px] text-tinta tabular-nums">{brl(c.valorTotal)}</span>
                    <p className="text-[12px] text-cinza-fumo">{c.status}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

      {total > 20 && (
        <div className="flex gap-2 justify-center">
          {pagina > 1 && <button onClick={() => setPagina(p => p - 1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md">← Anterior</button>}
          <span className="px-3 py-1.5 text-[13px] text-grafite">Página {pagina}</span>
          {pagina * 20 < total && <button onClick={() => setPagina(p => p + 1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md">Próxima →</button>}
        </div>
      )}
    </div>
  );
}
