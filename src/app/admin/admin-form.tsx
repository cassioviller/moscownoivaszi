"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { criarAdminAction } from "./actions";

interface LojaOpcao {
  id: string;
  nome: string;
}

export function AdminForm({ lojas }: { lojas: LojaOpcao[] }) {
  const ref = useRef<HTMLFormElement>(null);

  if (lojas.length === 0) {
    return (
      <p className="text-[14px] leading-relaxed text-grafite">
        Crie uma loja primeiro — todo admin precisa estar vinculado a pelo menos uma.
      </p>
    );
  }

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await criarAdminAction(fd);
        ref.current?.reset();
      }}
      className="flex flex-col gap-5 max-w-md"
    >
      <Field id="admin-nome" name="nome" label="Nome" type="text" autoComplete="name" />
      <Field id="admin-email" name="email" label="E-mail" type="email" autoComplete="off" />
      <Field
        id="admin-senha"
        name="senha"
        label="Senha inicial (mín. 8 caracteres)"
        type="password"
        autoComplete="new-password"
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] font-medium tracking-[0.01em] text-grafite mb-1">
          Lojas deste admin
        </legend>
        {lojas.map((loja) => (
          <label
            key={loja.id}
            className="
              flex items-center gap-3 cursor-pointer
              rounded-md border border-borda bg-papel-elevado px-3 py-2.5
              text-[14px] text-tinta
              transition-colors duration-150 ease-out
              hover:border-cinza-fumo has-[:checked]:border-tinta
            "
          >
            <input type="checkbox" name="lojaIds" value={loja.id} className="accent-bordo" />
            <span>{loja.nome}</span>
          </label>
        ))}
      </fieldset>

      <Submit />
    </form>
  );
}

interface FieldProps {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
}

function Field({ id, name, label, type, autoComplete }: FieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="
          rounded-md border border-borda bg-papel-elevado
          px-3 py-2.5 text-[15px] text-tinta placeholder:text-cinza-fumo
          transition-colors duration-150 ease-out
          hover:border-cinza-fumo focus:border-tinta focus:outline-none
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
        "
      />
    </label>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="
        mt-1 inline-flex items-center justify-center w-fit
        rounded-md bg-bordo px-4 py-2.5
        text-[14px] font-medium tracking-[0.01em] text-papel
        transition-colors duration-150 ease-out
        hover:bg-bordo-hover
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
        disabled:opacity-40 disabled:cursor-not-allowed
      "
    >
      {pending ? "Cadastrando…" : "Cadastrar admin"}
    </button>
  );
}
