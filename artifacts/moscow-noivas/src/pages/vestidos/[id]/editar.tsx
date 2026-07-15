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

/** Um módulo é liberado se `true` ou se tem ao menos um sub-acesso true (padrão do sidebar). */
function moduloLiberado(acesso: unknown): boolean {
  if (acesso === true) return true;
  if (acesso && typeof acesso === "object") return Object.values(acesso as Record<string, unknown>).some(Boolean);
  return false;
}

/** Lê o arquivo escolhido e monta o payload JSON do endpoint de foto (base64 + dimensões). */
async function arquivoParaFotoInput(file: File): Promise<VestidoFotoInput> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
  const { largura, altura } = await new Promise<{ largura: number; altura: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo não é uma imagem válida"));
    };
    img.src = url;
  });
  return { mime: file.type || "image/jpeg", largura, altura, base64 };
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
  // Cache-busting local: a URL da foto é fixa, então versionamos após cada upload.
  const [versao, setVersao] = useState(() => Date.now());
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
      const data = await arquivoParaFotoInput(file);
      await setFoto.mutateAsync({ lojaId, vestidoId, ordem, data });
      await invalidar();
      setVersao(Date.now());
      toast({ title: "Foto atualizada" });
    } catch (err) {
      toast({
        title: "Erro ao enviar a foto",
        description: err instanceof Error ? err.message : "Tente novamente.",
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
        title: "Erro ao remover a foto",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
        {foto ? (
          <img
            src={`${getGetVestidoFotoUrl(lojaId, vestidoId, ordem)}?v=${versao}`}
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
          {setFoto.isPending ? "Enviando..." : foto ? "Trocar foto" : "Adicionar foto"}
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
            {deleteFoto.isPending ? "Removendo..." : "Remover"}
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

  // TODO Onda 4: o orcamentos distinguia "editar" dentro de "vestidos"; hoje o gate é flat por módulo.
  const podeEditar = !acessosModulos || moduloLiberado(acessosModulos["vestidos"]);

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
    query: { queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
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
          cor: values.cor || undefined,
          categoria: values.categoria || undefined,
          observacoes: values.observacoes || undefined,
          atributos,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetVestidoQueryKey(activeLojaId!, id!) }),
        queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Vestido atualizado com sucesso" });
      navigate(`/loja/${lojaId}/vestidos/${id}`);
    } catch (err) {
      toast({
        title: "Erro ao salvar o vestido",
        description: err instanceof Error ? err.message : "Tente novamente.",
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar o vestido</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada ao buscar o vestido."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
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
                  cor: vestido.cor ?? "",
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
