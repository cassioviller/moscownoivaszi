// Cabeçalho da "mesa do atelier" — presentacional puro: recebe saudação e data já
// computadas no servidor (page). Tipografia editorial (font-display) no nome do dia.
export function SaudacaoDia({
  saudacao,
  nome,
  dataFormatada,
  lojaNome,
}: {
  saudacao: string;
  nome: string;
  dataFormatada: string;
  lojaNome: string;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-[12px] uppercase tracking-[0.22em] text-cinza-fumo">
        {dataFormatada}
      </p>
      <h1 className="font-display text-[30px] font-medium leading-tight text-tinta">
        {saudacao}, {nome}.
      </h1>
      <p className="text-[14px] text-cinza-fumo">{lojaNome}</p>
    </header>
  );
}
