import { useState } from "react";
import { useConfirmarSaida } from "@/hooks/use-confirmar-saida";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const noivaSchema = z.object({
  noivaNome: z.string().min(1, "Nome da noiva é obrigatório"),
  noivoNome: z.string().optional(),
  whatsapp: z.string().optional(),
  cerimonialista: z.string().optional(),
  casamentoData: z.string().optional(),
  casamentoHorario: z.string().optional(),
  casamentoLocal: z.string().optional(),
  // SITE/INSTAGRAM nascem da captação externa (E19); aqui aparecem para a
  // edição não engasgar com um lead captado (a origem é imutável na edição).
  origem: z.enum(["LOJA", "WHATSAPP", "SITE", "INSTAGRAM"]),
});

export type NoivaFormValues = z.infer<typeof noivaSchema>;

const VAZIO: NoivaFormValues = {
  noivaNome: "",
  noivoNome: "",
  whatsapp: "",
  cerimonialista: "",
  casamentoData: "",
  casamentoHorario: "",
  casamentoLocal: "",
  origem: "LOJA",
};

/**
 * Form compartilhado de noiva (nova/editar) — porte do noiva-form.tsx do
 * feat/orcamentos: mesmos campos e textos, stack react-hook-form + shadcn.
 */
export function NoivaForm({
  defaults,
  submitLabel,
  pending,
  onSubmit,
  origemDisabled,
}: {
  defaults?: Partial<NoivaFormValues>;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: NoivaFormValues) => void | Promise<void>;
  /** Na edição a origem não é alterável (LeadUpdate do main não tem o campo). */
  origemDisabled?: boolean;
}) {
  const form = useForm<NoivaFormValues>({
    resolver: zodResolver(noivaSchema),
    defaultValues: { ...VAZIO, ...defaults },
  });

  /**
   * D14 — o cuidado (c) do épico, e é a armadilha real deste item.
   *
   * As duas telas que usam este formulário NAVEGAM depois de salvar, e o
   * react-hook-form continua `isDirty` até o `reset()` — que aqui nunca
   * acontece, porque a tela some. Sem este `salvou`, salvar uma noiva
   * perguntaria "quer descartar as alterações?" logo depois de a pessoa ter
   * salvado: um aviso que treina quem usa a ignorar.
   */
  const [salvou, setSalvou] = useState(false);
  useConfirmarSaida(form.formState.isDirty && !salvou);

  const submeter = async (values: NoivaFormValues) => {
    await onSubmit(values);
    // Só depois do await: se o `onSubmit` lançar, o formulário continua sujo e
    // protegido — que é o caso em que perder o que foi digitado dói mais.
    setSalvou(true);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submeter)} className="max-w-md space-y-5">
        <FormField
          control={form.control}
          name="noivaNome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da noiva *</FormLabel>
              <FormControl>
                <Input autoFocus data-testid="input-noiva-nome" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="origem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Origem</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={origemDisabled}>
                <FormControl>
                  <SelectTrigger data-testid="select-noiva-origem">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LOJA">Loja</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="SITE">Site</SelectItem>
                  <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <p className="text-xs font-medium text-muted-foreground">Opcional</p>

        <FormField
          control={form.control}
          name="noivoNome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do noivo</FormLabel>
              <FormControl>
                <Input data-testid="input-noivo-nome" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp</FormLabel>
              <FormControl>
                {/* E92/E20: o teclado numérico de telefone. O WhatsApp digitado
                    torto quebra em silêncio os links wa.me da fila de mensagens. */}
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  data-testid="input-noiva-whatsapp"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cerimonialista"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cerimonialista</FormLabel>
              <FormControl>
                <Input data-testid="input-noiva-cerimonialista" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="casamentoData"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do casamento</FormLabel>
                <FormControl>
                  <Input type="date" data-testid="input-casamento-data" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="casamentoHorario"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Horário</FormLabel>
                <FormControl>
                  <Input type="time" data-testid="input-casamento-horario" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="casamentoLocal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Local do casamento</FormLabel>
              <FormControl>
                <Input data-testid="input-casamento-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} data-testid="button-salvar-noiva">
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
