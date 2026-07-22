import { useEffect, useMemo, useState } from "react";
import {
  useListLeads,
  getListLeadsQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  type ListLeadsParams,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * E63 — o picker de noiva com busca no BANCO.
 *
 * Os selects de agenda/orçamento pediam a lista COMPLETA de leads para montar
 * o combo — numa loja com anos de história, centenas de nomes desciam a cada
 * abertura de dialog. Aqui a digitação vira `?q=` (a mesma busca da lista de
 * noivas, E7) e só uma página de candidatas viaja.
 */

const POR_PAGINA = 20;

export function ComboboxNoiva({
  lojaId,
  value,
  onChange,
  incluirPerdidas = false,
  placeholder = "Escolha a noiva",
  disabled,
  ariaLabel = "Noiva",
}: {
  lojaId: string;
  value: string | null;
  onChange: (leadId: string) => void;
  /** Por padrão PERDIDO fica de fora — agendar/orçar é para quem está no funil. */
  incluirPerdidas?: boolean;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const params = useMemo<ListLeadsParams>(
    () => ({
      ...(buscaAplicada ? { q: buscaAplicada } : {}),
      porPagina: POR_PAGINA,
      ordem: "recentes",
    }),
    [buscaAplicada],
  );

  const leads = useListLeads(lojaId, params, {
    query: { queryKey: getListLeadsQueryKey(lojaId, params), enabled: !!lojaId && aberto },
  });

  const candidatas = useMemo(
    () =>
      (leads.data?.itens ?? []).filter((l) => incluirPerdidas || l.etapa !== "PERDIDO"),
    [leads.data, incluirPerdidas],
  );

  // A selecionada pode não estar na página atual (busca mudou, seleção antiga):
  // o nome dela vem de um GET pontual, não de baixar a lista inteira.
  const selecionadaNaPagina = candidatas.find((l) => l.id === value);
  const selecionadaQ = useGetLead(lojaId, value ?? "", {
    query: {
      queryKey: getGetLeadQueryKey(lojaId, value ?? ""),
      enabled: !!lojaId && !!value && !selecionadaNaPagina,
    },
  });
  const nomeSelecionada = selecionadaNaPagina?.noivaNome ?? selecionadaQ.data?.noivaNome;

  const total = leads.data?.total ?? 0;
  const excedente = Math.max(0, total - candidatas.length);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between font-normal"
          data-testid="combobox-noiva"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? (nomeSelecionada ?? "…") : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome ou WhatsApp…"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            <CommandEmpty>
              {leads.isLoading ? "Buscando…" : "Nenhuma noiva encontrada."}
            </CommandEmpty>
            <CommandGroup>
              {candidatas.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={lead.id}
                  onSelect={() => {
                    onChange(lead.id);
                    setAberto(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === lead.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">
                    {lead.noivaNome}
                    {lead.noivoNome && (
                      <span className="text-muted-foreground"> &amp; {lead.noivoNome}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {excedente > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                +{excedente} — refine a busca.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
