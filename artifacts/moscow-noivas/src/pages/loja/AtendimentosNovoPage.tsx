import { useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

export default function AtendimentosNovoPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const preLeadId = searchParams.get("leadId") ?? "";
  const { usuario } = useAuth();
  const [, navigate] = useLocation();

  const [cabines, setCabines] = useState<any[]>([]);
  const [noivas, setNoivas] = useState<any[]>([]);
  const [form, setForm] = useState({ leadId: preLeadId, cabineId: "", vendedoraId: usuario?.id ?? "", inicio: "", observacao: "" });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!lojaId) return;
    api.get(`/loja/${lojaId}/cabines`).then((d) => setCabines(d.cabines));
    api.get(`/loja/${lojaId}/noivas?pagina=1`).then((d) => setNoivas(d.leads));
  }, [lojaId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErro("");
    try {
      await api.post(`/loja/${lojaId}/atendimentos`, form);
      navigate(`/loja/${lojaId}/calendario`);
    } catch (err: any) { setErro(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Agendar atendimento</h1>
        <p className="text-[13px] text-cinza-fumo">Marque um horário para a noiva.</p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {erro && <p className="text-[13px] text-bordo">{erro}</p>}

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-tinta">Noiva *</label>
          <select value={form.leadId} onChange={set("leadId")} required
            className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta">
            <option value="">Selecione a noiva</option>
            {noivas.map((n: any) => <option key={n.id} value={n.id}>{n.noivaNome}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-tinta">Cabine *</label>
          <select value={form.cabineId} onChange={set("cabineId")} required
            className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta">
            <option value="">Selecione a cabine</option>
            {cabines.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-tinta">Data e hora *</label>
          <input type="datetime-local" value={form.inicio} onChange={set("inicio")} required
            className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-tinta">Observação</label>
          <textarea value={form.observacao} onChange={set("observacao")} rows={3}
            className="rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta resize-none" />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="rounded-md bg-bordo px-5 py-2.5 text-[14px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {loading ? "Agendando…" : "Agendar"}
          </button>
          <button type="button" onClick={() => navigate(`/loja/${lojaId}/calendario`)}
            className="rounded-md border border-borda px-5 py-2.5 text-[14px] text-grafite hover:border-cinza-fumo">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
