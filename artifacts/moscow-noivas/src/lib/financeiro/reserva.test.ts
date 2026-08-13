import { describe, expect, it } from "vitest";
import {
  avisoDeEntradaAbaixoDaReserva,
  entradaDaReserva,
  foraDoPrazoDaRetirada,
  PRAZO_ANTES_DA_RETIRADA_DIAS,
  RESERVA_PCT,
  ancoraDeNegocio,
} from "@workspace/financeiro-core";

/**
 * **E218 — a reserva de 40% e o prazo dos 20 dias** (cláusula 8ª §1º e o
 * parágrafo único do objeto).
 *
 * As duas regras vêm do mesmo contrato e recebem tratamentos opostos — uma
 * avisa, a outra recusa —, e a razão é medida: **101 dos 208 contratos com
 * entrada estão abaixo dos 40%**, contra **2 de 6** parcelas fora do prazo.
 * Recusar a primeira tornaria quase metade do que a loja já fez irreproduzível.
 */
describe("E218 — a reserva de 40% (8ª §1º)", () => {
  it("a cláusula é 40%, e a sugestão sai dela", () => {
    expect(RESERVA_PCT).toBe(40);
    expect(entradaDaReserva(5000)).toBe(2000);
    expect(entradaDaReserva(3000)).toBe(1200);
  });

  it("arredonda em centavos — R$ 1.282,00 dá R$ 512,80, não 512,7999", () => {
    expect(entradaDaReserva(1282)).toBe(512.8);
    expect(entradaDaReserva(0.05)).toBe(0.02);
  });

  it("entrada de 40% em ponto NÃO avisa — a cláusula está cumprida", () => {
    expect(avisoDeEntradaAbaixoDaReserva(2000, 5000)).toBeNull();
  });

  it("entrada maior também não avisa: a cláusula é piso, não teto", () => {
    // Medido: a entrada média da loja é 67,6% do total.
    expect(avisoDeEntradaAbaixoDaReserva(3380, 5000)).toBeNull();
  });

  it("**abaixo, avisa e diz quanto falta — sem impedir**", () => {
    const a = avisoDeEntradaAbaixoDaReserva(1000, 5000);
    expect(a?.sugerida).toBe(2000);
    expect(a?.falta).toBe(1000);
    expect(a?.pct).toBe(20);
    expect(a?.aviso).toContain("8ª §1º");
    // O espaço do `brl` é DURO (NBSP), e escrito escapado de propósito: o
    // literal é invisível no editor, e quem normaliza espaços o troca sem
    // aparecer no diff. A S-C30 fechou os 9 sítios que o carregavam, e a
    // `varredura-espaco-duro-literal` reprova o próximo.
    expect(a?.aviso).toContain("R$\u00a02.000,00");
    // A frase diz que dá para seguir: quem decide o desconto é a loja.
    expect(a?.aviso).toContain("Pode seguir");
  });

  it("o percentual tem uma casa — 39,9%, não 39,87654%", () => {
    expect(avisoDeEntradaAbaixoDaReserva(1995, 5000)?.pct).toBe(39.9);
  });

  it("entrada zero avisa pelo total, e é o caso mais comum do carnê sem entrada", () => {
    expect(avisoDeEntradaAbaixoDaReserva(0, 5000)?.falta).toBe(2000);
  });

  it("contrato sem valor não gera aviso — não há percentual de zero", () => {
    expect(avisoDeEntradaAbaixoDaReserva(0, 0)).toBeNull();
  });
});

describe("E218 — o prazo dos 20 dias antes da retirada (§ único)", () => {
  // Retirada numa sexta, 04/09/2026. O limite cai em 15/08/2026.
  const retirada = "2026-09-04T13:00:00-03:00";

  it("o prazo do contrato é 20 dias", () => {
    expect(PRAZO_ANTES_DA_RETIRADA_DIAS).toBe(20);
  });

  it("parcela dentro do prazo passa", () => {
    expect(foraDoPrazoDaRetirada("2026-08-10T12:00:00-03:00", retirada)).toBeNull();
  });

  it("**o próprio dia-limite CUMPRE a cláusula** — 'até 20 dias antes' inclui o 20º", () => {
    expect(foraDoPrazoDaRetirada("2026-08-15T12:00:00-03:00", retirada)).toBeNull();
  });

  it("um dia depois do limite recusa, e a frase diz as duas datas", () => {
    const r = foraDoPrazoDaRetirada("2026-08-16T12:00:00-03:00", retirada);
    expect(r?.limite).toBe("2026-08-15");
    expect(r?.diasDepois).toBe(1);
    expect(r?.detalhe).toContain("15/08/2026");
    expect(r?.detalhe).toContain("16/08/2026");
    expect(r?.detalhe).toContain("parágrafo único");
  });

  it("parcela depois da própria retirada recusa, e conta os dias", () => {
    expect(foraDoPrazoDaRetirada("2026-09-10T12:00:00-03:00", retirada)?.diasDepois).toBe(26);
  });

  it("**sem retirada declarada não há prazo — e é a maioria**", () => {
    // Medido: 722 dos 723 contratos não declaram a data de retirada (S-C35).
    expect(foraDoPrazoDaRetirada("2027-01-01T12:00:00-03:00", null)).toBeNull();
    expect(foraDoPrazoDaRetirada("2027-01-01T12:00:00-03:00", undefined)).toBeNull();
  });

  it("**a HORA da retirada não move o limite** — ela é instante, e o limite é dia", () => {
    // O expediente da 4ª (E222) vai das 10:30 às 19:00, e a hora da retirada
    // importa lá. Aqui não: as duas pontas do expediente dão o mesmo limite,
    // porque a conta dos 20 dias acontece em dias de calendário — que é onde a
    // cláusula a escreveu. A primeira versão desta função passava o instante
    // por `diaDeNegocio` (que lê em UTC) e a hora decidia: é a classe da
    // S-O117, e foi o teste quem a pegou.
    for (const hora of ["10:30", "19:00"]) {
      expect(foraDoPrazoDaRetirada(
        ancoraDeNegocio("2026-08-15"),
        `2026-09-04T${hora}:00-03:00`,
      )).toBeNull();
    }
  });

  it("o vencimento é DATA DE NEGÓCIO, e a régua o lê pela âncora do sistema", () => {
    // `ancoraDeNegocio` é o que a tela manda (`diaParaISO`) e o que o carnê
    // grava. A régua não inventa uma segunda leitura de data — usa a mesma do
    // resto do sistema, e é por isso que ela não precisa saber a hora.
    expect(foraDoPrazoDaRetirada(ancoraDeNegocio("2026-08-15"), retirada)).toBeNull();
    expect(foraDoPrazoDaRetirada(ancoraDeNegocio("2026-08-16"), retirada)?.diasDepois).toBe(1);
  });
});
