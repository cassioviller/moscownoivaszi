import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { api, ApiError } from "@/lib/api";

interface Loja { id: string; nome: string; }

export default function SelecionarLojaPage() {
  const { usuario, lojaAtivaId, selecionarLoja, logout } = useAuth();
  const [, navigate] = useLocation();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionando, setSelecionando] = useState(false);

  useEffect(() => {
    if (!usuario) { navigate("/login"); return; }
    if (lojaAtivaId) { navigate(`/loja/${lojaAtivaId}`); return; }
    api.get("/auth/lojas").then((d) => {
      setLojas(d.lojas);
      setLoading(false);
      if (d.lojas.length === 1) {
        selecionarLoja(d.lojas[0].id).then(() => navigate(`/loja/${d.lojas[0].id}`));
      }
    }).catch(() => setLoading(false));
  }, [usuario]);

  async function handleSelecionar(lojaId: string) {
    setSelecionando(true);
    setErro("");
    try {
      await selecionarLoja(lojaId);
      navigate(`/loja/${lojaId}`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro ao selecionar loja");
    } finally {
      setSelecionando(false);
    }
  }

  if (loading) return (
    <main className="min-h-svh flex items-center justify-center bg-papel">
      <p className="text-grafite text-sm">Carregando lojas…</p>
    </main>
  );

  if (lojas.length === 0) return (
    <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
      <div className="w-full max-w-[360px] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-[24px] sm:text-[28px] font-light tracking-tight leading-[1.15] text-tinta">
            Sem acesso a lojas
          </h1>
          <p className="text-[14px] leading-relaxed text-grafite">
            Sua conta não tem acesso a nenhuma loja. Procure o administrador.
          </p>
        </header>
        <button onClick={logout} className="inline-flex items-center justify-center rounded-md border border-borda bg-papel-elevado px-4 py-2.5 text-[14px] font-medium text-tinta transition-colors hover:border-cinza-fumo w-fit">
          Sair
        </button>
      </div>
    </main>
  );

  return (
    <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
      <div className="w-full max-w-[360px] flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-[24px] sm:text-[28px] font-light tracking-tight leading-[1.15] text-tinta">
            Escolha a loja
          </h1>
          <p className="text-[14px] leading-relaxed text-grafite">
            Você tem acesso a mais de uma loja. Selecione com qual quer trabalhar.
          </p>
        </header>
        {erro && <p role="alert" className="text-[13px] text-bordo">{erro}</p>}
        <ul className="flex flex-col gap-2">
          {lojas.map((loja) => (
            <li key={loja.id}>
              <button
                disabled={selecionando}
                onClick={() => handleSelecionar(loja.id)}
                className="w-full flex items-center justify-between rounded-md border border-borda bg-papel-elevado px-4 py-3 text-[14px] text-tinta transition-colors hover:border-cinza-fumo hover:bg-papel-elevado/80 disabled:opacity-60"
              >
                <span>{loja.nome}</span>
                <span className="text-cinza-fumo">→</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
