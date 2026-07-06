import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

interface Vestido {
  id: string; codigo: string; nome: string; precoBase: string;
  tamanho: string | null; cor: string | null; categoria: string | null; status: string;
}

export default function VestidosPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [vestidos, setVestidos] = useState<Vestido[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [novoForm, setNovoForm] = useState(false);
  const [form, setForm] = useState({ codigo: "", nome: "", precoBase: "", tamanho: "", cor: "", categoria: "", observacoes: "" });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setLoading(true);
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (busca) q.set("busca", busca);
    api.get(`/loja/${lojaId}/vestidos?${q}`).then((d) => {
      setVestidos(d.vestidos); setTotal(d.total); setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { if (lojaId) carregar(); }, [lojaId, pagina, busca]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErro("");
    try {
      await api.post(`/loja/${lojaId}/vestidos`, form);
      setNovoForm(false); setForm({ codigo: "", nome: "", precoBase: "", tamanho: "", cor: "", categoria: "", observacoes: "" });
      carregar();
    } catch (err: any) { setErro(err.message); }
    finally { setSaving(false); }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Vestidos</h1>
          <p className="text-[13px] text-cinza-fumo">{total} no acervo</p>
        </div>
        <button onClick={() => setNovoForm(!novoForm)}
          className="inline-flex items-center rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90">
          + Novo vestido
        </button>
      </header>

      {novoForm && (
        <form onSubmit={salvar} className="flex flex-col gap-4 rounded-md border border-borda bg-papel-elevado p-4">
          <h2 className="text-[14px] font-medium text-tinta">Novo vestido</h2>
          {erro && <p className="text-[13px] text-bordo">{erro}</p>}
          <div className="grid grid-cols-2 gap-3">
            {([["codigo","Código *"], ["nome","Nome *"], ["precoBase","Preço base *"], ["tamanho","Tamanho"], ["cor","Cor"], ["categoria","Categoria"]] as [keyof typeof form, string][]).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[12px] text-cinza-fumo">{label}</label>
                <input value={form[key]} onChange={f(key)} required={key === "codigo" || key === "nome" || key === "precoBase"}
                  type={key === "precoBase" ? "number" : "text"} step={key === "precoBase" ? "0.01" : undefined}
                  className="rounded-md border border-borda bg-papel px-3 py-2 text-[13px] text-tinta" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setNovoForm(false)} className="rounded-md border border-borda px-4 py-2 text-[13px] text-grafite hover:border-cinza-fumo">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
        placeholder="Buscar por nome ou código…"
        className="w-full rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta placeholder:text-cinza-fumo focus:outline-2 focus:outline-bordo" />

      {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
        : vestidos.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhum vestido encontrado.</p>
        : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {vestidos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{v.nome}</span>
                  <span className="text-[12px] text-cinza-fumo">#{v.codigo}{v.tamanho ? ` · tam. ${v.tamanho}` : ""}{v.cor ? ` · ${v.cor}` : ""}</span>
                </div>
                <div className="text-right flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta tabular-nums">{brl(v.precoBase)}</span>
                  {v.status !== "ativo" && <span className="text-[12px] text-cinza-fumo">{v.status}</span>}
                </div>
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
