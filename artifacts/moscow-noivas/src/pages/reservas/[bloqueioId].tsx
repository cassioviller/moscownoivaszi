import { useMemo, useState } from "react";
import { ComboboxNoiva } from "@/components/combobox-noiva";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetBloqueio,
  getGetBloqueioQueryKey,
  getListBloqueiosQueryKey,
  useGetReserva,
  getGetReservaQueryKey,
  useUpdateBloqueio,
  useListAtendimentos,
  getListAtendimentosQueryKey,
  getListAjustesQueryKey,
  useCreateAjuste,
  useUpdateAjuste,
  useDeleteAjuste,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useRemoveChecklistItem,
  useListAvarias,
  getListAvariasQueryKey,
  useCreateAvaria,
  // S-C11 — corrigir o número digitado errado, sem apagar a foto-prova.
  useUpdateAvaria,
  useDeleteAvaria,
  useListContratos,
  getListContratosQueryKey,
  // E223 — a troca de peça do contrato (cláusula 17ª): o vínculo vem do GET
  // do contrato, a oferta do acervo, e a porta é a do servidor.
  useGetContrato,
  getGetContratoQueryKey,
  useListVestidos,
  getListVestidosQueryKey,
  useTrocarPecaDoContrato,
  useCobrarAvaria,
  // E212 — a conta do atraso na devolução (cláusula 16ª): a prévia que a tela
  // mostra antes do clique, e a porta que a cobra.
  usePreviaDaCobrancaDeAtraso,
  getPreviaDaCobrancaDeAtrasoQueryKey,
  useCobrarAtrasoDaDevolucao,
  type Ajuste,
  type Avaria,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ArrowLeft, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaMesAbrevAno, diaMesAnoLongo, diaParaISO } from "@/lib/formatos";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { contratoAtivoDaNoiva } from "@/lib/contrato-ativo-da-noiva";
import { invalidarCaixa } from "@/pages/financeiro/helpers";
import { diaDeNegocio } from "@/lib/financeiro/datas";
import { ROTULO_SITUACAO, dataHoraFmt } from "./helpers";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";
import { Erro } from "@/components/estado";
import {
  AVARIA_DESCRICAO_MAX_CHARS,
  AVARIA_JUSTIFICATIVA_MAX_CHARS,
  FOTO_ACIMA_DO_TETO,
  FOTO_MAX_BYTES,
} from "@/lib/limites";
import { donaDaFicha, pecaForaDaDataDaNoiva, temReservaMae } from "@/lib/dona-da-ficha-da-reserva";
// E214: a faixa das cláusulas 14ª/15ª vem da MESMA conta do servidor.
import { faixaDaAvariaRegistrada, faixaNaTela } from "@/lib/faixa-da-avaria";
import {
  explicacaoDaFaixa,
  PRAZO_DA_COBRANCA_DE_REPARO_DIAS,
  // E219 — o veto da 17ª (prazo de 7 dias, sextas e sábados): a MESMA régua
  // que a porta aplica, importada — a tela avisa antes do clique (E211).
  vetoDaTroca17a,
  type TipoDeAvaria,
} from "@workspace/financeiro-core";

/**
 * Detalhe da reserva (porte da /reservas/[bloqueioId] do feat/orcamentos) — o
 * lar das provas e ajustes da noiva: a reserva (noiva + vestido + ocupação),
 * a movimentação do vestido (retirada/devolução) e, dentro de cada prova, os
 * ajustes de costura com checklist. A prova em si é agendada na Agenda — aqui
 * há leitura da prova + o atalho "Agendar prova".
 */
