import { mensagemApi } from "@/lib/erro-api";
import type { EstadoDoCard } from "@/lib/estado-consulta";

/**
 * S-C120 — o card sem lista para desenhar, e as três razões de não ter uma.
 *
 * **A quarta razão é a que estava faltando, e ela é a única que MENTIA.** Os
 * cards de Orçamentos e Contratos da ficha da noiva derivavam tudo de
 * `query.data?.itens ?? []`, então uma resposta RECUSADA — a Recepção tem
 * `contratos: NADA` desde o E172 — virava lista vazia, e a tela desenhava
 * *"Nenhum contrato ainda."* sobre um contrato que existe. Quem lê a ficha para
 * responder ao telefone é justamente a Recepção.
 *
 * Um componente só, porque os dois cards erravam a mesma frase pelo mesmo
 * caminho, e o E172 já cobrou o preço de consertar uma porta e deixar a porta ao
 * lado. A frase de permissão é a que as outras cinco telas do app já usam
 * (`atendimentos/novo.tsx:467`, `catalogo/novo.tsx:109`, `vestidos/novo.tsx:131`,
 * `vestidos/[id]/editar.tsx:287`, `agenda/index.tsx:87`): **"Você não tem
 * permissão para …"** — a sexta grafia seria a que confunde.
 *
 * A do erro passa pelo `mensagemApi`, a régua única do E92: um 500 e uma rede
 * caída dizem coisas diferentes, e nenhuma delas diz "não há".
 */
export function SemLista({
  estado,
  oQue,
  vazio,
  erro,
  testid,
}: {
  estado: EstadoDoCard;
  /** O plural do que o card lista, para a frase de permissão: "os contratos". */
  oQue: string;
  /** O que se diz quando a consulta respondeu e não veio nada. */
  vazio: string;
  erro?: unknown;
  testid: string;
}) {
  if (estado === "carregando") {
    return <div className="h-10 animate-pulse rounded bg-muted" />;
  }
  if (estado === "sem-permissao") {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`${testid}-sem-permissao`}>
        Você não tem permissão para ver {oQue} desta noiva.
      </p>
    );
  }
  if (estado === "erro") {
    return (
      <p className="text-destructive text-sm" data-testid={`${testid}-erro`}>
        {mensagemApi(erro, `Não deu para carregar ${oQue} desta noiva.`)}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" data-testid={`${testid}-vazio`}>
      {vazio}
    </p>
  );
}
