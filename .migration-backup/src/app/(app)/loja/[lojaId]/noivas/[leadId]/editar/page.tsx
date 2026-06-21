// src/app/(app)/loja/[lojaId]/noivas/[leadId]/editar/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { editarNoivaAction } from "../../actions";
import { NoivaForm } from "../../noiva-form";

export const dynamic = "force-dynamic";

export default async function EditarNoivaPage({
  params,
}: {
  params: Promise<{ lojaId: string; leadId: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"))) {
    redirect(`/loja/${sc.loja.id}/noivas`);
  }

  const { lojaId, leadId } = await params;
  // obterLead é escopado: noiva de outra loja → null → volta p/ a lista (falha fechada).
  const lead = await obterLead(sc.loja.id, leadId);
  if (!lead) redirect(`/loja/${lojaId}/noivas`);

  const defaults = {
    noivaNome: lead.noivaNome,
    origem: lead.origem,
    noivoNome: lead.noivoNome ?? "",
    whatsapp: lead.whatsapp ?? "",
    cerimonialista: lead.cerimonialista ?? "",
    // casamentoData nasce em meia-noite UTC → fatiar o ISO devolve "YYYY-MM-DD".
    casamentoData: lead.casamentoData ? lead.casamentoData.toISOString().slice(0, 10) : "",
    casamentoHorario: lead.casamentoHorario ?? "",
    casamentoLocal: lead.casamentoLocal ?? "",
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}/noivas`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Noivas
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Editar noiva</h1>
        <p className="text-[14px] text-cinza-fumo">{lead.noivaNome}</p>
      </header>
      <NoivaForm
        action={editarNoivaAction}
        submitLabel="Salvar alterações"
        leadId={leadId}
        defaults={defaults}
      />
    </main>
  );
}
