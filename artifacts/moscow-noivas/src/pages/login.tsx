import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";

const loginSchema = z.object({
  email: z.string().email({ message: "E-mail inválido" }),
  senha: z.string().min(1, { message: "Senha é obrigatória" }),
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      senha: "",
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      const session = await login({ data: values });
      if (session.lojaAtivaId) {
        navigate(`/loja/${session.lojaAtivaId}/dashboard`);
      } else {
        navigate("/selecionar-loja");
      }
    } catch (error) {
      toast({
        title: "Não consegui entrar",
        // Aqui um 401 não é "sua sessão expirou" — a pessoa nem tinha sessão.
        description: mensagemApi(
          error,
          "Não consegui entrar agora. Tente de novo em um instante.",
          {},
          { 401: "E-mail ou senha não conferem." },
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif text-primary">Moscow Noivas</h1>
          <p className="text-muted-foreground">Acesso ao sistema</p>
        </div>

        <div className="bg-card border rounded-lg p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      {/* E92/E20: sem type/autoComplete o gerenciador de senhas
                          não oferecia preenchimento — e o teclado vinha sem o @. */}
                      <Input
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="seu@email.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
