import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useListCabines,
  getListCabinesQueryKey,
  type Atendimento,
} from "@workspace/api-client-react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { instanteHora } from "@/lib/formatos";
import { diaLocal } from "@/lib/financeiro/datas";
import { ancoraDaSemana, colunasDaGrade, diasDaSemana } from "@/lib/agenda-telas";
import { SeloProvaOrfa } from "@/components/selo-prova-orfa";

/**
 * Visão semanal (E20) — a grade da recepcionista: semana × cabine, cada célula
 * com os horários do dia. A tela do dia responde "e agora?"; esta responde
 * "como está a semana?" — encaixar a prova nova onde há vão, sem folhear dia
 * a dia. Só leitura: criar/editar continua nas telas existentes.
 */

const diaISO = (d: Date) => format(d, "yyyy-MM-dd");

export default function AgendaSemana() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * G11 (E168) — a semana nasce do dia da LOJA, como a tela do dia.
   *
   * Era `startOfWeek(new Date())`, e `new Date()` lido pelo date-fns é o
   * relógio do NAVEGADOR — enquanto o recorte dos atendimentos, logo abaixo,
   * já era pelo dia da loja desde o E115. As duas pontas da MESMA tela
   * discordavam sobre que dia é hoje. **Medido:** navegador em UTC às 02:00 de
   * segunda = 23:00 de domingo em São Paulo; `startOfWeek` responde a segunda
   * que começa, `diaLocal` responde o domingo que não acabou, e o botão "Esta
   * semana" leva à semana SEGUINTE — com a semana corrente inteira fora da
   * busca. É a fronteira que sobrou da S-M25.
   *
   * A conta vive em `lib/agenda-telas.ts`, sobre a string "YYYY-MM-DD": é a
   * única forma de o fuso do navegador não voltar pela porta dos fundos.
   */
  const ancoraParam = searchParams.get("semana");
  const diasYMD = useMemo(
    () => diasDaSemana(ancoraDaSemana(ancoraParam, new Date())),
    [ancoraParam],
  );
  // Os `Date` das colunas são dias-calendário sintéticos (meio-dia, sem borda).
  const dias = useMemo(() => diasYMD.map((d) => new Date(`${d}T12:00:00`)), [diasYMD]);
  const segunda = dias[0]!;

  // E83: a visão pede a SEMANA visível, não a agenda inteira.
  const janelaSemana = { de: diasYMD[0]!, ate: diasYMD[6]! };
  const atendimentos = useListAtendimentos(activeLojaId!, janelaSemana, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janelaSemana),
      enabled: !!activeLojaId,
    },
  });
  const cabines = useListCabines(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const daSemana = useMemo(() => {
    // E115: o recorte era por comparação de INSTANTE contra a meia-noite do
    // NAVEGADOR — na borda da semana, o atendimento de segunda de manhã (ou de
    // domingo à noite) sumia da grade para quem abre fora do fuso da loja. O
    // dia do atendimento é o dia da LOJA (`diaLocal`); as colunas da grade são
    // dias-calendário sintéticos, e a comparação certa é entre strings de dia.
    const de = diasYMD[0]!;
    const ate = diasYMD[6]!;
    return (atendimentos.data ?? [])
      .filter((a) => {
        const dia = diaLocal(a.inicio);
        return dia >= de && dia <= ate;
      })
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [atendimentos.data, diasYMD]);

  const porCabineEDia = useMemo(() => {
    const mapa = new Map<string, Atendimento[]>();
    for (const a of daSemana) {
      // E115: a coluna saía de `format(new Date(a.inicio))` — o dia do
      // NAVEGADOR. Uma prova às 14h de sexta em SP, vista de um fuso
      // adiantado, caía na coluna de SÁBADO com a hora ainda dizendo "14:00"
      // (a hora da célula sempre usou America/Sao_Paulo) — e a visão do DIA a
      // mostrava na sexta. Duas telas de agenda discordando do dia da semana.
      const chave = `${a.cabineId}:${diaLocal(a.inicio)}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(a);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [daSemana]);

  const navegar = (destino: Date | null) => {
    const proximo = new URLSearchParams(searchParams);
    if (destino) proximo.set("semana", diaISO(destino));
    else proximo.delete("semana");
    setSearchParams(proximo, { replace: true });
  };

  // G11: "hoje" é o dia da LOJA aqui também — a coluna destacada era a do
  // navegador, e destacava sábado numa sexta-feira à noite vista de Tóquio.
  const hojeYMD = diaLocal(new Date());
  /**
   * G6 (E168): a cabine desativada com agenda continua desenhada, marcada.
   * Era `filter((c) => c.ativo)`, e o 409 do DELETE recomenda desativar —
   * as provas da cabine sumiam da semana inteira sem ninguém apagá-las.
   */
  const linhas = colunasDaGrade(cabines.data ?? [], daSemana);
  const carregando = atendimentos.isLoading || cabines.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to={`/loja/${lojaId}/agenda`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Agenda do dia
          </Link>
          <h1 className="text-3xl font-serif">Semana</h1>
          <p className="text-sm text-muted-foreground">
            {format(segunda, "dd 'de' MMMM", { locale: ptBR })} a{" "}
            {format(addDays(segunda, 6), "dd 'de' MMMM", { locale: ptBR })} — uma linha por cabine.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => navegar(addDays(segunda, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navegar(null)}>
            Esta semana
          </Button>
          <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => navegar(addDays(segunda, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {atendimentos.isError || cabines.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não deu para carregar a semana</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar a agenda.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                atendimentos.refetch();
                cabines.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma cabine ativa — configure as cabines para ver a grade.
        </p>
      ) : (
        // E19/E99 — o `<Table>` traz o próprio `div.overflow-auto`, então o
        // `overflow-x-auto` do Card sai: scroll dentro de scroll não rola. E o
        // `min-w` fica no `<Table>` (que cai no `<table>`), NÃO no wrapper —
        // no wrapper a rolagem nunca dispararia.
        <Card>
          <Table className="min-w-[56rem] text-sm">
            <TableHeader>
              <TableRow className="text-left hover:bg-transparent">
                <TableHead className="w-28 py-2 pl-4 pr-2 text-xs font-normal text-muted-foreground">
                  Cabine
                </TableHead>
                {dias.map((dia, i) => {
                  const ehHoje = diasYMD[i] === hojeYMD;
                  return (
                    <TableHead key={diasYMD[i]} className="px-2 py-2 text-xs font-normal">
                      <span className={ehHoje ? "font-semibold text-primary" : "text-muted-foreground"}>
                        {format(dia, "EEE dd/MM", { locale: ptBR })}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((cabine) => (
                <TableRow key={cabine.id} className="border-b align-top last:border-0">
                  <TableCell className="py-2 pl-4 pr-2 font-medium">
                    {cabine.nome}
                    {cabine.inativa && (
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        desativada — a agenda dela continua aqui
                      </span>
                    )}
                  </TableCell>
                  {diasYMD.map((diaYMD) => {
                    const celula = porCabineEDia.get(`${cabine.id}:${diaYMD}`) ?? [];
                    return (
                      <TableCell key={diaYMD} className={`px-2 py-2 ${diaYMD === hojeYMD ? "bg-primary/5" : ""}`}>
                        {celula.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {celula.map((a) => {
                              const encerrado = a.situacao === "CONCLUIDO" || a.situacao === "FALTOU";
                              return (
                                <li
                                  key={a.id}
                                  className={`rounded-md border px-2 py-1 ${encerrado ? "opacity-50" : ""} ${a.tipo === "PROVA" ? "border-primary/40" : ""}`}
                                >
                                  <span className="tabular-nums text-xs text-muted-foreground">
                                    {instanteHora(a.inicio)}
                                  </span>{" "}
                                  <Link
                                    to={`/loja/${lojaId}/noivas/${a.leadId}`}
                                    className="hover:underline"
                                  >
                                    {a.lead?.noivaNome ?? "Noiva"}
                                  </Link>
                                  <span className="block text-xs text-muted-foreground">
                                    {a.tipo === "PROVA" ? "Prova" : "Atendimento"}
                                    {a.situacao === "FALTOU" && " · faltou"}
                                  </span>
                                  {/* S-O5: a semana é onde a loja se organiza
                                      com antecedência — é o melhor lugar para
                                      descobrir, e não na véspera. */}
                                  <SeloProvaOrfa atendimento={a} compacto />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
