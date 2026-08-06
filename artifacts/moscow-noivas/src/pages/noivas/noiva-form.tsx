import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { useForm, type DefaultValues } from "react-hook-form";
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
  noivaNome: z.string().min(1, "Informe o nome da noiva"),
  noivoNome: z.string().optional(),
  whatsapp: z.string().optional(),
  cerimonialista: z.string().optional(),
  casamentoData: z.string().optional(),
  casamentoHorario: z.string().optional(),
  casamentoLocal: z.string().optional(),
  // SITE/INSTAGRAM nascem da captação externa (E19); aqui aparecem para a
  // edição não engasgar com um lead captado.
  origem: z.enum(["LOJA", "WHATSAPP", "SITE", "INSTAGRAM"], {
    message: "Escolha de onde ela veio",
  }),
});

export type NoivaFormValues = z.infer<typeof noivaSchema>;

/**
 * F2 — a origem NASCE VAZIA, e é por isso que o tipo aqui não é
 * `NoivaFormValues`.
 *
 * Ela vinha `"LOJA"` já escolhida, e o select mostrava "Loja" como se alguém
 * tivesse respondido. Quem cadastrava sem olhar aquele campo — o caso comum,
 * porque ele fica no meio de sete outros — criava uma noiva de canal LOJA para
 * sempre: `/noivas/conversao` existe para dizer quanto cada canal traz, e o
 * default silencioso somava toda captação de Instagram na coluna da loja
 * física. O `z.enum` já era obrigatório; faltava não responder por ela.
 */
const VAZIO: DefaultValues<NoivaFormValues> = {
  noivaNome: "",
  noivoNome: "",
  whatsapp: "",
  cerimonialista: "",
  casamentoData: "",
  casamentoHorario: "",
  casamentoLocal: "",
  origem: undefined,
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
  origemTravada,
}: {
  defaults?: Partial<NoivaFormValues>;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: NoivaFormValues) => void | Promise<void>;
  /**
   * F2 — a origem é corrigível até a noiva CONVERTER; depois disso o relatório
   * de conversão já a contou naquele canal, e a rota devolve 422
   * ORIGEM_IMUTAVEL. A tela repete a régua do servidor para o campo não
   * convidar a uma edição que vai falhar no salvar.
   */
  origemTravada?: boolean;
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
   * acontece, porque a tela some. Sem guarda, salvar uma noiva perguntaria
   * "quer descartar as alterações?" logo depois de a pessoa ter salvado: um
   * aviso que treina quem usa a ignorar.
   *
   * O `salvou` que morava aqui não bastava, e o E2E provou: quem navega é o
   * PAI, dentro do `await onSubmit`, antes do render que ligava o estado.
   * `sujoParaConfirmar` traz o termo que faltava — `isSubmitting`, ligado
   * durante esse mesmo `await`.
   */
  useConfirmarSaida(sujoParaConfirmar(form.formState));

  const submeter = async (values: NoivaFormValues) => {
    // Se o `onSubmit` lançar, o react-hook-form deixa `isSubmitSuccessful`
    // falso e o formulário continua sujo e protegido — que é o caso em que
    // perder o que foi digitado dói mais.
    await onSubmit(values);
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
              <FormLabel>Origem *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={origemTravada}>
                <FormControl>
                  <SelectTrigger data-testid="select-noiva-origem">
                    <SelectValue placeholder="De onde ela veio?" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LOJA">Loja</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="SITE">Site</SelectItem>
                  <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                </SelectContent>
              </Select>
              {origemTravada && (
                <p className="text-xs text-muted-foreground">
                  A noiva já fechou contrato — o relatório de conversão já contou
                  esta origem, e mudá-la agora reescreveria um número lido.
                </p>
              )}
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
