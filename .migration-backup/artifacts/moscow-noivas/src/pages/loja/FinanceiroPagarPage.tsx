import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

export default function FinanceiroPagarPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [contas, setContas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/financeiro/pagar`).then((d) => { setContas(d.contas); setLoading(false); }).catch(() => setLoading(false));
  }, [lojaId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <Link href={`/loja/${lojaId}/financeiro`} className="text-[13px] text-grafite hover:text-tinta">← Financeiro</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta mt-1">Contas a pagar</h1>
      </header>
      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : contas.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhuma conta.</p>
        : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {contas.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-tinta">{c.descricao}</span>
                  <span className="text-cinza-fumo">{c.tipo} · vence {new Date(c.vencimento).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="text-right">
                  <p className="text-tinta tabular-nums">{brl(c.valorPrevisto)}</p>
                  <p className={`text-[12px] ${c.status === "PAGA" ? "text-bordo" : "text-cinza-fumo"}`}>{c.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
