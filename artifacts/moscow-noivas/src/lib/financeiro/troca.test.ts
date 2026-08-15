import { describe, expect, it } from "vitest";
import {
  PRAZO_DA_TROCA_DIAS,
  diaDaSemana,
  vetoDaTroca17a,
} from "@workspace/financeiro-core";

/**
 * **E219 — a troca de traje tem prazo** (cláusula 17ª caput e §1º).
 *
 * Mora aqui, e não ao lado do módulo, pela razão dos irmãos `atraso.test.ts`
 * e `reajuste.test.ts`: nenhum `vitest.config` alcança `lib/**`.
 *
 * As datas são LITERAIS de propósito — a régua decide por dia da semana, e um
 * teste que dependesse do dia em que roda seria a S-O119 de novo. A âncora é
 * a mesma da suíte de API (`DATA_BASE_CASAMENTO`): meio-dia de São Paulo,
 * offset explícito, sem DST desde 2019.
 */
const sp = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

describe("E219 — o veto da 17ª sobre a troca de peça", () => {
  it("diaDaSemana responde os sete dias de uma semana conhecida", () => {
    // 2027-09-12 é domingo (conferível por qualquer calendário de 2027).
    const nomes = [0, 1, 2, 3, 4, 5, 6].map((n) => diaDaSemana(`2027-09-${12 + n}`));
    expect(nomes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("dentro dos 7 dias, em dia de semana comum: pode trocar", () => {
    // Fechou segunda 13/09/2027; quinta 16/09 é o 3º dia.
    expect(vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-16") })).toBeNull();
  });

  it("o limite é INCLUSIVO: o 7º dia ainda troca, o 8º não", () => {
    // Fechou segunda 13/09; +7 = segunda 20/09 (troca); terça 21/09 (recusa).
    expect(vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-20") })).toBeNull();
    const veto = vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-21") });
    expect(veto?.error).toBe("TROCA_FORA_DO_PRAZO");
    // A frase diz a cláusula, o prazo E a convenção — de onde o número veio.
    expect(veto?.detalhe).toContain("cláusula 17ª");
    expect(veto?.detalhe).toContain(`${PRAZO_DA_TROCA_DIAS} dias`);
    expect(veto?.detalhe).toContain("fechou em 13/09/2027");
    expect(veto?.detalhe).toContain("conta do fecho do contrato");
  });

  it("sexta e sábado recusam mesmo dentro do prazo (§1º), e a frase nomeia o dia", () => {
    // Fechou segunda 13/09; sexta 17/09 e sábado 18/09 estão no prazo.
    const sexta = vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-17") });
    expect(sexta?.error).toBe("TROCA_EM_DIA_VEDADO");
    expect(sexta?.detalhe).toContain("sexta-feira");
    const sabado = vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-18") });
    expect(sabado?.error).toBe("TROCA_EM_DIA_VEDADO");
    expect(sabado?.detalhe).toContain("sábado");
    // Domingo 19/09 volta a poder: o §1º é só sexta e sábado.
    expect(vetoDaTroca17a({ fechadoEm: sp("2027-09-13"), hoje: sp("2027-09-19") })).toBeNull();
  });

  it("fora do prazo NUMA sexta: a recusa é a do prazo — a frase não muda com o dia da semana", () => {
    // Fechou 01/09/2027 (quarta); sexta 24/09 está 23 dias depois.
    const veto = vetoDaTroca17a({ fechadoEm: sp("2027-09-01"), hoje: sp("2027-09-24") });
    expect(veto?.error).toBe("TROCA_FORA_DO_PRAZO");
  });

  it("a conta é por DIA LOCAL, não por instante: 23h de SP e 1h de UTC são o mesmo dia de negócio", () => {
    // 2027-09-20T23:30 em SP é 2027-09-21T02:30Z — se a régua lesse o instante
    // cru em UTC, o 7º dia viraria 8º e a troca seria recusada um dia antes.
    const fechadoEm = new Date("2027-09-13T23:30:00-03:00");
    const hoje = new Date("2027-09-20T23:30:00-03:00");
    expect(vetoDaTroca17a({ fechadoEm, hoje })).toBeNull();
  });
});
