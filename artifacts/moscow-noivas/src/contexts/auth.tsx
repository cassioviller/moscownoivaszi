import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useLocation } from "wouter";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  isSuperAdmin: boolean;
}

interface Loja {
  id: string;
  nome: string;
}

interface AuthState {
  loading: boolean;
  usuario: Usuario | null;
  loja: Loja | null;
  lojaAtivaId: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, senha: string) => Promise<Usuario>;
  logout: () => Promise<void>;
  selecionarLoja: (lojaId: string) => Promise<void>;
  recarregar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    usuario: null,
    loja: null,
    lojaAtivaId: null,
  });
  const [, navigate] = useLocation();

  async function recarregar() {
    try {
      const data = await api.get("/auth/sessao");
      setState({
        loading: false,
        usuario: data.usuario,
        loja: data.loja,
        lojaAtivaId: data.lojaAtivaId,
      });
    } catch {
      setState({ loading: false, usuario: null, loja: null, lojaAtivaId: null });
    }
  }

  useEffect(() => { recarregar(); }, []);

  async function login(email: string, senha: string): Promise<Usuario> {
    const data = await api.post("/auth/login", { email, senha });
    setState({
      loading: false,
      usuario: data.usuario,
      loja: null,
      lojaAtivaId: null,
    });
    return data.usuario;
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    setState({ loading: false, usuario: null, loja: null, lojaAtivaId: null });
    navigate("/login");
  }

  async function selecionarLoja(lojaId: string) {
    await api.post("/auth/selecionar-loja", { lojaId });
    await recarregar();
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, selecionarLoja, recarregar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
