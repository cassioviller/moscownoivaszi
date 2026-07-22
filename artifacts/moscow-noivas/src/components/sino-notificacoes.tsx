import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetAlertaCaixa,
  getGetAlertaCaixaQueryKey,
  useListPendenciasComissao,
  getListPendenciasComissaoQueryKey,
  useGetLeadsParados,
  getGetLeadsParadosQueryKey,
  useListAtendimentos,
  getListAtendimentosQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, X } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";


/**
 * E68 — o sistema avisa quem não perguntou.
 *
 * Todo alerta já existia, mas só quando alguém abria a tela certa: o lead
 * esfriava no funil, o caixa furava na projeção, a competência esquecia na
 * comissão e a prova de amanhã esperava na agenda. O sino reúne os quatro
 * motores num lugar que está em TODA tela — sem tabela nova, sem cron: as
 * mesmas queries (o cache do react-query deduplica com as páginas) num
 * poll de 5 minutos, e o "dispensar" vive em localStorage por pessoa×loja,
 * como o tour (E24). O aviso dispensado volta se o fato mudar (o id carrega
 * a assinatura do estado).
 */

const POLL_MS = 5 * 60_000;

type Notificacao = {
  /** Identidade estável do AVISO NAQUELE ESTADO — mudou o fato, muda o id e ele reaparece. */
  id: string;
  titulo: string;
  detalhe?: string;
  href: string;
  urgente: boolean;
};

const diaCurto = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

function chaveDispensadas(usuarioId: string, lojaId: string): string {
  return `sino:dispensadas:${usuarioId}:${lojaId}`;
}

