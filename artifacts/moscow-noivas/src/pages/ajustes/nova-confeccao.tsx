import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAjustesQueryKey,
  getListAtendimentosQueryKey,
  useCreateAjuste,
  useListAtendimentos,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComboboxNoiva } from "@/components/combobox-noiva";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { instanteDiaHora } from "@/lib/formatos";
import { Erro } from "@/components/estado";
import { Plus } from "lucide-react";

/**
 * S-O28 — **a confecção não tinha onde nascer pela interface.**
 *
 * `POST /ajustes` (`agenda.ts:1068`) aceita `tipo: CONFECCAO` desde o E155, e o
 * ÚNICO formulário de ajuste do repositório vivia dentro do bloco de provas de
 * uma reserva (`reservas/[bloqueioId].tsx`). Confecção é, por definição, o
 * trabalho **sem peça de acervo**: sem vestido não há reserva, sem reserva não
 * há bloqueio — e sem bloqueio não havia tela.
 *
 * O E170 fez o PRAZO dela aparecer na fila (a S-A05.5: o casamento da noiva
 * quando não há bloqueio), o E155 pôs as duas naturezas na mesma fila, o E156
 * ensinou a confecção pronta a virar peça do acervo. **Só o começo faltava**, e
 * é o passo sem o qual os outros três não acontecem.
 *
 * Ela nasce aqui, na fila da costureira, porque é onde a falta se sente. O
 * `atendimentoId` é obrigatório no servidor e é o que amarra a confecção à
 * NOIVA — então o diálogo pede a noiva primeiro e oferece os atendimentos dela.
 */
export function NovaConfeccao({ podeCriar }: { podeCriar: boolean }) {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const criar = useCreateAjuste();

  const [aberto, setAberto] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [atendimentoId, setAtendimentoId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [custo, setCusto] = useState("");
  /**
   * E240/S-O50 (decisão da dona, 15/08/2026) — o PRAZO PRÓPRIO, opcional.
   * Vazio é "vale a régua derivada" (a próxima prova, senão o casamento); com
   * um dia, a fila e a ficha passam a contar por ele. `<input type="date">`
   * já entrega AAAA-MM-DD, que é a grafia da coluna e do contrato.
   */
  const [prazoProprio, setPrazoProprio] = useState("");

  /**
   * Os atendimentos DELA, sem janela: a confecção costuma ser combinada num
   * atendimento que já passou — pedir só os futuros deixaria a lista vazia
   * justamente no caso comum. É o recorte por noiva do E125, sem o `de`.
   */
  const params = { leadId: leadId ?? "" };
  const atendimentos = useListAtendimentos(activeLojaId!, params, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId && !!leadId && aberto,
    },
  });
  const dela = [...(atendimentos.data ?? [])].sort(
    (a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime(),
  );

  const limpar = () => {
    setLeadId(null);
    setAtendimentoId("");
    setDescricao("");
    setCusto("");
    setPrazoProprio("");
  };

  const salvar = async () => {
    // A mesma régua de dinheiro do resto do app: "1.500,00" é mil e quinhentos,
    // e lixo digitado é NaN — que se diz, não se engole (C3).
    const valor = parseValor(custo);
    if (valor !== null && !Number.isFinite(valor)) {
      toast({
        title: "Custo inválido",
        description: "Informe um valor em reais (ex.: 1.500,00).",
        variant: "destructive",
      });
      return;
    }
    try {
      await criar.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          atendimentoId,
          descricao: descricao.trim(),
          tipo: "CONFECCAO",
          ...(valor !== null ? { custo: valor } : {}),
          ...(prazoProprio ? { prazoProprio } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) });
      toast({ title: "Confecção na fila" });
      setAberto(false);
      limpar();
    } catch (err) {
      toast({
        title: "Não deu para abrir a confecção",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (!podeCriar) return null;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) limpar();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="abrir-nova-confeccao">
          <Plus className="h-4 w-4 mr-1" />
          Nova confecção
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova confecção</DialogTitle>
          <DialogDescription>
            Peça nova, feita para a noiva — sem vestido do acervo. Ela entra na fila com o prazo do
            casamento dela, a não ser que você fixe um prazo próprio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Noiva</Label>
            <ComboboxNoiva
              lojaId={activeLojaId!}
              value={leadId}
              onChange={(id) => {
                setLeadId(id);
                setAtendimentoId("");
              }}
              ariaLabel="Noiva da confecção"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confeccao-atendimento">Atendimento em que foi combinada</Label>
            {!leadId ? (
              <p className="text-sm text-muted-foreground">Escolha a noiva primeiro.</p>
            ) : atendimentos.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando os atendimentos dela…</p>
            ) : atendimentos.isError ? (
              /* S-C250 — a forma DERIVADA da S-C160: `dela` sai de
                 `atendimentos.data ?? []` numa linha e o vazio é testado em
                 outra, fora do alcance da grafia direta. O `isLoading` estava
                 lido e o `isError` não, então um 500 aqui virava "Esta noiva
                 ainda não tem atendimento nenhum" — e o ramo do zero manda a
                 costureira à Agenda marcar um atendimento que pode já existir. */
              <Erro
                titulo="Não deu para carregar os atendimentos dela"
                erro={atendimentos.error}
                onTentarNovamente={() => atendimentos.refetch()}
              />
            ) : dela.length === 0 ? (
              /* O servidor exige `atendimentoId` — dizer o motivo aqui evita o
                 422 depois do clique, que é a régua do E27. */
              <p className="text-sm text-muted-foreground">
                Esta noiva ainda não tem atendimento nenhum. A confecção nasce de um atendimento —
                marque um primeiro, na Agenda.
              </p>
            ) : (
              <Select value={atendimentoId} onValueChange={setAtendimentoId}>
                <SelectTrigger id="confeccao-atendimento">
                  <SelectValue placeholder="Escolha o atendimento" />
                </SelectTrigger>
                <SelectContent>
                  {dela.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {instanteDiaHora(a.inicio)} · {a.tipo === "PROVA" ? "Prova" : "Atendimento"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confeccao-descricao">O que vai ser feito</Label>
            <Input
              id="confeccao-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Vestido de renda com cauda, feito sob medida"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confeccao-custo">Custo (opcional)</Label>
            <Input
              id="confeccao-custo"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              placeholder="1.500,00"
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">
              É o que o orçamento cobra da noiva por esta peça.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confeccao-prazo">Prazo próprio (opcional)</Label>
            <Input
              id="confeccao-prazo"
              type="date"
              value={prazoProprio}
              onChange={(e) => setPrazoProprio(e.target.value)}
              data-testid="confeccao-prazo-proprio"
            />
            <p className="text-xs text-muted-foreground">
              O dia em que esta peça precisa estar pronta. Em branco, vale o casamento da noiva —
              e a prova marcada manda sobre os dois.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={salvar}
            disabled={!atendimentoId || !descricao.trim() || criar.isPending}
            data-testid="salvar-nova-confeccao"
          >
            {criar.isPending ? "Abrindo…" : "Abrir confecção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
