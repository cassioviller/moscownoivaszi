import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGetAlertaCaixa, getGetAlertaCaixaQueryKey } from "@workspace/api-client-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert, Info } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, diaMesAno } from "@/lib/formatos";

/**
 * "O caixa fica negativo em DD/MM" (E46) — o veredito da projeção onde a dona
 * da loja de fato olha: o dashboard e o hub de fluxo. A curva inteira continua
 * em `/financeiro/projecao`; daqui sai só o aviso e o caminho até ela.
 *
 * **Fica calado quando o caixa está bem.** Um bloco verde permanente de "tudo
 * certo" vira paisagem em uma semana, e junto com ele o dia em que não estiver.
 * Nada a dizer é nada na tela — o mesmo vale enquanto carrega e se a busca
 * falha.
 *
 * **F30/E103 — mas a AUSÊNCIA DE DADO não é "nada a dizer".** Sem saldo
 * conferido a curva não tem nível, e o alarme mais grave do sistema
 * simplesmente não aparecia: um sistema de alarme que **se desliga sozinho
 * quando a rotina diária não é feita, sem dizer que está desligado**. A
 * disciplina do silêncio é certa para "está tudo bem" e errada para "não sei".
 * Agora ele fala, em tom neutro, e leva ao gesto que o religa.
 *
 * O gate espelha o do servidor (a rota é do módulo financeiro): não OFERECE o
 * que a API negaria — mas quem manda é a API.
 */
export function AlertaCaixa() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const podeVer = podeNoModulo(acessosModulos, "financeiro", "ver");

  const { data } = useGetAlertaCaixa(activeLojaId!, {
    query: {
      queryKey: getGetAlertaCaixaQueryKey(activeLojaId!),
      enabled: !!activeLojaId && podeVer,
    },
  });

  if (!data) return null;

  // F30: sem âncora, o alarme está DESLIGADO — e dizer isso é o conserto.
  if (!data.ancorado) {
    return (
      <Alert data-testid="alerta-caixa-sem-ancora">
        <Info className="h-4 w-4" />
        <AlertTitle>A projeção está sem nível</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            Enquanto ninguém confere o saldo do caixa, a curva não tem de onde partir e o aviso de
            caixa negativo <strong>não aparece</strong> — mesmo que ele exista.
          </p>
          <Link
            to={`/loja/${lojaId}/financeiro/projecao`}
            className="inline-block font-medium underline underline-offset-4"
          >
            Conferir o saldo →
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data.diaNegativo) return null;

  return (
    <Alert variant="destructive" data-testid="alerta-caixa">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Caixa fica negativo em {diaMesAno(data.diaNegativo)}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          Pelo que está previsto para os próximos {data.horizonteDias} dias, partindo dos{" "}
          <span className="tabular-nums">{brl(data.saldoHoje ?? 0)}</span> de hoje
          {data.menorSaldo && (
            <>
              , o caixa chega a{" "}
              <span className="font-semibold tabular-nums">{brl(data.menorSaldo.valor)}</span>
              {data.menorSaldo.dia && <> em {diaMesAno(data.menorSaldo.dia)}</>}
            </>
          )}
          .
        </p>
        <Link
          to={`/loja/${lojaId}/financeiro/projecao`}
          className="inline-block font-medium underline underline-offset-4"
        >
          Ver a projeção →
        </Link>
      </AlertDescription>
    </Alert>
  );
}
