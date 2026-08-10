import { useState } from "react";
import { useForm } from "react-hook-form";
import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Atributo, VestidoAtributo } from "@workspace/api-client-react";
import { CatalogoCampos, type SelecoesCatalogo } from "@/components/catalogo/catalogo-campos";
import { parseValor } from "@/lib/financeiro/dinheiro";
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

/**
 * E134/E11: o preço é TEXTO com `inputMode="decimal"` — a regra escrita no
 * próprio repo ("Nunca type=number para dinheiro: vira roleta e muda o valor
 * quando o dedo rola a página", `dialogo-receber-parcela`). `parseValor`
 * distingue vazio (null) de sujo (NaN), o molde do E95.
 */
export const vestidoFormSchema = z.object({
  codigo: z.string().min(1, { message: "Informe o código" }),
  nome: z.string().min(1, { message: "Informe o nome" }),
  precoBase: z.string().superRefine((texto, ctx) => {
    const v = parseValor(texto);
    if (v === null) ctx.addIssue({ code: "custom", message: "Informe o preço (ex.: 4.200,50)" });
    else if (Number.isNaN(v)) ctx.addIssue({ code: "custom", message: "Informe um preço válido (ex.: 4.200,50)" });
    else if (v < 0) ctx.addIssue({ code: "custom", message: "Preço deve ser positivo" });
  }),
  /**
   * E157 — o preço da peça que já saiu antes. VAZIO é o caso comum e
   * significa "não tem preço de segunda saída": o orçamento segue com o preço
   * de tabela. Só a bobagem digitada é recusada.
   */
  precoRealuguel: z.string().optional().superRefine((texto, ctx) => {
    if (!texto?.trim()) return;
    const v = parseValor(texto);
    if (v === null || Number.isNaN(v)) ctx.addIssue({ code: "custom", message: "Informe um preço válido (ex.: 3.500,00)" });
    else if (v < 0) ctx.addIssue({ code: "custom", message: "Preço deve ser positivo" });
  }),
  tamanho: z.string().optional(),
  categoria: z.string().optional(),
  observacoes: z.string().optional(),
});

type VestidoFormCampos = z.infer<typeof vestidoFormSchema>;

/** O que as páginas recebem no submit — o preço JÁ convertido para número. */
export type VestidoFormValues = Omit<VestidoFormCampos, "precoBase" | "precoRealuguel"> & {
  precoBase: number;
  /** null = a peça não tem preço de segunda saída (E157). */
  precoRealuguel: number | null;
};

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

  const form = useForm<VestidoFormCampos>({
    resolver: zodResolver(vestidoFormSchema),
    defaultValues: {
      codigo: defaults?.codigo ?? "",
      nome: defaults?.nome ?? "",
      // Exibição pt-BR: o valor salvo volta com vírgula, como se digita.
      precoBase: defaults?.precoBase != null ? String(defaults.precoBase).replace(".", ",") : "",
      precoRealuguel:
        defaults?.precoRealuguel != null ? String(defaults.precoRealuguel).replace(".", ",") : "",
      tamanho: defaults?.tamanho ?? "",
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
  useConfirmarSaida(sujoParaConfirmar(form.formState, selecoesMudaram));

  async function handleSubmit(values: VestidoFormCampos) {
    const atributos: VestidoAtributo[] = Object.entries(selecoes)
      .filter(([, opcaoId]) => !!opcaoId)
      .map(([atributoId, opcaoId]) => ({ atributoId, opcaoId }));
    // O schema já garantiu que o parse não é null nem NaN.
    // E157: vazio vira null — "esta peça não tem preço de segunda saída" —, e
    // o servidor entende null como "apague o que havia".
    const realuguel = values.precoRealuguel?.trim() ? parseValor(values.precoRealuguel) : null;
    await onSubmit(
      {
        ...values,
        precoBase: parseValor(values.precoBase) as number,
        precoRealuguel: realuguel as number | null,
      },
      atributos,
    );
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
                  <Input inputMode="decimal" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {/* E157 — o ateliê precifica pela VEZ em que a peça sai: o caderno
            anota "1º Aluguel", "2º Aluguel", "Realuguel". Vazio é o caso
            comum, e mantém o preço de tabela em toda saída. */}
        <FormField
          control={form.control}
          name="precoRealuguel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preço de realuguel (R$)</FormLabel>
              <FormControl>
                <Input
                  inputMode="decimal"
                  placeholder="vazio = mesmo preço em toda saída"
                  data-testid="input-preco-realuguel"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <div className="grid grid-cols-2 gap-4">
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
          {/* E149: o campo de COR saiu daqui e virou atributo do catálogo, logo
              acima em "Características". Como texto livre ele não sustentava a
              busca — "Verde", "verde" e "VERDE" viravam três entradas no filtro
              do acervo, cada uma com um pedaço dos vestidos —, e é por cor que
              a segunda linha de negócio do ateliê é procurada: 38 compromissos
              de festa e dama nas 15 páginas de agenda, em 15 cores. Como
              atributo, ela também passa a aparecer na ficha de interesses da
              noiva (`lead_interesse_atributos`), que é o gesto que o papel
              registra. `vestidos.cor` fica como legado LIDO, nunca escrito. */}
          <FormField
            control={form.control}
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Coleção</FormLabel>
                <FormControl>
                  <Input placeholder="Coleção 2026" {...field} />
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
            {form.formState.isSubmitting ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
