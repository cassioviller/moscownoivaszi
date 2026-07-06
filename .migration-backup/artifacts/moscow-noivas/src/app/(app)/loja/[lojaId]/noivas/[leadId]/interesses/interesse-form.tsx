// src/app/(app)/loja/[lojaId]/noivas/[leadId]/interesses/interesse-form.tsx
"use client";

import { useActionState } from "react";
import type { InteresseFormState } from "./actions";
import type { CatalogoAtributo } from "@/lib/catalogo/catalogo";
import { CatalogoCampos } from "@/components/catalogo/catalogo-campos";

export type InteresseDefaults = {
  algoAMais: string;
  naoQuerUsar: string;
  tetoOrcamento: string;
};

const INICIAL: InteresseFormState = { erro: null };

export function InteresseForm({
  action,
  leadId,
  defaults,
  readonly,
  catalogo,
  selecoes,
}: {
  action: (prev: InteresseFormState, fd: FormData) => Promise<InteresseFormState>;
  leadId: string;
  defaults: InteresseDefaults;
  readonly: boolean;
  catalogo: CatalogoAtributo[];
  selecoes: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const d = defaults;

  // Read-only (vendedora com só "ver"): mostra os valores, sem form nem upsert.
  if (readonly) {
    return (
      <dl className="flex max-w-md flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
        {catalogo.map((attr) => {
          const valor = attr.opcoes.find((o) => o.id === selecoes[attr.id])?.valor ?? "—";
          return <Linha key={attr.id} rotulo={attr.nome} valor={valor} />;
        })}
        <Linha rotulo="Algo a mais" valor={d.algoAMais || "—"} />
        <Linha rotulo="Não quer usar" valor={d.naoQuerUsar || "—"} />
        <Linha rotulo="Teto de orçamento" valor={d.tetoOrcamento ? `R$ ${d.tetoOrcamento}` : "—"} />
      </dl>
    );
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      <input type="hidden" name="leadId" value={leadId} />
      <CatalogoCampos catalogo={catalogo} selecoes={selecoes} />
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
