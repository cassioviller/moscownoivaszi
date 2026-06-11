// src/app/(app)/loja/[lojaId]/calendario/page.tsx
// Calendário do atelier — quatro vistas da mesma operação, em abas. A aba ativa
// vive na URL (?aba=) para dar link direto e sobreviver ao recarregar. Gate em
// leads:ver (mesma porta da antiga Agenda). Cada aba é um Server Component próprio.
import type { ReactNode } from "react";
import Link from "next/link";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { exigirAcesso } from "@/lib/server/acoes";
import { ABAS, resolverAba, type AbaId } from "@/lib/calendario/abas";
import { AbaMes } from "./_abas/AbaMes";
import { AbaVestidos } from "./_abas/AbaVestidos";
import { AbaAtendimentos } from "./_abas/AbaAtendimentos";
import { AbaProvasAjustes } from "./_abas/AbaProvasAjustes";

export const dynamic = "force-dynamic";

const AVISOS_OK: Record<string, string> = {
  iniciado: "Prova iniciada.",
  falta: "Falta registrada.",
  concluido: "Prova concluída.",
  ajuste: "Ajuste atualizado.",
};
const AVISOS_ERRO: Record<string, string> = {
  transicao_invalida: "Essa transição não é possível agora.",
  atendimento_invalido: "Prova não encontrada.",
  nao_e_prova: "Esse agendamento não é uma prova.",
  prova_invalida: "Prova inválida.",
  sem_descricao: "Descreva o ajuste.",
  ajuste_invalido: "Ajuste não encontrado.",
};

export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ aba?: string; ref?: string; dia?: string; ini?: string; fim?: string; ok?: string; erro?: string }>;
}) {
  const sc = await exigirAcesso("leads");
  const { lojaId } = await params;
  const sp = await searchParams;
  const aba = resolverAba(sp.aba);
  const aviso = sp.ok ? AVISOS_OK[sp.ok] : sp.erro ? AVISOS_ERRO[sp.erro] ?? "Não foi possível concluir a ação." : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit rounded-sm text-[13px] text-grafite transition-colors duration-150 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Calendário</h1>
        <p className="text-[14px] text-cinza-fumo">A operação do atelier, em quatro vistas.</p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {/* Abas: a ativa marcada por um traço bordô fino (a joia com intenção, §6). */}
      <nav className="flex gap-6 overflow-x-auto border-b border-borda-suave">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <Link
              key={a.id}
              href={`/loja/${lojaId}/calendario?aba=${a.id}${sp.ref ? `&ref=${encodeURIComponent(sp.ref)}` : ""}`}
              aria-current={ativa ? "page" : undefined}
              className={`-mb-px shrink-0 rounded-sm border-b-2 pb-3 text-[14px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo ${
                ativa
                  ? "border-bordo text-tinta"
                  : "border-transparent text-cinza-fumo hover:text-tinta"
              }`}
            >
              {a.label}
            </Link>
          );
        })}
      </nav>

      {/* refParam só vai às abas que navegam no tempo (Mês, Atendimentos). */}
      <section>
        {
          (
            {
              mes: <AbaMes lojaId={lojaId} refParam={sp.ref} dia={sp.dia} />,
              vestidos: <AbaVestidos lojaId={lojaId} ini={sp.ini} fim={sp.fim} />,
              atendimentos: <AbaAtendimentos lojaId={lojaId} refParam={sp.ref} />,
              "provas-ajustes": <AbaProvasAjustes lojaId={lojaId} ini={sp.ini} fim={sp.fim} />,
            } satisfies Record<AbaId, ReactNode>
          )[aba]
        }
      </section>
    </main>
  );
}
