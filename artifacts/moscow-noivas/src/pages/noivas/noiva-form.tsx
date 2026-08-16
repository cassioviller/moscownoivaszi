import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { useForm, type DefaultValues } from "react-hook-form";
import { cpfValido } from "@workspace/financeiro-core";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatarWhatsApp, whatsappUtilizavel } from "@/lib/whatsapp";
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
  /**
   * S-O43 — o número que não vira link não entra.
   *
   * Era `z.string().optional()`: um dígito a menos era aceito, salvo e exibido
   * na ficha como se estivesse bom, e todo botão de wa.me do sistema sumia sem
   * uma palavra. A conferência é derivada do `linkWhatsApp`, então não há uma
   * segunda cópia da regra dos dígitos para divergir (regra 26).
   */
  whatsapp: z
    .string()
    .optional()
    .refine(whatsappUtilizavel, {
      message:
        "Confira o número: com DDD, 10 ou 11 dígitos. Sem isso, os botões de WhatsApp dela não aparecem em lugar nenhum do sistema.",
    }),
  cerimonialista: z.string().optional(),
  casamentoData: z.string().optional(),
  casamentoHorario: z.string().optional(),
  casamentoLocal: z.string().optional(),
  // SITE/INSTAGRAM nascem da captação externa (E19); aqui aparecem para a
  // edição não engasgar com um lead captado.
  origem: z.enum(["LOJA", "WHATSAPP", "SITE", "INSTAGRAM"], {
    message: "Escolha de onde ela veio",
  }),
  /**
   * E215 — a qualificação de quem assina o contrato.
   *
   * **Opcionais AQUI, e é decisão.** A régua mora na porta do fecho
   * (`POST /contratos` recusa com `QUALIFICACAO_INCOMPLETA` nomeando o campo),
   * não neste formulário: a noiva vira ficha quando liga perguntando preço, e
   * exigir CPF no cadastro travaria o balcão. O formulário AVISA o que vai
   * fazer falta — no molde do E218, onde a entrada de 40% avisa em vez de
   * recusar.
   */
  // E233: vazio passa (a régua da presença é do FECHO); preenchido, tem de
  // fechar os dígitos — a mesma função que a porta usa para recusar.
  cpf: z
    .string()
    .optional()
    .refine((v) => !v || !v.trim() || cpfValido(v), {
      message: "Os dígitos verificadores deste CPF não fecham — confira o número.",
    }),
  rg: z.string().optional(),
  // Uma linha só, e não é estilo: a `enums-do-contrato` lê este `z.enum`
  // TEXTUALMENTE (importar o schema exigiria montar a tela inteira), e o regex
  // dela pede `z.enum(` contíguo. Quebrado em `z\n.enum(`, o leitor não acha e
  // falha alto — que é o comportamento certo dele, e foi como este comentário
  // nasceu.
  estadoCivil: z.enum(["SOLTEIRA", "CASADA", "DIVORCIADA", "VIUVA", "SEPARADA", "UNIAO_ESTAVEL"]).optional(),
  profissao: z.string().optional(),
  nascimento: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Confira o e-mail — o contrato é enviado para ele.",
    }),
  enderecoLogradouro: z.string().optional(),
  enderecoNumero: z.string().optional(),
  enderecoComplemento: z.string().optional(),
  enderecoBairro: z.string().optional(),
  enderecoCep: z.string().optional(),
  enderecoCidade: z.string().optional(),
  // C11 da conferência (16/08, S-M9): a tela aceitava 1 letra, a criação
  // recusava com 400 e a edição aceitava — três réguas para a UF. A da porta é
  // DUAS letras (`LeadInput`/`LeadUpdate`), e a tela diz antes do clique.
  enderecoEstado: z
    .string()
    .optional()
    .refine((v) => !v || v.trim().length === 2, "UF são duas letras (ex.: SP)"),
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
  // E215 — a qualificação. Vazias como as irmãs de texto; `estadoCivil` é
  // `undefined` pela mesma razão de `origem`: select que já vem respondido é
  // resposta que ninguém deu (F2).
  cpf: "",
  rg: "",
  estadoCivil: undefined,
  profissao: "",
  nascimento: "",
  email: "",
  enderecoLogradouro: "",
  enderecoNumero: "",
  enderecoComplemento: "",
  enderecoBairro: "",
  enderecoCep: "",
  enderecoCidade: "",
  enderecoEstado: "",
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
                {/* S-O43: a máscara formata o que JÁ foi digitado e não
                    completa nada — meio número sai como meio número, não como
                    um telefone inventado. */}
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  data-testid="input-noiva-whatsapp"
                  {...field}
                  onChange={(e) => field.onChange(formatarWhatsApp(e.target.value))}
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

        {/*
          E215 — a qualificação de quem assina o contrato.
          Fica no fim porque não é o que se pergunta na primeira ligação: a
          noiva vira ficha perguntando preço, e estes campos só fazem falta no
          dia do fecho. O aviso abaixo diz isso em vez de deixar a vendedora
          descobrir no 422.
        */}
        <div className="space-y-1 border-t pt-5">
          <p className="text-xs font-medium text-muted-foreground">
            Para o contrato
          </p>
          <p className="text-xs text-muted-foreground" data-testid="texto-aviso-qualificacao">
            O contrato de locação qualifica quem assina. Sem estes dados dá para
            cadastrar e orçar, mas <strong>não dá para fechar contrato</strong> —
            e aí a tela do fecho diz exatamente o que falta.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="000.000.000-00" data-testid="input-noiva-cpf" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rg"
            render={({ field }) => (
              <FormItem>
                <FormLabel>RG</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-rg" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nascimento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de nascimento</FormLabel>
                <FormControl>
                  <Input type="date" data-testid="input-noiva-nascimento" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estadoCivil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado civil</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-noiva-estado-civil">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SOLTEIRA">Solteira</SelectItem>
                    <SelectItem value="CASADA">Casada</SelectItem>
                    <SelectItem value="DIVORCIADA">Divorciada</SelectItem>
                    <SelectItem value="VIUVA">Viúva</SelectItem>
                    <SelectItem value="SEPARADA">Separada</SelectItem>
                    <SelectItem value="UNIAO_ESTAVEL">União estável</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="profissao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profissão</FormLabel>
              <FormControl>
                <Input data-testid="input-noiva-profissao" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" autoComplete="email" data-testid="input-noiva-email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-[1fr_auto] gap-4">
          <FormField
            control={form.control}
            name="enderecoLogradouro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logradouro</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-logradouro" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enderecoNumero"
            render={({ field }) => (
              <FormItem className="w-24">
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-numero" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="enderecoComplemento"
            render={({ field }) => (
              <FormItem>
                {/* O único da lista que o contrato NÃO exige: casa térrea não
                    tem apto 42, e exigi-lo produziria "-" em toda ficha. */}
                <FormLabel>Complemento</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-complemento" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enderecoBairro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bairro</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-bairro" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-[7rem_1fr_5rem] gap-4">
          <FormField
            control={form.control}
            name="enderecoCep"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CEP</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="00000-000" data-testid="input-noiva-cep" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enderecoCidade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade</FormLabel>
                <FormControl>
                  <Input data-testid="input-noiva-cidade" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enderecoEstado"
            render={({ field }) => (
              <FormItem>
                <FormLabel>UF</FormLabel>
                <FormControl>
                  <Input maxLength={2} data-testid="input-noiva-estado" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={pending} data-testid="button-salvar-noiva">
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
