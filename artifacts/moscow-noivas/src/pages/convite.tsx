import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useGetConviteInfo,
  getGetConviteInfoQueryKey,
  useAceitarConvite,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

/**
 * Página PÚBLICA do convite (/convite/:token) — irmã do /login. A convidada
 * abre o link do WhatsApp, vê quem a convidou para onde e:
 * - e-mail sem conta: define a própria senha e entra logada;
 * - e-mail com conta: só confirma o vínculo e segue para o login (o link não
 *   prova que ela é a dona da conta — a senha prova).
 * O token fica no path do FRONT (SPA — não passa pelo servidor); para a API
 * ele vai em query/corpo, que não caem em log.
 */

const ERROS: Record<string, string> = {
  CONVITE_EXPIRADO: "Este convite expirou. Peça um novo link para a administração da loja.",
  CONVITE_UTILIZADO: "Este convite já foi usado. Se foi você, entre pelo login.",
};

export default function Convite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const params = { token: token! };
  const info = useGetConviteInfo(params, {
    query: {
      queryKey: getGetConviteInfoQueryKey(params),
      enabled: !!token,
      retry: false, // 404/410 são veredito, não falha transitória
    },
  });
  const aceitar = useAceitarConvite();

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  async function onAceitar() {
    if (info.data?.precisaSenha) {
      if (senha.length < 6) {
        toast({ title: "A senha precisa de ao menos 6 caracteres", variant: "destructive" });
        return;
      }
      if (senha !== confirmar) {
        toast({ title: "As senhas não conferem", variant: "destructive" });
        return;
      }
    }
    try {
      const r = await aceitar.mutateAsync({
        data: { token: token!, ...(info.data?.precisaSenha ? { senha } : {}) },
      });
      if (r.jaTinhaConta) {
        toast({ title: "Vínculo criado", description: "Entre com o seu e-mail e a sua senha de sempre." });
        navigate("/login");
      } else {
        toast({ title: "Bem-vinda à equipe!" });
        navigate("/selecionar-loja");
      }
    } catch (err) {
      const e = err as { status?: number; data?: { error?: string } };
      toast({
        title: "Não foi possível aceitar o convite",
        description: ERROS[e?.data?.error ?? ""] ?? (err instanceof Error ? err.message : "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  const erroInfo = info.error as { status?: number; data?: { error?: string } } | null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif text-primary">Moscow Noivas</h1>
          <p className="text-muted-foreground">Convite para a equipe</p>
        </div>

        <div className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
          {info.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : info.isError ? (
            <div className="space-y-3 text-center">
              <p className="text-sm">
                {ERROS[erroInfo?.data?.error ?? ""] ??
                  "Convite inválido — confira se o link veio inteiro."}
              </p>
              <Button variant="outline" onClick={() => navigate("/login")}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm">
                  Olá, <span className="font-medium">{info.data.nome}</span>! Você foi
                  convidada para a equipe de{" "}
                  <span className="font-medium">{info.data.lojaNome}</span>.
                </p>
                <p className="text-xs text-muted-foreground">Convite para {info.data.emailMascarado}</p>
              </div>

              {info.data.precisaSenha ? (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="senha">Crie a sua senha</Label>
                    <Input
                      id="senha"
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="confirmar">Confirme a senha</Label>
                    <Input
                      id="confirmar"
                      type="password"
                      autoComplete="new-password"
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" onClick={onAceitar} disabled={aceitar.isPending}>
                    {aceitar.isPending ? "Entrando…" : "Criar conta e entrar"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Este e-mail já tem conta no sistema. Aceitar cria o vínculo com a
                    loja; depois é só entrar com a sua senha de sempre.
                  </p>
                  <Button className="w-full" onClick={onAceitar} disabled={aceitar.isPending}>
                    {aceitar.isPending ? "Aceitando…" : "Aceitar e ir para o login"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
