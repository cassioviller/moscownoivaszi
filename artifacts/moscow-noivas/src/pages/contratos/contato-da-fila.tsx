import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageCircle } from "lucide-react";
import { HistoricoContato } from "@/components/historico-contato";

/**
 * S-C87 — a fila de atrasos AGE: registrar o telefonema sem sair dela.
 *
 * A fila avisava e todo contato era um ida-e-volta até a ficha — com três
 * peças fora, três idas (decisão da dona, 14/08/2026: agir da fila). O
 * diálogo é o MESMO da ficha da noiva e da Cobrança: `HistoricoContato`
 * (E27/E32), o widget extraído justamente para não nascer segunda grafia do
 * registro (regra 26) — o POST dele é o que zera o relógio do "parado há N
 * dias" do funil, e o gate é o do endpoint (`leads.criar`): sem a permissão o
 * widget mostra o histórico e esconde o formulário, como em toda porta dele.
 *
 * A query do histórico é LAZY (`enabled: aberto` + montagem sob `jaAbriu`),
 * o padrão da Cobrança: a fila não paga uma request por linha ao montar.
 *
 * A órfã sem dona (`leadId: null` — gesto de balcão sem noiva) não oferece o
 * gesto: não há a quem ligar nem ficha onde carimbar.
 */
export function ContatoDaFila({ leadId }: { leadId: string }) {
  const [aberto, setAberto] = useState(false);
  const [jaAbriu, setJaAbriu] = useState(false);

  return (
    <Collapsible
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setJaAbriu(true);
      }}
      className="w-full"
    >
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`contato-da-fila-${leadId}`}>
          <MessageCircle className="mr-1 h-4 w-4" />
          Contato
          <ChevronDown
            className={`ml-1 h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {jaAbriu ? <HistoricoContato leadId={leadId} aberto={aberto} /> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
