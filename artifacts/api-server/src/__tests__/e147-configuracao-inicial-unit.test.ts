import { describe, expect, it } from "vitest";
import {
  PERFIS_PADRAO,
  CABINES_PADRAO,
  HORARIO_PADRAO,
  CATALOGO_PADRAO,
  ESCADA_PADRAO,
  RECORRENCIAS_PADRAO,
  configuracaoDoAmbiente,
  LOJA_PADRAO,
  DONA_PADRAO,
} from "../lib/configuracao-inicial";
import { calcularComissao, validarFaixas, type FaixaCalc } from "../lib/comissao";
import { normalizarAcessos, MODULOS, ACOES } from "../lib/permissoes";
import { centavos } from "@workspace/financeiro-core";

/**
 * E147 — a configuração inicial, conferida no número.
 *
 * Um seed que traz dinheiro sem exemplo numérico é pior que um seed sem
 * dinheiro: ele ensina a confiar num valor que ninguém verificou. Este arquivo
 * é a verificação — a escada paga o que a documentação diz que paga, as
 * recorrências somam o que o script imprime, e os perfis liberam exatamente o
 * que a matriz do E2E promete.
 */
describe("E147 — a escada de comissão padrão paga o que está escrito", () => {
  const faixas: FaixaCalc[] = ESCADA_PADRAO.map((f) => ({
    minAcumulado: centavos(f.minAcumulado),
    maxAcumulado: f.maxAcumulado === null ? null : centavos(f.maxAcumulado),
    percentual: f.percentual,
    bonusFixo: f.bonusFixo == null ? null : centavos(f.bonusFixo),
  }));

  it("as faixas são coerentes para o motor (sem sobreposição, só o topo aberto)", () => {
    expect(validarFaixas(faixas)).toEqual({ ok: true });
  });

  it("R$ 50.000,00 no mês → 7% + R$ 500,00 de bônus = R$ 4.000,00", () => {
    const r = calcularComissao(centavos(50_000), faixas, false);
    expect(r.percentualAplicado).toBe(7);
    expect(r.valorComissao).toBe(centavos(3_500));
    expect(r.valorBonus).toBe(centavos(500));
    expect(r.valorTotal).toBe(centavos(4_000));
  });

  it("a régua é RETROATIVA: R$ 25.000,00 pagam 6% sobre o TOTAL, não por degrau", () => {
    const r = calcularComissao(centavos(25_000), faixas, false);
    expect(r.percentualAplicado).toBe(6);
    // Progressivo por degrau daria 20.000×5% + 5.000×6% = R$ 1.300,00. Não é
    // isso que o motor faz, e o incentivo desenhado é exatamente o outro.
    expect(r.valorComissao).toBe(centavos(1_500));
    expect(r.valorBonus).toBe(0);
  });

  it("o primeiro real já comissiona — a escada não tem buraco embaixo", () => {
    const r = calcularComissao(centavos(1_000), faixas, false);
    expect(r.percentualAplicado).toBe(5);
    expect(r.valorTotal).toBe(centavos(50));
  });
});

describe("E147 — as recorrências padrão somam o custo fixo do mês", () => {
  it("quatro contas, R$ 5.710,00 por mês", () => {
    expect(RECORRENCIAS_PADRAO).toHaveLength(4);
    const totalC = RECORRENCIAS_PADRAO.reduce((s, r) => s + centavos(r.valor), 0);
    expect(totalC).toBe(centavos(5_710));
  });

  it("nenhuma é SALARIO: salário exige colaborador, e no primeiro dia só existe a dona", () => {
    // O tipo já não deixa (`RecorrenciaPadrao` só admite DESPESA/FORNECEDOR);
    // isto guarda o dia em que alguém alargar o tipo sem rever a decisão.
    expect(RECORRENCIAS_PADRAO.map((r) => String(r.tipo)).filter((t) => t === "SALARIO")).toEqual([]);
  });

  it("cada uma vence num dia válido de mês curto (o grampo do motor nunca precisa agir)", () => {
    for (const r of RECORRENCIAS_PADRAO) {
      expect(r.diaVencimento, r.descricao).toBeGreaterThanOrEqual(1);
      expect(r.diaVencimento, r.descricao).toBeLessThanOrEqual(28);
    }
  });
});

