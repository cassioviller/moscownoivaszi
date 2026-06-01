import { redirect } from "next/navigation";
import { gateSessaoLojaAtiva } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const estado = await gateSessaoLojaAtiva();

  if (estado.tipo === "sem-sessao") redirect("/login");
  if (estado.tipo === "sem-loja-ativa") redirect("/selecionar-loja");

  // estado.tipo === "ok": sessão + loja ativa válidas.
  return <>{children}</>;
}
