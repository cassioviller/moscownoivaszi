// src/app/(app)/loja/[lojaId]/financeiro/pagar/page.tsx
// Contas a pagar — a carteira de saída: despesas, fornecedores e salários. Resumo (a
// pagar · pago · em atraso), filtro e baixa inline (1 conta = 1 pagamento). Atraso em
// bordô (atenção). Salários nascem na folha do mês. Gate ver=leads:ver, mutar=leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarContasAPagar, resumoPagar, type FiltroPagar } from "@/lib/financeiro/pagar";
import type { ContaPagarTipo } from "@/generated/prisma/client";
import { lancarDespesaAction, removerContaAction, pagarContasAction, estornarPagamentoAction } from "./actions";

export const dynamic = "force-dynamic";

const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeYMD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const TIPO_ROTULO: Record<ContaPagarTipo, string> = { DESPESA: "Despesa", FORNECEDOR: "Fornecedor", SALARIO: "Salário", COMISSAO: "Comissão" };

const FILTROS: { chave: FiltroPagar; rotulo: string }[] = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "pagas", rotulo: "Pagas" },
  { chave: "todas", rotulo: "Todas" },
];
const AVISOS: Record<string, string> = {
  conta: "Conta lançada.",
  conta_removida: "Conta removida.",
  pago: "Pagamento registrado.",
  estornado: "Pagamento estornado.",
  tipo_invalido: "Tipo inválido.",
  sem_descricao: "Informe uma descrição.",
  valor_invalido: "Valor inválido.",
  data_invalida: "Data inválida.",
  colaborador_invalido: "Colaborador não é membro da loja.",
  conta_invalida: "Conta inválida.",
  nao_previsto: "Esta conta não está em aberto.",
  vazio: "Selecione ao menos uma conta.",
  pagamento_invalido: "Pagamento não encontrado.",
};

const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 " +
  "transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel transition-colors duration-150 " +
  "ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

function Card({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</span>
      <span className={`font-display text-[20px] font-light tabular-nums ${destaque ? "text-bordo" : "text-tinta"}`}>{brl(valor)}</span>
    </div>
  );
}

export default async function PagarPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ filtro?: string; ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { filtro: filtroRaw, ok, erro } = await searchParams;
  const filtro = (FILTROS.find((f) => f.chave === filtroRaw)?.chave ?? "abertas") as FiltroPagar;

  const [resumo, lista] = await Promise.all([resumoPagar(sc.loja.id), listarContasAPagar(sc.loja.id, { filtro })]);
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || (ok?.startsWith("folha_") ? "Folha gerada." : null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Contas a pagar</h1>
        <p className="text-[14px] text-cinza-fumo">O que sai do caixa: despesas, fornecedores e a folha do atelier.</p>
      </header>

      <section className="flex flex-wrap gap-3">
        <Card rotulo="A pagar" valor={resumo.totalAPagar} />
        <Card rotulo="Pago" valor={resumo.pagoTotal} />
        <Card rotulo="Em atraso" valor={resumo.emAtraso} destaque />
      </section>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const ativo = f.chave === filtro;
            return (
              <Link
                key={f.chave}
                href={`/loja/${lojaId}/financeiro/pagar?filtro=${f.chave}`}
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
        <Link href={`/loja/${lojaId}/financeiro/pagar/folha`} className={botaoSuave}>
          Folha do mês
        </Link>
      </div>

      {podeEditar && (
        <details className="rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          <summary className="cursor-pointer list-none px-4 py-3 text-[14px] text-tinta marker:content-['']">
            Lançar despesa
          </summary>
          <form action={lancarDespesaAction} className="flex flex-col gap-3 border-t border-borda-suave px-4 py-4">
            <div className="flex flex-wrap gap-2">
              <select name="tipo" defaultValue="DESPESA" aria-label="Tipo" className={`${inputBase} w-40`}>
                <option value="DESPESA">Despesa</option>
                <option value="FORNECEDOR">Fornecedor</option>
              </select>
              <input name="descricao" placeholder="Descrição" aria-label="Descrição" required className={`${inputBase} min-w-0 flex-1`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input name="categoria" placeholder="Categoria (Aluguel…)" aria-label="Categoria" className={`${inputBase} flex-1`} />
              <input name="fornecedor" placeholder="Fornecedor" aria-label="Fornecedor" className={`${inputBase} flex-1`} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input name="valorPrevisto" placeholder="0,00" aria-label="Valor previsto" className={`${inputBase} w-28`} />
              <input type="date" name="vencimento" defaultValue={hojeYMD()} aria-label="Vencimento" className={`${inputBase} w-44`} />
              <button type="submit" className={botaoPrincipal}>Lançar</button>
            </div>
          </form>
        </details>
      )}

      {lista.length === 0 ? (
        <p className="text-[15px] text-tinta">Nada por aqui neste filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] text-tinta">{c.descricao}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {TIPO_ROTULO[c.tipo]}
                    {c.colaboradorNome ? ` · ${c.colaboradorNome}` : c.fornecedor ? ` · ${c.fornecedor}` : c.categoria ? ` · ${c.categoria}` : ""}
                    {" · vence "}
                    {dataFmt.format(c.vencimento)}
                    {c.atrasada ? " · atrasada" : ""}
                  </span>
                </div>
                <span className={`shrink-0 font-display text-[15px] font-light tabular-nums ${c.atrasada ? "text-bordo" : "text-tinta"}`}>
                  {brl(c.valorPrevisto)}
                </span>
              </div>

              {podeEditar && c.status === "PREVISTA" && (
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-borda-suave pt-2">
                  <form action={pagarContasAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="contaPagarId" value={c.id} />
                    {c.colaboradorId && <input type="hidden" name="colaboradorId" value={c.colaboradorId} />}
                    <input name="valor" defaultValue={c.valorPrevisto} aria-label="Valor pago" className={`${inputBase} w-28`} />
                    <input type="date" name="data" defaultValue={hojeYMD()} aria-label="Data do pagamento" className={`${inputBase} w-44`} />
                    <input name="forma" placeholder="Forma (Pix…)" aria-label="Forma de pagamento" className={`${inputBase} w-32`} />
                    <button type="submit" className={botaoPrincipal}>Pagar</button>
                  </form>
                  <form action={removerContaAction}>
                    <input type="hidden" name="contaId" value={c.id} />
                    <button type="submit" className={botaoSuave}>Remover</button>
                  </form>
                </div>
              )}
              {podeEditar && c.status === "PAGA" && c.pagamentoId && (
                <form action={estornarPagamentoAction} className="border-t border-borda-suave pt-2">
                  <input type="hidden" name="pagamentoId" value={c.pagamentoId} />
                  <button type="submit" className={botaoSuave}>Estornar pagamento</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
