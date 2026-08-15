import { Router, type IRouter } from "express";
import {
  db,
  auditLogTable,
  contratosTable,
  contratoItensTable,
  parcelasTable,
  bloqueioVestidosTable,
  orcamentosTable,
  orcamentoItensTable,
  orcamentoVersoesTable,
  leadsTable,
  contratoBloqueiosTable,
  reservasTable,
  usuariosTable,
  vestidosTable,
  contasPagarTable,
  type InsertContratoItem,
} from "@workspace/db";
import { eq, and, isNull, isNotNull, inArray, sql, desc, count } from "drizzle-orm";
import { verificarDisponibilidade, diaLocal } from "../lib/disponibilidade";
import { registrarAuditoria } from "../lib/auditoria";
import { avancarEtapaLead } from "../lib/estados";
// S-O56/E185 — a régua do dono, a mesma que as portas de leitura respondem.
import { comDono } from "../lib/dono-do-bloqueio";
import { faltasDaQualificacao, congelarQualificacao } from "../lib/qualificacao-da-locataria";
import { pdfDoContrato, nomeDoArquivo } from "../lib/contrato-do-papel";
// E221 — o recibo da cláusula 7ª: a montagem é pura, a leitura da trilha é do
// `recibos-do-banco`, e o escopo (a loja da URL) fica aqui, como no PDF.
import { nomeDoArquivoDoRecibo, pdfDoRecibo, recibosDoContrato } from "../lib/recibo-do-papel";
import { trilhaDosRecibos } from "../lib/recibos-do-banco";
import {
  EstornarParcelaResponse,
  GerarPlanoParcelasBody,
  GerarPlanoParcelasResponse,
  ListContratosResponse,
  ListContratosQueryParams,
  CreateParcelaAvulsaBody,
  CreateParcelaAvulsaResponse,
  CreateContratoBody,
  CreateContratoResponse,
  GetContratoResponse,
  UpdateContratoBody,
  UpdateContratoResponse,
  CancelarContratoBody,
  CancelarContratoResponse,
  ListParcelasResponse,
  ListRecibosResponse,
  ReceberParcelaBody,
  ReceberParcelaResponse,
  // E213 — o perdão da multa e dos juros da cláusula 9ª.
  PerdoarMoraBody,
  PerdoarMoraResponse,
  RestabelecerMoraResponse,
  // E223 — a troca de peça do contrato (cláusula 17ª).
  TrocarPecaDoContratoBody,
  TrocarPecaDoContratoResponse,
} from "@workspace/api-zod";
import {
  addDias,
  ancoraDeNegocio,
  brutoEmCentavos,
  // E217 — a rescisão calcula (8ª §2º, 11ª, 12ª, 13ª §3º, 18ª).
  calcularRescisao,
  centavos,
  diaDeNegocio,
  // E216 — o predicado da peça exclusiva de primeiro aluguel (cláusula 12ª).
  ehExclusivaDePrimeiroAluguel,
  estaAberta,
  // S-C140 — o estorno de 100% contra a retenção que a cláusula manda.
  estornoContraARescisao,
  faltanteDoCarneCentavos,
  // E218 — o § único do objeto: o restante do valor entra até 20 dias antes da
  // retirada. Vale para o CARNÊ; avaria, atraso e mora nascem depois dela.
  foraDoPrazoDaRetirada,
  inicioDoDia,
  liquidoEmCentavos,
  montarPlanoParcelas,
  // 13ª §3º — o prazo da devolução quando é a LOJA que rescinde. Era um `30`
  // solto aqui; virou constante para a régua dos manuais poder pregá-lo (S-C95).
  PRAZO_DEVOLUCAO_DA_LOJA_DIAS,
  reais,
  reancorarDataDeNegocio,
  STATUS_ABERTO,
  temCarne,
  // E219 — o veto da 17ª (7 dias do fecho; nem sextas nem sábados). A mesma
  // função que a tela usa para avisar antes do clique.
  vetoDaTroca17a,
} from "@workspace/financeiro-core";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { vendedoraNaLoja } from "../lib/escopo-loja";
import { leadsQueCasam } from "../lib/busca-lead";
import { conteudoEnviado, identidadeDasPecas } from "../lib/conteudo-orcamento";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";
// S-C89 — as portas deste arquivo que mudam um fato lido pela fila de atrasos
// (status do contrato, vínculo com bloqueio, cobrança viva) derrubam o cache.
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
// E213 — a multa e os juros da cláusula 9ª, derivados num lugar só.
import { moraDe } from "../lib/mora-da-parcela";
// E222 — o expediente de RETIRADA e DEVOLUÇÃO (cláusula 4ª), que não é o de
// atendimento. As duas portas que gravam as datas passam pela mesma guarda.
import { recusaDeExpedienteDeRetirada } from "../lib/expediente-de-retirada";
// E223 — a troca de peça prende a reserva nova pela MESMA régua do fecho.
import { criarReservaDeVestido } from "../lib/reserva-do-vestido";
import { relogio } from "../lib/relogio";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
/**
 * E172/S-O40 — o contrato tem módulo próprio desde 2026-08-12.
 *
 * Esta linha dizia `requireModulo("leads")`, e o efeito era que todo perfil que
 * cadastrava noiva assinava contrato: o `POST` abaixo não declara ação, o guard
 * deriva `criar` do método, e a Recepção tinha `leads.criar`. Ela via e usava o
 * botão "Gerar contrato" da tela do orçamento.
 */
router.use("/lojas/:lojaId/contratos", requireModulo("contratos"));

/**
 * B9/E101 — **receber pertence a quem vende**, e por isso as parcelas vivem sob
 * `leads` e não sob `financeiro`.
 *
 * Decisão do dono em 2026-07-27, e o valor está em ela existir escrita: esta
 * linha não explicava nada, e o resultado era a vendedora que o teste de
 * permissões cria *justamente para provar que ela não entra no financeiro*
 * podendo escrever no caixa realizado. Parecia buraco; é regra.
 *
 * A razão: a noiva paga na mão de quem a atendeu. Exigir alguém do financeiro
 * disponível para registrar cada Pix recebido no balcão trocaria um risco de
 * permissão por um atrito diário — e o dinheiro entraria no sistema com atraso,
 * que é a forma mais cara de estar errado sobre caixa.
 *
 * O que o E101 apertou foi a AÇÃO, não o módulo: `receber` e `estornar` exigem
 * `editar` (B5), então o perfil só-leitura não escreve mais no caixa. VER o
 * financeiro continua sendo outro gate — quem recebe não passa a enxergar o
 * fluxo, o DRE nem a folha.
 *
 * **E172: o módulo passou de `leads` para `contratos`, e a decisão do dono
 * continua inteira.** A parcela É do contrato — ela nasce dele, e quem fecha o
 * contrato é quem recebe. Quem vende segue tendo os dois (a Vendedora tem
 * `contratos: TUDO`), que é o que a regra de 2026-07-27 protege. O que a
 * mudança impede é o efeito colateral do `leads.editar` novo da Recepção: sem
 * esta linha aqui, o gesto que a deixou corrigir um telefone lhe daria também
 * o `receber` de um Pix de R$ 700,00 — poder que ela nunca teve e que ninguém
 * decidiu lhe dar.
 */
router.use("/lojas/:lojaId/parcelas", requireModulo("contratos"));


// O líquido do orçamento é `liquidoEmCentavos`, do financeiro-core. Ele morava
// aqui, e o comentário desta função afirmava que a conta era feita "EXATAMENTE
// como o frontend" — não era: a tela, a rota de orçamento e a visão da noiva
// calculavam em reais float. A função documentava o invariante que quebrava,
// e por isso o E95 a tirou daqui em vez de consertar o comentário.

type ItemSnapshot = Pick<
  InsertContratoItem,
  "tipo" | "vestidoId" | "itemEstoqueId" | "descricao" | "valorUnitario" | "quantidade"
>;

/** True se o contrato existe, é da loja e está ATIVO. */
async function contratoAtivo(contratoId: string, lojaId: string): Promise<boolean> {
  const [c] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
  return c?.status === "ATIVO";
}

/**
 * S-O112 — **`Parcela.contrato` era prometida em 8 pares e entregue em 2.**
 *
 * Quem recebe ou estorna uma parcela recebe a linha de volta e lê
 * `parcela.contrato.lead.noivaNome` para dizer de quem era o dinheiro — e
 * achava `undefined`, porque as duas portas respondiam o `.returning()` cru.
 * `GET /financeiro/parcelas` é quem monta o par (`financeiro.ts:139`), e o
 * recorte é o mesmo: o `.parse` do schema reduz o contrato a `{leadId, lead}`.
 *
 * As outras quatro mudas da sobra **não se fecham assim, e é decisão de spec**:
 * ali a parcela viaja DENTRO do contrato (`GET /contratos/:id`, o cancelamento,
 * as duas portas de geração de carnê), e devolver o contrato dentro de cada
 * parcela do próprio contrato é repetir o pai N vezes no filho. O que está
 * errado lá é a PROMESSA, não a entrega — a saída é o idioma que o E192 já
 * usou para `Atendimento.ajustes`: um schema estreito para o caso aninhado.
 * Fica na S-O112, agora com o diagnóstico separado em duas metades.
 */
async function comOContratoDela<T extends { id: string }>(parcela: T) {
  const completa = await db.query.parcelasTable.findFirst({
    where: eq(parcelasTable.id, parcela.id),
    with: { contrato: { with: { lead: true } } },
  });
  // E213 — a mora entra por aqui porque este é o ponto por onde TODA parcela
  // seca desta rota sai. Anexá-la em cada resposta seria a segunda grafia.
  return completa ? { ...completa, mora: moraDe(completa) } : parcela;
}

router.get("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListContratosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  // E62: mesmo recorte do listOrcamentos — o perfil da noiva pede só o dela.
  // E124/D1: busca por noiva, status no banco, página e recentes-primeiro
  // (P2) — o contrato da semana passada era o último de ~29.000px de rolagem.
  const { leadId, orcamentoId, q, status, pagina, porPagina, ordem } = query.data;
  const condicoes = [eq(contratosTable.lojaId, lojaId)];
  if (leadId) condicoes.push(eq(contratosTable.leadId, leadId));
  // E144/S-D16: o detalhe do orçamento pergunta "já virou contrato?" — antes
  // baixava os 518 contratos da loja (615 KB) para um único find.
  if (orcamentoId) condicoes.push(eq(contratosTable.orcamentoId, orcamentoId));
  if (status) condicoes.push(eq(contratosTable.status, status));
  const busca = q?.trim();
  if (busca) condicoes.push(inArray(contratosTable.leadId, leadsQueCasam(lojaId, busca)));
  const where = and(...condicoes);

  // Mesmo molde do listLeads: sem pagina/porPagina a resposta segue completa
  // (a ficha da noiva e o detalhe do orçamento leem a lista cheia).
  const paginado = pagina !== undefined || porPagina !== undefined;
  const tamanho = porPagina ?? 24;
  const [contagem, contratos] = await Promise.all([
    db.select({ total: count() }).from(contratosTable).where(where),
    db.query.contratosTable.findMany({
      where,
      with: {
        lead: true,
        vendedora: true,
        // E125/D4: o saldo devedor da ficha precisa do carnê — as parcelas
        // descem SÓ no recorte por noiva (1–2 contratos). A listagem geral
        // segue sem: 518 contratos × parcelas é a classe de payload morto
        // que a S-D5/S-D16 mediu.
        //
        // E214: os ITENS descem pela mesma porta e pela mesma razão. O teto da
        // taxa de dano é 5× o aluguel DAQUELA peça (cláusula 15ª), e o aluguel
        // mora em `contrato_itens.valor_unitario` — sem ele a tela da reserva
        // não sabe qual limite anunciar, e anunciaria um que a porta não
        // pratica, ou nenhum. São os mesmos 1–2 contratos, com uma mão-cheia de
        // linhas cada.
        ...(leadId ? { parcelas: true, itens: true } : {}),
      },
      // id desempata fechadoEm igual — sem ordem estável, página 2 repete item.
      orderBy:
        ordem === "antigos"
          ? [contratosTable.fechadoEm, contratosTable.id]
          : [desc(contratosTable.fechadoEm), desc(contratosTable.id)],
      ...(paginado ? { limit: tamanho, offset: ((pagina ?? 1) - 1) * tamanho } : {}),
    }),
  ]);
  res.json(ListContratosResponse.parse({ total: contagem[0]!.total, itens: contratos }));
});

