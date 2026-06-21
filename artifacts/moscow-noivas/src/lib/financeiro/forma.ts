// src/lib/financeiro/forma.ts
// Forma de pagamento como seleção (enum). Helpers de validação e rótulo PT-BR, compartilhados
// pelo contrato (forma combinada) e pela baixa de parcela (forma do recebimento).
import type { FormaPagamento } from "@/generated/prisma/client";

export const FORMAS: FormaPagamento[] = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};

/** True se `v` é um valor válido do enum FormaPagamento. */
export function formaValida(v: string): v is FormaPagamento {
  return (FORMAS as string[]).includes(v);
}

/** Rótulo PT-BR de uma forma. */
export function rotuloForma(f: FormaPagamento): string {
  return ROTULO_FORMA[f];
}
