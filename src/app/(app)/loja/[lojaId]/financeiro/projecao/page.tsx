// src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx
// Projeção de caixa: saldo de hoje (a partir do saldo de referência + realizado), bloco
// "Em atraso" fora da curva, curva dia a dia (primeiro dia negativo em bordô) e seletor de
// horizonte. Leitura pura; a única escrita é registrar o saldo de referência. Gate financeiro:ver.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { projecaoCaixa } from "@/lib/financeiro/projecao";
import { brl } from "@/lib/dinheiro";
import { hojeYMD } from "@/lib/tempo";
import { definirSaldoReferenciaAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  saldo_definido: "Saldo de referência atualizado.",
  data_invalida: "Data inválida.",
  valor_invalido: "Valor inválido.",
};

const HORIZONTES = [30, 60, 90] as const;
const diaFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });

export default async function ProjecaoCaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ h?: string; ok?: string; erro?: string }>;
}) {
  const sc = await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar");

  const p = await projecaoCaixa(lojaId, { horizonteDias: Number(sp.h) });
  const aviso = sp.ok ? AVISOS[sp.ok] : sp.erro ? AVISOS[sp.erro] ?? "Não foi possível concluir a ação." : null;

  const temAtraso = p.emAtraso.aReceber !== "0.00" || p.emAtraso.aPagar !== "0.00";
  const semAncora = p.saldoHoje === null;

  const campo = "rounded-md border border-borda-suave bg-papel px-3 py-2 text-[14px] text-tinta";
  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const botao = "rounded-md bg-bordo px-4 py-2 text-[13px] text-papel-elevado hover:opacity-90";

  const formSaldo = (
    <form action={definirSaldoReferenciaAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Data</span>
        <input name="data" type="date" required defaultValue={hojeYMD()} aria-label="Data do saldo" className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Saldo em caixa</span>
        <input name="valor" required placeholder="0,00" aria-label="Saldo em caixa" className={`${campo} w-32`} />
      </label>
      <button type="submit" className={botao}>Salvar saldo</button>
    </form>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Fluxo de caixa</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Projeção de caixa</h1>
        <p className="text-[14px] text-cinza-fumo">Projeção do que está previsto — não é caixa realizado.</p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {semAncora ? (
        <section className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-5">
          <h2 className="font-display text-[18px] font-light text-tinta">Informe o saldo atual do caixa</h2>
          <p className="text-[14px] text-cinza-fumo">Para projetar o saldo dia a dia, registre quanto há em caixa/banco hoje.</p>
          {podeEditar ? formSaldo : <p className="text-[13px] text-grafite">Sem permissão para registrar o saldo.</p>}
        </section>
      ) : (
        <section className="flex flex-col gap-1">
          <span className={rotulo}>Saldo hoje</span>
          <span className="font-display text-[32px] font-light tabular-nums text-tinta">{brl(p.saldoHoje!)}</span>
          {p.ancora && (
            <span className="text-[12px] text-cinza-fumo">a partir de {brl(p.ancora.valor)} em {diaFmt.format(p.ancora.data)}</span>
          )}
          {podeEditar && (
            <details className="mt-2">
              <summary className="w-fit cursor-pointer text-[13px] text-grafite hover:text-tinta">Ajustar saldo</summary>
              <div className="pt-3">{formSaldo}</div>
            </details>
          )}
        </section>
      )}

      {temAtraso && (
        <section className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-bordo/30 bg-papel-elevado p-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-bordo">Em atraso · fora da curva</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-tinta">
            {p.emAtraso.aReceber !== "0.00" && (
              <Link href={`/loja/${lojaId}/financeiro/receber?filtro=atrasadas`} className="hover:text-bordo">{brl(p.emAtraso.aReceber)} a receber</Link>
            )}
            {p.emAtraso.aPagar !== "0.00" && (
              <Link href={`/loja/${lojaId}/financeiro/pagar?filtro=atrasadas`} className="hover:text-bordo">{brl(p.emAtraso.aPagar)} a pagar</Link>
            )}
          </div>
        </section>
      )}

      {!semAncora && (
        <p className="text-[14px] text-tinta">
          {p.curva.diaNegativo
            ? <>Caixa fica <span className="text-bordo">negativo em {diaLongo.format(p.curva.diaNegativo)}</span>.</>
            : <>Caixa positivo em todo o horizonte.</>}
          {" "}Menor saldo: <span className="tabular-nums">{brl(p.curva.menorSaldo.valor)}</span>
          {p.curva.menorSaldo.data ? <> em {diaFmt.format(p.curva.menorSaldo.data)}</> : <> (hoje)</>}.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className={rotulo}>Curva projetada · {p.horizonteDias} dias</h2>
          <div className="flex gap-1">
            {HORIZONTES.map((h) => (
              <Link
                key={h}
                href={`/loja/${lojaId}/financeiro/projecao?h=${h}`}
                aria-current={p.horizonteDias === h ? "page" : undefined}
                className={`rounded-md px-2 py-1 text-[13px] ${p.horizonteDias === h ? "bg-papel-suave text-tinta" : "text-cinza-fumo hover:text-tinta"}`}
              >
                {h}d
              </Link>
            ))}
          </div>
        </div>

        {p.curva.linhas.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nada previsto neste horizonte.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {p.curva.linhas.map((l, i) => {
              const negativa = !semAncora && Number(l.saldoApos) < 0;
              return (
                <li key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] text-tinta">{diaFmt.format(l.data)}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {l.entradas !== "0.00" && <>+{brl(l.entradas)} </>}
                      {l.saidas !== "0.00" && <>−{brl(l.saidas)}</>}
                    </span>
                  </span>
                  {!semAncora && (
                    <span className={`shrink-0 font-display text-[14px] font-light tabular-nums ${negativa ? "text-bordo" : "text-tinta"}`}>
                      {brl(l.saldoApos)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