describe("E147 — os perfis padrão", () => {
  it("um único perfil de SISTEMA, e ele é o Admin (E80)", () => {
    const sistema = PERFIS_PADRAO.filter((p) => p.sistema);
    expect(sistema.map((p) => p.nome)).toEqual(["Admin"]);
  });

  it("Vendedora é exatamente a matriz que o sweep do E2E prega", () => {
    // Espelhada à mão em e2e/12-permissoes.spec.ts:18 — mudar uma sem a outra
    // reprova o sweep lá, com a linha exata.
    const vendedora = PERFIS_PADRAO.find((p) => p.nome === "Vendedora");
    const acessos = normalizarAcessos(vendedora?.acessos);
    expect(acessos.leads.ver).toBe(true);
    expect(acessos.agenda.ver).toBe(true);
    expect(acessos.vestidos.ver).toBe(true);
    expect(acessos.financeiro.ver).toBe(false);
    expect(acessos.comissao.ver).toBe(false);
    expect(acessos.admin.ver).toBe(false);
  });

  it("Proprietária abre os seis módulos sem ser perfil de sistema", () => {
    const dona = PERFIS_PADRAO.find((p) => p.nome === "Proprietária");
    expect(dona?.sistema).toBe(false);
    const acessos = normalizarAcessos(dona?.acessos);
    for (const modulo of MODULOS) {
      for (const acao of ACOES) {
        expect(acessos[modulo][acao], `${modulo}.${acao}`).toBe(true);
      }
    }
  });

  it("Recepção marca a agenda inteira e não edita ficha nem preço", () => {
    const acessos = normalizarAcessos(PERFIS_PADRAO.find((p) => p.nome === "Recepção")?.acessos);
    expect(acessos.agenda).toEqual({ ver: true, criar: true, editar: true });
    expect(acessos.leads).toEqual({ ver: true, criar: true, editar: false });
    expect(acessos.vestidos).toEqual({ ver: true, criar: false, editar: false });
    expect(acessos.financeiro.ver).toBe(false);
  });

  it("nenhum perfil sobrevive à normalização com chave inventada", () => {
    // O shape vem do CÓDIGO, nunca do banco: se um perfil daqui declarar um
    // módulo que não existe, ele some na normalização — e o teste avisa antes.
    for (const p of PERFIS_PADRAO) {
      expect(Object.keys(p.acessos).sort(), p.nome).toEqual([...MODULOS].sort());
    }
  });
});

