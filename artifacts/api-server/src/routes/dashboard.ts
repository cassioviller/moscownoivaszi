import { Router, type IRouter } from "express";
import {
  db,
  leadsTable,
  atendimentosTable,
  contratosTable,
  vestidosTable,
  orcamentosTable,
  parcelasTable,
  contasPagarTable,
} from "@workspace/db";
import { and, eq, gte, lt, ne, inArray, sql } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { getPermissoes } from "../lib/auth";
import { podeNoModulo } from "../lib/permissoes";
import {
  addDias,
  hojeLocal,
  inicioDoDia,
  previstoNaJanela,
  STATUS_ABERTO,
} from "@workspace/financeiro-core";

const router: IRouter = Router();

router.get("/lojas/:lojaId/dashboard", requireSessaoComLoja, async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  // Janela do "próximos 30 dias" pela régua do MOTOR (E25): dia de negócio
  // São Paulo, hoje inclusivo, soma em centavos — antes era sum(float) em SQL
  // por INSTANTE, que descartava o vencimento de hoje (meio-dia) quando a
  // consulta rodava à tarde e podia divergir da projeção por centavos.
  const hoje = hojeLocal();

  // "Hoje" é o dia da LOJA, e este handler tinha dois: o "a receber" já usava
  // `hojeLocal()` (America/Sao_Paulo) e o contador de atendimentos usava
  // `setHours(0,0,0,0)` — a meia-noite do relógio do PROCESSO, que no container
  // é UTC. Das 21h à meia-noite de São Paulo o card contava os atendimentos do
  // dia SEGUINTE, no mesmo painel em que o número ao lado já falava do dia
  // certo. Intervalo semiaberto [início de hoje, início de amanhã): a
  // meia-noite menos um milissegundo perdia o atendimento marcado em cima da
  // virada.
  const inicioHoje = inicioDoDia(hoje);
  const inicioAmanha = inicioDoDia(addDias(hoje, 1));
  const janela = { iniYMD: hoje, fimYMD: addDias(hoje, 30) };
  const recorteSql = { de: inicioDoDia(hoje), ate: inicioDoDia(addDias(janela.fimYMD, 1)) };

  const [
    leadsAtivos,
    vestidosAtivos,
    orcamentosAbertos,
    contratosAtivos,
    atendimentosHoje,
    receberProximos30Dias,
    pagarProximos30Dias,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(leadsTable)
      .where(and(eq(leadsTable.lojaId, lojaId), ne(leadsTable.etapa, "PERDIDO"), ne(leadsTable.etapa, "DEVOLVIDO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vestidosTable)
      .where(and(eq(vestidosTable.lojaId, lojaId), eq(vestidosTable.status, "ativo"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(orcamentosTable)
      .where(and(eq(orcamentosTable.lojaId, lojaId), eq(orcamentosTable.status, "ENVIADO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contratosTable)
      .where(and(eq(contratosTable.lojaId, lojaId), eq(contratosTable.status, "ATIVO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(atendimentosTable)
      .where(
        and(
          eq(atendimentosTable.lojaId, lojaId),
          gte(atendimentosTable.inicio, inicioHoje),
          lt(atendimentosTable.inicio, inicioAmanha),
        ),
      ),
    // As LINHAS (não a soma): quem soma é o motor, na mesma régua do front.
    // O recorte SQL só limita o tráfego; o corte exato é do previstoNaJanela.
    // C4/E94: este `where` dizia `eq(status,'PREVISTA')` — a terceira cópia à
    // mão da mesma regra, e a segunda errada. A parcela meio recebida sumia do
    // "a receber" do dashboard inteira, e não só pelo saldo que falta.
    // `valorRecebido` entra junto por necessidade: `previstoNaJanela` soma
    // `saldoAberto` (previsto − recebido), e sem a coluna uma PARCIAL de
    // 10.000 com 4.000 já pagos apareceria valendo 10.000.
    db
      .select({
        status: parcelasTable.status,
        vencimento: parcelasTable.vencimento,
        valorPrevisto: parcelasTable.valorPrevisto,
        valorRecebido: parcelasTable.valorRecebido,
      })
      .from(parcelasTable)
      .where(
        and(
          eq(parcelasTable.lojaId, lojaId),
          inArray(parcelasTable.status, [...STATUS_ABERTO]),
          gte(parcelasTable.vencimento, recorteSql.de),
          lt(parcelasTable.vencimento, recorteSql.ate),
        ),
      ),
    db
      .select({
        status: contasPagarTable.status,
        vencimento: contasPagarTable.vencimento,
        valorPrevisto: contasPagarTable.valorPrevisto,
      })
      .from(contasPagarTable)
      .where(
        and(
          eq(contasPagarTable.lojaId, lojaId),
          // Conta a pagar não tem PARCIAL (`conta_pagar_status` é
          // PREVISTA|PAGA), então aqui o `eq` é a régua inteira, não um recorte.
          eq(contasPagarTable.status, "PREVISTA"),
          gte(contasPagarTable.vencimento, recorteSql.de),
          lt(contasPagarTable.vencimento, recorteSql.ate),
        ),
      ),
  ]);

  /**
   * B7/E101 — o dashboard é o painel de TODO MUNDO, e por isso os números de
   * dinheiro só entram para quem tem o gate do dinheiro.
   *
   * **Decisão do dono em 2026-07-27.** A alternativa era `requireModulo` na
   * rota inteira, o que é mais simples de auditar — e faria a home de quem não
   * tem financeiro virar OUTRA tela, para um perfil inteiro. Esta é a mudança
   * menor: ninguém perde a home, e a informação que o gate `financeiro` existe
   * para restringir para de sair pela porta ao lado.
   *
   * Era o buraco: esta é uma das duas únicas rotas de loja sem `requireModulo`,
   * e entregava `receberProximos30Dias`/`pagarProximos30Dias` da loja inteira —
   * a costureira com `agenda: {ver}` abria a tela inicial e recebia a previsão
   * de caixa. O contrato já marcava os dois campos como opcionais e a tela já
   * sabia esconder o card; faltava o servidor parar de mandá-los.
   */
  // O superadmin passa por fora, como em `requireModulo` — que o libera ANTES
  // de consultar permissão nenhuma. Sem esta linha, o console da rede veria um
  // dashboard sem dinheiro, e a régua daqui divergiria da do middleware.
  const veDinheiro =
    !!req.usuario!.isSuperAdmin ||
    podeNoModulo(
      await getPermissoes(req.usuario!.id, lojaId, false),
      "financeiro",
      "ver",
    );

  res.json(
    GetDashboardResponse.parse({
      totalLeadsAtivos: Number(leadsAtivos[0]?.count ?? 0),
      totalVestidosAtivos: Number(vestidosAtivos[0]?.count ?? 0),
      totalOrcamentosAbertos: Number(orcamentosAbertos[0]?.count ?? 0),
      totalContratosAtivos: Number(contratosAtivos[0]?.count ?? 0),
      ...(veDinheiro
        ? {
            receberProximos30Dias: previstoNaJanela(receberProximos30Dias, janela),
            pagarProximos30Dias: previstoNaJanela(pagarProximos30Dias, janela),
          }
        : {}),
      atendimentosHoje: Number(atendimentosHoje[0]?.count ?? 0),
    }),
  );
});

export default router;
