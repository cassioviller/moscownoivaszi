// src/app/(app)/loja/[lojaId]/provas/page.tsx
// Agenda de provas do atelier — todas as provas da loja (Atendimento{tipo:PROVA}) em
// um só lugar. Lente "calendário do atelier": agrupa por mês da prova e deep-linka para
// a reserva. O agendamento da prova vive no Agendar e o ciclo (iniciar/ajustes/concluir)
// na aba Provas & ajustes — não aqui, de propósito.
// Ver = leads:ver OU ajustes:ver (mesma lente do detalhe da reserva).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarProvasDaLoja, type ProvaDaLoja } from "@/lib/atelier/provas";
import { paginar, TAMANHO_PAGINA } from "@/lib/paginacao";
import { Paginacao } from "@/components/Paginacao";
import { hojeUTC } from "@/lib/tempo";
import type { AtendimentoSituacao } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;
const JANELA_IMINENTE_DIAS = 7; // prova a ≤7 dias = atenção (bordô)

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const mesAbrev = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ROTULO_SITUACAO: Record<AtendimentoSituacao, string> = {
  AGENDADO: "Agendada",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluída",
  FALTOU: "Faltou",
};

function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

type Grupo = { chave: string; rotulo: string; provas: ProvaDaLoja[] };

function agruparPorMes(provas: ProvaDaLoja[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const p of provas) {
    const chave = chaveMes(p.inicio);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: mesAno.format(p.inicio), provas: [] };
      grupos.push(grupo);
    }
    grupo.provas.push(p);
  }
  return grupos;
}

export default async function ProvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ quando?: string; p?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const [podeVerNoivas, podeVerAjustes] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"),
  ]);
  if (!podeVerNoivas && !podeVerAjustes) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const sp = await searchParams;
  const passadas = sp.quando === "passadas";

  const { itens: provas, total } = await listarProvasDaLoja(sc.loja.id, { passadas, pagina: sp.p });
  const meses = agruparPorMes(provas);
  const hoje = hojeUTC().getTime();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">
          {passadas ? "Provas anteriores" : "Provas"}
        </h1>
        <p className="text-[14px] text-cinza-fumo">
          {passadas ? "As provas já realizadas." : "As próximas provas do atelier, da mais próxima à mais distante."}
        </p>
      </header>

      {provas.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">
            {passadas ? "Nenhuma prova anterior." : "Nenhuma prova por aqui ainda."}
          </p>
          {!passadas && (
            <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
              Quando uma prova for registrada na reserva de uma noiva, ela aparece aqui — para o atelier
              acompanhar quem vem provar e quando.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {meses.map((mes) => (
            <section key={mes.chave} className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo first-letter:uppercase">
                {mes.rotulo}
              </h2>
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {mes.provas.map((p) => {
                  const dias = Math.round((p.inicio.getTime() - hoje) / DIA_MS);
                  // Bordô só na iminência: prova nos próximos 7 dias. Distante = tinta (§6).
                  const iminente = !passadas && dias >= 0 && dias <= JANELA_IMINENTE_DIAS;
                  return (
                    <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex w-11 shrink-0 flex-col items-center">
                        <span
                          className={`font-display text-[20px] font-light leading-none tabular-nums ${
                            iminente ? "text-bordo" : "text-tinta"
                          }`}
                        >
                          {p.inicio.getUTCDate()}
                        </span>
                        <span className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">
                          {mesAbrev.format(p.inicio).replace(".", "")}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          {/* Noiva = destino primário; o perfil mostra a jornada */}
                          {p.leadId && podeVerNoivas ? (
                            <Link
                              href={`/loja/${lojaId}/noivas/${p.leadId}`}
                              className="w-fit rounded-sm text-[15px] text-tinta transition-colors duration-150
                                hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2
                                focus-visible:outline-bordo"
                            >
                              {p.noivaNome ?? "Noiva"}
                            </Link>
                          ) : (
                            <span className="text-[15px] text-tinta">{p.noivaNome ?? "Noiva"}</span>
                          )}
                          <span className="text-[12px] text-cinza-fumo">Prova</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="inline-flex min-h-8 items-center rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite">
                            {ROTULO_SITUACAO[p.situacao]}
                          </span>
                          {p.vestidoCodigo && p.vestidoNome && (
                            <span className="text-[12px] text-cinza-fumo">
                              {p.vestidoCodigo} · {p.vestidoNome}
                            </span>
                          )}
                          {p.casamentoData && (
                            <span className="text-[12px] text-cinza-fumo">
                              casamento {dataCurta.format(p.casamentoData)}
                            </span>
                          )}
                          {p.bloqueioId && (
                            <Link
                              href={`/loja/${lojaId}/reservas/${p.bloqueioId}`}
                              className="rounded-sm text-[12px] text-grafite underline decoration-borda
                                underline-offset-4 transition-colors duration-150 hover:text-bordo
                                hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                                focus-visible:outline-bordo"
                            >
                              Abrir reserva
                            </Link>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Paginacao
        pagina={paginar(sp.p).pagina}
        total={total}
        tamanho={TAMANHO_PAGINA}
        href={(p) =>
          `?${new URLSearchParams({
            ...(passadas ? { quando: "passadas" } : {}),
            p: String(p),
          }).toString()}`
        }
      />

      {/* Porta para o histórico (ou volta), discreta no rodapé */}
      <div className="border-t border-borda-suave pt-5">
        <Link
          href={passadas ? `/loja/${lojaId}/provas` : `/loja/${lojaId}/provas?quando=passadas`}
          className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
            decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
            hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-bordo"
        >
          {passadas ? "← Voltar às próximas provas" : "Ver provas anteriores"}
        </Link>
      </div>
    </main>
  );
}
