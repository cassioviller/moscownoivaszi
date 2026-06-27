// src/lib/dinheiro.ts
// Aritmética de dinheiro em CENTAVOS inteiros (sem float). Compartilhado por orçamentos
// (S2) e contratos (S3). Decimal(10,2) no banco; string na borda.
import type { Prisma } from "@/generated/prisma/client";

// pt-BR/US → centavos inteiros (≥ 0). Lança se vazio/negativo/inválido.
// Regra do ponto (sem vírgula): é DECIMAL só quando há um único ponto seguido de 1–2
// dígitos ("1234.56", "50.5"); caso contrário é separador de MILHAR ("1.234" = 1234,
// "1.000" = 1000). Com vírgula, vírgula=decimal e pontos=milhar ("1.234,56").
export function paraCentavos(raw: string): number {
  const limpo = raw.trim().replace(/\s/g, "");
  if (limpo === "") throw new Error("valor vazio");
  let norm: string;
  if (limpo.includes(",")) {
    norm = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    norm = limpo; // decimal explícito (até 2 casas)
  } else {
    norm = limpo.replace(/\./g, ""); // pontos = milhar
  }
  // Bloqueia "", "-5", "1e3", letras — só dígitos com opcional parte decimal.
  if (!/^\d+(\.\d+)?$/.test(norm)) throw new Error("valor inválido");
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) throw new Error("valor inválido");
  return Math.round(n * 100);
}

// centavos → "1234.56" (string Decimal-friendly).
export function deCentavos(c: number): string {
  return (c / 100).toFixed(2);
}

// Decimal do Prisma (ou string/null) → centavos inteiros. null → 0.
export function decParaCentavos(d: Prisma.Decimal | string | null): number {
  if (d == null) return 0;
  return Math.round(Number(d) * 100);
}

// Decimal do Prisma (ou string/number) → "1234.56" (string Decimal-friendly p/ as Views).
// Dono canônico do Number(x).toFixed(2) que se repetia em receber/pagar/comissao/contabilidade.
export function decParaString(d: Prisma.Decimal | string | number): string {
  return Number(d).toFixed(2);
}

// Idem, preservando o null (campos opcionais nas Views).
export function decParaStringN(d: Prisma.Decimal | string | number | null): string | null {
  return d === null ? null : decParaString(d);
}

// "1234.56" (string Decimal-friendly) → "R$ 1.234,56" p/ exibição. Negativo vira "-R$ …".
export const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
