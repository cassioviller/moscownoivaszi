// src/app/(app)/loja/[lojaId]/noivas/[leadId]/interesses/interesse-form.tsx
"use client";

import { useActionState } from "react";
import type { InteresseFormState } from "./actions";

export type InteresseDefaults = {
  volumeSaia: string;
  brilho: string;
  cauda: string;
  fenda: string;
  algoAMais: string;
  naoQuerUsar: string;
  tetoOrcamento: string;
};

const INICIAL: InteresseFormState = { erro: null };

const ESCALA = [
  { v: "", l: "—" },
  { v: "POUCO", l: "Pouco" },
  { v: "MEDIO", l: "Médio" },
  { v: "MUITO", l: "Muito" },
];
const FENDA = [
  { v: "", l: "—" },
  { v: "SIM", l: "Sim" },
  { v: "NAO", l: "Não" },
  { v: "TALVEZ", l: "Talvez" },
];

export function InteresseForm({
  action,
  leadId,
  defaults,
  readonly,
}: {
  action: (prev: InteresseFormState, fd: FormData) => Promise<InteresseFormState>;
  leadId: string;
  defaults: InteresseDefaults;
  readonly: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const d = defaults;

  // Read-only (vendedora com só "ver"): mostra os valores, sem form nem upsert.
  if (readonly) {
    const rotuloEscala = (v: string) => ESCALA.find((o) => o.v === v)?.l ?? "—";
    const rotuloFenda = (v: string) => FENDA.find((o) => o.v === v)?.l ?? "—";
    return (
      <dl className="flex max-w-md flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
        <Linha rotulo="Volume da saia" valor={rotuloEscala(d.volumeSaia)} />
        <Linha rotulo="Brilho" valor={rotuloEscala(d.brilho)} />
        <Linha rotulo="Cauda" valor={rotuloEscala(d.cauda)} />
        <Linha rotulo="Fenda" valor={rotuloFenda(d.fenda)} />
        <Linha rotulo="Algo a mais" valor={d.algoAMais || "—"} />
        <Linha rotulo="Não quer usar" valor={d.naoQuerUsar || "—"} />
        <Linha rotulo="Teto de orçamento" valor={d.tetoOrcamento ? `R$ ${d.tetoOrcamento}` : "—"} />
      </dl>
    );
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      <input type="hidden" name="leadId" value={leadId} />
      <Select id="i-volume" name="volumeSaia" label="Volume da saia" options={ESCALA} defaultValue={d.volumeSaia} />
      <Select id="i-brilho" name="brilho" label="Brilho" options={ESCALA} defaultValue={d.brilho} />
      <Select id="i-cauda" name="cauda" label="Cauda" options={ESCALA} defaultValue={d.cauda} />
      <Select id="i-fenda" name="fenda" label="Fenda" options={FENDA} defaultValue={d.fenda} />
      <Texto id="i-algo" name="algoAMais" label="Algo a mais" defaultValue={d.algoAMais} />
      <Texto id="i-nao" name="naoQuerUsar" label="Não quer usar" defaultValue={d.naoQuerUsar} />
      <Campo id="i-teto" name="tetoOrcamento" label="Teto de orçamento (R$)" defaultValue={d.tetoOrcamento} />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex w-fit items-center justify-center rounded-md bg-bordo px-4 py-2.5
          text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
          hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Salvando…" : "Salvar interesses"}
      </button>
      {state.erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-[12px] font-medium tracking-[0.01em] text-grafite">{rotulo}</dt>
      <dd className="text-[14px] text-tinta">{valor}</dd>
    </div>
  );
}

const campoCls =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta " +
  "placeholder:text-cinza-fumo transition-colors duration-150 ease-out hover:border-cinza-fumo " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

function Select({
  id,
  name,
  label,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  options: { v: string; l: string }[];
  defaultValue: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <select id={id} name={name} defaultValue={defaultValue} className={campoCls}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Campo({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <input id={id} name={name} type="text" defaultValue={defaultValue} className={campoCls} />
    </label>
  );
}

function Texto({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <textarea id={id} name={name} defaultValue={defaultValue} rows={2} className={campoCls} />
    </label>
  );
}
