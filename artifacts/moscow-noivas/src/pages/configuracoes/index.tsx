import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useListAtributos, useListCabines, useGetDisponibilidade, useListLojas, useListUsuarios, getListAtributosQueryKey, getListCabinesQueryKey, getGetDisponibilidadeQueryKey, getListLojasQueryKey, getListUsuariosQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { varianteAtivo } from "@/lib/status-badge";
import { Building2, Settings2, Users } from "lucide-react";
import { tipoAtributoLabel } from "@/lib/formatos";
import { Erro } from "@/components/estado";
import { podeNoModulo, resumoAcessos } from "@/lib/permissoes";
import { CaptacaoExterna } from "./captacao";
import { DadosDaLoja } from "./dados-da-loja";
import { PrivacidadeLgpd } from "./privacidade";
import { BackupSistema } from "./backup";
import { TourAcessoDialog } from "@/components/tour-acesso";
import { Button } from "@/components/ui/button";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { diasDeProva, temJanelaDeProva } from "@/lib/janela-de-prova";

/**
 * F40/E98 — "Configurações" era a única tela do sistema que não configura nada.
 *
 * Ela mostra o que está valendo — atributos, regras, cabines — e não dizia onde
 * mudar. Quem via "Duração Prova: 60 min" e queria 90 tinha de saber, de cabeça,
 * que isso mora em "Cabines & horário", dentro de Atendimentos.
 *
 * O `aria-label` diz O QUE se edita: três links "Editar" na mesma tela são
 * indistinguíveis para quem navega por leitor de tela.
 */
function EditarEm({ to, o }: { to: string; o: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="shrink-0">
      <Link to={to} aria-label={`Editar ${o}`}>
        Editar <span aria-hidden="true">→</span>
      </Link>
    </Button>
  );
}

