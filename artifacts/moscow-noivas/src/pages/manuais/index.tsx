import { useListManuais } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carregando, Erro } from "@/components/estado";
import { BookOpen, Download } from "lucide-react";
import { instanteDia } from "@/lib/formatos";

/**
 * E236 — os manuais de uso, para baixar dentro do sistema.
 *
 * Até aqui os cinco manuais eram publicados como página fora do sistema, e o
 * PDF com prints só existia no disco de quem rodou o script de capturas —
 * ninguém dentro da loja tinha onde baixá-los. Esta página lista o catálogo
 * (`GET /manuais`) e cada botão baixa o PDF versionado (`GET /manuais/:qual.pdf`).
 *
 * É de qualquer pessoa com sessão: a vendedora baixa o dela e o guia da noiva;
 * a dona, os cinco. O link do rodapé do menu traz até aqui.
 */
const MB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export default function Manuais() {
  const manuais = useListManuais();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Manuais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O passo a passo de cada perfil, com as telas do sistema em prints anotados. Baixe o seu — e o
          da noiva, para saber o que ela vê.
        </p>
      </div>

      {manuais.isError && (
        <Erro titulo="Não deu para listar os manuais" erro={manuais.error} onTentarNovamente={() => void manuais.refetch()} />
      )}
      {manuais.isLoading && <Carregando forma="cards" linhas={3} />}

      {manuais.data && (
        <div className="grid gap-4 sm:grid-cols-2">
          {manuais.data.map((m) => (
            <Card key={m.qual} data-testid={`manual-${m.qual}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-4 w-4 text-primary" />
                  {m.titulo}
                </CardTitle>
                <CardDescription>Para {m.paraQuem}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{m.descricao}</p>
                {m.disponivel ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      PDF · {m.bytes != null ? MB(m.bytes) : ""}
                      {m.atualizadoEm ? ` · atualizado em ${instanteDia(m.atualizadoEm)}` : ""}
                    </span>
                    <Button asChild size="sm" className="gap-2">
                      <a href={`/api/manuais/${m.qual}.pdf`} download={`manual-${m.qual}.pdf`} data-testid={`baixar-manual-${m.qual}`}>
                        <Download className="h-4 w-4" />
                        Baixar PDF
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-aviso">
                    Este PDF não está no servidor desta instalação — peça a quem cuida do sistema para republicar
                    os manuais.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
