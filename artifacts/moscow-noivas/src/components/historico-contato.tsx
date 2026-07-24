import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListRegistrosCobranca,
  getListRegistrosCobrancaQueryKey,
  useCreateRegistroCobranca,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { rotuloContato, CANAIS, ROTULO_CANAL, type Canal } from "@/lib/financeiro/cobranca";

/**
 * Histórico de contato de UMA noiva — a timeline dos registros de cobrança
 * (E27) mais o formulário de "Registrar contato". Nasceu dentro da Cobrança
 * (financeiro) e foi extraído (E32) para a ficha da noiva usar o MESMO widget:
 * o mesmo POST que aqui zera o relógio do "parado há N dias" do funil.
 *
 * `listRegistrosCobranca` é por lead: a query é LAZY (`enabled: aberto`) para
 * a lista de cobrança não disparar uma request por noiva ao montar. Na ficha,
 * onde o card já está sempre aberto, passa-se `aberto` fixo.
 *
 * `onRegistrado` deixa cada tela invalidar o que é seu: a Cobrança não precisa
 * de nada além da própria lista; a ficha precisa recarregar o lead para o selo
 * de "parado" sumir na hora.
 */
export function HistoricoContato({
  leadId,
  aberto,
  onRegistrado,
}: {
  leadId: string;
  aberto: boolean;
  onRegistrado?: () => void;
}) {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // O endpoint é gateado por `requireModulo("leads")` — a mesma régua vale onde
  // quer que o widget apareça (financeiro ou noivas): quem manda é o backend.
  const podeRegistrar = podeNoModulo(acessosModulos, "leads", "criar");

  const [canal, setCanal] = useState<Canal>("WHATSAPP");
  const [observacao, setObservacao] = useState("");

  const registros = useListRegistrosCobranca(activeLojaId!, leadId, {
    query: {
      queryKey: getListRegistrosCobrancaQueryKey(activeLojaId!, leadId),
      enabled: !!activeLojaId && aberto,
    },
  });

  const criar = useCreateRegistroCobranca({
    mutation: {
      onSuccess: () => {
        setObservacao("");
        queryClient.invalidateQueries({
          queryKey: getListRegistrosCobrancaQueryKey(activeLojaId!, leadId),
        });
        onRegistrado?.();
        toast({ title: "Contato registrado" });
      },
      onError: () => toast({ title: "Não foi possível registrar o contato", variant: "destructive" }),
    },
  });

  function registrar() {
    criar.mutate({
      lojaId: activeLojaId!,
      leadId,
      // O contato é AGORA: o instante é do relógio, não de um campo de data —
      // pedir a data de algo que acabou de acontecer só cria chance de erro.
      data: {
        data: new Date().toISOString(),
        canal,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      },
    });
  }

  if (registros.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Falha ao buscar o histórico.{" "}
        <button className="underline" onClick={() => registros.refetch()}>
          Tentar de novo
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {registros.isPending && aberto ? (
        <Skeleton className="h-16 rounded-md" />
      ) : registros.data && registros.data.length > 0 ? (
        <ul className="space-y-2">
          {registros.data.map((r) => (
            <li key={r.id} className="rounded-md border-l-2 border-muted pl-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {rotuloContato(r.data)} · {ROTULO_CANAL[r.canal as Canal] ?? r.canal}
                {/* Sem autor = colaboradora que saiu da equipe. O contato
                    aconteceu de qualquer forma; omitir é mais honesto do que
                    inventar um "—" que parece dado faltando. */}
                {r.vendedorNome ? ` · ${r.vendedorNome}` : ""}
              </p>
              {r.observacao ? <p className="mt-0.5">{r.observacao}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>
      )}

      {podeRegistrar ? (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor={`canal-${leadId}`} className="text-xs">
              Canal
            </Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
              <SelectTrigger id={`canal-${leadId}`} className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANAIS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ROTULO_CANAL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor={`obs-${leadId}`} className="text-xs">
              O que ficou combinado
            </Label>
            <Input
              id={`obs-${leadId}`}
              value={observacao}
              placeholder="Opcional — ex.: vai pagar dia 15"
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={registrar} disabled={criar.isPending}>
            {criar.isPending ? "Registrando…" : "Registrar contato"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
