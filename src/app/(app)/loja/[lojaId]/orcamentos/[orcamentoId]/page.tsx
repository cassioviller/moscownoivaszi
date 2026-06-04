// src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx
// Detalhe do orçamento — itens, desconto negociado, total e o ciclo de status. Em
// RASCUNHO/ENVIADO é editável; ao APROVAR (base do contrato) ou RECUSAR vira read-only.
// Ver = leads:ver; mutar = leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterOrcamento } from "@/lib/orcamentos/orcamentos";
import { brl } from "@/lib/dinheiro";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import type { OrcamentoItemTipo, OrcamentoStatus } from "@/generated/prisma/client";
import {
  adicionarItemAction,
  editarItemAction,
  removerItemAction,
  definirDescontoAction,
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
const ROTULO_TIPO: Record<OrcamentoItemTipo, string> = {
  VESTIDO: "Vestido",
  SERVICO: "Serviço",
  AJUSTE: "Ajuste",
};
const TIPOS: OrcamentoItemTipo[] = ["VESTIDO", "SERVICO", "AJUSTE"];

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/orcamentos`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← Orçamentos
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-[26px] font-light leading-tight tracking-tight text-tinta">
            Orçamento de{" "}
            {orc.leadId ? (
              <Link href={`/loja/${lojaId}/noivas/${orc.leadId}`} className="hover:text-bordo">
                {orc.noivaNome ?? "Noiva"}
              </Link>
            ) : (
              (orc.noivaNome ?? "Noiva")
            )}
          </h1>
          <span className="inline-flex min-h-7 items-center rounded-full border border-borda-suave bg-papel px-3 py-0.5 text-[12px] text-grafite">
            {ROTULO_STATUS[orc.status]}
          </span>
        </div>
        <p className="text-[13px] text-cinza-fumo">Vendedora: {orc.vendedoraNome}</p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {/* Itens */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Itens</h2>
        {orc.itens.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhum item ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {orc.itens.map((it) => (
              <li key={it.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px] text-tinta">{it.descricao}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {ROTULO_TIPO[it.tipo]} · {brl(it.valorUnitario)} × {it.quantidade}
                    </span>
                  </div>
                  <span className="shrink-0 font-display text-[15px] font-light tabular-nums text-tinta">{brl(it.subtotal)}</span>
                </div>
                {podeMexer && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-borda-suave pt-2">
                    <form action={editarItemAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="orcamentoId" value={orc.id} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <input name="descricao" defaultValue={it.descricao} aria-label="Descrição" className={`${inputBase} min-w-[10rem] flex-1`} />
                      <input name="valorUnitario" defaultValue={it.valorUnitario} aria-label="Valor unitário" className={`${inputBase} w-28`} />
                      <input name="quantidade" type="number" min={1} defaultValue={it.quantidade} aria-label="Quantidade" className={`${inputBase} w-20`} />
                      <button type="submit" className={botaoSuave}>Salvar</button>
                    </form>
                    <form action={removerItemAction}>
                      <input type="hidden" name="orcamentoId" value={orc.id} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <BotaoConfirmar mensagem={`Remover "${it.descricao}"?`} ariaLabel="Remover item" className={botaoSuave}>
                        Remover
                      </BotaoConfirmar>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeMexer && (
          <form action={adicionarItemAction} className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel p-4">
            <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Adicionar item</span>
            <input type="hidden" name="orcamentoId" value={orc.id} />
            <div className="flex flex-wrap items-end gap-2">
              <select name="tipo" defaultValue="VESTIDO" aria-label="Tipo do item" className={inputBase}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                ))}
              </select>
              <input name="descricao" placeholder="Descrição (ex.: Vestido Valentina)" aria-label="Descrição" className={`${inputBase} min-w-[12rem] flex-1`} required />
              <input name="valorUnitario" placeholder="0,00" aria-label="Valor unitário" className={`${inputBase} w-28`} required />
              <input name="quantidade" type="number" min={1} defaultValue={1} aria-label="Quantidade" className={`${inputBase} w-20`} />
              <button type="submit" className={botaoPrincipal}>Adicionar</button>
            </div>
          </form>
        )}
      </section>

      {/* Totais + desconto */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Valores</h2>
        <div className="flex flex-col gap-1.5 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
          <div className="flex justify-between text-[14px] text-grafite">
            <span>Subtotal</span>
            <span className="tabular-nums">{brl(orc.totais.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[14px] text-grafite">
            <span>Desconto{orc.descontoTipo === "PERCENTUAL" ? ` (${Number(orc.descontoValor)}%)` : ""}</span>
            <span className="tabular-nums">− {brl(orc.totais.desconto)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-borda-suave pt-2 text-[16px] text-tinta">
            <span>Total</span>
            <span className="font-display font-light tabular-nums text-bordo">{brl(orc.totais.total)}</span>
          </div>
        </div>

        {podeMexer && (
          <form action={definirDescontoAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orcamentoId" value={orc.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Desconto</span>
              <select name="tipo" defaultValue={orc.descontoTipo ?? "PERCENTUAL"} aria-label="Tipo do desconto" className={inputBase}>
                <option value="PERCENTUAL">Percentual (%)</option>
                <option value="VALOR">Valor (R$)</option>
              </select>
            </label>
            <input name="valor" placeholder="0" defaultValue={orc.descontoValor ?? ""} aria-label="Valor do desconto" className={`${inputBase} w-28`} />
            <button type="submit" className={botaoSuave}>Aplicar desconto</button>
          </form>
        )}
      </section>

      {/* Aprovado → contrato */}
      {orc.status === "APROVADO" && (
        <section className="flex flex-wrap items-center gap-3 border-t border-borda-suave pt-5">
          {orc.contratoId ? (
            <Link href={`/loja/${lojaId}/contratos/${orc.contratoId}`} className={botaoPrincipal}>
              Ver contrato
            </Link>
          ) : (
            podeEditar && (
              <form action={gerarContratoDeOrcamentoAction}>
                <input type="hidden" name="orcamentoId" value={orc.id} />
                <button type="submit" className={botaoPrincipal}>
                  Gerar contrato
                </button>
              </form>
            )
          )}
          <span className="text-[12px] text-cinza-fumo">Orçamento aprovado — pronto para virar contrato.</span>
        </section>
      )}

      {/* Status */}
      {podeEditar && (orc.status === "RASCUNHO" || orc.status === "ENVIADO") && (
        <section className="flex flex-wrap items-center gap-2 border-t border-borda-suave pt-5">
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
            <button type="submit" className={botaoSuave}>Recusado</button>
          </form>
          <form action={mudarStatusAction}>
            <input type="hidden" name="orcamentoId" value={orc.id} />
            <input type="hidden" name="status" value="APROVADO" />
            <button type="submit" className={botaoPrincipal}>Aprovar</button>
          </form>
        </section>
      )}
    </main>
  );
}
