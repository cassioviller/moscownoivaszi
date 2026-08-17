// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoPontasTrocadas, AVISO_PONTAS_TROCADAS_TESTID } from "./aviso-pontas-trocadas";

/**
 * **S-RM28 (E265) — a janela não reinterpreta o gesto em silêncio.**
 *
 * O `resolverIntervalo` troca as pontas quando a primeira fica depois da
 * segunda, e a troca é boa: ela é o que torna uma URL montada à mão tolerável,
 * e duas rotas de API dependem dela. O que faltava é a tela DIZER que trocou —
 * na folha, esse intervalo alimenta um carimbo de mão única.
 *
 * O aviso é um componente só para as quatro telas (regra 26), então a régua
 * dele é a do componente: **aparece quando trocou, some quando não trocou, e
 * diz a janela RESULTANTE** — quem carimba precisa ler o período que vai
 * carimbar, não uma advertência genérica.
 *
 * O caso do `:39` é o que a sobra não enxergava: **uma ponta sozinha**. É a
 * forma dos 302 recebimentos do E260, e ela continua alcançável por um link
 * mesmo depois de o E261 fechar a escrita perdida no frame.
 */
describe("AvisoPontasTrocadas", () => {
  it("não aparece quando as pontas chegam em ordem", () => {
    render(<AvisoPontasTrocadas ini="2026-01-01" fim="2026-08-31" />);
    expect(screen.queryByTestId(AVISO_PONTAS_TROCADAS_TESTID)).toBeNull();
  });

  it("não aparece quando a URL não traz janela nenhuma", () => {
    render(<AvisoPontasTrocadas ini={null} fim={null} />);
    expect(screen.queryByTestId(AVISO_PONTAS_TROCADAS_TESTID)).toBeNull();
  });

  it("aparece dizendo a janela resultante quando a pessoa inverte as pontas", () => {
    render(<AvisoPontasTrocadas ini="2026-08-31" fim="2026-01-01" />);
    const aviso = screen.getByTestId(AVISO_PONTAS_TROCADAS_TESTID);
    expect(aviso).toHaveTextContent("As datas estavam invertidas e foram trocadas");
    expect(aviso).toHaveTextContent("de 01/01/2026 a 31/08/2026");
  });

  it("aparece quando só o fim vem na URL e o default do mês fica do lado errado", () => {
    render(<AvisoPontasTrocadas ini={null} fim="2024-04-04" />);
    expect(screen.getByTestId(AVISO_PONTAS_TROCADAS_TESTID)).toHaveTextContent("04/04/2024");
  });
});
