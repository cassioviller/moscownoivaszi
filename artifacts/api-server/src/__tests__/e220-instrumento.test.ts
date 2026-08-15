import { describe, expect, it, vi } from "vitest";

/**
 * **E220 — o PDF é o INSTRUMENTO, e os números dele são as réguas.**
 *
 * A irmã da `varredura-manuais-prazos` (E184), do lado do papel. Aquela lê a
 * constante da fonte e cobra que o manual escreva o mesmo número; esta não
 * precisa ler fonte nenhuma, porque o papel IMPORTA as constantes — então a
 * régua é de EFEITO: **troca-se cada constante por um valor-sentinela e o
 * texto impresso tem de trocar junto**. Se alguém reescrever a 14ª com
 * "R$ 350,00" digitado, o sentinela não aparece e o teste reprova — é a lição
 * do lote de 14/08: *régua que prega a implementação em vez do efeito é verde
 * nos dois lados do conserto.*
 *
 * E a segunda metade: com os sentinelas no lugar, **nenhum outro número pode
 * sobrar na prosa das cláusulas** além dos que o módulo DECLARA como só do
 * papel (`NUMEROS_SO_DO_PAPEL`), das remissões ("Cláusula 8ª") e do "Covid-19".
 * Um número solto na prosa é um número que ninguém prega.
 */

const SENTINELAS = {
  PRAZO_ANTES_DA_RETIRADA_DIAS: 71,
  RESERVA_PCT: 72,
  MULTA_DE_MORA_PCT: 73,
  JUROS_DE_MORA_MENSAL_PCT: 74,
  DEDUCAO_DA_RESCISAO_PCT: 75,
  MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL: 76,
  PRAZO_DEVOLUCAO_DA_LOJA_DIAS: 77,
  TAXA_LIMPEZA_MINIMA: 781,
  TAXA_LIMPEZA_MAXIMA: 7982,
  TETO_DO_DANO_EM_ALUGUEIS: 83,
  DIAS_PARA_EXTRAVIO: 84,
  MULTIPLICADOR_DE_EXTRAVIO: 85,
  MULTA_DE_ATRASO: 786,
  PRAZO_DA_TROCA_DIAS: 87,
  PERCENTUAIS_DA_TROCA_DE_DATA: [88, 89, 90] as const,
  DIAS_VEDADOS_DA_TROCA: [2, 6] as const, // terça e sábado — o §1º tem de segui-los
} as const;

vi.mock("@workspace/financeiro-core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/financeiro-core")>();
  return { ...real, ...SENTINELAS };
});

const { clausulasDoInstrumento, NUMEROS_SO_DO_PAPEL } = await import("../lib/contrato-clausulas");
type DadosDoInstrumento = import("../lib/contrato-clausulas").DadosDoInstrumento;
const { gerarContratoPdf } = await import("../lib/contrato-pdf");

// As linhas DESENHADAS, emendadas: o paginador quebra a frase por largura, e a
// régua lê o que a página mostra, não o stream cru (lição da S-C170).
const texto = (bytes: Uint8Array) =>
  [...Buffer.from(bytes).toString("latin1").matchAll(/\((.*)\) Tj/g)]
    .map((m) => m[1]!.trim().replace(/\\([()])/g, "$1"))
    .join(" ");
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DADOS = {
  lojaNome: "Loja",
  expediente: "terça a sexta, das 10:30 às 19:00; sábado, das 10:30 às 18:00",
  inicioDaLocacao: "03/09/2026 às 10:30",
  terminoDaLocacao: "08/09/2026 às 18:00",
  valorTotal: "R$ 4.000,00",
  prazoDevolucaoReservaDias: 30,
  foro: "São José dos Campos",
};

function prosa(dados: DadosDoInstrumento = DADOS): string {
  return clausulasDoInstrumento(dados)
    .flatMap((s) => s.paragrafos.map((p) => `${p.rotulo} — ${p.texto}`))
    .join("\n");
}

