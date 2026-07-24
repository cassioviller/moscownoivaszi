import { useGetMe, useLogin, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useStoreStore } from "@/lib/store";
import { useNavigate, useParams } from "react-router";
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
  const { lojaId: urlLojaId } = useParams();
  const navigate = useNavigate();

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
    navigate("/login");
  };

  // null/undefined = superadmin ou sem loja ativa → sem restrição de módulos.
  const acessosModulos = (session?.acessosModulos ?? null) as Record<string, unknown> | null;

  // Prioridade: loja da URL (/loja/:lojaId — fonte de verdade pós-unificação) >
  // store persistido (troca de loja imediata) > sessão do servidor (usuária
  // retornando com cookie válido e localStorage vazio; o store só sincroniza um
  // render após o getMe resolver, e sem o fallback o AppLayout redirecionava
  // para /selecionar-loja antes do sync).
  const activeLojaIdResolvido = urlLojaId ?? activeLojaId ?? session?.lojaAtivaId ?? null;

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
