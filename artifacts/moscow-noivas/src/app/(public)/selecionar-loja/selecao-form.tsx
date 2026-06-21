"use client";

import { useFormStatus } from "react-dom";
import { selecionarLojaAction } from "./actions";

interface LojaOpcao {
  id: string;
  nome: string;
}

export function SelecaoForm({
  lojas,
  erro,
}: {
  lojas: LojaOpcao[];
  erro: boolean;
}) {
  return (
    <form action={selecionarLojaAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Lojas disponíveis</legend>
        {lojas.map((loja, i) => (
          <label
            key={loja.id}
            className="
              flex items-center gap-3 cursor-pointer
              rounded-md border border-borda bg-papel-elevado px-4 py-3
              text-[15px] text-tinta
              transition-colors duration-150 ease-out
              hover:border-cinza-fumo
              has-[:checked]:border-tinta has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bordo
            "
          >
            <input
              type="radio"
              name="lojaId"
              value={loja.id}
              defaultChecked={i === 0}
              required
              className="accent-bordo"
            />
            <span>{loja.nome}</span>
          </label>
        ))}
      </fieldset>
      <Submit />
      {erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          Você não tem acesso a essa loja. Escolha uma da lista.
        </p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="
        inline-flex items-center justify-center
        rounded-md bg-bordo px-4 py-2.5
        text-[14px] font-medium tracking-[0.01em] text-papel
        transition-colors duration-150 ease-out
        hover:bg-bordo-hover
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
        disabled:opacity-40 disabled:cursor-not-allowed
      "
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}
