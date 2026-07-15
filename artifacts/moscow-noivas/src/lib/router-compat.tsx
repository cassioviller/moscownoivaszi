import type { ComponentProps } from "react";
import {
  Link as RouterLink,
  useLocation as useRouterLocation,
  useNavigate,
  useParams,
} from "react-router";
import { useStoreStore } from "./store";

export { useSearchParams } from "react-router";

/**
 * Camada de compatibilidade wouter → react-router para as páginas planas
 * pré-unificação: aceita `href` plano (/leads/123) e o prefixa com a loja
 * ativa da URL (/loja/:lojaId/leads/123). Páginas novas (portadas do
 * orcamentos) devem usar react-router diretamente; remover este arquivo
 * quando a última página plana for portada.
 */
export function useLojaHref(): (path: string) => string {
  const { lojaId } = useParams();
  const activeLojaId = useStoreStore((s) => s.activeLojaId);
  const id = lojaId ?? activeLojaId;
  return (path: string) => {
    if (
      !id ||
      !path.startsWith("/") ||
      path.startsWith("/loja/") ||
      path === "/login" ||
      path === "/selecionar-loja"
    ) {
      return path;
    }
    return `/loja/${id}${path}`;
  };
}

export function Link({
  href,
  ...props
}: { href: string } & Omit<ComponentProps<typeof RouterLink>, "to">) {
  const toLoja = useLojaHref();
  return <RouterLink to={toLoja(href)} {...props} />;
}

/** Assinatura do wouter: retorna [pathname, setLocation]. */
export function useLocation(): [string, (to: string) => void] {
  const navigate = useNavigate();
  const toLoja = useLojaHref();
  const { pathname } = useRouterLocation();
  return [pathname, (to: string) => navigate(toLoja(to))];
}

/** Assinatura do wouter: os params vêm da rota corrente; o pattern é ignorado. */
export function useRoute(_pattern: string): [boolean, Record<string, string | undefined>] {
  const params = useParams();
  return [true, params];
}