router.post("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const { parcelas: parcelasInput, ...contratoData } = parsed.data;

  // 1. Lead precisa existir e pertencer à loja.
  const [lead] = await db.select({
    id: leadsTable.id,
    etapa: leadsTable.etapa,
    contratoFechadoEm: leadsTable.contratoFechadoEm,
    // E215 — a qualificação da locatária vem da FICHA, e é ela que o contrato
    // congela. Uma fonte só: o `cpf` do corpo era a segunda grafia do mesmo
    // dado, e é a classe do E187.
    cpf: leadsTable.cpf,
    rg: leadsTable.rg,
    estadoCivil: leadsTable.estadoCivil,
    profissao: leadsTable.profissao,
    nascimento: leadsTable.nascimento,
    email: leadsTable.email,
    enderecoLogradouro: leadsTable.enderecoLogradouro,
    enderecoNumero: leadsTable.enderecoNumero,
    enderecoComplemento: leadsTable.enderecoComplemento,
    enderecoBairro: leadsTable.enderecoBairro,
    enderecoCep: leadsTable.enderecoCep,
    enderecoCidade: leadsTable.enderecoCidade,
    enderecoEstado: leadsTable.enderecoEstado,
  }).from(leadsTable)
    .where(and(eq(leadsTable.id, contratoData.leadId), eq(leadsTable.lojaId, lojaId)));
  if (!lead) {
    res.status(422).json({ error: "LEAD_INVALIDO", detalhe: "Lead não encontrado nesta loja" });
    return;
  }

  /**
   * 1a. E215 — **o contrato não fecha sem saber quem assina** (qualificação
   * das partes).
   *
   * A recusa nomeia TODOS os campos que faltam, não o primeiro: quem está
   * fechando com a noiva na frente precisa saber tudo de uma vez, senão a
   * correção vira doze idas à ficha.
   *
   * A régua é da PORTA e não da coluna, e é por isso que ela pode existir sem
   * migração destrutiva: os 1413 leads que já existem seguem válidos como
   * FICHA, e os 735 contratos já fechados não são tocados — eles nasceram sob
   * outra regra, e reescrever o passado seria dizer que a noiva assinou o que
   * não assinou.
   */
  const faltas = faltasDaQualificacao(lead);
  if (faltas.length > 0) {
    res.status(422).json({
      error: "QUALIFICACAO_INCOMPLETA",
      detalhe: `O contrato qualifica quem assina, e a ficha da noiva ainda não tem ${faltas.length === 1 ? "um dado" : `${faltas.length} dados`}. Complete a ficha e feche o contrato em seguida.`,
      campos: faltas,
    });
    return;
  }

  // 1b. B4 — a vendedora do CORPO precisa ser desta loja. A FK só garante que o
  // id existe; sem esta linha, um contrato de A nascia com a vendedora de B, o
  // `GET /contratos` devolvia `with: { vendedora: true }` (e-mail, isSuperAdmin)
  // para dentro de A, e o fechamento de comissão gerava conta a pagar nominal a
  // quem nunca teve regra na loja.
  if (!(await vendedoraNaLoja(contratoData.vendedoraId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "Vendedora não é desta loja" });
    return;
  }

  // 2. Um lead não pode ter dois contratos ATIVOS ao mesmo tempo.
  const [ativoExistente] = await db.select({ id: contratosTable.id }).from(contratosTable)
    .where(and(
      eq(contratosTable.leadId, contratoData.leadId),
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "ATIVO"),
    ));
  if (ativoExistente) {
    res.status(409).json({ error: "CONTRATO_ATIVO_DUPLICADO", detalhe: "Este lead já possui um contrato ativo" });
    return;
  }

  /**
   * **E222 — a retirada e a devolução cabem no expediente da 4ª.**
   *
   * As duas datas eram gravadas **como vieram**: o sistema aceitava retirada num
   * domingo às 23h sem uma palavra, para um ateliê que retira e devolve de terça
   * a sábado. Não era contradição com o horário que já existia — o de lá governa
   * ATENDIMENTO (as provas, sete dias até as 20h, e certo para provas). São dois
   * expedientes, e o modelo conhecia um.
   */
  const foraDoExpediente = await recusaDeExpedienteDeRetirada(lojaId, contratoData);
  if (foraDoExpediente) {
    res.status(422).json(foraDoExpediente);
    return;
  }

  // 3. Orçamento (se informado): da loja, do mesmo lead, APROVADO, ainda não
  // vinculado a outro contrato. Seus itens viram snapshot do contrato.
  let itensSnapshot: ItemSnapshot[] = [];
  let descontoTipo: "PERCENTUAL" | "VALOR" | null = null;
  let descontoValor: number | null = null;
  // E120/S-D4: a vendedora que MONTOU o orçamento — se a do contrato divergir,
  // a divergência é aceita (a venda pode legitimamente ser de outra pessoa —
  // decisão P1 do dono: rastrear, não travar) mas deixa rastro na trilha.
  let vendedoraDoOrcamentoId: string | null = null;
  if (contratoData.orcamentoId) {
    const orcamento = await db.query.orcamentosTable.findFirst({
      where: and(eq(orcamentosTable.id, contratoData.orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
    });
    if (!orcamento) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento não encontrado nesta loja" });
      return;
    }
    if (orcamento.leadId !== contratoData.leadId) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento pertence a outro lead" });
      return;
    }
    if (orcamento.status !== "APROVADO") {
      res.status(422).json({ error: "ORCAMENTO_NAO_APROVADO", detalhe: `Orçamento está ${orcamento.status}` });
      return;
    }
    vendedoraDoOrcamentoId = orcamento.vendedoraId;
    const [jaVinculado] = await db.select({ id: contratosTable.id }).from(contratosTable)
      .where(eq(contratosTable.orcamentoId, contratoData.orcamentoId));
    if (jaVinculado) {
      res.status(409).json({ error: "ORCAMENTO_JA_VINCULADO", detalhe: "Orçamento já pertence a outro contrato" });
      return;
    }
    const itens = await db.select().from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.orcamentoId, contratoData.orcamentoId));

    // E115 — quando há aceite, o contrato tem de nascer do que a noiva VIU.
    // O E75 deixa editar os itens vivos depois do envio (a noiva vê a versão
    // congelada); se ela aceitou e o vivo divergiu do enviado, criar o
    // contrato pelos itens vivos faria a noiva assinar R$ 5.500 tendo aceite
    // registrado de R$ 5.000. A conferência é pelo MESMO hash do aceite
    // (`conteudoEnviado`, a régua única do congelamento).
    /**
     * C7/O5 (E163) — o gate dependia do ACEITE, não da VERSÃO congelada.
     *
     * `if (orcamento.aceiteHash)` se desligava no nulo — e o `/aprovar`
     * manual (caminho comum, oferecido pela tela) deixava o hash nulo. O A03.7
     * concluiu que hash nulo só alcançava linha legada; **o O5 corrigiu**: era
     * o caminho da aprovação à mão. A contagem C1 da Fase 0 confirmou o resto
     * (zero linhas legadas no `moscow_base`).
     *
     * O `/aprovar` agora carimba o hash da versão vigente; ESTA guarda vira o
     * cinto — orçamento COM versão congelada confere SEMPRE, mesmo que o
     * carimbo tenha faltado: a versão é o que a noiva vê, com ou sem aceite.
     */
    let hashEsperado = orcamento.aceiteHash;
    // S-O29: a lista de identidade vem da MESMA versão vigente, e é lida
    // sempre — mesmo quando o hash veio do aceite carimbado.
    const [versaoVigente] = await db
      .select({ hash: orcamentoVersoesTable.hash, itensVestidoIds: orcamentoVersoesTable.itensVestidoIds })
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, contratoData.orcamentoId))
      .orderBy(desc(orcamentoVersoesTable.numero))
      .limit(1);
    if (!hashEsperado) {
      hashEsperado = versaoVigente?.hash ?? null;
    }
    if (hashEsperado) {
      const vivo = conteudoEnviado(itens, orcamento.descontoTipo, orcamento.descontoValor);
      if (vivo.hash !== hashEsperado) {
        res.status(422).json({
          error: "ORCAMENTO_DIVERGE_DO_ACEITE",
          detalhe:
            "Os itens mudaram depois do envio que a noiva aceitou — o contrato tem de nascer do que ela viu. " +
            "Refaça os itens como estavam, ou crie e envie um novo orçamento para novo aceite.",
        });
        return;
      }
    }

    /**
     * S-O29 (A07.4) — **o hash prende o que a proposta DIZ; esta guarda prende
     * o que ela É.**
     *
     * `conteudoEnviado` congela `{tipo, descricao, valorUnitario, quantidade}`
     * e nada mais. Trocar o `vestidoId` de um item mantendo descrição e preço
     * **não move o hash** — e `contratos.ts` já registra que a mesma descrição
     * sai para noivas diferentes. A noiva prova o vestido A, aceita "Vestido
     * tomara-que-caia marfim · R$ 5.000,00", e o contrato fechava sobre o
     * vestido B: mesmo papel, outra peça.
     *
     * Pôr o `vestidoId` no hash invalidaria todo hash já gravado (o comentário
     * de `conteudoEnviado` diz isso na letra), então a identidade viaja ao
     * lado, na mesma ordem canônica.
     *
     * **`null` desliga a guarda de propósito**: é versão anterior à coluna, e
     * não se cobra de um snapshot o que ele nunca guardou. É a mesma decisão
     * que o O7/C5 tomou para `observacoes` e `validade`.
     */
    const identidadeCongelada = versaoVigente?.itensVestidoIds as (string | null)[] | null | undefined;
    if (identidadeCongelada) {
      const identidadeViva = identidadeDasPecas(itens);
      const divergiu =
        identidadeViva.length !== identidadeCongelada.length ||
        identidadeViva.some((id, i) => id !== identidadeCongelada[i]);
      if (divergiu) {
        res.status(422).json({
          error: "PECA_DIVERGE_DO_ACEITE",
          detalhe:
            "A peça mudou depois do envio que a noiva aceitou — a descrição e o valor são os mesmos, " +
            "mas não é o mesmo vestido. Ela provou outro. Devolva a peça original, ou envie um novo " +
            "orçamento para novo aceite.",
        });
        return;
      }
    }

    itensSnapshot = itens.map((it) => ({
      tipo: it.tipo,
      vestidoId: it.vestidoId,
      // E154: sem este campo no snapshot, o contrato fecha e a peça de estoque
      // some da conta — o comprometimento do dia é derivado DAQUI, e um saiote
      // vendido que não aparece na soma é pior que aviso nenhum.
      itemEstoqueId: it.itemEstoqueId,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));

    // Congela o desconto do orçamento e VALIDA o valorTotal contra os itens: o
    // líquido derivado (itens − desconto, em centavos) tem que bater exatamente
    // com o total informado. Sem isto, um total digitado errado — ou o desconto
    // que se perdia no snapshot — passava batido e virava a base de comissão,
    // parcelas e PDF, com a soma dos itens sem fechar com o total.
    descontoTipo = orcamento.descontoTipo;
    descontoValor = orcamento.descontoValor;
    const brutoC = brutoEmCentavos(itens);
    const liquidoC = liquidoEmCentavos(brutoC, orcamento.descontoTipo, orcamento.descontoValor);
    if (liquidoC !== centavos(contratoData.valorTotal)) {
      res.status(422).json({
        error: "VALOR_TOTAL_NAO_BATE",
        detalhe: `Itens menos desconto (${reais(liquidoC)}) difere do valor total (${contratoData.valorTotal})`,
        // D6/E96: o número sozinho não diz onde mexer. Depois do E95 este 422
        // deixou de ser alcançável por arredondamento, mas continua valendo
        // para total digitado à mão — e aí o campo é o endereço do conserto.
        campos: [{ campo: "valorTotal", motivo: `O orçamento fecha em ${reais(liquidoC)}` }],
      });
      return;
    }
  }

  // 4. Se houver parcelas, a soma precisa bater com o valorTotal. Em CENTAVOS
  // inteiros, com igualdade EXATA — a regra de ouro do repo. Somar os reais em
  // float e comparar com tolerância (o que estava aqui) aceita um plano com um
  // centavo de folga e recusa um plano válido por erro de ponto flutuante.
  if (parcelasInput && parcelasInput.length > 0) {
    const somaC = parcelasInput.reduce((acc, p) => acc + centavos(p.valorPrevisto), 0);
    if (somaC !== centavos(contratoData.valorTotal)) {
      res.status(422).json({
        error: "PARCELAS_NAO_BATEM",
        detalhe: `Soma das parcelas (${reais(somaC)}) difere do valor total (${contratoData.valorTotal})`,
        campos: [{ campo: "entrada", motivo: `As parcelas somam ${reais(somaC)}` }],
      });
      return;
    }
    /**
     * **E218 — o mesmo prazo do § único, na porta em que o carnê NASCE.**
     *
     * O `gerar-plano` é a outra; fechar só uma seria o meio conserto do E172, e
     * esta é a que a tela de fecho usa. A comparação é contra a `dataRetirada`
     * que ESTE pedido traz — o contrato ainda não existe, então não há linha no
     * banco de onde lê-la.
     *
     * Aqui a guarda olha TODAS as parcelas e não só a última: o carnê do
     * `gerar-plano` é gerado em ordem, e este chega digitado — nada obriga
     * quem chama a API a mandá-lo crescente.
     */
    for (const p of parcelasInput) {
      const fora = foraDoPrazoDaRetirada(p.vencimento, contratoData.dataRetirada);
      if (fora) {
        res.status(422).json({
          error: "CARNE_DEPOIS_DO_PRAZO",
          detalhe: fora.detalhe,
          campos: [
            {
              campo: "parcelas",
              motivo: `O carnê tem de vencer até ${fora.limite.split("-").reverse().join("/")}`,
            },
          ],
        });
        return;
      }
    }
  }

  // 5. Bloqueios (E72): da loja, com data coerente e sem conflito — cada um.
  // O singular legado entra na mesma lista; o vínculo vivo é o N:N.
  const bloqueioIds = [
    ...new Set([
      ...(contratoData.bloqueioVestidoId ? [contratoData.bloqueioVestidoId] : []),
      ...(contratoData.bloqueioVestidoIds ?? []),
    ]),
  ];
  // E150: os vestidos efetivamente reservados por este contrato, colhidos na
  // mesma passada que já os valida — a guarda de "peça vendida sem reserva"
  // logo abaixo compara contra esta lista.
  const vestidosReservados = new Set<string>();
  // S41: eram DOIS SELECTs por bloqueio dentro do laço — o irmão N+1 do PATCH
  // que a S35 consolidou (`:712`). Os bloqueios vêm de uma vez e os vínculos
  // ativos também; o LAÇO continua, porque a precedência dos quatro erros é
  // por bloqueio na ordem da lista, e é ela que os testes pregam. Só o
  // `verificarDisponibilidade` segue por candidato: o motor de conflito é por
  // peça e período, e consolidá-lo mudaria contagem em caminho de erro.
  // S-M24 (rodada 2, achado 6#1): o filtro que o PATCH sempre teve (`:802`) e
  // o POST não — sem `isNull(canceladoEm)`, um bloqueio SOFT-CANCELADO era
  // aceito como reserva do contrato novo: a venda nascia ATIVA segurando uma
  // reserva morta que a disponibilidade ignora, e a MESMA peça podia ser
  // prometida de novo — dois contratos ativos sobre um vestido, R$ 9.000,00
  // somados, o dobro-prometido do E107 reaberto por esta porta.
  const bloqueiosEncontrados = bloqueioIds.length > 0
    ? await db.select().from(bloqueioVestidosTable)
        .where(and(
          inArray(bloqueioVestidosTable.id, bloqueioIds),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ))
    : [];
  const bloqueioPorId = new Map(bloqueiosEncontrados.map((b) => [b.id, b]));
  /**
   * S-O56/E185 — a guarda "esta reserva é de outra noiva" lia o `lead_id`
   * PRÓPRIO, e o véu pendurado na reserva-mãe não tem um.
   *
   * `bloqueio_vestidos.lead_id` é NULLABLE e `reservas.lead_id` é NOT NULL: a
   * peça que pende da reserva da noiva B tem dona sem ter `lead_id`. A guarda
   * abaixo a lia como "sem dona — o caso legítimo e comum", deixava passar, e
   * a adoção logo adiante GRAVAVA o `lead_id` da noiva A por cima. A peça de B
   * mudava de nome no meio do contrato de A, sem uma linha de recusa.
   *
   * As mães vêm de UMA consulta pelos ids em cena, não de uma por bloqueio —
   * a mesma conta do `MAE_DO_BLOQUEIO` das rotas que leem pelo `with`.
   */
  const maeIds = [...new Set(bloqueiosEncontrados.map((b) => b.reservaId).filter((r): r is string => !!r))];
  const donaDaMae = new Map(
    (maeIds.length > 0
      ? await db
          .select({ id: reservasTable.id, leadId: reservasTable.leadId })
          .from(reservasTable)
          .where(inArray(reservasTable.id, maeIds))
      : []
    ).map((r) => [r.id, r.leadId]),
  );
  const donoDoBloqueio = (b: { leadId: string | null; reservaId: string | null }): string | null =>
    comDono(b, b.reservaId ? donaDaMae.get(b.reservaId) ?? null : null).donoLeadId;
  const presosPorContratoAtivo = new Set(
    (bloqueioIds.length > 0
      ? await db
          .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
          .from(contratoBloqueiosTable)
          .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
          .where(and(
            inArray(contratoBloqueiosTable.bloqueioId, bloqueioIds),
            eq(contratosTable.status, "ATIVO"),
          ))
      : []
    ).map((p) => p.bloqueioId),
  );
  for (const bloqueioId of bloqueioIds) {
    const bloqueio = bloqueioPorId.get(bloqueioId);
    if (!bloqueio) {
      // S-D8/E122: era `{ error: "Bloqueio not found" }` — inglês, sem código
      // nem detalhe, no clique que fecha a venda. A régua da casa é
      // código + `detalhe` em português (a frase que o toast mostra).
      res.status(404).json({
        error: "RESERVA_NAO_ENCONTRADA",
        detalhe: "A reserva de vestido indicada não existe nesta loja.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "Reserva não encontrada nesta loja" }],
      });
      return;
    }
    /**
     * S2/E107 — a reserva tem de ser DESTA noiva.
     *
     * A conferência acima prova a LOJA e parava aí: um contrato da noiva A
     * podia prender o `bloqueio_vestido` da noiva B da mesma loja, e o vestido
     * que B provou e reservou passava a responder pelo contrato de A. Não é
     * vazamento entre lojas — por isso ficou fora do E91 —, mas é a mesma
     * família: **um id entrou sem prova de a quem pertence.**
     *
     * SEM DONA é o caso legítimo e comum: a reserva nasceu sem dona (a loja
     * segurou a peça antes de saber de quem seria) e este contrato é justamente
     * quem lhe dá dono. Só o vínculo com OUTRA noiva é recusado.
     *
     * S-O56/E185 — e "sem dona" passou a ser `donoDoBloqueio`, não
     * `bloqueio.leadId`. O véu pendurado na reserva-mãe da noiva B tem dona sem
     * ter `lead_id` próprio: a leitura antiga o aceitava como sem dona, a
     * adoção logo abaixo gravava o `lead_id` da noiva A e a peça de B trocava
     * de nome dentro do contrato de outra.
     *
     * S-D12/E145 — o código era `REFERENCIA_INVALIDA`, o mesmo que o
     * dicionário da tela de orçamento traduz como "Essa noiva não é desta
     * loja." — a tradução genérica sombreava este `detalhe`, que é a frase
     * certa. Código próprio, SEM entrada no dicionário: a régua do
     * `mensagemApi` mostra o `detalhe` do servidor.
     */
    if (donoDoBloqueio(bloqueio) !== null && donoDoBloqueio(bloqueio) !== contratoData.leadId) {
      res.status(422).json({
        error: "RESERVA_DE_OUTRA_NOIVA",
        detalhe: "Esta reserva de vestido é de outra noiva — escolha uma reserva desta noiva ou uma sem dona.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva pertence a outra noiva" }],
      });
      return;
    }
    /**
     * E107 fechou a metade fácil e deixou a outra aberta: a guarda acima só
     * morde quando o bloqueio JÁ tem dona, e **nenhuma rota escrevia
     * `bloqueio.lead_id`** — o campo nascia nulo e continuava nulo, e em 2026-07
     * o descoberto era o caso comum: 61 das 63 avarias do dev viviam assim.
     *
     * **S-C10 (13/08/2026) — o número foi remedido e não sustenta mais o
     * "comum".** As 63 avarias eram vazamento do spec 48, varrido em `3b71a43`;
     * hoje são **ZERO avarias** nos dois bancos, e o bloqueio sem dona é **0 de
     * 116 em `moscow_base`, 2 de 127 no dev**. O 409 abaixo NÃO perde a razão de
     * ser: ele prova o VÍNCULO, não a dona, e o vínculo é o que impede a mesma
     * peça de ir para dois contratos — isso independe de quantos nascem nulos.
     * A conta está em `lib/dono-do-bloqueio.ts`.
     *
     * O que passava: contrato da noiva A prende o bloqueio B (leadId nulo,
     * `ignorarBloqueioId` faz B não conflitar consigo mesmo); dias depois, o
     * contrato da noiva C — com `dataCasamento` nulo, que pula a conferência
     * de data — prende o MESMO B. A PK de `contrato_bloqueios` é
     * (contratoId, bloqueioId) e não impede o segundo par. O vestido ficava
     * prometido a duas noivas para a mesma data, o portal das duas desenhava
     * "O seu vestido" com a mesma peça, e a loja só descobria na retirada.
     *
     * A prova que faltava é sobre o VÍNCULO, não sobre a dona: uma reserva é
     * de no máximo um contrato ATIVO. Contrato cancelado não conta — ele
     * libera a peça (soft-cancel do bloqueio) e a reserva volta ao mercado.
     */
    if (presosPorContratoAtivo.has(bloqueioId)) {
      res.status(409).json({
        error: "RESERVA_JA_CONTRATADA",
        detalhe: "Esta reserva de vestido já está presa por outro contrato ativo.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva já é de outro contrato" }],
      });
      return;
    }
    /**
     * K4 (E163, decisão D2) — MANUTENCAO não é reserva de casamento.
     *
     * `vestidosReservados` aceitava bloqueio de QUALQUER tipo, e MANUTENCAO
     * nasce sem `casamentoData` — o que desligava sozinha a guarda de data
     * logo abaixo. **Medido:** venda de R$ 4.000,00 satisfeita por uma janela
     * de manutenção de 01/03–05/03, e outra de R$ 4.000,00 com reserva
     * legítima de 10/05 que não conflita com março — dois contratos,
     * R$ 8.000,00, o MESMO vestido no mesmo sábado: o dobro-prometido que o
     * E150 existe para impedir, entrando por outra porta.
     *
     * A decisão da dona (D2): o gate exige `tipo = RESERVA_CASAMENTO`. Se um
     * dia existir caso legítimo de vender peça segurada por manutenção, ele
     * vira campo explícito — não um furo.
     */
    if (bloqueio.tipo !== "RESERVA_CASAMENTO") {
      res.status(422).json({
        error: "BLOQUEIO_NAO_E_RESERVA",
        detalhe:
          "Uma janela de manutenção não segura a peça para a noiva — crie uma reserva de casamento para vendê-la.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "O bloqueio é de manutenção, não de reserva" }],
      });
      return;
    }
    if (
      contratoData.dataCasamento &&
      bloqueio.casamentoData &&
      // S-O117: as DUAS são data de negócio. Lidas em fuso da loja, um lado
      // ancorado ao meio-dia (o que a tela manda) e o outro cru (o que um
      // cliente de API manda) davam dias diferentes para o MESMO dia, e a
      // guarda recusava o contrato com "a data não bate com a da reserva".
      diaDeNegocio(contratoData.dataCasamento) !== diaDeNegocio(bloqueio.casamentoData)
    ) {
      // S-D8/E122: a FRASE morava no campo do CÓDIGO — `mensagemApi` mapeia
      // por código e o cru chegava à vendedora. Agora há código, e o detalhe
      // diz as duas datas em jeito de gente.
      const ddmmaaaa = (ymd: string) => ymd.split("-").reverse().join("/");
      const dataReserva = ddmmaaaa(diaDeNegocio(bloqueio.casamentoData));
      res.status(422).json({
        error: "DATA_DIVERGE_DA_RESERVA",
        detalhe:
          `A data do casamento no contrato (${ddmmaaaa(diaDeNegocio(contratoData.dataCasamento))}) ` +
          `não bate com a da reserva do vestido (${dataReserva}). Ajuste a data ou a reserva.`,
        campos: [
          { campo: "dataCasamento", motivo: `A reserva do vestido é para ${dataReserva}` },
        ],
      });
      return;
    }
    const resultado = await verificarDisponibilidade({
      lojaId,
      vestidoId: bloqueio.vestidoId,
      candidato: bloqueio,
      ignorarBloqueioId: bloqueio.id,
      hoje: new Date(),
    });
    if (!resultado.disponivel) {
      // K10/E162: era o ÚNICO erro do arquivo sem `detalhe` — nenhum consumidor
      // traduzia o código, e a vendedora lia "Tente novamente" com a noiva na
      // frente: uma frase que manda repetir o gesto que vai falhar sempre. O
      // payload `conflitos` segue, e o diálogo do E162 é o primeiro leitor.
      res.status(409).json({
        error: "VESTIDO_INDISPONIVEL",
        detalhe:
          "Uma das peças reservadas ficou indisponível no período — confira os conflitos e ajuste a reserva ou a data antes de fechar.",
        conflitos: resultado.conflitos,
      });
      return;
    }
    vestidosReservados.add(bloqueio.vestidoId);
  }

  /**
   * E150 — o contrato não vende peça que não reservou.
   *
   * Até aqui, `itensSnapshot` (o que foi VENDIDO) e `bloqueioIds` (o que foi
   * fisicamente RESERVADO) chegavam de fontes independentes: os itens vêm do
   * orçamento, a lista de bloqueios vem do corpo da requisição. Nada obrigava
   * as duas a falarem da mesma peça — e o schema declara a descrição em texto
   * como registro autoritativo (`contratos.ts:66-69`), então um item apontando
   * `vestidoId` sem reserva correspondente fechava com 201 e deixava a peça
   * livre para a próxima noiva do mesmo sábado.
   *
   * O caderno do ateliê mostra o caso real: `Bolero Ricca Sposa` sai em duas
   * semanas distintas, para noivas diferentes. É peça, e peça se reserva.
   *
   * Só VESTIDO e ACESSORIO entram na regra: SERVICO e AJUSTE não são peça
   * física e não têm `vestidoId`. E a guarda só morde quando o item JÁ aponta
   * uma peça — item de descrição livre segue passando, porque exigir reserva
   * de algo que não está no acervo seria travar a venda por uma frase.
   *
   * A tela não é afetada: `orcamentos/[id].tsx:638-641` já manda todas as
   * reservas da noiva não desmarcadas. Quem passa a ser recusado é o contrato
   * montado fora dela — que é onde o defeito vivia.
   */
  const pecasVendidas = itensSnapshot.filter(
    (it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId,
  );
  if (pecasVendidas.length > 0) {
    const semReserva = pecasVendidas.filter((it) => !vestidosReservados.has(it.vestidoId!));
    if (semReserva.length > 0) {
      // A01.4/E162: a frase dizia o RISCO e parava — a única do arquivo sem o
      // gesto, comparada com as vizinhas ("Ajuste a data ou a reserva",
      // "escolha uma reserva desta noiva"). Agora ela aponta o caminho que o
      // E162 abriu: reservar de dentro do próprio diálogo.
      res.status(422).json({
        error: "ITEM_SEM_RESERVA",
        detalhe:
          "O contrato vende uma peça que não está reservada — ela pode sair para outra noiva no mesmo fim de semana. " +
          "Reserve pelo bloco «Peças do acervo» do próprio diálogo, sem sair dele.",
        campos: semReserva.map((it) => ({
          campo: "itens",
          motivo: `«${it.descricao}» não tem reserva neste contrato`,
        })),
      });
      return;
    }
  }

  // E120/S-D4 — a venda trocou de dona em relação ao orçamento. Os nomes são
  // lidos antes da transação (leitura pura) para a linha da trilha dizer
  // quem→quem sem garimpo de id; a ESCRITA do rastro fica dentro dela.
  /**
   * S-D29 — o rastro do E120 tinha porta dos fundos, e ela era a porta larga.
   *
   * `vendedoraDoOrcamentoId` só é lido dentro do `if (contratoData.orcamentoId)`
   * lá em cima, e `orcamentoId` NÃO é obrigatório no `ContratoInput`. Resultado:
   * contrato SEM orçamento atribuía a venda — e a comissão que ela soma por
   * `contratos.vendedora_id` — a qualquer colega da loja com zero linhas de
   * trilha. O E120 fechou a porta da frente e a S-D4 foi registrada como se
   * fechasse as duas.
   *
   * A referência é a melhor que existir: quando há orçamento, quem o MONTOU
   * (é a dona anterior da venda, e continua sendo a comparação mais forte);
   * sem orçamento, quem está CRIANDO o contrato, que é a única outra pessoa
   * que o sistema sabe ligar a este ato. Nos dois casos a pergunta é a mesma —
   * a venda está sendo posta no nome de outra pessoa?
   */
  const referenciaVendedoraId = vendedoraDoOrcamentoId ?? req.usuario!.id;
  const referenciaOrigem = vendedoraDoOrcamentoId ? "ORCAMENTO" : "SESSAO";
  const vendedoraDivergente = referenciaVendedoraId !== contratoData.vendedoraId;
  let nomesDivergencia: Record<string, string> = {};
  if (vendedoraDivergente) {
    const pessoas = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome })
      .from(usuariosTable)
      .where(inArray(usuariosTable.id, [referenciaVendedoraId, contratoData.vendedoraId]));
    nomesDivergencia = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));
  }

  // Persistência atômica: contrato + parcelas + snapshot de itens.
  const result = await db.transaction(async (tx) => {
    /**
     * E158 — A ORDEM DAS TRANCAS DO MÓDULO, escrita uma vez:
     *
     *     lead → contrato → parcelas → bloqueios
     *
     * Não é preferência: é o que impede deadlock. O cancelamento tranca a
     * linha do lead ANTES dos bloqueios pelo mesmo motivo — sem a ordem
     * comum, este POST (segurando o lead, esperando o bloqueio) e um
     * cancelamento simultâneo (segurando o bloqueio, esperando o lead) se
     * matariam em ciclo. Toda porta nova deste arquivo obedece a ordem.
     */

    /**
     * K3/A08.1 — o contrato ativo duplicado, relido SOB TRANCA.
     *
     * A guarda de `:184` lê no pool, fora desta transação: duas vendedoras no
     * mesmo segundo liam as duas "esta noiva não tem contrato ativo" e as duas
     * inseriam. **Medido:** dois contratos ATIVOS de R$ 5.000,00 para a mesma
     * noiva — a ficha somando R$ 10.000,00 a receber sobre uma venda de
     * R$ 5.000,00, com a comissão fechando sobre o dobro.
     *
     * A linha do LEAD é a tranca certa porque é ela que o invariante nomeia
     * ("um lead, um contrato ativo") — e é uma linha que sempre existe, mesmo
     * quando não há contrato nenhum para trancar. O índice parcial
     * `contratos_lead_ativo_unico` fecha por baixo o que esta releitura fecha
     * por cima.
     */
    await tx.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.id, contratoData.leadId), eq(leadsTable.lojaId, lojaId)))
      .for("update");
    const [ativoAgora] = await tx.select({ id: contratosTable.id }).from(contratosTable)
      .where(and(
        eq(contratosTable.leadId, contratoData.leadId),
        eq(contratosTable.lojaId, lojaId),
        eq(contratosTable.status, "ATIVO"),
      ));
    if (ativoAgora) return { duplicado: true as const };

    /**
     * S-M7 — a guarda de reserva exclusiva, relida SOB TRANCA.
     *
     * `presosPorContratoAtivo` é lido lá em cima no pool global, fora desta
     * transação — e em READ COMMITTED duas vendedoras no mesmo segundo liam
     * as duas "livre" e a PK de `contrato_bloqueios` (contratoId, bloqueioId)
     * aceitava os dois pares: o mesmo vestido prometido a duas noivas, o caso
     * exato que o comentário do E107 descreve, reaberto pela janela entre a
     * leitura e a escrita. A guarda de cima FICA — ela dá os quatro erros na
     * ordem que os testes pregam, sem custo de transação para o caminho
     * errado; o que muda é que ela deixou de ser a última palavra.
     *
     * A forma é a do DELETE /admin/lojas (S33): `FOR UPDATE` na linha-pai —
     * o INSERT do vínculo do concorrente precisa de `FOR KEY SHARE` nela, que
     * conflita — e a reconferência como statement NOVO, que em READ COMMITTED
     * enxerga o que o vencedor commitou. A tranca vai em ordem ORDENADA:
     * dois contratos prendendo as mesmas peças em ordens diferentes se
     * serializariam num deadlock em vez de numa fila.
     */
    if (bloqueioIds.length > 0) {
      for (const bloqueioId of [...bloqueioIds].sort()) {
        await tx.select({ id: bloqueioVestidosTable.id })
          .from(bloqueioVestidosTable)
          .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)))
          .for("update");
      }
      /**
       * K2 — a reconferência relia MENOS do que a guarda lenta provou.
       *
       * Ela devolvia só `id` e refazia só a prova de `presosPorContratoAtivo`,
       * deixando `canceladoEm` de fora — e é justamente o campo que muda na
       * janela: o cancelamento de OUTRO contrato soft-cancela o bloqueio
       * (`:993`) no mesmo segundo. **Medido:** o contrato nasce preso a uma
       * reserva morta; `verificarDisponibilidade` ignora bloqueio cancelado e
       * a EXCLUDE também, então o mesmo vestido é vendido de novo para o mesmo
       * sábado — R$ 9.000,00 prometidos sobre uma peça, descobertos na
       * retirada. É o defeito que o comentário de `:317-322` declara fechado
       * no caminho lento, reaberto pela janela.
       *
       * A releitura agora é a MESMA consulta da guarda lenta (`:323-330`):
       * mesma loja, mesmo `isNull(canceladoEm)`. Se algum bloqueio deixou de
       * responder a ela, a reserva morreu enquanto líamos.
       */
      const vivosAgora = await tx.select({ id: bloqueioVestidosTable.id })
        .from(bloqueioVestidosTable)
        .where(and(
          inArray(bloqueioVestidosTable.id, bloqueioIds),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));
      if (vivosAgora.length !== bloqueioIds.length) return { reservaMorreu: true as const };

      const presosAgora = await tx
        .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
        .from(contratoBloqueiosTable)
        .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
        .where(and(
          inArray(contratoBloqueiosTable.bloqueioId, bloqueioIds),
          eq(contratosTable.status, "ATIVO"),
        ));
      if (presosAgora.length > 0) return { corrida: true as const };
    }

    const [contrato] = await tx.insert(contratosTable).values({
      id: randomUUID(),
      lojaId,
      leadId: contratoData.leadId,
      orcamentoId: contratoData.orcamentoId ?? null,
      bloqueioVestidoId: contratoData.bloqueioVestidoId ?? null,
      vendedoraId: contratoData.vendedoraId,
      // E215 — a qualificação CONGELA aqui, vinda da ficha conferida acima. O
      // `cpf` do corpo deixou de ser lido: era a segunda grafia do mesmo dado,
      // e das duas só a ficha é editável depois.
      ...congelarQualificacao(lead),
      vestidoDescricao: contratoData.vestidoDescricao ?? null,
      valorTotal: contratoData.valorTotal,
      descontoTipo,
      descontoValor,
      formaPagamento: contratoData.formaPagamento ?? null,
      // S-O117: a data que o contrato CONGELA é dia de negócio — é ela que o
      // PDF imprime e que a guarda acima compara com a da reserva.
      dataCasamento: contratoData.dataCasamento
        ? reancorarDataDeNegocio(contratoData.dataCasamento)
        : null,
      dataRetirada: contratoData.dataRetirada ?? null,
      dataDevolucao: contratoData.dataDevolucao ?? null,
      // D3/E217 — cláusula 18ª: negociado a cada contrato, como a data e o
      // valor. `null` é "não pactuado", e é o default — o sistema não inventa
      // prazo que ninguém acordou.
      prazoDevolucaoReservaDias: contratoData.prazoDevolucaoReservaDias ?? null,
      observacoes: contratoData.observacoes ?? null,
      fechadoEm: new Date(),
    }).returning();

    if (parcelasInput && parcelasInput.length > 0) {
      await tx.insert(parcelasTable).values(
        parcelasInput.map((p) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          numero: p.numero,
          /**
           * S-M3 — estas parcelas SÃO o carnê, e nasciam rotuladas `AVULSA`.
           *
           * O campo não era passado e a coluna default é `AVULSA`
           * (`schema/financeiro.ts:28`), que é o rótulo certo para "linha
           * inserida por quem não pensou no assunto" — só que aqui alguém
           * pensou: a guarda do `:287` exige que a soma bata com o `valorTotal`
           * EXATO, o que é a definição do carnê, e a tela manda o próprio
           * `montarPlanoParcelas` (`orcamentos/[id].tsx:672`), entrada em
           * `numero 0` inclusive.
           *
           * O estrago é no `jaTemCarne` do `gerar-plano` (`:1275`), que
           * pergunta `origem === "PLANO"`: ele nunca via este carnê, então
           * aceitava montar OUTRO por cima. Uma venda de R$ 5.000,00 ficava com
           * R$ 10.000,00 em parcelas, e o deslocamento do S26 — feito para tirar
           * um reparo avulso da frente — empurrava a entrada verdadeira para
           * fora do `numero 0`, que significa ENTRADA em seis pontos do sistema.
           */
          origem: "PLANO" as const,
          descricao: p.descricao ?? `Parcela ${p.numero}`,
          valorPrevisto: p.valorPrevisto,
          vencimento: p.vencimento,
          status: "PREVISTA" as const,
        }))
      );
    }

    if (itensSnapshot.length > 0) {
      await tx.insert(contratoItensTable).values(
        itensSnapshot.map((it) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          ...it,
        }))
      );
    }

    // E72: o vínculo vivo — todas as reservas físicas presas pelo contrato.
    if (bloqueioIds.length > 0) {
      await tx.insert(contratoBloqueiosTable).values(
        bloqueioIds.map((bloqueioId) => ({ contratoId: contrato.id, bloqueioId })),
      );
      // E o contrato DÁ DONO à reserva que não tinha — o que o comentário da
      // guarda S2/E107 já afirmava ("este contrato é justamente quem lhe dá
      // dono") e nenhuma linha fazia. Sem isto, `bloqueio.lead_id` seguia nulo
      // para sempre e a guarda de noiva nunca tinha o que comparar: nem aqui,
      // nem em `POST /avarias/:id/cobrar`, que depende do mesmo campo para
      // mandar o reparo ao carnê certo. Só as sem dona são tocadas — as com
      // dona já foram recusadas acima.
      await tx.update(bloqueioVestidosTable)
        .set({ leadId: contratoData.leadId, updatedAt: new Date() })
        .where(and(
          inArray(bloqueioVestidosTable.id, bloqueioIds),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.leadId),
        ));
    }

    /**
     * E120/S-D4 — o contrato nasceu de um orçamento e a vendedora TROCOU.
     *
     * O servidor aceita de propósito (P1: a dona fecha de manhã a venda que a
     * Ana montou ontem — travar quebraria o caso real), mas a comissão é
     * somada por `contratos.vendedora_id`: num contrato de R$ 4.200,00 a 5%
     * são R$ 210,00 trocando de bolso, e sem esta linha a troca era muda —
     * inclusive por curl, sem tela nenhuma. Quem clicou segue vindo da
     * sessão; o que se grava aqui é a divergência entre as DONAS da venda.
     */
    if (vendedoraDivergente) {
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "CONTRATO_VENDEDORA_DIVERGENTE",
        entidade: "contrato",
        entidadeId: contrato.id,
        detalhe: {
          orcamentoId: contratoData.orcamentoId ?? null,
          // S-D29: a linha diz CONTRA O QUE se comparou. Sem isso, quem lê a
          // trilha não sabe se "de Ana para Bia" quer dizer que Ana montou o
          // orçamento ou que Ana registrou o contrato — são atos diferentes.
          referenciaOrigem,
          vendedoraDaReferenciaId: referenciaVendedoraId,
          vendedoraDoContratoId: contratoData.vendedoraId,
          valorTotal: contratoData.valorTotal,
          descricao:
            referenciaOrigem === "ORCAMENTO"
              ? `Orçamento de ${nomesDivergencia[referenciaVendedoraId] ?? referenciaVendedoraId} · contrato em nome de ${nomesDivergencia[contratoData.vendedoraId] ?? contratoData.vendedoraId}`
              : `Registrado por ${nomesDivergencia[referenciaVendedoraId] ?? referenciaVendedoraId} · contrato em nome de ${nomesDivergencia[contratoData.vendedoraId] ?? contratoData.vendedoraId}`,
        },
      });
    }

    /**
     * Fechar contrato avança o funil do lead (nunca regride) — e carimba a
     * data, que é coisa diferente (S16).
     *
     * O carimbo morava DENTRO do `if (etapaNova !== lead.etapa)`, então ele era
     * efeito do avanço e não do contrato. Quem já estava adiante no funil não
     * avançava — `avancarEtapaLead` devolve a mesma etapa — e ficava sem
     * carimbo para sempre. O funil aceita pular (`transicaoLeadValida` só exige
     * `iPara > iDe`), então "a noiva já está EM_PROVAS quando o contrato é
     * registrado" é um caminho normal, não um estado corrompido. E `PERDIDO`
     * cai no mesmo buraco por outra porta: `avancarEtapaLead` não mexe em quem
     * está fora do funil.
     *
     * A outra porta é o PATCH de `/leads`: o `carimboEtapa` de `leads.ts:45`
     * só carimba quando a etapa é `CONTRATO_FECHADO` exatamente. As duas
     * conspiravam — nenhuma das duas cobria pular a etapa.
     *
     * Quem lê a coluna é o `comContrato` de `/leads/sazonalidade`
     * (`leads.ts:451`), que filtra por `is not null`: a noiva sem carimbo não
     * é contada como "já fechou" na curva que diz quando falta vestido.
     */
    /**
     * S-M24 (rodada 2, achado 6#5): `avancarEtapaLead` não mexe em quem está
     * fora do funil — e um lead PERDIDO que fecha contrato SEGUIA perdido. A
     * conversão contava a venda como perda, e a noiva entrava na janela do
     * expurgo LGPD com contrato ATIVO: o whatsapp da cobrança dos R$ 3.000,00
     * restantes era anonimizado. Vender para quem voltou É reviver: a etapa
     * vira CONTRATO_FECHADO e os carimbos de perda são limpos — a história da
     * perda continua na trilha de auditoria, que é onde história mora.
     */
    const voltouDoPerdido = lead.etapa === "PERDIDO";
    const etapaNova = voltouDoPerdido
      ? ("CONTRATO_FECHADO" as const)
      : avancarEtapaLead(lead.etapa, "CONTRATO_FECHADO");
    if (etapaNova !== lead.etapa || !lead.contratoFechadoEm) {
      await tx.update(leadsTable)
        .set({
          etapa: etapaNova,
          contratoFechadoEm: lead.contratoFechadoEm ?? new Date(),
          ...(voltouDoPerdido
            ? { perdidaEm: null, perdidaMotivo: null, perdidaDetalhe: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(leadsTable.id, lead.id));
    }

    return { contrato };
  });

  // K3: perder a corrida do contrato duplicado dá o MESMO 409 da guarda de
  // `:184` — para a vendedora não existe diferença entre perder por um segundo
  // e por um dia. Esta é a régua do módulo inteiro para corrida perdida.
  if ("duplicado" in result) {
    res.status(409).json({ error: "CONTRATO_ATIVO_DUPLICADO", detalhe: "Este lead já possui um contrato ativo" });
    return;
  }

  // K2: a reserva foi cancelada enquanto montávamos o contrato — quase sempre
  // porque o contrato que a segurava caiu no mesmo segundo. A peça está livre,
  // mas ESTA reserva não existe mais: a vendedora precisa reservar de novo, e a
  // frase diz isso em vez de mandar "tentar de novo" o gesto que vai falhar.
  if ("reservaMorreu" in result) {
    res.status(409).json({
      error: "RESERVA_CANCELADA",
      detalhe: "Esta reserva de vestido foi cancelada enquanto o contrato era montado — reserve a peça de novo.",
      campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva foi cancelada" }],
    });
    return;
  }

  // S-M7: quem perde a corrida recebe o MESMO 409 da guarda lenta — para a
  // vendedora não existe diferença entre perder por um segundo e por um dia.
  if ("corrida" in result) {
    res.status(409).json({
      error: "RESERVA_JA_CONTRATADA",
      detalhe: "Esta reserva de vestido já está presa por outro contrato ativo.",
      campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva já é de outro contrato" }],
    });
    return;
  }

  const fullContrato = await db.query.contratosTable.findFirst({
    where: eq(contratosTable.id, result.contrato.id),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });

  // S-C89: o contrato novo adota bloqueios — a órfã da fila vira item.
  derrubarFilaDeAtrasos(lojaId);
  res.status(201).json(CreateContratoResponse.parse(fullContrato));
});

