import {
  useGetBackupStatus,
  getGetBackupStatusQueryKey,
  useRunBackup,
  type BackupLog,
  type RestoreDrillLog,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoErro } from "@/components/estado-erro";
import { useToast } from "@/hooks/use-toast";
import { DatabaseBackup, Loader2 } from "lucide-react";

/**
 * Status de backup do sistema (E30) — a resposta do SRE à pergunta que não
 * aparecia em tela nenhuma: "quando foi o último backup?". O risco invisível
 * (banco sem cópia recente) vira uma linha que a dona lê e um botão que ela
 * aperta. Mora na aba Administração porque o dump é do banco inteiro.
 */

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "há 5 min", "há 3 h", "há 12 dias" — ou null para cair na data absoluta. */
function haQuanto(instante: string): string | null {
  const ms = Date.now() - new Date(instante).getTime();
  if (ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias <= 90) return `há ${dias} dia${dias === 1 ? "" : "s"}`;
  return null;
}

function dataLonga(iso: string): string {
  return quandoFmt.format(new Date(iso)).replace(", ", " às ");
}

function tamanho(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/**
 * A saúde do backup pela idade da ÚLTIMA cópia boa: verde no dia, âmbar até
 * 48 h, vermelho depois — o mesmo semáforo que a régua de inadimplência (E29)
 * usa para o atraso. Erro e "nunca" já entram vermelhos.
 */
type Saude = { cor: string; texto: string };
function saude(ultimo: BackupLog | null): Saude {
  if (!ultimo) return { cor: "bg-red-500", texto: "Nenhum backup ainda" };
  if (ultimo.status === "em_andamento") return { cor: "bg-amber-500", texto: "Backup em andamento" };
  if (ultimo.status === "erro") return { cor: "bg-red-500", texto: "Último backup falhou" };
  const horas = (Date.now() - new Date(ultimo.iniciadoEm).getTime()) / 3_600_000;
  if (horas <= 24) return { cor: "bg-emerald-500", texto: "Backup em dia" };
  if (horas <= 48) return { cor: "bg-amber-500", texto: "Backup ficando velho" };
  return { cor: "bg-red-500", texto: "Backup atrasado" };
}

/**
 * A linha do drill (E89): backup que nunca voltou não é backup. Diz quando um
 * dump foi de fato RESTAURADO num banco efêmero e conferido contra a origem.
 */
function linhaDrill(drill: RestoreDrillLog | null | undefined): {
  texto: string;
  alerta: boolean;
} {
  if (!drill)
    return { texto: "Restauração nunca conferida — o drill do restore ainda não rodou", alerta: true };
  if (drill.status === "em_andamento")
    return { texto: `Drill de restore em andamento desde ${dataLonga(drill.iniciadoEm)}`, alerta: false };
  if (drill.status === "erro")
    return {
      texto: `Último drill de restore FALHOU em ${dataLonga(drill.concluidoEm ?? drill.iniciadoEm)}${drill.erro ? ` — ${drill.erro}` : ""}`,
      alerta: true,
    };
  return {
    texto: `Restaurado e conferido em ${dataLonga(drill.concluidoEm ?? drill.iniciadoEm)}${
      drill.tabelasConferidas ? ` · ${drill.tabelasConferidas} tabelas` : ""
    }${drill.dumpArquivo ? ` · ${drill.dumpArquivo}` : ""}`,
    alerta: false,
  };
}

function seloStatus(status: BackupLog["status"]) {
  if (status === "ok") return <Badge variant="secondary" className="font-normal">ok</Badge>;
  if (status === "em_andamento")
    return <Badge variant="outline" className="font-normal">em andamento</Badge>;
  return <Badge variant="destructive" className="font-normal">erro</Badge>;
}

export function BackupSistema() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusQ = useGetBackupStatus({
    query: { queryKey: getGetBackupStatusQueryKey() },
  });

  const rodar = useRunBackup({
    mutation: {
      onSuccess: (registro) => {
        queryClient.invalidateQueries({ queryKey: getGetBackupStatusQueryKey() });
        if (registro.status === "ok") {
          toast({ title: "Backup concluído", description: `${tamanho(registro.tamanhoBytes)} gravados.` });
        } else {
          toast({
            title: "Backup falhou",
            description: registro.erro ?? "Tente novamente em instantes.",
            variant: "destructive",
          });
        }
      },
      onError: () => {
        toast({
          title: "Não deu para rodar o backup",
          description: "Verifique a conexão e tente de novo.",
          variant: "destructive",
        });
      },
    },
  });

  const ultimo = statusQ.data?.ultimo ?? null;
  const s = saude(ultimo);
  const drill = linhaDrill(statusQ.data?.ultimoDrill);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" /> Backup do sistema
        </CardTitle>
        <CardDescription>
          Cópia do banco inteiro. A rotina agendada roda sozinha; aqui você vê a última e pode
          disparar uma na hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {statusQ.isError ? (
          <EstadoErro
            titulo="Erro ao carregar o status do backup"
            erro={statusQ.error}
            onTentarNovamente={() => statusQ.refetch()}
          />
        ) : statusQ.isPending ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded-md" />
            <div className="h-8 bg-muted rounded-md w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${s.cor} shrink-0`} aria-hidden />
                <div>
                  <p className="text-sm text-muted-foreground">{s.texto}</p>
                  <p className="text-2xl font-serif leading-tight">
                    {ultimo
                      ? `Último backup ${haQuanto(ultimo.iniciadoEm) ?? "em " + dataLonga(ultimo.iniciadoEm)}`
                      : "Nunca rodou"}
                  </p>
                  {ultimo && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dataLonga(ultimo.iniciadoEm)}
                      {ultimo.status === "ok" && ` · ${tamanho(ultimo.tamanhoBytes)}`}
                      {` · ${ultimo.gatilho === "manual" ? "manual" : "agendado"}`}
                      {ultimo.autorNome && ` · por ${ultimo.autorNome}`}
                    </p>
                  )}
                  {ultimo?.status === "erro" && ultimo.erro && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{ultimo.erro}</p>
                  )}
                </div>
              </div>
              <Button onClick={() => rodar.mutate()} disabled={rodar.isPending} className="gap-2">
                {rodar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {rodar.isPending ? "Fazendo backup…" : "Fazer backup agora"}
              </Button>
            </div>

            {/* E89: a cópia só vale quando alguém provou que ela VOLTA — a
                linha do drill mostra a última restauração conferida. */}
            <p
              className={`text-xs ${drill.alerta ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
              data-testid="drill-restore"
            >
              {drill.texto}
            </p>

            {statusQ.data.recentes.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Execuções recentes</p>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {statusQ.data.recentes.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2">
                      <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {dataLonga(b.iniciadoEm)}
                      </span>
                      {seloStatus(b.status)}
                      <span className="text-xs text-muted-foreground">
                        {b.gatilho === "manual" ? "manual" : "agendado"}
                        {b.status === "ok" && ` · ${tamanho(b.tamanhoBytes)}`}
                        {b.autorNome && ` · ${b.autorNome}`}
                      </span>
                      {/* E59: a cópia só protege quando sai da instância. Âncora
                          direta (sessão vai no cookie); dump podado não oferece. */}
                      {b.status === "ok" && b.arquivo && (
                        <a
                          href={`/api/admin/backup/${b.id}/download`}
                          download
                          className="ml-auto text-xs text-primary underline underline-offset-4 whitespace-nowrap"
                          data-testid={`baixar-backup-${b.id}`}
                        >
                          Baixar
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
