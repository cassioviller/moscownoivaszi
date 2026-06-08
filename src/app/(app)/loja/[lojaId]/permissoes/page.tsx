// src/app/(app)/loja/[lojaId]/permissoes/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { listarPerfis, listarOverridesDaLoja } from "@/lib/permissoes/perfis";
import { resolverAcessosEfetivos, MODULOS_VISIVEIS } from "@/lib/permissoes/modulos";
import { MatrizPermissoes } from "@/components/permissoes/matriz-permissoes";
import { salvarOverrideAction, restaurarPadraoAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PermissoesPage() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect(`/loja/${sc.loja.id}`);

  const [perfis, overrides] = await Promise.all([
    listarPerfis(),
    listarOverridesDaLoja(sc.loja.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${sc.loja.id}`}
          className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Permissões</h1>
        <p className="text-[13px] text-cinza-fumo">
          O que cada perfil pode fazer nesta loja. Sem personalização, segue o modelo global.
        </p>
      </header>

      {perfis.map((p) => {
        const override = overrides.get(p.id) ?? null;
        const efetivo = resolverAcessosEfetivos(p.acessosModulos, override);
        return (
          <MatrizPermissoes
            key={p.id}
            perfilId={p.id}
            perfilNome={p.nome}
            valores={efetivo}
            modulosVisiveis={MODULOS_VISIVEIS}
            modo={p.id === PERFIL_ADMIN_ID ? "readonly" : "editavel"}
            estado={override ? "personalizado" : "padrao"}
            salvarAction={salvarOverrideAction}
            restaurarAction={restaurarPadraoAction}
          />
        );
      })}
    </main>
  );
}