/**
 * **S-C140 — a rescisão se lê ANTES do clique.**
 *
 * O E217 pôs a conta das cláusulas 8ª §2º/11ª/12ª/13ª/18ª no servidor, e ela só
 * nascia na RESPOSTA do `POST /cancelar`: não havia como ler antes do gesto o
 * que só existe depois dele. O diálogo "Cancelar contrato" seguia com a escolha
 * de antes — *"A noiva perdeu o sinal"* × *"Devolvi o valor — estorna tudo"* —,
 * e a segunda opção devolve **100% do que entrou**, contra a 8ª §2º, que diz
 * que a reserva não volta **sob qualquer hipótese**. Medido em `heliumdb`:
 * **428 contratos CANCELADOS** já passaram por esse diálogo, contra 311 ATIVOS.
 *
 * **Recalcular na tela não era opção**, e é o que a sobra não dizia:
 * `ItemDaRescisao` exige `exclusivaDePrimeiroAluguel` (12ª) e `ContratoItem`
 * não o carrega — a exclusividade é `vestidos.exclusiva` (a MARCA, E216)
 * cruzada com a contagem de saídas ATIVAS (o ESTADO). O front adivinharia
 * justamente a metade cara: a peça exclusiva retém o aluguel INTEIRO.
 *
 * Então o servidor **diz** o que usou, no formato da S-C47. E o custo tinha de
 * ficar igual: o handler fazia **2 queries** (a relacional e a dos vínculos do
 * E72) e continua fazendo **2**. As duas metades da 12ª entram na consulta que
 * já existia — a marca por `with: { vestido }`, a contagem por `extras`
 * correlacionado —, e a consulta relacional do drizzle continua sendo **uma
 * sentença SQL**. `sc140-rescisao-no-get-api.test.ts` prega o número.
 *
 * **A contagem exclui ESTE contrato**, e é a única diferença em relação ao
 * `POST /cancelar`: lá o `UPDATE` para `CANCELADO` já tinha rodado quando a
 * contagem é feita, e a exclusão saía de graça. Aqui o contrato ainda é ATIVO —
 * sem o `<>`, nenhuma peça estaria jamais em primeiro aluguel no exato momento
 * em que a cláusula precisa dela, que é o aviso escrito em `exclusividade.ts`.
 */
