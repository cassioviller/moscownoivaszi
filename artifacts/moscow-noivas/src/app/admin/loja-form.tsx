"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { criarLojaAction } from "./actions";

export function LojaForm() {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await criarLojaAction(fd);
        ref.current?.reset();
      }}
      className="flex items-end gap-3"
    >
      <label htmlFor="loja-nome" className="flex flex-col gap-1.5 flex-1">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">
          Nome da loja
        </span>
        <input
          id="loja-nome"
          name="nome"
          type="text"
          required
          placeholder="Ex.: Moscow Noivas — Filial Centro"
          className="
            rounded-md border border-borda bg-papel-elevado
            px-3 py-2.5 text-[15px] text-tinta placeholder:text-cinza-fumo
            transition-colors duration-150 ease-out
            hover:border-cinza-fumo focus:border-tinta focus:outline-none
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          "
        />
      </label>
      <Submit>Criar loja</Submit>
    </form>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="
        inline-flex items-center justify-center
        rounded-md border border-borda bg-papel-elevado px-4 py-2.5
        text-[14px] font-medium tracking-[0.01em] text-tinta
        transition-colors duration-150 ease-out
        hover:border-cinza-fumo
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
        disabled:opacity-40 disabled:cursor-not-allowed
      "
    >
      {pending ? "Criando…" : children}
    </button>
  );
}
