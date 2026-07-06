import type { Loja, Sessao, Usuario } from "@/generated/prisma/client";
import {
  lerSessao,
  lerSessaoComLojaId,
  gateSessaoLojaAtivaPorId,
  type GateEstado,
} from "./sessao";
import { getCookieSessao } from "./cookie";

export { gerarHash, verificarSenha } from "./senha";
export {
  SESSAO_TTL_MS,
  criarSessao,
  lerSessao,
  destruirSessao,
  listarLojasDoUsuario,
  selecionarLojaPorPadrao,
  definirLojaAtiva,
  lerSessaoComLojaId,
  gateSessaoLojaAtivaPorId,
} from "./sessao";
export type { GateEstado } from "./sessao";
export { COOKIE_NOME, setCookieSessao, getCookieSessao, clearCookieSessao } from "./cookie";

/**
 * Lê o cookie, busca a sessão por id, retorna { sessao, usuario } ou null.
 * Composição cookie + DB; não estende TTL (decisão B.1 #3: 8h absolute).
 */
export async function getSessao(): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const id = await getCookieSessao();
  if (!id) return null;
  return lerSessao(id);
}

/**
 * Wrapper de cookie sobre `lerSessaoComLojaId`. Retorna sessão + usuário + loja ativa,
 * ou null se sessão inválida, sem `lojaAtivaId`, ou loja desativada.
 */
export async function getSessaoComLoja(): Promise<
  { sessao: Sessao; usuario: Usuario; loja: Loja } | null
> {
  const id = await getCookieSessao();
  if (!id) return null;
  return lerSessaoComLojaId(id);
}

/**
 * Gate que o layout `(app)` chama: lê o cookie e devolve o `GateEstado`.
 * Wrapper de cookie sobre `gateSessaoLojaAtivaPorId` (a lógica testável).
 */
export async function gateSessaoLojaAtiva(): Promise<GateEstado> {
  const id = await getCookieSessao();
  return gateSessaoLojaAtivaPorId(id);
}
