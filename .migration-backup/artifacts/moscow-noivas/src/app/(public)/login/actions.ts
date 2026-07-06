"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { criarSessao, setCookieSessao, verificarSenha } from "@/lib/auth";

export type LoginState = { erro?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  // Mensagem genérica: nunca revela se o email existe (decisão B.1 #6).
  const ERRO: LoginState = { erro: "Credenciais inválidas" };

  if (!email || !senha) return ERRO;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) return ERRO;

  const ok = await verificarSenha(senha, usuario.senhaHash);
  if (!ok) return ERRO;

  const sessao = await criarSessao(usuario.id);
  await setCookieSessao(sessao);

  // `redirect` lança internamente — não envolver em try/catch que pegue Error.
  // Super-admin vai pro console da plataforma; demais, pro fluxo de loja.
  redirect(usuario.isSuperAdmin ? "/admin" : "/");
}
