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

  return {
    user,
    session,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout,
    activeLojaId,
  };
}
