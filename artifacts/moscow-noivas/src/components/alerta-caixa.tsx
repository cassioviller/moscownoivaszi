import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGetAlertaCaixa, getGetAlertaCaixaQueryKey } from "@workspace/api-client-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, dataDia } from "@/lib/formatos";

/**
 * "O caixa fica negativo em DD/MM" (E46) — o veredito da projeção onde a dona
 * da loja de fato olha: o dashboard e o hub de fluxo. A curva inteira continua
 * em `/financeiro/projecao`; daqui sai só o aviso e o caminho até ela.
 *
 * **Fica calado quando o caixa está bem.** Um bloco verde permanente de "tudo
 * certo" vira paisagem em uma semana, e junto com ele o dia em que não estiver.
 * Nada a dizer é nada na tela — o mesmo vale enquanto carrega, se a busca
 * falha, ou se não há saldo conferido (aí a curva não tem nível e o alarme
 * seria falso; quem quiser ancorar já tem o "Conferir saldo" na projeção).
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

  if (!data?.ancorado || !data.diaNegativo) return null;

  return (
    <Alert variant="destructive" data-testid="alerta-caixa">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Caixa fica negativo em {dataDia(data.diaNegativo)}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          Pelo que está previsto para os próximos {data.horizonteDias} dias, partindo dos{" "}
          <span className="tabular-nums">{brl(data.saldoHoje ?? 0)}</span> de hoje
          {data.menorSaldo && (
            <>
              , o caixa chega a{" "}
              <span className="font-semibold tabular-nums">{brl(data.menorSaldo.valor)}</span>
              {data.menorSaldo.dia && <> em {dataDia(data.menorSaldo.dia)}</>}
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
