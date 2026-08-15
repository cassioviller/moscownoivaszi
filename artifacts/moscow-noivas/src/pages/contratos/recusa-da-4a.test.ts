import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recusaDoExpediente } from "@/lib/retirada-devolucao";

/**
 * **S-C93 — a recusa da cláusula 4ª aparece ANTES do clique.**
 *
 * A sobra dizia: *"`min`/`max` do `datetime-local` são absolutos e a faixa da 4ª
 * muda com o dia (sábado fecha antes). A solução é um seletor que conheça o
 * expediente, não o atributo."*
 *
 * ## O que a medição corrigiu
 *
 * **Os `min`/`max` não existem.** Varridos os **7** `datetime-local` do
 * repositório: nenhum tem `min` ou `max`. A premissa da sobra descreve um
 * estado que o código não tem — o que existia era o oposto, campo livre, e a
 * vendedora descobria a régua no 422.
 *
 * **E a solução já estava escrita.** `recusaDoExpediente` (`lib/retirada-devolucao.ts`)
 * nasceu no E224 com o docblock dizendo *"a recusa da 4ª para o que está
 * digitado, **antes do clique***", chamando a MESMA função do servidor
 * (`foraDoExpedienteDeRetirada`) e devolvendo a MESMA frase
 * (`fraseDaRecusaDeRetirada`). Ela tinha **teste próprio e ZERO chamadores em
 * tela** — o formato exato do E222 (*o campo existia e nenhuma tela o
 * oferecia*), da S-C151 e da S-C210, pela quarta vez nesta trilha.
 *
 * O conserto foi ligar o que já existia. O que a sobra pedia por "um seletor
 * que conheça o expediente" está aqui pelo outro lado: em vez de restringir o
 * que se pode digitar, **diz-se o que está errado no que se digitou** — e a
 * razão de não ser atributo é a que a própria sobra deu, agora com o mecanismo
 * medido: a faixa muda com o dia da semana (o sábado fecha mais cedo, e há dias
 * fechados), e `min`/`max` são absolutos.
 */

const TELA = join(import.meta.dirname, "[id].tsx");

describe("S-C93 — a 4ª recusa antes do clique, e a régua é a do servidor", () => {
  const fonte = readFileSync(TELA, "utf8");

  it("a tela tem o que varrer — piso (S-C260)", () => {
    expect(fonte.split("\n").length).toBeGreaterThan(800);
  });

  it("os dois campos leem `recusaDoExpediente`, e não reimplementam a 4ª", () => {
    // Regra 26: a segunda grafia da 4ª divergiria da porta no dia em que a
    // dona mudasse o expediente. O helper chama a função do `agenda-core` que
    // o servidor usa.
    expect(fonte).toContain("recusaDoExpediente(retiradaEditada");
    expect(fonte).toContain("recusaDoExpediente(devolucaoEditada");
    // E não há régua de horário escrita à mão nesta tela.
    expect(fonte).not.toMatch(/aberturaMinutos|fechamentoMinutos|\bdias\.includes\(/);
  });

  it("a recusa é DESENHADA — a conta existir não prova que a tela a mostra", () => {
    // A lição da varredura de fiação da S-C87, no mesmo diretório.
    expect(fonte).toContain('data-testid="recusa-retirada-4a"');
    expect(fonte).toContain('data-testid="recusa-devolucao-4a"');
    expect(fonte).toContain("aria-invalid={!!recusaDaRetirada}");
    expect(fonte).toContain("aria-invalid={!!recusaDaDevolucao}");
  });

  it("nenhum campo de data desta tela usa `min`/`max` de horário — eles são absolutos", () => {
    // O que a sobra pedia, pregado: a faixa da 4ª muda com o dia, e atributo
    // fixo mentiria em metade da semana. Se alguém tentar o atalho, reprova.
    const dialogo = fonte.slice(fonte.indexOf('data-testid="input-data-retirada"') - 800);
    const ateFimDoDialogo = dialogo.slice(0, dialogo.indexOf("prazo-devolucao-reserva"));
    expect(ateFimDoDialogo).not.toMatch(/\bmin=\{/);
    expect(ateFimDoDialogo).not.toMatch(/\bmax=\{/);
  });
});

describe("S-C93 — a régua que a tela passou a chamar diz o que a porta diria", () => {
  const REGRA = {
    retiradaDias: [1, 2, 3, 4, 5, 6],
    retiradaAberturaMinutos: 9 * 60,
    retiradaFechamentoMinutos: 18 * 60,
    retiradaFechamentoSabadoMinutos: 13 * 60,
  };

  it("o sábado fecha antes, e é o caso que `max` fixo não sabe representar", () => {
    // 2028-09-09 é um sábado. Às 14h a loja já fechou; na quarta, não.
    const sabado = recusaDoExpediente("2028-09-09T14:00", REGRA);
    expect(sabado).toBeTruthy();
    expect(sabado).toContain("sábado");

    expect(recusaDoExpediente("2028-09-06T14:00", REGRA)).toBeNull();
  });

  it("o campo vazio não acusa nada — as duas datas são opcionais no contrato", () => {
    expect(recusaDoExpediente("", REGRA)).toBeNull();
    expect(recusaDoExpediente(null, REGRA)).toBeNull();
  });
});
