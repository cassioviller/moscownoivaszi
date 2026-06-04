import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, listarEquipe } from "@/lib/admin/usuarios";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { previewComissao } from "@/lib/financeiro/comissao";
import { competenciaAtual } from "@/lib/financeiro/datas";
import { brl } from "@/lib/dinheiro";
import { VendedoraForm } from "./vendedora-form";

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/selecionar-loja");
  // Só admin (ou super-admin) da loja ativa gerencia a equipe; vendedora volta pro início.
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect("/");

  const { ok, erro } = await searchParams;
  // Comissão do mês ao vivo por membro (preview, não grava). Só quem pode ver o Financeiro
  // enxerga o número — dado sensível; sem permissão, a lista some sem ruído.
  const competencia = competenciaAtual();
  const [equipe, podeVerFinanceiro] = await Promise.all([
    listarEquipe(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"),
  ]);
  const comissaoPorMembro = podeVerFinanceiro
    ? new Map((await previewComissao(sc.loja.id, competencia)).map((l) => [l.vendedoraId, l.total]))
    : new Map<string, string>();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Equipe</h1>
        <p className="text-[13px] text-cinza-fumo">
          Vendedoras e demais membros vinculados a {sc.loja.nome}.
        </p>
      </header>

      {erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {erro}
        </p>
      )}
      {ok && (
        <p className="text-[13px] leading-relaxed text-grafite">Vendedora cadastrada.</p>
      )}

      <section className="flex flex-col gap-4">
        {equipe.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">
            Nenhum membro cadastrado ainda. Cadastre a primeira vendedora abaixo.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {equipe.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{m.nome}</span>
                  <span className="text-[12px] text-cinza-fumo">{m.email}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="text-[12px] text-grafite">{m.perfil}</span>
                  {comissaoPorMembro.has(m.id) && (
                    <span className="text-[12px] tabular-nums text-bordo">
                      {brl(comissaoPorMembro.get(m.id)!)} este mês
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {podeVerFinanceiro && (
          <Link
            href={`/loja/${sc.loja.id}/financeiro/comissoes`}
            className="w-fit text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo"
          >
            Ver ranking de comissões →
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[16px] font-medium tracking-tight text-tinta">
          Cadastrar vendedora
        </h2>
        <VendedoraForm />
      </section>
    </main>
  );
}
