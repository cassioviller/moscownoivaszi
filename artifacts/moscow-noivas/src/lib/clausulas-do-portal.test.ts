import { describe, expect, it } from "vitest";
import {
  DEDUCAO_DA_RESCISAO_PCT,
  DIAS_PARA_EXTRAVIO,
  JUROS_DE_MORA_MENSAL_PCT,
  MULTA_DE_ATRASO,
  MULTA_DE_MORA_PCT,
  MULTIPLICADOR_DE_EXTRAVIO,
  PRAZO_DEVOLUCAO_DA_LOJA_DIAS,
  TAXA_LIMPEZA_MAXIMA,
  TAXA_LIMPEZA_MINIMA,
  TETO_DO_DANO_EM_ALUGUEIS,
} from "@workspace/financeiro-core";
import { brl } from "./formatos";
import { clausulasDoContrato } from "./clausulas-do-portal";

/**
 * E230/S-C202 — o que se prega aqui é a DERIVAÇÃO, não o valor.
 *
 * Afirmar `toContain("2%")` seria a constante confirmando a si mesma (a lição
 * da S-C212): passaria com a frase escrita à mão e continuaria verde quando a
 * constante mudasse e a frase não. Cada caso confere que a frase contém o
 * VALOR IMPORTADO — se alguém trocar a derivação por um literal, o teste
 * reprova no dia em que a regra mudar, que é o único dia em que a diferença
 * existe.
 */
describe("E230/S-C202 — as cláusulas do portal derivam das constantes da conta", () => {
  const porClausula = (c: string) => clausulasDoContrato().filter((x) => x.clausula.includes(c));

  it("são as seis cláusulas de dinheiro, cada uma com o número da conta", () => {
    expect(clausulasDoContrato()).toHaveLength(6);
  });

  it("a 9ª cita a multa e os juros da mora", () => {
    const [c] = porClausula("9ª");
    expect(c!.texto).toContain(`${MULTA_DE_MORA_PCT}%`);
    expect(c!.texto).toContain(`${JUROS_DE_MORA_MENSAL_PCT}% ao mês`);
  });

  it("a 16ª cita a multa fixa, o prazo do extravio e o multiplicador", () => {
    const [atraso, extravio] = porClausula("16ª");
    expect(atraso!.texto).toContain(brl(MULTA_DE_ATRASO));
    expect(extravio!.texto).toContain(`${DIAS_PARA_EXTRAVIO} dias`);
    expect(extravio!.texto).toContain(`${MULTIPLICADOR_DE_EXTRAVIO} vezes`);
  });

  it("a 14ª/15ª cita a faixa da taxa e o teto do dano", () => {
    const [c] = porClausula("14ª");
    expect(c!.texto).toContain(brl(TAXA_LIMPEZA_MINIMA));
    expect(c!.texto).toContain(brl(TAXA_LIMPEZA_MAXIMA));
    expect(c!.texto).toContain(`${TETO_DO_DANO_EM_ALUGUEIS} vezes`);
  });

  it("a desistência cita a dedução e o prazo de devolução da loja", () => {
    const [c] = porClausula("11ª");
    expect(c!.texto).toContain(`${DEDUCAO_DA_RESCISAO_PCT}%`);
    expect(c!.texto).toContain(`${PRAZO_DEVOLUCAO_DA_LOJA_DIAS} dias`);
  });

  it("nenhuma frase carrega dinheiro escrito à mão — todo R$ sai do brl de uma constante", () => {
    // A peneira do formato: qualquer "R$" nas frases tem de ser um dos brl()
    // das constantes conhecidas. Um valor novo digitado à mão reprova aqui.
    const conhecidos = [MULTA_DE_ATRASO, TAXA_LIMPEZA_MINIMA, TAXA_LIMPEZA_MAXIMA].map((v) =>
      brl(v),
    );
    for (const c of clausulasDoContrato()) {
      // Centavos obrigatórios na grafia: sem eles a peneira comeria a vírgula
      // da FRASE junto ("R$ 250,00," ≠ "R$ 250,00").
      const dinheiros = c.texto.match(/R\$\s?\d[\d.]*,\d{2}/g) ?? [];
      for (const d of dinheiros) {
        expect(conhecidos, `"${d}" em "${c.titulo}" não sai de constante nenhuma`).toContain(d);
      }
    }
  });
});
