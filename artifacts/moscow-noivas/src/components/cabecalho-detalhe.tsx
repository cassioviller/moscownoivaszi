import type { ReactNode } from "react";
import { Link } from "react-router";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

/**
 * E9/E98 + E19/E99 — o cabeçalho das seis telas de detalhe, num lugar só.
 *
 * As seis desenhavam o próprio: `<h1>` com ou sem link de volta, o status ora
 * como badge no meio dos botões ora colado no título, e a fileira de ações sem
 * hierarquia. O caso que o épico nomeia é o do contrato: "Cancelar contrato" —
 * a ação irreversível — dividia a fileira com "Baixar PDF" e "Ver orçamento",
 * e o elemento mais clicável dos três era o `Badge` rosa **"Ativo"**, que não
 * é clicável coisa nenhuma.
 *
 * Três decisões ficam presas aqui, para nenhuma tela nova ter de repeti-las:
 *
 * 1. **O status é chip de LEITURA, ao lado do `<h1>`.** Ele sai da fileira de
 *    botões — onde parecia ação — e vai para onde se lê o nome do registro.
 * 2. **Uma ação primária.** O resto vai para o `…`, inclusive (e principalmente)
 *    a destrutiva, que ali precisa de dois gestos e um rótulo vermelho em vez de
 *    um botão do mesmo tamanho dos vizinhos.
 * 3. **A trilha diz de onde se veio e leva de volta** — "Noivas › Ana Silva ›
 *    Contrato". O último item não é link: é onde a pessoa está.
 */

export type ItemTrilha = {
  rotulo: string;
  /** Caminho DENTRO da loja (`/noivas/x`); o último item vai sem `para`. */
  para?: string;
};

export type AcaoSecundaria = {
  rotulo: string;
  /** Caminho dentro da loja, para ações que navegam. */
  para?: string;
  /** Href absoluto (download, link externo) — abre em nova aba. */
  href?: string;
  onClick?: () => void;
  /** Cancelar, remover, estornar: vermelho e no fim da lista, atrás de um separador. */
  destrutiva?: boolean;
  desabilitada?: boolean;
};

export function CabecalhoDetalhe({
  trilha,
  titulo,
  subtitulo,
  chip,
  acaoPrimaria,
  acoes = [],
}: {
  trilha: ItemTrilha[];
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** O status, como leitura — não como ação. */
  chip?: ReactNode;
  acaoPrimaria?: ReactNode;
  acoes?: AcaoSecundaria[];
}) {
  const naLoja = useCaminhoDaLoja();
  const comuns = acoes.filter((a) => !a.destrutiva);
  const destrutivas = acoes.filter((a) => a.destrutiva);

  return (
    <div className="space-y-2">
      <Breadcrumb>
        <BreadcrumbList>
          {trilha.map((item, i) => (
            <BreadcrumbItem key={`${item.rotulo}-${i}`}>
              {item.para ? (
                <>
                  <BreadcrumbLink asChild>
                    <Link to={naLoja(item.para)}>{item.rotulo}</Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <BreadcrumbPage>{item.rotulo}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-serif">{titulo}</h1>
            {chip}
          </div>
          {subtitulo && <div className="text-sm text-muted-foreground">{subtitulo}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {acaoPrimaria}
          {acoes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {comuns.map((a) => (
                  <ItemAcao key={a.rotulo} acao={a} naLoja={naLoja} />
                ))}
                {comuns.length > 0 && destrutivas.length > 0 && <DropdownMenuSeparator />}
                {destrutivas.map((a) => (
                  <ItemAcao key={a.rotulo} acao={a} naLoja={naLoja} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemAcao({
  acao,
  naLoja,
}: {
  acao: AcaoSecundaria;
  naLoja: (caminho: string) => string;
}) {
  const classe = acao.destrutiva ? "text-destructive focus:text-destructive" : undefined;

  if (acao.para) {
    return (
      <DropdownMenuItem asChild disabled={acao.desabilitada} className={classe}>
        <Link to={naLoja(acao.para)}>{acao.rotulo}</Link>
      </DropdownMenuItem>
    );
  }
  if (acao.href) {
    return (
      <DropdownMenuItem asChild disabled={acao.desabilitada} className={classe}>
        <a href={acao.href} target="_blank" rel="noreferrer">
          {acao.rotulo}
        </a>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onSelect={acao.onClick} disabled={acao.desabilitada} className={classe}>
      {acao.rotulo}
    </DropdownMenuItem>
  );
}