export default function ReservaDetalhe() {
  const { lojaId, bloqueioId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  /**
   * E212 — quem pode ver e cobrar o atraso da 16ª.
   *
   * É `contratos`, e não `vestidos` como o resto desta tela: a cobrança do
   * atraso lança parcela no carnê e o extravio vale **4× o aluguel** — R$
   * 12.000,00 num vestido de R$ 3.000,00 —, decidido sobre o contrato e sem
   * peça nenhuma para mostrar. A `s36-gate-da-tela-unit` cobra que a tela peça
   * o MESMO módulo que o servidor guarda, e o servidor guarda `contratos`.
   *
   * Sem `contratos` de leitura a prévia nem é pedida — a costureira não vê
   * dinheiro de contrato, que é a régua do E172.
   */
  const podeVerAtraso = podeNoModulo(acessosModulos, "contratos", "ver");
  const podeCobrarAtraso = podeNoModulo(acessosModulos, "contratos", "editar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // E79: a ficha pede UM bloqueio e as provas DELE — os recortes rodam no
  // banco; a tela parou de baixar a loja inteira para achar um id.
  const bloqueios = useGetBloqueio(activeLojaId!, bloqueioId!, {
    query: {
      queryKey: getGetBloqueioQueryKey(activeLojaId!, bloqueioId!),
      enabled: !!activeLojaId && !!bloqueioId,
    },
  });
  const paramsProvas = { bloqueioId: bloqueioId!, tipo: "PROVA" as const };
  const atendimentos = useListAtendimentos(activeLojaId!, paramsProvas, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, paramsProvas),
      enabled: !!activeLojaId && !!bloqueioId,
    },
  });

  const updateBloqueio = useUpdateBloqueio();
  const createAjuste = useCreateAjuste();
  const updateAjuste = useUpdateAjuste();
  const deleteAjuste = useDeleteAjuste();
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const removeItem = useRemoveChecklistItem();

  const reserva = bloqueios.data ?? null;

  /**
   * S-O54/E185 — a ficha pergunta à RESERVA-MÃE, pela porta que o E179 abriu.
   *
   * `useGetReserva` estava gerado e sem um único chamador: a ficha resolvia a
   * mãe pelo caminho do bloqueio, e o bloqueio só carrega a noiva PRÓPRIA. Num
   * véu pendurado numa reserva-mãe o título saía **"Noiva"**, a trilha para a
   * ficha dela sumia e o card *De quem é* afirmava que a peça **"ainda não tem
   * noiva"** — sobre uma peça cuja dona o servidor diz desde o E167.
   *
   * A consulta só sai quando existe mãe (`enabled`), e o `donoLeadId` já
   * responde o ID enquanto ela não volta: o que a mãe acrescenta é o NOME.
   */
  const reservaMaeId = reserva?.reservaId ?? "";
  const mae = useGetReserva(activeLojaId!, reservaMaeId, {
    query: {
      queryKey: getGetReservaQueryKey(activeLojaId!, reservaMaeId),
      enabled: !!activeLojaId && temReservaMae(reserva),
    },
  });
  const dona = donaDaFicha(reserva, mae.data);
  /**
   * E240/S-O98 — a peça ficou num dia e a noiva casa em outro. A ficha da
   * NOIVA já avisa e oferece o gesto de mover (S-O74/E189); esta era a única
   * das cinco telas que leem o casamento da reserva sem saber. A régua é pura
   * e compara o DIA (`lib/dona-da-ficha-da-reserva.ts`); o gesto continua
   * morando na ficha dela, porque mover é sobre TODAS as reservas da noiva.
   */
  const foraDaDataDaNoiva = pecaForaDaDataDaNoiva(reserva, mae.data);

  // E71: as avarias deste bloqueio + o contrato ATIVO da noiva (para o custo
  // do reparo poder virar parcela cobrável).
  const avarias = useListAvarias(activeLojaId!, bloqueioId!, {
    query: {
      queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
      enabled: !!activeLojaId && !!bloqueioId,
    },
  });
  /**
   * V14/E167 — a ficha pergunta pelo DONO do bloqueio, não pelo `leadId` dele.
   *
   * `bloqueio_vestidos.lead_id` é NULLABLE e `reservas.lead_id` é NOT NULL: o
   * bloqueio pendurado numa reserva-mãe tem dona sem ter noiva própria. O
   * servidor já cobrava por esse dono desde o V3/E163 e a tela desistia no
   * nulo — com `enabled: !!reserva?.leadId`, a consulta do contrato nem saía.
   * Medido na letra da própria rota em 2026-07: **61 das 63 avarias do banco
   * viviam em bloqueio sem noiva**, então em 97% delas a rota cobraria e a
   * única tela que expõe a cobrança não desenhava o botão. O reparo nunca
   * virava parcela.
   *
   * **S-C10 (13/08/2026) — o 97% é história, e o defeito não era estatístico.**
   * Remedido: **ZERO avarias** nos dois bancos, e bloqueio sem `lead_id` é 0 de
   * 116 em `moscow_base` e 2 de 127 no dev. O botão continua tendo de ser
   * desenhado pelo DONO derivado, porque a rota cobra por ele: com uma única
   * avaria em bloqueio sem noiva, a tela voltaria a esconder a saída de um
   * reparo que o servidor aceita. Frequência zero não é impossibilidade.
   *
   * S-O54/E185 — a derivação virou `donaDaFicha`, que responde a MESMA
   * pergunta e ainda traz o nome pela reserva-mãe. O fallback de payload antigo
   * em cache (sem `donoLeadId`) mora lá dentro.
   */
  const donoDaReserva = dona.leadId;
  /**
   * S-O20 — a pergunta é "qual é o contrato ATIVO dela", e agora ela é feita
   * ao SERVIDOR. A tela pedia a carteira inteira de contratos da noiva **com
   * as parcelas de cada um** (`contratos.ts:158` desce `parcelas` sempre que o
   * recorte é por noiva) para peneirar um `status === "ATIVO"` na memória: a
   * noiva que trocou de vestido duas vezes tem três contratos, e vinham os
   * três carnês para achar um id.
   */
  const filtroDoContrato = { leadId: donoDaReserva ?? "", status: "ATIVO" as const };
  const contratosDaNoiva = useListContratos(activeLojaId!, filtroDoContrato, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!, filtroDoContrato),
      enabled: !!activeLojaId && !!donoDaReserva,
    },
  });
  const contratoAtivo = contratoAtivoDaNoiva(contratosDaNoiva.data?.itens);
  /**
   * E223 — esta peça está PRESA pelo contrato ativo? A lista não carrega os
   * vínculos (só o GET único os traz, E72), então a ficha pergunta pelo
   * contrato inteiro — e é a mesma leitura que a troca invalida depois.
   * Sob `contratos.ver`, como toda leitura de contrato desta tela.
   */
  const podeVerContrato = podeNoModulo(acessosModulos, "contratos", "ver");
  const podeTrocarPeca = podeNoModulo(acessosModulos, "contratos", "editar");
  const contratoDetalhe = useGetContrato(activeLojaId!, contratoAtivo?.id ?? "", {
    query: {
      queryKey: getGetContratoQueryKey(activeLojaId!, contratoAtivo?.id ?? ""),
      enabled: !!activeLojaId && !!contratoAtivo?.id && podeVerContrato,
    },
  });
  const presoPorEsteContrato =
    !!bloqueioId && (contratoDetalhe.data?.bloqueioVestidoIds ?? []).includes(bloqueioId);
  // E219 — o veto se calcula ANTES de oferecer o botão: numa sexta, ou num
  // contrato de mais de 7 dias, a seção mostra a frase da cláusula no lugar
  // do gesto que o servidor recusaria com o MESMO veto (é a mesma função).
  const vetoDaTroca = contratoDetalhe.data?.fechadoEm
    ? vetoDaTroca17a({ fechadoEm: contratoDetalhe.data.fechadoEm, hoje: new Date() })
    : null;
  const [trocandoPeca, setTrocandoPeca] = useState(false);
  const [pecaEscolhida, setPecaEscolhida] = useState<string | null>(null);
  // O acervo só desce quando o diálogo abre — a ficha não paga a lista à toa.
  const vestidos = useListVestidos(activeLojaId!, {
    query: { queryKey: getListVestidosQueryKey(activeLojaId!), enabled: !!activeLojaId && trocandoPeca },
  });
  const trocarPecaDoContrato = useTrocarPecaDoContrato();
  const createAvaria = useCreateAvaria();
  const updateAvaria = useUpdateAvaria();
  const deleteAvaria = useDeleteAvaria();
  const cobrarAvaria = useCobrarAvaria();

  const [avariaDescricao, setAvariaDescricao] = useState("");
  const [avariaCusto, setAvariaCusto] = useState("");
  // E214: de qual cláusula a taxa sai. DANO é o padrão, o mesmo da coluna.
  const [avariaTipo, setAvariaTipo] = useState<TipoDeAvaria>("DANO");
  // E232/S-C1 — o default é o ciclo de sempre: a avaria da devolução.
  const [avariaConstatadaEm, setAvariaConstatadaEm] = useState<"ENTREGA" | "DEVOLUCAO">("DEVOLUCAO");
  // E232/S-C98 — a avaria cuja cobrança está sendo montada, e o prazo dela.
  const [avariaCobrar, setAvariaCobrar] = useState<{ id: string } | null>(null);
  const [prazoCobranca, setPrazoCobranca] = useState(String(PRAZO_DA_COBRANCA_DE_REPARO_DIAS));
  // E244 (C5): a porta do atraso aceita `prazoDias` desde o E212 e a tela
  // mandava `{}` — o vencimento caía sempre nos dias do servidor, sem ninguém
  // escolher (o formato da S-C98, fechado para a avaria no E232 e não para o
  // atraso). Abre com a MESMA constante que a porta pratica.
  const [prazoAtraso, setPrazoAtraso] = useState(String(PRAZO_DA_COBRANCA_DE_REPARO_DIAS));
  const [avariaJustificativa, setAvariaJustificativa] = useState("");
  const [avariaFotoBase64, setAvariaFotoBase64] = useState<string | null>(null);
  const [avariaFotoNome, setAvariaFotoNome] = useState<string | null>(null);
  // F25: o passo "o vestido voltou como saiu?", disparado pela devolução.
  const [conferirDevolucao, setConferirDevolucao] = useState(false);

  /**
   * **E214 — a faixa aparece ANTES do clique** (cláusulas 14ª e 15ª).
   *
   * O contrato dá faixa à taxa de limpeza (R$ 350,00 a R$ 2.500,00) e teto ao
   * dano (5× o aluguel daquela peça), e o campo era livre: a vendedora digitava
   * R$ 50,00 ou R$ 9.000,00 e descobria a régua só no 422, depois de ter
   * escrito a descrição e anexado a foto.
   *
   * A conta é a MESMA do servidor — `faixaNaTela` só escolhe qual aluguel
   * perguntar. Duas grafias divergiriam no dia em que a dona mudasse o número.
   */
  const veredictoDaAvaria = faixaNaTela({
    contratos: contratosDaNoiva.data?.itens,
    vestidoId: reserva?.vestidoId,
    tipo: avariaTipo,
    valor: parseValor(avariaCusto),
  });

  /**
   * **S-C11 — a correção da avaria, e por que ela é um DIÁLOGO.**
   *
   * O gesto que faltava é o do zero a mais: R$ 1.500,00 onde eram R$ 150,00. O
   * único caminho era o `X` de remover — que o servidor recusa quando a avaria
   * sustenta cobrança viva, e que leva a **foto-prova** junto quando aceita.
   *
   * Diálogo, e não edição em linha, porque os quatro campos andam juntos: o
   * `tipo` TROCA a régua do valor (a 14ª tem faixa absoluta, a 15ª tem teto de
   * 5× o aluguel), e a justificativa só existe em função das duas. Editar o
   * custo sem ver a faixa ao lado é o defeito que o E214 fechou no cadastro.
   */
  const [avariaEmEdicao, setAvariaEmEdicao] = useState<Avaria | null>(null);
  const [edicaoDescricao, setEdicaoDescricao] = useState("");
  const [edicaoCusto, setEdicaoCusto] = useState("");
  const [edicaoTipo, setEdicaoTipo] = useState<TipoDeAvaria>("DANO");
  const [edicaoJustificativa, setEdicaoJustificativa] = useState("");

  /**
   * A MESMA conta do cadastro, sobre os valores em edição — e o MESMO aluguel
   * do servidor, porque agora ele vem no payload (S-C47).
   *
   * A nota de honestidade que morava aqui virou conserto. Ela dizia: *"havendo
   * cobrança viva o servidor confere contra o contrato que COBRA, e a tela
   * pergunta ao ATIVO da noiva; na esmagadora maioria é o mesmo"*. Era verdade,
   * e "na esmagadora maioria" é exatamente a forma de defeito que o E187 achou
   * (cinco grafias da mesma conta, três acertando por cópia). A tela existe para
   * não OFERECER o que a porta vai negar — e para isso ela tem de ler o número
   * da porta, não um parecido.
   */
  const veredictoDaEdicao = faixaDaAvariaRegistrada({
    avaria: avariaEmEdicao,
    tipo: edicaoTipo,
    valor: parseValor(edicaoCusto),
  });

  /**
   * Dinheiro que ENTROU congela a linha (409 `AVARIA_COM_RECEBIMENTO`). A tela
   * lê o mesmo estado pelo `parcelaStatus` que o payload já carrega desde o
   * V2/E167, e **diz o caminho em vez de esconder o botão**: quem abre o
   * diálogo aprende que o gesto é estornar a parcela antes.
   */
  const edicaoTemRecebimento =
    avariaEmEdicao?.parcelaStatus === "PAGA" || avariaEmEdicao?.parcelaStatus === "PARCIAL";

  const abrirEdicaoDaAvaria = (a: Avaria) => {
    setAvariaEmEdicao(a);
    setEdicaoDescricao(a.descricao);
    setEdicaoCusto(a.custoReparo != null ? String(a.custoReparo).replace(".", ",") : "");
    setEdicaoTipo(a.tipo as TipoDeAvaria);
    setEdicaoJustificativa(a.justificativaDaTaxa ?? "");
  };

  const salvarEdicaoDaAvaria = () => {
    const alvo = avariaEmEdicao;
    if (!alvo) return;
    // A mesma leitura pt-BR do cadastro (C3): `Number("1.500")` é 1,5, e a
    // correção de R$ 1.500,00 viraria R$ 1,50 — o defeito que este épico existe
    // para consertar, cometido pelo próprio conserto.
    const custo = parseValor(edicaoCusto);
    if (custo !== null && !Number.isFinite(custo)) {
      toast({
        title: "Custo do reparo inválido",
        description: "Informe um valor em reais (ex.: 150,00).",
        variant: "destructive",
      });
      return;
    }
    return comToast(
      async () => {
        await updateAvaria.mutateAsync({
          lojaId: activeLojaId!,
          avariaId: alvo.id,
          data: {
            descricao: edicaoDescricao.trim(),
            tipo: edicaoTipo,
            custoReparo: custo,
            justificativaDaTaxa:
              veredictoDaEdicao.exigeJustificativa && edicaoJustificativa.trim()
                ? edicaoJustificativa.trim()
                : null,
          },
        });
        await queryClient.invalidateQueries({
          queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
        });
        // O carnê pode ter seguido o valor: a parcela do reparo vive no contrato
        // e no caixa, e a ficha ao lado leria o número velho.
        await queryClient.invalidateQueries({
          queryKey: getListContratosQueryKey(activeLojaId!, filtroDoContrato),
        });
        await invalidarCaixa(queryClient, activeLojaId!);
        setAvariaEmEdicao(null);
      },
      "Avaria corrigida",
      "Não deu para corrigir a avaria",
    );
  };

  const aoEscolherFotoAvaria = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    // S-O19: o teto vem de `lib/limites` — era o terceiro lugar onde ele
    // estava escrito à mão, e os três eram iguais por coincidência.
    if (arquivo.size > FOTO_MAX_BYTES) {
      toast({ title: FOTO_ACIMA_DO_TETO, description: "Escolha uma imagem menor.", variant: "destructive" });
      return;
    }
    const buf = await arquivo.arrayBuffer();
    let binario = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setAvariaFotoBase64(btoa(binario));
    setAvariaFotoNome(arquivo.name);
  };

  const registrarAvaria = () => {
    // O MESMO defeito C3 que o orçamento já corrigiu, de novo aqui:
    // `Number("1.500")` é 1,5, e a avaria de R$ 1.500,00 era gravada valendo
    // R$ 1,50 — a parcela de cobrança da noiva saía com R$ 1,50 e o prejuízo
    // de R$ 1.498,50 não aparecia em lugar nenhum. Escrito "1.500,00", o
    // `replace(",", ".")` produzia "1.500.00" → NaN, e o spread descartava o
    // campo em silêncio: avaria salva SEM custo, sem toast de erro. `parseValor`
    // lê pt-BR e separa "não digitou" (null) de "digitou bobagem" (NaN) — e a
    // bobagem passa a ser dita, não engolida.
    const custo = parseValor(avariaCusto);
    if (custo !== null && !Number.isFinite(custo)) {
      toast({
        title: "Custo do reparo inválido",
        description: "Informe um valor em reais (ex.: 1.500,00).",
        variant: "destructive",
      });
      return;
    }
    return comToast(
      async () => {
        await createAvaria.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: {
            descricao: avariaDescricao.trim(),
            tipo: avariaTipo,
            constatadaEm: avariaConstatadaEm,
            ...(custo !== null ? { custoReparo: custo } : {}),
            // E214: só vai quando explica alguma coisa — o servidor descarta a
            // razão colada numa taxa que cabe na faixa, e a tela não a manda.
            ...(veredictoDaAvaria.exigeJustificativa && avariaJustificativa.trim()
              ? { justificativaDaTaxa: avariaJustificativa.trim() }
              : {}),
            ...(avariaFotoBase64 ? { fotoBase64: avariaFotoBase64 } : {}),
          },
        });
        await queryClient.invalidateQueries({
          queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
        });
        setAvariaDescricao("");
        setAvariaCusto("");
        setAvariaTipo("DANO");
        setAvariaJustificativa("");
        setAvariaFotoBase64(null);
        setAvariaFotoNome(null);
      },
      "Avaria registrada",
      "Não deu para registrar a avaria",
    );
  };

  /**
   * F22/E97 — a cobrança do reparo saiu da tela e virou uma rota.
   *
   * Aqui se criava a parcela avulsa direto, sem guardar vínculo nenhum: o botão
   * não mudava de estado depois do clique, então clicar duas vezes — o que
   * acontece quando a rede demora e a pessoa insiste — criava DUAS parcelas no
   * carnê da noiva. Agora `POST /avarias/:id/cobrar` grava parcela e vínculo na
   * mesma transação, e a segunda chamada responde 409.
   */
  /**
   * E232/S-C98 — a cobrança ganha o PRAZO: a porta aceitava `prazoDias` desde
   * o E214 e a tela nunca o oferecia — o vencimento caía sempre nos 7 dias do
   * servidor, sem ninguém escolher. O campo abre preenchido com a MESMA
   * constante que a porta pratica (`PRAZO_DA_COBRANCA_DE_REPARO_DIAS` — uma
   * grafia, E187).
   */
  const abrirCobranca = (avaria: { id: string }) => {
    setPrazoCobranca(String(PRAZO_DA_COBRANCA_DE_REPARO_DIAS));
    setAvariaCobrar(avaria);
  };

  const cobrarReparo = (avaria: { id: string }, prazoDias?: number) =>
    comToast(
      async () => {
        if (!contratoAtivo) return;
        await cobrarAvaria.mutateAsync({
          lojaId: activeLojaId!,
          avariaId: avaria.id,
          data: {
            contratoId: contratoAtivo.id,
            ...(prazoDias !== undefined ? { prazoDias } : {}),
          },
        });
        // Cobrar o reparo CRIA parcela no carnê da noiva: é movimento de
        // caixa, e por isso passa pela régua do D9/E93 e não só pela lista de
        // avarias desta tela. Sem isto, o fluxo, o DRE e o alerta do sino
        // seguiam sem a cobrança que a loja acabou de lançar.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
          }),
          invalidarCaixa(queryClient, activeLojaId!),
        ]);
      },
      "Cobrança criada — entrou como parcela do contrato",
      "Não deu para criar a cobrança",
    );

  /**
   * **E212 — a conta do atraso, e ela aparece ANTES do clique** (cláusula 16ª).
   *
   * A prévia é a MESMA conta que o POST cobra, calculada pelo servidor e
   * devolvida sem escrever nada. Existe pela razão que o E211 mediu do lado da
   * troca de data: quem recebe a peça de volta precisa saber que ela custa
   * R$ 1.750,00 de atraso **antes** de dizer à noiva que está tudo certo.
   *
   * A conta não é refeita aqui. Duas grafias da mesma régua divergiriam no dia
   * em que a dona mudasse um número, e a vendedora leria na tela um valor que a
   * porta não pratica — é a lição do E214 sobre `explicacaoDaFaixa`.
   */
  const atraso = usePreviaDaCobrancaDeAtraso(activeLojaId!, contratoAtivo?.id ?? "", {
    query: {
      queryKey: getPreviaDaCobrancaDeAtrasoQueryKey(activeLojaId!, contratoAtivo?.id ?? ""),
      enabled: !!activeLojaId && !!contratoAtivo?.id && podeVerAtraso,
    },
  });
  const cobrarAtraso = useCobrarAtrasoDaDevolucao();
  const cobrarAtrasoDaDevolucaoDoContrato = () =>
    comToast(
      async () => {
        if (!contratoAtivo) return;
        await cobrarAtraso.mutateAsync({
          lojaId: activeLojaId!,
          contratoId: contratoAtivo.id,
          data: { prazoDias: Number(prazoAtraso) },
        });
        // Mesma régua do reparo: cobrar o atraso CRIA parcela no carnê, então
        // é movimento de caixa e passa pela invalidação do D9/E93 — não só
        // pela prévia desta tela.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getPreviaDaCobrancaDeAtrasoQueryKey(activeLojaId!, contratoAtivo.id),
          }),
          invalidarCaixa(queryClient, activeLojaId!),
        ]);
      },
      "Atraso cobrado — entrou como parcela do contrato",
      "Não deu para cobrar o atraso",
    );
  // S-O16/S-O65: a ausência entra na PERGUNTA, não numa asserção `!` lá
  // embaixo — a asserção sobrevive a quem mexer na guarda de cima.
  const pecasSemAluguel = atraso.data?.semAluguel ?? [];
  const provas = useMemo(
    () =>
      // O recorte (bloqueio + PROVA) já veio do servidor; sobra ordenar.
      [...(atendimentos.data ?? [])].sort(
        (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      ),
    [atendimentos.data],
  );
  const podeMovimentar = podeNoModulo(acessosModulos, "vestidos", "editar");
  // S-M21 (fecha dois sítios da S-M9): o registro de avaria herdava o gate do
  // vizinho (vestidos.editar) mas o POST deriva CRIAR — quem devolvia o
  // vestido, via a barra rasgada e anexava a foto levava 403 depois do
  // trabalho. E os ajustes eram o descasamento mais largo dos nove: a tela
  // liberava ESCRITA por agenda.VER — todo perfil que enxerga a agenda via
  // formulário de costura e checkbox, e cada gesto oferecido era um 403.
  const podeRegistrarAvaria = podeNoModulo(acessosModulos, "vestidos", "criar");
  const podeCriarAjuste = podeNoModulo(acessosModulos, "agenda", "criar");
  const podeEditarAjuste = podeNoModulo(acessosModulos, "agenda", "editar");

  // Formularios locais: data da retirada/devolução, novo ajuste por prova,
  // novo item de checklist por ajuste, ajuste aguardando confirmação de remoção.
  const casamentoYmd = reserva?.casamentoData ? diaDeNegocio(reserva.casamentoData) : "";
  const [dataMovimentacao, setDataMovimentacao] = useState<string | null>(null);
  const [novoAjuste, setNovoAjuste] = useState<Record<string, string>>({});
  // E155: por atendimento, porque cada prova tem seu formulário na tela.
  const [novoAjusteTipo, setNovoAjusteTipo] = useState<Record<string, "AJUSTE" | "CONFECCAO">>({});
  const [novoAjusteCusto, setNovoAjusteCusto] = useState<Record<string, string>>({});
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});
  const [ajusteParaRemover, setAjusteParaRemover] = useState<Ajuste | null>(null);

  const dataMovimentacaoAtual = dataMovimentacao ?? casamentoYmd;

  const invalidarAjustes = () =>
    Promise.all([
      // Ajustes aninham em atendimentos → invalida as duas listas.
      queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
      queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    ]);

  // E110: era `err.message`, que é o texto do CLIENTE gerado, não o do servidor
  // — o `detalhe` que a API manda morria aqui. É a tese do E96 ("o erro do
  // servidor chega a quem está na tela") que esta tela nunca recebeu, e ficou
  // visível ao escrever o `AVARIA_DE_OUTRA_NOIVA`: a guarda nova recusaria a
  // cobrança e a vendedora leria uma frase genérica, sem saber que o contrato
  // escolhido é de outra noiva. Vale para as seis ações deste arquivo.
  const comToast = async (fn: () => Promise<unknown>, titulo: string, tituloErro: string) => {
    try {
      await fn();
      toast({ title: titulo });
    } catch (err) {
      toast({
        title: tituloErro,
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  /**
   * S-O11 — **trocar a noiva da reserva**, que era a metade do A02.4 que não
   * entrou.
   *
   * A adoção do E162 só alcança a reserva SEM dona. Quem escolheu a noiva
   * errada no combobox ficava com a peça presa no nome de outra, e o único
   * caminho era apagar a reserva — que o E115 recusa quando ela carrega prova,
   * avaria ou contrato ativo. O servidor recusa a troca com contrato ATIVO
   * preso (o nome dela já está no papel assinado), e a frase do 409 diz o
   * caminho; aqui a tela só a repete.
   */
  const [trocandoNoiva, setTrocandoNoiva] = useState(false);
  const [noivaEscolhida, setNoivaEscolhida] = useState<string | null>(null);
  const trocarNoiva = () =>
    comToast(
      async () => {
        await updateBloqueio.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: { leadId: noivaEscolhida },
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetBloqueioQueryKey(activeLojaId!, bloqueioId!) }),
          queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) }),
        ]);
        setTrocandoNoiva(false);
        setNoivaEscolhida(null);
      },
      "Reserva passou para a outra noiva",
      "Não deu para trocar a noiva desta reserva",
    );

  /**
   * E223 — trocar a peça do contrato (cláusula 17ª). O servidor faz as quatro
   * coisas numa transação: liberta esta reserva, prende a nova pela régua do
   * fecho, refaz o snapshot do item e grava a trilha. A ficha só navega para a
   * reserva nova — esta vira registro morto (cancelada) no ato.
   */
  const confirmarTrocaDePeca = async () => {
    if (!contratoAtivo || !pecaEscolhida || !bloqueioId) return;
    try {
      const r = await trocarPecaDoContrato.mutateAsync({
        lojaId: activeLojaId!,
        contratoId: contratoAtivo.id,
        data: { bloqueioId, vestidoNovoId: pecaEscolhida },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetBloqueioQueryKey(activeLojaId!, bloqueioId) }),
        queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getGetContratoQueryKey(activeLojaId!, contratoAtivo.id) }),
        queryClient.invalidateQueries({ queryKey: getListContratosQueryKey(activeLojaId!, filtroDoContrato) }),
      ]);
      toast({ title: "Peça trocada — a reserva nova responde pelo contrato" });
      navigate(`/loja/${lojaId}/reservas/${r.bloqueioNovoId}`);
    } catch (err) {
      toast({
        title: "Não deu para trocar a peça",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const registrarMovimentacao = (campo: "retiradaDataReal" | "devolucaoDataReal" | "lavagemConcluidaEm") =>
    comToast(
      async () => {
        await updateBloqueio.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: { [campo]: diaParaISO(dataMovimentacaoAtual) },
        });
        // A ficha lê o GET único (E79); a lista segue invalidada pelas irmãs.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetBloqueioQueryKey(activeLojaId!, bloqueioId!) }),
          queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) }),
        ]);
        setDataMovimentacao(null);
        // F25/E97: o gatilho da conferência. O E71 inteiro — avaria, foto,
        // custo, cobrança — dependia de alguém LEMBRAR de rolar a página e
        // preencher um formulário depois de registrar a devolução. O momento em
        // que a peça está na mão é o único em que dá para olhar; passado ele, o
        // vestido já voltou para a arara e a conferência não acontece mais.
        if (campo === "devolucaoDataReal") setConferirDevolucao(true);
      },
      "Movimentação registrada",
      "Não deu para registrar a movimentação",
    );

  // E61: a data registrada errada tem conserto — null explícito desfaz, e a
  // disponibilidade do vestido volta a valer a régua anterior.
  const desfazerMovimentacao = (campo: "retiradaDataReal" | "devolucaoDataReal" | "lavagemConcluidaEm") =>
    comToast(
      async () => {
        await updateBloqueio.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: { [campo]: null },
        });
        // A ficha lê o GET único (E79); a lista segue invalidada pelas irmãs.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetBloqueioQueryKey(activeLojaId!, bloqueioId!) }),
          queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) }),
        ]);
      },
      "Movimentação desfeita",
      "Não deu para desfazer a movimentação",
    );

  const alternarAjuste = (ajuste: Ajuste) =>
    comToast(
      async () => {
        await updateAjuste.mutateAsync({
          lojaId: activeLojaId!,
          ajusteId: ajuste.id,
          data: { status: ajuste.status === "FEITO" ? "PENDENTE" : "FEITO" },
        });
        await invalidarAjustes();
      },
      "Ajuste atualizado",
      "Não deu para atualizar o ajuste",
    );

  const removerAjusteConfirmado = () => {
    const ajuste = ajusteParaRemover;
    setAjusteParaRemover(null);
    if (!ajuste) return;
    return comToast(
      async () => {
        await deleteAjuste.mutateAsync({ lojaId: activeLojaId!, ajusteId: ajuste.id });
        await invalidarAjustes();
      },
      "Ajuste removido",
      "Não deu para remover o ajuste",
    );
  };

  /**
   * E155 — a fila da costureira guarda as duas naturezas de trabalho de agulha,
   * e quem registra escolhe qual: AJUSTE altera peça existente, CONFECÇÃO é
   * peça nova feita para a noiva (a manga do caderno de 10–16/08). O prazo, o
   * status e o checklist são os mesmos — por isso é a mesma fila.
   */
  const adicionarAjuste = (atendimentoId: string) => {
    const descricao = (novoAjuste[atendimentoId] ?? "").trim();
    if (!descricao) {
      toast({ title: "Descreva o trabalho.", variant: "destructive" });
      return;
    }
    const tipo = novoAjusteTipo[atendimentoId] ?? "AJUSTE";
    // Custo é da CONFECÇÃO (material e mão de obra) e opcional mesmo nela — no
    // dia da conversa quase nunca se sabe quanto vai custar.
    const custoDigitado = (novoAjusteCusto[atendimentoId] ?? "").trim();
    const custo = custoDigitado ? parseValor(custoDigitado) : null;
    if (custoDigitado && (custo === null || !Number.isFinite(custo) || custo < 0)) {
      toast({ title: "Custo inválido", variant: "destructive" });
      return;
    }
    return comToast(
      async () => {
        await createAjuste.mutateAsync({
          lojaId: activeLojaId!,
          data: {
            atendimentoId,
            descricao,
            tipo,
            ...(tipo === "CONFECCAO" && custo !== null ? { custo } : {}),
          },
        });
        await invalidarAjustes();
        setNovoAjuste((s) => ({ ...s, [atendimentoId]: "" }));
        setNovoAjusteCusto((s) => ({ ...s, [atendimentoId]: "" }));
      },
      tipo === "CONFECCAO" ? "Confecção adicionada" : "Ajuste adicionado",
      "Não deu para adicionar o trabalho",
    );
  };

  const adicionarItem = (ajuste: Ajuste) => {
    const descricao = (novoItem[ajuste.id] ?? "").trim();
    if (!descricao) {
      toast({ title: "Descreva o item do checklist.", variant: "destructive" });
      return;
    }
    const proximaOrdem = Math.max(0, ...(ajuste.checklist ?? []).map((c) => c.ordem)) + 1;
    return comToast(
      async () => {
        await addItem.mutateAsync({
          lojaId: activeLojaId!,
          ajusteId: ajuste.id,
          data: { descricao, ordem: proximaOrdem },
        });
        await invalidarAjustes();
        setNovoItem((s) => ({ ...s, [ajuste.id]: "" }));
      },
      "Checklist atualizado",
      "Não deu para adicionar o item",
    );
  };

  const alternarItem = (itemId: string, feito: boolean) =>
    comToast(
      async () => {
        await updateItem.mutateAsync({ lojaId: activeLojaId!, itemId, data: { feito } });
        await invalidarAjustes();
      },
      "Checklist atualizado",
      "Não deu para atualizar o item",
    );

  const removerItem = (itemId: string) =>
    comToast(
      async () => {
        await removeItem.mutateAsync({ lojaId: activeLojaId!, itemId });
        await invalidarAjustes();
      },
      "Checklist atualizado",
      "Não deu para remover o item",
    );

  if (bloqueios.isError) {
    return (
      <Erro titulo="Não deu para carregar a reserva" erro={bloqueios.error} onTentarNovamente={() => bloqueios.refetch()} />
    );
  }

  if (bloqueios.isLoading) {
    return <Card className="animate-pulse h-64" />;
  }

  if (!reserva) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reserva não encontrada</AlertTitle>
          <AlertDescription>Ela pode ter sido cancelada ou removida.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to={`/loja/${lojaId}/reservas`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar às reservas
          </Link>
        </Button>
      </div>
    );
  }

  const vestido = reserva.vestido;

  return (
    <div className="space-y-6 max-w-3xl">
      <CabecalhoDetalhe
        trilha={[
          { rotulo: "Reservas", para: "/reservas" },
          // S-O54: a trilha leva à ficha da DONA — o véu herdado tinha uma
          // noiva e a tela não a nomeava nem linkava.
          ...(dona.leadId
            ? [{ rotulo: dona.nome ?? "Noiva", para: `/noivas/${dona.leadId}` }]
            : []),
          { rotulo: "Reserva" },
        ]}
        titulo={dona.nome ?? "Noiva"}
        subtitulo={
          <>
            <Link to={`/loja/${lojaId}/vestidos/${reserva.vestidoId}`} className="hover:underline">
              {vestido ? `${vestido.codigo} · ${vestido.nome}` : "Ver vestido"}
            </Link>
            {reserva.casamentoData && (
              <> · casamento {diaMesAbrevAno(reserva.casamentoData)}</>
            )}
          </>
        }
      />

      {/* Ocupação física do vestido — honesto e calmo (não é "alerta").
          GAP Onda 4: as FASES do bloco (prova/uso/lavagem) vêm de um motor de
          janelas sem endpoint no client gerado; mostramos só o intervalo
          ocupacaoInicio→ocupacaoFim que o backend já materializa. */}
      {(reserva.ocupacaoInicio || reserva.ocupacaoFim) && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Indisponível</h2>
          <p className="text-sm">
            {reserva.ocupacaoInicio && <>De {diaMesAnoLongo(reserva.ocupacaoInicio)} </>}
            {reserva.ocupacaoFim
              ? <>a {diaMesAnoLongo(reserva.ocupacaoFim)}.</>
              : <>(em aberto, peça ainda fora).</>}
          </p>
        </section>
      )}

      {foraDaDataDaNoiva && (
        <div
          className="border-amber-500/40 bg-amber-500/10 rounded-md border p-3 text-sm"
          data-testid="aviso-peca-fora-da-data-da-noiva"
        >
          <p className="font-medium">
            Esta peça ficou em {diaMesAbrevAno(foraDaDataDaNoiva.diaDaPeca)}, e a noiva casa em{" "}
            {diaMesAbrevAno(foraDaDataDaNoiva.diaDaNoiva)}.
          </p>
          <p className="text-muted-foreground">
            A data do casamento mudou na ficha dela e a reserva não acompanhou.{" "}
            {dona.leadId ? (
              <>
                Na{" "}
                <Link to={`/loja/${lojaId}/noivas/${dona.leadId}`} className="underline">
                  ficha da noiva
                </Link>{" "}
                dá para mover as reservas dela para o dia certo — as peças e o contrato ativo vão junto.
              </>
            ) : null}
          </p>
        </div>
      )}

      {/* S-O11 — de quem é esta reserva, e como consertar quando é de outra.
          Fica no topo de propósito: quem abre a ficha por engano descobre aqui
          que ela é da noiva errada, antes de registrar movimentação nela. */}
      {podeMovimentar && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">De quem é</h2>
          <Card>
            <CardContent className="pt-6 space-y-3">
              {trocandoNoiva ? (
                <>
                  <p className="text-sm">
                    Passar esta reserva para outra noiva. O vestido, as datas e as provas ficam
                    onde estão — muda só de quem ela é.
                  </p>
                  <ComboboxNoiva
                    lojaId={activeLojaId!}
                    value={noivaEscolhida}
                    onChange={setNoivaEscolhida}
                    ariaLabel="Noiva desta reserva"
                    placeholder="Escolha a noiva certa"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!noivaEscolhida || noivaEscolhida === reserva.leadId || updateBloqueio.isPending}
                      onClick={trocarNoiva}
                      data-testid="confirmar-troca-de-noiva"
                    >
                      Passar para esta noiva
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTrocandoNoiva(false);
                        setNoivaEscolhida(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* S-O54/E185 — três estados, e a tela dizia dois. O véu
                      pendurado numa reserva-mãe caía na frase "ainda não tem
                      noiva", que é falsa: ele TEM dona, herdada da mãe, e é
                      por ela que o servidor cobra o reparo e recusa o contrato
                      de outra. */}
                  <p className="text-sm">
                    {dona.origem === "propria" ? (
                      <>
                        Reserva de <strong>{dona.nome ?? "uma noiva"}</strong>.
                      </>
                    ) : dona.origem === "herdada" ? (
                      <>
                        Esta peça faz parte da reserva de{" "}
                        <strong>{dona.nome ?? "outra ficha"}</strong> — a dona vem de lá.
                      </>
                    ) : (
                      <>
                        Esta reserva <strong>ainda não tem noiva</strong> — ela será adotada quando
                        um contrato prender esta peça.
                      </>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNoivaEscolhida(reserva.leadId ?? null);
                      setTrocandoNoiva(true);
                    }}
                    data-testid="trocar-noiva-da-reserva"
                  >
                    Trocar a noiva
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* E223 — a troca de peça do contrato (cláusula 17ª). Só aparece quando
          ESTA reserva está presa pelo contrato ativo da noiva (o vínculo vem do
          GET do contrato) e a peça ainda não saiu — depois da retirada o
          servidor recusa, e a tela não oferece o que a porta vai negar. */}
      {podeTrocarPeca && presoPorEsteContrato && !reserva.retiradaDataReal && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Peça do contrato</h2>
          <Card>
            <CardContent className="pt-6 space-y-3">
              {vetoDaTroca ? (
                // E219 — a cláusula fala antes do clique, sem 422 no meio.
                <p className="text-sm text-muted-foreground" data-testid="troca-vedada">
                  {vetoDaTroca.detalhe}
                </p>
              ) : trocandoPeca ? (
                <>
                  <p className="text-sm">
                    A troca liberta esta reserva, prende a peça nova com a mesma régua de
                    disponibilidade do fecho e atualiza o contrato — sem cancelar nada. O valor
                    contratado não muda: diferença de preço, se negociada, entra como parcela.
                  </p>
                  <Select value={pecaEscolhida ?? undefined} onValueChange={setPecaEscolhida}>
                    <SelectTrigger aria-label="Peça nova" data-testid="peca-nova-da-troca">
                      <SelectValue placeholder="Escolha a peça nova" />
                    </SelectTrigger>
                    <SelectContent>
                      {(vestidos.data ?? [])
                        .filter((v) => v.id !== reserva.vestidoId && v.status === "ativo")
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.codigo} · {v.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!pecaEscolhida || trocarPecaDoContrato.isPending}
                      onClick={confirmarTrocaDePeca}
                      data-testid="confirmar-troca-de-peca"
                    >
                      Trocar para esta peça
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTrocandoPeca(false);
                        setPecaEscolhida(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    Esta peça está presa pelo <strong>contrato ativo</strong> da noiva. Trocar de
                    modelo acontece por aqui — sem cancelar o contrato.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTrocandoPeca(true)}
                    data-testid="trocar-peca-do-contrato"
                  >
                    Trocar a peça
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Movimentação do vestido — saída/volta da peça (fecha a jornada) */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Movimentação</h2>

        {/* E212 — o atraso na devolução tem preço (cláusula 16ª e seus §§).
            O sistema já pintava a janela como ATRASO_DEVOLUCAO e nunca cobrava:
            a peça aparecia vermelha no acervo e a conta não existia. O aviso
            vem ANTES do botão pela razão que o E211 mediu — descobrir a
            cobrança depois de já ter dito à noiva que está tudo certo é o
            defeito, não o valor. A conta é a do SERVIDOR: refazê-la aqui seria
            a segunda grafia que diverge no dia em que a régua mudar. */}
        {atraso.data?.devida && (
          <Card className={atraso.data.temExtravio ? "border-destructive" : "border-amber-500"}>
            <CardContent className="pt-6 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium" data-testid="atraso-titulo">
                  {atraso.data.temExtravio
                    ? `Extravio — ${atraso.data.maiorAtraso} dias sem devolução (cláusula 16ª)`
                    : `Devolução atrasada em ${atraso.data.maiorAtraso} dia(s) (cláusula 16ª §1º)`}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="atraso-explicacao">
                  {atraso.data.explicacao}
                </p>
              </div>
              <p className="text-sm" data-testid="atraso-valor">
                A cobrar: <span className="font-semibold">{brl(atraso.data.valor)}</span>
              </p>
              {atraso.data.jaCobrada ? (
                <p className="text-xs text-muted-foreground" data-testid="atraso-ja-cobrado">
                  Já cobrado — entrou como parcela do contrato.
                </p>
              ) : (
                podeCobrarAtraso && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="prazo-cobranca-atraso" className="text-xs">Vence em (dias)</Label>
                      <Input
                        id="prazo-cobranca-atraso"
                        type="number"
                        min={0}
                        max={365}
                        inputMode="numeric"
                        className="w-24"
                        value={prazoAtraso}
                        onChange={(e) => setPrazoAtraso(e.target.value)}
                        data-testid="input-prazo-cobranca-atraso"
                      />
                    </div>
                    <Button
                      size="sm"
                      // C10: prazo vazio não vira 0 dias — `Number("")` é 0.
                      disabled={cobrarAtraso.isPending || prazoAtraso.trim() === "" || Number.isNaN(Number(prazoAtraso))}
                      onClick={cobrarAtrasoDaDevolucaoDoContrato}
                      data-testid="cobrar-atraso"
                    >
                      Cobrar o atraso
                    </Button>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )}
        {/* A peça atrasada que NÃO está no rol de itens do contrato: a 16ª cobra
            sobre o aluguel de cada peça, e não há de onde tirá-lo. A tela diz
            que não conferiu em vez de calar — mesma escolha do E214. */}
        {pecasSemAluguel.length > 0 && (
          <Card className="border-amber-500">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground" data-testid="atraso-sem-aluguel">
                {pecasSemAluguel.join(", ")} — atrasou e não está no rol de itens do
                contrato. A cláusula 16ª cobra sobre o aluguel de cada peça, e não há de onde
                tirá-lo: confira o contrato antes de cobrar.
              </p>
            </CardContent>
          </Card>
        )}

        {reserva.devolucaoDataReal ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="space-y-1">
                <p className="text-sm">
                  Devolvido em {diaMesAnoLongo(reserva.devolucaoDataReal)}.
                </p>
                <p className="text-xs text-muted-foreground">
                  A jornada desta noiva está encerrada.
                </p>
                {podeMovimentar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={updateBloqueio.isPending}
                    onClick={() => desfazerMovimentacao("devolucaoDataReal")}
                    data-testid="desfazer-devolucao"
                  >
                    Desfazer devolução
                  </Button>
                )}
              </div>

              {/* E152 — a lavagem era a única etapa do ciclo sem data real: a
                  peça voltava da lavanderia na quarta e continuava presa até
                  domingo, pendurada na arara. A régua de uma semana está certa
                  (é lavanderia externa); o que faltava era poder dizer que ela
                  chegou. Só reduz ocupação — nunca cria conflito. */}
              {reserva.lavagemConcluidaEm ? (
                <div className="space-y-1 border-t pt-3">
                  <p className="text-sm" data-testid="lavagem-concluida">
                    Voltou da lavanderia em{" "}
                    {diaMesAnoLongo(reserva.lavagemConcluidaEm)} — o vestido
                    está livre a partir do dia seguinte.
                  </p>
                  {podeMovimentar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updateBloqueio.isPending}
                      onClick={() => desfazerMovimentacao("lavagemConcluidaEm")}
                      data-testid="desfazer-lavagem"
                    >
                      Desfazer volta da lavanderia
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Sem esta data, o vestido fica reservado à lavagem pelo prazo da loja,
                    mesmo que já esteja de volta.
                  </p>
                  {podeMovimentar && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          Voltou da lavanderia em
                        </span>
                        <Input
                          type="date"
                          value={dataMovimentacaoAtual}
                          onChange={(e) => setDataMovimentacao(e.target.value)}
                          className="w-44"
                          aria-label="Voltou da lavanderia em"
                        />
                      </label>
                      <Button
                        disabled={!dataMovimentacaoAtual || updateBloqueio.isPending}
                        onClick={() => registrarMovimentacao("lavagemConcluidaEm")}
                        data-testid="registrar-lavagem"
                      >
                        Registrar volta
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : reserva.retiradaDataReal ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">
                Retirado em {diaMesAnoLongo(reserva.retiradaDataReal)} — com a
                noiva.
              </p>
              <p className="text-xs text-muted-foreground">
                Enquanto a devolução não for registrada, o vestido fica indisponível para outras
                noivas.
              </p>
              {podeMovimentar && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Data da devolução
                    </span>
                    <Input
                      type="date"
                      value={dataMovimentacaoAtual}
                      onChange={(e) => setDataMovimentacao(e.target.value)}
                      className="w-44"
                      aria-label="Data da devolução"
                    />
                  </label>
                  <Button
                    disabled={!dataMovimentacaoAtual || updateBloqueio.isPending}
                    onClick={() => registrarMovimentacao("devolucaoDataReal")}
                  >
                    Registrar devolução
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={updateBloqueio.isPending}
                    onClick={() => desfazerMovimentacao("retiradaDataReal")}
                    data-testid="desfazer-retirada"
                  >
                    Desfazer retirada
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">Vestido ainda no ateliê.</p>
              {podeMovimentar && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Data da retirada
                    </span>
                    <Input
                      type="date"
                      value={dataMovimentacaoAtual}
                      onChange={(e) => setDataMovimentacao(e.target.value)}
                      className="w-44"
                      aria-label="Data da retirada"
                    />
                  </label>
                  <Button
                    disabled={!dataMovimentacaoAtual || updateBloqueio.isPending}
                    onClick={() => registrarMovimentacao("retiradaDataReal")}
                  >
                    Registrar retirada
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* E71: avarias da devolução — registro com foto-evidência e, quando há
          contrato ativo, o custo vira parcela cobrável pela régua de sempre. */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Avarias</h2>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* S-C160 — a frase de vazio só depois de a consulta responder. Um
                500 aqui virava "Nenhuma avaria registrada — o vestido voltou
                como saiu.", a frase que a dona lê antes de decidir NÃO cobrar
                a avaria. O `?? []` fica (é o fallback do map), mas o erro fala
                antes — o idioma da S-C120. */}
            {avarias.isError ? (
              <Erro
                titulo="Não deu para carregar as avarias"
                erro={avarias.error}
                onTentarNovamente={() => avarias.refetch()}
              />
            ) : (avarias.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaria registrada — o vestido voltou como saiu.
              </p>
            ) : (
              <ul className="divide-y">
                {(avarias.data ?? []).map((a) => {
                  /**
                   * V2/E167 — "já cobrada" é cobrança VIVA, não `parcelaId`
                   * preenchido.
                   *
                   * A tela decidia por `a.parcelaId` e o servidor por
                   * `cobrancaViva` (`reservas.ts`), e os dois discordavam no
                   * caso que acontece: cancelado o contrato, a parcela do
                   * reparo vira CANCELADA junto. O servidor volta a aceitar
                   * cobrar e a remover; a tela mostrava "Cobrado — ver
                   * parcela" para sempre e escondia os dois botões. Com um
                   * reparo de R$ 800,00, são R$ 800,00 que nunca entram no
                   * carnê novo que a noiva assina meses depois — e uma avaria
                   * impossível de limpar. O ciclo sem saída que o servidor diz
                   * ter fechado continuava fechado do lado do cliente.
                   */
                  const cobrada = !!a.parcelaId && a.parcelaStatus !== "CANCELADA";
                  const cobrancaMorreu = !!a.parcelaId && a.parcelaStatus === "CANCELADA";
                  return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm">
                        {a.descricao}
                        {/* E214: a cláusula de onde a taxa saiu, ao lado dela.
                            Sem isto, R$ 400,00 na lista continua sendo um
                            número sem régua — que é o defeito que este épico
                            fechou na escrita. */}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {a.tipo === "LIMPEZA" ? "limpeza (14ª)" : "dano (15ª)"}
                        </span>
                      </p>
                      {/* A razão de uma taxa fora da faixa fica VISÍVEL, não só
                          na trilha: quem lê a ficha depois precisa ver o valor
                          com a explicação ao lado. */}
                      {a.justificativaDaTaxa && (
                        <p className="text-xs text-destructive" data-testid={`taxa-fora-da-faixa-${a.id}`}>
                          Fora da faixa do contrato — {a.justificativaDaTaxa}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {a.custoReparo != null && <>reparo estimado {brl(a.custoReparo)} · </>}
                        {a.registradoPorNome && <>{a.registradoPorNome} · </>}
                        {diaMesAbrevAno(a.criadaEm)}
                        {a.temFoto && (
                          <>
                            {" · "}
                            <a
                              href={`/api/lojas/${activeLojaId}/avarias/${a.id}/foto`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-texto underline underline-offset-4"
                            >
                              ver foto
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    {podeMovimentar && (
                      <span className="flex items-center gap-1">
                        {/* F22: depois de cobrada, o botão não oferece cobrar de
                            novo — ele leva à parcela. Antes ele continuava ali,
                            idêntico, e o segundo clique criava a segunda
                            cobrança do mesmo conserto. */}
                        {cobrada ? (
                          contratoAtivo && (
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/loja/${activeLojaId}/contratos/${contratoAtivo.id}`}>
                                Cobrado — ver parcela
                              </Link>
                            </Button>
                          )
                        ) : a.constatadaEm === "ENTREGA" ? (
                          /* E232/S-C1 — vista na ENTREGA, a 5ª §3º manda a
                             LOJA substituir: o botão de cobrar não nasce, e o
                             motivo fica onde ele estaria (a régua do E166). */
                          <span
                            className="max-w-56 text-xs text-muted-foreground"
                            data-testid={`motivo-nao-cobra-${a.id}`}
                          >
                            Vista na entrega — a loja substitui a peça (5ª §3º); não se cobra da
                            noiva o defeito que ela recebeu pronto.
                          </span>
                        ) : contratoAtivo && a.custoReparo != null && a.custoReparo > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cobrarAvaria.isPending}
                            onClick={() => abrirCobranca(a)}
                            data-testid={`cobrar-reparo-${a.id}`}
                          >
                            {/* A cobrança anterior morreu com o contrato: o
                                gesto é o mesmo, e o rótulo diz que já houve
                                uma. */}
                            {cobrancaMorreu ? "Recobrar reparo" : "Cobrar reparo"}
                          </Button>
                        ) : (
                          /* E230/S-C112 — o aviso onde o botão NÃO está,
                             dizendo por que ele não está (a classe do E166). O
                             422 AVARIA_SEM_DONA já ensinava o caminho e
                             ninguém lia, porque sem dono derivado o botão nem
                             nascia — quem abria um véu órfão com avaria via o
                             dano e não via saída. A frase é a do servidor. */
                          !donoDaReserva &&
                          a.custoReparo != null &&
                          a.custoReparo > 0 && (
                            <span
                              className="max-w-56 text-xs text-muted-foreground"
                              data-testid={`motivo-nao-cobra-${a.id}`}
                            >
                              Sem dona, o reparo entraria no carnê de qualquer contrato — ligue a
                              reserva à noiva antes de cobrar.
                            </span>
                          )
                        )}
                        {/* S-C11: o conserto do zero a mais. Antes daqui, o
                            único gesto ao lado do número errado era o `X` —
                            que leva a foto-prova junto, e que o servidor recusa
                            enquanto a cobrança estiver viva.
                            E232/S-C99: o botão ganha NOME — era só ícone com
                            `aria-label`, e botão que só o leitor de tela sabe
                            o que faz não é botão para quem enxerga. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`corrigir-avaria-${a.id}`}
                          onClick={() => abrirEdicaoDaAvaria(a)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Corrigir
                        </Button>
                        {/* F23: a foto é a PROVA que sustenta a cobrança. Ela
                            saía por um toque num ícone de 28px, sem uma palavra
                            — e a parcela continuava no carnê. */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              aria-label="Remover avaria"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover esta avaria?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {cobrada ? (
                                  <>
                                    Esta avaria já virou parcela do contrato. Remova a parcela
                                    primeiro — apagar a avaria agora deixaria a noiva devendo por um
                                    dano sem prova nenhuma.
                                  </>
                                ) : (
                                  <>
                                    {cobrancaMorreu
                                      ? "A cobrança deste reparo foi cancelada junto com o contrato — não há mais parcela que a foto sustente. "
                                      : ""}
                                    “{a.descricao}”{a.temFoto ? " e a foto que a comprova" : ""} saem
                                    para sempre. {a.temFoto ? "A foto é a prova do dano — " : ""}
                                    não há como recuperar depois.
                                  </>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              {!cobrada && (
                                <AlertDialogAction
                                  onClick={() =>
                                    comToast(
                                      async () => {
                                        await deleteAvaria.mutateAsync({
                                          lojaId: activeLojaId!,
                                          avariaId: a.id,
                                        });
                                        await queryClient.invalidateQueries({
                                          queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
                                        });
                                      },
                                      "Avaria removida",
                                      "Não deu para remover a avaria",
                                    )
                                  }
                                >
                                  Remover
                                </AlertDialogAction>
                              )}
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </span>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}

            {podeRegistrarAvaria && (
              <div className="space-y-2 border-t pt-4" id="registrar-avaria">
                <Input
                  placeholder="O que aconteceu com o vestido? (ex.: barra rasgada)"
                  value={avariaDescricao}
                  onChange={(e) => setAvariaDescricao(e.target.value)}
                  aria-label="Descrição da avaria"
                  // S-O81: o teto do spec, do lado de cá — o campo para de
                  // aceitar em vez de o servidor devolver 400 depois da viagem.
                  maxLength={AVARIA_DESCRICAO_MAX_CHARS}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {/* E214: de qual cláusula a taxa sai. São réguas diferentes —
                      a limpeza (14ª) tem faixa absoluta, o dano (15ª) tem teto
                      de 5× o aluguel da peça —, e sem o tipo o número não tem
                      régua nenhuma. */}
                  <Select
                    value={avariaTipo}
                    onValueChange={(v) => setAvariaTipo(v as TipoDeAvaria)}
                  >
                    <SelectTrigger className="w-44" aria-label="Tipo da avaria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DANO">Dano (cláusula 15ª)</SelectItem>
                      <SelectItem value="LIMPEZA">Limpeza (cláusula 14ª)</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* E232/S-C1 — ONDE o dano foi visto. Na entrega, a 5ª §3º
                      manda a LOJA substituir: o registro existe (com foto,
                      para a troca ter prova) e a cobrança não nasce. */}
                  <Select
                    value={avariaConstatadaEm}
                    onValueChange={(v) => setAvariaConstatadaEm(v as "ENTREGA" | "DEVOLUCAO")}
                  >
                    <SelectTrigger className="w-52" aria-label="Onde foi constatada" data-testid="avaria-constatada-em">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEVOLUCAO">Vista na devolução</SelectItem>
                      <SelectItem value="ENTREGA">Vista na entrega (5ª §3º)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Custo do reparo (R$, opcional)"
                    value={avariaCusto}
                    onChange={(e) => setAvariaCusto(e.target.value)}
                    className="w-52"
                    aria-label="Custo do reparo"
                  />
                  <label className="text-sm text-primary-texto underline underline-offset-4 cursor-pointer">
                    {avariaFotoNome ?? "Anexar foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => aoEscolherFotoAvaria(e.target.files?.[0])}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={
                      !avariaDescricao.trim() ||
                      createAvaria.isPending ||
                      // Fora da faixa sem razão escrita, o servidor responde 422:
                      // o botão diz isso antes, em vez de gastar a viagem.
                      (veredictoDaAvaria.exigeJustificativa && !avariaJustificativa.trim())
                    }
                    onClick={registrarAvaria}
                    data-testid="registrar-avaria"
                  >
                    Registrar avaria
                  </Button>
                </div>

                {/* A faixa do contrato, dita ANTES do clique. Ela aparece
                    sempre que há tipo escolhido: quem digita R$ 50,00 de
                    limpeza tem de ler os R$ 350,00 no momento em que digita,
                    não depois de anexar a foto. */}
                <p
                  className={`text-xs ${veredictoDaAvaria.exigeJustificativa ? "text-destructive" : "text-muted-foreground"}`}
                  data-testid="faixa-da-avaria"
                >
                  {explicacaoDaFaixa(veredictoDaAvaria)}
                  {veredictoDaAvaria.exigeJustificativa &&
                    " A régua não impede — escreva por que este valor sai dela."}
                </p>

                {veredictoDaAvaria.exigeJustificativa && (
                  <Input
                    placeholder="Por que esta taxa sai da faixa do contrato?"
                    value={avariaJustificativa}
                    onChange={(e) => setAvariaJustificativa(e.target.value)}
                    aria-label="Justificativa da taxa"
                    maxLength={AVARIA_JUSTIFICATIVA_MAX_CHARS}
                    data-testid="justificativa-da-taxa"
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* S-C11 — a correção da avaria. Os quatro campos do cadastro, menos a
          FOTO: trocar a prova não é corrigir um número, e quem precisar de
          outra evidência registra outra avaria. */}
      <Dialog open={avariaEmEdicao !== null} onOpenChange={(aberto) => !aberto && setAvariaEmEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir a avaria</DialogTitle>
            <DialogDescription>
              A foto e a data do registro ficam como estão. Se este reparo já virou parcela do
              contrato, o valor do carnê acompanha a correção.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={edicaoDescricao}
              onChange={(e) => setEdicaoDescricao(e.target.value)}
              aria-label="Descrição da avaria"
              placeholder="O que aconteceu com a peça"
              maxLength={AVARIA_DESCRICAO_MAX_CHARS}
            />
            <div className="flex flex-wrap gap-2">
              <Select
                value={edicaoTipo}
                onValueChange={(v) => setEdicaoTipo(v as TipoDeAvaria)}
              >
                <SelectTrigger className="w-44" aria-label="Tipo da avaria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LIMPEZA">Limpeza (14ª)</SelectItem>
                  <SelectItem value="DANO">Dano (15ª)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-40"
                value={edicaoCusto}
                onChange={(e) => setEdicaoCusto(e.target.value)}
                aria-label="Custo do reparo"
                placeholder="Custo do reparo"
                inputMode="decimal"
                data-testid="edicao-custo-reparo"
              />
            </div>
            {/* A MESMA frase do cadastro e do 422 — ela sai de
                `explicacaoDaFaixa`, no `financeiro-core`. */}
            <p
              className={`text-xs ${veredictoDaEdicao.exigeJustificativa ? "text-destructive" : "text-muted-foreground"}`}
              data-testid="faixa-da-avaria-edicao"
            >
              {explicacaoDaFaixa(veredictoDaEdicao)}
              {veredictoDaEdicao.exigeJustificativa &&
                " A régua não impede — escreva por que este valor sai dela."}
            </p>
            {veredictoDaEdicao.exigeJustificativa && (
              <Input
                placeholder="Por que esta taxa sai da faixa do contrato?"
                value={edicaoJustificativa}
                onChange={(e) => setEdicaoJustificativa(e.target.value)}
                aria-label="Justificativa da taxa"
                maxLength={AVARIA_JUSTIFICATIVA_MAX_CHARS}
                data-testid="justificativa-da-taxa-edicao"
              />
            )}
            {edicaoTemRecebimento && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Este reparo já recebeu dinheiro</AlertTitle>
                <AlertDescription>
                  O extrato e o caixa já contaram esse valor no dia em que ele entrou. Estorne a
                  parcela no contrato e volte aqui para corrigir.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvariaEmEdicao(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !edicaoDescricao.trim() ||
                updateAvaria.isPending ||
                edicaoTemRecebimento ||
                (veredictoDaEdicao.exigeJustificativa && !edicaoJustificativa.trim())
              }
              onClick={salvarEdicaoDaAvaria}
              data-testid="salvar-avaria-editada"
            >
              Salvar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E232/S-C98 — a cobrança do reparo com o PRAZO escolhível. O campo
          abre com a constante que a porta pratica; a vendedora só mexe quando
          o combinado é outro. */}
      <Dialog open={avariaCobrar !== null} onOpenChange={(aberto) => !aberto && setAvariaCobrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar o reparo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A parcela do reparo entra no carnê do contrato ativo da noiva.
            </p>
            <div className="space-y-2">
              <Label htmlFor="prazo-cobranca-reparo">Vence em (dias)</Label>
              <Input
                id="prazo-cobranca-reparo"
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                value={prazoCobranca}
                onChange={(e) => setPrazoCobranca(e.target.value)}
                data-testid="input-prazo-cobranca-reparo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvariaCobrar(null)}>
              Voltar
            </Button>
            <Button
              // C10 (E244): prazo vazio não vira 0 dias — `Number("")` é 0 e a parcela vencia hoje.
              disabled={cobrarAvaria.isPending || prazoCobranca.trim() === "" || Number.isNaN(Number(prazoCobranca))}
              onClick={() => {
                if (!avariaCobrar) return;
                void cobrarReparo(avariaCobrar, Number(prazoCobranca));
                setAvariaCobrar(null);
              }}
              data-testid="confirmar-cobranca-reparo"
            >
              {cobrarAvaria.isPending ? "Cobrando…" : "Cobrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provas da reserva + ajustes de costura com checklist */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Provas</h2>
          {/* S-O54: a prova é da DONA. O véu herdado não tinha `lead_id`
              próprio e o botão sumia — a peça que a noiva vai vestir era a
              única sem caminho para marcar a prova dela. */}
          {dona.leadId && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/loja/${lojaId}/atendimentos/novo?noiva=${dona.leadId}&tipo=PROVA&reserva=${bloqueioId}`}
              >
                Agendar prova
              </Link>
            </Button>
          )}
        </div>

        {atendimentos.isLoading ? (
          <Card className="animate-pulse h-32" />
        ) : provas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma prova agendada ainda.</p>
        ) : (
          <ul className="space-y-4">
            {provas.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {dataHoraFmt.format(new Date(p.inicio))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[p.cabine?.nome, p.vendedora?.nome].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                      <Badge variant="secondary">{ROTULO_SITUACAO[p.situacao] ?? p.situacao}</Badge>
                    </div>

                    {p.observacao && (
                      <p className="text-sm text-muted-foreground">{p.observacao}</p>
                    )}

                    {/* Ajustes desta prova */}
                    <div className="space-y-2 border-t pt-3">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        Ajustes
                      </span>
                      {(p.ajustes ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem ajustes nesta prova.</p>
                      ) : (
                        <ul className="space-y-3">
                          {(p.ajustes ?? []).map((a) => {
                            const feito = a.status === "FEITO";
                            return (
                              <li key={a.id} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span
                                    className={`text-sm ${
                                      feito ? "text-muted-foreground line-through" : ""
                                    }`}
                                  >
                                    {a.descricao}
                                  </span>
                                  {podeEditarAjuste && (
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={updateAjuste.isPending}
                                        onClick={() => alternarAjuste(a)}
                                      >
                                        {feito ? "Reabrir" : "Marcar feito"}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={deleteAjuste.isPending}
                                        onClick={() => setAjusteParaRemover(a)}
                                      >
                                        Remover
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Checklist de costura */}
                                {(a.checklist ?? []).length > 0 && (
                                  <ul className="space-y-1 pl-3">
                                    {(a.checklist ?? []).map((c) => (
                                      <li
                                        key={c.id}
                                        className="flex items-center justify-between gap-3"
                                      >
                                        <label className="flex items-center gap-2">
                                          <Checkbox
                                            checked={c.feito}
                                            disabled={!podeEditarAjuste || updateItem.isPending}
                                            onCheckedChange={(v) => alternarItem(c.id, v === true)}
                                            aria-label={`Item ${c.descricao}`}
                                          />
                                          <span
                                            className={`text-xs ${
                                              c.feito
                                                ? "text-muted-foreground line-through"
                                                : "text-foreground"
                                            }`}
                                          >
                                            {c.descricao}
                                          </span>
                                        </label>
                                        {podeEditarAjuste && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="md:h-6 md:w-6"
                                            disabled={removeItem.isPending}
                                            onClick={() => removerItem(c.id)}
                                            aria-label={`Remover item ${c.descricao}`}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {/* Adicionar item ao checklist */}
                                {podeCriarAjuste && (
                                  <form
                                    className="flex items-center gap-2 pl-3"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      adicionarItem(a);
                                    }}
                                  >
                                    <Input
                                      value={novoItem[a.id] ?? ""}
                                      onChange={(e) =>
                                        setNovoItem((s) => ({ ...s, [a.id]: e.target.value }))
                                      }
                                      placeholder="Item do checklist…"
                                      className="h-8 text-xs"
                                      aria-label="Novo item do checklist"
                                    />
                                    <Button
                                      type="submit"
                                      variant="outline"
                                      size="sm"
                                      disabled={addItem.isPending}
                                    >
                                      Adicionar
                                    </Button>
                                  </form>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Adicionar ajuste */}
                      {podeCriarAjuste && (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            adicionarAjuste(p.id);
                          }}
                        >
                          <Select
                            value={novoAjusteTipo[p.id] ?? "AJUSTE"}
                            onValueChange={(v) =>
                              setNovoAjusteTipo((s) => ({ ...s, [p.id]: v as "AJUSTE" | "CONFECCAO" }))
                            }
                          >
                            <SelectTrigger className="w-32" aria-label="Tipo do trabalho">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AJUSTE">Ajuste</SelectItem>
                              <SelectItem value="CONFECCAO">Confecção</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={novoAjuste[p.id] ?? ""}
                            onChange={(e) =>
                              setNovoAjuste((s) => ({ ...s, [p.id]: e.target.value }))
                            }
                            placeholder={
                              (novoAjusteTipo[p.id] ?? "AJUSTE") === "CONFECCAO"
                                ? "Peça a confeccionar (ex.: manga renda c/ saia lisa)…"
                                : "Novo ajuste (ex.: bainha 3cm)…"
                            }
                            aria-label="Novo trabalho da costureira"
                          />
                          {/* Custo é da confecção — material e mão de obra, que
                              ajuste comum não tem. Fica opcional mesmo nela. */}
                          {(novoAjusteTipo[p.id] ?? "AJUSTE") === "CONFECCAO" && (
                            <Input
                              value={novoAjusteCusto[p.id] ?? ""}
                              onChange={(e) =>
                                setNovoAjusteCusto((s) => ({ ...s, [p.id]: e.target.value }))
                              }
                              placeholder="Custo (R$)"
                              inputMode="decimal"
                              className="w-32"
                              aria-label="Custo da confecção"
                            />
                          )}
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={createAjuste.isPending}
                          >
                            Adicionar
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirmação de remoção de ajuste */}
      <AlertDialog
        open={ajusteParaRemover !== null}
        onOpenChange={(open) => !open && setAjusteParaRemover(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este ajuste?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* E262 — a decisão da dona (S-RM16) sobre o valor que a pessoa
                  digitou. Achado pela régua, não pela sobra: nenhuma das quatro
                  o nomeia. */}
              {ajusteParaRemover?.descricao} sai da prova, e o checklist dele vai junto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removerAjusteConfirmado}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* F25/E97 — a conferência da devolução.

          O E71 inteiro (avaria, foto, custo, cobrança) dependia de alguém
          LEMBRAR de rolar a página e preencher um formulário depois de
          registrar a devolução. O momento em que a peça está na mão é o único
          em que dá para olhar; passado ele, o vestido já voltou para a arara.

          As duas saídas são explícitas de propósito: "sim, tudo certo" é uma
          resposta, não um silêncio. */}
      <AlertDialog open={conferirDevolucao} onOpenChange={setConferirDevolucao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O vestido voltou como saiu?</AlertDialogTitle>
            <AlertDialogDescription>
              {/**
               * V15/E167 — quem tem `vestidos.editar` sem `vestidos.criar` via
               * um botão que não fazia NADA.
               *
               * O formulário só existe sob `podeRegistrarAvaria`
               * (`vestidos.criar`, S-M21), e o perfil `{ver, editar}` sem
               * `criar` é o que `permissoes.ts` documenta como "válido e
               * comum" — a gerente que revisa o que a vendedora cadastrou. Ela
               * registrava a devolução, o diálogo abria, ela clicava em
               * "Registrar avaria", e o `getElementById(...)?.scrollIntoView`
               * engolia a chamada no `?.`: o diálogo fechava, a página não se
               * movia um pixel e nenhum toast explicava. E o F25 existe
               * justamente porque "passado esse momento o vestido já voltou
               * para a arara" — o dano ficava sem registro e sem cobrança.
               */}
              {podeRegistrarAvaria ? (
                <>
                  Confira agora, com a peça na mão. Depois que ela voltar para a arara, um dano
                  encontrado não tem mais como ser cobrado com prova.
                </>
              ) : (
                <>
                  Confira agora, com a peça na mão — mas o registro da avaria não está no seu
                  acesso: ele pede a permissão de <strong>criar</strong> em Vestidos, e o seu
                  perfil tem só a de editar. Chame quem pode registrar antes de a peça voltar
                  para a arara; depois disso o dano não tem mais como ser cobrado com prova.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {podeRegistrarAvaria ? "Sim, tudo certo" : "Entendi"}
            </AlertDialogCancel>
            {podeRegistrarAvaria && (
              <AlertDialogAction
                data-testid="ir-registrar-avaria"
                onClick={() => {
                  setConferirDevolucao(false);
                  document
                    .getElementById("registrar-avaria")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                Registrar avaria
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
