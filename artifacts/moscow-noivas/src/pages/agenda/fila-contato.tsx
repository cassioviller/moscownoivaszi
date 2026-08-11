import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { instanteHora } from "@/lib/formatos";
import { faltaProcurar } from "@/lib/mensagens-do-dia";
import type { Atendimento } from "@workspace/api-client-react";

/**
 * A fila "Falta procurar" da agenda do dia (E8/E97/F6) — quem a loja ainda não
 * chamou no WhatsApp.
 *
 * Saiu de dentro de `agenda/index.tsx` no E168 por duas razões, e as duas são
 * defeito medido:
 *
 * - **G14** — a fila re-derivava à mão a régua que já vive em
 *   `mensagens-do-dia.ts` e **esquecia `remarcacaoPedidaEm`**: a recepção
 *   mandava "confirme sua presença hoje às 14h" para quem tinha avisado às 9h
 *   que não podia vir. Agora ela chama `faltaProcurar`, a mesma pergunta que a
 *   tela de Mensagens faz.
 * - **G13** — o botão não tinha gate de permissão nem tratava erro. Quem tem
 *   `agenda` sem `editar` abria o WhatsApp, o `POST /contato` voltava 403 em
 *   silêncio, e a linha continuava na fila: **a noiva era procurada, o contato
 *   não era gravado, e a próxima pessoa procurava de novo.**
 *
 * Componente com props puras de propósito: é o caso que o `vitest.config.ts`
 * descreve como o meio-termo entre a lógica pura e o Playwright — *"um
 * componente que decide MOSTRAR ou não mostrar"*, e gate de permissão sem
 * teste é a classe que volta calada (S15).
 */
export function FilaFaltaProcurar({
  atendimentos,
  nomePorLead,
  linkWa,
  podeEditar,
  onProcurou,
}: {
  /** Já recortados para o dia visível. */
  atendimentos: Atendimento[];
  nomePorLead: Map<string, string>;
  /** O deep-link do WhatsApp — `null` quando a noiva não tem número. */
  linkWa: (a: Atendimento) => string | null;
  /** `agenda.editar`: sem ela o carimbo do contato é 403 no servidor. */
  podeEditar: boolean;
  /** Carimba `contatadoEm`. Só é chamado quando `podeEditar`. */
  onProcurou: (atendimentoId: string) => void;
}) {
  const agendados = atendimentos.filter((a) => a.situacao === "AGENDADO");
  if (agendados.length === 0) return null;

  /**
   * G14: a régua é a de `mensagens-do-dia`, e ela conhece os TRÊS fatos que o
   * E97 e o F37 separaram — a loja procurou, a noiva confirmou, a noiva pediu
   * para remarcar. Quem tem qualquer um deles não está na fila de procurar.
   */
  const faltaContatar = agendados.filter((a) => faltaProcurar(comoFila(a)));
  const jaConfirmados = agendados.filter((a) => a.confirmadoEm).length;
  const soContatados = agendados.filter((a) => a.contatadoEm && !a.confirmadoEm).length;
  // F37/E100: quem respondeu "não posso" some daqui e é DITO — some silencioso
  // é o defeito que a fila de remarcar existe para não repetir.
  const pediramRemarcar = agendados.filter((a) => a.remarcacaoPedidaEm && !a.confirmadoEm).length;

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Falta procurar</p>
      {faltaContatar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todas as noivas do dia já foram procuradas.</p>
      ) : (
        faltaContatar.map((atendimento) => {
          const wa = linkWa(atendimento);
          return (
            <div
              key={atendimento.id}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`confirmar-linha-${atendimento.id}`}
            >
              <span className="min-w-0 truncate">
                <span className="tabular-nums text-muted-foreground">
                  {instanteHora(atendimento.inicio)}
                </span>{" "}
                {nomePorLead.get(atendimento.leadId) ?? "Noiva"}
              </span>
              {wa && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  data-testid={`confirmar-btn-${atendimento.id}`}
                >
                  {/* Abrir o wa.me (o <a> navega) E carimbar que a LOJA
                      procurou — não que a noiva respondeu. G13: o carimbo só
                      sai quando há permissão de gravá-lo; sem ela o link
                      continua abrindo (ler e falar com a noiva não é editar) e
                      o rótulo diz que o registro não vai acontecer. */}
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      podeEditar
                        ? undefined
                        : "Você pode falar com a noiva, mas não tem permissão para registrar o contato — peça a quem edita a agenda."
                    }
                    onClick={() => {
                      if (podeEditar) onProcurou(atendimento.id);
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    {podeEditar ? "Chamar no WhatsApp" : "Chamar (sem registrar)"}
                  </a>
                </Button>
              )}
            </div>
          );
        })
      )}
      {/* Os números são fatos diferentes e são ditos como tais: uma fila que
          some não conta quem respondeu. */}
      {jaConfirmados > 0 && (
        <p className="text-positivo pt-1 text-xs font-medium">{jaConfirmados} confirmou pelo portal.</p>
      )}
      {soContatados > 0 && (
        <p className="text-muted-foreground pt-1 text-xs">
          {soContatados} procurada{soContatados === 1 ? "" : "s"}, ainda sem resposta.
        </p>
      )}
      {pediramRemarcar > 0 && (
        <p className="text-muted-foreground pt-1 text-xs">
          {pediramRemarcar} pediu{pediramRemarcar === 1 ? "" : "ram"} para remarcar — está
          {pediramRemarcar === 1 ? "" : "ão"} na fila de Mensagens.
        </p>
      )}
    </div>
  );
}

/**
 * O `Atendimento` da API traz `Date | null` nos carimbos e o núcleo da régua
 * fala em `string | null` — a conversão é aqui, num lugar só, para o predicado
 * continuar puro (e testável sem montar a tela).
 */
function comoFila(a: Atendimento) {
  return {
    situacao: a.situacao,
    inicio: String(a.inicio),
    contatadoEm: a.contatadoEm ? String(a.contatadoEm) : null,
    confirmadoEm: a.confirmadoEm ? String(a.confirmadoEm) : null,
    remarcacaoPedidaEm: a.remarcacaoPedidaEm ? String(a.remarcacaoPedidaEm) : null,
  };
}
