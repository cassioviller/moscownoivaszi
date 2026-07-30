import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { comFiltros } from "@/lib/filtro-url";

/**
 * E129 — a busca digitada assenta (300ms) e vira `?q=` com `replace`; o que
 * está na URL É o filtro aplicado. O hook é a casca fina de duas verdades:
 *
 * 1. quem manda é a URL — voltar de uma ficha (ou abrir um link filtrado)
 *    adota o `q` da URL no input, nunca o contrário;
 * 2. digitação não escreve história — `replace`, e só quando o valor assentou
 *    E difere do que a URL já diz (senão o mount apagaria a página de quem
 *    chegou por link com `?pagina=3`).
 *
 * Mudar a busca zera `pagina` no MESMO gesto (cuidado c do backlog: buscar da
 * página 3 devolve um vazio falso). A decisão de escrita mora em
 * `lib/filtro-url.ts`, pura e testada; aqui é só o fio do React.
 */
export function useBuscaNaUrl(nome = "q"): [string, (valor: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const daUrl = searchParams.get(nome) ?? "";
  const [digitada, setDigitada] = useState(daUrl);
  const escrita = useRef(daUrl);

  useEffect(() => {
    // A URL mudou por navegação (voltar, link): o input adota.
    if (daUrl !== escrita.current) {
      escrita.current = daUrl;
      setDigitada(daUrl);
    }
  }, [daUrl]);

  useEffect(() => {
    const alvo = digitada.trim();
    if (alvo === escrita.current) return;
    const t = setTimeout(() => {
      escrita.current = alvo;
      setSearchParams((p) => comFiltros(p, { [nome]: alvo, pagina: null }), { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [digitada, nome, setSearchParams]);

  return [digitada, setDigitada];
}
