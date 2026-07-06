// src/app/(app)/loja/[lojaId]/catalogo/atributo-form.tsx
"use client";

import { useActionState } from "react";
import type { AtributoFormState } from "./actions";
import type { AtributoAdmin } from "@/lib/catalogo/catalogo";

const INICIAL: AtributoFormState = { erro: null };

const campoCls =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta " +
  "placeholder:text-cinza-fumo transition-colors duration-150 ease-out hover:border-cinza-fumo " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

const TIPOS = [
  { v: "OPCAO_UNICA", l: "Opção única" },
  { v: "ESCALA", l: "Escala (grau)" },
];

// Form único de criação/edição de atributo. `atributo` presente = modo edição:
// mostra o estado ativo, as opções já existentes (renomear / ativar) e um campo
// para adicionar novas. Opções nunca são apagadas (podem estar em uso) — só
// desativadas. Sem `atributo` = criação simples (nome, tipo, opções iniciais).
export function AtributoForm({
  action,
  submitLabel,
  atributo,
}: {
  action: (prev: AtributoFormState, fd: FormData) => Promise<AtributoFormState>;
  submitLabel: string;
  atributo?: AtributoAdmin;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const editando = Boolean(atributo);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      {atributo && <input type="hidden" name="atributoId" value={atributo.id} />}

      <label htmlFor="a-nome" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">Nome</span>
        <input
          id="a-nome"
          name="nome"
          type="text"
          defaultValue={atributo?.nome}
          required
          autoFocus
          placeholder="Ex.: Decote, Volume da saia"
          className={campoCls}
        />
      </label>

      <label htmlFor="a-tipo" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">Tipo</span>
        <select id="a-tipo" name="tipo" defaultValue={atributo?.tipo ?? "OPCAO_UNICA"} className={campoCls}>
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.l}
            </option>
          ))}
        </select>
      </label>

      {editando && (
        <label htmlFor="a-ativo" className="flex items-center gap-2.5">
          <input
            id="a-ativo"
            name="ativo"
            type="checkbox"
            defaultChecked={atributo!.ativo}
            className="h-4 w-4 accent-[var(--color-bordo)]"
          />
          <span className="text-[13px] text-grafite">Atributo ativo (aparece nos formulários)</span>
        </label>
      )}

      {atributo && atributo.opcoes.length > 0 && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-[12px] font-medium tracking-[0.01em] text-grafite">Opções</legend>
          {atributo.opcoes.map((o) => (
            <div key={o.id} className="flex items-center gap-2.5">
              <input type="hidden" name="opcaoIds" value={o.id} />
              <input
                name={`opcao-${o.id}`}
                type="text"
                defaultValue={o.valor}
                aria-label={`Opção ${o.valor}`}
                className={`flex-1 ${campoCls}`}
              />
              <label className="flex items-center gap-1.5 text-[12px] text-cinza-fumo">
                <input
                  name={`opcaoAtivo-${o.id}`}
                  type="checkbox"
                  defaultChecked={o.ativo}
                  className="h-4 w-4 accent-[var(--color-bordo)]"
                />
                ativa
              </label>
            </div>
          ))}
        </fieldset>
      )}

      <label htmlFor="a-novas" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">
          {editando ? "Adicionar opções (uma por linha)" : "Opções (uma por linha)"}
        </span>
        <textarea
          id="a-novas"
          name="novasOpcoes"
          rows={4}
          placeholder={"Tomara que caia\nV\nCoração"}
          className={campoCls}
        />
      </label>

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
