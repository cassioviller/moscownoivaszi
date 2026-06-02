// src/app/(app)/loja/[lojaId]/atendimentos/novo/agendar-form.tsx
"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { rotuloSlot, type Slot } from "@/lib/atendimentos/slots";
import { gradeDoDiaAction, agendarAtendimentoAction, type AgendarState } from "./actions";

type Opcao = { id: string; nome: string };
const INICIAL: AgendarState = { erro: null };
const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[15px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export function AgendarForm({
  noivas, cabines, vendedoras, noivaInicial,
}: { noivas: Opcao[]; cabines: Opcao[]; vendedoras: Opcao[]; noivaInicial?: string }) {
  const [leadId, setLeadId] = useState(noivaInicial ?? "");
  const [cabineId, setCabineId] = useState("");
  const [vendedoraId, setVendedoraId] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState<number | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [carregando, startGrade] = useTransition();
  const [state, formAction, pending] = useActionState(agendarAtendimentoAction, INICIAL);

  const prontoParaGrade = Boolean(cabineId && vendedoraId && data);
  // Sincroniza a grade com o servidor quando (data, cabine, vendedora) mudam.
  // setState só dentro do callback assíncrono (regra react-hooks/set-state-in-effect);
  // a flag `ativo` descarta respostas de uma combinação já trocada.
  useEffect(() => {
    if (!prontoParaGrade) return;
    let ativo = true;
    startGrade(async () => {
      const g = await gradeDoDiaAction({ dataYMD: data, cabineId, vendedoraId });
      if (ativo) { setSlots(g); setHora(null); }
    });
    return () => { ativo = false; };
  }, [data, cabineId, vendedoraId, prontoParaGrade]);

  // Slots só valem com a tríade completa; a hora escolhida precisa existir e estar livre.
  const slotsVisiveis = prontoParaGrade ? slots : null;
  const horaValida = !carregando && hora !== null && Boolean(slotsVisiveis?.some((s) => s.hora === hora && s.livre));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="cabineId" value={cabineId} />
      <input type="hidden" name="vendedoraId" value={vendedoraId} />
      <input type="hidden" name="data" value={data} />
      <input type="hidden" name="hora" value={hora ?? ""} />

      <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Noiva</span>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={campo} aria-label="Noiva">
          <option value="">Selecione a noiva…</option>
          {noivas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Cabine</span>
          <select value={cabineId} onChange={(e) => setCabineId(e.target.value)} className={campo} aria-label="Cabine">
            <option value="">Selecione…</option>
            {cabines.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Vendedora</span>
          <select value={vendedoraId} onChange={(e) => setVendedoraId(e.target.value)} className={campo} aria-label="Vendedora">
            <option value="">Selecione…</option>
            {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} aria-label="Data" />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-grafite">Horário</span>
        {!prontoParaGrade ? (
          <p className="text-[13px] text-cinza-fumo">Escolha cabine, vendedora e data para ver os horários livres.</p>
        ) : carregando || slotsVisiveis === null ? (
          <p className="text-[13px] text-cinza-fumo">Carregando horários…</p>
        ) : slotsVisiveis.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhum horário configurado para a loja.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slotsVisiveis.map((s) => (
              <button
                key={s.hora}
                type="button"
                disabled={!s.livre}
                onClick={() => setHora(s.hora)}
                className={
                  "min-h-11 rounded-md border px-3 text-[13px] transition-colors duration-150 " +
                  (hora === s.hora
                    ? "border-bordo bg-bordo text-papel"
                    : s.livre
                      ? "border-borda bg-papel-elevado text-tinta hover:border-bordo"
                      : "cursor-not-allowed border-borda-suave bg-papel text-cinza-fumo line-through")
                }
              >
                {rotuloSlot(s.hora)}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Observação (opcional)</span>
        <input name="observacao" className={campo} aria-label="Observação" />
      </label>

      {state.erro && <p className="text-[13px] text-bordo">{state.erro}</p>}

      <button
        type="submit"
        disabled={pending || !leadId || !horaValida}
        className="inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel
          transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-bordo disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Agendar atendimento
      </button>
    </form>
  );
}
