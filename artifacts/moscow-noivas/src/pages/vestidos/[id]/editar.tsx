import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVestido,
  getGetVestidoQueryKey,
  useUpdateVestido,
  getListVestidosQueryKey,
  useListAtributos,
  getListAtributosQueryKey,
  useSetVestidoFoto,
  useDeleteVestidoFoto,
  getGetVestidoFotoUrl,
  getGetVestidoFotoQueryKey,
} from "@workspace/api-client-react";
import type { VestidoAtributo, VestidoFotoInput, VestidoFotoMeta } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { VestidoForm, type VestidoFormValues } from "../vestido-form";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { Erro } from "@/components/estado";

/** Redesenha a imagem num canvas com lado maior ≤ max e devolve o JPEG em base64. */
function reduzir(img: HTMLImageElement, max: number, qualidade: number): string {
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");
  // Fundo branco: são fotografias — alpha de PNG vira branco, não preto.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", qualidade).split(",")[1] ?? "";
}

/**
 * O arquivo escolhido vira DUAS variantes JPEG geradas aqui no cliente: a
 * cheia (≤1600px — "otimizada para abrir rápido" de verdade) e a thumb
 * (≤480px, para os cards da lista). De quebra, o re-encode via canvas descarta
 * EXIF/GPS e aplica a orientação. Mime e dimensões o SERVIDOR deriva do
 * binário — não vão no payload.
 */
async function gerarVariantes(file: File): Promise<VestidoFotoInput> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo não é uma imagem válida"));
    };
    el.src = url;
  });
  return { base64: reduzir(img, 1600, 0.82), thumbBase64: reduzir(img, 480, 0.8) };
}