export default function Configuracoes() {
  const { lojaId } = useParams();
  const { activeLojaId, user, acessosModulos } = useAuth();
  // E130/A3: a visão da tela (aba sublinhada) — era a única pílula de ui/tabs.
  const [aba, setAba] = useState<"loja" | "admin">("loja");
  // O endpoint do token é gateado por admin no backend — mesma régua aqui.
  const podeCaptacao = podeNoModulo(acessosModulos, "admin", "ver");
  // S17: o card de dados da loja SALVA, então o gate é o da escrita.
  const podeEditarLoja = podeNoModulo(acessosModulos, "admin", "editar");
  // Tour do acesso (E24): reabrível a qualquer momento.
  const [tourAberto, setTourAberto] = useState(false);
  
  // Loja specific queries
  const atributosQ = useListAtributos(activeLojaId!, { query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const cabinesQ = useListCabines(activeLojaId!, { query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const disponibilidadeQ = useGetDisponibilidade(activeLojaId!, { query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: atributos } = atributosQ;
  const { data: cabines } = cabinesQ;
  const { data: disponibilidade } = disponibilidadeQ;

  // Admin/Superadmin queries
  const lojasQ = useListLojas({ query: { queryKey: getListLojasQueryKey(), enabled: !!user?.isSuperAdmin } });
  const usuariosQ = useListUsuarios({ query: { queryKey: getListUsuariosQueryKey(), enabled: !!user?.isSuperAdmin } });
  const { data: lojas } = lojasQ;
  const { data: usuarios } = usuariosQ;

  // Erro por aba: qualquer query da aba que falha deixa a tela em branco, então
  // uma saída única no topo com "Tentar novamente" para todas as da aba.
  const erroLoja = atributosQ.isError || cabinesQ.isError || disponibilidadeQ.isError;
  const errLoja = atributosQ.error ?? cabinesQ.error ?? disponibilidadeQ.error;
  const recarregarLoja = () => {
    atributosQ.refetch();
    cabinesQ.refetch();
    disponibilidadeQ.refetch();
  };
  const erroAdmin = lojasQ.isError || usuariosQ.isError;
  const errAdmin = lojasQ.error ?? usuariosQ.error;
  const recarregarAdmin = () => {
    lojasQ.refetch();
    usuariosQ.refetch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">O que está valendo na loja — e onde se muda.</p>
      </div>

      {/* E130/A3: as duas línguas de navegação, decididas — ALTERNAR A VISÃO
          desta tela é a aba sublinhada (o desenho de Atendimentos, o gesto
          mais usado do app); IR A OUTRA TELA do domínio é o link-seta (o do
          Financeiro). Esta era a única pílula de `ui/tabs` do app — a terceira
          cara para o mesmo gesto. */}
      <div className="flex gap-1 border-b" role="tablist" aria-label="Configurações">
        {(
          [
            { chave: "loja" as const, rotulo: "Loja atual", Icone: Settings2 },
            ...(user?.isSuperAdmin
              ? [{ chave: "admin" as const, rotulo: "Administração", Icone: Building2 }]
              : []),
          ]
        ).map(({ chave, rotulo, Icone }) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            // S-D18: o mesmo piso de 44px da aba de /atendimentos — a caixa
            // natural é de 38px, e no desktop o `md:min-h-9` (36px) não morde.
            className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors md:min-h-9 ${
              aba === chave
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === "loja" && (
        <div className="space-y-6">
          {erroLoja && (
            <Erro
              titulo="Não deu para carregar as configurações da loja"
              erro={errLoja}
              onTentarNovamente={recarregarLoja}
            />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Seu acesso (E24): o resumo do perfil + tour reabrível. */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Seu acesso</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {user?.isSuperAdmin
                    ? "Superadmin — acesso total."
                    : `Seu perfil libera: ${resumoAcessos(acessosModulos)}.`}{" "}
                  Precisa de algo a mais? Peça ao admin da loja.
                </p>
                <Button variant="outline" size="sm" onClick={() => setTourAberto(true)}>
                  Rever o tour
                </Button>
                <TourAcessoDialog open={tourAberto} onOpenChange={setTourAberto} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Atributos de vestido</CardTitle>
                <EditarEm to={`/loja/${lojaId}/catalogo`} o="os atributos de vestido" />
              </CardHeader>
              <CardContent>
                {atributos?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum atributo configurado.</p>
                ) : (
                  <ul className="space-y-3">
                    {atributos?.map(attr => (
                      <li key={attr.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium">{attr.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2">({tipoAtributoLabel(attr.tipo)})</span>
                        </div>
                        <Badge variant={attr.ativo ? "default" : "secondary"}>{attr.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Disponibilidade e regras</CardTitle>
                <EditarEm to={`/loja/${lojaId}/atendimentos/config`} o="as regras de disponibilidade" />
              </CardHeader>
              <CardContent className="space-y-4">
                {disponibilidade ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provas (dias antes)</span>
                      <span className="font-medium">{disponibilidade.provaDiasAntes} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração da prova</span>
                      {/* E148: `provaDuracao` é contado em SLOTS de 30 min, não em
                          minutos — `agenda.ts:93` faz `provaDuracao * 30 * 60_000`, e o
                          E2E 26 registra "o seed usa 2 = 1h". A tela mostrava o número
                          cru: "2 min" para uma prova de uma hora, na única tela que
                          existe para explicar a régua. */}
                      <span className="font-medium">{disponibilidade.provaDuracao * 30} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uso (dias antes)</span>
                      <span className="font-medium">{disponibilidade.usoDiasAntes} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Devolução (dias depois)</span>
                      <span className="font-medium">{disponibilidade.usoDiasDepois} dias</span>
                    </div>
                    {/* S-A23: os dois números acima não são independentes — a
                        janela de prova é a diferença entre eles, e ela some
                        inteira quando "provas" não passa de "uso". Some em
                        SILÊNCIO, que era o defeito: a reserva nascia sem
                        período de prova e ninguém era avisado. A dona decidiu
                        que a configuração não se recusa; o que ela faz agora é
                        aparecer. */}
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">Período de prova</span>
                      {temJanelaDeProva(disponibilidade) ? (
                        <span className="font-medium">
                          {diasDeProva(disponibilidade)} dia
                          {diasDeProva(disponibilidade) === 1 ? "" : "s"} por reserva
                        </span>
                      ) : (
                        <span className="font-medium text-aviso">
                          nenhum — as reservas nascem sem prova
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Regras de disponibilidade não configuradas.</p>
                )}
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Cabines</CardTitle>
                <EditarEm to={`/loja/${lojaId}/atendimentos/config`} o="as cabines" />
              </CardHeader>
              <CardContent>
                 {cabines?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma cabine configurada.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {cabines?.map(cabine => (
                      <div key={cabine.id} className="p-3 border rounded-md text-center">
                        <div className="font-medium">{cabine.nome}</div>
                        <Badge variant={cabine.ativo ? "default" : "secondary"} className="mt-2 text-[10px]">
                          {cabine.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* S17 — os dados da loja, que só existiam no console de
                superadmin. O gate é `admin.editar` e não `admin.ver`: o card é
                um formulário inteiro, e mostrá-lo a quem não pode salvar é
                oferecer um botão que a API vai recusar. */}
            {podeEditarLoja && <DadosDaLoja />}

            {/* Captação externa (E19) — só para quem gere a loja. */}
            {podeCaptacao && <CaptacaoExterna />}

            {/* Privacidade (E77) — anonimização das perdidas antigas. */}
            {podeCaptacao && <PrivacidadeLgpd />}
          </div>
        </div>
      )}

      {user?.isSuperAdmin && aba === "admin" && (
        <div className="space-y-6">
            {erroAdmin && (
              <Erro
                titulo="Não deu para carregar a administração"
                erro={errAdmin}
                onTentarNovamente={recarregarAdmin}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" /> Lojas do Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {lojas?.map(loja => (
                      <li key={loja.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium">{loja.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2 block">{loja.cnpj || 'Sem CNPJ'}</span>
                        </div>
                        {/* E130/A1: a mesma classe das 7 telas, vista de
                            passagem — a tabela semântica vale aqui também. */}
                        <Badge variant={varianteAtivo(loja.ativo ?? true)}>{loja.ativo ? 'Ativa' : 'Inativa'}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> Usuários Globais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {usuarios?.map(u => (
                      <li key={u.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium flex items-center gap-2">
                            {u.nome}
                            {u.isSuperAdmin && <Badge variant="default" className="text-[10px]">Admin</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                        <Badge variant={varianteAtivo(u.ativo ?? true)}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Status de backup do sistema (E30) — o dump é do banco inteiro. */}
              <BackupSistema />
            </div>
        </div>
      )}
    </div>
  );
}
