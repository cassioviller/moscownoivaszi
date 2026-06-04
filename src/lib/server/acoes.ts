// src/lib/server/acoes.ts
// Seam de AÇÃO AUTORIZADA (aprofundamento fase 2). Concentra o invariante de toda Server
// Action de loja: sessão válida + permissão no módulo. NÃO é "use server" — é um helper puro
// importado pelos arquivos de action (que carregam o "use server"). O HOF devolve a própria
// Server Action (uma função async que recebe FormData), com o ctx (sessão+usuário+loja) já
// resolvido entregue ao corpo. O redirect final (volta + aviso) fica no corpo, porque varia
// por ação — manter isso aqui viraria saco de configuração (raso). Ver utils em ./aviso.
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo, type Modulo, type Acao } from "@/lib/permissoes/modulos";

export type CtxAcao = NonNullable<Awaited<ReturnType<typeof getSessaoComLoja>>>;

/**
 * Embrulha uma Server Action com o gate de segurança. Sem sessão → /login; sem permissão
 * no (módulo, ação) → volta pro início da loja. O corpo recebe o ctx e o FormData e cuida
 * do próprio redirect de resultado (que varia por ação).
 */
export function acaoAutorizada(
  modulo: Modulo,
  acao: Acao,
  corpo: (ctx: CtxAcao, fd: FormData) => Promise<void>,
): (fd: FormData) => Promise<void> {
  return async (fd: FormData) => {
    const sc = await getSessaoComLoja();
    if (!sc) redirect("/login");
    if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, modulo, acao))) redirect(`/loja/${sc.loja.id}`);
    await corpo(sc, fd);
  };
}
