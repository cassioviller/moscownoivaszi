// Indicador compacto do dia — tira do strip superior. Número grande editorial,
// rótulo pequeno, microdescrição. `atencao` marca um contador crítico: quando
// não-zero, o número vira bordô — o único toque de bordô-joia do strip (§6 do
// DESIGN: bordô em "contador crítico / etapa atual", raro e intencional).
export function IndicadorDia({
  rotulo,
  valor,
  descricao,
  atencao = false,
}: {
  rotulo: string;
  valor: string | number;
  descricao: string;
  atencao?: boolean;
}) {
  const destacar = atencao && Number(valor) > 0;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-5 py-5 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</p>
      <span
        className={`font-display text-[32px] font-medium leading-none tracking-[-0.02em] ${
          destacar ? "text-bordo" : "text-tinta"
        }`}
      >
        {valor}
      </span>
      <p className="text-[12px] text-cinza-fumo">{descricao}</p>
    </div>
  );
}
