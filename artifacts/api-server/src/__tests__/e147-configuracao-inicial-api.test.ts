import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  db,
  lojasTable,
  usuariosTable,
  perfisTable,
  cabinesTable,
  comissaoRegrasTable,
  comissaoFaixasTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { fecharPool } from "./helpers";
import {
  aplicarConfiguracaoInicial,
  contarConfiguracao,
  CATALOGO_PADRAO,
  CABINES_PADRAO,
  HORARIO_PADRAO,
  ESCADA_PADRAO,
  RECORRENCIAS_PADRAO,
  PERFIS_PADRAO,
  type OpcoesConfiguracao,
} from "../lib/configuracao-inicial";
import { hojeLocal, primeiroDiaDoMes, diaDeNegocio } from "@workspace/financeiro-core";

/**
 * E147 — a configuração inicial no banco: ela pega, ela repete, e ela não
 * atropela ninguém.
 *
 * As três perguntas que um seed de configuração precisa responder, e que o
 * seed anterior não respondia porque nem se propunha a isso:
 *
 * 1. Depois de rodar, a loja está configurada? (contagem, não "concluído")
 * 2. Rodar duas vezes duplica alguma coisa? (não — id derivado da loja)
 * 3. Rodar de novo desfaz o que a loja mudou na tela? (não — nunca sobrescreve)
 */
const TOTAL_OPCOES = CATALOGO_PADRAO.reduce((s, a) => s + a.opcoes.length, 0);

function opcoesDe(sufixo: string, comExemplosFinanceiros = true): OpcoesConfiguracao {
  return {
    loja: {
      id: `cfg-loja-${sufixo}`,
      nome: `Ateliê de Teste ${sufixo}`,
      cnpj: "00.000.000/0001-00",
      endereco: "Rua do Teste, 1",
      telefone: "(11) 90000-0000",
    },
    dona: {
      id: `cfg-dona-${sufixo}`,
      nome: `Dona ${sufixo}`,
      email: `dona-${sufixo}@teste.local`,
      senha: "senha-de-teste",
      superAdmin: false,
    },
    comExemplosFinanceiros,
  };
}

