import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReceberParcela,
  type Parcela,
  type ReceberParcelaInputFormaRecebimento,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";
import { ROTULO_FORMA, FORMAS, saldoAberto } from "@/lib/financeiro/forma";
import { hojeLocal } from "@/lib/financeiro/datas";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { invalidarCaixa } from "@/pages/financeiro/helpers";
import { mensagemApi } from "@/lib/erro-api";

/**
 * F28/E98 — registrar recebimento onde a cobrança acontece.
 *
 * O diálogo morava dentro de `financeiro/receber.tsx`, e era o único lugar do
 * sistema capaz de dar baixa numa parcela. Quem estava em `/cobranca` — a fila
 * de quem ligar, montada justamente para cobrar — ligava, a noiva pagava na
 * hora, e a vendedora tinha de trocar de tela, achar a parcela no meio da
 * carteira e só então lançar.
 *
 * Saiu inteiro para cá, com as três coisas que o tornam correto e que uma
 * segunda cópia perderia:
 *
 * 1. **O valor sugerido é o SALDO, não o previsto.** Numa parcela meio recebida,
 *    repetir o valor cheio faz a vendedora cobrar de novo o que já entrou — o
 *    erro que a noiva percebe primeiro.
 * 2. **`recebidoEm` é um INSTANTE.** Para hoje vale o agora real; para um dia
 *    passado, meio-dia de São Paulo mantém o dia local correto.
 * 3. **`PARCELA_MUDOU` tem frase própria** (B6/E94): a rota recusa o
 *    recebimento quando a parcela mudou entre a leitura e a gravação, e é isso
 *    que impede dois lançamentos simultâneos de perderem um. Sem a tradução, a
 *    vendedora veria "HTTP 409".
 */

const MENSAGENS_ERRO: Record<string, string> = {
  PARCELA_JA_RECEBIDA: "Esta parcela já foi recebida.",
  PARCELA_CANCELADA: "Parcela cancelada não pode ser recebida.",
  CONTRATO_NAO_ATIVO: "Contrato cancelado — sem movimentação de parcelas.",
  PARCELA_MUDOU: "Alguém acabou de receber nesta parcela — confira o valor e lance de novo.",
};

export function rotuloParcela(p: Parcela): string {
  return p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`;
}

export function DialogoReceberParcela({
  lojaId,
  parcela,
  onFechar,
  /** Contexto da linha de origem — em `/cobranca` a parcela sozinha não se explica. */
  descricao,
  /**
   * S-M20: invalidação EXTRA da tela dona, depois do sucesso. O diálogo já
   * invalida `chavesDoCaixa`; a ficha do contrato precisa também do próprio
   * GET /contratos/:id — sem este gancho ela mantinha uma CÓPIA do diálogo
   * inteira só para poder invalidar a query dela, e a cópia perdeu a data.
   */
  aoReceber,
}: {
  lojaId: string;
  /** `null` fecha o diálogo; qualquer parcela o abre já preenchida. */
  parcela: Parcela | null;
  onFechar: () => void;
  descricao?: string;
  aoReceber?: () => unknown;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const receber = useReceberParcela();

  const [valorRecebido, setValorRecebido] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(hojeLocal());
  const [formaRecebimento, setFormaRecebimento] = useState<ReceberParcelaInputFormaRecebimento | "">("");

  // Abrir com OUTRA parcela repreenche os campos. Quando o estado morava na
  // tela, quem abria isso era a função que também setava a parcela; aqui a
  // parcela é prop, então o preenchimento segue a prop — senão o valor da
  // parcela anterior ficaria no campo, que é a pior forma de errar num lançamento.
  useEffect(() => {
    if (!parcela) return;
    setValorRecebido(saldoAberto(parcela).toFixed(2).replace(".", ","));
    setDataRecebimento(hojeLocal());
    setFormaRecebimento("");
  }, [parcela?.id]);

  const onReceber = async () => {
    if (!parcela) return;
    const valor = parseValor(valorRecebido);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor recebido inválido", variant: "destructive" });
      return;
    }
    if (!dataRecebimento) {
      toast({ title: "Informe a data do recebimento", variant: "destructive" });
      return;
    }
    const recebidoEm =
      dataRecebimento === hojeLocal() ? new Date().toISOString() : diaParaISO(dataRecebimento);
    try {
      await receber.mutateAsync({
        lojaId,
        parcelaId: parcela.id,
        data: {
          valorRecebido: valor,
          recebidoEm,
          ...(formaRecebimento ? { formaRecebimento } : {}),
        },
      });
      await invalidarCaixa(queryClient, lojaId);
      await aoReceber?.();
      toast({ title: "Recebimento registrado" });
      onFechar();
    } catch (err) {
      toast({
        title: "Não deu para receber",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={!!parcela} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Registrar recebimento{parcela ? ` — ${rotuloParcela(parcela)}` : ""}
          </DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        {/* E136/E6: o diálogo de dinheiro MAIS usado do sistema não tinha
            <form> — depois de digitar o valor, registrar custava
            Tab→Tab→Tab→Tab→Enter (5 teclas onde a convenção é 1), e a tecla
            "ir" do teclado numérico do celular morria no vazio. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onReceber();
          }}
        >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="valorRecebido">Valor recebido</Label>
            {/* E92/E20: o campo de dinheiro MAIS usado do sistema subia o
                teclado QWERTY no celular. Nunca type="number" para dinheiro:
                vira roleta e muda o valor quando o dedo rola a página. */}
            <Input
              id="valorRecebido"
              inputMode="decimal"
              value={valorRecebido}
              onChange={(e) => setValorRecebido(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dataRecebimento">Data</Label>
            <Input
              id="dataRecebimento"
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="formaRecebimento">Forma</Label>
            <Select
              value={formaRecebimento || undefined}
              onValueChange={(v) => setFormaRecebimento(v as ReceberParcelaInputFormaRecebimento)}
            >
              <SelectTrigger id="formaRecebimento">
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {FORMAS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={receber.isPending} data-testid="confirmar-recebimento">
            {receber.isPending ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
