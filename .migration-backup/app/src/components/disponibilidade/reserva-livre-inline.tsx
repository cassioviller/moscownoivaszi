// src/components/disponibilidade/reserva-livre-inline.tsx
// Reserva "qualquer vestido livre" com busca SOB DEMANDA: a lista completa de
// peças livres só é calculada quando a vendedora clica para abrir — o perfil da
// noiva não varre o acervo a cada carregamento. As Server Actions chegam por prop.
"use client";

import { useState } from "react";
import { SelectNativo } from "@/components/ui/select-nativo";
import type { VestidoLivre } from "@/lib/disponibilidade/reservas";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ReservaLivreInline({
  leadId,
  reservar,
  buscarLivres,
}: {
  leadId: string;
  reservar: (formData: FormData) => void | Promise<void>;
  buscarLivres: (leadId: string) => Promise<VestidoLivre[]>;
}) {
  const [livres, setLivres] = useState<VestidoLivre[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  async function abrir() {
    setCarregando(true);
    setErro(false);
    try {
      setLivres(await buscarLivres(leadId));
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }

  // aria-live anuncia a troca (botão → seletor / mensagem) p/ leitores de tela;
  // aria-busy sinaliza a busca em curso (WCAG 4.1.3).
  return (
    <div aria-live="polite" aria-busy={carregando}>
      {livres === null ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={abrir}
            disabled={carregando}
            className="inline-flex min-h-11 w-fit items-center rounded-md border border-borda px-3.5 py-1.5
              text-[13px] text-grafite transition-colors duration-150 hover:border-bordo hover:text-bordo
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
              disabled:opacity-50"
          >
            {carregando
              ? "Buscando vestidos livres…"
              : erro
                ? "Não foi possível buscar. Tentar de novo"
                : "Reservar um vestido"}
          </button>
          {erro && (
            <span className="text-[12px] text-cinza-fumo">Algo deu errado ao buscar os vestidos livres.</span>
          )}
        </div>
      ) : livres.length === 0 ? (
        <p className="text-[13px] text-cinza-fumo">Nenhum vestido do acervo está livre para esta data.</p>
      ) : (
        <form action={reservar} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="leadId" value={leadId} />
          <SelectNativo name="vestidoId" label="Reservar vestido" placeholder="Escolha um vestido livre…">
            {livres.map((vl) => (
              <option key={vl.id} value={vl.id}>
                {vl.codigo} · {vl.nome} · {brl.format(Number(vl.precoBase))}
              </option>
            ))}
          </SelectNativo>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-bordo px-4 py-2.5
              text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
              hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Reservar
          </button>
        </form>
      )}
    </div>
  );
}
