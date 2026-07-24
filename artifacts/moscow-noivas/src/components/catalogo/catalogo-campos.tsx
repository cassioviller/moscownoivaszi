import type { Atributo } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";

/** Seleções por atributo: { [atributoId]: opcaoId }. */
export type SelecoesCatalogo = Record<string, string>;

interface CatalogoCamposProps {
  catalogo: Atributo[];
  selecoes: SelecoesCatalogo;
  onChange: (atributoId: string, opcaoId: string | null) => void;
  disabled?: boolean;
}

/**
 * Um select por atributo ativo do catálogo (Decote, Volume da saia, …), com as
 * opções ativas ordenadas. Compartilhado pelos forms de vestido e de
 * interesses da noiva.
 */
export function CatalogoCampos({ catalogo, selecoes, onChange, disabled }: CatalogoCamposProps) {
  const ativos = catalogo.filter((a) => a.ativo);
  if (ativos.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ativos.map((atributo) => {
        const opcoes = (atributo.opcoes ?? [])
          .filter((o) => o.ativo)
          .sort((a, b) => a.ordem - b.ordem);
        return (
          <div key={atributo.id} className="space-y-1.5">
            <Label htmlFor={`catalogo-${atributo.id}`}>{atributo.nome}</Label>
            <select
              id={`catalogo-${atributo.id}`}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              value={selecoes[atributo.id] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(atributo.id, e.target.value || null)}
              data-testid={`select-catalogo-${atributo.id}`}
            >
              <option value="">—</option>
              {opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.valor}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
