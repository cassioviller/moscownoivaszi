// src/app/(app)/loja/[lojaId]/financeiro/comissoes/regras/page.tsx
// Faixas por vendedora — a régua da comissão. Cada faixa diz: deste acumulado até aquele,
// a vendedora ganha X% (+ bônus opcional). A faixa do acumulado FINAL rege o mês inteiro
// (retroativo). Salvar substitui as faixas da vigência. Gate ver=financeiro:ver, mutar=editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarEquipe } from "@/lib/admin/usuarios";
import { listarRegras } from "@/lib/financeiro/comissao";
import { hojeYMD } from "@/lib/financeiro/datas";
import { inputBase, botaoSuave, botaoPrincipal, brl, dataFmt } from "../../ui";
import { definirRegraAction, removerRegraAction } from "../actions";

export const dynamic = "force-dynamic";

const LINHAS_FAIXA = 5; // patamares disponíveis no formulário; linhas vazias são ignoradas

const AVISOS: Record<string, string> = {
  regra: "Faixas salvas.",
  regra_removida: "Regra removida.",
  vendedora_invalida: "Escolha uma vendedora da loja.",
  faixas_invalidas: "Faixas inválidas: confira limites, % ou bônus, e sobreposição.",
  valor_invalido: "Algum valor está inválido.",
  data_invalida: "Vigência inválida.",
};

export default async function RegrasComissaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
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
  const [equipe, regras] = await Promise.all([listarEquipe(sc.loja.id), listarRegras(sc.loja.id)]);
  const aviso = (sp.ok && AVISOS[sp.ok]) || (sp.erro && AVISOS[sp.erro]) || null;
  const voltar = `/loja/${lojaId}/financeiro/comissoes/regras`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/financeiro/comissoes`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← Comissões
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Faixas por vendedora</h1>
        <p className="text-[14px] text-cinza-fumo">A régua de cada vendedora — a faixa do total final rege o mês inteiro.</p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {/* — Regras vigentes — */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">Regras atuais</h2>
        {regras.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nenhuma faixa definida ainda. Cadastre a primeira abaixo.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {regras.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px] text-tinta">{r.vendedoraNome}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      vigente desde {dataFmt.format(r.vigenciaInicio)}
                      {r.bonusAcumulaFaixas ? " · bônus acumula" : " · bônus só da faixa final"}
                      {r.ativo ? "" : " · inativa"}
                    </span>
                  </div>
                  {podeEditar && (
                    <form action={removerRegraAction} className="shrink-0">
                      <input type="hidden" name="regraId" value={r.id} />
                      <input type="hidden" name="voltar" value={voltar} />
                      <button type="submit" className={botaoSuave}>Remover</button>
                    </form>
                  )}
                </div>
                <ul className="flex flex-col gap-1 border-t border-borda-suave pt-2 text-[13px] text-grafite">
                  {r.faixas.map((f, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 tabular-nums">
                      <span>
                        {brl(f.minAcumulado)} {f.maxAcumulado === null ? "ou mais" : `a ${brl(f.maxAcumulado)}`}
                      </span>
                      <span className="text-tinta">
                        {f.percentual === null ? "" : `${Number(f.percentual)}%`}
                        {f.percentual !== null && f.bonusFixo !== null ? " + " : ""}
                        {f.bonusFixo === null ? "" : `${brl(f.bonusFixo)} de bônus`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* — Definir / substituir faixas — */}
      {podeEditar && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">Definir faixas</h2>
          <form action={definirRegraAction} className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
            <input type="hidden" name="voltar" value={voltar} />
            <div className="flex flex-wrap items-end gap-2">
              <select name="vendedoraId" required aria-label="Vendedora" className={`${inputBase} min-w-0 flex-1`}>
                <option value="">Vendedora…</option>
                {equipe.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              <span className="flex flex-col gap-1">
                <label htmlFor="vigenciaInicio" className="text-[11px] uppercase tracking-[0.14em] text-cinza-fumo">Vigência</label>
                <input id="vigenciaInicio" name="vigenciaInicio" type="date" defaultValue={hojeYMD()} aria-label="Vigência" className={`${inputBase} w-44`} />
              </span>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-grafite">
              <input type="checkbox" name="bonusAcumulaFaixas" className="accent-bordo" />
              Somar o bônus de todas as faixas atingidas (senão, só o da faixa final)
            </label>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_1fr_4rem_1fr] gap-2 text-[11px] uppercase tracking-[0.14em] text-cinza-fumo">
                <span>De (R$)</span>
                <span>Até (R$)</span>
                <span>%</span>
                <span>Bônus (R$)</span>
              </div>
              {Array.from({ length: LINHAS_FAIXA }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_4rem_1fr] gap-2">
                  <input name="min" placeholder="0,00" aria-label={`Faixa ${i + 1} — de`} className={inputBase} />
                  <input name="max" placeholder="aberta" aria-label={`Faixa ${i + 1} — até`} className={inputBase} />
                  <input name="percentual" placeholder="0" aria-label={`Faixa ${i + 1} — percentual`} className={inputBase} />
                  <input name="bonus" placeholder="0,00" aria-label={`Faixa ${i + 1} — bônus`} className={inputBase} />
                </div>
              ))}
              <p className="text-[12px] text-cinza-fumo">
                Cada faixa precisa de % ou bônus. Deixe &quot;até&quot; em branco na última (topo aberto). Salvar substitui as faixas desta vigência.
              </p>
            </div>

            <button type="submit" className={`${botaoPrincipal} self-start`}>Salvar faixas</button>
          </form>
        </section>
      )}
    </main>
  );
}
