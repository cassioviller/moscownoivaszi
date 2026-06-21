import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";

const MODULOS = ["leads", "interesses", "vestidos", "ajustes", "config", "financeiro"] as const;
const ACOES = ["ver", "criar", "editar"] as const;
const MODULO_LABEL: Record<string, string> = {
  leads: "Noivas/Leads", interesses: "Interesses", vestidos: "Vestidos",
  ajustes: "Ajustes", config: "Catálogo", financeiro: "Financeiro",
};

export default function AdminPerfisPage() {
  const { usuario } = useAuth();
  const [perfis, setPerfis] = useState<any[]>([]);
  const [editado, setEditado] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => { if (usuario?.isSuperAdmin) api.get("/admin/perfis").then((d) => setPerfis(d.perfis)); }, [usuario]);

  function getAcesso(perfilId: string, modulo: string, acao: string): boolean {
    const src = editado[perfilId] ?? perfis.find(p => p.id === perfilId)?.acessosModulos ?? {};
    return src?.[modulo]?.[acao] === true;
  }

  function toggle(perfilId: string, modulo: string, acao: string) {
    const base = editado[perfilId] ?? JSON.parse(JSON.stringify(perfis.find(p => p.id === perfilId)?.acessosModulos ?? {}));
    if (!base[modulo]) base[modulo] = {};
    base[modulo][acao] = !base[modulo][acao];
    if (acao !== "ver" && base[modulo][acao]) base[modulo].ver = true;
    setEditado(prev => ({ ...prev, [perfilId]: base }));
  }

  async function salvar(perfilId: string) {
    setSaving(perfilId);
    try {
      await api.put(`/admin/perfis/${perfilId}`, { acessosModulos: editado[perfilId] ?? perfis.find(p => p.id === perfilId)?.acessosModulos });
      setMensagem("Perfil salvo."); setTimeout(() => setMensagem(""), 3000);
      api.get("/admin/perfis").then((d) => setPerfis(d.perfis));
    } catch (err: any) { setMensagem(err.message); }
    finally { setSaving(null); }
  }

  if (!usuario?.isSuperAdmin) return <div className="p-8 text-bordo">Acesso restrito.</div>;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-10">
      <header>
        <Link href="/admin" className="text-[13px] text-grafite hover:text-tinta">← Administração</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta mt-1">Perfis (modelos globais)</h1>
      </header>
      {mensagem && <p className="text-[13px] text-grafite">{mensagem}</p>}
      {perfis.map((perfil) => (
        <section key={perfil.id} className="flex flex-col gap-4 rounded-md border border-borda bg-papel-elevado p-4">
          <h2 className="text-[15px] font-medium text-tinta">{perfil.nome}</h2>
          <div className="overflow-x-auto">
            <table className="text-[12px] w-full">
              <thead>
                <tr>
                  <th className="text-left text-cinza-fumo font-normal pb-2 w-32">Módulo</th>
                  {ACOES.map(a => <th key={a} className="text-cinza-fumo font-normal pb-2 px-2 capitalize">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map((m) => (
                  <tr key={m} className="border-t border-borda-suave">
                    <td className="py-2 text-grafite">{MODULO_LABEL[m]}</td>
                    {ACOES.map(a => (
                      <td key={a} className="py-2 px-2 text-center">
                        <input type="checkbox" checked={getAcesso(perfil.id, m, a)} onChange={() => toggle(perfil.id, m, a)} className="accent-bordo" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => salvar(perfil.id)} disabled={saving === perfil.id}
            className="w-fit rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {saving === perfil.id ? "Salvando…" : "Salvar"}
          </button>
        </section>
      ))}
    </main>
  );
}
