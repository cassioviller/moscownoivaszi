import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useListLeads, getListLeadsQueryKey } from "@workspace/api-client-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { diaMesAbrevAno } from "@/lib/formatos";

/**
 * E141 (D6) — a busca de noivas a um atalho de qualquer tela.
 *
 * A noiva no telefone, a vendedora em qualquer tela: o caminho era sidebar →
 * Noivas → campo → digitar → Detalhes (3 cliques + digitação), e sair de um
 * formulário descartava o que estava digitado. O primitivo estava pago (cmdk
 * é dependência viva no combobox) e a busca certa existe no servidor
 * (`listLeads?q=`: nome, noivo e dígitos do telefone).
 *
 * Este módulo é LAZY de propósito — `app-layout` é ansioso (o gotcha do
 * replit.md: um import morto prendeu 103 kB no caminho crítico), então o
 * diálogo só desce quando o atalho é usado pela primeira vez. O gate de
 * módulo fica no app-layout, espelhando `lib/permissoes`.
 */
export default function BuscaGlobalDialog({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { activeLojaId } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");

  // O MESMO debounce das listas (300ms) — a consulta é a do servidor.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const params = { q: buscaAplicada, ordem: "recentes" as const, pagina: 1, porPagina: 8 };
  const leads = useListLeads(activeLojaId!, params, {
    query: {
      queryKey: getListLeadsQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId && aberto && buscaAplicada.length > 0,
    },
  });

  const abrirFicha = (leadId: string) => {
    onFechar();
    setBusca("");
    navigate(`/loja/${activeLojaId}/noivas/${leadId}`);
  };

  const itens = leads.data?.itens ?? [];

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar noiva</DialogTitle>
        {/* shouldFilter={false}: a busca é do SERVIDOR (nome, noivo e dígitos
            do WhatsApp) — o filtro do cmdk em cima descartaria o resultado de
            "97777" porque o nome não contém os dígitos. */}
        <Command shouldFilter={false} className="[&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3">
      <CommandInput
        placeholder="Buscar noiva por nome ou WhatsApp…"
        value={busca}
        onValueChange={setBusca}
      />
      <CommandList>
        <CommandEmpty>
          {buscaAplicada.length === 0
            ? "Digite para buscar — nome, noivo ou dígitos do telefone."
            : leads.isLoading
              ? "Buscando…"
              : leads.isError
                ? "A busca não respondeu — tente de novo."
                : "Nenhuma noiva encontrada."}
        </CommandEmpty>
        {itens.length > 0 && (
          <CommandGroup heading="Noivas">
            {itens.map((lead) => (
              <CommandItem
                key={lead.id}
                value={lead.id}
                onSelect={() => abrirFicha(lead.id)}
                data-testid={`busca-global-${lead.id}`}
              >
                <span className="min-w-0 flex-1 truncate">{lead.noivaNome}</span>
                {lead.casamentoData && (
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {diaMesAbrevAno(lead.casamentoData)}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
