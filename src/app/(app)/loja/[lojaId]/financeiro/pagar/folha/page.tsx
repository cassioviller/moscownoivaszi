// src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/page.tsx
// Folha do mês — o cruzamento salário + comissão. Salários recorrentes (base por
// colaborador), gerar a folha (idempotente), pagar um colaborador (1 saída quita N
// contas) e enviar à contabilidade. Comissão entra na S6; até lá, só salário aparece.
// Gate ver=financeiro:ver, mutar=financeiro:editar.
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
import { hojeYMD } from "@/lib/financeiro/datas";
import { lerFiltroFinanceiro } from "@/lib/financeiro/intervalo-params";
import { inputBase, botaoSuave, botaoPrincipal, brl, dataFmt, SecaoTitulo, FiltroIntervalo, rotuloCompetencia } from "../../ui";
import {
  definirSalarioAction,
  removerSalarioAction,
  gerarFolhaAction,
  pagarContasAction,
  enviarContabilidadeAction,
} from "../actions";

export const dynamic = "force-dynamic";

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
  conta_invalida: "Conta inválida ou não é deste colaborador.",
  data_invalida: "Data inválida.",
  pagamento_invalido: "Pagamento não encontrado.",
};

export default async function FolhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ini?: string; fim?: string; colaborador?: string; ok?: string; erro?: string }>;
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
  // O filtro de intervalo é a lente de visualização uniforme do financeiro; aqui o MÊS
  // DO INÍCIO define a competência exibida — a Folha segue mensal (gerar/pagar por competência).
  const { intervalo, qs } = lerFiltroFinanceiro(sp);
  const competencia = intervalo.iniYMD.slice(0, 7);
  const colaboradorSel = sp.colaborador ?? "";
  const voltar = `/loja/${lojaId}/financeiro/pagar/folha?${qs({ colaborador: colaboradorSel })}`;

  // Tudo num único batch: contasColab/pagamentos só dependem de colaboradorSel (searchParams),
  // não dos demais reads — não há razão para serializar dois Promise.all.
  const [equipe, salarios, folha, contasColab, pagamentos] = await Promise.all([
    listarEquipe(sc.loja.id),
    listarSalariosRecorrentes(sc.loja.id),
    resumoPorCompetencia(sc.loja.id, competencia),
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
        <FiltroIntervalo
          iniYMD={intervalo.iniYMD}
          fimYMD={intervalo.fimYMD}
          hidden={colaboradorSel ? { colaborador: colaboradorSel } : undefined}
        />
        <p className="text-[12px] text-cinza-fumo">Folha de {rotuloCompetencia(competencia)} — a folha é mensal e mostra a competência do início do período selecionado.</p>
        {podeEditar && (
          <form action={gerarFolhaAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="competencia" value={competencia} />
            <button type="submit" className={botaoPrincipal}>Gerar folha de {rotuloCompetencia(competencia)}</button>
          </form>
        )}
        {folha.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Sem salários ou comissões lançados em {rotuloCompetencia(competencia)}.</p>
        ) : (
          // Folha como lista por colaborador (não planilha): salário + comissão na
          // sub-linha, total da pessoa como número-herói à direita.
          <ol className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {folha.map((r) => (
              <li key={r.colaboradorId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] text-tinta">{r.nome}</span>
                  <span className="text-[12px] tabular-nums text-cinza-fumo">salário {brl(r.salario)} · comissão {brl(r.comissao)}</span>
                </div>
                <span className="shrink-0 font-display text-[16px] font-light tabular-nums text-tinta">{brl(r.total)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[12px] text-cinza-fumo">Salário e comissão de cada colaborador — o resumo que vai à contabilidade.</p>
      </section>

      {/* — Pagar colaborador (o cruzamento) — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Pagar colaborador</SecaoTitulo>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ini" value={intervalo.iniYMD} />
          <input type="hidden" name="fim" value={intervalo.fimYMD} />
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
              <input type="hidden" name="voltar" value={voltar} />
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
                      <input type="hidden" name="voltar" value={voltar} />
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
