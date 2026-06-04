// src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx
// Perfil da noiva — o lar da jornada. Leitura concierge (não formulário): reúne
// quem ela é, onde está na jornada, o casamento e os vestidos que combinam.
// Edição vive nas subpáginas /editar e /interesses. Auth + tenant espelham as
// páginas irmãs; nada de regra de negócio nova nesta fatia.
//
// Ritmo visual (não "stack de cards iguais"): a jornada é o único card elevado —
// o coração. Contato e casamento são blocos leves, sem moldura. Os vestidos
// voltam a elevar. Pesado → leve → leve → pesado cria respiro e hierarquia.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterNoivaComInteresse } from "@/lib/leads/interesses";
import { indicarVestidos } from "@/lib/indicacao/indicacao";
import { ROTULO_ORIGEM, fatosDaNoiva } from "@/lib/leads/leads";
import { estagioDaNoiva, ROTULO_ESTAGIO } from "@/lib/leads/jornada";
import { marcarPerdidaAction } from "./jornada-actions";
import { criarOrcamentoAction } from "../../orcamentos/actions";
import { gerarContratoDaNoivaAction } from "../../contratos/actions";
import { listarOrcamentosDaNoiva } from "@/lib/orcamentos/orcamentos";
import { listarContratosDaNoiva } from "@/lib/contratos/contratos";
import { PainelJornadaNoiva } from "@/components/dashboard/painel-jornada-noiva";
import { PainelVazio } from "@/components/dashboard/painel-vazio";
import { VestidosSugeridos } from "@/components/indicacao/vestidos-sugeridos";
import { listarReservasDaNoiva, vestidosLivresEntre } from "@/lib/disponibilidade/reservas";
import {
  reservarPelaNoivaAction,
  cancelarReservaPelaNoivaAction,
  buscarVestidosLivresAction,
} from "./reserva-actions";
import { ReservaLivreInline } from "@/components/disponibilidade/reserva-livre-inline";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { brl } from "@/lib/dinheiro";

export const dynamic = "force-dynamic";

const ROTULO_STATUS_ORC: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};
const ROTULO_STATUS_CONTR: Record<string, string> = { ATIVO: "Ativo", CANCELADO: "Cancelado" };

// UTC: a data nasce em meia-noite UTC (leads.ts) — exibir em UTC evita off-by-one.
const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
// Compacto p/ caber no botão "Reservar para 12/09".
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

// Mensagem humana para o retorno das ações de reserva (?ok / ?erro).
const AVISOS: Record<string, string> = {
  reserva: "Vestido reservado.",
  cancelada: "Reserva cancelada.",
  indisponivel: "Este vestido já está reservado para uma data próxima. Escolha outra peça.",
  sem_data: "Defina a data do casamento para reservar um vestido.",
  sem_vestido: "Escolha um vestido para reservar.",
  jornada: "Jornada atualizada.",
  desativada: "Noiva desativada.",
  reativada: "Noiva reativada.",
  // Abrir orçamento (gancho desta tela) pode falhar se o usuário não for vendedora da loja.
  vendedora_invalida: "Você não está vinculada a esta loja como vendedora — não foi possível abrir o orçamento.",
  lead_invalido: "Noiva inválida.",
  atendimento_invalido: "Atendimento inválido.",
};

const DIA_MS = 86_400_000;
// Mesmo limiar de urgência das "Atenções" do dashboard: casamento ≤14d pesa mais.
const JANELA_URGENCIA_DIAS = 14;

// Dias até o casamento (base UTC, para casar com o dado). Negativo = já passou.
function diasAte(casamentoData: Date): number {
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((casamentoData.getTime() - hojeUTC) / DIA_MS);
}

function rotuloContagem(dias: number): string {
  if (dias === 0) return "É hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}

// Linha de dado discreta (rótulo pequeno + valor). Não renderiza se vazio.
function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</span>
      <span className="text-[14px] text-tinta">{valor}</span>
    </div>
  );
}