function lerDispensadas(chave: string): string[] {
  try {
    const cru = localStorage.getItem(chave);
    const lista = cru ? JSON.parse(cru) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function SinoNotificacoes() {
  const { activeLojaId, acessosModulos, user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [versaoDispensadas, setVersaoDispensadas] = useState(0);

  const veLeads = podeNoModulo(acessosModulos, "leads", "ver");
  const veAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  const veFinanceiro = podeNoModulo(acessosModulos, "financeiro", "ver");
  const veComissao = podeNoModulo(acessosModulos, "comissao", "ver");

  const alertaCaixa = useGetAlertaCaixa(activeLojaId!, {
    query: {
      queryKey: getGetAlertaCaixaQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veFinanceiro,
      refetchInterval: POLL_MS,
      retry: false,
    },
  });
  const pendencias = useListPendenciasComissao(activeLojaId!, {
    query: {
      queryKey: getListPendenciasComissaoQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veComissao,
      refetchInterval: POLL_MS,
      retry: false,
    },
  });
  // E79: a régua roda no banco — só as contagens viajam.
  const parados = useGetLeadsParados(activeLojaId!, {
    query: {
      queryKey: getGetLeadsParadosQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veLeads,
      refetchInterval: POLL_MS,
      retry: false,
    },
  });
  const atendimentos = useListAtendimentos(activeLojaId!, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veAgenda,
      refetchInterval: POLL_MS,
      retry: false,
    },
  });

  const base = `/loja/${activeLojaId}`;

  const todas = useMemo<Notificacao[]>(() => {
    const lista: Notificacao[] = [];

    // Caixa vai furar (E46) — o aviso mais grave vem primeiro.
    const diaNegativo = alertaCaixa.data?.diaNegativo;
    if (diaNegativo) {
      lista.push({
        id: `CAIXA:${diaNegativo}`,
        titulo: `O caixa fica negativo em ${diaCurto.format(new Date(`${diaNegativo}T12:00:00-03:00`))}`,
        detalhe: "Pela projeção com o que há para receber e pagar.",
        href: `${base}/financeiro/projecao`,
        urgente: true,
      });
    }

    // Competência de comissão esquecida (E53).
    for (const p of pendencias.data ?? []) {
      lista.push({
        id: `COMISSAO:${p.competencia}:${p.vendedoras}`,
        titulo: `Comissão de ${p.competencia} sem fechamento`,
        detalhe: `${p.vendedoras} vendedora${p.vendedoras === 1 ? "" : "s"} com vendas no mês.`,
        href: `${base}/comissoes?competencia=${p.competencia}`,
        urgente: false,
      });
    }

    // Noivas esfriando — a contagem vem do banco (E79), a régua é a mesma.
    const criticos = parados.data?.criticos ?? 0;
    if (criticos > 0) {
      lista.push({
        id: `LEADS_CRITICOS:${criticos}`,
        titulo: `${criticos} noiva${criticos === 1 ? "" : "s"} sem contato há mais de 14 dias`,
        detalhe: "O funil mostra quem está esfriando.",
        href: `${base}/noivas?vista=funil`,
        urgente: true,
      });
    }

    // Presenças das próximas 24h ainda sem confirmação (E39).
    const agora = Date.now();
    const em24h = agora + 24 * 3_600_000;
    const semConfirmar = (atendimentos.data ?? []).filter((a) => {
      if (a.situacao !== "AGENDADO" || a.confirmadoEm) return false;
      const t = new Date(a.inicio).getTime();
      return t >= agora && t <= em24h;
    });
    if (semConfirmar.length > 0) {
      lista.push({
        id: `CONFIRMAR:${semConfirmar.map((a) => a.id).sort().join(",")}`,
        titulo: `${semConfirmar.length} presença${semConfirmar.length === 1 ? "" : "s"} por confirmar nas próximas 24h`,
        detalhe: "A fila da agenda tem o WhatsApp pronto.",
        href: `${base}/agenda`,
        urgente: false,
      });
    }

    return lista;
  }, [alertaCaixa.data, pendencias.data, parados.data, atendimentos.data, base]);

  const chave = user && activeLojaId ? chaveDispensadas(user.id, activeLojaId) : null;
  const visiveis = useMemo(() => {
    if (!chave) return todas;
    void versaoDispensadas;
    const dispensadas = new Set(lerDispensadas(chave));
    return todas.filter((n) => !dispensadas.has(n.id));
  }, [todas, chave, versaoDispensadas]);

  const dispensar = (id: string) => {
    if (!chave) return;
    // Guarda só ids ainda relevantes — aviso que sumiu sozinho sai da lista.
    const atuais = new Set(lerDispensadas(chave).filter((d) => todas.some((n) => n.id === d)));
    atuais.add(id);
    localStorage.setItem(chave, JSON.stringify([...atuais]));
    setVersaoDispensadas((v) => v + 1);
  };

  if (!activeLojaId) return null;

  const urgentes = visiveis.some((n) => n.urgente);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            visiveis.length === 0
              ? "Notificações — nada pendente"
              : `Notificações — ${visiveis.length} aviso${visiveis.length === 1 ? "" : "s"}`
          }
          className="relative"
          data-testid="sino-notificacoes"
        >
          <Bell className="h-5 w-5" />
          {visiveis.length > 0 && (
            <span
              className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white ${
                urgentes ? "bg-destructive" : "bg-primary"
              }`}
              data-testid="sino-contador"
            >
              {visiveis.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2">
          <p className="text-sm font-medium">Avisos</p>
        </div>
        {visiveis.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nada pendente — tudo em dia.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {visiveis.map((n) => (
              <li key={n.id} className="flex items-start gap-2 px-4 py-3">
                <Link
                  to={n.href}
                  onClick={() => setAberto(false)}
                  className="min-w-0 flex-1 space-y-0.5"
                >
                  <p className={`text-sm ${n.urgente ? "font-medium" : ""}`}>{n.titulo}</p>
                  {n.detalhe && (
                    <p className="text-xs text-muted-foreground">{n.detalhe}</p>
                  )}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Dispensar: ${n.titulo}`}
                  onClick={() => dispensar(n.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
