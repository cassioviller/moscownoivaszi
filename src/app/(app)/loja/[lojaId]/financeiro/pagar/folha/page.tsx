// src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/page.tsx
// Folha do mês — o cruzamento salário + comissão. Salários recorrentes (base por
// colaborador), gerar a folha (idempotente), pagar um colaborador (1 saída quita N
// contas) e enviar à contabilidade. Comissão entra na S6; até lá, só salário aparece.
// Gate ver=leads:ver, mutar=leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarEquipe } from "@/lib/admin/usuarios";
import {
  listarSalariosRecorrentes,
  resumoPorCompetencia,
  listarContasAPagar,
  listarPagamentos,
} from "@/lib/financeiro/pagar";
import {
  definirSalarioAction,
  removerSalarioAction,
  gerarFolhaAction,
  pagarContasAction,
  enviarContabilidadeAction,
} from "../actions";

export const dynamic = "force-dynamic";

const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeYMD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const competenciaAtual = () => hojeYMD().slice(0, 7);
const TIPO_ROTULO: Record<string, string> = { SALARIO: "Salário", COMISSAO: "Comissão" };

const AVISOS: Record<string, string> = {
  salario: "Salário-base definido.",
  salario_removido: "Salário-base removido.",
  pago: "Pagamento registrado.",
  enviado_contabilidade: "Marcado como enviado à contabilidade.",
  desfeito_contabilidade: "Envio à contabilidade desfeito.",
  colaborador_invalido: "Colaborador não é membro da loja.",
  valor_invalido: "Valor inválido.",
  dia_invalido: "Dia de vencimento deve ser entre 1 e 28.",
  competencia_invalida: "Competência inválida (use AAAA-MM).",
  vazio: "Nenhuma conta em aberto para pagar.",
  nao_previsto: "Conta já paga.",
  data_invalida: "Data inválida.",
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

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">{children}</h2>;
}

