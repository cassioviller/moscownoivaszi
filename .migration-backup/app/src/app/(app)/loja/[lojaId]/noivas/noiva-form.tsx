// src/app/(app)/loja/[lojaId]/noivas/noiva-form.tsx
"use client";

import { useActionState } from "react";
import type { NoivaFormState } from "./actions";

const INICIAL: NoivaFormState = { erro: null };

export type NoivaDefaults = {
  noivaNome?: string;
  origem?: string;
  noivoNome?: string;
  whatsapp?: string;
  cerimonialista?: string;
  casamentoData?: string; // "YYYY-MM-DD"
  casamentoHorario?: string; // "HH:MM"
  casamentoLocal?: string;
};

export function NoivaForm({
  action,
  submitLabel,
  leadId,
  defaults,
}: {
  action: (prev: NoivaFormState, fd: FormData) => Promise<NoivaFormState>;
  submitLabel: string;
  leadId?: string;
  defaults?: NoivaDefaults;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const d = defaults ?? {};
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      <Field id="n-noiva" name="noivaNome" label="Nome da noiva" defaultValue={d.noivaNome} required autoFocus />

      <label htmlFor="n-origem" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">Origem</span>
        <select
          id="n-origem"
          name="origem"
          defaultValue={d.origem ?? "LOJA"}
          className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
            transition-colors duration-150 ease-out hover:border-cinza-fumo focus:border-tinta focus:outline-none
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          <option value="LOJA">Loja</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
      </label>

      <p className="mt-1 text-[12px] font-medium tracking-[0.01em] text-cinza-fumo">Opcional</p>
      <Field id="n-noivo" name="noivoNome" label="Nome do noivo" defaultValue={d.noivoNome} />
      <Field id="n-whats" name="whatsapp" label="WhatsApp" defaultValue={d.whatsapp} />
      <Field id="n-cerim" name="cerimonialista" label="Cerimonialista" defaultValue={d.cerimonialista} />
      <Field id="n-data" name="casamentoData" label="Data do casamento" type="date" defaultValue={d.casamentoData} />
      <Field id="n-hora" name="casamentoHorario" label="Horário" type="time" defaultValue={d.casamentoHorario} />
      <Field id="n-local" name="casamentoLocal" label="Local do casamento" defaultValue={d.casamentoLocal} />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex w-fit items-center justify-center rounded-md bg-bordo px-4 py-2.5
          text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
          hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
      {state.erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  required,
  autoFocus,
  type = "text",
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  type?: "text" | "date" | "time";
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
          placeholder:text-cinza-fumo transition-colors duration-150 ease-out hover:border-cinza-fumo
          focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
      />
    </label>
  );
}
