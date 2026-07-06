import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

interface Lead {
  id: string;
  noivaNome: string;
  etapa: string;
  casamentoData: string | null;
  whatsapp: string | null;
  createdAt: string;
}

const ETAPA_LABEL: Record<string, string> = {
  NOVO: "Nova", INTERESSES_PREENCHIDOS: "Interesses", ATENDIMENTO_AGENDADO: "Agendada",
  EM_ATENDIMENTO: "Em atendimento", ORCAMENTO_ABERTO: "Orçamento", CONTRATO_FECHADO: "Contrato",
  EM_PROVAS: "Provas", RETIRADO: "Retirado", CASAMENTO_REALIZADO: "Casada",
  DEVOLVIDO: "Devolvido", PERDIDO: "Perdida",
};

export default function NoivasPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [novaNoiva, setNovaNoiva] = useState(false);
  const [noivaNome, setNoivaNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setLoading(true);
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (busca) q.set("busca", busca);
    api.get(`/loja/${lojaId}/noivas?${q}`).then((d) => {
      setLeads(d.leads); setTotal(d.total); setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { if (lojaId) carregar(); }, [lojaId, pagina, busca]);

  async function criarNoiva(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErro("");
    try {
      await api.post(`/loja/${lojaId}/noivas`, { noivaNome, whatsapp });
      setNovaNoiva(false); setNoivaNome(""); setWhatsapp("");
      carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Noivas</h1>
          <p className="text-[13px] text-cinza-fumo">{total} {total === 1 ? "noiva" : "noivas"} encontradas</p>
        </div>
        <button
          onClick={() => setNovaNoiva(!novaNoiva)}
          className="inline-flex items-center rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 transition-colors"
        >
          + Nova noiva
        </button>
      </header>

      {novaNoiva && (
        <form onSubmit={criarNoiva} className="flex flex-col gap-4 rounded-md border border-borda bg-papel-elevado p-4">
          <h2 className="text-[14px] font-medium text-tinta">Nova noiva</h2>
          {erro && <p className="text-[13px] text-bordo">{erro}</p>}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-tinta">Nome da noiva *</label>
            <input value={noivaNome} onChange={e => setNoivaNome(e.target.value)} required
              className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta focus:outline-2 focus:outline-bordo" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-tinta">WhatsApp</label>
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
              className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta focus:outline-2 focus:outline-bordo" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setNovaNoiva(false)}
              className="rounded-md border border-borda px-4 py-2 text-[13px] text-grafite hover:border-cinza-fumo">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div>
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
          placeholder="Buscar por nome…"
          className="w-full rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta placeholder:text-cinza-fumo focus:outline-2 focus:outline-bordo"
        />
      </div>

      {loading ? (
        <p className="text-[14px] text-cinza-fumo">Carregando…</p>
      ) : leads.length === 0 ? (
        <p className="text-[14px] text-cinza-fumo">Nenhuma noiva encontrada.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/loja/${lojaId}/noivas/${lead.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-champagne/10 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{lead.noivaNome}</span>
                  {lead.casamentoData && (
                    <span className="text-[12px] text-cinza-fumo">
                      Casamento: {new Date(lead.casamentoData).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-grafite">{ETAPA_LABEL[lead.etapa] ?? lead.etapa}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > 20 && (
        <div className="flex gap-2 justify-center">
          {pagina > 1 && <button onClick={() => setPagina(p => p - 1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md hover:border-cinza-fumo">← Anterior</button>}
          <span className="px-3 py-1.5 text-[13px] text-grafite">Página {pagina}</span>
          {pagina * 20 < total && <button onClick={() => setPagina(p => p + 1)} className="px-3 py-1.5 text-[13px] border border-borda rounded-md hover:border-cinza-fumo">Próxima →</button>}
        </div>
      )}
    </div>
  );
}
