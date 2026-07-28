import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetLead,
  getGetLeadQueryKey,
  useUpdateLead,
  getListLeadsQueryKey,
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useCreateOrcamento,
  useListContratos,
  getListContratosQueryKey,
  type LeadUpdatePerdidaMotivo,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { HistoricoContato } from "@/components/historico-contato";
import { Erro, NaoEncontrado } from "@/components/estado";
import { LookbookNoiva } from "./lookbook";
import { PortalNoiva } from "./portal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, Pencil, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { etapaLabel, perdidaMotivoLabel, PERDIDA_MOTIVO_LABELS, ROTULO_ORIGEM, instanteDia } from "@/lib/formatos";
import { podeNoModulo } from "@/lib/permissoes";
import { ehNaoEncontrado } from "@/lib/erro-api";
import { proximoPasso } from "@/lib/proximo-passo";
import {
  dataLongaFmt,
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
  moedaFmt,
  whatsappDigits,
  } from "../helpers";

const STATUS_ORCAMENTO: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};
const STATUS_CONTRATO: Record<string, string> = { ATIVO: "Ativo", CANCELADO: "Cancelado" };

/** Linha de dado discreta (rótulo pequeno + valor). Não renderiza se vazio. */
function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div>
      <span className="block text-xs uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      <span className="text-sm">{valor}</span>
    </div>
  );
}

/**
 * Perfil concierge da noiva (porte da /noivas/[leadId] do feat/orcamentos):
 * quem ela é, o casamento, contato, orçamentos, contratos e interesses.
 */
