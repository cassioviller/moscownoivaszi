import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login, usuario, lojaAtivaId } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  if (usuario) {
    if (lojaAtivaId) navigate(`/loja/${lojaAtivaId}`);
    else navigate("/selecionar-loja");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      await login(email, senha);
      navigate("/selecionar-loja");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
      <div className="w-full max-w-[360px] flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-[28px] sm:text-[32px] font-light tracking-tight leading-[1.1] text-tinta">
            Moscow Noivas
          </h1>
          <p className="text-[14px] leading-relaxed text-grafite">
            Acesse o sistema interno.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {erro && (
            <p role="alert" className="text-[13px] text-bordo">{erro}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-medium text-tinta">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta placeholder:text-cinza-fumo focus:outline-2 focus:outline-bordo focus:outline-offset-2"
              placeholder="seu@email.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-[13px] font-medium text-tinta">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta placeholder:text-cinza-fumo focus:outline-2 focus:outline-bordo focus:outline-offset-2"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5 text-[14px] font-medium tracking-[0.01em] text-champagne transition-colors duration-150 hover:bg-bordo/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