export default async function FolhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ competencia?: string; colaborador?: string; ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const sp = await searchParams;
  const competencia = /^\d{4}-\d{2}$/.test(sp.competencia ?? "") ? sp.competencia! : competenciaAtual();
  const colaboradorSel = sp.colaborador ?? "";

  const [equipe, salarios, folha] = await Promise.all([
    listarEquipe(sc.loja.id),
    listarSalariosRecorrentes(sc.loja.id),
    resumoPorCompetencia(sc.loja.id, competencia),
  ]);
  const [contasColab, pagamentos] = await Promise.all([
    colaboradorSel ? listarContasAPagar(sc.loja.id, { filtro: "abertas", colaboradorId: colaboradorSel }) : Promise.resolve([]),
    colaboradorSel ? listarPagamentos(sc.loja.id, { colaboradorId: colaboradorSel }) : Promise.resolve([]),
  ]);
  const nomeColab = equipe.find((e) => e.id === colaboradorSel)?.nome ?? null;
  const aviso = (sp.ok && AVISOS[sp.ok]) || (sp.erro && AVISOS[sp.erro]) || (sp.ok?.startsWith("folha_") ? `Folha gerada: ${sp.ok.slice(6)} salário(s).` : null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/financeiro/pagar`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← Contas a pagar
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Folha do mês</h1>
        <p className="text-[14px] text-cinza-fumo">Salário-base do atelier, geração da folha e o pagamento de cada colaborador.</p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {/* — Salários recorrentes — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Salário-base</SecaoTitulo>
        {salarios.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nenhum salário-base definido ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {salarios.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] text-tinta">{s.colaboradorNome}</span>
                  <span className="text-[12px] text-cinza-fumo">vence dia {s.diaVencimento}{s.ativo ? "" : " · inativo"}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-[15px] font-light tabular-nums text-tinta">{brl(s.valorBase)}</span>
                  {podeEditar && (
                    <form action={removerSalarioAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className={botaoSuave}>Remover</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form action={definirSalarioAction} className="flex flex-wrap items-end gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
            <select name="colaboradorId" required aria-label="Colaborador" className={`${inputBase} min-w-0 flex-1`}>
              <option value="">Colaborador…</option>
              {equipe.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
            <input name="valorBase" placeholder="Salário (0,00)" aria-label="Salário-base" className={`${inputBase} w-32`} />
            <input name="diaVencimento" type="number" min={1} max={28} defaultValue={5} aria-label="Dia do vencimento" className={`${inputBase} w-20`} />
            <button type="submit" className={botaoPrincipal}>Definir</button>
          </form>
        )}
      </section>

      {/* — Gerar folha + resumo da competência — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Competência</SecaoTitulo>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input name="competencia" type="month" defaultValue={competencia} aria-label="Competência" className={`${inputBase} w-44`} />
          {colaboradorSel && <input type="hidden" name="colaborador" value={colaboradorSel} />}
          <button type="submit" className={botaoSuave}>Ver</button>
        </form>
        {podeEditar && (
          <form action={gerarFolhaAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="competencia" value={competencia} />
            <button type="submit" className={botaoPrincipal}>Gerar folha de {competencia}</button>
          </form>
        )}
        {folha.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Sem salários ou comissões lançados em {competencia}.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-borda-suave text-left text-[11px] uppercase tracking-[0.14em] text-cinza-fumo">
                <th className="py-2 font-medium">Colaborador</th>
                <th className="py-2 text-right font-medium">Salário</th>
                <th className="py-2 text-right font-medium">Comissão</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {folha.map((r) => (
                <tr key={r.colaboradorId} className="border-b border-borda-suave">
                  <td className="py-2 text-tinta">{r.nome}</td>
                  <td className="py-2 text-right tabular-nums text-grafite">{brl(r.salario)}</td>
                  <td className="py-2 text-right tabular-nums text-grafite">{brl(r.comissao)}</td>
                  <td className="py-2 text-right tabular-nums text-tinta">{brl(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[12px] text-cinza-fumo">A comissão chega na próxima etapa do financeiro; por ora a folha mostra os salários.</p>
      </section>

      {/* — Pagar colaborador (o cruzamento) — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Pagar colaborador</SecaoTitulo>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="competencia" value={competencia} />
          <select name="colaborador" defaultValue={colaboradorSel} aria-label="Colaborador a pagar" className={`${inputBase} min-w-0 flex-1`}>
            <option value="">Escolha um colaborador…</option>
            {equipe.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          <button type="submit" className={botaoSuave}>Ver contas</button>
        </form>

        {colaboradorSel && (
          contasColab.length === 0 ? (
            <p className="text-[14px] text-cinza-fumo">{nomeColab ?? "Colaborador"} não tem contas em aberto.</p>
          ) : podeEditar ? (
            <form action={pagarContasAction} className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
              <input type="hidden" name="colaboradorId" value={colaboradorSel} />
              <input type="hidden" name="voltar" value={`/loja/${lojaId}/financeiro/pagar/folha?competencia=${competencia}&colaborador=${colaboradorSel}`} />
              <p className="text-[13px] text-grafite">Uma saída do caixa quita todas as contas abaixo — ajuste o valor real de cada uma.</p>
              <ul className="flex flex-col gap-2">
                {contasColab.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-[14px] text-tinta">
                      {c.descricao}
                      <span className="text-cinza-fumo"> · {TIPO_ROTULO[c.tipo] ?? c.tipo} · vence {dataFmt.format(c.vencimento)}{c.atrasada ? " · atrasada" : ""}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <input type="hidden" name="contaPagarId" value={c.id} />
                      <input name="valor" defaultValue={c.valorPrevisto} aria-label={`Valor pago — ${c.descricao}`} className={`${inputBase} w-28 text-right`} />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2 border-t border-borda-suave pt-3">
                <input type="date" name="data" defaultValue={hojeYMD()} aria-label="Data do pagamento" className={`${inputBase} w-44`} />
                <input name="forma" placeholder="Forma (Pix…)" aria-label="Forma de pagamento" className={`${inputBase} w-32`} />
                <button type="submit" className={botaoPrincipal}>Pagar {nomeColab}</button>
              </div>
            </form>
          ) : null
        )}

        {colaboradorSel && pagamentos.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-cinza-fumo">Pagamentos de {nomeColab}</span>
            <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[14px] text-tinta">{brl(p.valorPago)}<span className="text-cinza-fumo"> · {dataFmt.format(p.data)}{p.forma ? ` · ${p.forma}` : ""}</span></span>
                    <span className="text-[12px] text-cinza-fumo">{p.contas.map((c) => c.descricao).join(" · ")}</span>
                  </div>
                  {podeEditar && (
                    <form action={enviarContabilidadeAction} className="shrink-0">
                      <input type="hidden" name="pagamentoId" value={p.id} />
                      <input type="hidden" name="competencia" value={competencia} />
                      <input type="hidden" name="enviado" value={p.enviadoContabilidade ? "0" : "1"} />
                      <button type="submit" className={botaoSuave}>
                        {p.enviadoContabilidade ? "✓ na contabilidade" : "Enviar à contabilidade"}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
