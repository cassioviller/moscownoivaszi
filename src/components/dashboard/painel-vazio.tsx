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
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{titulo}</p>
      <div className="flex flex-1 flex-col gap-3">
        <p className="max-w-[46ch] text-[14px] leading-[1.65] text-grafite">{mensagem}</p>
        {acao ? <LinkDiscreto {...acao} /> : null}
      </div>
    </section>
  );
}
