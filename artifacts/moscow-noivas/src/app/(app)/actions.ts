"use server";

import { redirect } from "next/navigation";
import {
  clearCookieSessao,
  destruirSessao,
  getCookieSessao,
} from "@/lib/auth";

export async function logoutAction(): Promise<void> {
  const id = await getCookieSessao();
  if (id) await destruirSessao(id);
  await clearCookieSessao();
  redirect("/login");
}
