import { describe, expect, it } from "vitest";
import { linkWhatsApp } from "./whatsapp";

/**
 * S17 — a régua do telefone da loja, dos DOIS lados.
 *
 * O card de "Dados da loja" desabilita o botão e explica quando o número não
 * vira link; o servidor recusa com `TELEFONE_SEM_WHATSAPP`
 * (`api-server/src/routes/equipe.ts`). São duas cópias da mesma régua, em
 * pacotes que não se importam — está anotado como sobra, e este arquivo é o que
 * fixa as bordas para as duas.
 *
 * Por que a régua importa: `linkWhatsApp` devolve `null` fora da faixa, e o
 * portal da noiva simplesmente **não renderiza o botão**. Telefone errado
 * degrada tão calado quanto telefone vazio — a diferença é que o vazio alguém
 * percebe.
 */
const vira = (t: string) => linkWhatsApp(t, "oi") !== null;

describe("S17 — que telefone da loja vira link de WhatsApp", () => {
  it("fixo com DDD (10) e celular com DDD (11) viram, e é o caso do balcão", () => {
    expect(vira("(11) 3333-4444")).toBe(true);
    expect(vira("(11) 98888-7777")).toBe(true);
  });

  it("já com o 55 na frente também vira — 12 e 13 dígitos", () => {
    expect(vira("55 11 3333-4444")).toBe(true);
    expect(vira("+55 11 98888-7777")).toBe(true);
  });

  it("sem DDD não vira, e é o erro mais comum de quem digita rápido", () => {
    expect(vira("3333-4444")).toBe(false);
    expect(vira("98888-7777")).toBe(false);
  });

  it("13 dígitos que NÃO começam em 55 não viram — a faixa não basta", () => {
    expect(vira("1234567890123")).toBe(false);
  });

  it("longo demais não vira", () => {
    expect(vira("55 11 98888-77770")).toBe(false);
  });

  it("vazio é ausência, não erro — a loja pode não ter WhatsApp", () => {
    // O card e o servidor tratam vazio como permitido; o `null` daqui é o que
    // faz o botão do portal não existir, que é o certo quando não há número.
    expect(linkWhatsApp("", "oi")).toBeNull();
    expect(linkWhatsApp(null, "oi")).toBeNull();
  });
});
