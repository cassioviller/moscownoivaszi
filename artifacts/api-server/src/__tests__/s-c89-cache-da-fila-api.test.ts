import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contratoBloqueiosTable, contratoItensTable, db, pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-C89 — a régua que TRAVA o número de consultas da fila de atrasos, e o
 * cache de 5 min por loja (decisão da dona, 14/08/2026).
 *
 * O custo foi MEDIDO aqui antes do cache, e a sobra o descrevia menor: ela
 * dizia "1 consulta larga + 2 por contrato atrasado", e são **2 fixas** (a
 * regra da loja + a varredura larga) **+ 3 por contrato** (a regra DE NOVO
 * dentro de `pecasAtrasadasDoContrato`, os bloqueios do contrato, o aluguel
 * de cada peça no rol) **+ 1 pelas órfãs** — 4 por contrato quando o atraso
 * já virou parcela (a cobrança viva). O sino refaz isso a cada 5 min em TODA
 * tela aberta.
 *
 * A contagem é por TABELA DA FILA no texto do SQL, não por request: o
 * middleware de sessão também consulta o banco (sessões, usuários, perfis), e
 * contá-lo faria a régua medir autenticação em vez de fila.
 *
 * VERMELHO (regra 34, medido com o cache comentado de propósito na rota): o
 * segundo GET custa **9 consultas de novo** — `expected 9 to be +0` — porque
 * sem cache toda tela paga a conta inteira a cada poll.
 */

/** As tabelas que a fila lê — sessão/permissão ficam de fora de propósito. */
const TABELAS_DA_FILA =
  /\b(bloqueio_vestidos|contrato_bloqueios|contratos|contrato_itens|parcelas|regra_disponibilidade|leads|vestidos|reservas)\b/;

type QueryDoPool = typeof pool.query;

function contadorDeConsultas() {
  const original = pool.query.bind(pool) as QueryDoPool;
  let n = 0;
  const espiao = ((...args: unknown[]) => {
    const primeiro = args[0] as string | { text?: string } | undefined;
    const texto = typeof primeiro === "string" ? primeiro : (primeiro?.text ?? "");
    if (TABELAS_DA_FILA.test(texto)) n += 1;
    return (original as unknown as (...a: unknown[]) => unknown)(...args);
  }) as unknown as QueryDoPool;
  pool.query = espiao;
  return {
    zerar: () => {
      n = 0;
    },
    conta: () => n,
    restaurar: () => {
      pool.query = original;
    },
  };
}

describe("S-C89 — a fila responde do cache, e o número de consultas é travado", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // A fixture escreve DIRETO no banco (não passa por porta nenhuma), então
  // cada caso parte de cache frio — o mesmo gesto que qualquer teste de fila
  // com fixture direta precisa fazer.
  beforeEach(() => derrubarFilaDeAtrasos());
  afterEach(() => derrubarFilaDeAtrasos());

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /** A mesma montagem do E212/S-C32: bloqueio com datas reais + rol de itens. */
  async function noivaComPecaAtrasada(casamentoHaDias: number) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: new Date(),
    });
    const vestido = await criarVestido(f);
    const casamento = diasAtras(casamentoHaDias);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
      retiradaDataReal: diasAtras(casamentoHaDias + 3),
      devolucaoDataReal: null,
    });
    await db
      .insert(contratoBloqueiosTable)
      .values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      descricao: vestido.nome,
      valorUnitario: 3000,
      quantidade: 1,
    });
    return { contrato, bloqueio };
  }

  const fila = () => agent.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`);

  it("o custo é 2 fixas + 3 por contrato + 1 pelas órfãs — e o GET seguinte custa ZERO", async () => {
    await noivaComPecaAtrasada(9);
    await noivaComPecaAtrasada(11);

    const contador = contadorDeConsultas();
    try {
      contador.zerar();
      const primeira = await fila().expect(200);
      expect(primeira.body.itens).toHaveLength(2);
      /**
       * A conta, por extenso (igualdade, lição da S-C46 — piso `>=` deixa a
       * prosa envelhecer): regra(1) + candidatos(1) + por contrato
       * [regra(1) + bloqueios(1) + aluguel(1)] ×2 + órfãs(1) = **9**.
       * Quem mudar a fila e vir este número cair, ganhou; subir, explica.
       */
      expect(contador.conta()).toBe(9);

      contador.zerar();
      const segunda = await fila().expect(200);
      expect(segunda.body.itens).toHaveLength(2);
      // O poll do sino em TODA tela custa isto de banco enquanto o cache vale.
      expect(contador.conta()).toBe(0);
    } finally {
      contador.restaurar();
    }
  });

  it("cobrar o atraso derruba o cache da loja: o GET seguinte já diz jaCobrada", async () => {
    const { contrato } = await noivaComPecaAtrasada(9);

    const antes = await fila().expect(200);
    const linhaAntes = (antes.body.itens as { contratoId: string; jaCobrada: boolean }[]).find(
      (i) => i.contratoId === contrato.id,
    );
    expect(linhaAntes?.jaCobrada).toBe(false);

    // A porta (não a fixture): é ela quem derruba o cache.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .send({})
      .expect(201);

    const depois = await fila().expect(200);
    const linha = (depois.body.itens as { contratoId: string; jaCobrada: boolean }[]).find(
      (i) => i.contratoId === contrato.id,
    );
    expect(linha?.jaCobrada).toBe(true);
  });

  it("registrar a devolução pela porta derruba o cache: a linha some do GET seguinte", async () => {
    const { contrato, bloqueio } = await noivaComPecaAtrasada(9);

    const antes = await fila().expect(200);
    expect(
      (antes.body.itens as { contratoId: string }[]).some((i) => i.contratoId === contrato.id),
    ).toBe(true);

    // A devolução registrada com a data em que a peça DE FATO voltou — dentro
    // do prazo (o fim do uso, casamento + 2). Quem digita hoje uma volta de
    // ontem é o caso normal do balcão; com a volta no prazo, dias = 0 e a
    // linha sai. (Devolvida DEPOIS do prazo ela continua na fila, de
    // propósito: a cobrança ainda é devida — o primeiro desenho deste teste
    // esperava a linha sumir com a devolução de hoje e mediu o contrário.)
    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ devolucaoDataReal: diasAtras(7).toISOString() })
      .expect(200);

    const depois = await fila().expect(200);
    expect(
      (depois.body.itens as { contratoId: string }[]).some((i) => i.contratoId === contrato.id),
    ).toBe(false);
  });
});
