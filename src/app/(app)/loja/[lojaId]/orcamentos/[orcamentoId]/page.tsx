// src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx
// Detalhe do orçamento — itens, desconto negociado, total e o ciclo de status. Em
// RASCUNHO/ENVIADO é editável; ao APROVAR (base do contrato) ou RECUSAR vira read-only.
// Ver = leads:ver; mutar = leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterOrcamento } from "@/lib/orcamentos/orcamentos";
import { indicarVestidos } from "@/lib/indicacao/indicacao";
import { brl } from "@/lib/dinheiro";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import type { OrcamentoStatus } from "@/generated/prisma/client";
import {
  adicionarItemAction,
  editarItemAction,
  removerItemAction,
  mudarStatusAction,
} from "../actions";
import { gerarContratoDeOrcamentoAction } from "../../contratos/actions";

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<OrcamentoStatus, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};
const AVISOS: Record<string, string> = {
  item: "Item atualizado.",
  item_removido: "Item removido.",
  desconto: "Desconto atualizado.",
  status: "Status atualizado.",
  nao_editavel: "Este orçamento não pode mais ser editado.",
  valor_invalido: "Valor inválido.",
  sem_descricao: "Descreva o item.",
  tipo_invalido: "Escolha o tipo do item.",
  vestido_invalido: "Vestido inválido.",
  desconto_invalido: "Desconto inválido (percentual de 0 a 100).",
  transicao_invalida: "Essa mudança de status não é possível.",
  orcamento_vazio: "Adicione ao menos um item antes de aprovar.",
  orcamento_invalido: "Orçamento inválido.",
  ja_tem_contrato: "Este orçamento já gerou um contrato.",
  nao_aprovado: "Aprove o orçamento antes de gerar o contrato.",
};

const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel " +
  "transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-bordo";

