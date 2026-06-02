// src/app/(app)/loja/[lojaId]/atendimentos/config/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarCabines, obterHorarioLoja } from "@/lib/atendimentos/cabines";
import { criarCabineAction, alternarCabineAction, salvarHorarioAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  cabine: "Cabines atualizadas.",
  horario: "Horário salvo.",
  intervalo_invalido: "Horário inválido (abertura deve ser antes do fechamento).",
};

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const acao =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export default async function ConfigAtendimentosPage({
  params, searchParams,
}: { params: Promise<{ lojaId: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "ver"))) redirect(`/loja/${sc.loja.id}`);
  const { lojaId } = await params;
  const { ok, erro } = await searchParams;

  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar");
  const [cabines, horario] = await Promise.all([listarCabines(sc.loja.id, {}), obterHorarioLoja(sc.loja.id)]);
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/atendimentos/novo`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Agendar</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Cabines &amp; horário</h1>
      </header>
      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Horário de funcionamento</h2>
        {podeEditar ? (
          <form action={salvarHorarioAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] text-grafite">Abre (h)</span>
              <input name="abertura" type="number" min={0} max={23} defaultValue={horario.abertura} className={campo} /></label>
            <label className="flex flex-col gap-1"><span className="text-[12px] text-grafite">Fecha (h)</span>
              <input name="fechamento" type="number" min={1} max={24} defaultValue={horario.fechamento} className={campo} /></label>
            <button type="submit" className={`${acao} no-underline`}>Salvar horário</button>
          </form>
        ) : (
          <p className="text-[14px] text-tinta">{horario.abertura}h às {horario.fechamento}h</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Cabines</h2>
        {cabines.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhuma cabine cadastrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {cabines.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className={`text-[14px] ${c.ativo ? "text-tinta" : "text-cinza-fumo line-through"}`}>{c.nome}</span>
                {podeEditar && (
                  <form action={alternarCabineAction}>
                    <input type="hidden" name="cabineId" value={c.id} />
                    <button type="submit" className={acao}>{c.ativo ? "Desativar" : "Ativar"}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form action={criarCabineAction} className="flex items-center gap-2">
            <input name="nome" placeholder="Nova cabine (ex.: Cabine 1)" className={`${campo} flex-1`} aria-label="Nome da cabine" />
            <button type="submit" className={`${acao} no-underline`}>Adicionar</button>
          </form>
        )}
      </section>
    </main>
  );
}
