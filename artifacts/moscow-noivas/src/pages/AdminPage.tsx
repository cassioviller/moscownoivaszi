import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";

export default function AdminPage() {
  const { usuario } = useAuth();
  const [lojas, setLojas] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [lojaForm, setLojaForm] = useState({ nome: "" });
  const [adminForm, setAdminForm] = useState({ nome: "", email: "", senha: "", lojaIds: [] as string[] });
  const [savingLoja, setSavingLoja] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  function carregar() {
    api.get("/admin/lojas").then((d) => setLojas(d.lojas));
    api.get("/admin/admins").then((d) => setAdmins(d.admins));
  }

  useEffect(() => { if (usuario?.isSuperAdmin) carregar(); }, [usuario]);

  async function criarLoja(e: React.FormEvent) {
    e.preventDefault(); setSavingLoja(true); setErro(""); setOk("");
    try { await api.post("/admin/lojas", lojaForm); setOk("Loja criada."); setLojaForm({ nome: "" }); carregar(); }
    catch (err: any) { setErro(err.message); }
    finally { setSavingLoja(false); }
  }

  async function criarAdmin(e: React.FormEvent) {
    e.preventDefault(); setSavingAdmin(true); setErro(""); setOk("");
    try { await api.post("/admin/admins", adminForm); setOk("Admin cadastrado."); setAdminForm({ nome: "", email: "", senha: "", lojaIds: [] }); carregar(); }
    catch (err: any) { setErro(err.message); }
    finally { setSavingAdmin(false); }
  }

  if (!usuario?.isSuperAdmin) return <div className="p-8 text-bordo">Acesso restrito a super-admins.</div>;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">
      <header>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Administração</h1>
      </header>

      {erro && <p className="text-[13px] text-bordo">{erro}</p>}
      {ok && <p className="text-[13px] text-grafite">{ok}</p>}

      <section className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="text-[22px] font-light tracking-tight text-tinta">Lojas</h2>
          <p className="text-[13px] text-cinza-fumo">{lojas.length} {lojas.length === 1 ? "loja" : "lojas"} no sistema.</p>
        </header>
        {lojas.length > 0 && (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {lojas.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-[14px] text-tinta">
                <span>{l.nome}</span>
                {!l.ativo && <span className="text-[12px] text-cinza-fumo">inativa</span>}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={criarLoja} className="flex gap-3">
          <input value={lojaForm.nome} onChange={e => setLojaForm({ nome: e.target.value })} required placeholder="Nome da nova loja"
            className="flex-1 rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta" />
          <button type="submit" disabled={savingLoja} className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {savingLoja ? "Criando…" : "Criar loja"}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="text-[22px] font-light tracking-tight text-tinta">Admins</h2>
          <p className="text-[13px] text-cinza-fumo">Cada admin gerencia as lojas vinculadas.</p>
        </header>
        {admins.length > 0 && (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {admins.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-[14px] text-tinta">{a.nome}</span>
                <span className="text-[12px] text-cinza-fumo">{a.email}</span>
                <span className="text-[12px] text-grafite">{a.lojas.length > 0 ? a.lojas.join(", ") : "sem loja"}</span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={criarAdmin} className="flex flex-col gap-3">
          {[["nome","Nome *","text"], ["email","E-mail *","email"], ["senha","Senha *","password"]].map(([k, label, type]) => (
            <div key={k} className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">{label}</label>
              <input value={(adminForm as any)[k]} onChange={e => setAdminForm(prev => ({ ...prev, [k]: e.target.value }))} required type={type}
                className="rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[13px] text-tinta" />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-cinza-fumo">Lojas *</label>
            <select multiple value={adminForm.lojaIds} onChange={e => setAdminForm(prev => ({ ...prev, lojaIds: [...e.target.selectedOptions].map(o => o.value) }))}
              className="rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[13px] text-tinta h-24">
              {lojas.filter(l => l.ativo).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <button type="submit" disabled={savingAdmin} className="w-fit rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {savingAdmin ? "Cadastrando…" : "Cadastrar admin"}
          </button>
        </form>
      </section>

      <Link href="/admin/perfis" className="text-[14px] text-grafite hover:text-tinta transition-colors w-fit">
        Gerenciar perfis (modelos globais) →
      </Link>
    </main>
  );
}