const locacoesAtivasDaPeca = (lojaId: string, contratoId: string) =>
  sql<number>`(
    select count(*)::int
      from ${contratoItensTable} as ci_outros
      join ${contratosTable} as c_outros on c_outros.id = ci_outros.contrato_id
     where ci_outros.vestido_id = ${contratoItensTable.vestidoId}
       and ci_outros.loja_id = ${lojaId}
       and c_outros.status = 'ATIVO'
       and c_outros.id <> ${contratoId}
  )`;

router.get("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: {
      lead: true,
      vendedora: true,
      parcelas: true,
      itens: {
        // As duas metades do predicado da 12ª, na consulta que já existia.
        // Nenhuma das duas atravessa a borda do `ContratoItem` do spec — o zod
        // as descarta ao serializar; elas existem para a conta, não para a tela.
        with: { vestido: { columns: { id: true, exclusiva: true } } },
        extras: { locacoesAnteriores: locacoesAtivasDaPeca(lojaId, contratoId).as("locacoes_anteriores") },
      },
    },
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  // E72: as reservas físicas presas por este contrato.
  const vinculos = await db
    .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
    .from(contratoBloqueiosTable)
    .where(eq(contratoBloqueiosTable.contratoId, contratoId));

  /**
   * A rescisão é da noiva que **ainda pode** rescindir: contrato CANCELADO é
   * registro morto (a mesma régua do `PATCH`), e o que ele reteve já está na
   * trilha (`CONTRATO_CANCELADO`, com `rescisaoDevolucaoTotal`) e na
   * `contas_pagar` da 13ª §3º. Recalcular hoje o que foi decidido em outro dia
   * daria um número novo para um fato antigo.
   *
   * `hoje` é INJETADO — a régua desta trilha desde o E211. A conta é DERIVADA:
   * a 18ª depende de quantos dias faltam para a retirada, e ela muda de resposta
   * à meia-noite. Gravá-la estaria errado a partir do dia seguinte.
   */
  const parcelasPlano = contrato.parcelas.filter((p) => p.origem === "PLANO");
  const rescisao =
    contrato.status === "ATIVO"
      ? calcularRescisao({
          // A tela pergunta pela rescisão da NOIVA — é ela quem lê o aviso antes
          // de a vendedora clicar. A da loja (13ª) devolve tudo e não precisa
          // de aviso: ninguém é surpreendido por receber de volta.
          iniciativa: "LOCATARIA",
          itens: contrato.itens.map((it) => ({
            descricao: it.descricao,
            valor: reais(centavos(it.valorUnitario) * it.quantidade),
            exclusivaDePrimeiroAluguel: it.vestidoId
              ? ehExclusivaDePrimeiroAluguel({ exclusiva: it.vestido?.exclusiva ?? false }, it.locacoesAnteriores ?? 0)
              : false,
          })),
          valorTotalContrato: contrato.valorTotal,
          totalPagoPlano: reais(parcelasPlano.reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0)),
          reservaPaga: reais(centavos(parcelasPlano.find((p) => p.numero === 0)?.valorRecebido ?? 0)),
          prazoDevolucaoReservaDias: contrato.prazoDevolucaoReservaDias,
          dataRetirada: contrato.dataRetirada,
          hoje: new Date(),
        })
      : null;

  /**
   * Os campos escritos por EXTENSO, e dentro de um `return`, pela mesma razão
   * do `POST /cancelar` (E217) e do `mora: moraDe(p)` do E213: a
   * `varredura-schemas-aninhados` lê TEXTO e não atravessa import de outro
   * pacote — `calcularRescisao` mora no `financeiro-core`.
   *
   * **E o `return` não é estilo: é o que a régua enxerga.** Escrito como
   * `rescisao: rescisao ? { linhas: … } : null` direto no `res.json`, a
   * varredura media `Rescisao.linhas` como **não entregue** (`expected [ …(16) ]
   * to deeply equal [ …(15) ]`, com `Rescisao.linhas` a mais na lista de
   * entrega desigual): o motor só desce para as chaves de um literal cujo
   * valor COMEÇA em `{`, e o do ternário começa no nome da variável. Este é o
   * segundo épico em que a régua do E192 cobra a FORMA da escrita, e o
   * primeiro foi o E213.
   */
  function rescisaoNoPayload() {
    if (!rescisao) return null;
    return {
      linhas: rescisao.linhas,
      devolucaoTotal: rescisao.devolucaoTotal,
      retencaoTotal: rescisao.retencaoTotal,
      aplicou18a: rescisao.aplicou18a,
      explicacao: rescisao.explicacao,
    };
  }

  res.json(
    GetContratoResponse.parse({
      ...contrato,
      /**
       * **S-C190 — o carnê é a QUARTA porta que devolve parcela, e era a única
       * que não passava pela conta da 9ª.**
       *
       * A nota do `lib/mora-da-parcela.ts` nomeia quatro leituras que mostram o
       * mesmo número — a fila de cobrança, **o carnê do contrato**, o extrato do
       * portal e a resposta do recebimento — e treze épicos depois só três
       * escreviam `mora: moraDe(p)`. Aqui as parcelas vinham cruas do
       * `with: { parcelas: true }` e eram espalhadas pelo `...contrato` acima;
       * `Parcela.mora` é `optional` no spec, então nada reprovava.
       *
       * O custo era da Vendedora, que tem `financeiro: NADA` e por isso não
       * abre a fila de cobrança: **esta é a única tela de dinheiro dela**, e
       * numa parcela de R$ 500,00 vencida há 30 dias ela lia R$ 500,00 enquanto
       * a noiva lia R$ 515,00 no portal e a porta de receber aceitava R$ 515,00.
       * É o **E213 invertido** — lá a porta recusava o que as leituras
       * mostravam; aqui a leitura escondia o que a porta aceita.
       *
       * Escrito por extenso e não num `.map(comMora)` pela razão declarada no
       * fim daquele módulo: a `varredura-schemas-aninhados` lê TEXTO e não
       * atravessa import, e com o helper a aresta `Parcela.mora` voltaria a
       * aparecer como promessa que ninguém entrega.
       */
      parcelas: contrato.parcelas.map((p) => ({ ...p, mora: moraDe(p) })),
      bloqueioVestidoIds: vinculos.map((v) => v.bloqueioId),
      rescisao: rescisaoNoPayload(),
    }),
  );
});

// PDF do contrato. Escopado por loja (contrato de outra loja → 404) e gerado na
// hora a partir do estado atual — nada é persistido.
router.get("/lojas/:lojaId/contratos/:contratoId/pdf", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { loja: true, lead: true, parcelas: true, itens: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }

  // E100/F21: a montagem do papel saiu daqui e virou régua — o portal serve o
  // MESMO documento pelo token da noiva. O escopo (a loja da URL) fica na rota.
  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="${nomeDoArquivo(contrato)}"`);
  res.send(Buffer.from(pdfDoContrato(contrato)));
});

/**
 * E221 — os recibos da cláusula 7ª, do lado da loja.
 *
 * > **CLÁUSULA 7ª** — A LOCADORA deverá fornecer **todos os recibos de
 * > pagamentos efetuados pelo LOCATÁRIO.**
 *
 * Um recibo por RECEBIMENTO, e não por parcela — a leitura da cláusula e a
 * razão dela estão em `lib/recibo-do-papel.ts`, junto com a conciliação que
 * impede o papel de sair quando a trilha diz mais dinheiro do que a parcela
 * guarda.
 *
 * A rota é de LEITURA e nasce sob `/lojas/:lojaId/contratos`, então herda o
 * `requireModulo("contratos")` de `:75` com a ação derivada do método (`ver`).
 * Quem enxerga o contrato enxerga os recibos dele: eles são o extrato do que a
 * noiva já pagou nele.
 */
router.get("/lojas/:lojaId/contratos/:contratoId/recibos", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  const trilha = await trilhaDosRecibos(lojaId, contrato.id, contrato.parcelas.map((p) => p.id));
  res.json(ListRecibosResponse.parse({ recibos: recibosDoContrato(contrato.parcelas, trilha) }));
});

/**
 * O PDF de UM recibo. O id é o da linha da trilha, e o papel só sai se aquele
 * recebimento ainda vale: estornado, ele não está entre os válidos e a resposta
 * é 404, não um documento. **Recibo de dinheiro devolvido é documento falso** —
 * é a única coisa que esta rota tem de garantir além do escopo.
 */
router.get("/lojas/:lojaId/contratos/:contratoId/recibos/:reciboId/pdf", async (req, res): Promise<void> => {
  const { lojaId, contratoId, reciboId } = req.params as {
    lojaId: string; contratoId: string; reciboId: string;
  };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { loja: true, lead: true, parcelas: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  const trilha = await trilhaDosRecibos(lojaId, contrato.id, contrato.parcelas.map((p) => p.id));
  const recibo = recibosDoContrato(contrato.parcelas, trilha).find((r) => r.id === reciboId);
  if (!recibo) {
    res.status(404).json({ error: "RECIBO_NAO_ENCONTRADO", detalhe: "Este recibo não existe neste contrato." });
    return;
  }

  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="${nomeDoArquivoDoRecibo(recibo, contrato.lead)}"`);
  res.send(Buffer.from(pdfDoRecibo({ recibo, loja: contrato.loja, lead: contrato.lead, contrato })));
});

router.patch("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parsed = UpdateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  /**
   * S-M24 (rodada 2, achado 6#3): CANCELADO era terminal em toda porta MENOS
   * nesta — o PATCH gravava CPF, datas e observações num contrato que a
   * trilha CONTRATO_CANCELADO já congelou, e o PDF saía com os dados novos:
   * o documento divergia do que a auditoria diz que foi cancelado. Pior, a
   * única prova do PATCH (data × reserva) filtra bloqueios vivos, e num
   * cancelado TODOS têm canceladoEm — a data mudava sem prova nenhuma. O
   * arquivo morto não se reescreve.
   */
  const [statusAtual] = await db
    .select({ status: contratosTable.status })
    .from(contratosTable)
    .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)));
  if (!statusAtual) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if (statusAtual.status !== "ATIVO") {
    res.status(422).json({
      error: "CONTRATO_NAO_ATIVO",
      detalhe: "Contrato cancelado é registro morto — ele não se edita.",
    });
    return;
  }

  /**
   * **E222 — a MESMA guarda do POST**, e é aqui que o meio conserto moraria: o
   * `PATCH` é a porta por onde a retirada e a devolução são corrigidas depois do
   * fecho, e fechar só a de nascimento deixaria a de edição aberta. É a lição do
   * E172 (fechar uma porta sem medir a porta ao lado dela é meio conserto) e a
   * mesma razão pela qual o parágrafo abaixo existe para a `dataCasamento`.
   */
  const foraDoExpediente = await recusaDeExpedienteDeRetirada(lojaId as string, parsed.data);
  if (foraDoExpediente) {
    res.status(422).json(foraDoExpediente);
    return;
  }

  /**
   * **S-C90 — o § único do objeto vale também na porta em que a retirada se
   * MOVE**, e não só nas duas em que o carnê nasce.
   *
   * > **PARÁGRAFO ÚNICO (do objeto)** — Em caso de parcelamento, o restante do
   * > valor deverá ser pago em até **20 dias antes da data da retirada**.
   *
   * O E218 fechou `POST /contratos` (`:462`) e `gerar-plano` (`:2523`), que são
   * as duas portas por onde o CARNÊ entra. Desde o E224 a `dataRetirada` deixou
   * de existir só na API e passou a ter tela — e a tela chama o `PATCH`, que é
   * a porta por onde a retirada ANDA. Mover a retirada para perto deixa o carnê
   * inteiro fora do prazo sem uma linha dizendo isso: a régua morde a data que
   * não se mexeu e ignora a que se mexeu. É a lição do E172, exatamente como o
   * parágrafo do expediente acima.
   *
   * **Exemplo numérico, e é o do teste:** contrato de R$ 2.000,00 em duas
   * parcelas, 10/07/2026 e 20/08/2026. Retirada declarada em 04/09/2026 → o
   * limite do § único é **15/08/2026**, e R$ 1.000,00 — metade da venda — só
   * entram **5 dias depois de a peça sair pela porta**. O `POST` recusaria isso
   * com 422; o `PATCH` gravava 200.
   *
   * **Três decisões, e as três estreitam a régua de propósito:**
   *
   * 1. **Só quando a retirada está no corpo.** O carnê não muda por aqui, então
   *    PATCH que não mexe na retirada não pode criar violação nenhuma — e
   *    conferir mesmo assim travaria a correção de um telefone num contrato que
   *    já nasceu fora do prazo. Mesma forma da guarda do expediente.
   * 2. **Só o CARNÊ** (`origem: PLANO`), que é o que a cláusula chama de *"o
   *    restante do valor"*. Avaria (E214), atraso na devolução (E212) e mora
   *    (E213) nascem DEPOIS da retirada por definição — a régua do E218 já
   *    decidiu isso, e aplicá-la a elas recusaria três cobranças que este mesmo
   *    contrato criou.
   * 3. **Só o que está EM ABERTO.** A cláusula garante que o dinheiro entra
   *    antes de a peça sair; parcela já recebida já cumpriu. No `POST` e no
   *    `gerar-plano` a distinção não existe (todo carnê nasce PREVISTO), e é
   *    aqui que ela aparece pela primeira vez.
   *
   * A que vence por ÚLTIMO é a que decide, como no `gerar-plano`: se ela cabe
   * no limite, todas cabem.
   */
  if (parsed.data.dataRetirada) {
    const carneEmAberto = await db
      .select({ vencimento: parcelasTable.vencimento, numero: parcelasTable.numero })
      .from(parcelasTable)
      .where(and(
        eq(parcelasTable.contratoId, contratoId as string),
        eq(parcelasTable.lojaId, lojaId as string),
        eq(parcelasTable.origem, "PLANO"),
        inArray(parcelasTable.status, [...STATUS_ABERTO]),
      ));
    const ultima = carneEmAberto.reduce<Date | null>(
      (maior, p) => (maior === null || p.vencimento > maior ? p.vencimento : maior),
      null,
    );
    const foraDoPrazo = ultima ? foraDoPrazoDaRetirada(ultima, parsed.data.dataRetirada) : null;
    if (foraDoPrazo) {
      res.status(422).json({
        error: "CARNE_DEPOIS_DO_PRAZO",
        detalhe: foraDoPrazo.detalhe,
        // O campo é a RETIRADA, e não as parcelas como no POST: aqui quem se
        // mexeu foi ela, e é o que a vendedora tem na mão para corrigir.
        campos: [
          {
            campo: "dataRetirada",
            motivo: `Para esta retirada o carnê em aberto teria de vencer até ${foraDoPrazo.limite.split("-").reverse().join("/")}`,
          },
        ],
      });
      return;
    }
  }

  /**
   * O PATCH grava `dataCasamento` sem repetir NENHUMA das duas provas que o
   * POST faz sobre ela: a coerência com `bloqueio.casamentoData` e o
   * `verificarDisponibilidade` da peça. Fechar o contrato para 10/05 e depois
   * mover a data por aqui era o caminho aberto para o mesmo estrago que a
   * criação recusa — o vestido reservado para uma data e o contrato prometendo
   * outra, ou a peça já ocupada na data nova.
   *
   * As reservas presas vêm do vínculo vivo (E72), e a conferência é a mesma
   * função do POST — a régua é uma só.
   */
  if (parsed.data.dataCasamento) {
    const vinculos = await db
      .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.contratoId, contratoId as string));
    // S35: era um SELECT por vínculo dentro do laço — um contrato com N
    // reservas custava 1+N consultas para conferir a data. Agora é 1+1: os
    // bloqueios vivos vêm de uma vez (`inArray`) e a conferência é em memória.
    const bloqueios = vinculos.length > 0
      ? await db.select().from(bloqueioVestidosTable)
          .where(and(
            inArray(bloqueioVestidosTable.id, vinculos.map((v) => v.bloqueioId)),
            eq(bloqueioVestidosTable.lojaId, lojaId as string),
            isNull(bloqueioVestidosTable.canceladoEm),
          ))
      : [];
    for (const bloqueio of bloqueios) {
      if (
        bloqueio.casamentoData &&
        diaDeNegocio(parsed.data.dataCasamento) !== diaDeNegocio(bloqueio.casamentoData)
      ) {
        res.status(422).json({
          error: "DATA_DIVERGE_DA_RESERVA",
          detalhe: "A data do casamento diverge da data da reserva do vestido — mude a reserva primeiro.",
          campos: [{ campo: "dataCasamento", motivo: "Diverge da reserva do vestido" }],
        });
        return;
      }
      /**
       * K5 (E163) — a guarda acima se DESLIGAVA no nulo, e não havia outra.
       *
       * O comentário do PATCH afirmava repetir "as duas provas que o POST
       * faz"; a segunda (`verificarDisponibilidade`) nunca rodava, e a
       * primeira só morde quando `bloqueio.casamentoData` existe. Um bloqueio
       * manual (janela `inicio`/`fim`, sem data de casamento) deixava o
       * contrato mover a data para 10/05 **com o envelope físico sem cobrir o
       * dia** — e com a peça possivelmente já ocupada por outra noiva na data
       * nova.
       *
       * Sem data no bloqueio, a pergunta vira a do POST: a peça serve o dia
       * novo? Um candidato de reserva na data nova, ignorando o próprio
       * bloqueio — outra noiva segurando o dia responde 409 com conflitos.
       */
      if (!bloqueio.casamentoData) {
        const resultado = await verificarDisponibilidade({
          lojaId: lojaId as string,
          vestidoId: bloqueio.vestidoId,
          candidato: {
            id: bloqueio.id,
            tipo: "RESERVA_CASAMENTO",
            casamentoData: reancorarDataDeNegocio(parsed.data.dataCasamento),
            provaDataReal: null,
            retiradaDataReal: null,
            devolucaoDataReal: null,
            lavagemConcluidaEm: null,
            inicio: null,
            fim: null,
          },
          ignorarBloqueioId: bloqueio.id,
          hoje: new Date(),
        });
        if (!resultado.disponivel) {
          res.status(409).json({
            error: "VESTIDO_INDISPONIVEL",
            detalhe:
              "A peça reservada deste contrato não cobre a data nova — outra reserva ocupa o período. Ajuste a reserva antes.",
            conflitos: resultado.conflitos,
          });
          return;
        }
      }
    }
  }

  /**
   * K8 — a guarda de `:817` lê no pool e o UPDATE não repetia a condição.
   *
   * Entre a leitura do status e esta escrita cabe o cancelamento inteiro: o
   * PATCH gravava CPF, datas e observações num contrato que a trilha
   * `CONTRATO_CANCELADO` já congelou, e o PDF saía com os dados novos — o
   * documento divergindo do que a auditoria diz ter sido cancelado. A prova de
   * data logo acima piora o caso: ela filtra bloqueios VIVOS, e num contrato
   * recém-cancelado todos têm `canceladoEm`, então a data mudava sem prova
   * nenhuma.
   *
   * O conserto é o idioma do DELETE de parcela (`:1769` — S-O35: a referência
   * dizia `:1300-1304`, e o bloco andou): a condição do
   * `where` repete o estado LIDO. Zero linhas quer dizer que o contrato deixou
   * de ser ATIVO no meio — e a resposta é o mesmo 422 da guarda lenta.
   */
  const [contrato] = await db.update(contratosTable)
    // S-O117: mesma âncora do POST — corrigir a data pelo PATCH não pode
    // gravar um instante que a guarda de divergência leia como outro dia.
    .set({
      ...parsed.data,
      ...(parsed.data.dataCasamento
        ? { dataCasamento: reancorarDataDeNegocio(parsed.data.dataCasamento) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(contratosTable.id, contratoId as string),
      eq(contratosTable.lojaId, lojaId as string),
      eq(contratosTable.status, "ATIVO"),
    ))
    .returning();

  if (!contrato) {
    // Zero linhas tem dois sentidos, e a releitura (só no caminho de erro, que
    // é raro) diz qual: o contrato caiu no meio, ou nunca esteve aqui.
    const [aindaExiste] = await db
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)));
    if (!aindaExiste) {
      res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
      return;
    }
    res.status(422).json({
      error: "CONTRATO_NAO_ATIVO",
      detalhe: "Contrato cancelado é registro morto — ele não se edita.",
    });
    return;
  }
  /**
   * S-O113 — **a resposta era a linha CRUA, e o schema promete quatro
   * relações.**
   *
   * O `.returning()` do UPDATE devolve as colunas de `contratos` e mais nada:
   * sem `itens`, sem `parcelas`, sem `lead` e sem `vendedora`, que o `Contrato`
   * declara e o `GET /contratos/:id` entrega. Medido pela
   * `varredura-schemas-aninhados` do E192 — as quatro arestas prometidas por
   * esta porta e entregues pela irmã.
   *
   * A releitura é a mesma do `GET` (`:989-992`), de propósito: quem grava e
   * relê pelo mesmo `with` não pode divergir dele. Uma query a mais no caminho
   * de sucesso de uma edição — que é gesto humano, não laço — em troca de a
   * tela que salvar não precisar de um `GET` logo depois.
   */
  const completo = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contrato.id), eq(contratosTable.lojaId, lojaId as string)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true },
  });
  res.json(UpdateContratoResponse.parse(completo ?? contrato));
});

