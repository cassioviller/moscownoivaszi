// Painel de estado vazio elegante — para blocos ainda sem dado (agenda, atenções,
// jornada) e para o acervo vazio. NÃO exibe número falso: rótulo + microcopy humana
// e, opcionalmente, um link discreto. Mesma superfície de papel nobre dos cards.
import { LinkDiscreto } from "./link-discreto";

export function PainelVazio({
  titulo,
  mensagem,
  acao,
}: {
  titulo: string;
  mensagem: string;
  acao?: { href: string; label: string };
}) {
  return (
    <section className="flex min-h-[160px] flex-col rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-5 py-5 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[12px] uppercase tracking-[0.18em] text-cinza-fumo">{titulo}</p>
      <div className="flex flex-1 flex-col items-start justify-center gap-3 py-3">
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-grafite">{mensagem}</p>
        {acao ? <LinkDiscreto {...acao} /> : null}
      </div>
    </section>
  );
}
