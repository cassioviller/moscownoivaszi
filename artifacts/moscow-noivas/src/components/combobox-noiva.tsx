import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLeads,
  getListLeadsQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  useCreateLead,
  type ListLeadsParams,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * F4 — a origem é escolhida no MESMO clique que cadastra.
 *
 * Um `<Select>` dentro do popover do combobox seria um menu dentro de um menu, e
 * pediria três interações para o que aqui é uma. Mais importante: depois do F2 a
 * origem não tem default silencioso, e um botão "Cadastrar" sozinho cairia no
 * default da coluna (`LOJA`) — reintroduzindo, por outra porta, o exato defeito
 * que o F2 fecha. Quatro botões tornam a pergunta impossível de pular.
 */
const ORIGENS = [
  { valor: "LOJA", rotulo: "Loja" },
  { valor: "WHATSAPP", rotulo: "WhatsApp" },
  { valor: "SITE", rotulo: "Site" },
  { valor: "INSTAGRAM", rotulo: "Instagram" },
] as const;

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
  // E140/B9: a jornada é literalmente "a noiva está NO TELEFONE" — o número
  // está na mão da recepcionista neste segundo, e sem ele a confirmação das
  // 48h nem é oferecida e a fila degrada para "Sem WhatsApp". Opcional DE
  // VERDADE: vazio, nada trava.
  const [whatsappNovo, setWhatsappNovo] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const { acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLead = useCreateLead();
  const podeCadastrar = podeNoModulo(acessosModulos, "leads", "criar");

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

  // O nome a cadastrar é o que está DIGITADO, não o que já foi buscado: quem
  // termina de escrever e vê "nenhuma noiva encontrada" quer cadastrar aquilo
  // ali, sem esperar o debounce virar consulta.
  const nomeNovo = busca.trim();
  const podeOferecerCadastro = podeCadastrar && nomeNovo.length > 0 && !leads.isLoading;

  const cadastrar = async (origem: (typeof ORIGENS)[number]["valor"]) => {
    try {
      const criada = await createLead.mutateAsync({
        lojaId,
        data: {
          noivaNome: nomeNovo,
          origem,
          ...(whatsappNovo.trim() ? { whatsapp: whatsappNovo.trim() } : {}),
        },
      });
      // A ficha recém-criada entra no cache pela mesma chave que o `useGetLead`
      // do gatilho consulta — sem isto o botão mostraria "…" até uma ida ao
      // servidor que já temos a resposta.
      queryClient.setQueryData(getGetLeadQueryKey(lojaId, criada.id), criada);
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(lojaId) });
      onChange(criada.id);
      setBusca("");
      setWhatsappNovo("");
      setAberto(false);
      toast({
        title: "Noiva cadastrada",
        description: `${criada.noivaNome} entrou no funil. Complete a ficha depois.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para cadastrar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

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
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome ou WhatsApp…"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            <CommandEmpty>
              {leads.isLoading ? (
                "Buscando…"
              ) : !podeOferecerCadastro ? (
                "Nenhuma noiva encontrada."
              ) : (
                // O `px-3` é daqui: o `CommandEmpty` só tem padding vertical,
                // porque o texto centrado de "nada encontrado" não precisava de
                // margem lateral.
                <div className="space-y-2 px-3 text-left" data-testid="cadastrar-inline">
                  <p className="text-sm">
                    Nenhuma noiva chamada{" "}
                    <span className="font-medium text-foreground">«{nomeNovo}»</span>.
                    Cadastrar agora — de onde ela veio?
                  </p>
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="WhatsApp (opcional)"
                    value={whatsappNovo}
                    onChange={(e) => setWhatsappNovo(e.target.value)}
                    data-testid="cadastrar-whatsapp"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {ORIGENS.map((o) => (
                      <Button
                        key={o.valor}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={createLead.isPending}
                        onClick={() => cadastrar(o.valor)}
                        data-testid={`cadastrar-origem-${o.valor}`}
                      >
                        {o.rotulo}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
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
