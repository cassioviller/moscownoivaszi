import { cookies } from "next/headers";
import type { Sessao } from "@/generated/prisma/client";

export const COOKIE_NOME = "moscow_sessao";

export async function setCookieSessao(sessao: Sessao): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: COOKIE_NOME,
    value: sessao.id,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: sessao.expiraEm,
  });
}

export async function getCookieSessao(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_NOME)?.value ?? null;
}

export async function clearCookieSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NOME);
}
