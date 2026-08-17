import { useEffect, useState } from "react";
import { addDias, hojeLocal, inicioDoDia } from "@/lib/financeiro/datas";

/**
 * **S-RM7 — o dia de hoje numa aba que ninguém recarrega.**
 *
 * `hojeLocal()` responde certo sempre que é chamado; o problema é que uma tela
 * de React só o chama quando renderiza, e uma aba deixada aberta atravessa a
 * meia-noite sem renderizar. O sino é o caso vivo: a lista de avisos nasce num
 * `useMemo`, os ids carregam a assinatura do fato (S-R17) e um deles é o DIA —
 * então às 00h00 o aviso continuava com o id de ontem, e com ele a dispensa de
 * ontem.
 *
 * O hook devolve o dia local (`YYYY-MM-DD`) e **re-renderiza uma vez por
 * virada**, agendando um timer para a próxima meia-noite de São Paulo. Não há
 * intervalo de sondagem: entre uma virada e outra ele custa zero.
 *
 * Ele devolve uma **string**, e é isso que o torna barato como dependência: o
 * E253 declarou a S-RM7 em vez de consertá-la por temer que "o conserto
 * recalcularia a lista a cada render", e recalcularia mesmo se o dia chegasse
 * como um `Date` ou um objeto novo por render. String igual é `Object.is`
 * igual — `sino-virada-do-dia.test.tsx` prega o corpo do `useMemo` rodando
 * **uma vez** em quatro renders.
 */
export function useDiaLocal(): string {
  const [dia, setDia] = useState(hojeLocal);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      timer = setTimeout(() => {
        if (!vivo) return;
        setDia(hojeLocal());
        agendar();
      }, msAteAProximaVirada());
    };
    agendar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, []);

  return dia;
}

/**
 * Milissegundos até a próxima meia-noite local, com piso de 1 s.
 *
 * O piso é a tranca contra o timer que dispara um milissegundo ANTES da
 * virada: `setDia` receberia o mesmo dia, o React descartaria o render e —
 * sem o piso — o reagendamento pediria ~0 ms num laço apertado. Com ele, o
 * disparo prematuro custa uma segunda espera de 1 s e acerta.
 */
function msAteAProximaVirada(): number {
  const proximaVirada = inicioDoDia(addDias(hojeLocal(), 1)).getTime();
  return Math.max(proximaVirada - Date.now(), 1_000);
}
