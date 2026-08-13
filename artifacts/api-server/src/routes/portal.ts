import { Router, type IRouter } from "express";
import {
  db,
  portalTokensTable,
  lojasTable,
  leadsTable,
  lookbooksTable,
  lookbookItensTable,
  orcamentosTable,
  contratosTable,
  parcelasTable,
  atendimentosTable,
  contratoItensTable,
  bloqueioVestidosTable,
  contratoBloqueiosTable,
  vestidoFotosTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, desc, asc, gte, inArray, isNull } from "drizzle-orm";
import {
  GetPortalQueryParams,
  GetPortalResponse,
  AceitarPortalQueryParams,
  AceitarPortalResponse,
  GetPortalFotoQueryParams,
  ConfirmarProvaPortalQueryParams,
  ConfirmarProvaPortalResponse,
  PedirRemarcacaoPortalQueryParams,
  PedirRemarcacaoPortalResponse,
  GetPortalContratoPdfQueryParams,
  GetPortalReciboPdfQueryParams,
  GetPortalLeadResponse,
  CriarPortalLeadResponse,
  ListPortaisResponse,
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { gerarTokenConvite } from "../lib/auth";
import { leadNaLoja } from "../lib/escopo-loja";
import { aceitarOrcamentoEnviado, mensagemValidadeVencida } from "../lib/aceite-orcamento";
import {
  montarOrcamentoPublico,
  montarVestidosLookbook,
  montarVestidoDaNoiva,
} from "../lib/visao-noiva";
import { pdfDoContrato, nomeDoArquivo } from "../lib/contrato-do-papel";
import { nomeDoArquivoDoRecibo, pdfDoRecibo, recibosDoContrato } from "../lib/recibo-do-papel";
import { trilhaDosRecibos } from "../lib/recibos-do-banco";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";
// E213 — a multa e os juros da cláusula 9ª, derivados no mesmo lugar que a
// fila de cobrança e o carnê usam.
import { moraDe } from "../lib/mora-da-parcela";
import { abertoEmCentavos, brutoEmCentavos, estaAberta, reais, saldoAberto } from "@workspace/financeiro-core";

/**
 * E78 — o portal da noiva: UM link para tudo dela. A noiva recebia até três
 * links soltos (orçamento E13, lookbook E21) e nada de provas/parcelas; agora
 * um token por NOIVA abre a proposta (com aceite E74), o lookbook provado,
 * as próximas provas e — depois do contrato — o extrato de parcelas DELA.
 *
 * Mesmo modelo das irmãs públicas: token 256 bits em QUERY (o logger corta a
 * query — jamais cai em log), 404 para desconhecido/revogado, 410 para
 * expirado. Rotas públicas primeiro; gestão atrás de sessão + módulo leads.
 */
const PORTAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

/** Portal válido com noiva e loja, ou o motivo da recusa. */
async function buscarPorToken(token: string) {
  const [linha] = await db
    .select({
      portal: portalTokensTable,
      lojaNome: lojasTable.nome,
      // F35: os dados PÚBLICOS da loja — os mesmos da vitrine. O telefone da
      // vendedora não entra aqui (cuidado (a) do épico).
      lojaEndereco: lojasTable.endereco,
      lojaTelefone: lojasTable.telefone,
      lead: leadsTable,
    })
    .from(portalTokensTable)
    .innerJoin(lojasTable, eq(lojasTable.id, portalTokensTable.lojaId))
    .innerJoin(leadsTable, eq(leadsTable.id, portalTokensTable.leadId))
    .where(eq(portalTokensTable.token, token));
  // Revogado responde como desconhecido (404), não 410: "expirou" convida a
  // pedir outro; o link morto de propósito não deve dizer que um dia valeu.
  if (!linha || linha.portal.revogadoEm) return null;
  return linha;
}

/**
 * A proposta que o portal exibe (e que o aceite mira): a mais recente que a
 * vendedora ENVIOU — aprovada continua aparecendo como comprovante.
 */
async function orcamentoDoPortal(lojaId: string, leadId: string) {
  const [orcamento] = await db
    .select()
    .from(orcamentosTable)
    .where(and(
      eq(orcamentosTable.lojaId, lojaId),
      eq(orcamentosTable.leadId, leadId),
      inArray(orcamentosTable.status, ["ENVIADO", "APROVADO"]),
    ))
    .orderBy(desc(orcamentosTable.createdAt))
    .limit(1);
  return orcamento ?? null;
}

router.get("/portal", async (req, res): Promise<void> => {
  const parsed = GetPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }
  const { portal, lojaNome, lojaEndereco, lojaTelefone, lead } = linha;

  /**
   * "Ela abriu" do card da vendedora — cada abertura move o carimbo.
   *
   * F38/E100 — e cada abertura RENOVA o prazo. O noivado dura um ano e o link
   * durava 30 dias contados da geração: a noiva voltava ao favorito em setembro
   * e lia "este link expirou", que é mais uma mensagem de WhatsApp; do lado de
   * dentro, a mensagem de cobrança do E84 passava a sair sem o link, calada.
   *
   * O espírito da política de 30 dias fica de pé, porque a janela é de
   * INATIVIDADE: o link de quem usa não morre, o de quem parou morre igual. E
   * renovar não RESSUSCITA nada — o 410 acima roda antes, então portal vencido
   * continua vencido e revogado continua 404. Só o acesso vivo estica o prazo.
   */
  await db.update(portalTokensTable)
    .set({ ultimoAcessoEm: new Date(), expiraEm: new Date(Date.now() + PORTAL_TTL_MS) })
    .where(eq(portalTokensTable.id, portal.id));

  const agora = new Date();
  const [orcamento, lookbook, provas, contrato] = await Promise.all([
    orcamentoDoPortal(portal.lojaId, portal.leadId),
    // O lookbook mais recente da noiva — o portal não depende do token antigo.
    db.select().from(lookbooksTable)
      .where(and(eq(lookbooksTable.lojaId, portal.lojaId), eq(lookbooksTable.leadId, portal.leadId)))
      .orderBy(desc(lookbooksTable.createdAt))
      .limit(1),
    // Só as futuras: o portal aponta para a frente. O id endereça o E85
    // (confirmar presença por este link).
    db.select({
      id: atendimentosTable.id,
      inicio: atendimentosTable.inicio,
      confirmadoEm: atendimentosTable.confirmadoEm,
      remarcacaoPedidaEm: atendimentosTable.remarcacaoPedidaEm,
    })
      .from(atendimentosTable)
      .where(and(
        eq(atendimentosTable.lojaId, portal.lojaId),
        eq(atendimentosTable.leadId, portal.leadId),
        eq(atendimentosTable.tipo, "PROVA"),
        gte(atendimentosTable.inicio, agora),
      ))
      .orderBy(asc(atendimentosTable.inicio)),
    db.select().from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, portal.lojaId),
        eq(contratosTable.leadId, portal.leadId),
        eq(contratosTable.status, "ATIVO"),
      ))
      .orderBy(desc(contratosTable.fechadoEm))
      .limit(1),
  ]);

  // O extrato DELA: as parcelas do contrato ativo, por número. O escopo por
  // contratoId (do contrato DESTA noiva) é o que garante que valores de outra
  // noiva jamais aparecem.
  const [parcelas, itensDoContrato, vestido] = contrato[0]
    ? await Promise.all([
        db.select().from(parcelasTable)
          .where(eq(parcelasTable.contratoId, contrato[0].id))
          .orderBy(asc(parcelasTable.numero)),
        // F21: o snapshot congelado no fechamento — não o orçamento vivo, que
        // pode ter sido editado depois (E75).
        db.select().from(contratoItensTable)
          .where(eq(contratoItensTable.contratoId, contrato[0].id))
          .orderBy(asc(contratoItensTable.createdAt)),
        montarVestidoDaNoiva(contrato[0]),
      ])
    : [[], [], null];

  /**
   * F36/E100 — as duas respostas que ela abre o link para procurar.
   *
   * O extrato lista oito linhas num celular e não dizia "falta pagar R$ X" nem
   * "a próxima vence em DD/MM" — a uma soma de distância. Cada pergunta que o
   * portal não responde volta como mensagem de WhatsApp para a vendedora, que é
   * exatamente o custo que o E78 existia para reduzir.
   *
   * Em centavos, pelo mesmo motor do resto do sistema: `abertoEmCentavos`
   * desconta o que já entrou numa parcela PARCIAL — mostrar o previsto cheio
   * cobraria de novo o que ela já pagou, na tela dela. Desde o E125 a soma é a
   * MESMA função que a tela do contrato e a ficha usam para "falta receber".
   */
  /**
   * E221 — os recibos DELA, na mesma resposta do extrato.
   *
   * A cláusula 7ª manda a locadora FORNECER os recibos, e fornecer é a noiva
   * conseguir pegar sozinha: o portal já é onde ela vê o que pagou e o que
   * falta, e o recibo é o comprovante da linha que ela está olhando. Uma rota
   * de listagem à parte cobraria dela um segundo carregamento para descobrir
   * que existem — e o portal é a tela que ela abre no celular.
   *
   * Vem vazio quando não há contrato: sem contrato não há parcela, e sem
   * parcela não há recebimento.
   */
  const recibos = contrato[0]
    ? recibosDoContrato(
        parcelas,
        await trilhaDosRecibos(portal.lojaId, contrato[0].id, parcelas.map((p) => p.id)),
      )
    : [];

  const abertas = parcelas.filter((p) => estaAberta(p));
  const faltaPagarC = abertoEmCentavos(parcelas);
  const proxima = [...abertas].sort(
    (a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime(),
  )[0];

  // As duas montagens são independentes e eram `await`adas em sequência DENTRO
  // do literal — uma esperava a outra sem precisar. O portal é a tela que a
  // noiva abre no celular, e cada uma delas é um punhado de consultas.
  const [visaoOrcamento, visaoLookbook] = await Promise.all([
    orcamento ? montarOrcamentoPublico(orcamento, lojaNome, lead.noivaNome) : null,
    lookbook[0] ? montarVestidosLookbook(lookbook[0].id) : null,
  ]);

  res.json(
    GetPortalResponse.parse({
      noivaNome: lead.noivaNome,
      lojaNome,
      lojaEndereco,
      lojaTelefone,
      // Só quando há contrato: sem ele, um "falta pagar R$ 0,00" afirmaria algo
      // sobre um acordo que não existe.
      resumoPagamento: contrato[0]
        ? {
            faltaPagar: reais(faltaPagarC),
            proximaEm: proxima?.vencimento ?? null,
            proximaValor: proxima ? saldoAberto(proxima) : null,
          }
        : null,
      orcamento: visaoOrcamento,
      lookbook: visaoLookbook ? { vestidos: visaoLookbook } : null,
      provas,
      parcelas: parcelas
        .filter((p) => p.status !== "CANCELADA")
        .map((p) => ({
          numero: p.numero,
          descricao: p.descricao,
          valorPrevisto: p.valorPrevisto,
          valorRecebido: p.valorRecebido,
          vencimento: p.vencimento,
          status: p.status,
          // E213 — o MESMO helper da fila de cobrança e do carnê. A noiva é a
          // devedora: descobrir a multa só quando a vendedora manda a mensagem
          // é a classe de defeito que o E211 fechou do outro lado.
          mora: moraDe(p),
        })),
      /**
       * E221 — os comprovantes. O que desce é o que o papel precisa para ser
       * ESCOLHIDO na tela (qual pagamento, de quanto, de que dia); quem
       * lançou fica de fora, pela mesma razão que o telefone da vendedora
       * ficou fora do rodapé (F35): o portal é público por token.
       */
      recibos: recibos.map((r) => ({
        id: r.id,
        parcela: r.parcela,
        valor: r.valor,
        // S-C50 — a divisão do pagamento. Ela desce porque a noiva é quem
        // estranha o número: R$ 515,00 ao lado de uma parcela de R$ 500,00 sem
        // a multa dita é o que gera a ligação para a loja.
        valorNaParcela: r.valorNaParcela,
        mora: r.mora,
        pagoEm: r.pagoEm,
        forma: r.forma,
      })),
      /**
       * F21 — o contrato assinado, o único artefato do sistema que não tinha
       * caminho até ela. O `totalBruto` sai da SOMA DOS ITENS e não de um campo
       * gravado: com desconto, `valorTotal` é o líquido, e sem o bruto ao lado
       * a tela dela mostraria itens que não somam o total do próprio contrato.
       */
      contrato: contrato[0]
        ? {
            valorTotal: contrato[0].valorTotal,
            // `brutoEmCentavos` é a régua do core (E95/C1) e estava
            // reimplementada aqui, linha por linha igual — inclusive a ordem
            // "converte antes de multiplicar", que é o ponto dela.
            totalBruto: reais(brutoEmCentavos(itensDoContrato)),
            descontoTipo: contrato[0].descontoTipo,
            descontoValor: contrato[0].descontoValor,
            fechadoEm: contrato[0].fechadoEm,
            dataCasamento: contrato[0].dataCasamento,
            itens: itensDoContrato.map((it) => ({
              tipo: it.tipo,
              descricao: it.descricao,
              quantidade: it.quantidade,
              valorUnitario: it.valorUnitario,
            })),
          }
        : null,
      // F39 — "O seu vestido". Null quando o contrato não prende reserva.
      vestido,
    }),
  );
});