router.post("/lojas/:lojaId/contratos/:contratoId/cancelar", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = CancelarContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if (contrato.status === "CANCELADO") {
    res.status(409).json({ error: "CONTRATO_JA_CANCELADO", detalhe: "Contrato já está cancelado" });
    return;
  }

  const agora = new Date();

  const desfecho = await db.transaction(async (tx) => {
    /**
     * K1/P1 — as parcelas eram lidas no POOL, e o dinheiro escapava pela janela.
     *
     * `parcelasAntes` decidia DUAS coisas a partir de um SELECT feito fora
     * desta transação: quem tem recebimento (`idsComRecebimento`) e quanto a
     * trilha vai declarar. Um recebimento que commitasse entre aquela leitura e
     * as escritas daqui virava PAGA — e PAGA escapa de `inArray(status,
     * STATUS_ABERTO)` (só PREVISTA e PARCIAL) **e** de `idsComRecebimento`, que
     * foi montado quando `valorRecebido` ainda era nulo.
     *
     * **Medido:** cancelamento com `destinoPago: "estornar"` no mesmo segundo
     * do Pix de R$ 700,00 → contrato CANCELADO com uma parcela PAGA viva de
     * R$ 700,00, que `entrouDinheiro` (`caixa.ts:82`) conta no caixa realizado
     * PARA SEMPRE, enquanto a trilha grava `totalRecebido: 0` e
     * `totalEstornado: 0`. A loja devolveu R$ 700,00 que o caixa jura ter
     * recebido, e não há linha que explique. Pior: não há volta — `POST
     * /estornar` exige contrato ATIVO, e este está cancelado.
     *
     * O conserto é ler DENTRO da transação e sob `FOR UPDATE`. O `POST
     * /receber` escreve por CAS na mesma linha (`:1129-1143`): a tranca o
     * segura até commitarmos, e aí o CAS dele não casa mais — ele devolve
     * `PARCELA_MUDOU` 409, que é a verdade (a parcela mudou: o contrato caiu).
     *
     * A ordem é a do módulo — lead → contrato → parcelas → bloqueios.
     */
    const [lead] = await tx
      .select({
        id: leadsTable.id,
        etapa: leadsTable.etapa,
        contratoFechadoEm: leadsTable.contratoFechadoEm,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, contrato.leadId), eq(leadsTable.lojaId, lojaId)))
      .for("update");

    const [sobTranca] = await tx
      .select({ status: contratosTable.status })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)))
      .for("update");
    // Cancelar duas vezes ao mesmo tempo: quem chega depois vê CANCELADO já
    // commitado e recebe o mesmo 409 da guarda lenta, em vez de gravar uma
    // segunda trilha dizendo que anulou parcelas que o primeiro já anulou.
    if (!sobTranca) return { sumiu: true as const };
    if (sobTranca.status === "CANCELADO") return { jaCancelado: true as const };

    const parcelasAntes = await tx
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id))
      .for("update");

    // Dinheiro que já entrou nesta venda, venha de parcela quitada ou meio paga.
    const comRecebimento = parcelasAntes.filter((p) => (p.valorRecebido ?? 0) > 0);
    const idsComRecebimento = comRecebimento.map((p) => p.id);
    const totalRecebidoAntes = reais(
      comRecebimento.reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0),
    );
    const abertasAntes = parcelasAntes.filter((p) => estaAberta(p));
    const totalAbertoAntes = reais(
      abertasAntes.reduce(
        (s, p) => s + Math.max(0, centavos(p.valorPrevisto) - centavos(p.valorRecebido ?? 0)),
        0,
      ),
    );

    /**
     * E217 — o que a rescisão pede saber do que já entrou.
     *
     * O carnê (`origem: PLANO`) é a base das cláusulas 8ª §2º/11ª/12ª/18ª — a
     * mesma régua que o E218 já usa para o § único do objeto: avaria, atraso
     * e mora nascem DEPOIS da retirada e não são "o pagamento pelo serviço"
     * que o instrumento rescinde.
     */
    const parcelasPlanoAntes = parcelasAntes.filter((p) => p.origem === "PLANO");
    const totalPagoPlanoC = parcelasPlanoAntes.reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0);
    const reservaPagaC = centavos(
      parcelasPlanoAntes.find((p) => p.numero === 0)?.valorRecebido ?? 0,
    );

    // `comissaoEstornadaEm` NÃO é gravado aqui: ele marca quando o estorno foi
    // RECONCILIADO num fechamento, e não quando o contrato caiu (isso é o
    // `canceladoEm`). Deixá-lo nulo é o que mantém o estorno §6.4 pendente para
    // o próximo fechamento abater; preenchê-lo agora faria a comissão já paga
    // sobre esta venda nunca voltar.
    await tx.update(contratosTable)
      .set({
        status: "CANCELADO",
        canceladoEm: agora,
        canceladoMotivo: parsed.data.motivo,
        updatedAt: agora,
      })
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));

    // Parcelas em ABERTO sempre são canceladas — PREVISTA e PARCIAL (E49).
    //
    // E94: aqui estava `eq(status, "PREVISTA")`, a mesma omissão do C4 uma
    // rota adiante. A parcela meio recebida sobrevivia ao cancelamento como
    // PARCIAL, isto é: seguia ABERTA (`estaAberta`), continuava no horizonte,
    // no aging e na cobrança de um contrato que não existe mais. O saldo que
    // falta nela morreu junto com o contrato, sob qualquer `destinoPago`.
    await tx.update(parcelasTable)
      .set({ status: "CANCELADA" })
      .where(and(
        eq(parcelasTable.contratoId, contrato.id),
        inArray(parcelasTable.status, [...STATUS_ABERTO]),
      ));

    /**
     * E217 — a rescisão. Lida DEPOIS do UPDATE de status acima, de propósito:
     * a contagem de "locações anteriores" da 12ª (`ehExclusivaDePrimeiroAluguel`)
     * lê `contratos.status = 'ATIVO'`, e este contrato já não é mais — a
     * exclusão dele da própria contagem (que o E216 pede) sai de graça, sem
     * um `- 1` separado que alguém pode esquecer de repetir.
     */
    const itensDoContrato = await tx
      .select()
      .from(contratoItensTable)
      .where(eq(contratoItensTable.contratoId, contrato.id));

    const vestidoIds = [...new Set(itensDoContrato.map((it) => it.vestidoId).filter((id): id is string => !!id))];
    const [marcas, contagens] = vestidoIds.length > 0
      ? await Promise.all([
          tx.select({ id: vestidosTable.id, exclusiva: vestidosTable.exclusiva })
            .from(vestidosTable)
            .where(inArray(vestidosTable.id, vestidoIds)),
          tx.select({ vestidoId: contratoItensTable.vestidoId, qtd: count() })
            .from(contratoItensTable)
            .innerJoin(contratosTable, eq(contratosTable.id, contratoItensTable.contratoId))
            .where(and(
              eq(contratoItensTable.lojaId, lojaId as string),
              inArray(contratoItensTable.vestidoId, vestidoIds),
              eq(contratosTable.status, "ATIVO"),
            ))
            .groupBy(contratoItensTable.vestidoId),
        ])
      : [[], []];
    const exclusivaPorVestido = new Map(marcas.map((v) => [v.id, v.exclusiva === true]));
    const locacoesPorVestido = new Map(contagens.map((c) => [c.vestidoId, c.qtd]));

    const rescisao = calcularRescisao({
      iniciativa: parsed.data.iniciativa ?? "LOCATARIA",
      itens: itensDoContrato.map((it) => ({
        descricao: it.descricao,
        valor: reais(centavos(it.valorUnitario) * it.quantidade),
        exclusivaDePrimeiroAluguel: it.vestidoId
          ? ehExclusivaDePrimeiroAluguel(
              { exclusiva: exclusivaPorVestido.get(it.vestidoId) ?? false },
              locacoesPorVestido.get(it.vestidoId) ?? 0,
            )
          : false,
      })),
      valorTotalContrato: contrato.valorTotal,
      totalPagoPlano: reais(totalPagoPlanoC),
      reservaPaga: reais(reservaPagaC),
      prazoDevolucaoReservaDias: contrato.prazoDevolucaoReservaDias,
      dataRetirada: contrato.dataRetirada,
      hoje: agora,
    });

    /**
     * 13ª §3º — quando a loja fica devendo, o prazo é 30 dias. Nasce como
     * `contas_pagar` (o mesmo lugar que já representa dívida da loja), não
     * como ajuste em `parcelas`: a dívida é NOVA e é da LOJA, não uma parcela
     * que a noiva deve.
     */
    if (rescisao.devolucaoTotal > 0) {
      await tx.insert(contasPagarTable).values({
        id: randomUUID(),
        lojaId: lojaId as string,
        tipo: "DEVOLUCAO",
        descricao: `Devolução — rescisão do contrato de ${contrato.vestidoDescricao ?? "locação"} (${rescisao.explicacao})`,
        valorPrevisto: rescisao.devolucaoTotal,
        vencimento: inicioDoDia(addDias(diaLocal(agora), PRAZO_DEVOLUCAO_DA_LOJA_DIAS)),
        origemContratoId: contrato.id,
      });
    }

    // Sobre o que JÁ ENTROU decide o destinoPago: "manter" (default — noiva
    // perdeu o sinal, valor fica no caixa) ou "estornar" (valor devolvido — os
    // campos de recebimento são zerados e a receita devolve o dinheiro).
    //
    // A PARCIAL entra aqui também: sob "estornar" a loja está dizendo que
    // devolveu o dinheiro, e os R$ 4.000 de uma parcela meio paga são tão
    // devolvidos quanto os R$ 10.000 de uma quitada. Ela já virou CANCELADA no
    // UPDATE acima; este segundo passo zera o que ela tinha recebido.
    if (parsed.data.destinoPago === "estornar" && idsComRecebimento.length > 0) {
      await tx.update(parcelasTable)
        .set({
          status: "CANCELADA",
          valorRecebido: null,
          recebidoEm: null,
          formaRecebimento: null,
          // E115 — o estorno em massa esquecia os dois carimbos que o avulso
          // limpa. `conciliadoEm` é o invariante da própria coluna ("movimento
          // que deixou de existir não pode continuar conferido"); e
          // `enviadoContabilidadeEm` é OPERACIONAL — alimenta o isNull do
          // próximo envio, então mantê-lo deixaria um recebimento re-lançado
          // fora de todo pacote futuro da contadora.
          conciliadoEm: null,
          enviadoContabilidadeEm: null,
        })
        .where(and(
          eq(parcelasTable.contratoId, contrato.id),
          inArray(parcelasTable.id, idsComRecebimento),
        ));
    }

    // Libera as peças: soft-cancela TODOS os bloqueios vinculados (E72) —
    // o N:N e o singular legado, se ainda existir fora dele.
    const vinculos = await tx
      .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.contratoId, contratoId));
    const idsALiberar = [
      ...new Set([
        ...vinculos.map((v) => v.bloqueioId),
        ...(contrato.bloqueioVestidoId ? [contrato.bloqueioVestidoId] : []),
      ]),
    ];
    if (idsALiberar.length > 0) {
      await tx.update(bloqueioVestidosTable)
        .set({ canceladoEm: agora, updatedAt: agora })
        .where(and(
          inArray(bloqueioVestidosTable.id, idsALiberar),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));
    }

    /**
     * P3 — cancelar não desfazia `contratoFechadoEm` nem a etapa do lead.
     *
     * Fechar o contrato carimba as duas coisas (`:713-724`) e o cancelamento
     * não mexia em nenhuma. Quem lê o carimbo é a curva de sazonalidade
     * (`leads.ts:432`, `count(*) filter (where contrato_fechado_em is not
     * null)`): **a venda cancelada seguia contada como fechada**, e a curva que
     * diz à dona em que mês vai faltar vestido superestimava a demanda com
     * vendas que não existem. A noiva ainda ficava no kanban em
     * CONTRATO_FECHADO sem contrato nenhum.
     *
     * O desfazer é condicional a NÃO haver outro contrato ativo — a noiva que
     * refez a venda continua tendo fechado, e o carimbo é da primeira vez
     * (`lead.contratoFechadoEm ?? new Date()` na criação).
     *
     * A etapa só regride quando está EXATAMENTE em CONTRATO_FECHADO, que é o
     * estado que a criação do contrato pôs ali. De EM_PROVAS para a frente
     * quem moveu foi uma pessoa, sobre a peça que já saiu do ateliê: apagar
     * isso seria inventar um passado. Nesse caso o carimbo cai (a venda não
     * fechou) e a etapa fica — a divergência é real e é da loja resolver.
     */
    const [outroAtivo] = await tx
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(and(
        eq(contratosTable.leadId, contrato.leadId),
        eq(contratosTable.lojaId, lojaId),
        eq(contratosTable.status, "ATIVO"),
      ));
    const desfezOFecho = !outroAtivo && lead !== undefined;
    const etapaDesfeita =
      desfezOFecho && lead.etapa === "CONTRATO_FECHADO" ? ("ORCAMENTO_ABERTO" as const) : null;
    if (desfezOFecho) {
      await tx.update(leadsTable)
        .set({
          contratoFechadoEm: null,
          ...(etapaDesfeita ? { etapa: etapaDesfeita } : {}),
          updatedAt: agora,
        })
        .where(eq(leadsTable.id, lead.id));
    }

    /**
     * B3/E94 — a trilha do cancelamento, DENTRO da transação.
     *
     * Esta é a maior ação de dinheiro do sistema e era a única sem rastro: ela
     * anula as parcelas em aberto e, com `destinoPago: "estornar"`, zera o
     * recebido das que já tinham entrado — tirando da receita dinheiro que a
     * loja contou. A ação irmã e MENOR, estornar uma parcela sozinha, sempre
     * gravou. Quem conferisse o caixa via a receita cair sem uma linha que
     * explicasse por quê, e o `motivo` digitado morria no contrato, invisível
     * para a trilha e para o CSV da contadora.
     *
     * Os totais são lidos ANTES das escritas de propósito: depois delas o
     * `valorRecebido` já é nulo, e o que o cancelamento desfez seria
     * irrecuperável — que é exatamente o que a trilha existe para impedir.
     */
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "CONTRATO_CANCELADO",
      entidade: "contrato",
      entidadeId: contrato.id,
      detalhe: {
        motivo: parsed.data.motivo,
        destinoPago: parsed.data.destinoPago ?? "manter",
        valorTotal: contrato.valorTotal,
        // O que o cancelamento desfez, nas duas pernas: o que já tinha entrado
        // (e voltou, se estornou) e o que deixou de ser cobrável.
        totalRecebido: totalRecebidoAntes,
        totalEstornado: parsed.data.destinoPago === "estornar" ? totalRecebidoAntes : 0,
        parcelasEstornadas:
          parsed.data.destinoPago === "estornar" ? idsComRecebimento.length : 0,
        parcelasAnuladas: abertasAntes.length,
        totalAnulado: totalAbertoAntes,
        // P3: o que o cancelamento desfez no LEAD. Sem estas duas linhas, quem
        // lê a trilha não sabe por que a noiva saiu da curva de sazonalidade.
        fechoDesfeito: desfezOFecho,
        etapaDesfeitaPara: etapaDesfeita,
        // E217 — o que o CONTRATO manda reter/devolver, distinto do que o
        // CAIXA fez com `destinoPago` acima.
        iniciativa: parsed.data.iniciativa ?? "LOCATARIA",
        rescisaoDevolucaoTotal: rescisao.devolucaoTotal,
        rescisaoRetencaoTotal: rescisao.retencaoTotal,
        /**
         * S-C140 — a divergência entre as duas linhas acima, DITA.
         *
         * A trilha já guardava os dois números e deixava a leitura por conta de
         * quem auditasse: `totalEstornado: 2200` ao lado de
         * `rescisaoRetencaoTotal: 1800` é a loja devolvendo R$ 1.800,00 que a
         * 8ª §2º manda reter, e ninguém somava isso de cabeça meses depois.
         * Agora a linha diz. É o molde do `AVARIA_FORA_DA_FAIXA` (E214): a
         * régua não impede a decisão, obriga a nomeá-la — e o `motivo`, que a
         * porta exige, é onde a razão fica.
         */
        estornoContraARescisao: estornoContraARescisao(
          rescisao,
          parsed.data.destinoPago ?? "manter",
        ),
      },
    });
    return { ok: true as const, rescisao };
  });

  if ("sumiu" in desfecho) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if ("jaCancelado" in desfecho) {
    res.status(409).json({ error: "CONTRATO_JA_CANCELADO", detalhe: "Contrato já está cancelado" });
    return;
  }

  const fullContrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });
  // S-C89: cancelar solta os bloqueios — o item da fila vira órfã, e a
  // parcela do atraso morre junto (a cobrança viva muda).
  derrubarFilaDeAtrasos(lojaId);
  res.json(CancelarContratoResponse.parse({
    ...fullContrato,
    // Escrito por extenso (e não `rescisao: desfecho.rescisao`) para a
    // `varredura-schemas-aninhados` (E192) enxergar: o motor lê o handler por
    // TEXTO e não atravessa import de outro pacote — `calcularRescisao` mora
    // no `financeiro-core` — então sem as chaves aqui `Rescisao.linhas`
    // aparecia como aresta ÓRFÃ, a mesma classe que o E213 pagou com `mora`.
    rescisao: {
      linhas: desfecho.rescisao.linhas,
      devolucaoTotal: desfecho.rescisao.devolucaoTotal,
      retencaoTotal: desfecho.rescisao.retencaoTotal,
      aplicou18a: desfecho.rescisao.aplicou18a,
      explicacao: desfecho.rescisao.explicacao,
    },
  }));
});

/**
 * E223 — a porta de trocar peça do contrato (cláusula 17ª).
 *
 * Até aqui `contrato_itens` e `contrato_bloqueios` recebiam escrita num sítio
 * só — o INSERT do `POST /contratos` — e trocar de traje era CANCELAR o
 * contrato e fazer outro, o que apagava a trilha financeira junto. Esta porta
 * faz as quatro coisas de uma vez, na mesma transação: liberta a reserva
 * antiga (soft-cancel — a EXCLUDE e a disponibilidade param de vê-la), prende
 * a nova com a MESMA régua do fecho (`criarReservaDeVestido`, agora com três
 * portas), refaz o snapshot do item (peça e descrição) e deixa rastro.
 *
 * **O dinheiro NÃO se mexe, e a decisão é declarada**: a 17ª só põe preço na
 * troca de DATA (§2º/§3º, que é o E211) — sobre a troca de modelo ela diz
 * prazo e dias vedados (o E219, a guarda que mora nesta porta). O
 * `valorUnitario` contratado fica; diferença de preço negociada entra pelos
 * gestos financeiros que já existem (parcela avulsa), e a trilha grava os
 * DOIS preços para a loja decidir com o número na mão. Mexer no
 * `valorTotal` aqui quebraria o invariante que o fecho prova (parcelas
 * somam o total, em centavos exatos).
 *
 * A reserva antiga pode chegar MORTA (cancelada por outro caminho, contrato
 * vivo apontando para ela): a troca é justamente o conserto — religa o
 * contrato numa reserva viva. Só a peça JÁ RETIRADA recusa: trocar de modelo
 * depois de a peça sair não existe.
 *
 * O `bloqueioVestidoId` singular do contrato é legado lido, nunca mais
 * escrito (E72) — o vínculo autoritativo é o N:N, e é ele que troca aqui.
 */
