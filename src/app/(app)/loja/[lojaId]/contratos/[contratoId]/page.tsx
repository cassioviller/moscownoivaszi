// src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx
// Detalhe do contrato — dados pré-preenchidos (do orçamento aprovado), editáveis em
// ATIVO; baixar o PDF do contrato salvo; cancelar (distrato). Ver = leads:ver; editar/
// cancelar = leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterContrato } from "@/lib/contratos/contratos";
import { listarParcelasDoContrato } from "@/lib/financeiro/receber";
import { totalDoPlanoCentavos, planoDivergeDoTotal } from "@/lib/financeiro/plano";
import { brl } from "@/lib/dinheiro";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { editarContratoAction, cancelarContratoAction } from "../actions";
import {
  gerarPlanoAction,
  registrarRecebimentoAction,
  estornarRecebimentoAction,
  removerParcelaAction,
} from "../../financeiro/receber/actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  salvo: "Contrato salvo.",
  cancelado: "Contrato cancelado.",
  nao_ativo: "Contrato cancelado — não pode mais ser editado.",
  valor_invalido: "Valor inválido.",
  data_invalida: "Data inválida.",
  contrato_invalido: "Contrato inválido.",
  plano: "Plano de pagamento gerado.",
  parcela: "Parcela adicionada.",
  parcela_removida: "Parcela removida.",
  recebido: "Recebimento registrado.",
  estornado: "Recebimento estornado.",
  ja_tem_plano: "Este contrato já tem um plano de pagamento.",
  entrada_maior: "A entrada não pode ser maior que o total.",
  num_invalido: "Número de parcelas inválido (1 a 360).",
  nao_previsto: "Esta parcela não está em aberto.",
  contrato_nao_ativo: "Contrato cancelado — sem movimentação de parcelas.",
  parcela_invalida: "Parcela inválida.",
  nao_pago: "Este recebimento não está pago — nada a estornar.",
};

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[15px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel " +
  "transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-bordo";

function Campo({ name, label, defaultValue, type = "text", placeholder }: { name: string; label: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className={rotulo}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={campo} aria-label={label} />
    </label>
  );
}

export default async function ContratoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; contratoId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId, contratoId } = await params;
  const { ok, erro } = await searchParams;
  const c = await obterContrato(sc.loja.id, contratoId);
  if (!c) redirect(`/loja/${lojaId}/contratos`);

  const parcelas = await listarParcelasDoContrato(sc.loja.id, contratoId);
  const voltar = `/loja/${lojaId}/contratos/${contratoId}`;
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;
  const podeMexer = podeEditar && c.editavel;
  const ymdFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
  const valoresParcelas = parcelas.map((p) => p.valorPrevisto);
  const totalPlano = totalDoPlanoCentavos(valoresParcelas);
  const planoDivergente = planoDivergeDoTotal(c.valorTotal, valoresParcelas);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/contratos`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← Contratos
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-[26px] font-light leading-tight tracking-tight text-tinta">
            Contrato de{" "}
            <Link href={`/loja/${lojaId}/noivas/${c.leadId}`} className="hover:text-bordo">
              {c.noivaNome ?? "Noiva"}
            </Link>
          </h1>
          <span className="inline-flex min-h-7 items-center rounded-full border border-borda-suave bg-papel px-3 py-0.5 text-[12px] text-grafite">
            {c.status === "ATIVO" ? "Ativo" : "Cancelado"}
          </span>
        </div>
        <p className="text-[13px] text-cinza-fumo">
          Vendedora: {c.vendedoraNome} · Total {brl(c.valorTotal)}
        </p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <div className="flex flex-wrap gap-3">
        <Link href={`/loja/${lojaId}/contratos/${c.id}/pdf`} className={botaoPrincipal} prefetch={false}>
          Baixar contrato em PDF
        </Link>
        {c.orcamentoId && (
          <Link href={`/loja/${lojaId}/orcamentos/${c.orcamentoId}`} className={botaoSuave}>
            Ver orçamento de origem
          </Link>
        )}
      </div>

      {podeMexer ? (
        <form action={editarContratoAction} className="flex flex-col gap-6">
          <input type="hidden" name="contratoId" value={c.id} />
          <section className="flex flex-col gap-3">
            <h2 className={rotulo}>Noiva &amp; vestido</h2>
            <Campo name="cpf" label="CPF" defaultValue={c.cpf ?? ""} placeholder="000.000.000-00" />
            <Campo name="vestidoDescricao" label="Vestido" defaultValue={c.vestidoDescricao ?? ""} placeholder="Coleção — código" />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className={rotulo}>Valores e pagamento</h2>
            <div className="flex flex-wrap gap-3">
              <Campo name="valorTotal" label="Valor total" defaultValue={c.valorTotal} placeholder="0,00" />
              <Campo name="entrada" label="Entrada / Sinal" defaultValue={c.entrada ?? ""} placeholder="0,00" />
            </div>
            <Campo name="formaPagamento" label="Forma de pagamento" defaultValue={c.formaPagamento ?? ""} placeholder="Ex.: 50% sinal + 2x" />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className={rotulo}>Datas</h2>
            <div className="flex flex-wrap gap-3">
              <Campo name="dataCasamento" label="Casamento" type="date" defaultValue={ymd(c.dataCasamento)} />
              <Campo name="dataRetirada" label="Retirada" type="date" defaultValue={ymd(c.dataRetirada)} />
              <Campo name="dataDevolucao" label="Devolução" type="date" defaultValue={ymd(c.dataDevolucao)} />
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <span className={rotulo}>Observações</span>
            <textarea name="observacoes" rows={3} defaultValue={c.observacoes ?? ""} className={campo} aria-label="Observações" />
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={botaoPrincipal}>Salvar contrato</button>
          </div>
        </form>
      ) : (
        // Read-only (cancelado ou sem permissão de editar)
        <dl className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4 text-[14px]">
          {c.cpf && <Linha rotulo="CPF" valor={c.cpf} />}
          {c.vestidoDescricao && <Linha rotulo="Vestido" valor={c.vestidoDescricao} />}
          <Linha rotulo="Valor total" valor={brl(c.valorTotal)} />
          {c.entrada && <Linha rotulo="Entrada" valor={brl(c.entrada)} />}
          {c.formaPagamento && <Linha rotulo="Pagamento" valor={c.formaPagamento} />}
          {c.observacoes && <Linha rotulo="Observações" valor={c.observacoes} />}
        </dl>
      )}

      {/* Plano de pagamento (contas a receber) */}
      <section className="flex flex-col gap-3 border-t border-borda-suave pt-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={rotulo}>Plano de pagamento</h2>
          <Link href={`/loja/${lojaId}/financeiro/receber`} className={botaoSuave}>Contas a receber</Link>
        </div>

        {parcelas.length === 0 ? (
          podeMexer ? (
            <form action={gerarPlanoAction} className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel p-4">
              <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Gerar plano</span>
              <input type="hidden" name="contratoId" value={c.id} />
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>Entrada</span>
                  <input name="entrada" placeholder="0,00" aria-label="Entrada" className={`${campo} w-28`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>Parcelas</span>
                  <input name="numParcelas" type="number" min={1} defaultValue={1} aria-label="Número de parcelas" className={`${campo} w-20`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>1º vencimento</span>
                  <input name="primeiroVencimento" type="date" required aria-label="Primeiro vencimento" className={campo} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>A cada (dias)</span>
                  <input name="periodicidadeDias" type="number" min={1} defaultValue={30} aria-label="Periodicidade em dias" className={`${campo} w-20`} />
                </label>
                <button type="submit" className={botaoPrincipal}>Gerar</button>
              </div>
            </form>
          ) : (
            <p className="text-[14px] text-grafite">Nenhum plano de pagamento ainda.</p>
          )
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {parcelas.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-tinta">
                    {p.descricao ?? "Parcela"}{" "}
                    <span className="text-[12px] text-cinza-fumo">
                      · vence {ymdFmt.format(p.vencimento)}
                      {p.status === "PAGA" ? " · paga" : p.atrasada ? " · atrasada" : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 font-display text-[14px] font-light tabular-nums ${p.atrasada ? "text-bordo" : "text-tinta"}`}>
                    {brl(p.valorPrevisto)}
                  </span>
                </div>
                {podeMexer && p.status === "PREVISTA" && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-borda-suave pt-2">
                    <form action={registrarRecebimentoAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="parcelaId" value={p.id} />
                      <input type="hidden" name="voltar" value={voltar} />
                      <input name="valor" defaultValue={p.valorPrevisto} aria-label="Valor recebido" className={`${campo} w-24`} />
                      <input name="forma" placeholder="Forma" aria-label="Forma" className={`${campo} w-28`} />
                      <button type="submit" className={botaoSuave}>Receber</button>
                    </form>
                    <form action={removerParcelaAction}>
                      <input type="hidden" name="parcelaId" value={p.id} />
                      <input type="hidden" name="contratoId" value={c.id} />
                      <button type="submit" className={botaoSuave}>Remover</button>
                    </form>
                  </div>
                )}
                {podeEditar && p.status === "PAGA" && (
                  <form action={estornarRecebimentoAction} className="border-t border-borda-suave pt-2">
                    <input type="hidden" name="parcelaId" value={p.id} />
                    <input type="hidden" name="voltar" value={voltar} />
                    <button type="submit" className={botaoSuave}>Estornar</button>
                  </form>
                )}
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <span className="text-[12px] uppercase tracking-[0.18em] text-cinza-fumo">
                Total do plano
                {planoDivergente && <span className="ml-2 normal-case tracking-normal text-bordo">difere do total do contrato</span>}
              </span>
              <span className={`font-display text-[15px] font-light tabular-nums ${planoDivergente ? "text-bordo" : "text-tinta"}`}>
                {brl((totalPlano / 100).toFixed(2))}
              </span>
            </li>
          </ul>
        )}
      </section>

      {podeEditar && c.status === "ATIVO" && (
        <form action={cancelarContratoAction} className="border-t border-borda-suave pt-5">
          <input type="hidden" name="contratoId" value={c.id} />
          <BotaoConfirmar mensagem="Cancelar este contrato (distrato)?" ariaLabel="Cancelar contrato" className={botaoSuave}>
            Cancelar contrato
          </BotaoConfirmar>
        </form>
      )}
    </main>
  );
}

function Linha({ rotulo: r, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-cinza-fumo">{r}</dt>
      <dd className="text-tinta">{valor}</dd>
    </div>
  );
}