/**
 * F21/E100 — o PDF do contrato pelo token da noiva.
 *
 * O papel é o MESMO da loja (`lib/contrato-do-papel.ts`); o que muda é a prova
 * de quem pode vê-lo. Cuidado (d) do épico, cumprido: TTL **e** revogação, na
 * mesma ordem das outras quatro rotas públicas.
 *
 * E não há id de contrato na URL — ele sai do `leadId` do token. Uma rota
 * pública que aceitasse `:contratoId` teria de provar o pertencimento a cada
 * chamada; esta não tem o que provar, porque não há o que adivinhar.
 */
router.get("/portal/contrato-pdf", async (req, res): Promise<void> => {
  const parsed = GetPortalContratoPdfQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(
      eq(contratosTable.lojaId, linha.portal.lojaId),
      eq(contratosTable.leadId, linha.portal.leadId),
      eq(contratosTable.status, "ATIVO"),
    ),
    with: { loja: true, lead: true, parcelas: true, itens: true },
    orderBy: desc(contratosTable.fechadoEm),
  });
  // Cancelado não desce: o papel que ela guardar tem de ser o que vale.
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_INEXISTENTE" });
    return;
  }

  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="${nomeDoArquivo(contrato)}"`);
  res.send(Buffer.from(pdfDoContrato(contrato)));
});

/**
 * E221 — o PDF de UM recibo, pelo token da noiva. A sexta rota pública com
 * documento financeiro dentro.
 *
 * O `reciboId` está na query, e diferente do contrato ele NÃO sai do token
 * sozinho — um contrato ativo é um; recibos são muitos, e ela escolhe qual.
 * A prova de pertencimento é por CONSTRUÇÃO e não por comparação: os recibos
 * são montados a partir das parcelas do contrato ATIVO **desta** noiva, e o id
 * pedido é procurado dentro dessa lista. Um id de outra noiva não está lá — não
 * há caminho em que ele passe.
 *
 * O mesmo `find` cobre o estorno: recebimento desfeito não está entre os
 * válidos, e a resposta é 404 em vez de um comprovante de dinheiro que voltou.
 */
router.get("/portal/recibo-pdf", async (req, res): Promise<void> => {
  const parsed = GetPortalReciboPdfQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(
      eq(contratosTable.lojaId, linha.portal.lojaId),
      eq(contratosTable.leadId, linha.portal.leadId),
      eq(contratosTable.status, "ATIVO"),
    ),
    with: { loja: true, lead: true, parcelas: true },
    orderBy: desc(contratosTable.fechadoEm),
  });
  if (!contrato) {
    res.status(404).json({ error: "CONTRATO_INEXISTENTE" });
    return;
  }

  const trilha = await trilhaDosRecibos(
    linha.portal.lojaId,
    contrato.id,
    contrato.parcelas.map((p) => p.id),
  );
  const recibo = recibosDoContrato(contrato.parcelas, trilha).find(
    (r) => r.id === parsed.data.reciboId,
  );
  if (!recibo) {
    res.status(404).json({ error: "RECIBO_NAO_ENCONTRADO" });
    return;
  }

  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="${nomeDoArquivoDoRecibo(recibo, contrato.lead)}"`);
  res.send(Buffer.from(pdfDoRecibo({ recibo, loja: contrato.loja, lead: contrato.lead, contrato })));
});

