import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **S-C240 — a fiação do card das peças, pregada no fonte da tela.**
 *
 * A porta entrega `pecas` (`sc240-pecas-do-contrato-api.test.ts` prega isso), e
 * o componente existir não prova que a TELA o usa — é a lição da varredura de
 * fiação da S-C87, no mesmo diretório. Aqui prega-se o que a tela faz com o
 * dado: que ela o LEIA da porta em vez de rederivar, que desenhe o nome, e que
 * leve à ficha da reserva — que é onde moram a troca da 17ª, a prova e a
 * devolução.
 *
 * Sobre o caminho: a tela do contrato deliberadamente **não repete os gestos**
 * da peça. Repetir seria a segunda grafia da troca (regra 26), e a S-C232
 * mostrou o preço de duas telas dizendo a mesma coisa. O que faltava não era
 * gesto — era o caminho.
 */

const TELA = join(import.meta.dirname, "[id].tsx");

describe("S-C240 — a tela do contrato mostra as peças e leva à reserva", () => {
  const fonte = readFileSync(TELA, "utf8");

  it("a tela tem o que varrer — piso, senão isto é verde por não ter olhado", () => {
    // S-C260: régua sobre arquivo que encolheu é régua que atesta o que não vê.
    expect(fonte.split("\n").length).toBeGreaterThan(800);
  });

  it("lê as peças da PORTA, sem rederivar a lista na tela", () => {
    // A porta já filtra reserva cancelada e ordena pela mais antiga. Rederivar
    // aqui seria a segunda grafia da mesma regra — o defeito do E187.
    expect(fonte).toMatch(/contrato\?\.pecas\s*\?\?\s*\[\]/);
    // E não monta a lista a partir dos ids crus, que é o que existia antes.
    expect(fonte).not.toMatch(/bloqueioVestidoIds\s*\.\s*map/);
  });

  it("desenha o card, o nome da peça e o caminho para a ficha da reserva", () => {
    expect(fonte).toContain('data-testid="pecas-do-contrato"');
    expect(fonte).toContain("Peças deste contrato");
    expect(fonte).toContain("{p.nome}");
    // O endereço da ficha da reserva — a mesma grafia usada em `contratos/index.tsx`.
    expect(fonte).toMatch(/to=\{`\/loja\/\$\{lojaId\}\/reservas\/\$\{p\.bloqueioId\}`\}/);
    expect(fonte).toContain("Abrir a reserva");
  });

  it("a frase de vazio é honesta, e diz os DOIS motivos de não haver peça", () => {
    // Contrato só de serviço e reserva desfeita produzem a mesma lista vazia; a
    // frase não escolhe uma delas como se soubesse qual foi.
    expect(fonte).toContain("Nenhuma peça do acervo presa por este contrato");
    expect(fonte).toContain("só de serviço");
    expect(fonte).toContain("reserva foi desfeita");
  });
});