router.post("/lojas/:lojaId/contratos/:contratoId/trocar-peca", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = TrocarPecaDoContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { bloqueioId, vestidoNovoId } = parsed.data;

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({
      error: "CONTRATO_NAO_ATIVO",
      detalhe: "Contrato não está ativo — a troca de peça é gesto de contrato vivo.",
    });
    return;
  }

  /**
   * E219 — a guarda da 17ª mora nesta porta: sem troca após 7 dias da locação
   * (contados do FECHO — a convenção está declarada em `troca.ts` e na frase,
   * e a P5 pede a confirmação da dona), nem às sextas e sábados (§1º). O
   * `hoje` vem de `relogio.agora()` porque regra que decide pelo dia da
   * semana precisa de relógio que o teste alcance (S-O119).
   */
  const agora = relogio.agora();
  const veto = vetoDaTroca17a({ fechadoEm: contrato.fechadoEm, hoje: agora });
  if (veto) {
    res.status(422).json({
      error: veto.error,
      detalhe: veto.detalhe,
      campos: [{ campo: "bloqueioId", motivo: "A cláusula 17ª veda esta troca" }],
    });
    return;
  }

  const [vinculo] = await db.select().from(contratoBloqueiosTable)
    .where(and(
      eq(contratoBloqueiosTable.contratoId, contratoId),
      eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
    ));
  if (!vinculo) {
    res.status(422).json({
      error: "RESERVA_NAO_E_DESTE_CONTRATO",
      detalhe: "Esta reserva não está presa por este contrato — a troca parte de uma peça do próprio contrato.",
      campos: [{ campo: "bloqueioId", motivo: "A reserva não pertence a este contrato" }],
    });
    return;
  }
  const [bloqueioAntigo] = await db.select().from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)));
  if (!bloqueioAntigo) {
    res.status(404).json({
      error: "RESERVA_NAO_ENCONTRADA",
      detalhe: "A reserva de vestido indicada não existe nesta loja.",
    });
    return;
  }
  if (bloqueioAntigo.retiradaDataReal) {
    res.status(422).json({
      error: "TROCA_APOS_RETIRADA",
      detalhe: "A peça já foi retirada — a troca de modelo acontece antes de a peça sair da loja.",
      campos: [{ campo: "bloqueioId", motivo: "A peça já saiu da loja" }],
    });
    return;
  }

  const [vestidoNovo] = await db.select().from(vestidosTable)
    .where(and(eq(vestidosTable.id, vestidoNovoId), eq(vestidosTable.lojaId, lojaId)));
  if (!vestidoNovo) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }
  if (vestidoNovo.id === bloqueioAntigo.vestidoId) {
    res.status(422).json({
      error: "TROCA_PARA_A_MESMA_PECA",
      detalhe: "A peça nova é a mesma que já está no contrato — não há o que trocar.",
      campos: [{ campo: "vestidoNovoId", motivo: "É a mesma peça" }],
    });
    return;
  }

  const desfecho = await db.transaction(async (tx) => {
    /**
     * A ordem do módulo (E158): contrato → bloqueios → vestidos. O vestido
     * novo é trancado DENTRO de `criarReservaDeVestido`, que é o último
     * degrau — e a releitura de cada linha é statement novo, que em READ
     * COMMITTED enxerga o que um cancelamento concorrente commitou (a forma
     * do K2/K3 do fecho).
     */
    const [sobTranca] = await tx.select({ status: contratosTable.status }).from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)))
      .for("update");
    if (!sobTranca) return { sumiu: true as const };
    if (sobTranca.status !== "ATIVO") return { naoAtivo: true as const };

    const [antigoSobTranca] = await tx.select().from(bloqueioVestidosTable)
      .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)))
      .for("update");
    if (!antigoSobTranca) return { sumiu: true as const };
    // A retirada pode ter sido registrada na janela entre a leitura do pool e
    // a tranca — física ganha de gesto, como no E225.
    if (antigoSobTranca.retiradaDataReal) return { jaSaiu: true as const };

    /**
     * A reserva nova nasce ANTES de a antiga morrer — de propósito: o desfecho
     * `conflitos` é `return`, não `throw`, então a transação COMITA o que já
     * foi escrito, e um conflito da peça nova não pode deixar a antiga
     * soft-cancelada (medido no vermelho deste épico: a reserva antiga sumia
     * da disponibilidade num 409 que dizia "nada se moveu"). As peças são
     * diferentes, então a antiga viva não conflita com a candidata — e as
     * trancas já foram tomadas acima, na ordem do módulo.
     */
    const criado = await criarReservaDeVestido({
      lojaId,
      vestidoId: vestidoNovoId,
      // A reserva nova herda a dona e a reserva-mãe da antiga: o véu pendurado
      // na mãe (S-O56/E185) continua pendurado — e sem dona própria, como era.
      leadId: antigoSobTranca.leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: antigoSobTranca.casamentoData,
      reservaId: antigoSobTranca.reservaId,
    }, tx);
    if ("conflitos" in criado) return { conflitos: criado.conflitos };

    if (!antigoSobTranca.canceladoEm) {
      await tx.update(bloqueioVestidosTable)
        .set({ canceladoEm: agora, updatedAt: agora })
        .where(eq(bloqueioVestidosTable.id, bloqueioId));
    }

    await tx.delete(contratoBloqueiosTable)
      .where(and(
        eq(contratoBloqueiosTable.contratoId, contratoId),
        eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
      ));
    await tx.insert(contratoBloqueiosTable)
      .values({ contratoId, bloqueioId: criado.bloqueio.id });

    // O snapshot do item passa a dizer a peça que a noiva vai vestir — e SÓ
    // isso: o valorUnitario contratado fica (a decisão declarada no docblock).
    const itensTrocados = await tx.update(contratoItensTable)
      .set({ vestidoId: vestidoNovoId, descricao: vestidoNovo.nome })
      .where(and(
        eq(contratoItensTable.contratoId, contratoId),
        eq(contratoItensTable.vestidoId, antigoSobTranca.vestidoId),
      ))
      .returning({ id: contratoItensTable.id, valorUnitario: contratoItensTable.valorUnitario });

    await tx.update(contratosTable)
      .set({ updatedAt: agora })
      .where(eq(contratosTable.id, contratoId));

    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "CONTRATO_PECA_TROCADA",
      entidade: "contrato",
      entidadeId: contratoId,
      detalhe: {
        bloqueioAntigoId: bloqueioId,
        bloqueioNovoId: criado.bloqueio.id,
        vestidoAntigoId: antigoSobTranca.vestidoId,
        vestidoNovoId,
        descricaoNova: vestidoNovo.nome,
        // Os DOIS preços, para a loja decidir a diferença com o número na mão.
        valorUnitarioContratado: itensTrocados[0]?.valorUnitario ?? null,
        precoBaseDaPecaNova: vestidoNovo.precoBase,
        itensDoSnapshotTrocados: itensTrocados.length,
      },
    });
    return { ok: true as const, bloqueioNovoId: criado.bloqueio.id };
  });

  if ("sumiu" in desfecho) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if ("naoAtivo" in desfecho) {
    res.status(422).json({
      error: "CONTRATO_NAO_ATIVO",
      detalhe: "Contrato não está ativo — a troca de peça é gesto de contrato vivo.",
    });
    return;
  }
  if ("jaSaiu" in desfecho) {
    res.status(422).json({
      error: "TROCA_APOS_RETIRADA",
      detalhe: "A peça já foi retirada — a troca de modelo acontece antes de a peça sair da loja.",
      campos: [{ campo: "bloqueioId", motivo: "A peça já saiu da loja" }],
    });
    return;
  }
  if ("conflitos" in desfecho) {
    res.status(409).json({
      error: "VESTIDO_INDISPONIVEL",
      detalhe:
        "A peça nova está indisponível no período — confira os conflitos e escolha outra peça ou outra data.",
      conflitos: desfecho.conflitos,
    });
    return;
  }

  // S-C89: a troca cancela o bloqueio antigo e prende outro — as linhas da
  // fila apontam para bloqueios.
  derrubarFilaDeAtrasos(lojaId);
  res.json(TrocarPecaDoContratoResponse.parse({
    bloqueioNovoId: desfecho.bloqueioNovoId,
    vestidoNovoId,
  }));
});

// Parcelas
//
// A8/E104 — `GET /contratos/:id/parcelas` foi REMOVIDA. Ela não estava no spec,
// não tinha hook gerado, nenhuma tela a chamava e nenhum E2E a tocava: o único
// consumidor era um teste. E era redundante mesmo para quem só tem `leads` —
// `GET /contratos/:id` devolve `with: { parcelas: true }` no mesmo gate.
//
// Com ela some a última entrada viva da allowlist do `lote2`, e o invariante
// **spec = servidor** passa a ser total, não "total menos uma".

router.post("/lojas/:lojaId/parcelas/:parcelaId/receber", requireModulo("contratos", "editar"), async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;
  const parsed = ReceberParcelaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
    return;
  }
  if (existente.status === "PAGA") {
    res.status(409).json({ error: "PARCELA_JA_RECEBIDA", detalhe: "Esta parcela já foi recebida" });
    return;
  }
  if (existente.status === "CANCELADA") {
    res.status(422).json({ error: "PARCELA_CANCELADA", detalhe: "Parcela cancelada não pode ser recebida" });
    return;
  }
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  /**
   * `valorRecebido` do corpo é o que entrou AGORA, não o total (E49): uma
   * parcela pode ser recebida em partes, e o acumulado é que decide o status.
   * Quitou? PAGA. Sobrou? PARCIAL — o dinheiro entra no caixa e o resto segue
   * cobrável, em vez de sumir do "a receber" (marcada PAGA faltando dinheiro)
   * ou de ficar 100% aberta (o que entrou não apareceria no caixa).
   */
  const jaRecebidoC = centavos(existente.valorRecebido ?? 0);
  const entrandoC = centavos(parsed.data.valorRecebido);

  /**
   * **E213 — a parcela vencida deve MAIS que o previsto** (cláusula 9ª).
   *
   * A guarda comparava com `valorPrevisto − jaRecebido`, e essa era a dívida
   * inteira enquanto multa e juros não existiam. Com a 9ª ligada, a noiva que
   * atrasou 30 dias uma parcela de R$ 500,00 deve R$ 515,00 — e a porta
   * recusava os R$ 515,00 com `VALOR_ACIMA_DO_SALDO`, dizendo à vendedora que
   * ela estava cobrando demais **enquanto a fila de cobrança, a tela do
   * contrato e o portal da noiva mostravam os R$ 515,00**. Quatro leituras do
   * mesmo número, e a única que decide dizendo não.
   *
   * O teto passa a ser o mesmo total que as outras três imprimem, pelo MESMO
   * helper — e a quitação segue o teto: quem paga R$ 500,00 numa parcela que
   * deve R$ 515,00 fica PARCIAL, com R$ 15,00 ainda cobráveis, em vez de
   * quitada devendo a multa.
   *
   * A mora é derivada do dia de HOJE, então o teto de hoje não é o de amanhã.
   * É a mesma natureza do E212, e por isso o acréscimo entra na trilha do
   * recebimento: sem ele, "por que entraram R$ 515,00 numa parcela de
   * R$ 500,00?" não tem resposta depois do fato.
   */
  const mora = moraDe(existente);
  const acrescimoC = mora?.acrescimoC ?? 0;
  const saldoPrincipalC = centavos(existente.valorPrevisto) - jaRecebidoC;
  const saldoC = saldoPrincipalC + acrescimoC;

  // Receber mais que o saldo é recusado, e não clampado: o caso comum é dígito
  // a mais, e aceitar inflaria o caixa REALIZADO com dinheiro que não entrou —
  // um erro que só aparece na conciliação. A mensagem diz quanto falta, que é
  // o que a vendedora precisa para digitar de novo.
  if (entrandoC > saldoC) {
    res.status(422).json({
      error: "VALOR_ACIMA_DO_SALDO",
      detalhe:
        `Faltam R$ ${reais(saldoC).toFixed(2)} nesta parcela — o valor informado é maior.` +
        (acrescimoC > 0
          ? ` (inclui R$ ${reais(acrescimoC).toFixed(2)} de multa e juros da cláusula 9ª)`
          : ""),
    });
    return;
  }

  /**
   * **A imputação: o principal primeiro, e o que sobrar é MORA.**
   *
   * A decisão da dona (13/08/2026) foi *quitar no principal e cristalizar o que
   * for efetivamente recebido a mais*. A razão é que conta DERIVADA não
   * sobrevive ao pagamento do principal — medido: quem paga R$ 500,00 de uma
   * dívida de R$ 515,00 zera o saldo aberto e, com ele, o acréscimo, e a
   * parcela ficava PARCIAL devendo R$ 15,00 que o sistema dizia não existir.
   *
   * Então quem paga R$ 500,00 quita (o balcão deu quitação, e é o que ele faz);
   * quem paga R$ 515,00 quita E os R$ 15,00 viram linha própria, PAGA, com a
   * conta na descrição — o dinheiro da multa passa a ser rastreável no carnê, no
   * caixa e na comissão como qualquer outro.
   */
  const aoPrincipalC = Math.min(entrandoC, Math.max(0, saldoPrincipalC));
  const aMoraC = entrandoC - aoPrincipalC;
  const totalRecebidoC = jaRecebidoC + aoPrincipalC;
  const quitada = totalRecebidoC >= centavos(existente.valorPrevisto);

  const parcela = await db.transaction(async (tx) => {
    /**
     * B6/E94 — UPDATE condicional ao estado LIDO, o mesmo idioma de
     * `convites.ts:111` e `portal.ts:255`.
     *
     * Tudo acima desta linha — `jaRecebidoC`, a checagem do saldo, o
     * `totalRecebidoC` — foi calculado a partir de um SELECT feito fora da
     * transação. Entre aquele SELECT e este UPDATE cabe outro recebimento
     * inteiro: a recepção lança R$ 300 e a vendedora R$ 700 no mesmo segundo,
     * as duas leem `valorRecebido = 0`, uma grava 300 e a outra 700, e a
     * última a escrever vence. R$ 300 entraram na gaveta e não existem no
     * sistema.
     *
     * Nenhuma constraint do banco resolve isto — o valor certo depende do que
     * foi lido, não de uma unicidade. O que resolve é escrever apenas se a
     * parcela ainda estiver como a lemos: `IS NOT DISTINCT FROM` porque
     * `valorRecebido` é nulo enquanto nada entrou, e `= NULL` nunca é
     * verdadeiro. O `status` entra junto para fechar a janela em que um
     * cancelamento de contrato passa por aqui no meio.
     */
    const [atualizada] = await tx.update(parcelasTable)
      .set({
        status: quitada ? "PAGA" : "PARCIAL",
        // O instante do ÚLTIMO recebimento: é por ele que o caixa realizado
        // data a entrada, e a última parcela do acordo é o que fecha a conta.
        recebidoEm: parsed.data.recebidoEm,
        valorRecebido: reais(totalRecebidoC),
        formaRecebimento: parsed.data.formaRecebimento,
      })
      .where(and(
        eq(parcelasTable.id, existente.id),
        eq(parcelasTable.status, existente.status),
        sql`${parcelasTable.valorRecebido} is not distinct from ${existente.valorRecebido}::numeric`,
      ))
      .returning();
    // Zero linhas: alguém recebeu nesta parcela entre o nosso SELECT e agora.
    // Sair sem auditar é parte do conserto — trilha de um recebimento que não
    // aconteceu faz a conferência bater com dinheiro inexistente.
    if (!atualizada) return null;

    /**
     * **E213 — o que entrou ALÉM do principal vira linha própria** (cláusula 9ª).
     *
     * Nasce PAGA na MESMA transação do recebimento que a criou: uma linha de
     * multa PREVISTA seria uma segunda cobrança de dinheiro que já está na
     * gaveta. A descrição carrega a conta que a tela imprimiu — mesma frase, um
     * lugar só (`explicacaoDaMora`).
     *
     * `numero` segue a régua do E97: `max + 1`, porque `0` é a ENTRADA do carnê
     * e o `unique(contratoId, numero)` recusaria o segundo zero com um
     * `REGISTRO_DUPLICADO` que se lê como "já cobrei isso".
     */
    let idDaMora: string | null = null;
    if (aMoraC > 0) {
      const [{ maior }] = await tx
        .select({ maior: sql<number>`coalesce(max(${parcelasTable.numero}), 0)` })
        .from(parcelasTable)
        .where(eq(parcelasTable.contratoId, existente.contratoId));
      idDaMora = randomUUID();
      await tx.insert(parcelasTable).values({
        id: idDaMora,
        lojaId: lojaId as string,
        contratoId: existente.contratoId,
        numero: Number(maior) + 1,
        origem: "MORA",
        /**
         * **S-C71 — o corte em 200 comia a declaração, e não havia coluna
         * pedindo o corte.**
         *
         * Era `.slice(0, 200)` sobre uma frase de **209** caracteres, e o que
         * ficava de fora era exatamente *"Sem correção monetária — o contrato
         * não nomeia índice."* — a linha que o E213 escreveu **para a régua não
         * esconder o próprio alcance**. O carnê dizia à noiva, no portal,
         * *"…o contrato não nomei"*.
         *
         * O 200 era um palpite sobre o banco. Medido no `heliumdb` em
         * 2026-08-13 (`SELECT current_database()` conferido):
         * `parcelas.descricao` é **`text`**, `character_maximum_length` NULO —
         * não há limite a respeitar, e a maior descrição gravada hoje tem
         * **52** caracteres. O spec também não impõe teto
         * (`Parcela.descricao: { type: ["string","null"] }`).
         *
         * Encurtar a frase na origem seria a outra saída, e ela custa a mesma
         * coisa que o corte: `explicacaoDaMora` é **UMA** frase, a que a tela
         * imprime e a que o carnê guarda (S-C50), e o que sobraria de fora seria
         * de novo a parte que declara o que a conta NÃO tem. Piorava com o
         * número: R$ 12.500,00 vencidos há 120 dias dão 216 caracteres, e
         * `dias` de três algarismos empurrava mais um para fora a cada casa.
         */
        descricao: `Multa e juros (cláusula 9ª) — ${mora?.explicacao ?? ""}`,
        valorPrevisto: reais(aMoraC),
        vencimento: existente.vencimento,
        status: "PAGA",
        valorRecebido: reais(aMoraC),
        recebidoEm: parsed.data.recebidoEm,
        formaRecebimento: parsed.data.formaRecebimento,
      });
      await registrarAuditoria(tx, {
        lojaId: lojaId as string,
        usuario: req.usuario!,
        acao: "MORA_RECEBIDA",
        entidade: "parcela",
        entidadeId: idDaMora,
        detalhe: {
          contratoId: existente.contratoId,
          parcelaDeOrigemId: existente.id,
          valor: reais(aMoraC),
          diasDeAtraso: mora?.dias ?? 0,
          multa: mora?.multa ?? 0,
          juros: mora?.juros ?? 0,
          /**
           * **S-C102 — a trilha guarda a frase, não só os números.** A mesma
           * `explicacao` que a tela imprimiu e o carnê guardou na descrição —
           * mas descrição é coluna EDITÁVEL e trilha é append-only, e é a
           * trilha que responde *"por que se cobrou isto?"* depois do fato.
           */
          explicacao: mora?.explicacao ?? "",
        },
      });
    }
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "PARCELA_RECEBIDA",
      entidade: "parcela",
      entidadeId: existente.id,
      detalhe: {
        contratoId: existente.contratoId,
        /**
         * P2 — `numero` NÃO é chave estável, e a trilha o usava como se fosse.
         *
         * `gerar-plano` renumera as parcelas que já existiam (`:1470`): a
         * avulsa de R$ 350,00 que era 1 vira 11 quando o carnê nasce. A linha
         * desta trilha continua dizendo "parcela 1" — e quem conferir o caixa
         * pela auditoria casa o recebimento com a linha ERRADA, que é o oposto
         * exato da razão de a trilha existir.
         *
         * `parcelaId` é imutável e é o que o leitor deve casar. O `numero` fica
         * porque é o que a pessoa vê na tela NO MOMENTO do ato — e a
         * renumeração agora deixa a própria linha `PARCELAS_RENUMERADAS` que
         * explica o de→para.
         */
        parcelaId: existente.id,
        numero: existente.numero,
        // O que entrou NESTE recebimento (a trilha é por ação), mais o
        // acumulado e o que sobrou — sem eles um recebimento parcial na
        // trilha não diz se quitou.
        valorRecebido: parsed.data.valorRecebido,
        /**
         * E221 — o DIA do pagamento, que a trilha não guardava.
         *
         * `recebidoEm` é informado pela vendedora e pode ser anterior ao
         * lançamento: o dinheiro entrou no sábado, ela lança na segunda. A
         * parcela sobrescreve o campo a cada recebimento (é sempre o do
         * ÚLTIMO), então o dia dos recebimentos anteriores só existia aqui —
         * e aqui não estava. O recibo da cláusula 7ª prova *quando* o
         * pagamento foi efetuado; sem esta linha ele dataria pelo instante em
         * que a linha foi escrita, que é outro dia.
         */
        recebidoEm: parsed.data.recebidoEm,
        /**
         * **S-C50 — para onde foi cada real DESTE pagamento.**
         *
         * `valorRecebido` acima é o que a NOIVA pagou; parte dele pode ter ido
         * para outra linha do carnê (a de `MORA`, que o E213 cria aqui mesmo).
         * Eram dois números com um nome só, e a conciliação do recibo (E221)
         * comparava o do pagamento com o `valorRecebido` da PARCELA: os
         * R$ 515,00 do ato contra os R$ 500,00 dela, `515 > 500`, falha
         * fechada — **nenhum papel saía**, nem o do principal nem o da multa.
         *
         * A divisão é decidida nesta transação e em nenhum outro lugar, então
         * é aqui que ela tem de ser dita. `aoPrincipal` é o que fecha com a
         * parcela; `aMora` é o que a cláusula 9ª levou; `moraParcelaId` é a
         * linha que nasceu, para quem for reconstituir o carnê pela trilha.
         *
         * Atos escritos ANTES desta linha não têm os três campos, e o recibo
         * deles cai para `valorRecebido` — que é a verdade daqueles atos, em
         * que a mora não existia. Medido no `heliumdb` em 2026-08-13: 1048
         * linhas `PARCELA_RECEBIDA`, 0 parcelas de origem `MORA`.
         */
        aoPrincipal: reais(aoPrincipalC),
        aMora: reais(aMoraC),
        moraParcelaId: idDaMora,
        totalRecebido: reais(totalRecebidoC),
        saldoRestante: reais(centavos(existente.valorPrevisto) - totalRecebidoC),
        formaRecebimento: parsed.data.formaRecebimento ?? null,
      },
    });
    return atualizada;
  });
  if (!parcela) {
    res.status(409).json({
      error: "PARCELA_MUDOU",
      detalhe: "Esta parcela mudou enquanto você digitava — confira o valor e tente de novo.",
    });
    return;
  }
  res.json(ReceberParcelaResponse.parse(await comOContratoDela(parcela)));
});

