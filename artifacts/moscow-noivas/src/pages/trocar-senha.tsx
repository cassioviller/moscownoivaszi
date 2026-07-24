import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTrocarSenha, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/pages/financeiro/helpers";

/**
 * Trocar a própria senha (E57).
 *
 * Vale para os dois casos: a troca FORÇADA de quem recebeu uma senha escolhida
 * por outra pessoa, e a troca voluntária de quem quiser. A tela é a mesma; o
 * que muda é o texto e o fato de o gate não deixar sair da forçada.
 */

const MENSAGENS_ERRO: Record<string, string> = {
  SENHA_ATUAL_INCORRETA: "A senha atual não confere.",
  SENHA_REPETIDA: "A nova senha é igual à atual — escolha outra.",
};

const MINIMO = 6;

export default function TrocarSenha() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trocar = useTrocarSenha();

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const forcada = !!user?.precisaTrocarSenha;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < MINIMO) {
      toast({ title: `A nova senha precisa de ao menos ${MINIMO} caracteres`, variant: "destructive" });
      return;
    }
    // Confere a digitação ANTES de gravar: errar a nova senha e só descobrir no
    // próximo login deixaria a pessoa trancada para fora do próprio acesso.
    if (novaSenha !== confirmacao) {
      toast({ title: "A confirmação não bate com a nova senha", variant: "destructive" });
      return;
    }

    try {
      await trocar.mutateAsync({ data: { senhaAtual, novaSenha } });
      // O /me carrega `precisaTrocarSenha`: sem invalidar, o gate continuaria
      // mandando de volta para cá.
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Senha trocada", description: "As outras sessões suas foram encerradas." });
      navigate("/");
    } catch (err) {
      toast({
        title: "Não foi possível trocar a senha",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="trocar-senha">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">
            {forcada ? "Escolha a sua senha" : "Trocar a senha"}
          </CardTitle>
          <CardDescription>
            {forcada
              ? "A senha atual foi definida por quem criou o seu acesso — enquanto ela valer, essa pessoa consegue entrar como você. Escolha uma que só você saiba."
              : "Trocar a senha encerra as suas outras sessões abertas."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="senha-atual">Senha atual</Label>
              <Input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Ao menos {MINIMO} caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmacao">Repita a nova senha</Label>
              <Input
                id="confirmacao"
                type="password"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={trocar.isPending}>
              {trocar.isPending ? "Trocando…" : "Trocar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
