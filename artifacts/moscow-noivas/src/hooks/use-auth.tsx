import { useGetMe, useLogin, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useStoreStore } from "@/lib/store";
import { useNavigate, useParams } from "react-router";

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

  // D1 (E93): aqui existia um efeito que copiava `session.lojaAtivaId` para o
  // store. Ele e o efeito de `app-layout.tsx` (URL → store) escreviam o MESMO
  // valor a partir de fontes OPOSTAS, ambos com `activeLojaId` nas
  // dependências: com a loja da URL diferente da loja da sessão, cada `set`
  // reativava o outro até "Maximum update depth exceeded" (reproduzido no
  // navegador: aba travada, tela em branco, e um 403 da API por baixo).
  // Agora o store tem UM escritor — o `AppLayout`, a partir da URL — e este
  // hook só LÊ. A sessão continua entrando na resolução abaixo, como último
  // fallback, sem escrever em lugar nenhum. Ver `lib/loja-ativa.ts`.

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
