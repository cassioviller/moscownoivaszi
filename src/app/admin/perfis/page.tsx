// src/app/admin/perfis/page.tsx
import { listarPerfis } from "@/lib/permissoes/perfis";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { MODULOS_VISIVEIS } from "@/lib/permissoes/modulos";
import { MatrizPermissoes } from "@/components/permissoes/matriz-permissoes";
import { salvarTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PerfisPage() {
  const perfis = await listarPerfis();
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light tracking-tight text-tinta">Perfis (modelos globais)</h1>
        <p className="text-[13px] text-cinza-fumo">
          Permissões padrão herdadas por todas as lojas. Cada loja pode personalizar.
        </p>
      </header>
      {perfis.map((p) => (
        <MatrizPermissoes
          key={p.id}
          perfilId={p.id}
          perfilNome={p.nome}
          valores={p.acessosModulos}
          modulosVisiveis={MODULOS_VISIVEIS}
          modo={p.id === PERFIL_ADMIN_ID ? "readonly" : "editavel"}
          salvarAction={salvarTemplateAction}
        />
      ))}
    </section>
  );
}
