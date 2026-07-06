import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";

export default function EquipePage() {
  const { usuario, loja, lojaAtivaId } = useAuth();
  const [equipe, setEquipe] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nome: "", email: "", senha: "" });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (lojaAtivaId) api.get("/equipe").then((d) => { setEquipe(d.equipe); setLoading(false); }).catch(() => setLoading(false));
  }, [lojaAtivaId]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErro(""); setOk("");
    try {
      await api.post("/equipe/vendedoras", form);
      setOk("Vendedora cadastrada.");
      setForm({ nome: "", email: "", senha: "" });
      api.get("/equipe").then((d) => setEquipe(d.equipe));
    } catch (err: any) { setErro(err.message); }
    finally { setSaving(false); }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <Link href={lojaAtivaId ? `/loja/${lojaAtivaId}` : "/"} className="text-[13px] text-grafite hover:text-tinta w-fit">
          ← {loja?.nome ?? "Início"}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Equipe</h1>
        <p className="text-[13px] text-cinza-fumo">Vendedoras e demais membros vinculados a {loja?.nome}.</p>
      </header>

      {erro && <p role="alert" className="text-[13px] text-bordo">{erro}</p>}
      {ok && <p className="text-[13px] text-grafite">{ok}</p>}

      <section className="flex flex-col gap-4">
        {loading ? <p className="text-[14px] text-cinza-fumo">Carregando…</p>
          : equipe.length === 0 ? <p className="text-[14px] text-cinza-fumo">Nenhum membro cadastrado ainda.</p>
          : (
            <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
              {equipe.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] text-tinta">{m.nome}</span>
                    <span className="text-[12px] text-cinza-fumo">{m.email}</span>
                  </div>
                  <span className="text-[12px] text-grafite">{m.perfilNome}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[16px] font-medium text-tinta">Cadastrar vendedora</h2>
        <form onSubmit={cadastrar} className="flex flex-col gap-4">
          {[["nome","Nome *","text"], ["email","E-mail *","email"], ["senha","Senha *","password"]] .map(([k, label, type]) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-tinta">{label}</label>
              <input value={form[k as keyof typeof form]} onChange={f(k as keyof typeof form)} required type={type}
                className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta" />
            </div>
          ))}
          <button type="submit" disabled={saving}
            className="w-fit rounded-md bg-bordo px-5 py-2.5 text-[14px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {saving ? "Cadastrando…" : "Cadastrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
