// src/components/catalogo/catalogo-campos.tsx
"use client";

import type { CatalogoAtributo } from "@/lib/catalogo/catalogo";

// Um <select> por atributo do catálogo (name="attr-<id>", "—" = vazio).
// Compartilhado por vestido e interesse — mesmo vocabulário, mesmo componente.
// `selecoes` (atributoId→opcaoId) prefilla na edição. Só lê tipos da lib, então
// não puxa código de servidor para o client.
export function CatalogoCampos({
  catalogo,
  selecoes,
}: {
  catalogo: CatalogoAtributo[];
  selecoes?: Record<string, string>;
}) {
  if (catalogo.length === 0) return null;
  return (
    <>
      {catalogo.map((attr) => (
        <label key={attr.id} htmlFor={`attr-${attr.id}`} className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{attr.nome}</span>
          <select
            id={`attr-${attr.id}`}
            name={`attr-${attr.id}`}
            defaultValue={selecoes?.[attr.id] ?? ""}
            className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
              transition-colors duration-150 ease-out hover:border-cinza-fumo focus:border-tinta focus:outline-none
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            <option value="">—</option>
            {attr.opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.valor}
              </option>
            ))}
          </select>
        </label>
      ))}
    </>
  );
}
