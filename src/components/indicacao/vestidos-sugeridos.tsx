// src/components/indicacao/vestidos-sugeridos.tsx
import type { VestidoIndicado } from "@/lib/indicacao/indicacao";

// Vestidos do acervo que conversam com o que a noiva pediu. Apresentação calma,
// peça de acervo (não item de estoque): nome em destaque editorial, afinidade
// dita por texto, bordô reservado ao número que importa. Sem foto grande.
export function VestidosSugeridos({ vestidos }: { vestidos: VestidoIndicado[] }) {
  if (vestidos.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[19px] font-light tracking-tight text-tinta">
          Vestidos para esta noiva
        </h2>
        <p className="text-[13px] text-cinza-fumo">
          Sugeridos pela afinidade com os interesses registrados.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {vestidos.map((v) => (
          <li
            key={v.id}
            className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave
              bg-papel-elevado px-5 py-4 shadow-[var(--mn-shadow-soft)]
              transition-shadow duration-200 ease-out hover:shadow-[var(--mn-shadow-hover)]"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[17px] font-light tracking-tight text-tinta">
                  {v.nome}
                </span>
                <span className="text-[12px] tracking-[0.02em] text-cinza-fumo">{v.codigo}</span>
              </div>
              <span className="shrink-0 text-[14px] text-grafite">
                R$ {v.precoBase}
                {!v.dentroDoOrcamento && (
                  <span className="ml-2 text-[11px] tracking-[0.02em] text-rose-dust">
                    acima do teto
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-cinza-fumo">
              <span className="text-grafite">
                Combina em <span className="font-medium text-bordo">{v.pontos}</span> de {v.total}
              </span>
              {v.combinam.length > 0 && <span aria-hidden>·</span>}
              {v.combinam.map((nome) => (
                <span
                  key={nome}
                  className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite"
                >
                  {nome}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
