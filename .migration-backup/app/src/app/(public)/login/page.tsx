import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const sessao = await getSessao();
  if (sessao) redirect("/");

  return (
    <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
      <div className="w-full max-w-[360px] flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-[28px] sm:text-[32px] font-light tracking-tight leading-[1.1] text-tinta">
            Moscow Noivas
          </h1>
          <p className="text-[14px] leading-relaxed text-grafite">
            Acesse o sistema interno.
          </p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
