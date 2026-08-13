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
  // S-C32 — a peça que não voltou: o aviso que nasce da AUSÊNCIA de um gesto.
  useListContratosComAtraso,
  getListContratosComAtrasoQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, X } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { hojeLocal, addDias } from "@/lib/financeiro/datas";
import { instanteDiaMes } from "@/lib/formatos";
import { avisoDoAtraso } from "@/lib/financeiro/fila-de-atrasos";


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
  // S-C32: é `contratos`, e não `financeiro` — a Vendedora do seed tem
  // `financeiro: NADA` e `contratos: TUDO`, e é ela quem cobra o atraso da 16ª.
  const veContratos = podeNoModulo(acessosModulos, "contratos", "ver");

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
  // E83: o poll pede a JANELA (hoje e amanhã cobrem as próximas 24h), não a
  // agenda inteira — o recorte fino por timestamp continua abaixo, no cliente.
  const janelaSino = { de: hojeLocal(), ate: addDias(hojeLocal(), 1) };
  const atendimentos = useListAtendimentos(activeLojaId!, janelaSino, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janelaSino),
      enabled: !!activeLojaId && veAgenda,
      refetchInterval: POLL_MS,
      retry: false,
    },
  });

  /**
   * **S-C32 — a peça que não voltou, e é o aviso mais "E68" de todos.**
   *
   * Os quatro avisos deste sino existiam antes dele, cada um numa tela: o lead
   * esfriando no funil, o caixa furando na projeção, a competência esquecida na
   * comissão, a prova de amanhã na agenda. O atraso da 16ª não existia em tela
   * NENHUMA além da ficha daquela reserva — e o fato que o dispara é a AUSÊNCIA
   * de um gesto: ninguém devolveu a peça, então nada acontece e nada avisa.
   *
   * Enquanto isso a diária soma: R$ 500,00 por dia num vestido de R$ 3.000,00.
   */
  const atrasos = useListContratosComAtraso(activeLojaId!, {
    query: {
      queryKey: getListContratosComAtrasoQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veContratos,
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
        // S-M4: primeiro dia negativo HOJE = a loja já está no vermelho, e
        // "fica negativo em" mentiria sobre um fato presente.
        titulo:
          diaNegativo <= hojeLocal()
            ? "O caixa já está negativo"
            : `O caixa fica negativo em ${instanteDiaMes(`${diaNegativo}T12:00:00-03:00`)}`,
        detalhe: "Pela projeção com o que há para receber e pagar.",
        href: `${base}/financeiro/projecao`,
        urgente: true,
      });
    }

    // S-C32: a peça fora da arara, logo depois do caixa. Ela é dinheiro que
    // CRESCE sozinho — a única cobrança do sistema de que isso é verdade — e
    // uma peça que outra noiva não pode reservar enquanto não volta.
    const atraso = avisoDoAtraso(atrasos.data);
    if (atraso) {
      lista.push({
        // A assinatura leva peças, dias e valor: dispensar hoje não cala amanhã,
        // quando o número já é outro.
        id: `ATRASO:${atraso.assinatura}`,
        titulo: atraso.titulo,
        detalhe: atraso.detalhe,
        href: `${base}/contratos`,
        urgente: atraso.urgente,
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
        // E92/F8: o aviso apontava para a AGENDA, que mostra os horários; quem
        // vai confirmar presença quer a FILA pronta de wa.me, que é /mensagens.
        detalhe: "A fila de mensagens de hoje tem o WhatsApp pronto.",
        href: `${base}/mensagens`,
        urgente: false,
      });
    }

    return lista;
  }, [alertaCaixa.data, atrasos.data, pendencias.data, parados.data, atendimentos.data, base]);

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
              className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${
                /* E127/E4: text-white cru sobre bg-primary dava 2,79:1 num
                   numeral de 10px — o par TESTADO de aparencia.test.ts é
                   foreground sobre a própria cor, em cada ramo. */
                urgentes ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
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
                  className="md:h-6 md:w-6 shrink-0"
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
