import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

export default function FinanceiroPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/financeiro`).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [lojaId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Fluxo de caixa</h1>
        <p className="text-[13px] text-cinza-fumo">Visão geral financeira da loja.</p>
      </header>

      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p> : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border border-borda bg-papel-elevado p-4">
            <p className="text-[12px] uppercase tracking-wide text-cinza-fumo mb-2">A receber (previsto)</p>
            <p className="text-[24px] font-light text-tinta tabular-nums">{brl(data?.receber?.previsto)}</p>
          </div>
          <div className="rounded-md border border-borda bg-papel-elevado p-4">
            <p className="text-[12px] uppercase tracking-wide text-cinza-fumo mb-2">A pagar (previsto)</p>
            <p className="text-[24px] font-light text-tinta tabular-nums">{brl(data?.pagar?.previsto)}</p>
          </div>
        </div>
      )}

      <nav className="flex flex-col gap-2">
        {[
          ["Contas a receber", `/loja/${lojaId}/financeiro/receber`],
          ["Contas a pagar", `/loja/${lojaId}/financeiro/pagar`],
          ["Comissões", `/loja/${lojaId}/financeiro/comissoes`],
        ].map(([label, href]) => (
          <Link key={href} href={href}
            className="flex items-center justify-between rounded-md border border-borda bg-papel-elevado px-4 py-3 text-[14px] text-tinta hover:border-cinza-fumo transition-colors">
            {label} <span className="text-cinza-fumo">→</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