describe("E220 — os números do instrumento são as réguas, não cópias delas", () => {
  it("cada constante trocada por um sentinela aparece no texto das cláusulas", () => {
    const t = prosa();
    expect(t).toContain(`em até ${SENTINELAS.PRAZO_ANTES_DA_RETIRADA_DIAS} dias antes da data da retirada`); // 1ª § único
    expect(t).toContain(`pagamento antecipado de ${SENTINELAS.RESERVA_PCT}% do valor total`); // 8ª §1º
    expect(t).toContain(`multa pecuniária de ${SENTINELAS.MULTA_DE_MORA_PCT}%`); // 9ª
    expect(t).toContain(`juros de mora de ${SENTINELAS.JUROS_DE_MORA_MENSAL_PCT}% ao mês`); // 9ª
    expect(t).toContain(`deduzindo-se ${SENTINELAS.DEDUCAO_DA_RESCISAO_PCT}% do valor`); // 11ª
    // 12ª: com a multa em 100 o papel diz "o valor integral"; fora de 100, diz o percentual.
    expect(t).toContain(`${SENTINELAS.MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL}% do valor do aluguel`);
    expect(t).toContain(`será de ${SENTINELAS.PRAZO_DEVOLUCAO_DA_LOJA_DIAS} dias`); // 13ª §3º
    expect(t).toContain(`a partir de ${brl(SENTINELAS.TAXA_LIMPEZA_MINIMA)} até ${brl(SENTINELAS.TAXA_LIMPEZA_MAXIMA)}`); // 14ª
    expect(t).toContain(`não excedendo ${SENTINELAS.TETO_DO_DANO_EM_ALUGUEIS} vezes o valor do aluguel`); // 15ª
    expect(t).toContain(`no prazo de ${SENTINELAS.DIAS_PARA_EXTRAVIO} dias a contar da data prevista`); // 16ª
    expect(t).toContain(`pagar ${SENTINELAS.MULTIPLICADOR_DE_EXTRAVIO} vezes o valor do aluguel de cada peça`); // 16ª
    expect(t).toContain(`acrescido de multa de ${brl(SENTINELAS.MULTA_DE_ATRASO)}`); // 16ª §1º
    expect(t).toContain(`após ${SENTINELAS.PRAZO_DA_TROCA_DIAS} dias da data da locação`); // 17ª
    expect(t).toContain("às terças-feiras e aos sábados"); // 17ª §1º segue DIAS_VEDADOS_DA_TROCA
    expect(t).toContain(`reajuste automático de ${SENTINELAS.PERCENTUAIS_DA_TROCA_DE_DATA[0]}%`); // 17ª §2º
    expect(t).toContain(
      `reajuste de ${SENTINELAS.PERCENTUAIS_DA_TROCA_DE_DATA[1]}%, e de ${SENTINELAS.PERCENTUAIS_DA_TROCA_DE_DATA[2]}% na terceira`,
    ); // 17ª §3º
  });

  it("os números REAIS não sobrevivem no papel quando a régua muda — não há cópia digitada", () => {
    const t = prosa();
    // Os valores de produção de cada constante, que uma cópia à mão deixaria no texto.
    for (const cru of ["R$ 350,00", "R$ 2.500,00", "R$ 250,00", "10 (dez) dias", "4 (quatro) vezes", "5 (cinco) vezes", "7 (sete) dias", "40%", "60%", "de 20 dias antes"]) {
      expect(t, `"${cru}" continua digitado na prosa`).not.toContain(cru);
    }
  });

  it("nenhum número solto na prosa além dos declarados, das remissões e do Covid-19", () => {
    const t = prosa();
    const permitidos = new Set<string>([
      ...Object.values(SENTINELAS).flat().map(String),
      ...Object.values(NUMEROS_SO_DO_PAPEL).map(String),
      // Os sentinelas em reais ganham a grafia de moeda ("781,00", "7.982,00").
      ...[SENTINELAS.TAXA_LIMPEZA_MINIMA, SENTINELAS.TAXA_LIMPEZA_MAXIMA, SENTINELAS.MULTA_DE_ATRASO].map((v) =>
        brl(v).replace(/^R\$\s?/, ""),
      ),
      // Os dados do contrato que a cláusula imprime.
      "03/09/2026", "08/09/2026", "10:30", "18:00", "19:00", "4.000,00", "30",
    ]);
    const numeros = [...t.matchAll(/\d[\d.,:/]*\d|\d/g)].map((m) => m[0]);
    const soltos = numeros.filter((n) => {
      if (permitidos.has(n)) return false;
      if (/^\d+ª$/.test(t.slice(t.indexOf(n), t.indexOf(n) + n.length + 1))) return false; // remissão "8ª"
      return true;
    });
    // As remissões a cláusulas ("Cláusula 8ª", "13ª") e o "Covid-19" são texto, não número pregável.
    const semRemissao = soltos.filter((n) => !new RegExp(`${n}ª`).test(t) && !t.includes(`Covid-${n}`));
    expect(semRemissao, `números que ninguém prega: ${semRemissao.join(", ")}`).toEqual([]);
  });

  it("onde o papel é omisso, o instrumento declara — 5ª, 18ª e 21ª", () => {
    const vazio = prosa({ lojaNome: "Loja", expediente: "x" });
    expect(vazio).toContain("início no dia ___/___/____ às __:__");
    expect(vazio).toContain("prazo NÃO PACTUADO neste contrato");
    expect(vazio).toContain("foro da comarca do município da sede da LOCADORA");
    const cheio = prosa();
    expect(cheio).toContain("até 30 dias antes da data de retirada");
    expect(cheio).toContain("foro da comarca deste município de SÃO JOSÉ DOS CAMPOS");
  });

  it("o PDF inteiro carrega as 21 cláusulas, a 4ª com o expediente da LOJA, e o fecho inteiro", () => {
    const txt = texto(
      gerarContratoPdf({
        lojaNome: "Moscow Noivas",
        noivaNome: "Ana",
        expediente: "quarta a sexta, das 11:00 às 17:00",
        prazoDevolucaoReservaDias: null,
      }),
    );
    for (let n = 1; n <= 21; n++) expect(txt, `cláusula ${n}ª ausente`).toContain(`CLÁUSULA ${n}ª`);
    expect(txt).toContain("devolução de quarta a sexta, das 11:00 às 17:00");
    // O molde truncava em "de igual" (defeito 4 do papel); o instrumento não herda.
    expect(txt).toContain("em duas vias de igual teor e forma");
    // O que era o PDF antigo continua dentro do novo.
    expect(txt).toContain("INSTRUMENTO PARTICULAR DE LOCAÇÃO DE VESTUÁRIO");
    // O desenhista traduz o travessão para hífen (P14) — a régua lê o que a página mostra.
    expect(txt).toContain("Ana - LOCATÁRIO");
  });
});