export default async function NoivaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; leadId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; em?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) {
    redirect(`/loja/${sc.loja.id}`);
  }

  const { lojaId, leadId } = await params;
  const { ok, erro, em } = await searchParams;

  // Leitura read-only: confirma que a noiva é da loja e traz o interesse de uma vez.
  const dados = await obterNoivaComInteresse(sc.loja.id, leadId);
  if (!dados) redirect(`/loja/${lojaId}/noivas`); // não é da loja (ou não existe)

  const lead = dados.lead;
  const i = dados.interesse;

  const [podeEditar, podeCriar, iVer, iCriar, iEditar, podeReservar, reservas, orcamentos, contratos] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"),
    listarReservasDaNoiva(sc.loja.id, leadId),
    listarOrcamentosDaNoiva(sc.loja.id, leadId),
    listarContratosDaNoiva(sc.loja.id, leadId),
  ]);
  const iMexer = iCriar || iEditar;

  const fatos = await fatosDaNoiva(sc.loja.id, leadId);
  const { passos, atual, encerrada } = estagioDaNoiva(fatos!); // lead existe → fatos != null
  const concluida = encerrada === "Devolvido"; // fim positivo (devolução): nada a desativar
  const ativa = encerrada === null; // agendar/atender só faz sentido na jornada viva

  // Indicação só faz sentido (e só roda a query) se a equipe pode ver interesses.
  const sugeridos = iVer ? await indicarVestidos(sc.loja.id, leadId) : [];
  const temInteressePreenchido = (i?.atributos.length ?? 0) > 0;

  // Para os botões "Reservar" nas sugestões: checagem ALVO (só os vestidos sugeridos),
  // barata a cada carregamento. A lista completa de livres é buscada sob demanda
  // (ReservaLivreInline), evitando varrer o acervo quando ninguém vai reservar.
  const dia = lead.casamentoData ? lead.casamentoData.toISOString().slice(0, 10) : null;
  const livresSugeridosIds =
    podeReservar && dia && sugeridos.length > 0
      ? await vestidosLivresEntre(sc.loja.id, dia, sugeridos.map((s) => s.id))
      : [];

  const editarHref = `/loja/${lojaId}/noivas/${leadId}/editar`;
  const interessesHref = `/loja/${lojaId}/noivas/${leadId}/interesses`;
  // Conflito com data conhecida diz para quando o vestido já está reservado.
  const avisoConflito =
    erro === "indisponivel" && em
      ? `Este vestido já está reservado para ${dataCurta.format(new Date(`${em}T00:00:00.000Z`))}. Escolha outra peça.`
      : null;
  const aviso = (ok && AVISOS[ok]) || avisoConflito || (erro && AVISOS[erro]) || null;

  const whatsappDigits = lead.whatsapp?.replace(/\D/g, "");
  const dias = lead.casamentoData ? diasAte(lead.casamentoData) : null;
  const mostrarContagem = dias !== null && dias >= 0; // não insistir no passado
  const urgente = mostrarContagem && dias <= JANELA_URGENCIA_DIAS;

  // Classe compartilhada dos links de ação: alvo de toque ≥44px sem deslocar layout.
  const acaoLink =
    "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline " +
    "decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta " +
    "hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-bordo";
  // Botão dos blocos de ação (Agendar / Interesses): alvo claro, bordô no hover.
  const botaoBloco =
    "inline-flex min-h-9 w-fit items-center rounded-md border border-borda px-3 text-[13px] text-tinta " +
    "transition-colors duration-150 hover:border-bordo hover:text-bordo focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-bordo";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link href={`/loja/${lojaId}/noivas`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
        ← Noivas
      </Link>

      {/* Cabeçalho do dashboard: identidade + jornada + ações principais */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[30px] font-light leading-tight tracking-tight text-tinta">
            {lead.noivaNome}
            {lead.noivoNome && <span className="text-cinza-fumo"> &amp; {lead.noivoNome}</span>}
          </h1>
          <p className="text-[14px] text-cinza-fumo">{encerrada ?? ROTULO_ESTAGIO[atual]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {podeEditar && (
            <Link href={editarHref} className={acaoLink}>Editar dados</Link>
          )}
          {concluida ? (
            <span className="text-[12px] text-cinza-fumo">Jornada concluída</span>
          ) : podeEditar ? (
            <MarcoForm action={marcarPerdidaAction} leadId={leadId} ligado={fatos!.perdidaEm !== null} rotuloLigar="Desativar" rotuloDesfazer="Reativar" />
          ) : null}
        </div>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {/* Jornada — o coração, largura total */}
      <PainelJornadaNoiva passos={passos} encerrada={encerrada} />

      {/* Grade de blocos de detalhe (2 colunas no desktop) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Agendar — vai para a tela de agenda com a noiva já selecionada */}
        {podeCriar && ativa && (
          <Bloco titulo="Agendar atendimento">
            <p className="text-[13px] text-cinza-fumo">Marque a próxima visita ao atelier — a noiva já vem selecionada.</p>
            <Link href={`/loja/${lojaId}/atendimentos/novo?noiva=${leadId}`} className={botaoBloco}>Agendar atendimento →</Link>
          </Bloco>
        )}

        {/* Interesses — bloco de ação (espelha o Agendar) */}
        {(iMexer || iVer) && (
          <Bloco titulo="Interesses">
            <p className="text-[13px] text-cinza-fumo">
              {temInteressePreenchido ? "Desejos da noiva registrados — base das sugestões de vestido." : "Ainda não preenchidos. Registre para ver os vestidos que combinam."}
            </p>
            <Link href={interessesHref} className={botaoBloco}>
              {iMexer ? (i ? "Editar interesses" : "Preencher interesses") : "Ver interesses"} →
            </Link>
          </Bloco>
        )}

        {/* O casamento */}
        {lead.casamentoData && (
          <Bloco
            titulo="O casamento"
            aside={mostrarContagem && !urgente && dias !== null ? <span className="text-[12px] text-cinza-fumo">{rotuloContagem(dias)}</span> : undefined}
          >
            {urgente && dias !== null && (
              <p className="font-display text-[26px] font-light leading-none tracking-tight text-bordo">{rotuloContagem(dias)}</p>
            )}
            <p className="font-display text-[18px] font-light leading-snug text-tinta first-letter:uppercase">{dataFmt.format(lead.casamentoData)}</p>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Dado rotulo="Horário" valor={lead.casamentoHorario} />
              <Dado rotulo="Local" valor={lead.casamentoLocal} />
            </div>
          </Bloco>
        )}

        {/* Contato */}
        {(lead.whatsapp || lead.cerimonialista) && (
          <Bloco titulo="Contato">
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              {lead.whatsapp && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">WhatsApp</span>
                  {whatsappDigits ? (
                    <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="w-fit rounded-sm text-[14px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                      {lead.whatsapp}
                    </a>
                  ) : (
                    <span className="text-[14px] text-tinta">{lead.whatsapp}</span>
                  )}
                </div>
              )}
              <Dado rotulo="Cerimonialista" valor={lead.cerimonialista} />
            </div>
          </Bloco>
        )}

        {/* Orçamentos */}
        {(orcamentos.length > 0 || podeEditar) && (
          <Bloco titulo="Orçamentos">
            {orcamentos.length === 0 ? (
              <p className="text-[13px] text-cinza-fumo">Nenhum orçamento ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda-suave">
                {orcamentos.map((o) => (
                  <li key={o.id}>
                    <Link href={`/loja/${lojaId}/orcamentos/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors duration-150 hover:text-bordo">
                      <span className="text-[13px] text-grafite">
                        {ROTULO_STATUS_ORC[o.status]} · {o.qtdItens} {o.qtdItens === 1 ? "item" : "itens"}
                      </span>
                      <span className="font-display text-[14px] font-light tabular-nums text-tinta">{brl(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && (
              <form action={criarOrcamentoAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <button type="submit" className="inline-flex min-h-9 w-fit items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                  Abrir orçamento
                </button>
              </form>
            )}
          </Bloco>
        )}

        {/* Contratos */}
        {(contratos.length > 0 || podeEditar) && (
          <Bloco titulo="Contratos">
            {contratos.length === 0 ? (
              <p className="text-[13px] text-cinza-fumo">Nenhum contrato ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda-suave">
                {contratos.map((c) => (
                  <li key={c.id}>
                    <Link href={`/loja/${lojaId}/contratos/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors duration-150 hover:text-bordo">
                      <span className={`text-[13px] ${c.status === "CANCELADO" ? "text-cinza-fumo line-through" : "text-grafite"}`}>{ROTULO_STATUS_CONTR[c.status]}</span>
                      <span className="font-display text-[14px] font-light tabular-nums text-tinta">{brl(c.valorTotal)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && contratos.length === 0 && (
              <form action={gerarContratoDaNoivaAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <button type="submit" className="inline-flex min-h-9 w-fit items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                  Gerar contrato em branco
                </button>
              </form>
            )}
          </Bloco>
        )}
      </div>

      {/* Vestido reservado — largura total (tem o reservar inline) */}
      {(reservas.length > 0 || podeReservar) && (
        <Bloco titulo="Vestido reservado">
          {reservas.length === 0 ? (
            <p className="text-[14px] text-grafite">Nenhum vestido reservado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-borda-suave">
              {reservas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <Link href={`/loja/${lojaId}/vestidos/${r.vestidoId}`} className="flex min-w-0 flex-col gap-0.5 rounded-sm transition-colors duration-150 hover:[&>span:first-child]:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                    <span className="truncate text-[14px] text-tinta transition-colors duration-150">{r.nome}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {r.codigo}
                      {r.casamentoData ? ` · casamento ${dataCurta.format(r.casamentoData)}` : ""}
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-4">
                    <Link href={`/loja/${lojaId}/reservas/${r.id}`} className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                      Provas &amp; ajustes
                    </Link>
                    {podeReservar && (
                      <form action={cancelarReservaPelaNoivaAction}>
                        <input type="hidden" name="leadId" value={leadId} />
                        <input type="hidden" name="bloqueioId" value={r.id} />
                        <BotaoConfirmar mensagem={`Cancelar a reserva de ${r.nome}?`} ariaLabel={`Cancelar reserva de ${r.nome}`} className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                          Cancelar
                        </BotaoConfirmar>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {podeReservar &&
            (!lead.casamentoData ? (
              <p className="text-[13px] text-cinza-fumo">Defina a data do casamento para reservar um vestido.</p>
            ) : (
              <ReservaLivreInline leadId={leadId} reservar={reservarPelaNoivaAction} buscarLivres={buscarVestidosLivresAction} />
            ))}
        </Bloco>
      )}

      {/* Vestidos do acervo que combinam — largura total */}
      {iVer &&
        (sugeridos.length > 0 ? (
          <VestidosSugeridos
            vestidos={sugeridos}
            naoQuerUsar={i?.naoQuerUsar}
            reserva={
              podeReservar && lead.casamentoData
                ? {
                    action: reservarPelaNoivaAction,
                    leadId,
                    livresIds: livresSugeridosIds,
                    reservadosIds: reservas.map((r) => r.vestidoId),
                    dataLabel: lead.casamentoData ? diaMes.format(lead.casamentoData) : undefined,
                  }
                : undefined
            }
          />
        ) : (
          <PainelVazio
            titulo="Vestidos para esta noiva"
            mensagem={
              temInteressePreenchido
                ? "Por enquanto nenhum vestido do acervo combina com os interesses dela. Revise os interesses ou cadastre novos modelos."
                : "Os interesses dela ainda não foram registrados. Preencha para ver os vestidos que combinam."
            }
            acao={iMexer ? { href: interessesHref, label: "Preencher interesses" } : undefined}
          />
        ))}

      <footer className="border-t border-borda-suave pt-4">
        <p className="text-[11px] text-cinza-fumo">Adicionada via {ROTULO_ORIGEM[lead.origem]}</p>
      </footer>
    </main>
  );
}

// Bloco-card do dashboard de detalhes: título discreto + acessório opcional (ex.: contagem).
function Bloco({ titulo, aside, children }: { titulo: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{titulo}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function MarcoForm({
  action,
  leadId,
  ligado,
  rotuloLigar,
  rotuloDesfazer,
}: {
  action: (fd: FormData) => Promise<void>;
  leadId: string;
  ligado: boolean;
  rotuloLigar: string;
  rotuloDesfazer: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
          decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
          hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-bordo"
      >
        {ligado ? rotuloDesfazer : rotuloLigar}
      </button>
    </form>
  );
}
