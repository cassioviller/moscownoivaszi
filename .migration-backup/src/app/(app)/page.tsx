// src/app/(app)/page.tsx
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Hub: o layout (app) já garantiu sessão + loja ativa. Resolve a URL canônica.
export default async function HomeRedirect() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login"); // narrow defensivo
  redirect(`/loja/${sc.loja.id}`);
}
