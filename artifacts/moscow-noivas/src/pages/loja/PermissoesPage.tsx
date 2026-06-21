import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

const MODULOS = ["leads", "interesses", "vestidos", "ajustes", "config", "financeiro"] as const;
const ACOES = ["ver", "criar", "editar"] as const;
const MODULO_LABEL: Record<string, string> = {
  leads: "Noivas/Leads", interesses: "Interesses", vestidos: "Vestidos",
  ajustes: "Ajustes", config: "Catálogo", financeiro: "Financeiro",
};

export default function PermissoesPage() {
  const params = useParams<{ lojaId: string }>();
  const lojaId = params.lojaId;
  const [perfis, setPerfis] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/permissoes`).then((d) => {
      setPerfis(d.perfis);
      const map: Record<string, any> = {};
      for (const o of d.overrides) map[o.perfilId] = o.acessosModulos;
      setOverrides(map);
    });
  }, [lojaId]);

  function getAcesso(perfilId: string, modulo: string, acao: string): boolean {
    const src = overrides[perfilId] ?? perfis.find(p => p.id === perfilId)?.acessosModulos ?? {};
    return src?.[modulo]?.[acao] === true;
  }

  function toggleAcesso(perfilId: string, modulo: string, acao: string) {
    const src = overrides[perfilId] ?? JSON.parse(JSON.stringify(perfis.find(p => p.id === perfilId)?.acessosModulos ?? {}));
    if (!src[modulo]) src[modulo] = {};
    src[modulo][acao] = !src[modulo][acao];
    if (acao !== "ver" && src[modulo][acao]) src[modulo].ver = true;
    setOverrides(prev => ({ ...prev, [perfilId]: src }));
  }

  async function salvar(perfilId: string) {
    setSaving(perfilId);
    try {
      await api.put(`/loja/${lojaId}/permissoes/${perfilId}`, { acessosModulos: overrides[perfilId] });
      setMensagem("Permissões salvas.");
      setTimeout(() => setMensagem(""), 3000);
    } catch (err: any) {
      setMensagem(err.message);
    } finally { setSaving(null); }
  }

  const editablePerfis = perfis.filter(p => p.id !== "perfil-admin");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Permissões</h1>
        <p className="text-[13px] text-cinza-fumo">Personalize o acesso de cada perfil nesta loja.</p>
      </header>
      {mensagem && <p className="text-[13px] text-grafite">{mensagem}</p>}
      {editablePerfis.map((perfil) => (
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
                        <input type="checkbox" checked={getAcesso(perfil.id, m, a)}
                          onChange={() => toggleAcesso(perfil.id, m, a)}
                          className="accent-bordo" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => salvar(perfil.id)} disabled={saving === perfil.id}
            className="w-fit rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {saving === perfil.id ? "Salvando…" : "Salvar permissões"}
          </button>
        </section>
      ))}
    </div>
  );
}