describe("E147 — o catálogo do acervo", () => {
  /**
   * E149 reabriu esta decisão — e ela era testada, que é como deve ser.
   *
   * O E147 manteve `cor` fora do catálogo com um argumento correto ("dois
   * campos para o mesmo fato um dia discordariam"), mas decidiu sem a evidência
   * que a arqueologia do legado trouxe: nas 15 páginas de agenda do ateliê há
   * 38 compromissos de festa e dama indexados por COR, em 15 cores. Como texto
   * livre a coluna não sustentava a busca ("Verde"/"verde"/"VERDE" viravam três
   * filtros), e só atributo aparece na ficha de interesses da noiva.
   *
   * O argumento do E147 segue valendo e é o que este teste passa a pregar:
   * `vestidos.cor` virou legado LIDO, nunca escrito — um campo, não dois.
   *
   * `tamanho` continua fora, pelo motivo original: é da peça física.
   */
  it("nove atributos — cor entrou no E149, tamanho continua sendo coluna da peça", () => {
    expect(CATALOGO_PADRAO).toHaveLength(9);
    const nomes = CATALOGO_PADRAO.map((a) => a.nome.toLowerCase());
    expect(nomes).not.toContain("tamanho");
    expect(nomes).toContain("cor");
    expect(nomes).toContain("tipo de peça");
  });

  it("a cor cobre as 15 do papel do ateliê, e o tipo de peça abre lugar para o acessório", () => {
    const cor = CATALOGO_PADRAO.find((a) => a.chave === "cor");
    // As lidas na agenda: verde, terracota, marsala, vermelho, azul, azul
    // serenity, pink, rosa, rosê, champagne, fúcsia, laranja, amarelo, dourado,
    // roxo — mais os brancos do acervo de noiva, que o papel não nomeia.
    for (const doPapel of ["Verde", "Terracota", "Marsala", "Rosê", "Fúcsia", "Azul serenity"]) {
      expect(cor?.opcoes, `cor do papel ausente: ${doPapel}`).toContain(doPapel);
    }
    const tipo = CATALOGO_PADRAO.find((a) => a.chave === "tipo-de-peca");
    // "Acessório" é o que dá lugar ao bolero e à mantilha (E150).
    expect(tipo?.opcoes).toEqual(
      expect.arrayContaining(["Noiva", "Festa", "Dama", "Acessório"]),
    );
  });

  it("todo atributo tem chave única, rótulo único e ao menos duas opções", () => {
    const chaves = CATALOGO_PADRAO.map((a) => a.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    const nomes = CATALOGO_PADRAO.map((a) => a.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const a of CATALOGO_PADRAO) {
      expect(a.opcoes.length, a.nome).toBeGreaterThanOrEqual(2);
      expect(new Set(a.opcoes).size, `opções repetidas em ${a.nome}`).toBe(a.opcoes.length);
    }
  });

  it("a chave do id é estável: sem acento, sem espaço, sem maiúscula", () => {
    // Ela vira id no banco (`<lojaId>-atributo-<chave>`), e id que depende do
    // rótulo muda quando alguém corrige uma vírgula no nome.
    for (const a of CATALOGO_PADRAO) {
      expect(a.chave, a.nome).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("66 opções no total — o vocabulário com que a noiva descreve o vestido", () => {
    // 41 no E147; +19 de Cor e +6 de Tipo de peça no E149.
    const total = CATALOGO_PADRAO.reduce((s, a) => s + a.opcoes.length, 0);
    expect(total).toBe(66);
  });
});

describe("E147 — agenda e ambiente", () => {
  it("três cabines e um horário que abre seg–sáb", () => {
    expect(CABINES_PADRAO).toHaveLength(3);
    expect(HORARIO_PADRAO.diasFuncionamento).toEqual([1, 2, 3, 4, 5, 6]);
    expect(HORARIO_PADRAO.atendimentoAberturaHora).toBeLessThan(HORARIO_PADRAO.atendimentoFechamentoHora);
  });

  it("sem env, a configuração é a do desenvolvimento de sempre", () => {
    const c = configuracaoDoAmbiente({});
    expect(c.loja.id).toBe(LOJA_PADRAO.id);
    expect(c.dona.email).toBe(DONA_PADRAO.email);
    expect(c.dona.superAdmin).toBe(true);
    expect(c.comExemplosFinanceiros).toBe(true);
  });

  it("as variáveis mandam, e o e-mail entra em minúscula", () => {
    const c = configuracaoDoAmbiente({
      SEED_LOJA_NOME: "Ateliê da Rua Augusta",
      SEED_DONA_EMAIL: "Dona@Atelie.com.br",
      SEED_DONA_SUPERADMIN: "false",
      SEED_EXEMPLOS_FINANCEIROS: "false",
    });
    expect(c.loja.nome).toBe("Ateliê da Rua Augusta");
    expect(c.dona.email).toBe("dona@atelie.com.br");
    expect(c.dona.superAdmin).toBe(false);
    expect(c.comExemplosFinanceiros).toBe(false);
  });

  it("variável vazia não apaga o default — string em branco é engano, não escolha", () => {
    const c = configuracaoDoAmbiente({ SEED_LOJA_NOME: "   " });
    expect(c.loja.nome).toBe(LOJA_PADRAO.nome);
  });
});
