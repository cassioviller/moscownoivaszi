// src/app/(app)/loja/[lojaId]/atendimentos/novo/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarNoivasAtivas } from "@/lib/leads/leads";
import { listarEquipe } from "@/lib/admin/usuarios";
import { listarCabines } from "@/lib/atendimentos/cabines";
import { listarProximosAtendimentos } from "@/lib/atendimentos/atendimentos";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { AgendarForm } from "./agendar-form";
import { cancelarAtendimentoAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = { "1": "Atendimento agendado.", cancelado: "Atendimento cancelado." };
const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default async function NovoAtendimentoPage({
  params, searchParams,
}: { params: Promise<{ lojaId: string }>; searchParams: Promise<{ noiva?: string; ok?: string; tipo?: string; reserva?: string }> }) {
  const sc = await exigirAcesso("leads");
  const { lojaId } = await params;
  const { noiva, ok, tipo, reserva } = await searchParams;
  const tipoInicial = tipo === "PROVA" ? "PROVA" : "ATENDIMENTO";

  const [podeCriar, podeVerConfig, noivas, equipe, cabines, proximos] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "config", "ver"),
    listarNoivasAtivas(sc.loja.id),
    listarEquipe(sc.loja.id),
    listarCabines(sc.loja.id, { ativasApenas: true }),
    listarProximosAtendimentos(sc.loja.id),
  ]);
  const aviso = ok ? AVISOS[ok] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite hover:text-tinta">← {sc.loja.nome}</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Agendar</h1>
        {podeVerConfig && (
          <Link href={`/loja/${lojaId}/atendimentos/config`} className="w-fit text-[13px] text-grafite underline decoration-borda underline-offset-4 hover:text-tinta">
            Cabines &amp; horário
          </Link>
        )}
      </header>
      {aviso && <AvisoFlash tom={ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {!podeCriar ? (
        <p className="text-[14px] text-grafite">Você não tem permissão para agendar.</p>
      ) : cabines.length === 0 ? (
        <p className="text-[14px] text-grafite">
          Cadastre ao menos uma cabine em <Link href={`/loja/${lojaId}/atendimentos/config`} className="underline">Cabines &amp; horário</Link> para agendar.
        </p>
      ) : (
        <AgendarForm
          noivas={noivas.map((n) => ({ id: n.id, nome: n.noivaNome }))}
          cabines={cabines.map((c) => ({ id: c.id, nome: c.nome }))}
          vendedoras={equipe.map((e) => ({ id: e.id, nome: e.nome }))}
          noivaInicial={noiva}
          tipoInicial={tipoInicial}
          bloqueioInicial={reserva}
        />
      )}

      <section className="flex flex-col gap-3 border-t border-borda-suave pt-5">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Próximos atendimentos</h2>
        {proximos.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhum atendimento agendado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {proximos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{a.noivaNome ?? "Noiva"}</span>
                  <span className="text-[12px] text-cinza-fumo">{dataHora.format(a.inicio)} · {a.cabineNome} · {a.vendedoraNome}</span>
                </div>
                {podeCriar && (
                  <form action={cancelarAtendimentoAction}>
                    <input type="hidden" name="atendimentoId" value={a.id} />
                    <BotaoConfirmar mensagem={`Cancelar o atendimento de ${a.noivaNome ?? "noiva"}?`} ariaLabel="Cancelar atendimento"
                      className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                      Cancelar
                    </BotaoConfirmar>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