/** Um slot de foto (ordem 0 ou 1): exibe, troca e remove — portado de fotos-vestido.tsx do orcamentos. */
function SlotFoto({
  lojaId,
  vestidoId,
  ordem,
  foto,
  nomeVestido,
}: {
  lojaId: string;
  vestidoId: string;
  ordem: number;
  foto?: VestidoFotoMeta;
  nomeVestido: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const setFoto = useSetVestidoFoto();
  const deleteFoto = useDeleteVestidoFoto();
  const ocupado = setFoto.isPending || deleteFoto.isPending;

  async function invalidar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetVestidoQueryKey(lojaId, vestidoId) }),
      queryClient.invalidateQueries({ queryKey: getGetVestidoFotoQueryKey(lojaId, vestidoId, ordem) }),
      queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(lojaId) }),
    ]);
  }

  async function onArquivoEscolhido(file: File | undefined) {
    if (!file) return;
    try {
      const data = await gerarVariantes(file);
      await setFoto.mutateAsync({ lojaId, vestidoId, ordem, data });
      await invalidar();
      toast({ title: "Foto atualizada" });
    } catch (err) {
      toast({
        title: "Não deu para enviar a foto",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemover() {
    try {
      await deleteFoto.mutateAsync({ lojaId, vestidoId, ordem });
      await invalidar();
      toast({ title: "Foto removida" });
    } catch (err) {
      toast({
        title: "Não deu para remover a foto",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
        {foto ? (
          <img
            src={getGetVestidoFotoUrl(lojaId, vestidoId, ordem, {
              variante: "thumb",
              v: String(Date.parse(foto.atualizadaEm)),
            })}
            alt={`${nomeVestido} — foto ${ordem + 1}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-50" />
            <span className="text-xs">Sem foto</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onArquivoEscolhido(e.target.files?.[0])}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {setFoto.isPending ? "Enviando…" : foto ? "Trocar foto" : "Adicionar foto"}
        </Button>
        {foto && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={onRemover}
            aria-label={`Remover foto ${ordem + 1}`}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteFoto.isPending ? "Removendo…" : "Remover"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Edição de vestido (dados + características + 2 fotos) — portado de vestidos/[id]/editar do orcamentos. */
export default function EditarVestido() {
  const { lojaId, id } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const podeEditar = podeNoModulo(acessosModulos, "vestidos", "editar");

  const {
    data: vestido,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetVestido(activeLojaId!, id!, {
    query: { queryKey: getGetVestidoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id },
  });
  const catalogoQuery = useListAtributos(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const updateVestido = useUpdateVestido();

  async function onSubmit(values: VestidoFormValues, atributos: VestidoAtributo[]) {
    try {
      await updateVestido.mutateAsync({
        lojaId: activeLojaId!,
        vestidoId: id!,
        data: {
          codigo: values.codigo,
          nome: values.nome,
          precoBase: values.precoBase,
          tamanho: values.tamanho || undefined,
          categoria: values.categoria || undefined,
          observacoes: values.observacoes || undefined,
          atributos,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetVestidoQueryKey(activeLojaId!, id!) }),
        queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Vestido atualizado" });
      navigate(`/loja/${lojaId}/vestidos/${id}`);
    } catch (err) {
      toast({
        title: "Não deu para salvar o vestido",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  // E42: tirar de linha / reativar. A régua de disponibilidade já trata
  // status != "ativo" como INATIVO — aqui fecha o loop do relatório de utilização
  // (E15), que aponta candidatos a sair de linha sem dar a ação.
  async function alternarStatus() {
    if (!vestido) return;
    const novo = vestido.status === "ativo" ? "inativo" : "ativo";
    try {
      await updateVestido.mutateAsync({ lojaId: activeLojaId!, vestidoId: id!, data: { status: novo } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetVestidoQueryKey(activeLojaId!, id!) }),
        queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) }),
      ]);
      toast({ title: novo === "ativo" ? "Vestido reativado" : "Vestido fora de linha" });
    } catch (err) {
      toast({
        title: "Não deu para mudar a situação",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  const fotosPorOrdem = new Map((vestido?.fotos ?? []).map((f) => [f.ordem, f]));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/vestidos/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao vestido
        </Link>
        <h1 className="mt-1 text-3xl font-serif">Editar vestido</h1>
      </div>

      {!podeEditar ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem acesso</AlertTitle>
          <AlertDescription>Você não tem permissão para editar vestidos.</AlertDescription>
        </Alert>
      ) : isError ? (
        <Erro titulo="Não deu para carregar o vestido" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading || catalogoQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !vestido ? (
        <div className="text-muted-foreground">Vestido não encontrado.</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Dados do vestido</CardTitle>
            </CardHeader>
            <CardContent>
              <VestidoForm
                catalogo={catalogoQuery.data ?? []}
                selecoesIniciais={Object.fromEntries(
                  (vestido.atributos ?? []).map((a) => [a.atributoId, a.opcaoId]),
                )}
                defaults={{
                  codigo: vestido.codigo,
                  nome: vestido.nome,
                  precoBase: vestido.precoBase,
                  tamanho: vestido.tamanho ?? "",
                  categoria: vestido.categoria ?? "",
                  observacoes: vestido.observacoes ?? "",
                }}
                submitLabel="Salvar alterações"
                onSubmit={onSubmit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Situação no catálogo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="situacao-vestido">
                {vestido.status === "ativo"
                  ? "Ativo — aparece no catálogo e pode ser reservado."
                  : "Fora de linha — não aparece nas buscas nem fica disponível para reserva."}
              </p>
              <Button
                variant={vestido.status === "ativo" ? "outline" : "default"}
                onClick={alternarStatus}
                disabled={updateVestido.isPending}
                data-testid="toggle-status-vestido"
              >
                {vestido.status === "ativo" ? "Tirar de linha" : "Reativar"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fotos do vestido</CardTitle>
              <p className="text-sm text-muted-foreground">Até 2 — otimizadas para abrir rápido.</p>
            </CardHeader>
            <CardContent>
              <div className="grid max-w-md grid-cols-2 gap-4">
                {[0, 1].map((ordem) => (
                  <SlotFoto
                    key={ordem}
                    lojaId={activeLojaId!}
                    vestidoId={vestido.id}
                    ordem={ordem}
                    foto={fotosPorOrdem.get(ordem)}
                    nomeVestido={vestido.nome}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
