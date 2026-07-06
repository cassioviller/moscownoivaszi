// src/components/ui/select-nativo.tsx
// Seletor nativo com acabamento da casa: appearance-none + chevron fino em
// champagne/cinza, foco em bordô, rótulo associado (aria-label). Server component
// (a interação é o próprio <select> nativo — sem JS de cliente). Resolve o ponto
// "formulário de sistema" mantendo o <select> acessível e progressivo.
import type { ReactNode } from "react";

export function SelectNativo({
  name,
  label,
  placeholder,
  children,
  className,
}: {
  name: string;
  label: string;
  placeholder: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-[14rem] flex-1 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{label}</span>
      <div className="relative">
        <select
          name={name}
          aria-label={label}
          defaultValue=""
          className="w-full appearance-none rounded-md border border-borda bg-papel-elevado px-3 py-2.5 pr-9
            text-[14px] text-tinta transition-colors duration-150 focus-visible:border-bordo
            focus-visible:outline-none"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {children}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cinza-fumo"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </label>
  );
}
