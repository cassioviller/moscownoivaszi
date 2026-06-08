// src/app/(app)/loja/[lojaId]/financeiro/receber/page.tsx
// Contas a receber — a carteira da loja: o que entra das noivas. Resumo (a receber ·
// recebido · em atraso), filtro e baixa inline. Atraso em bordô (atenção). O plano de
// parcelas nasce no detalhe do contrato. Gate ver=financeiro:ver, mutar=financeiro:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarContasAReceber, resumoReceber, type FiltroReceber } from "@/lib/financeiro/receber";
import { lerFiltroFinanceiro } from "@/lib/financeiro/intervalo-params";
import { TAMANHO_PAGINA } from "@/lib/paginacao";
import { Paginacao } from "@/components/Paginacao";
import { inputBase, botaoSuave, botaoLinha, brl, dataFmt, Card, FiltroIntervalo, AvisoFlash } from "../ui";
import { registrarRecebimentoAction, estornarRecebimentoAction } from "./actions";

export const dynamic = "force-dynamic";

const FILTROS: { chave: FiltroReceber; rotulo: string }[] = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "recebidas", rotulo: "Recebidas" },
  { chave: "todas", rotulo: "Todas" },
];
const AVISOS: Record<string, string> = {
  recebido: "Recebimento registrado.",
  estornado: "Recebimento estornado.",
  parcela_invalida: "Parcela inválida.",
  nao_previsto: "Esta parcela não está em aberto.",
  nao_pago: "Este recebimento não está pago — nada a estornar.",
  valor_invalido: "Valor inválido.",
  data_invalida: "Data inválida.",
  contrato_nao_ativo: "Contrato cancelado — sem movimentação de parcelas.",
};

export default async function ReceberPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ filtro?: string; ini?: string; fim?: string; ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const sp = await searchParams;
  const { filtro: filtroRaw, ok, erro } = sp;
  const filtro = (FILTROS.find((f) => f.chave === filtroRaw)?.chave ?? "abertas") as FiltroReceber;
  const { intervalo, pagina, qs } = lerFiltroFinanceiro(sp);
  const janela = { gte: intervalo.gte, lt: intervalo.lt };
  const voltar = `/loja/${lojaId}/financeiro/receber?${qs({ filtro })}`;

  const [resumo, { itens: lista, total }] = await Promise.all([
    resumoReceber(sc.loja.id, { intervalo: janela }),
    listarContasAReceber(sc.loja.id, { filtro, intervalo: janela, pagina }),
  ]);
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Contas a receber</h1>
        <p className="text-[14px] text-cinza-fumo">O que entra das noivas, por contrato.</p>
      </header>

      <FiltroIntervalo iniYMD={intervalo.iniYMD} fimYMD={intervalo.fimYMD} hidden={{ filtro }} />

      <section className="flex flex-wrap gap-3">
        <Card rotulo="A receber" valor={resumo.totalAReceber} />
        <Card rotulo="Recebido" valor={resumo.recebidoTotal} />
        <Card rotulo="Em atraso" valor={resumo.emAtraso} destaque />
      </section>

      {aviso && <AvisoFlash tom={ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      <nav className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = f.chave === filtro;
          return (
            <Link
              key={f.chave}
              href={`/loja/${lojaId}/financeiro/receber?${qs({ filtro: f.chave })}`}
              className={[
                "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors duration-150",
                ativo ? "border-bordo bg-bordo/5 text-bordo" : "border-borda-suave bg-papel text-grafite hover:border-cinza-fumo hover:text-tinta",
              ].join(" ")}
            >
              {f.rotulo}
            </Link>
          );
        })}
      </nav>

      {lista.length === 0 ? (
        <p className="text-[15px] text-tinta">Nada por aqui neste filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <Link href={`/loja/${lojaId}/noivas/${p.leadId}`} className="w-fit text-[15px] text-tinta transition-colors duration-150 hover:text-bordo">
                    {p.noivaNome ?? "Noiva"}
                  </Link>
                  <span className="text-[12px] text-cinza-fumo">
                    {p.descricao ?? "Parcela"} · vence {dataFmt.format(p.vencimento)}
                    {p.atrasada ? " · atrasada" : ""} ·{" "}
                    <Link href={`/loja/${lojaId}/contratos/${p.contratoId}`} className="underline decoration-borda underline-offset-2 hover:text-bordo">
                      contrato
                    </Link>
                  </span>
                </div>
                <span className={`shrink-0 font-display text-[15px] font-light tabular-nums ${p.atrasada ? "text-bordo" : "text-tinta"}`}>
                  {brl(p.valorPrevisto)}
                </span>
              </div>

              {podeEditar && p.status === "PREVISTA" && (
                <form action={registrarRecebimentoAction} className="flex flex-wrap items-end gap-2 border-t border-borda-suave pt-2">
                  <input type="hidden" name="parcelaId" value={p.id} />
                  <input type="hidden" name="voltar" value={voltar} />
                  <input name="valor" defaultValue={p.valorPrevisto} aria-label="Valor recebido" className={`${inputBase} w-28`} />
                  <input name="forma" placeholder="Forma (Pix…)" aria-label="Forma de recebimento" className={`${inputBase} w-36`} />
                  <button type="submit" className={botaoLinha}>Receber</button>
                </form>
              )}
              {podeEditar && p.status === "PAGA" && (
                <form action={estornarRecebimentoAction} className="border-t border-borda-suave pt-2">
                  <input type="hidden" name="parcelaId" value={p.id} />
                  <input type="hidden" name="voltar" value={voltar} />
                  <button type="submit" className={botaoSuave}>Estornar recebimento</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <Paginacao pagina={pagina} total={total} tamanho={TAMANHO_PAGINA} href={(p) => `?${qs({ filtro, p })}`} />
    </main>
  );
}