/**
 * **E213 — abrir mão da multa e dos juros da cláusula 9ª, dizendo por quê.**
 *
 * A decisão da dona (13/08/2026) foi **automático com gesto de perdoar**: o
 * contrato diz *"deverá incidir"*, então o padrão é cumprir a cláusula. O que
 * vira gesto é o contrário — e é por isso que o notável na trilha não é cobrar,
 * é perdoar: quem decidiu não cobrar R$ 15,00 de uma noiva, quando, e por quê.
 *
 * O motivo é gravado NA PARCELA, e não só na trilha, pela lição do E214: se
 * ficasse só lá, a próxima leitura da cobrança veria uma parcela vencida sem
 * acréscimo e sem explicação ao lado — e é por este campo que a tela desenha o
 * selo.
 */
router.post(
  "/lojas/:lojaId/parcelas/:parcelaId/perdoar-mora",
  requireModulo("contratos", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, parcelaId } = req.params as { lojaId: string; parcelaId: string };
    const parsed = PerdoarMoraBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(erroDeValidacao(parsed.error));
      return;
    }
    const [existente] = await db.select().from(parcelasTable)
      .where(and(eq(parcelasTable.id, parcelaId), eq(parcelasTable.lojaId, lojaId)));
    if (!existente) {
      res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
      return;
    }
    /**
     * Perdoar o que não é devido não é inofensivo: gravaria um selo permanente
     * de "multa perdoada" numa parcela em dia, e a próxima leitura acreditaria
     * que houve uma dívida que nunca existiu. A régua é a mesma que a conta usa
     * — `moraDe` com o perdão IGNORADO, senão o segundo clique se
     * autoconfirmaria.
     */
    if (moraDe({ ...existente, moraPerdoadaEm: null }) === null) {
      res.status(422).json({
        error: "SEM_MORA",
        detalhe: "Esta parcela não está vencida com saldo em aberto — não há multa nem juros a perdoar.",
      });
      return;
    }

    const motivo = parsed.data.motivo.trim();
    const perdoadaEm = new Date();
    const atualizada = await db.transaction(async (tx) => {
      // CAS: a escrita repete a condição LIDA (`mora_perdoada_em IS NULL`).
      // Dois cliques no mesmo segundo — o que acontece quando a rede demora —
      // gravariam dois perdões e duas linhas de trilha para uma decisão.
      const [linha] = await tx.update(parcelasTable)
        .set({ moraPerdoadaEm: perdoadaEm, moraPerdoadaMotivo: motivo })
        .where(and(
          eq(parcelasTable.id, parcelaId),
          eq(parcelasTable.lojaId, lojaId),
          isNull(parcelasTable.moraPerdoadaEm),
        ))
        .returning();
      if (!linha) return null;
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "MORA_PERDOADA",
        entidade: "parcela",
        entidadeId: parcelaId,
        detalhe: {
          contratoId: existente.contratoId,
          motivo,
          // O acréscimo do DIA do perdão: ele cresce, então o número que a
          // decisão dispensou só existe aqui.
          acrescimoDispensado: moraDe({ ...existente, moraPerdoadaEm: null })?.acrescimo ?? 0,
        },
      });
      return linha;
    });
    if (!atualizada) {
      // Perdeu a corrida do duplo clique: o perdão já está de pé, e devolver a
      // parcela como está é a resposta certa — o estado final é o pedido.
      const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
      res.json(PerdoarMoraResponse.parse(await comOContratoDela(linha!)));
      return;
    }
    res.json(PerdoarMoraResponse.parse(await comOContratoDela(atualizada)));
  },
);

/**
 * E213 — desfazer o perdão. Não recalcula nada: a conta é derivada, então ela
 * volta sozinha ao valor de HOJE, que é maior que o do dia do perdão.
 */
router.delete(
  "/lojas/:lojaId/parcelas/:parcelaId/perdoar-mora",
  requireModulo("contratos", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, parcelaId } = req.params as { lojaId: string; parcelaId: string };
    const [existente] = await db.select().from(parcelasTable)
      .where(and(eq(parcelasTable.id, parcelaId), eq(parcelasTable.lojaId, lojaId)));
    if (!existente) {
      res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
      return;
    }
    const atualizada = await db.transaction(async (tx) => {
      // O mesmo CAS na direção contrária: só desfaz o perdão que ainda está de
      // pé, e assim a trilha do restabelecimento nunca conta um fato que não
      // aconteceu.
      const [linha] = await tx.update(parcelasTable)
        .set({ moraPerdoadaEm: null, moraPerdoadaMotivo: null })
        .where(and(
          eq(parcelasTable.id, parcelaId),
          eq(parcelasTable.lojaId, lojaId),
          isNotNull(parcelasTable.moraPerdoadaEm),
        ))
        .returning();
      if (!linha) return null;
      // A trilha das duas pontas: sem esta, o histórico mostraria um perdão que
      // "sumiu", e a parcela voltaria a cobrar sem que nada explicasse.
      if (existente.moraPerdoadaEm) {
        await registrarAuditoria(tx, {
          lojaId,
          usuario: req.usuario!,
          acao: "MORA_RESTABELECIDA",
          entidade: "parcela",
          entidadeId: parcelaId,
          detalhe: {
            contratoId: existente.contratoId,
            perdoadaEm: existente.moraPerdoadaEm,
            motivoDoPerdao: existente.moraPerdoadaMotivo,
          },
        });
      }
      return linha;
    });
    if (!atualizada) {
      const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
      res.json(RestabelecerMoraResponse.parse(await comOContratoDela(linha!)));
      return;
    }
    res.json(RestabelecerMoraResponse.parse(await comOContratoDela(atualizada)));
  },
);

// Estorno avulso: PAGA volta a PREVISTA (volta a ser cobrável), zerando os
// campos de recebimento. Distinto do estorno em massa do cancelamento com
// destinoPago=estornar, que marca as pagas como CANCELADA.
router.post("/lojas/:lojaId/parcelas/:parcelaId/estornar", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
    return;
  }
  // PARCIAL também estorna (E49). O estorno é tudo-ou-nada: a parcela não tem
  // livro de recebimentos, só o acumulado — desfazer "o último pagamento" não
  // é uma operação que o dado sustente. Volta a PREVISTA, zerada, e a trilha
  // guarda quanto foi desfeito.
  if (existente.status !== "PAGA" && existente.status !== "PARCIAL") {
    res.status(422).json({ error: "PARCELA_NAO_PAGA", detalhe: "Só parcelas com recebimento podem ser estornadas" });
    return;
  }
  // Estornar devolve a parcela a PREVISTA (cobrável). Num contrato cancelado
  // isso ressuscitaria uma cobrança de um contrato morto — a receita/DRE leem
  // PREVISTA. Só contrato ativo pode ter parcela mexida.
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  /**
   * S6/E107 — a última leitura-fora-da-transação do módulo.
   *
   * As guardas acima leem a parcela FORA da transação e o `SET` de dentro é
   * absoluto (sempre PREVISTA/null). Dois cliques simultâneos convergem no
   * banco — o estado final é o mesmo —, e por isso o achado é 🔵 e não 🟠: não
   * se perde dinheiro. **O que se perde é a verdade da trilha.**
   *
   * Os dois leem `valorRecebido: 1.000` e os dois gravam
   * `RECEBIMENTO_ESTORNADO` com 1.000 no detalhe: a auditoria passa a dizer que
   * R$ 2.000 foram estornados de uma parcela de R$ 1.000. Quem for reconstituir
   * o caixa pela trilha — que é exatamente para isso que ela existe — encontra
   * um buraco que nunca houve.
   *
   * O conserto é o do B6: o `UPDATE` é CONDICIONAL ao status ainda ser
   * recebido. Só um dos dois casa, e só ele audita. O perdedor não recebe erro:
   * ele pediu "estornada" e a parcela está estornada.
   */
  const desfecho = await db.transaction(async (tx) => {
    /**
     * K7 — o estorno reconferia o status da PARCELA e omitia o do CONTRATO.
     *
     * A guarda de `:1201` chama `contratoAtivo` no pool; o UPDATE abaixo
     * repete a condição de `status` da parcela e nada diz sobre o contrato.
     * Entre as duas cabe o cancelamento inteiro — e ele NÃO fecha esta porta:
     * com `destinoPago: "manter"` (o default) a parcela PAGA continua PAGA,
     * então o `inArray(status, ["PAGA","PARCIAL"])` casa e o estorno volta a
     * parcela para PREVISTA num contrato morto.
     *
     * **Medido:** R$ 1.000,00 de sinal saem do caixa realizado e reaparecem
     * como cobrança ABERTA de uma venda que não existe — no horizonte, no
     * aging e na régua de cobrança que liga para a noiva pedir o dinheiro de
     * um contrato cancelado.
     *
     * A tranca é a do módulo: contrato → parcela. O contrato entra em
     * `FOR UPDATE` e é relido; o cancelamento concorrente ou já commitou (e
     * lemos CANCELADO) ou espera aqui.
     */
    const [contrato] = await tx
      .select({ status: contratosTable.status })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, existente.contratoId), eq(contratosTable.lojaId, lojaId as string)))
      .for("update");
    if (!contrato || contrato.status !== "ATIVO") return { contratoNaoAtivo: true as const };

    const [atualizada] = await tx.update(parcelasTable)
      .set({
        status: "PREVISTA",
        valorRecebido: null,
        recebidoEm: null,
        formaRecebimento: null,
        // F32/E103: o movimento deixou de existir, então não pode continuar
        // "conferido com o extrato". Sem esta linha o carimbo fica órfão e a
        // conciliação seguinte pula uma linha que voltou a ser divergência.
        conciliadoEm: null,
        // E115: o carimbo da contadora sai junto. Ele não guarda história (a
        // trilha guarda) — ele alimenta o `isNull` do próximo envio, e mantê-lo
        // faria o recebimento re-lançado nunca entrar em pacote nenhum.
        enviadoContabilidadeEm: null,
      })
      .where(and(
        eq(parcelasTable.id, existente.id),
        inArray(parcelasTable.status, ["PAGA", "PARCIAL"]),
      ))
      .returning();
    /**
     * P4 — o perdedor da corrida fazia `parse(undefined)`, e virava 500.
     *
     * Este `atual` é tipado `Parcela | undefined` e ia direto para
     * `EstornarParcelaResponse.parse()` lá embaixo. Some a linha entre o UPDATE
     * que não casou e este SELECT — o vencedor devolve a parcela a PREVISTA e
     * um `DELETE /parcelas` (que só aceita PREVISTA) a apaga — e a vendedora lê
     * **"Não consegui falar com o sistema"** numa ação que JÁ tinha acontecido.
     * O 500 é a resposta errada duas vezes: mente sobre a causa e esconde que
     * o estorno foi feito.
     */
    if (!atualizada) {
      const [atual] = await tx.select().from(parcelasTable)
        .where(eq(parcelasTable.id, existente.id));
      if (!atual) return { sumiu: true as const };
      // S6/E107: o perdedor não recebe erro — ele pediu "estornada" e a
      // parcela está estornada. O que ele NÃO faz é auditar de novo.
      return { parcela: atual };
    }
    /**
     * **S-C70 — o estorno devolve o PAGAMENTO, e o pagamento pode ter criado
     * outra linha do carnê.**
     *
     * O E213 fez o que entra além do principal virar parcela própria
     * (`origem: MORA`, nascida PAGA na mesma transação do recebimento). Este
     * estorno zerava só a parcela que a URL nomeia. Medido com sonda no caso
     * da cláusula 9ª — R$ 500,00 vencidos há 30 dias, R$ 515,00 recebidos,
     * estorno em seguida:
     *
     *     [{"origem":"MORA","status":"PAGA","previsto":15,"recebido":15},
     *      {"origem":"PLANO","status":"PREVISTA","previsto":500,"recebido":null}]
     *
     * A loja devolveu **R$ 515,00** à noiva e o carnê seguia dizendo que
     * **R$ 15,00 foram pagos** — no caixa realizado, no DRE e no fluxo, presos
     * a uma dívida que voltou a ser PREVISTA.
     *
     * **A assimetria é que diz qual é o conserto certo:** o cancelamento do
     * contrato NÃO tem o defeito, porque seleciona por `contratoId` (`:1546`) —
     * a linha de MORA entra em `idsComRecebimento` e é zerada junto sob
     * `destinoPago: "estornar"`. O avulso é o único caminho que enxerga uma
     * parcela e não o pagamento, e é isso que esta consulta corrige.
     *
     * **CANCELADA, não PREVISTA** — e é a régua do cancelamento, não uma
     * escolha nova. A mora é DERIVADA (`mora.ts`): com o principal de volta a
     * PREVISTA, a conta da 9ª volta a ser calculada do zero sobre o saldo em
     * aberto. Uma linha de MORA PREVISTA seria a MESMA multa cobrada duas
     * vezes — uma pela linha, outra pela derivação.
     *
     * **O vínculo é a trilha, e ela é a única que o guarda.** `parcelas` não
     * tem coluna apontando a parcela de origem; quem sabe qual linha nasceu de
     * qual recebimento é o `MORA_RECEBIDA` que o E213 grava com
     * `parcelaDeOrigemId` — append-only, e nenhuma rota a apaga. O `where` do
     * UPDATE não confia só no id que veio de lá: confere loja, contrato,
     * origem e o status PAGA.
     */
    const linhasDaMora = await tx
      .select({ id: auditLogTable.entidadeId })
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, lojaId as string),
        eq(auditLogTable.acao, "MORA_RECEBIDA"),
        sql`${auditLogTable.detalhe}->>'parcelaDeOrigemId' = ${existente.id}`,
      ));
    const moraCancelada = linhasDaMora.length > 0
      ? await tx.update(parcelasTable)
          .set({
            status: "CANCELADA",
            valorRecebido: null,
            recebidoEm: null,
            formaRecebimento: null,
            // Os mesmos dois carimbos que o estorno avulso e o em massa já
            // limpam: movimento que deixou de existir não continua conferido,
            // e o da contadora alimenta o `isNull` do próximo envio.
            conciliadoEm: null,
            enviadoContabilidadeEm: null,
          })
          .where(and(
            inArray(parcelasTable.id, linhasDaMora.map((l) => l.id)),
            eq(parcelasTable.lojaId, lojaId as string),
            eq(parcelasTable.contratoId, existente.contratoId),
            eq(parcelasTable.origem, "MORA"),
            eq(parcelasTable.status, "PAGA"),
          ))
          .returning()
      : [];

    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "RECEBIMENTO_ESTORNADO",
      entidade: "parcela",
      entidadeId: existente.id,
      detalhe: {
        contratoId: existente.contratoId,
        // P2: a chave estável é o id — `numero` é o rótulo do momento.
        parcelaId: existente.id,
        numero: existente.numero,
        // O que o estorno desfez — some da parcela, fica na trilha.
        valorRecebido: existente.valorRecebido,
        recebidoEm: existente.recebidoEm,
        // S-C70: o dinheiro devolvido é o do PAGAMENTO, e parte dele podia
        // estar noutra linha. Sem estes dois, "por que saíram R$ 515,00 de uma
        // parcela de R$ 500,00?" não tem resposta depois do fato. A soma é em
        // CENTAVOS inteiros, como todo dinheiro deste repositório.
        linhasDeMoraCanceladas: moraCancelada.length,
        valorDaMoraCancelada: reais(
          moraCancelada.reduce((acc, m) => acc + centavos(m.valorPrevisto), 0),
        ),
      },
    });
    /**
     * Uma linha por parcela de MORA desfeita, e a entidade é ELA — quem abrir a
     * trilha daquela linha do carnê tem de ler ali por que ela morreu, do mesmo
     * jeito que o `MORA_RECEBIDA` conta por que ela nasceu. As duas pontas da
     * 9ª deixam rastro: a que cobrou, a que perdoou e agora a que devolveu.
     */
    for (const m of moraCancelada) {
      await registrarAuditoria(tx, {
        lojaId: lojaId as string,
        usuario: req.usuario!,
        acao: "MORA_ESTORNADA",
        entidade: "parcela",
        entidadeId: m.id,
        detalhe: {
          contratoId: existente.contratoId,
          parcelaDeOrigemId: existente.id,
          // `valorRecebido` já foi zerado pelo UPDATE acima; o previsto da
          // linha de MORA é o mesmo número, porque ela nasce quitada.
          valor: m.valorPrevisto,
          numero: m.numero,
        },
      });
    }
    return { parcela: atualizada };
  });

  if ("contratoNaoAtivo" in desfecho) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }
  if ("sumiu" in desfecho) {
    res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
    return;
  }
  // S-C89: a parcela do atraso estornada segue viva, mas a de um contrato que
  // acabou de reativar cobrança muda o `jaCobrada` da fila.
  derrubarFilaDeAtrasos(lojaId as string);
  res.json(EstornarParcelaResponse.parse(await comOContratoDela(desfecho.parcela)));
});

