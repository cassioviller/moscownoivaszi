// Indicador compacto do dia — tira do strip superior. Número grande editorial,
// rótulo pequeno, microdescrição. Sem bordô (reservado a CTA/foco/etapa atual).
export function IndicadorDia({
  rotulo,
  valor,
  descricao,
}: {
  rotulo: string;
  valor: string | number;
  descricao: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-5 py-5 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</p>
      <span className="font-display text-[32px] font-medium leading-none tracking-[-0.02em] text-tinta">
        {valor}
      </span>
      <p className="text-[12px] text-cinza-fumo">{descricao}</p>
    </div>
  );
}
