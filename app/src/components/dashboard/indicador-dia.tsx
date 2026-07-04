// src/components/dashboard/indicador-dia.tsx
// Indicador compacto do dia — tira do strip superior. Número grande editorial,
// rótulo pequeno, microdescrição. `atencao` marca um contador crítico: quando
// não-zero, a microdescrição vira bordô — o único toque de bordô-joia do strip
// (§6 do DESIGN: bordô em "contador crítico / etapa atual", raro e intencional).
import { iconeNav } from "@/components/layout/icones-nav";

export function IndicadorDia({
  rotulo,
  valor,
  descricao,
  atencao = false,
  icone,
}: {
  rotulo: string;
  valor: string | number;
  descricao: string;
  atencao?: boolean;
  icone?: string;
}) {
  const destacar = atencao && Number(valor) > 0;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado px-5 py-5 shadow-[var(--mn-shadow-soft)] transition hover:-translate-y-[2px] hover:shadow-[var(--mn-shadow-hover)]">
      {icone && (
        <div className="grid h-9 w-9 place-items-center rounded-[var(--mn-radius-md)] bg-papel-suave text-bordo">
          {iconeNav(icone)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[34px] font-semibold leading-none tabular-nums text-tinta">{valor}</span>
        <p className="text-[13px] text-tinta">{rotulo}</p>
        <p className={`text-[11.5px] ${destacar ? "text-bordo" : "text-cinza-fumo"}`}>{descricao}</p>
      </div>
    </div>
  );
}