router.delete("/lojas/:lojaId/parcelas/:parcelaId", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "PARCELA_NAO_ENCONTRADA", detalhe: "Esta parcela não existe nesta loja." });
    return;
  }
  if (existente.status !== "PREVISTA") {
    res.status(422).json({ error: "PARCELA_NAO_PREVISTA", detalhe: "Só parcelas previstas podem ser removidas" });
    return;
  }
  const [contrato] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(eq(contratosTable.id, existente.contratoId));
  if (!contrato || contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  // A trilha vem ANTES do delete, na mesma transação — é a operação espelho do
  // `CONTA_PAGAR_REMOVIDA` que o E107 criou do lado das contas a pagar, pelo
  // mesmo motivo: some com uma obrigação, não move caixa realizado (a parcela
  // paga é recusada acima), e depois do DELETE não há linha para consultar.
  // O que não estiver no detalhe está perdido.
  //
  // S-M22 (rodada 2, achado 3#2): a guarda de PREVISTA leu no POOL — entre
  // ela e o delete cabe o POST /receber inteiro, e o recebimento concorrente
  // era deletado junto: R$ 500,00 na gaveta, caixa dizendo que nunca
  // entraram. `FOR UPDATE` + reconferência, o idioma do estorno duas rotas
  // acima — o CAS do receber atualiza esta mesma linha, a tranca serializa.
  const resultado = await db.transaction(async (tx) => {
    const [atual] = await tx.select().from(parcelasTable)
      .where(eq(parcelasTable.id, existente.id))
      .for("update");
    if (!atual || atual.status !== "PREVISTA") return { corrida: true as const };
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "PARCELA_REMOVIDA",
      entidade: "parcela",
      entidadeId: atual.id,
      detalhe: {
        contratoId: atual.contratoId,
        // P2: a chave estável é o id — `numero` é o rótulo do momento.
        parcelaId: atual.id,
        numero: atual.numero,
        descricao: atual.descricao,
        valorPrevisto: atual.valorPrevisto,
        vencimento: atual.vencimento,
      },
    });
    await tx.delete(parcelasTable).where(eq(parcelasTable.id, atual.id));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    res.status(422).json({ error: "PARCELA_NAO_PREVISTA", detalhe: "Só parcelas previstas podem ser removidas" });
    return;
  }
  // S-C89: apagar a parcela do atraso (`set null` em atraso_parcela_id via FK)
  // devolve o contrato à fila como não-cobrado.
  derrubarFilaDeAtrasos(lojaId as string);
  res.status(204).send();
});

// Gera o plano de pagamento de um contrato sem parcelas. Valores e datas saem
// de `montarPlanoParcelas` (financeiro-core) — a mesma função que a tela de
// orçamento usa para montar o carnê e para mostrar a prévia dele.
// Entrada (se > 0) vira a linha `numero 0` no primeiro vencimento e as N
// parcelas começam um período depois.
// E71: cobrança que nasce DEPOIS do plano — multa por devolução atrasada,
// reparo de avaria, ajuste extra. Entra como parcela do contrato e a régua de
// cobrança, o extrato e o caixa a tratam como qualquer outra.
router.post("/lojas/:lojaId/contratos/:contratoId/parcelas", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = CreateParcelaAvulsaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(422).json({ error: "CONTRATO_INVALIDO", detalhe: "Contrato não encontrado nesta loja" });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: `Contrato está ${contrato.status}` });
    return;
  }

  /**
   * K9 — o número da avulsa era calculado em memória, e a colisão saía como
   * "Já existe um registro com estes dados".
   *
   * O `reduce` sobre `contrato.parcelas` lidas no pool decidia o próximo
   * número, e a UNIQUE (contrato, numero) segurava o duplo POST — mas o que a
   * vendedora lia era o 409 genérico `REGISTRO_DUPLICADO`, no meio de um fluxo
   * de dinheiro. É literalmente o caso que `erros.ts:181-185` registra ter sido
   * lido como regressão financeira por dois minutos. E a mensagem não diz nada:
   * a segunda cobrança de avaria era LEGÍTIMA, só precisava do número seguinte.
   *
   * Sob a tranca do contrato o número é decidido em série, e a colisão deixa de
   * existir em vez de virar mensagem. A releitura do status no mesmo gesto
   * fecha a janela em que o cancelamento passa por aqui no meio — uma cobrança
   * nova num contrato morto é o irmão do K7.
   */
  const desfecho = await db.transaction(async (tx) => {
    const [sobTranca] = await tx
      .select({ status: contratosTable.status })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)))
      .for("update");
    if (!sobTranca) return { sumiu: true as const };
    if (sobTranca.status !== "ATIVO") return { naoAtivo: sobTranca.status };

    const [maior] = await tx
      .select({ numero: sql<number | null>`max(${parcelasTable.numero})` })
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contratoId));
    const numero = Math.max(0, maior?.numero ?? 0) + 1;

    const [parcela] = await tx
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId,
        contratoId,
        numero,
        descricao: parsed.data.descricao,
        valorPrevisto: parsed.data.valorPrevisto,
        vencimento: parsed.data.vencimento,
      })
      .returning();
    return { parcela };
  });

  if ("sumiu" in desfecho) {
    res.status(422).json({ error: "CONTRATO_INVALIDO", detalhe: "Contrato não encontrado nesta loja" });
    return;
  }
  if ("naoAtivo" in desfecho) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: `Contrato está ${desfecho.naoAtivo}` });
    return;
  }
  res.status(201).json(CreateParcelaAvulsaResponse.parse(desfecho.parcela));
});

router.post("/lojas/:lojaId/contratos/:contratoId/parcelas/gerar-plano", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = GerarPlanoParcelasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }
  /**
   * S26 — a pergunta é "já tem CARNÊ?", e era "já tem parcela?".
   *
   * `parcelas.length > 0` trancava o contrato em 409 para sempre quando a loja
   * fazia a coisa na ordem do balcão: a peça volta avariada, cobra-se o
   * conserto, e só então se monta o parcelamento. Uma venda inteira parcelada
   * fora do sistema por causa de um reparo de R$ 350 — e sem caminho de volta,
   * porque a parcela do reparo não se apaga (ela é a cobrança).
   */
  const totalCentavos = centavos(Number(contrato.valorTotal));
  /**
   * P7 (E169) — o carnê que perdeu uma parcela passa a ter volta.
   *
   * `DELETE /parcelas/:id` aceita qualquer parcela PREVISTA, inclusive uma do
   * carnê. Removida a parcela 10 de R$ 500,00 de um contrato de R$ 5.000,00, o
   * plano passava a somar **R$ 4.500,00**, `origem: PLANO` continuava
   * existindo, e este 409 fechava a porta para sempre: **não havia gesto
   * nenhum na aplicação que devolvesse aqueles R$ 500,00**, nem por API. A
   * parcela avulsa não serve — ela nasce `AVULSA`/`AVARIA`, fica fora do carnê
   * e é justamente o que o P8 tirou da soma.
   *
   * A pergunta deixa de ser "já tem carnê?" e passa a ser "o carnê FECHA?".
   * Fechando, o 409 é o de sempre; faltando, o gerar-plano monta as parcelas do
   * FALTANTE e as pendura depois das que existem.
   */
  const jaTemCarne = temCarne(contrato.parcelas);
  const faltanteCentavos = faltanteDoCarneCentavos(contrato.parcelas, totalCentavos);
  if (jaTemCarne && faltanteCentavos === 0) {
    res.status(409).json({ error: "JA_TEM_PLANO", detalhe: "Contrato já possui carnê" });
    return;
  }
  const completando = jaTemCarne;

  const entradaCentavos = completando ? 0 : centavos(parsed.data.entrada ?? 0);
  /**
   * Completar não cria ENTRADA: `numero === 0` significa entrada em seis
   * pontos do sistema (as três telas de parcela, o portal da noiva, a
   * conciliação e o PDF), e a entrada do contrato já foi combinada quando o
   * carnê nasceu. Aceitar o campo em silêncio mudaria o valor que a noiva vê
   * sem dizer nada — 422 com o gesto na frase.
   */
  if (completando && centavos(parsed.data.entrada ?? 0) > 0) {
    res.status(422).json({
      error: "ENTRADA_NO_COMPLEMENTO",
      detalhe: "A entrada só existe quando o carnê nasce — para completar o que falta, deixe a entrada em branco.",
      campos: [{ campo: "entrada", motivo: "Deixe em branco para completar o carnê" }],
    });
    return;
  }
  if (entradaCentavos > totalCentavos) {
    res.status(422).json({ error: "ENTRADA_MAIOR", detalhe: "Entrada maior que o valor total do contrato" });
    return;
  }
  /**
   * P5 — `numParcelas: 2.5` era a ÚNICA validação do carnê que não devolvia 422.
   *
   * O spec declara `numParcelas: { type: integer, minimum: 1, maximum: 360 }`
   * (`openapi.yaml:6279`) e o zod gerado devolve `zod.number().min(1).max(360)`
   * — o gerador **perde o `integer`**. O fracionário passava pela porta, chegava
   * a `montarPlanoParcelas`, batia no `!Number.isInteger(n)` de
   * `plano.ts:84` e subia `PLANO_SEM_PARCELAS` como exceção não tratada: 500,
   * e a vendedora lendo "Não consegui falar com o sistema" por ter digitado
   * um ponto.
   *
   * A guarda mora aqui, e não numa edição do arquivo gerado (que a próxima
   * geração apagaria). O `try` embaixo é o cinto: as três recusas do
   * financeiro-core são regra de negócio, e regra de negócio é 422.
   */
  if (!Number.isInteger(parsed.data.numParcelas)) {
    res.status(422).json({
      error: "NUM_PARCELAS_INVALIDO",
      detalhe: "O número de parcelas tem de ser inteiro.",
      campos: [{ campo: "numParcelas", motivo: "Use um número inteiro de parcelas" }],
    });
    return;
  }

  // E95: o carnê sai do MESMO `montarPlanoParcelas` que a tela de orçamento
  // usa. Antes esta rota espaçava por 30 dias corridos e a tela por mês, e
  // `primeiroVencimento` significava a ENTRADA aqui e a PARCELA 1 lá — o mesmo
  // campo mudando de sentido conforme houvesse entrada. A régua agora é uma:
  // mensal por dia fixo, e `primeiroVencimento` é sempre a parcela 1.
  let plano;
  try {
    plano = montarPlanoParcelas({
      // P7: completando, o que se divide é o BURACO, não o contrato inteiro.
      totalCentavos: completando ? faltanteCentavos : totalCentavos,
      entradaCentavos,
      numParcelas: parsed.data.numParcelas,
      primeiroVencimento: diaDeNegocio(parsed.data.primeiroVencimento),
      vencimentoEntrada: parsed.data.vencimentoEntrada
        ? diaDeNegocio(parsed.data.vencimentoEntrada)
        : undefined,
    });
  } catch (err) {
    // P5: as recusas do financeiro-core são regra de negócio — 422, com o nome
    // da regra no código. Qualquer outra coisa é defeito nosso e sobe.
    const nome = err instanceof Error ? err.message : "";
    if (nome.startsWith("PLANO_")) {
      res.status(422).json({ error: nome, detalhe: "Este plano de parcelas não fecha — confira entrada e número de parcelas." });
      return;
    }
    throw err;
  }

  /**
   * **E218 — o restante entra até 20 dias antes da retirada** (§ único do
   * objeto). A guarda é sobre o plano MONTADO, e não sobre o que a vendedora
   * digitou: o que sai daqui são as datas que o carnê vai ter, e é sobre elas
   * que a cláusula fala.
   *
   * **Só a última importa**, e é o que a frase da recusa diz: as parcelas do
   * carnê são crescentes, então a que estoura o prazo mais tarde é a que decide
   * se o dinheiro entra antes de a peça sair pela porta.
   *
   * Sem `dataRetirada` não há prazo, e é a maioria — 722 dos 723 contratos não
   * a declaram (S-C35). A régua nasce quase sem população, de propósito: ela
   * cresce quando o gesto de preencher a retirada existir.
   */
  const ultima = plano[plano.length - 1];
  const foraDoPrazo = ultima
    ? foraDoPrazoDaRetirada(ancoraDeNegocio(ultima.vencimento), contrato.dataRetirada)
    : null;
  if (foraDoPrazo) {
    res.status(422).json({
      error: "CARNE_DEPOIS_DO_PRAZO",
      detalhe: foraDoPrazo.detalhe,
      campos: [
        {
          campo: "primeiroVencimento",
          motivo: `O carnê inteiro tem de vencer até ${foraDoPrazo.limite.split("-").reverse().join("/")}`,
        },
      ],
    });
    return;
  }

  const linhas: (typeof parcelasTable.$inferInsert)[] = plano.map((p) => ({
    id: randomUUID(),
    lojaId,
    contratoId: contrato.id,
    numero: p.numero,
    origem: "PLANO" as const,
    descricao: p.descricao,
    valorPrevisto: reais(p.valorCentavos),
    vencimento: ancoraDeNegocio(p.vencimento),
  }));

  /**
   * S26 — o carnê nasce em 0..N, e quem já estava lá se desloca para depois.
   *
   * A direção não é escolha de estilo: **`numero === 0` significa ENTRADA** em
   * seis pontos do sistema (as três telas de parcela, o portal da noiva, a
   * conciliação e o PDF do contrato). Deslocar o carnê para caber depois do
   * reparo tiraria a entrada do slot 0 e quebraria a régua nos seis de uma vez;
   * deslocar o reparo não quebra nada — o que a noiva lê é a `descricao`
   * ("Reparo de avaria — …"), e o `numero` é ordenação.
   *
   * O deslocamento é em DOIS passos, com um estágio negativo no meio, porque a
   * UNIQUE (contrato, numero) não deixa passar por cima: mover 1 → 5 direto
   * funcionaria hoje, mas com três avulsas e um carnê curto os intervalos se
   * cruzam. Negativo não colide com nada, e a transação inteira desfaz se algo
   * falhar no meio.
   */
  const maiorDoPlano = plano.reduce((m, p) => Math.max(m, p.numero), 0);

  const desfecho = await db.transaction(async (tx) => {
    /**
     * E158 — as duas guardas desta rota também liam no pool.
     *
     * `contrato.status` e `jaTemCarne` vêm do `findFirst` de `:1383`, fora
     * desta transação. Dois cliques em "gerar carnê" no mesmo segundo liam os
     * dois `jaTemCarne === false` e montavam DOIS carnês: uma venda de
     * R$ 5.000,00 com R$ 10.000,00 em parcelas — o estrago exato da S-M3,
     * entrando pela porta que a S-M3 não enumerou. Não estava na lista do
     * plano do E158; foi visto ao consertar o P2, e fica porque a tese do
     * épico é ESTA (`toda guarda relê sob a tranca`) e o conserto mora na
     * transação que o P2 já obrigava a mexer.
     *
     * A tranca é a do módulo: contrato → parcelas.
     */
    const [sobTranca] = await tx
      .select({ status: contratosTable.status })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)))
      .for("update");
    if (!sobTranca) return { sumiu: true as const };
    if (sobTranca.status !== "ATIVO") return { naoAtivo: true as const };

    const parcelasAgora = await tx
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));
    /**
     * P7 — a releitura sob a tranca faz a MESMA pergunta nova do pool: o carnê
     * fecha? Quem chegou para completar e encontra o buraco já tapado (ou o
     * buraco de outro tamanho, porque uma segunda parcela caiu no meio) recebe
     * 409 em vez de gravar um complemento que não fecha mais.
     */
    const faltanteAgora = faltanteDoCarneCentavos(parcelasAgora, totalCentavos);
    if (completando) {
      if (faltanteAgora !== faltanteCentavos) return { jaTemCarne: true as const };
    } else if (temCarne(parcelasAgora)) {
      return { jaTemCarne: true as const };
    }

    if (completando) {
      /**
       * Completar não renumera nada: as parcelas que existem ficam onde estão
       * (o `numero` delas já foi citado por trilhas de recebimento — P2), e o
       * complemento entra no fim da fila.
       *
       * A descrição não repete o formato "Parcela i/n" do carnê original: o
       * `n` de lá é o tamanho de um carnê que já não existe, e imprimir
       * "Parcela 1/1" ao lado de "Parcela 9/10" mentiria no papel do E165.
       */
      const proximo = parcelasAgora.reduce((m, p) => Math.max(m, p.numero), 0) + 1;
      const complemento = plano.map((p, i) => ({
        id: randomUUID(),
        lojaId,
        contratoId: contrato.id,
        numero: proximo + i,
        origem: "PLANO" as const,
        descricao: `Parcela ${proximo + i}`,
        valorPrevisto: reais(p.valorCentavos),
        vencimento: ancoraDeNegocio(p.vencimento),
      }));
      const criadas = await tx.insert(parcelasTable).values(complemento).returning();
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "CARNE_COMPLETADO",
        entidade: "contrato",
        entidadeId: contrato.id,
        detalhe: {
          motivo: "O carnê somava menos que o contrato — as parcelas do faltante foram geradas",
          faltanteAntes: reais(faltanteCentavos),
          parcelas: criadas.map((p) => ({
            parcelaId: p.id,
            numero: p.numero,
            valorPrevisto: p.valorPrevisto,
            vencimento: p.vencimento,
          })),
        },
      });
      return { criadas };
    }

    const paraDeslocar = [...parcelasAgora].sort((a, b) => a.numero - b.numero);
    for (const p of paraDeslocar) {
      await tx.update(parcelasTable)
        .set({ numero: -(p.numero + 1) })
        .where(eq(parcelasTable.id, p.id));
    }
    // createMany atômico: sem plano parcial.
    const doPlano = await tx.insert(parcelasTable).values(linhas).returning();
    for (const [i, p] of paraDeslocar.entries()) {
      await tx.update(parcelasTable)
        .set({ numero: maiorDoPlano + 1 + i })
        .where(eq(parcelasTable.id, p.id));
    }

    /**
     * P2 — a renumeração passa a deixar rastro.
     *
     * Sem esta linha, a parcela PAGA de R$ 350,00 que era 1 vira 11 e NADA no
     * sistema explica por quê: a trilha do recebimento diz "parcela 1", a tela
     * mostra "parcela 11", e quem conferir o caixa pela auditoria casa o
     * dinheiro com a linha errada. O `parcelaId` que as trilhas de parcela
     * agora gravam resolve o casamento; esta linha resolve a PERGUNTA — por que
     * o número mudou, e quando.
     */
    if (paraDeslocar.length > 0) {
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "PARCELAS_RENUMERADAS",
        entidade: "contrato",
        entidadeId: contrato.id,
        detalhe: {
          motivo: "Carnê gerado depois: o plano ocupa 0..N e as avulsas vão para depois",
          deParaPorParcela: paraDeslocar.map((p, i) => ({
            parcelaId: p.id,
            descricao: p.descricao,
            de: p.numero,
            para: maiorDoPlano + 1 + i,
          })),
        },
      });
    }

    return { criadas: doPlano };
  });

  if ("sumiu" in desfecho) {
    res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
    return;
  }
  if ("naoAtivo" in desfecho) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }
  if ("jaTemCarne" in desfecho) {
    res.status(409).json({ error: "JA_TEM_PLANO", detalhe: "Contrato já possui carnê" });
    return;
  }

  const criadas = [...desfecho.criadas].sort((a, b) => a.numero - b.numero);
  res.status(201).json(GerarPlanoParcelasResponse.parse(criadas));
});

export default router;