export default function NoivaDetalhe() {
  const { lojaId, leadId } = useParams();
  const { activeLojaId, acessosModulos, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: lead, isLoading, isError, error, refetch } = useGetLead(activeLojaId!, leadId!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, leadId!),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  // E62: o recorte por noiva acontece no banco (`?leadId=`) — o perfil parou
  // de baixar os orçamentos e contratos da loja inteira para filtrar aqui.
  const orcamentos = useListOrcamentos(activeLojaId!, { leadId: leadId! }, {
    query: {
      queryKey: getListOrcamentosQueryKey(activeLojaId!, { leadId: leadId! }),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  const contratos = useListContratos(activeLojaId!, { leadId: leadId! }, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!, { leadId: leadId! }),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  const createOrcamento = useCreateOrcamento();
  const updateLead = useUpdateLead();

  // Diálogo de perda: motivo estruturado obrigatório, detalhe livre opcional.
  const [perdendo, setPerdendo] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState<LeadUpdatePerdidaMotivo | "">("");
  const [detalhePerda, setDetalhePerda] = useState("");

  const orcamentosDaNoiva = orcamentos.data ?? [];
  const contratosDaNoiva = contratos.data ?? [];

  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");
  // F1: agendar é do módulo AGENDA — quem só edita a ficha não marca horário.
  const podeAgendar = podeNoModulo(acessosModulos, "agenda", "editar");

  const novoOrcamento = async () => {
    try {
      const criado = await createOrcamento.mutateAsync({
        lojaId: activeLojaId!,
        data: { leadId: leadId! },
      });
      await queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });
      toast({ title: "Orçamento criado", description: "Adicione os itens." });
      navigate(`/loja/${lojaId}/orcamentos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Erro ao criar orçamento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  async function invalidarLead() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) }),
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) }),
    ]);
  }

  async function marcarPerdida() {
    if (!motivoPerda) {
      toast({ title: "Escolha o motivo", variant: "destructive" });
      return;
    }
    try {
      await updateLead.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: {
          etapa: "PERDIDO",
          perdidaMotivo: motivoPerda,
          ...(detalhePerda.trim() ? { perdidaDetalhe: detalhePerda.trim() } : {}),
        },
      });
      await invalidarLead();
      setPerdendo(false);
      setMotivoPerda("");
      setDetalhePerda("");
      toast({ title: "Noiva marcada como perdida" });
    } catch (err) {
      toast({
        title: "Erro ao marcar como perdida",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function reativar() {
    try {
      await updateLead.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: { etapa: "NOVO" },
      });
      await invalidarLead();
      toast({ title: "Noiva reativada", description: "De volta ao funil, como novo contato." });
    } catch (err) {
      toast({
        title: "Erro ao reativar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  // E12: 404 não é falha. A ficha de uma noiva que não existe mostrava o mesmo
  // alerta destrutivo de um 500, com "Tentar novamente" — um botão que não pode
  // dar certo, porque a busca vai devolver 404 de novo.
  if (ehNaoEncontrado(error)) {
    return (
      <NaoEncontrado
        titulo="Esta noiva não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${lojaId}/noivas`}>Voltar às noivas</Link>
          </Button>
        }
      />
    );
  }

  if (isError) {
    return (
      <Erro
        titulo="Erro ao carregar a noiva"
        erro={error}
        onTentarNovamente={() => refetch()}
      />
    );
  }

  if (isLoading || !lead) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 w-64 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  const dias = lead.casamentoData ? diasAteCasamento(lead.casamentoData) : null;
  const mostrarContagem = dias !== null && dias >= 0;
  const urgente = dias !== null && casamentoUrgente(dias);
  const digits = whatsappDigits(lead.whatsapp);

  // F5/E98: o que falta, em uma frase — em vez de ler oito cards para descobrir.
  const contratoAtivo = contratosDaNoiva.find((c) => c.status === "ATIVO") ?? null;
  const passo = proximoPasso({
    etapa: lead.etapa,
    leadId: leadId!,
    temContratoAtivo: !!contratoAtivo,
    contratoAtivoId: contratoAtivo?.id,
    temOrcamento: orcamentosDaNoiva.length > 0,
  });

  return (
    <div className="space-y-6">
      <Link
        to={`/loja/${lojaId}/noivas`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Noivas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-serif" data-testid="text-noiva-nome">
            {lead.noivaNome}
            {lead.noivoNome && <span className="text-muted-foreground"> &amp; {lead.noivoNome}</span>}
          </h1>
          <Badge variant={lead.etapa === "PERDIDO" ? "outline" : "secondary"} className="mt-2">
            {etapaLabel(lead.etapa)}
            {lead.etapa === "PERDIDO" && lead.perdidaMotivo && ` · ${perdidaMotivoLabel(lead.perdidaMotivo)}`}
          </Badge>
          {lead.etapa === "PERDIDO" && lead.perdidaDetalhe && (
            <p className="mt-1 text-xs text-muted-foreground">{lead.perdidaDetalhe}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* F1/E98 — o link que faltava no caminho mais percorrido do app.
              A ficha sabe o `leadId` e o formulário de agendar já aceita
              `?noiva=` (`reservas/[bloqueioId].tsx` usa o mesmo deep-link há
              tempos), mas daqui não havia caminho: agendar custava uma
              navegação de sidebar mais uma busca por nome — com a noiva do
              lado, esperando. Zero código do lado do formulário. */}
          {podeAgendar && lead.etapa !== "PERDIDO" && (
            <Button asChild data-testid="button-agendar-da-ficha">
              <Link to={`/loja/${lojaId}/atendimentos/novo?noiva=${leadId}`}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Agendar atendimento
              </Link>
            </Button>
          )}
          {podeEditar && lead.etapa === "PERDIDO" && (
            <Button
              variant="outline"
              onClick={reativar}
              disabled={updateLead.isPending}
              data-testid="button-reativar-noiva"
            >
              {updateLead.isPending ? "Reativando…" : "Reativar"}
            </Button>
          )}
          {podeEditar && lead.etapa !== "PERDIDO" && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setPerdendo(true)}
              data-testid="button-marcar-perdida"
            >
              Marcar como perdida
            </Button>
          )}
          {podeEditar && (
            <Button asChild variant="outline" data-testid="button-editar-noiva">
              <Link to={`/loja/${lojaId}/noivas/${leadId}/editar`}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar dados
              </Link>
            </Button>
          )}
          {/* E77 (LGPD): o direito de acesso — a noiva pede, a loja entrega. */}
          <Button asChild variant="ghost" size="sm" data-testid="button-exportar-dados">
            <a href={`/api/lojas/${lojaId}/leads/${leadId}/exportar`} download>
              Exportar dados (LGPD)
            </a>
          </Button>
        </div>
      </div>

      {/* F5/E98 — o que falta, em uma frase e um botão.

          A ficha mostra oito cards, e quando a noiva é nova quase todos estão
          vazios: a vendedora lia os oito para descobrir que o passo era marcar
          o primeiro atendimento. A regra é pura e testada
          (`lib/proximo-passo.ts`), e devolve `null` quando não há o que fazer —
          uma faixa que aparece sempre vira moldura e ninguém lê. */}
      {passo && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-medium">{passo.titulo}</p>
            {passo.detalhe && (
              <p className="text-muted-foreground text-sm">{passo.detalhe}</p>
            )}
          </div>
          <Button asChild size="sm" className="shrink-0" data-testid="button-proximo-passo">
            <Link to={`/loja/${lojaId}${passo.href}`}>{passo.rotuloAcao}</Link>
          </Button>
        </div>
      )}

      <AlertDialog
        open={perdendo}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setPerdendo(false);
            setMotivoPerda("");
            setDetalhePerda("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar {lead.noivaNome} como perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai do funil ativo, mas o cadastro e o histórico ficam — e dá para
              reativar se ela voltar. O motivo alimenta o relatório de por que as
              noivas não fecham.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Motivo</Label>
              <Select
                value={motivoPerda}
                onValueChange={(v) => setMotivoPerda(v as LeadUpdatePerdidaMotivo)}
              >
                <SelectTrigger data-testid="select-motivo-perda">
                  <SelectValue placeholder="Por que ela não fechou?" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERDIDA_MOTIVO_LABELS).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detalhe-perda" className="text-xs text-muted-foreground">
                Detalhe (opcional)
              </Label>
              <Input
                id="detalhe-perda"
                value={detalhePerda}
                onChange={(e) => setDetalhePerda(e.target.value)}
                placeholder="Ex.: fechou com ateliê X, orçamento acima do teto…"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Sem motivo o diálogo fica aberto — a validação fala primeiro.
                if (!motivoPerda) e.preventDefault();
                void marcarPerdida();
              }}
              disabled={updateLead.isPending}
            >
              {updateLead.isPending ? "Marcando…" : "Marcar como perdida"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between gap-3">
              <span>O casamento</span>
              {mostrarContagem && (
                <span className={`text-sm font-normal ${urgente ? "text-destructive" : "text-muted-foreground"}`}>
                  {rotuloContagem(dias!)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.casamentoData ? (
              <p className="text-lg font-serif first-letter:uppercase">
                {dataLongaFmt.format(new Date(lead.casamentoData))}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Data a definir.</p>
            )}
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Dado rotulo="Horário" valor={lead.casamentoHorario} />
              <Dado rotulo="Local" valor={lead.casamentoLocal} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              {lead.whatsapp ? (
                <div>
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                    WhatsApp
                  </span>
                  {digits ? (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline underline-offset-4 hover:text-primary"
                      data-testid="link-whatsapp"
                    >
                      {lead.whatsapp}
                    </a>
                  ) : (
                    <span className="text-sm">{lead.whatsapp}</span>
                  )}
                </div>
              ) : null}
              <Dado rotulo="Cerimonialista" valor={lead.cerimonialista} />
              {!lead.whatsapp && !lead.cerimonialista && (
                <p className="text-sm text-muted-foreground">Sem dados de contato.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Histórico de contato (E32): a mesma timeline da Cobrança, aqui na
            ficha. Registrar um contato zera o relógio do "parado há N dias" do
            funil (E27) — por isso o onRegistrado recarrega o lead e a lista. */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Histórico de contato</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoricoContato
              leadId={leadId!}
              aberto
              onRegistrado={() => {
                queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) });
                queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Orçamentos</span>
              {podeEditar && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={novoOrcamento}
                  disabled={createOrcamento.isPending}
                  data-testid="button-novo-orcamento"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {createOrcamento.isPending ? "Criando…" : "Novo orçamento"}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orcamentos.isLoading ? (
              <div className="h-10 animate-pulse rounded bg-muted" />
            ) : orcamentosDaNoiva.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
            ) : (
              <ul className="divide-y">
                {orcamentosDaNoiva.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/loja/${lojaId}/orcamentos/${o.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                    >
                      <span>
                        Criado em {instanteDia(o.createdAt)}
                      </span>
                      <Badge variant={o.status === "APROVADO" ? "default" : o.status === "RECUSADO" ? "outline" : "secondary"}>
                        {STATUS_ORCAMENTO[o.status] ?? o.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            {contratos.isLoading ? (
              <div className="h-10 animate-pulse rounded bg-muted" />
            ) : contratosDaNoiva.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato ainda.</p>
            ) : (
              <ul className="divide-y">
                {contratosDaNoiva.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/loja/${lojaId}/contratos/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                    >
                      <span className={c.status === "CANCELADO" ? "text-muted-foreground line-through" : undefined}>
                        {STATUS_CONTRATO[c.status] ?? c.status}
                      </span>
                      <span className="tabular-nums">{moedaFmt.format(c.valorTotal)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Portal (E78): o link único que substitui gradualmente os soltos. */}
        <PortalNoiva leadId={leadId!} />

        {/* Lookbook (E21): a seleção provada vira link para rever em casa. */}
        <LookbookNoiva leadId={leadId!} />

        <Card>
          <CardHeader>
            <CardTitle>Interesses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {(lead.interesse?.atributos?.length ?? 0) > 0
                ? "Desejos da noiva registrados — base das sugestões de vestido."
                : "Ainda não preenchidos. Registre os desejos da noiva."}
            </p>
            <Button asChild variant="outline" size="sm" data-testid="link-interesses">
              <Link to={`/loja/${lojaId}/noivas/${leadId}/interesses`}>
                {lead.interesse ? "Editar interesses" : "Preencher interesses"} →
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Adicionada via {ROTULO_ORIGEM[lead.origem] ?? lead.origem}
        </p>
      </footer>
    </div>
  );
}
