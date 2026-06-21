// Cabeçalho da "mesa do atelier" — presentacional puro: recebe saudação e data já
// computadas no servidor (page). Tipografia editorial (font-display) no nome — maior
// e com mais respiro para ancorar a página visualmente (DESIGN §3: tipografia carrega peso).
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
    <header className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.22em] text-cinza-fumo">
        {dataFormatada}
      </p>
      <h1 className="font-display text-[38px] font-medium leading-[1.1] tracking-[-0.01em] text-tinta">
        {saudacao}, {nome}.
      </h1>
      <p className="text-[13px] text-cinza-fumo">{lojaNome}</p>
    </header>
  );
}
