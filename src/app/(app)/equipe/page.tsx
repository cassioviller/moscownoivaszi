import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, listarEquipe } from "@/lib/admin/usuarios";
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
  const equipe = await listarEquipe(sc.loja.id);

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
                <span className="text-[12px] text-grafite">{m.perfil}</span>
              </li>
            ))}
          </ul>
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
