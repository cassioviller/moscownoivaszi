import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateVestido,
  getListVestidosQueryKey,
  useListAtributos,
  getListAtributosQueryKey,
  useListAjustes,
  getListAjustesQueryKey,
} from "@workspace/api-client-react";
import type { VestidoAtributo } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { VestidoForm, type VestidoFormValues } from "./vestido-form";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { mensagemApi } from "@/lib/erro-api";
import { fichaDaConfeccao, podeVirarPecaDoAcervo } from "@/lib/confeccao-no-acervo";

/** Cadastro completo de vestido (com características do catálogo) — portado de vestidos/novo do orcamentos. */
export default function NovoVestido() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const podeCriar = podeNoModulo(acessosModulos, "vestidos", "criar");

  // E156 — a mesma tela, aberta pelo gesto da fila da costureira: a peça
  // confeccionada vira item do acervo (P4). O `?confeccao=` traz a ficha
  // preenchida; o cadastro em si continua sendo o de sempre, e é de propósito —
  // uma segunda tela de cadastro seria uma segunda verdade sobre o acervo.
  const confeccaoId = searchParams.get("confeccao");
  const filaQuery = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId && !!confeccaoId,
    },
  });
  const confeccao = confeccaoId
    ? (filaQuery.data ?? []).find((t) => t.id === confeccaoId)
    : undefined;
  // A régua é a mesma da fila: confecção, já feita, e ainda sem peça. Chegar
  // aqui por URL colada não escapa dela — e o servidor recusa de novo (422).
  const confeccaoValida = confeccao && podeVirarPecaDoAcervo(confeccao) ? confeccao : undefined;
  const ficha = confeccaoValida ? fichaDaConfeccao(confeccaoValida) : undefined;

  const catalogoQuery = useListAtributos(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createVestido = useCreateVestido();

  async function onSubmit(values: VestidoFormValues, atributos: VestidoAtributo[]) {
    try {
      const criado = await createVestido.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          codigo: values.codigo,
          nome: values.nome,
          precoBase: values.precoBase,
          // E157: só vai quando existe — o POST não tem o que apagar.
          ...(values.precoRealuguel != null ? { precoRealuguel: values.precoRealuguel } : {}),
          // E216 (cláusula 12ª): a marca é da loja e vai sempre — `false` é o
          // default do banco e o caso da esmagadora maioria.
          exclusiva: values.exclusiva,
          tamanho: values.tamanho || undefined,
          categoria: values.categoria || undefined,
          observacoes: values.observacoes || undefined,
          atributos: atributos.length > 0 ? atributos : undefined,
          // E156: a proveniência se declara no nascimento da peça.
          ...(confeccaoValida ? { origemAjusteId: confeccaoValida.id } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) });
      toast({ title: "Vestido cadastrado" });
      navigate(`/loja/${lojaId}/vestidos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Não deu para cadastrar vestido",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/vestidos`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Vestidos
        </Link>
        <h1 className="mt-1 text-3xl font-serif">
          {confeccaoValida ? "Confecção vira peça do acervo" : "Novo vestido"}
        </h1>
        {confeccaoValida && (
          <p className="mt-1 text-sm text-muted-foreground">
            A peça sai da fila da costureira e entra no acervo com a folha em branco — sem reserva
            nenhuma. O <strong>preço é o do aluguel</strong>, não o que a costureira cobrou.
          </p>
        )}
      </div>

      {/* E156: a fila mandou um trabalho que não pode virar peça — pendente, já
          no acervo, ou de outra loja. O cadastro comum segue aberto, e sem a
          proveniência; o servidor recusaria o vínculo de todo jeito (422). */}
      {confeccaoId && !confeccaoValida && !filaQuery.isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Este trabalho não vira peça do acervo</AlertTitle>
          <AlertDescription>
            Só uma confecção já concluída, e ainda sem peça cadastrada, entra no acervo. Você pode
            seguir com um cadastro comum.
          </AlertDescription>
        </Alert>
      )}

      {!podeCriar ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem acesso</AlertTitle>
          <AlertDescription>Você não tem permissão para cadastrar vestidos.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados do vestido</CardTitle>
          </CardHeader>
          <CardContent>
            {/* A fila entra na espera junto com o catálogo: o form monta os
                defaults UMA vez, e abrir em branco para preencher depois
                perderia a ficha da confecção. */}
            {catalogoQuery.isLoading || (!!confeccaoId && filaQuery.isLoading) ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              // Catálogo com erro não bloqueia o cadastro: o form abre sem as características.
              <VestidoForm
                catalogo={catalogoQuery.data ?? []}
                defaults={ficha}
                submitLabel={confeccaoValida ? "Cadastrar no acervo" : "Cadastrar vestido"}
                onSubmit={onSubmit}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