// O aceite pelo portal delega à MESMA rotina do E74 (uma transação, um
// invariante) — o alvo é o mesmo orçamento que o GET exibe.
router.post("/portal/aceite", async (req, res): Promise<void> => {
  const parsed = AceitarPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const orcamento = await orcamentoDoPortal(linha.portal.lojaId, linha.portal.leadId);
  if (!orcamento) {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: "Não há proposta enviada" });
    return;
  }
  /**
   * C8: a pré-condição é feita UMA vez, sob a tranca, dentro da rotina — esta
   * rota só traduz o desfecho para HTTP.
   *
   * S-O7/E166 — o portal passa a mandar `versao`, e a sobra do E160 fecha. Ela
   * ficou aberta com o argumento "a página dele não exibe número de versão,
   * então não há o que comparar"; o argumento estava errado de lado. Exibir não
   * é o ponto — a página do portal **recebe** `versaoNumero` desde sempre (o
   * portal monta a proposta com a mesma `montarOrcamentoPublico`), e o que
   * prova que a proposta não mudou embaixo dela é mandar de volta o número que
   * ela LEU. A proteção deixa de ser só a leitura sob tranca.
   */
  const desfecho = await aceitarOrcamentoEnviado(
    orcamento,
    linha.lead.noivaNome,
    parsed.data.versao,
  );
  if (!desfecho.ok) {
    if (desfecho.motivo === "SUMIU") {
      res.status(404).json({ error: "LINK_INVALIDO" });
      return;
    }
    if (desfecho.motivo === "VERSAO_MUDOU") {
      res.status(409).json({ error: "PROPOSTA_MUDOU", detalhe: "Esta proposta foi atualizada — recarregue a página." });
      return;
    }
    if (desfecho.motivo === "VALIDADE_VENCIDA") {
      res.status(422).json({
        error: "VALIDADE_VENCIDA",
        detalhe: mensagemValidadeVencida(desfecho.validade),
      });
      return;
    }
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${desfecho.status}` });
    return;
  }
  res.json(AceitarPortalResponse.parse({ aceitoEm: desfecho.aceitoEm }));
});

// E85: a noiva confirma a presença pelo portal — o MESMO carimbo do E39
// (confirmadoEm), com a noiva como autora na auditoria, como no aceite. A
// rota autenticada continua a dela: autoria de sessão é outra rotina.
router.post("/portal/provas/:atendimentoId/confirmar", async (req, res): Promise<void> => {
  const parsed = ConfirmarProvaPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // O token escopa: a prova tem de ser DO lead do portal — de outra noiva é
  // 404 mesmo existindo, como na foto.
  const atendimentoId = req.params.atendimentoId as string;
  const prova = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId),
      eq(atendimentosTable.lojaId, linha.portal.lojaId),
      eq(atendimentosTable.leadId, linha.portal.leadId),
    ),
  });
  if (!prova) {
    res.status(404).json({ error: "PROVA_INEXISTENTE" });
    return;
  }
  // Idempotente ANTES das réguas: a prova confirmada ontem que virou hoje não
  // pode responder 422 no segundo clique.
  if (prova.confirmadoEm) {
    res.json(ConfirmarProvaPortalResponse.parse({ confirmadoEm: prova.confirmadoEm }));
    return;
  }
  if (prova.tipo !== "PROVA" || prova.situacao !== "AGENDADO" || prova.inicio <= new Date()) {
    res.status(422).json({ error: "NADA_A_CONFIRMAR", detalhe: "não é uma prova futura agendada" });
    return;
  }

  const agora = new Date();
  // O `.returning()` do UPDATE já traz o carimbo de quem VENCEU a corrida — o
  // SELECT extra depois da transação relia o que a transação acabou de
  // devolver. Ele continua existindo, mas só para o PERDEDOR, que precisa ler o
  // carimbo que ficou gravado (devolver `agora` ali afirmaria uma hora que não
  // existe no banco — o mesmo defeito do aceite do orçamento).
  const confirmadoNaHora = await db.transaction(async (tx) => {
    // UPDATE condicional: dois cliques simultâneos gravam UM carimbo.
    const [atualizado] = await tx
      .update(atendimentosTable)
      .set({ confirmadoEm: agora, updatedAt: agora })
      .where(and(eq(atendimentosTable.id, prova.id), isNull(atendimentosTable.confirmadoEm)))
      .returning();
    if (!atualizado) return null;

    // Autoria da NOIVA, sem sessão — o mesmo rastro do aceite (E74).
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: linha.portal.lojaId,
      usuarioId: null,
      usuarioNome: `${linha.lead.noivaNome} (link público)`,
      acao: "PROVA_CONFIRMADA",
      entidade: "atendimento",
      entidadeId: prova.id,
      detalhe: { inicio: prova.inicio.toISOString() },
    });
    return atualizado.confirmadoEm;
  });

  const confirmadoEm =
    confirmadoNaHora ??
    (
      await db.select({ confirmadoEm: atendimentosTable.confirmadoEm })
        .from(atendimentosTable)
        .where(eq(atendimentosTable.id, prova.id))
    )[0]?.confirmadoEm;
  res.json(ConfirmarProvaPortalResponse.parse({ confirmadoEm: confirmadoEm ?? agora }));
});

/**
 * F37/E100 — a noiva avisa que NÃO pode ir.
 *
 * A única ação dela aqui era "confirmo que vou", e ninguém abre um link para
 * dizer que vai: abre para dizer que não. Este aviso devolve à loja os três
 * recursos mais caros do ateliê — cabine, hora da vendedora e vestido separado —
 * com antecedência, em vez de com a ausência.
 */
router.post("/portal/provas/:atendimentoId/remarcar", async (req, res): Promise<void> => {
  const parsed = PedirRemarcacaoPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const atendimentoId = req.params.atendimentoId as string;
  const prova = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId),
      eq(atendimentosTable.lojaId, linha.portal.lojaId),
      eq(atendimentosTable.leadId, linha.portal.leadId),
    ),
  });
  if (!prova) {
    res.status(404).json({ error: "PROVA_INEXISTENTE" });
    return;
  }
  // Idempotente ANTES das réguas, como no confirmar: o segundo clique devolve o
  // mesmo carimbo em vez de um 422 que a noiva leria como "não deu certo".
  if (prova.remarcacaoPedidaEm) {
    res.json(PedirRemarcacaoPortalResponse.parse({ remarcacaoPedidaEm: prova.remarcacaoPedidaEm }));
    return;
  }
  // Quem JÁ CONFIRMOU não desmarca por aqui. A loja tomou decisão física em
  // cima daquele sim — separou a peça, reservou a cabine, escalou a costureira —
  // e desfazer isso por um clique num link, sem ninguém saber, é pior que a
  // conversa de trinta segundos com a vendedora.
  if (prova.confirmadoEm) {
    res.status(422).json({
      error: "JA_CONFIRMADA",
      detalhe: "Você já confirmou esta prova — fale com a sua vendedora para remarcar.",
    });
    return;
  }
  if (prova.tipo !== "PROVA" || prova.situacao !== "AGENDADO" || prova.inicio <= new Date()) {
    res.status(422).json({ error: "NADA_A_REMARCAR", detalhe: "não é uma prova futura agendada" });
    return;
  }

  const agora = new Date();
  // Mesma forma da confirmação: o `.returning()` serve o vencedor, e o SELECT
  // extra só roda para quem perdeu a corrida.
  const pedidoNaHora = await db.transaction(async (tx) => {
    // UPDATE condicional: dois cliques simultâneos gravam UM carimbo.
    const [atualizado] = await tx
      .update(atendimentosTable)
      .set({ remarcacaoPedidaEm: agora, updatedAt: agora })
      .where(and(
        eq(atendimentosTable.id, prova.id),
        isNull(atendimentosTable.remarcacaoPedidaEm),
      ))
      .returning();
    if (!atualizado) return null;

    // Autoria da NOIVA, sem sessão — o mesmo rastro do aceite (E74) e da
    // confirmação (E85).
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: linha.portal.lojaId,
      usuarioId: null,
      usuarioNome: `${linha.lead.noivaNome} (link público)`,
      acao: "REMARCACAO_PEDIDA",
      entidade: "atendimento",
      entidadeId: prova.id,
      detalhe: { inicio: prova.inicio.toISOString() },
    });
    return atualizado.remarcacaoPedidaEm;
  });

  const remarcacaoPedidaEm =
    pedidoNaHora ??
    (
      await db.select({ remarcacaoPedidaEm: atendimentosTable.remarcacaoPedidaEm })
        .from(atendimentosTable)
        .where(eq(atendimentosTable.id, prova.id))
    )[0]?.remarcacaoPedidaEm;
  res.json(PedirRemarcacaoPortalResponse.parse({
    remarcacaoPedidaEm: remarcacaoPedidaEm ?? agora,
  }));
});

// A foto escopada ao token do PORTAL — espelho de /lookbooks/publico/foto,
// para o portal não depender do token antigo do lookbook (pode ter expirado).
router.get("/portal/foto", async (req, res): Promise<void> => {
  const parsed = GetPortalFotoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { token, vestidoId, ordem, variante = "original", v } = parsed.data;

  const linha = await buscarPorToken(token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  /**
   * O escopo: o vestido tem de estar no lookbook mais recente DA noiva **ou**
   * ser o vestido reservado pelo contrato ATIVO dela.
   *
   * F39/E100 acrescentou o segundo caminho, e ele não é um afrouxamento: a
   * seção "O seu vestido" mostra a peça que ela contratou, e essa peça pode
   * nunca ter entrado num lookbook — quem fecha na primeira visita não ganha
   * uma seleção de provados. Sem isto a foto da própria noiva respondia 404.
   *
   * O que continua valendo: vestido de OUTRA noiva é 404 mesmo existindo, e
   * ambos os caminhos passam pelo `leadId` do token.
   */
  const [lookbook] = await db.select({ id: lookbooksTable.id }).from(lookbooksTable)
    .where(and(
      eq(lookbooksTable.lojaId, linha.portal.lojaId),
      eq(lookbooksTable.leadId, linha.portal.leadId),
    ))
    .orderBy(desc(lookbooksTable.createdAt))
    .limit(1);
  const [noLookbook] = lookbook
    ? await db.select({ id: lookbookItensTable.id }).from(lookbookItensTable)
        .where(and(
          eq(lookbookItensTable.lookbookId, lookbook.id),
          eq(lookbookItensTable.vestidoId, vestidoId),
        ))
    : [];
  // E115 — o caminho do contrato resolvia SÓ pela coluna singular legada
  // (`contratos.bloqueio_vestido_id`), que o app nunca preenche (a tela manda
  // `bloqueioVestidoIds`, o servidor grava o N:N): a seção "O seu vestido"
  // aparecia e a foto respondia 404, permanentemente, no celular da noiva.
  // A régua é a MESMA de `montarVestidoDaNoiva`: a UNIÃO do N:N com o legado
  // ("lido, nunca mais escrito") — meu primeiro conserto trocou uma metade
  // pela outra, e foi o teste do E100 (que monta pelo legado) que o pegou.
  let noContrato = false;
  if (!noLookbook) {
    const contratos = await db
      .select({ id: contratosTable.id, bloqueioVestidoId: contratosTable.bloqueioVestidoId })
      .from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, linha.portal.lojaId),
        eq(contratosTable.leadId, linha.portal.leadId),
        eq(contratosTable.status, "ATIVO"),
      ));
    if (contratos.length > 0) {
      const vinculos = await db
        .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
        .from(contratoBloqueiosTable)
        .where(inArray(contratoBloqueiosTable.contratoId, contratos.map((c) => c.id)));
      const bloqueioIds = [
        ...new Set([
          ...contratos.flatMap((c) => (c.bloqueioVestidoId ? [c.bloqueioVestidoId] : [])),
          ...vinculos.map((v) => v.bloqueioId),
        ]),
      ];
      if (bloqueioIds.length > 0) {
        const [b] = await db
          .select({ id: bloqueioVestidosTable.id })
          .from(bloqueioVestidosTable)
          .where(and(
            inArray(bloqueioVestidosTable.id, bloqueioIds),
            eq(bloqueioVestidosTable.vestidoId, vestidoId),
            isNull(bloqueioVestidosTable.canceladoEm),
          ));
        noContrato = !!b;
      }
    }
  }
  if (!noLookbook && !noContrato) {
    res.status(404).json({ error: "FOTO_NAO_ENCONTRADA", detalhe: "Este registro não existe mais." });
    return;
  }

  const foto = await db.query.vestidoFotosTable.findFirst({
    where: and(eq(vestidoFotosTable.vestidoId, vestidoId), eq(vestidoFotosTable.ordem, ordem)),
  });
  if (!foto) {
    res.status(404).json({ error: "FOTO_NAO_ENCONTRADA", detalhe: "Este registro não existe mais." });
    return;
  }

  // Mesmo contrato de cache das irmãs (E3).
  const servirThumb = variante === "thumb" && foto.thumbBytes != null;
  const etag = `"${vestidoId}-${ordem}-${servirThumb ? "t" : "c"}-${foto.updatedAt.getTime()}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", servirThumb ? foto.thumbMime ?? foto.mime : foto.mime);
  res.setHeader(
    "Cache-Control",
    v ? "private, max-age=31536000, immutable" : "private, max-age=60, must-revalidate",
  );
  res.setHeader("ETag", etag);
  res.send(servirThumb ? foto.thumbBytes : foto.bytes);
});

