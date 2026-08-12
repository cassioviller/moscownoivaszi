import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACOES, MODULOS_ROTULOS, podeNoModulo, type Acao } from "@/lib/permissoes";

/**
 * Tour do acesso (E24) — o passo seguinte do D5: em vez de o membro novo
 * descobrir o que pode fazendo tentativa e erro, a primeira entrada na loja
 * mostra o que o perfil libera (módulo × ação) e diz com todas as letras que
 * o resto se pede ao admin. Depois, mora em Configurações → "Seu acesso".
 */

const ROTULO_ACAO: Record<Acao, string> = { ver: "ver", criar: "criar", editar: "editar" };

/** A porta de entrada de cada módulo na navegação. */
const ROTA_MODULO: Record<string, string> = {
  leads: "leads",
  // E172: os dois módulos que saíram de dentro de `leads`. O `?? m.modulo` do
  // uso já acertaria a rota dos dois — estão escritos porque este mapa é a
  // lista dos módulos, e um ausente se lê como módulo sem porta de entrada.
  orcamentos: "orcamentos",
  contratos: "contratos",
  agenda: "agenda",
  vestidos: "vestidos",
  financeiro: "financeiro",
  comissao: "comissoes",
  admin: "equipe",
};

const chaveTour = (usuarioId: string, lojaId: string) => `moscow.tour.${usuarioId}.${lojaId}`;

export function TourAcessoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { lojaId } = useParams();
  const { user, acessosModulos, session } = useAuth();

  const lojaAtiva = session?.lojas?.find((l) => l.id === lojaId);
  const perfilNome = user?.isSuperAdmin ? "Superadmin" : (lojaAtiva?.perfilNome ?? "seu perfil");

  const modulos = Object.keys(MODULOS_ROTULOS)
    .map((modulo) => ({
      modulo,
      rotulo: MODULOS_ROTULOS[modulo],
      acoes: ACOES.filter((acao) => podeNoModulo(acessosModulos, modulo, acao)),
    }))
    .filter((m) => m.acoes.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>O que você pode fazer aqui</DialogTitle>
          <DialogDescription>
            {user?.isSuperAdmin
              ? "Você é superadmin — acesso total, sem restrição de módulo."
              : `O perfil ${perfilNome} libera as áreas abaixo, com as ações marcadas.`}
          </DialogDescription>
        </DialogHeader>
        {modulos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum módulo liberado ainda — fale com o admin da loja para receber os acessos.
          </p>
        ) : (
          <ul className="space-y-2">
            {modulos.map((m) => (
              <li key={m.modulo} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                <Link
                  to={`/loja/${lojaId}/${ROTA_MODULO[m.modulo] ?? m.modulo}`}
                  className="text-sm font-medium hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {m.rotulo}
                </Link>
                <span className="flex gap-1">
                  {m.acoes.map((acao) => (
                    <Badge key={acao} variant="secondary" className="font-normal">
                      {ROTULO_ACAO[acao]}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          O que não aparece aqui não está liberado para o seu perfil. Precisa de algo a mais? Peça
          ao admin da loja — é ele quem ajusta os acessos em Permissões.
        </p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Começar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dispara o tour UMA vez por usuário × loja (flag em localStorage) — montado
 * no AppLayout, depois de sessão e loja resolvidas.
 */
export function TourAcessoPrimeiraEntrada() {
  const { lojaId } = useParams();
  const { user, isLoading } = useAuth();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (isLoading || !user || !lojaId) return;
    const chave = chaveTour(user.id, lojaId);
    try {
      if (!localStorage.getItem(chave)) {
        localStorage.setItem(chave, new Date().toISOString());
        setAberto(true);
      }
    } catch {
      // Sem localStorage (modo privado restrito): sem tour automático — o
      // manual em Configurações continua lá.
    }
  }, [isLoading, user, lojaId]);

  if (!aberto) return null;
  return <TourAcessoDialog open={aberto} onOpenChange={setAberto} />;
}
