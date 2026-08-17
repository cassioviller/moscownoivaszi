import { ArrowLeftRight } from "lucide-react";
import { pontasTrocadas, resolverIntervalo } from "@/lib/financeiro/datas";
import { diaMesAno } from "@/lib/formatos";

/**
 * S-RM28 (E265) — **a janela não reinterpreta o gesto em silêncio.**
 *
 * As quatro telas de janela do financeiro leem `?ini=&fim=` pelo
 * `resolverIntervalo`, que TROCA as pontas quando a primeira fica depois da
 * segunda (`financeiro-core/src/datas.ts:188`). A troca é boa — ela é o que
 * torna uma URL montada à mão tolerável, e as duas rotas de API que a
 * consomem dependem dela. O que faltava é a tela dizer que trocou: hoje a
 * pessoa digita `De = 31/08/2026` sobre um `Até = 01/01/2026`, o campo "De"
 * passa a exibir **outra data** — a que o sistema decidiu — e nada na tela
 * explica por quê. Na folha, esse intervalo alimenta um carimbo de mão única.
 *
 * **O aviso mora num componente só, e não em quatro cópias**, porque o cuidado
 * escrito de quatro jeitos é o cuidado que o quinto sítio esquece (regra 26).
 * Ele diz a janela RESULTANTE por extenso, e não só que houve troca: quem
 * carimba precisa ler o período que vai carimbar, não uma advertência.
 */
export const AVISO_PONTAS_TROCADAS_TESTID = "aviso-pontas-trocadas";

export function AvisoPontasTrocadas({ ini, fim }: { ini: string | null; fim: string | null }) {
  if (!pontasTrocadas(ini, fim)) return null;
  const { iniYMD, fimYMD } = resolverIntervalo(ini, fim);
  return (
    <p
      data-testid={AVISO_PONTAS_TROCADAS_TESTID}
      role="status"
      className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
    >
      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      As datas estavam invertidas e foram trocadas: a janela vai de {diaMesAno(iniYMD)} a{" "}
      {diaMesAno(fimYMD)}.
    </p>
  );
}