// ── Gestão (sessão + módulo leads: o portal é parte do atendimento da noiva) ──

// E84: os portais da loja num lote — mensagens e cobrança cruzam por leadId
// para anexar o link à mensagem. Uma linha por noiva; quem decide se está
// vivo é o cliente (a régua é a mesma do card).
router.get(
  "/lojas/:lojaId/portais",
  requireSessaoComLoja,
  requireModulo("leads", "ver"),
  async (req, res): Promise<void> => {
    const lojaId = req.params.lojaId as string;
    const portais = await db.select().from(portalTokensTable)
      .where(eq(portalTokensTable.lojaId, lojaId));
    res.json(ListPortaisResponse.parse(portais));
  },
);

router.use("/lojas/:lojaId/leads/:leadId/portal", requireSessaoComLoja);

router.get(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "ver"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    const [portal] = await db.select().from(portalTokensTable)
      .where(and(eq(portalTokensTable.lojaId, lojaId), eq(portalTokensTable.leadId, leadId)));
    if (!portal) {
      res.status(404).json({ error: "PORTAL_INEXISTENTE" });
      return;
    }
    res.json(GetPortalLeadResponse.parse(portal));
  },
);

router.post(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    if (!(await leadNaLoja(leadId, lojaId))) {
      res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Este registro não existe mais." });
      return;
    }

    // Regenerar MATA o link antigo: leadId é unique — o token novo substitui
    // o velho na mesma linha, e revogado volta à vida com token novo.
    const token = gerarTokenConvite();
    const expiraEm = new Date(Date.now() + PORTAL_TTL_MS);
    const [portal] = await db.insert(portalTokensTable)
      .values({ id: randomUUID(), lojaId, leadId, token, expiraEm })
      .onConflictDoUpdate({
        target: portalTokensTable.leadId,
        set: { token, expiraEm, revogadoEm: null, criadoEm: new Date() },
      })
      .returning();
    res.status(201).json(CriarPortalLeadResponse.parse(portal));
  },
);

router.delete(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    await db.update(portalTokensTable)
      .set({ revogadoEm: new Date() })
      .where(and(eq(portalTokensTable.lojaId, lojaId), eq(portalTokensTable.leadId, leadId)));
    res.status(204).send();
  },
);

export default router;
