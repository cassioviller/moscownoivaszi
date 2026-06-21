import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

export default function FinanceiroComissoesPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/financeiro/comissoes`).then((d) => { setComissoes(d.comissoes); setLoading(false); }).catch(() => setLoading(false));
  }, [lojaId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <Link href={`/loja/${lojaId}/financeiro`} className="text-[13px] text-grafite hover:text-tinta">← Financeiro</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta mt-1">Comissões</h1>
      </header>
      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : comissoes.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhuma comissão fechada.</p>
        : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {comissoes.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-tinta">{c.vendedoraNome}</span>
                  <span className="text-cinza-fumo">Competência: {c.competencia}</span>
                </div>
                <div className="text-right">
                  <p className="text-tinta tabular-nums">{brl(c.valorTotal)}</p>
                  <p className="text-cinza-fumo text-[12px]">{c.percentualAplicado ? `${c.percentualAplicado}%` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
