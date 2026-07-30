import { useState } from "react";
import { useForm } from "react-hook-form";
import { useConfirmarSaida } from "@/hooks/use-confirmar-saida";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Atributo, VestidoAtributo } from "@workspace/api-client-react";
import { CatalogoCampos, type SelecoesCatalogo } from "@/components/catalogo/catalogo-campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export const vestidoFormSchema = z.object({
  codigo: z.string().min(1, { message: "Código é obrigatório" }),
  nome: z.string().min(1, { message: "Nome é obrigatório" }),
  precoBase: z.coerce
    .number({ invalid_type_error: "Informe um preço válido" })
    .nonnegative({ message: "Preço deve ser positivo" }),
  tamanho: z.string().optional(),
  cor: z.string().optional(),
  categoria: z.string().optional(),
  observacoes: z.string().optional(),
});

export type VestidoFormValues = z.infer<typeof vestidoFormSchema>;

/**
 * Form completo de vestido (páginas Novo/Editar) — portado da tela do
 * orcamentos (vestido-form.tsx): dados principais, características do catálogo
 * (usadas para indicar o vestido às noivas) e campos opcionais.
 */
export function VestidoForm({
  defaults,
  catalogo,
  selecoesIniciais,
  submitLabel,
  onSubmit,
}: {
  defaults?: Partial<VestidoFormValues>;
  catalogo: Atributo[];
  selecoesIniciais?: SelecoesCatalogo;
  submitLabel: string;
  onSubmit: (values: VestidoFormValues, atributos: VestidoAtributo[]) => Promise<void>;
}) {
  const [selecoes, setSelecoes] = useState<SelecoesCatalogo>(selecoesIniciais ?? {});
  const catalogoAtivo = catalogo.filter((a) => a.ativo);

  const form = useForm<VestidoFormValues>({
    resolver: zodResolver(vestidoFormSchema),
    defaultValues: {
      codigo: defaults?.codigo ?? "",
      nome: defaults?.nome ?? "",
      precoBase: defaults?.precoBase ?? 0,
      tamanho: defaults?.tamanho ?? "",
      cor: defaults?.cor ?? "",
      categoria: defaults?.categoria ?? "",
      observacoes: defaults?.observacoes ?? "",
    },
  });

  // E133/B7: fechar/recarregar com trabalho digitado avisa. O "sujo" honesto
  // desta tela tem DUAS fontes — o RHF e as seleções de catálogo (useState) —
  // e cala depois do submit bem-sucedido (as páginas navegam sem reset).
  const selecoesMudaram =
    JSON.stringify(Object.entries(selecoes).sort()) !==
    JSON.stringify(Object.entries(selecoesIniciais ?? {}).sort());
  useConfirmarSaida(
    (form.formState.isDirty || selecoesMudaram) && !form.formState.isSubmitSuccessful,
  );

  async function handleSubmit(values: VestidoFormValues) {
    const atributos: VestidoAtributo[] = Object.entries(selecoes)
      .filter(([, opcaoId]) => !!opcaoId)
      .map(([atributoId, opcaoId]) => ({ atributoId, opcaoId }));
    await onSubmit(values, atributos);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="codigo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código</FormLabel>
                <FormControl>
                  <Input placeholder="VST-001" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="precoBase"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preço (R$)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Nome do vestido" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {catalogoAtivo.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">
              Características{" "}
              <span className="font-normal text-muted-foreground">
                — usadas para indicar este vestido às noivas
              </span>
            </p>
            <CatalogoCampos
              catalogo={catalogo}
              selecoes={selecoes}
              onChange={(atributoId, opcaoId) =>
                setSelecoes((prev) => {
                  const proximas = { ...prev };
                  if (opcaoId) proximas[atributoId] = opcaoId;
                  else delete proximas[atributoId];
                  return proximas;
                })
              }
              disabled={form.formState.isSubmitting}
            />
          </div>
        )}

        <p className="pt-2 text-sm font-medium text-muted-foreground">Opcional</p>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="tamanho"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tamanho</FormLabel>
                <FormControl>
                  <Input placeholder="M" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cor</FormLabel>
                <FormControl>
                  <Input placeholder="Branco" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <Input placeholder="Princesa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea placeholder="Observações adicionais" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Salvando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
