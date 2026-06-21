import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

interface Stats {
  noivas: number;
  atendimentos: number;
  contratos: number;
  vestidos: number;
}

export default function DashboardPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/dashboard`).then(setStats).catch(() => {});
  }, [lojaId]);

  const cards = [
    { label: "Noivas ativas", value: stats?.noivas ?? "—", href: `/loja/${lojaId}/noivas` },
    { label: "Atendimentos agendados", value: stats?.atendimentos ?? "—", href: `/loja/${lojaId}/calendario` },
    { label: "Contratos ativos", value: stats?.contratos ?? "—", href: `/loja/${lojaId}/contratos` },
    { label: "Vestidos no acervo", value: stats?.vestidos ?? "—", href: `/loja/${lojaId}/vestidos` },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Início</h1>
        <p className="text-[13px] text-cinza-fumo">Visão geral da loja.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="flex flex-col gap-1 rounded-md border border-borda bg-papel-elevado px-4 py-4 transition-colors hover:border-cinza-fumo"
          >
            <span className="text-[28px] font-light text-tinta tabular-nums">{card.value}</span>
            <span className="text-[12px] text-cinza-fumo leading-tight">{card.label}</span>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-tinta">Ações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/loja/${lojaId}/noivas`} className="inline-flex items-center rounded-md border border-borda bg-papel-elevado px-4 py-2 text-[14px] text-tinta transition-colors hover:border-cinza-fumo">
            Nova noiva
          </Link>
          <Link href={`/loja/${lojaId}/atendimentos/novo`} className="inline-flex items-center rounded-md border border-borda bg-papel-elevado px-4 py-2 text-[14px] text-tinta transition-colors hover:border-cinza-fumo">
            Agendar atendimento
          </Link>
          <Link href={`/loja/${lojaId}/vestidos`} className="inline-flex items-center rounded-md border border-borda bg-papel-elevado px-4 py-2 text-[14px] text-tinta transition-colors hover:border-cinza-fumo">
            Acervo de vestidos
          </Link>
        </div>
      </section>
    </div>
  );
}
