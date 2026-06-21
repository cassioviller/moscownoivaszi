// src/components/disponibilidade/registrar-manutencao.tsx
// "Registrar manutenção" escondido atrás de um gesto (disclosure), igual ao
// ReservaLivreInline: a ficha do vestido fica calma e o mini-form só aparece quando
// a vendedora quer registrar um cuidado. Linguagem de atelier (não de expedição):
// "Em manutenção desde / Previsão de retorno / Motivo". A Server Action chega por prop.
"use client";

import { useState } from "react";

const campoData =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta " +
  "transition-colors duration-150 focus-visible:border-bordo focus-visible:outline-none";

export function RegistrarManutencao({
  vestidoId,
  action,
}: {
  vestidoId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-11 w-fit items-center rounded-md border border-borda px-3.5 py-1.5
          text-[13px] text-grafite transition-colors duration-150 hover:border-bordo hover:text-bordo
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
      >
        Registrar manutenção
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="vestidoId" value={vestidoId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 sm:w-auto">
          <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
            Em manutenção desde
          </span>
          <input
            type="date"
            name="inicio"
            required
            aria-label="Em manutenção desde"
            className={`w-full sm:w-auto ${campoData}`}
          />
        </label>
        <label className="flex w-full flex-col gap-1 sm:w-auto">
          <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
            Previsão de retorno
          </span>
          <input
            type="date"
            name="fim"
            aria-label="Previsão de retorno (opcional)"
            className={`w-full sm:w-auto ${campoData}`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
          Motivo (opcional)
        </span>
        <input
          type="text"
          name="motivo"
          maxLength={120}
          placeholder="bainha, limpeza de mancha, ajuste de busto…"
          aria-label="Motivo da manutenção"
          className={`${campoData} placeholder:text-cinza-fumo`}
        />
      </label>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-borda px-4 py-2.5
            text-[13px] text-grafite transition-colors duration-150 hover:border-bordo hover:text-bordo
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          Registrar manutenção
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
            decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
            hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-bordo"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