export default async function OrcamentoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; orcamentoId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId, orcamentoId } = await params;
  const { ok, erro } = await searchParams;
  const orc = await obterOrcamento(sc.loja.id, orcamentoId);
  if (!orc) redirect(`/loja/${lojaId}/orcamentos`);

  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;
  const podeMexer = podeEditar && orc.editavel;

  // Vestidos indicados para a noiva (a mesma indicação que antes vivia no perfil) —
  // é a partir deles que se escolhe a peça e o valor combinado no atendimento.
  const sugeridos = orc.leadId ? await indicarVestidos(sc.loja.id, orc.leadId) : [];
  const adicionadosIds = new Set(orc.itens.map((it) => it.vestidoId).filter((x): x is string => !!x));

  const STATUS_CLASSE: Record<OrcamentoStatus, string> = {
    RASCUNHO: "border-borda-suave bg-papel text-grafite",
    ENVIADO: "border-champagne/60 bg-papel text-bordo",
    APROVADO: "border-champagne bg-champagne/10 text-grafite",
    RECUSADO: "border-borda bg-papel text-cinza-fumo",
  };

  const interessesHref = orc.leadId ? `/loja/${lojaId}/noivas/${orc.leadId}/interesses` : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Link
        href={orc.leadId ? `/loja/${lojaId}/noivas/${orc.leadId}` : `/loja/${lojaId}/orcamentos`}
        className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
      >
        ← {orc.noivaNome ?? "Noivas"}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[26px] font-light leading-tight tracking-tight text-tinta">
            Atendimento de {orc.noivaNome ?? "Noiva"}
          </h1>
          <p className="text-[13px] text-cinza-fumo">Vendedora: {orc.vendedoraNome}</p>
        </div>
        <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-0.5 text-[12px] ${STATUS_CLASSE[orc.status]}`}>
          {ROTULO_STATUS[orc.status]}
        </span>
      </header>

      {aviso && <AvisoFlash tom={ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {/* Vestidos escolhidos — o que ficou do atendimento: peça + valor combinado */}
      <section className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Vestidos escolhidos</h2>
          {podeMexer && orc.itens.length > 0 && <span className="text-[11px] text-cinza-fumo">clique para ajustar o valor</span>}
        </div>

        {orc.itens.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nenhum vestido escolhido ainda. Adicione a partir dos indicados, abaixo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave">
              {orc.itens.map((it) => {
                const Linha = (
                  <>
                    <span className="min-w-0 truncate text-[15px] text-tinta">{it.descricao}</span>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
                      {it.valorPadrao != null && (
                        <span className="text-[11px] text-cinza-fumo">padrão {brl(it.valorPadrao)}</span>
                      )}
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-cinza-fumo">orçado</span>
                        <span className="font-display text-[16px] font-light tabular-nums text-bordo">{brl(it.valorUnitario)}</span>
                      </span>
                    </div>
                  </>
                );
                return (
                  <li key={it.id}>
                    {podeMexer ? (
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 marker:content-[''] hover:[&_span:first-child]:text-bordo">
                          {Linha}
                          <span aria-hidden className="shrink-0 text-cinza-fumo transition-transform duration-150 group-open:rotate-180">▾</span>
                        </summary>
                        <div className="flex flex-wrap items-end gap-2 border-t border-borda-suave pb-3 pt-3">
                          <form action={editarItemAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="orcamentoId" value={orc.id} />
                            <input type="hidden" name="itemId" value={it.id} />
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Valor orçado</span>
                              <input name="valorUnitario" defaultValue={it.valorUnitario} aria-label="Valor orçado" className={`${inputBase} w-32`} />
                            </label>
                            <button type="submit" className={botaoSuave}>Salvar</button>
                          </form>
                          <form action={removerItemAction}>
                            <input type="hidden" name="orcamentoId" value={orc.id} />
                            <input type="hidden" name="itemId" value={it.id} />
                            <BotaoConfirmar mensagem={`Remover "${it.descricao}"?`} ariaLabel="Remover vestido" className={botaoSuave}>Remover</BotaoConfirmar>
                          </form>
                        </div>
                      </details>
                    ) : (
                      <div className="flex items-center justify-between gap-3 py-3">{Linha}</div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Vestidos indicados — escolher a peça e registrar o valor combinado */}
      {podeMexer && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Vestidos indicados</h2>
          {sugeridos.length === 0 ? (
            <p className="text-[14px] text-cinza-fumo">
              Sem vestidos indicados — registre os interesses da noiva para ver sugestões.{" "}
              {interessesHref && <Link href={interessesHref} className="text-bordo underline decoration-borda underline-offset-2">Interesses</Link>}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sugeridos.map((v) => {
                const jaAdd = adicionadosIds.has(v.id);
                return (
                  <article key={v.id} className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-display text-[17px] font-light tracking-tight text-tinta">{v.nome}</span>
                        <span className="text-[12px] text-cinza-fumo">{v.codigo} · padrão R$ {v.precoBase}</span>
                      </div>
                      <span className="shrink-0 rounded-full border border-champagne/60 px-2.5 py-1 text-[11px] text-bordo">
                        {v.pontos}/{v.total}
                      </span>
                    </div>
                    {jaAdd ? (
                      <p className="border-t border-borda-suave pt-3 text-[12px] text-cinza-fumo">✓ Já escolhido neste atendimento</p>
                    ) : (
                      <form action={adicionarItemAction} className="flex flex-wrap items-end gap-2 border-t border-borda-suave pt-3">
                        <input type="hidden" name="orcamentoId" value={orc.id} />
                        <input type="hidden" name="tipo" value="VESTIDO" />
                        <input type="hidden" name="vestidoId" value={v.id} />
                        <input type="hidden" name="descricao" value={v.nome} />
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Valor orçado</span>
                          <input name="valorUnitario" defaultValue={v.precoBase} aria-label={`Valor orçado de ${v.nome}`} className={`${inputBase} w-32`} required />
                        </label>
                        <button type="submit" className={botaoPrincipal}>Adicionar</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Ações de status / contrato — o ciclo do atendimento */}
      {(orc.status === "APROVADO" || (podeEditar && (orc.status === "RASCUNHO" || orc.status === "ENVIADO"))) && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
          {orc.status === "APROVADO" ? (
            <>
              <span className="text-[13px] text-grafite">Aprovado — pronto para virar contrato.</span>
              {orc.contratoId ? (
                <Link href={`/loja/${lojaId}/contratos/${orc.contratoId}`} className={botaoPrincipal}>Ver contrato</Link>
              ) : (
                podeEditar && (
                  <form action={gerarContratoDeOrcamentoAction}>
                    <input type="hidden" name="orcamentoId" value={orc.id} />
                    <button type="submit" className={botaoPrincipal}>Gerar contrato</button>
                  </form>
                )
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {orc.status === "RASCUNHO" && (
                  <form action={mudarStatusAction}>
                    <input type="hidden" name="orcamentoId" value={orc.id} />
                    <input type="hidden" name="status" value="ENVIADO" />
                    <button type="submit" className={botaoSuave}>Marcar como enviado</button>
                  </form>
                )}
                {orc.status === "ENVIADO" && (
                  <form action={mudarStatusAction}>
                    <input type="hidden" name="orcamentoId" value={orc.id} />
                    <input type="hidden" name="status" value="RASCUNHO" />
                    <button type="submit" className={botaoSuave}>Voltar para rascunho</button>
                  </form>
                )}
                <form action={mudarStatusAction}>
                  <input type="hidden" name="orcamentoId" value={orc.id} />
                  <input type="hidden" name="status" value="RECUSADO" />
                  <BotaoConfirmar mensagem="Marcar este orçamento como recusado?" className={botaoSuave}>Recusado</BotaoConfirmar>
                </form>
              </div>
              <form action={mudarStatusAction}>
                <input type="hidden" name="orcamentoId" value={orc.id} />
                <input type="hidden" name="status" value="APROVADO" />
                <button type="submit" className={botaoPrincipal}>Aprovar</button>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}
