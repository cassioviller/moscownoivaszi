import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListLookbooks,
  getListLookbooksQueryKey,
  useCreateLookbook,
  useDeleteLookbook,
  useListVestidos,
  getListVestidosQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { BookImage, Trash2 } from "lucide-react";
import { instanteDiaMes } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

/**
 * Lookbook (E21) — o card na página da noiva: a vendedora escolhe os vestidos
 * provados e o link (30 dias) vai pelo WhatsApp; a noiva revê as fotos em casa
 * sem login. Revogar mata o link na hora.
 */

const linkDoLookbook = (token: string) => `${window.location.origin}/lookbook/${token}`;


export function LookbookNoiva({ leadId }: { leadId: string }) {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const podeCriar = podeNoModulo(acessosModulos, "leads", "criar");

  const [aberto, setAberto] = useState(false);
  /** E10/E99: o lookbook que a noiva tem no favorito morre na hora — confirma. */
  const [revogandoId, setRevogandoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const params = { leadId };
  const lookbooks = useListLookbooks(activeLojaId!, params, {
    query: {
      queryKey: getListLookbooksQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId,
    },
  });
  // Catálogo só quando o dialog abre — a página da noiva não paga por ele.
  const vestidos = useListVestidos(activeLojaId!, {
    query: {
      queryKey: getListVestidosQueryKey(activeLojaId!),
      enabled: !!activeLojaId && aberto,
    },
  });
  const criar = useCreateLookbook();
  const revogar = useDeleteLookbook();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = (vestidos.data ?? []).filter((v) => v.status === "ativo");
    if (!termo) return lista;
    return lista.filter(
      (v) => v.nome.toLowerCase().includes(termo) || v.codigo.toLowerCase().includes(termo),
    );
  }, [vestidos.data, busca]);

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: getListLookbooksQueryKey(activeLojaId!, params) });

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDoLookbook(token));
      toast({ title: "Link copiado", description: "É só colar no WhatsApp da noiva." });
    } catch {
      toast({ title: "Não deu para copiar automaticamente", description: linkDoLookbook(token) });
    }
  }

  async function onCriar() {
    if (selecionados.size === 0) {
      toast({ title: "Escolha ao menos um vestido", variant: "destructive" });
      return;
    }
    try {
      const criado = await criar.mutateAsync({
        lojaId: activeLojaId!,
        data: { leadId, vestidoIds: [...selecionados] },
      });
      await invalidar();
      setAberto(false);
      setSelecionados(new Set());
      setBusca("");
      await copiar(criado.token);
    } catch (err) {
      toast({
        title: "Não deu para criar o lookbook",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  async function onRevogar(lookbookId: string) {
    try {
      await revogar.mutateAsync({ lojaId: activeLojaId!, lookbookId });
      await invalidar();
      toast({ title: "Lookbook revogado", description: "O link parou de funcionar." });
    } catch (err) {
      toast({
        title: "Não deu para revogar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    /**
     * S-O38: o `id` é o endereço do card. Os botões "Lookbook" da barra de
     * atendimento e da fila apontavam uma ROTA `/noivas/:leadId/lookbook` que
     * nunca existiu — o lookbook mora aqui, dentro da ficha. Agora eles trazem
     * para cá pelo hash, e o `scroll-mt` deixa o título visível abaixo da barra
     * fixa em vez de encostá-lo no topo.
     */
    <Card id="lookbook" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          Lookbook
          {podeCriar && (
            <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
              <BookImage className="mr-2 h-4 w-4" />
              Montar lookbook
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lookbooks.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : lookbooks.isError ? (
          <p className="text-sm text-muted-foreground">
            Falha ao buscar os lookbooks.{" "}
            <button className="underline" onClick={() => lookbooks.refetch()}>
              Tentar de novo
            </button>
          </p>
        ) : (lookbooks.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum lookbook ainda — monte a seleção dos vestidos provados e mande o link para a
            noiva rever em casa.
          </p>
        ) : (
          <ul className="divide-y">
            {lookbooks.data!.map((l) => {
              const expirado = new Date(l.expiraEm).getTime() <= Date.now();
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="truncate">
                      {l.vestidos.map((v) => v.nome).join(", ") || "Sem vestidos"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      criado em {instanteDiaMes(l.criadoEm)}
                      {expirado
                        ? " · expirado"
                        : ` · vale até ${instanteDiaMes(l.expiraEm)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!expirado && (
                      <Button variant="outline" size="sm" onClick={() => copiar(l.token)}>
                        Copiar link
                      </Button>
                    )}
                    {podeCriar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Revogar lookbook"
                        disabled={revogar.isPending}
                        onClick={() => setRevogandoId(l.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Montar lookbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nome ou código…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {vestidos.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : filtrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vestido ativo encontrado.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {filtrados.map((v) => (
                  <li key={v.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={selecionados.has(v.id)}
                        onCheckedChange={(marcado) =>
                          setSelecionados((atual) => {
                            const proximo = new Set(atual);
                            if (marcado === true) proximo.add(v.id);
                            else proximo.delete(v.id);
                            return proximo;
                          })
                        }
                      />
                      <span className="tabular-nums text-muted-foreground">{v.codigo}</span>
                      <span className="truncate">{v.nome}</span>
                      {(v.fotos ?? []).length === 0 && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          sem foto
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={onCriar} disabled={criar.isPending}>
              {criar.isPending
                ? "Criando…"
                : `Criar e copiar link (${selecionados.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E10/E99 — revogar era um ícone de lixeira sem confirmação nenhuma, numa
          LISTA: o alvo do clique é a linha, e a linha não se identifica depois
          do gesto. O link que a noiva guardou morre na hora, e criar outro não
          desfaz o que ela já não consegue abrir. */}
      <AlertDialog
        open={!!revogandoId}
        onOpenChange={(aberto) => !aberto && setRevogandoId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar este lookbook?</AlertDialogTitle>
            <AlertDialogDescription>
              A seleção de{" "}
              <span className="font-medium">
                {lookbooks.data?.find((l) => l.id === revogandoId)?.vestidos?.length ?? 0}{" "}
                vestido(s)
              </span>{" "}
              para de abrir para a noiva na hora. Você pode criar outra seleção,
              mas o link que ela já tem não volta a funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = revogandoId!;
                setRevogandoId(null);
                void onRevogar(id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
