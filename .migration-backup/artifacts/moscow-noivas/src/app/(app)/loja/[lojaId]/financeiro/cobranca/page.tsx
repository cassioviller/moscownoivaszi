// src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx
// Cobrança / inadimplência: faixas de atraso (1-30/31-60/60+), lista de inadimplentes por noiva
// com Abrir WhatsApp (wa.me, sem API) + Registrar cobrança + histórico inline. Tom Concierge:
// cuidado, não régua agressiva. Gate financeiro:ver; registrar exige financeiro:editar.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { agingDaLoja, historicoCobranca, linkWhatsApp, type Faixa } from "@/lib/financeiro/cobranca";
import { brl } from "@/lib/dinheiro";
import { registrarCobrancaAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  cobranca_registrada: "Cobrança registrada.",
  lead_invalido: "Noiva não encontrada.",
  canal_invalido: "Canal inválido.",
};

const FAIXA_ROTULO: Record<Faixa, string> = { ate30: "até 30 dias", d31a60: "31–60 dias", mais60: "60+ dias" };
const CANAL_ROTULO: Record<string, string> = { WHATSAPP: "WhatsApp", TELEFONE: "Telefone", PRESENCIAL: "Presencial", OUTRO: "Outro" };
const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

const msgPadrao = (nome: string | null) =>
  `Olá ${nome ?? ""}! Aqui é do atelier 💛 Passando com carinho para lembrar de uma parcela em aberto. Qualquer dúvida, estou à disposição.`;

export default async function CobrancaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar");

  const aging = await agingDaLoja(sc.loja.id);
  const historicos = new Map(
    await Promise.all(aging.noivas.map(async (n) => [n.leadId, await historicoCobranca(sc.loja.id, n.leadId)] as const)),
  );
  const aviso = sp.ok ? AVISOS[sp.ok] : sp.erro ? AVISOS[sp.erro] ?? "Não foi possível concluir a ação." : null;

  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const campo = "rounded-md border border-borda-suave bg-papel px-3 py-2 text-[14px] text-tinta";
  const botao = "rounded-md bg-bordo px-4 py-2 text-[13px] text-papel-elevado hover:opacity-90";
  const linkAcao = "text-[13px] text-grafite underline decoration-borda underline-offset-4 hover:text-bordo";

  const cardFaixa = (f: Faixa) => (
    <div className={`flex flex-col gap-1 rounded-[var(--mn-radius-md)] border bg-papel-elevado p-4 ${f === "mais60" ? "border-bordo/30" : "border-borda-suave"}`}>
      <span className={rotulo}>{FAIXA_ROTULO[f]}</span>
      <span className={`font-display text-[22px] font-light tabular-nums ${f === "mais60" ? "text-bordo" : "text-tinta"}`}>{brl(aging.faixas[f].total)}</span>
      <span className="text-[12px] text-cinza-fumo">{aging.faixas[f].qtdNoivas} noiva{aging.faixas[f].qtdNoivas === 1 ? "" : "s"}</span>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro/receber`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Contas a receber</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Cobrança</h1>
        <p className="text-[14px] text-cinza-fumo">Acompanhe com delicadeza as parcelas em aberto.</p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {aging.noivas.length === 0 ? (
        <p className="text-[15px] text-cinza-fumo">Nenhuma parcela em atraso. 💛</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">{cardFaixa("ate30")}{cardFaixa("d31a60")}{cardFaixa("mais60")}</div>

          <ul className="flex flex-col gap-3">
            {aging.noivas.map((n) => {
              const wa = linkWhatsApp(n.whatsapp, msgPadrao(n.noivaNome));
              const hist = historicos.get(n.leadId) ?? [];
              return (
                <li key={n.leadId} className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] text-tinta">{n.noivaNome ?? "Noiva"}</span>
                      <span className="text-[12px] text-cinza-fumo">{n.qtdParcelas} parcela{n.qtdParcelas === 1 ? "" : "s"} · há {n.diasMaisAntigo} dias · {FAIXA_ROTULO[n.faixaMaisAntiga]}</span>
                    </span>
                    <span className={`shrink-0 font-display text-[15px] font-light tabular-nums ${n.faixaMaisAntiga === "mais60" ? "text-bordo" : "text-tinta"}`}>{brl(n.totalVencido)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={linkAcao}>Abrir WhatsApp ↗</a>}
                    {podeEditar && (
                      <details>
                        <summary className={`w-fit cursor-pointer ${linkAcao}`}>Registrar cobrança</summary>
                        <form action={registrarCobrancaAction} className="flex flex-wrap items-end gap-2 pt-3">
                          <input type="hidden" name="leadId" value={n.leadId} />
                          <label className="flex flex-col gap-1">
                            <span className={rotulo}>Canal</span>
                            <select name="canal" aria-label="Canal" className={campo} defaultValue="WHATSAPP">
                              <option value="WHATSAPP">WhatsApp</option>
                              <option value="TELEFONE">Telefone</option>
                              <option value="PRESENCIAL">Presencial</option>
                              <option value="OUTRO">Outro</option>
                            </select>
                          </label>
                          <label className="flex flex-1 flex-col gap-1">
                            <span className={rotulo}>Observação</span>
                            <input name="observacao" placeholder="Ex.: prometeu pagar dia 15" aria-label="Observação" className={campo} />
                          </label>
                          <button type="submit" className={botao}>Registrar</button>
                        </form>
                      </details>
                    )}
                  </div>

                  {hist.length > 0 && (
                    <ul className="flex flex-col gap-0.5 border-t border-borda-suave pt-2">
                      {hist.map((c) => (
                        <li key={c.id} className="text-[12px] text-cinza-fumo">
                          {dataFmt.format(c.data)} · {CANAL_ROTULO[c.canal] ?? c.canal}{c.observacao ? ` · "${c.observacao}"` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
