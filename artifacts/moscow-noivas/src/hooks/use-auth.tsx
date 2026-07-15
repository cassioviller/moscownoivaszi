import { useGetMe, useLogin, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useStoreStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useEffect } from "react";

export function useAuth() {
  const { data: session, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });
  
  const loginMutation = useLogin();
  const logoutMutation = useLogout();
  const { activeLojaId, setActiveLojaId } = useStoreStore();
  const [, setLocation] = useLocation();

  const user = session?.usuario;

  // Sync active loja from session if available
  useEffect(() => {
    if (session?.lojaAtivaId && session.lojaAtivaId !== activeLojaId) {
      setActiveLojaId(session.lojaAtivaId);
    }
  }, [session, activeLojaId, setActiveLojaId]);

  const logout = async () => {
    await logoutMutation.mutateAsync(undefined);
    setActiveLojaId(null);
    setLocation("/login");
  };

  // null/undefined = superadmin ou sem loja ativa → sem restrição de módulos.
  const acessosModulos = (session?.acessosModulos ?? null) as Record<string, unknown> | null;

  // O store persistido (zustand) só é sincronizado pelo useEffect acima, que roda
  // um render APÓS o getMe resolver. Se a sessão já tem loja ativa no servidor
  // (ex.: usuária retornando com cookie válido e localStorage vazio), esse atraso
  // fazia o AppLayout redirecionar para /selecionar-loja antes do sync. Preferir o
  // store quando definido (mantém a troca de loja imediata) e cair para o valor da
  // sessão resolve a corrida sem esperar o efeito.
  const activeLojaIdResolvido = activeLojaId ?? session?.lojaAtivaId ?? null;

  return {
    user,
    session,
    acessosModulos,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout,
    activeLojaId: activeLojaIdResolvido,
  };
}
