import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mensagemApi } from "@/lib/erro-api";

/**
 * E99 — a camada que faltava ENTRE os tokens e as telas.
 *
 * O sistema de tokens saiu bem da rodada 6 (uma cor cinza crua em `pages/`
 * inteiro, dark mode íntegro). O buraco é o degrau seguinte: cada tela
 * reinventava carregando, erro e vazio, e as versões divergiam justamente onde
 * custa — três desenhos vivos para o mesmo erro (`EstadoErro`, `ErroListagem` e
 * `<Alert>` inline), sete variações de esqueleto, e trinta frases de vazio
 * soltas, quatro delas em sequência na ficha de uma noiva nova.
 *
 * Aqui a decisão é tomada uma vez.
 */

/**
 * Carregando. A forma importa: um esqueleto que não parece o conteúdo que vem
 * depois causa o salto de layout que ele deveria evitar.
 */
export function Carregando({
  forma = "lista",
  linhas = 5,
}: {
  forma?: "lista" | "cards" | "detalhe";
  linhas?: number;
}) {
  if (forma === "detalhe") {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
        <div className="bg-muted h-10 w-64 rounded" />
        <div className="bg-muted h-64 rounded-lg" />
      </div>
    );
  }
  if (forma === "cards") {
    return (
      <div
        className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando"
      >
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="bg-muted h-48 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="bg-muted h-14 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Erro de carregamento, com saída.
 *
 * **Este componente consertou um bug ao nascer.** O `EstadoErro` que ele
 * substitui ainda fazia `erro instanceof Error ? erro.message` — a perna que o
 * E92 matou no `mensagemApi` por mostrar "HTTP 404 Not Found" na cara de quem
 * vende. Ela sobreviveu escondida no componente COMPARTILHADO, que é o pior
 * lugar para uma cópia velha: as telas que adotaram o padrão certo continuavam
 * exibindo o texto do protocolo.
 */
export function Erro({
  titulo,
  erro,
  onTentarNovamente,
  mensagens,
}: {
  titulo: string;
  erro?: unknown;
  onTentarNovamente?: () => void;
  /** Dicionário de códigos da tela, como em `mensagemApi`. */
  mensagens?: Record<string, string>;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{mensagemApi(erro, "Falha inesperada. Tente de novo em um instante.", mensagens)}</span>
        {onTentarNovamente && (
          <Button variant="outline" size="sm" onClick={onTentarNovamente}>
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Vazio.
 *
 * **A regra, escrita uma vez:** toda mensagem de vazio diz POR QUE está vazia e
 * QUAL É o próximo passo, com o botão junto. O app já sabia fazer isso em dois
 * lugares (o dashboard e o card de lookbook da ficha) e não em outros trinta —
 * onde sobrava "Nenhum resultado", que informa o que a pessoa já está vendo.
 *
 * O `acao` é opcional porque há vazios sem saída honesta: um filtro que não
 * casou não tem botão, tem filtro para limpar.
 */
export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="font-medium">{titulo}</p>
        {descricao && <p className="text-muted-foreground max-w-md text-sm">{descricao}</p>}
        {acao && <div className="pt-2">{acao}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Não encontrado — o irmão do vazio para quando o ID não existe.
 *
 * E12: a ficha de uma noiva inexistente ficava num esqueleto sem título nem
 * saída e depois virava "HTTP 404 Not Found", enquanto as três telas irmãs já
 * tinham o card certo.
 */
export function NaoEncontrado({ titulo, voltarPara }: { titulo: string; voltarPara: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground max-w-md text-sm">
          Ou o endereço está errado, ou o registro foi removido.
        </p>
        {voltarPara}
      </CardContent>
    </Card>
  );
}
