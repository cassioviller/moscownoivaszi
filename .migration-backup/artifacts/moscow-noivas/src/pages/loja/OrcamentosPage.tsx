import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { api } from "@/lib/api";

interface Orcamento {
  id: string;
  noivaNome: string;
  vendedoraNome: string;
  status: string;
  subtotal: string;
}
interface LeadOpcao { id: string; noivaNome: string }

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", ENVIADO: "Enviado", APROVADO: "Aprovado", RECUSADO: "Recusado",
};
const brl = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrcamentosPage() {
  const { lojaId } = useParams<{ lojaId: string }>();
  const [, navigate] = useLocation();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [noivas, setNoivas] = useState<LeadOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setLoading(true);
    api.get(`/loja/${lojaId}/orcamentos`).then((d) => {
      setOrcamentos(d.orcamentos); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { if (lojaId) carregar(); }, [lojaId]);
  useEffect(() => {
    if (lojaId && novo) api.get(`/loja/${lojaId}/noivas?pagina=1`).then((d) => setNoivas(d.leads)).catch(() => {});
  }, [lojaId, novo]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErro("");
    try {
      const d = await api.post(`/loja/${lojaId}/orcamentos`, { leadId });
      navigate(`/loja/${lojaId}/orcamentos/${d.orcamentoId}`);
    } catch (err: any) { setErro(err.message); setSaving(false); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Orçamentos</h1>
          <p className="text-[13px] text-cinza-fumo">Monte o carrinho da noiva e feche o contrato</p>
        </div>
        <button onClick={() => setNovo(!novo)}
          className="inline-flex items-center rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 transition-colors">
          + Novo orçamento
        </button>
      </header>

      {novo && (
        <form onSubmit={criar} className="flex flex-col gap-4 rounded-md border border-borda bg-papel-elevado p-4">
          <h2 className="text-[14px] font-medium text-tinta">Novo orçamento</h2>
          {erro && <p className="text-[13px] text-bordo">{erro}</p>}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-tinta">Noiva *</label>
            <select value={leadId} onChange={e => setLeadId(e.target.value)} required
              className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta focus:outline-2 focus:outline-bordo">
              <option value="">Selecione…</option>
              {noivas.map(n => <option key={n.id} value={n.id}>{n.noivaNome}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !leadId}
              className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
              {saving ? "Abrindo…" : "Abrir carrinho"}
            </button>
            <button type="button" onClick={() => setNovo(false)}
              className="rounded-md border border-borda px-4 py-2 text-[13px] text-grafite hover:border-cinza-fumo">Cancelar</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-[14px] text-cinza-fumo">Carregando…</p>
      ) : orcamentos.length === 0 ? (
        <p className="text-[14px] text-cinza-fumo">Nenhum orçamento ainda. Crie o primeiro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {orcamentos.map((o) => (
            <li key={o.id}>
              <Link href={`/loja/${lojaId}/orcamentos/${o.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-champagne/10 transition-colors">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{o.noivaNome}</span>
                  <span className="text-[12px] text-cinza-fumo">Vendedora: {o.vendedoraNome}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[14px] text-tinta">{brl(o.subtotal)}</span>
                  <span className="text-[12px] text-grafite">{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
