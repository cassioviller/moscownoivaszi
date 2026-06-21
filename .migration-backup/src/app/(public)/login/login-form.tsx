"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const INICIAL: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        autoFocus
      />
      <Field
        id="senha"
        label="Senha"
        type="password"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={pending}
        className="
          mt-2 inline-flex items-center justify-center
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
      {state.erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  autoFocus?: boolean;
}

function Field({ id, label, type, autoComplete, autoFocus }: FieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="
          rounded-md border border-borda bg-papel-elevado
          px-3 py-2.5 text-[15px] text-tinta placeholder:text-cinza-fumo
          transition-colors duration-150 ease-out
          hover:border-cinza-fumo
          focus:border-tinta focus:outline-none
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
        "
      />
    </label>
  );
}
