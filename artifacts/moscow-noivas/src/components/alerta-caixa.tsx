import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGetAlertaCaixa, getGetAlertaCaixaQueryKey } from "@workspace/api-client-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert, Info } from "lucide-react";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, diaMesAno } from "@/lib/formatos";
import { hojeLocal } from "@/lib/financeiro/datas";

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
 *
 * **S-D35 — o silêncio continua silêncio, mas o LUGAR dele é reservado
 * enquanto a consulta conta.** Este era o TERCEIRO cartão que nascia de
 * repente no topo do painel, ACIMA dos dois que `3c463bb` já tinha ancorado
 * com esqueleto (`dashboard.tsx`, `AvisoCarregando`): quando o alerta existe,
 * ele empurrava a página inteira para baixo depois da pintura. A forma é a
 * MESMA dos irmãos — a frase fixa, repetida invisível, faz a caixa do
 * esqueleto bater com a do cartão em qualquer largura — e a decisão de estado
 * é a mesma régua (`lib/estado-consulta`): consulta desligada por permissão
 * não prende a tela, e erro segue calado, como o docblock acima decide.
 */

// A frase FIXA do aviso de âncora — usada no cartão e, invisível, no esqueleto
// que reserva o lugar dele (o mesmo truque do `AvisoCarregando` da S-D10). É
// um fragmento, e não string, para o `<strong>` valer nos dois lugares: com
// a MESMA marcação, a quebra de linha do esqueleto é a do cartão.
const FRASE_SEM_ANCORA = (
  <>
    Enquanto ninguém confere o saldo do caixa, a curva não tem de onde partir e o aviso de caixa
    negativo <strong>não aparece</strong> — mesmo que ele exista.
  </>
);

export function AlertaCaixa() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const podeVer = podeNoModulo(acessosModulos, "financeiro", "ver");

  const consulta = useGetAlertaCaixa(activeLojaId!, {
    query: {
      queryKey: getGetAlertaCaixaQueryKey(activeLojaId!),
      enabled: !!activeLojaId && podeVer,
    },
  });
  const { data } = consulta;

  // S-D35: enquanto conta, o lugar fica reservado — a estrutura do esqueleto
  // repete a do cartão (título de uma linha + a frase fixa, invisível, e a
  // linha do link), então a troca esqueleto → cartão não move um pixel. O
  // `pl-7` espelha o recuo que o ícone (`[&>svg~*]:pl-7`) dá ao cartão real.
  if (estadoDasConsultas(consulta) === "carregando") {
    return (
      <Alert className="animate-pulse" aria-busy="true" aria-label="Conferindo a projeção do caixa">
        <div className="pl-7">
          <div className="mb-1 h-4 w-56 max-w-full rounded bg-muted" />
          <div className="space-y-1 text-sm">
            <p className="invisible" aria-hidden="true">
              {FRASE_SEM_ANCORA}
            </p>
            <span className="invisible inline-block font-medium" aria-hidden="true">
              Conferir o saldo →
            </span>
          </div>
        </div>
      </Alert>
    );
  }

  // Erro e consulta desligada seguem a disciplina do docblock: nada na tela.
  if (!data) return null;

  // F30: sem âncora, o alarme está DESLIGADO — e dizer isso é o conserto.
  if (!data.ancorado) {
    return (
      <Alert data-testid="alerta-caixa-sem-ancora">
        <Info className="h-4 w-4" />
        <AlertTitle>A projeção está sem nível</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>{FRASE_SEM_ANCORA}</p>
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

  // S-M4: quando o primeiro dia negativo é HOJE (a loja já está no vermelho),
  // "fica negativo em <data>" seria uma frase falsa sobre um fato presente.
  const jaNegativo = data.diaNegativo <= hojeLocal();

  return (
    <Alert variant="destructive" data-testid="alerta-caixa">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>
        {jaNegativo ? "O caixa já está negativo" : `Caixa fica negativo em ${diaMesAno(data.diaNegativo)}`}
      </AlertTitle>
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