describe("E147 — aplicar a configuração inicial numa loja nova", () => {
  const sufixo = randomUUID().slice(0, 8);
  const opts = opcoesDe(sufixo);
  /** Os perfis que ESTE teste criou — os que já existiam ficam onde estão. */
  let perfisCriadosAqui: string[] = [];

  beforeAll(async () => {
    const antes = await db
      .select({ id: perfisTable.id })
      .from(perfisTable)
      .where(inArray(perfisTable.id, PERFIS_PADRAO.map((p) => p.id)));
    const jaExistiam = new Set(antes.map((p) => p.id));
    perfisCriadosAqui = PERFIS_PADRAO.map((p) => p.id).filter((id) => !jaExistiam.has(id));
  });

  afterAll(async () => {
    // A loja cascateia cabines, horário, catálogo, escada e recorrências; a
    // dona sai depois dela porque `comissao_regras.vendedora_id` é RESTRICT
    // (E91) — a ordem da limpeza é significativa, e é a do `replit.md`.
    await db.delete(lojasTable).where(eq(lojasTable.id, opts.loja.id));
    await db.delete(lojasTable).where(eq(lojasTable.id, `cfg-loja-sem-dinheiro-${sufixo}`));
    await db.delete(usuariosTable).where(eq(usuariosTable.email, opts.dona.email));
    await db.delete(usuariosTable).where(eq(usuariosTable.email, `dona-sem-dinheiro-${sufixo}@teste.local`));
    if (perfisCriadosAqui.length > 0) {
      await db.delete(perfisTable).where(inArray(perfisTable.id, perfisCriadosAqui));
    }
    await fecharPool();
  });

  it("a primeira execução deixa a loja configurada, e só falta cadastrar vestido", async () => {
    const resumo = await aplicarConfiguracaoInicial(opts);
    expect(resumo.criado.loja).toBe(true);
    expect(resumo.criado.dona).toBe(true);
    expect(resumo.criado.vinculo).toBe(true);

    const c = await contarConfiguracao(opts.loja.id);
    expect(c).toEqual({
      cabines: CABINES_PADRAO.length,
      temHorario: true,
      // S-D41: a contagem passou a devolver o horário GRAVADO, não só o "existe".
      // Quem imprime o resumo do seed precisa descrevê-lo, e a frase cravada que
      // ele tinha antes negava o domingo e a hora que a S-A8 decidiu. O assert
      // é a régua: o que o seed grava é o que a dona respondeu.
      horario: {
        diasFuncionamento: [...HORARIO_PADRAO.diasFuncionamento],
        atendimentoAberturaHora: HORARIO_PADRAO.atendimentoAberturaHora,
        atendimentoFechamentoHora: HORARIO_PADRAO.atendimentoFechamentoHora,
      },
      atributos: CATALOGO_PADRAO.length,
      opcoes: TOTAL_OPCOES,
      // O único zero, e é o zero pretendido: `primeirosPassos` de
      // `moscow-noivas/src/lib/primeiros-passos.ts` devolve exatamente um passo
      // com estas contagens — "Cadastrar os primeiros vestidos".
      vestidos: 0,
      escadasDeComissao: 1,
      recorrencias: RECORRENCIAS_PADRAO.length,
    });
  });

  it("os quatro perfis existem, e um só é do sistema", async () => {
    const perfis = await db
      .select()
      .from(perfisTable)
      .where(inArray(perfisTable.id, PERFIS_PADRAO.map((p) => p.id)));
    expect(perfis).toHaveLength(4);
    expect(perfis.filter((p) => p.sistema).map((p) => p.nome)).toEqual(["Admin"]);
  });

  it("a escada nasce valendo desde o dia 1º do mês da instalação", async () => {
    // Vigência "hoje" deixaria o mês da instalação sem régua, e a comissão do
    // primeiro mês sairia zero — sem erro e sem explicação, que é a classe de
    // silêncio que o método persegue.
    const [regra] = await db
      .select()
      .from(comissaoRegrasTable)
      .where(eq(comissaoRegrasTable.lojaId, opts.loja.id));
    expect(diaDeNegocio(regra.vigenciaInicio)).toBe(primeiroDiaDoMes(hojeLocal()));
    expect(regra.bonusAcumulaFaixas).toBe(false);

    const faixas = await db
      .select()
      .from(comissaoFaixasTable)
      .where(eq(comissaoFaixasTable.regraId, regra.id));
    expect(faixas).toHaveLength(ESCADA_PADRAO.length);
    const topo = faixas.find((f) => f.maxAcumulado === null);
    expect(topo?.percentual).toBe(7);
    expect(topo?.bonusFixo).toBe(500);
  });

  it("a segunda execução não cria nada e não duplica nada", async () => {
    const resumo = await aplicarConfiguracaoInicial(opts);
    expect(resumo.criado).toEqual({
      loja: false,
      perfis: 0,
      dona: false,
      vinculo: false,
      cabines: 0,
      horario: false,
      atributos: 0,
      opcoes: 0,
      escadaDeComissao: false,
      recorrencias: 0,
    });

    const c = await contarConfiguracao(opts.loja.id);
    expect(c.cabines).toBe(CABINES_PADRAO.length);
    expect(c.opcoes).toBe(TOTAL_OPCOES);
    expect(c.recorrencias).toBe(RECORRENCIAS_PADRAO.length);
  });

  it("o que a loja renomeou na tela sobrevive a rodar o seed de novo", async () => {
    const [primeira] = await db
      .select()
      .from(cabinesTable)
      .where(eq(cabinesTable.id, `${opts.loja.id}-cabine-1`));
    expect(primeira.nome).toBe("Cabine 1");

    await db
      .update(cabinesTable)
      .set({ nome: "Provador Rosa" })
      .where(eq(cabinesTable.id, primeira.id));

    await aplicarConfiguracaoInicial(opts);

    const [depois] = await db
      .select()
      .from(cabinesTable)
      .where(eq(cabinesTable.id, primeira.id));
    expect(depois.nome).toBe("Provador Rosa");
    const c = await contarConfiguracao(opts.loja.id);
    expect(c.cabines, "renomear não pode fazer nascer uma quarta cabine").toBe(CABINES_PADRAO.length);
  });

  it("sem exemplos financeiros, a loja fica com agenda e catálogo e nenhum valor", async () => {
    const semDinheiro: OpcoesConfiguracao = {
      loja: { id: `cfg-loja-sem-dinheiro-${sufixo}`, nome: `Ateliê Sem Dinheiro ${sufixo}` },
      dona: {
        id: `cfg-dona-sem-dinheiro-${sufixo}`,
        nome: "Dona Sem Dinheiro",
        email: `dona-sem-dinheiro-${sufixo}@teste.local`,
        senha: "senha-de-teste",
        superAdmin: false,
      },
      comExemplosFinanceiros: false,
    };
    await aplicarConfiguracaoInicial(semDinheiro);

    const c = await contarConfiguracao(semDinheiro.loja.id);
    expect(c.cabines).toBe(CABINES_PADRAO.length);
    expect(c.atributos).toBe(CATALOGO_PADRAO.length);
    expect(c.escadasDeComissao).toBe(0);
    expect(c.recorrencias).toBe(0);
  });
});
