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

  const [podeEditar, iVer, iCriar, iEditar, podeReservar, reservas, orcamentos, contratos] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link
          href={`/loja/${lojaId}/noivas`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Noivas
        </Link>
        {/* Nome em destaque editorial: é a história dela, não um item de lista */}
        <h1 className="font-display text-[30px] font-light leading-tight tracking-tight text-tinta">
          {lead.noivaNome}
          {lead.noivoNome && <span className="text-cinza-fumo"> &amp; {lead.noivoNome}</span>}
        </h1>
        {/* Subtítulo carrega só a jornada (informação quente). Origem é metadado, vai pro rodapé. */}
        <p className="text-[14px] text-cinza-fumo">{encerrada ?? ROTULO_ESTAGIO[atual]}</p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <PainelJornadaNoiva passos={passos} encerrada={encerrada} />

      {podeEditar && (
        <section className="flex flex-wrap gap-3">
          <MarcoForm
            action={marcarPerdidaAction}
            leadId={leadId}
            ligado={fatos!.perdidaEm !== null}
            rotuloLigar="Marcar como perdida"
            rotuloDesfazer="Reativar noiva"
          />
        </section>
      )}

      {/* Orçamentos — a negociação registrada (substitui o marco manual de orçamento) */}
      {(orcamentos.length > 0 || podeEditar) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Orçamentos</h2>
          {orcamentos.length > 0 && (
            <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
              {orcamentos.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/loja/${lojaId}/orcamentos/${o.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-rose-dust/10"
                  >
                    <span className="text-[13px] text-grafite">
                      {ROTULO_STATUS_ORC[o.status]} · {o.qtdItens} {o.qtdItens === 1 ? "item" : "itens"}
                    </span>
                    <span className="font-display text-[14px] font-light tabular-nums text-tinta">
                      {brl(o.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {podeEditar && (
            <form action={criarOrcamentoAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <button
                type="submit"
                className="inline-flex min-h-11 w-fit items-center rounded-sm text-[13px] text-grafite underline
                  decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo
                  hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                Abrir orçamento
              </button>
            </form>
          )}
        </section>
      )}

      {/* Contratos — a venda firmada (substitui o marco manual de contrato) */}
      {(contratos.length > 0 || podeEditar) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Contratos</h2>
          {contratos.length > 0 && (
            <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
              {contratos.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/loja/${lojaId}/contratos/${c.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-rose-dust/10"
                  >
                    <span className={`text-[13px] ${c.status === "CANCELADO" ? "text-cinza-fumo line-through" : "text-grafite"}`}>
                      {ROTULO_STATUS_CONTR[c.status]}
                    </span>
                    <span className="font-display text-[14px] font-light tabular-nums text-tinta">{brl(c.valorTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {podeEditar && contratos.length === 0 && (
            <form action={gerarContratoDaNoivaAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <button
                type="submit"
                className="inline-flex min-h-11 w-fit items-center rounded-sm text-[13px] text-grafite underline
                  decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo
                  hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                Gerar contrato em branco
              </button>
            </form>
          )}
        </section>
      )}

      {/* A noiva — bloco leve; só aparece se houver algum contato registrado */}
      {(lead.whatsapp || lead.cerimonialista) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">A noiva</h2>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {lead.whatsapp && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                  WhatsApp
                </span>
                {whatsappDigits ? (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit rounded-sm text-[14px] text-grafite underline decoration-borda
                      underline-offset-4 transition-colors duration-150 hover:text-tinta
                      hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                      focus-visible:outline-bordo"
                  >
                    {lead.whatsapp}
                  </a>
                ) : (
                  <span className="text-[14px] text-tinta">{lead.whatsapp}</span>
                )}
              </div>
            )}
            <Dado rotulo="Cerimonialista" valor={lead.cerimonialista} />
          </div>
        </section>
      )}

      {/* O casamento — bloco leve; só aparece se houver data marcada */}
      {lead.casamentoData && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">O casamento</h2>
            {/* Contagem distante: discreta. Próxima (≤14d): vira o foco, em bordô (§6). */}
            {mostrarContagem && !urgente && dias !== null && (
              <span className="text-[12px] text-cinza-fumo">{rotuloContagem(dias)}</span>
            )}
          </div>
          {urgente && dias !== null && (
            <p className="font-display text-[28px] font-light leading-none tracking-tight text-bordo">
              {rotuloContagem(dias)}
            </p>
          )}
          <p className="font-display text-[20px] font-light leading-snug text-tinta first-letter:uppercase">
            {dataFmt.format(lead.casamentoData)}
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Dado rotulo="Horário" valor={lead.casamentoHorario} />
            <Dado rotulo="Local" valor={lead.casamentoLocal} />
          </div>
        </section>
      )}

      {/* Vestido reservado — fecha o ciclo jornada↔acervo pelo lado da noiva.
          A reserva se ancora na data do casamento dela; o motor barra conflito. */}
      {(reservas.length > 0 || podeReservar) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Vestido reservado</h2>

          {reservas.length === 0 ? (
            <p className="text-[14px] text-grafite">Nenhum vestido reservado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
              {reservas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <Link
                    href={`/loja/${lojaId}/vestidos/${r.vestidoId}`}
                    className="flex min-w-0 flex-col gap-0.5 rounded-sm transition-colors duration-150
                      hover:[&>span:first-child]:text-bordo focus-visible:outline-2
                      focus-visible:outline-offset-2 focus-visible:outline-bordo"
                  >
                    <span className="truncate text-[14px] text-tinta transition-colors duration-150">
                      {r.nome}
                    </span>
                    <span className="text-[12px] text-cinza-fumo">
                      {r.codigo}
                      {r.casamentoData ? ` · casamento ${dataCurta.format(r.casamentoData)}` : ""}
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-4">
                  <Link
                    href={`/loja/${lojaId}/reservas/${r.id}`}
                    className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4
                      transition-colors duration-150 hover:text-bordo hover:decoration-champagne
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                  >
                    Provas &amp; ajustes
                  </Link>
                  {podeReservar && (
                    <form action={cancelarReservaPelaNoivaAction}>
                      <input type="hidden" name="leadId" value={leadId} />
                      <input type="hidden" name="bloqueioId" value={r.id} />
                      <BotaoConfirmar
                        mensagem={`Cancelar a reserva de ${r.nome}?`}
                        ariaLabel={`Cancelar reserva de ${r.nome}`}
                        className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite
                          underline decoration-borda underline-offset-4 transition-colors duration-150
                          hover:text-tinta hover:decoration-champagne focus-visible:outline-2
                          focus-visible:outline-offset-2 focus-visible:outline-bordo"
                      >
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
              <p className="text-[13px] text-cinza-fumo">
                Defina a data do casamento para reservar um vestido.
              </p>
            ) : (
              <ReservaLivreInline
                leadId={leadId}
                reservar={reservarPelaNoivaAction}
                buscarLivres={buscarVestidosLivresAction}
              />
            ))}
        </section>
      )}

      {/* Vestidos do acervo que combinam — só com permissão de ver interesses.
          Vazio não some em silêncio: chama para preencher (o momento mais acionável). */}
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

      {/* Rodapé: ações (alvos de toque ≥44px) + origem como metadado discreto */}
      <footer className="flex flex-col gap-3 border-t border-borda-suave pt-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          {podeEditar && (
            <Link href={editarHref} className={acaoLink}>
              Editar dados
            </Link>
          )}
          {(iMexer || iVer) && (
            <Link href={interessesHref} className={acaoLink}>
              {iMexer ? (i ? "Editar interesses" : "Preencher interesses") : "Ver interesses"}
            </Link>
          )}
        </div>
        <p className="text-[11px] text-cinza-fumo">Adicionada via {ROTULO_ORIGEM[lead.origem]}</p>
      </footer>
    </main>
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