describe("E234 — o que é da loja mora no cadastro da loja, e o papel o imprime", () => {
  it("com representante, cidade/UF e PIX o instrumento nomeia os três; sem eles, a lacuna", () => {
    const cheio = texto(
      gerarContratoPdf({
        lojaNome: "Moscow Noivas",
        noivaNome: "Ana",
        lojaRepresentante: "Renato Nascimento de Brito, Carteira de Identidade nº 42.909.064-x, CPF nº 333.486.478-27",
        lojaCidade: "São José dos Campos",
        lojaUf: "SP",
        lojaPix: "23723482805 (KARINA SHABALINA)",
        dataContrato: "15/08/2026",
      }),
    );
    expect(cheio).toContain("neste ato representada por Renato Nascimento de Brito, Carteira de Identidade nº 42.909.064-x, CPF nº 333.486.478-27");
    expect(cheio).toContain("foro da comarca deste município de SÃO JOSÉ DOS CAMPOS");
    expect(cheio).toContain("São José dos Campos - SP, 15/08/2026.");
    expect(cheio).toContain("PIX: 23723482805 (KARINA SHABALINA)");

    const vazio = texto(gerarContratoPdf({ lojaNome: "Moscow Noivas", noivaNome: "Ana" }));
    expect(vazio).toContain("neste ato representada por ________________________________");
    expect(vazio).toContain("foro da comarca do município da sede da LOCADORA");
    expect(vazio).not.toContain("PIX:");
  });
});
