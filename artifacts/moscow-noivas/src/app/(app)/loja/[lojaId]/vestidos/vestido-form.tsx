// src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx
"use client";

import { useActionState } from "react";
import type { VestidoFormState } from "./actions";
import type { CatalogoAtributo } from "@/lib/catalogo/catalogo";
import { CatalogoCampos } from "@/components/catalogo/catalogo-campos";

type Defaults = {
  codigo?: string;
  nome?: string;
  precoBase?: string;
  tamanho?: string;
  cor?: string;
  categoria?: string;
  observacoes?: string;
};

const INICIAL: VestidoFormState = { erro: null };

export function VestidoForm({
  action,
  defaults,
  vestidoId,
  submitLabel,
  catalogo,
  selecoes,
}: {
  action: (prev: VestidoFormState, fd: FormData) => Promise<VestidoFormState>;
  defaults?: Defaults;
  vestidoId?: string;
  submitLabel: string;
  catalogo: CatalogoAtributo[];
  selecoes?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const d = defaults ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-md">
      {vestidoId && <input type="hidden" name="vestidoId" value={vestidoId} />}
      <Field id="v-codigo" name="codigo" label="Código" defaultValue={d.codigo} required autoFocus />
      <Field id="v-nome" name="nome" label="Nome" defaultValue={d.nome} required />
      <Field id="v-preco" name="precoBase" label="Preço (R$)" defaultValue={d.precoBase} inputMode="decimal" required />

      {catalogo.length > 0 && (
        <>
          <p className="mt-1 text-[12px] font-medium tracking-[0.01em] text-cinza-fumo">
            Características — usadas para indicar este vestido às noivas
          </p>
          <CatalogoCampos catalogo={catalogo} selecoes={selecoes} />
        </>
      )}

      <p className="text-[12px] font-medium tracking-[0.01em] text-cinza-fumo mt-1">Opcional</p>
      <Field id="v-tamanho" name="tamanho" label="Tamanho" defaultValue={d.tamanho} />
      <Field id="v-cor" name="cor" label="Cor" defaultValue={d.cor} />
      <Field id="v-categoria" name="categoria" label="Categoria" defaultValue={d.categoria} />
      <label htmlFor="v-obs" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">Observações</span>
        <textarea
          id="v-obs"
          name="observacoes"
          defaultValue={d.observacoes}
          rows={3}
          className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
            transition-colors duration-150 ease-out hover:border-cinza-fumo focus:border-tinta focus:outline-none
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex items-center justify-center w-fit rounded-md bg-bordo px-4 py-2.5
          text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
          hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          disabled:opacity-40 disabled:cursor-not-allowed"
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
  inputMode,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "decimal";
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        inputMode={inputMode}
        className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
          placeholder:text-cinza-fumo transition-colors duration-150 ease-out hover:border-cinza-fumo
          focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
      />
    </label>
  );
}
