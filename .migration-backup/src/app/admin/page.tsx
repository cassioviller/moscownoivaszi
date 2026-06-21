import Link from "next/link";
import { listarLojas, listarAdmins } from "@/lib/admin/usuarios";
import { LojaForm } from "./loja-form";
import { AdminForm } from "./admin-form";

const FEEDBACK_OK: Record<string, string> = {
  loja: "Loja criada.",
  admin: "Admin cadastrado.",
};

export default async function AdminConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;
  const [lojas, admins] = await Promise.all([listarLojas(), listarAdmins()]);

  return (
    <>
      {erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {erro}
        </p>
      )}
      {ok && FEEDBACK_OK[ok] && (
        <p className="text-[13px] leading-relaxed text-grafite">{FEEDBACK_OK[ok]}</p>
      )}

      {/* ── Lojas ── */}
      <section className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[22px] font-light tracking-tight text-tinta">Lojas</h1>
          <p className="text-[13px] text-cinza-fumo">
            {lojas.length} {lojas.length === 1 ? "loja" : "lojas"} no sistema.
          </p>
        </header>

        {lojas.length > 0 && (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {lojas.map((loja) => (
              <li
                key={loja.id}
                className="flex items-center justify-between px-4 py-3 text-[14px] text-tinta"
              >
                <span>{loja.nome}</span>
                {!loja.ativo && (
                  <span className="text-[12px] text-cinza-fumo">inativa</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <LojaForm />
      </section>

      {/* ── Admins ── */}
      <section className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="text-[22px] font-light tracking-tight text-tinta">Admins</h2>
          <p className="text-[13px] text-cinza-fumo">
            Cada admin gerencia as lojas vinculadas e cadastra vendedoras nelas.
          </p>
        </header>

        {admins.length > 0 && (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {admins.map((admin) => (
              <li key={admin.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-[14px] text-tinta">{admin.nome}</span>
                <span className="text-[12px] text-cinza-fumo">{admin.email}</span>
                <span className="text-[12px] text-grafite">
                  {admin.lojas.length > 0 ? admin.lojas.join(", ") : "sem loja"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <AdminForm lojas={lojas.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))} />
      </section>

      <Link
        href="/admin/perfis"
        className="text-[14px] text-grafite hover:text-tinta transition-colors duration-150 w-fit"
      >
        Gerenciar perfis (modelos globais) →
      </Link>
    </>
  );
}
