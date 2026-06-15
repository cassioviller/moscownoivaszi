// src/components/indicacao/vestidos-sugeridos.tsx
import Link from "next/link";
import type { VestidoIndicado } from "@/lib/indicacao/indicacao";

// Quando presente, liga a sugestão à ação de reservar (perfil da noiva): fecha
// desejo→ação no mesmo lugar. `livresIds` = peças livres para a data dela;
// `reservadosIds` = peças que ela já reservou. Ausente → componente read-only
// (ex.: tela de interesses), comportamento de antes.
export type ReservaSugestao = {
  action: (formData: FormData) => void | Promise<void>;
  leadId: string;
  livresIds: string[];
  reservadosIds: string[];
  /** Data do casamento formatada (ex.: "12/09") — ecoa a promessa no botão. */
  dataLabel?: string;
};

// Vestidos do acervo que conversam com o que a noiva pediu. Apresentação calma,
// peça de acervo (não item de estoque): nome em destaque editorial, afinidade
// dita por texto, bordô reservado ao número que importa. Sem foto grande.
//
// `naoQuerUsar` (texto livre) aparece como LEMBRETE: a indicação não consegue
// filtrar por ele automaticamente, então a vendedora aplica o julgamento.
export function VestidosSugeridos({
  vestidos,
  naoQuerUsar,
  reserva,
  acervoHref,
}: {
  vestidos: VestidoIndicado[];
  naoQuerUsar?: string | null;
  reserva?: ReservaSugestao;
  /** Quando presente, mostra "Ver acervo completo →": a curadoria é top-6 por afinidade. */
  acervoHref?: string;
}) {
  if (vestidos.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[19px] font-light tracking-tight text-tinta">
            Vestidos para esta noiva
          </h2>
          <p className="text-[13px] text-cinza-fumo">
            As seis de maior afinidade com os interesses registrados.
          </p>
        </div>
        {acervoHref && (
          <Link
            href={acervoHref}
            className="w-fit rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Ver acervo completo
          </Link>
        )}
      </div>

      {naoQuerUsar && (
        <p className="rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave px-4 py-2.5 text-[13px] text-grafite">
          <span className="text-cinza-fumo">A noiva não quer usar:</span> {naoQuerUsar}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vestidos.map((v) => (
          <li
            key={v.id}
            className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave
              bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]
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

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="text-grafite">
                  Combina em <span className="font-medium text-bordo">{v.pontos}</span> de {v.total}
                </span>
                {v.combinam.map((c) => (
                  <span
                    key={c.nome}
                    className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite"
                  >
                    {c.nome}: <span className="text-tinta">{c.valor}</span>
                  </span>
                ))}
              </div>
              {v.faltam.length > 0 && (
                <p className="text-[12px] text-cinza-fumo">Não atende: {v.faltam.join(", ")}</p>
              )}
            </div>

            {/* Reservar direto da sugestão — só com a ação ligada e data definida.
                Botão secundário (contorno), não bordô cheio: o CTA principal mora na
                seção "Vestido reservado". */}
            {reserva && (
              <div className="border-t border-borda-suave pt-3">
                {reserva.reservadosIds.includes(v.id) ? (
                  <p className="text-[12px] text-cinza-fumo">Reservado para esta noiva.</p>
                ) : reserva.livresIds.includes(v.id) ? (
                  <form action={reserva.action}>
                    <input type="hidden" name="leadId" value={reserva.leadId} />
                    <input type="hidden" name="vestidoId" value={v.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center rounded-md border border-borda px-3.5 py-1.5
                        text-[13px] text-grafite transition-colors duration-150 hover:border-bordo hover:text-bordo
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                    >
                      {reserva.dataLabel ? `Reservar para ${reserva.dataLabel}` : "Reservar para o casamento"}
                    </button>
                  </form>
                ) : (
                  <p className="text-[12px] text-cinza-fumo">Indisponível para a data dela.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
