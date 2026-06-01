// src/app/(app)/loja/[lojaId]/noivas/[leadId]/interesses/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterNoivaComInteresse } from "@/lib/leads/interesses";
import { listarCatalogo } from "@/lib/catalogo/catalogo";
import { indicarVestidos } from "@/lib/indicacao/indicacao";
import { salvarInteresseAction } from "./actions";
import { InteresseForm } from "./interesse-form";
import { VestidosSugeridos } from "@/components/indicacao/vestidos-sugeridos";

export const dynamic = "force-dynamic";

export default async function InteressesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; leadId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "ver"))) {
    redirect(`/loja/${sc.loja.id}/noivas`);
  }

  const { lojaId, leadId } = await params;
  const { ok } = await searchParams;

  // Leitura read-only: confirma que a noiva é da loja e nunca cria registro.
  const dados = await obterNoivaComInteresse(sc.loja.id, leadId);
  if (!dados) redirect(`/loja/${lojaId}/noivas`); // não é da loja

  const [podeCriar, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "editar"),
  ]);
  const podeSalvar = podeCriar || podeEditar;

  const i = dados.interesse;
  const defaults = {
    algoAMais: i?.algoAMais ?? "",
    naoQuerUsar: i?.naoQuerUsar ?? "",
    tetoOrcamento: i?.tetoOrcamento?.toString() ?? "",
  };

  // Catálogo (form) e seleções já registradas (prefill + indicação).
  const catalogo = await listarCatalogo(sc.loja.id);
  const selecoes = Object.fromEntries((i?.atributos ?? []).map((a) => [a.atributoId, a.opcaoId]));
  const sugeridos = await indicarVestidos(sc.loja.id, leadId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}/noivas`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Noivas
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Interesses</h1>
        <p className="text-[14px] text-cinza-fumo">{dados.lead.noivaNome}</p>
      </header>

      {ok && <p className="text-[13px] text-grafite">Interesses salvos.</p>}

      <InteresseForm
        action={salvarInteresseAction}
        leadId={leadId}
        defaults={defaults}
        readonly={!podeSalvar}
        catalogo={catalogo}
        selecoes={selecoes}
      />

      <VestidosSugeridos vestidos={sugeridos} naoQuerUsar={i?.naoQuerUsar} />
    </main>
  );
}
