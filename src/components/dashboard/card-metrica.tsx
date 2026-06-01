// Card de indicador — "resumo de concierge", não KPI frio (DESIGN §10): rótulo
// pequeno, número grande editorial, microdescrição e link discreto opcional.
// Papel nobre: superfície elevada (fio claro + sombra suave) sobre o marfim.
import { LinkDiscreto } from "./link-discreto";

export function CardMetrica({
  rotulo,
  valor,
  descricao,
  acao,
}: {
  rotulo: string;
  valor: string | number;
  descricao: string;
  acao?: { href: string; label: string };
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{rotulo}</p>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[44px] font-medium leading-none tracking-[-0.02em] text-tinta">
            {valor}
          </span>
          <span className="text-[13px] text-cinza-fumo">{descricao}</span>
        </div>
      </div>
      {acao ? <LinkDiscreto {...acao} /> : null}
    </section>
  );
}
