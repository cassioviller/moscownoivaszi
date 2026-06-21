"use client";
// AvisoFlash — o Aviso pós-ação que NÃO fica preso na URL. No mount: faz um fade-in
// calmo e remove ?ok/?erro via history.replaceState (sem navegar). Assim um F5 ou o
// botão voltar não re-exibem "Noiva adicionada", e o sucesso não vai parar no histórico
// /bookmark. O `tom` vem do servidor (ok presente → sucesso) p/ não haver mismatch de
// hidratação; o texto entra como children (mapeado em AVISOS na própria página).
import { useEffect, useState } from "react";
import { Aviso } from "./aviso";

export function AvisoFlash({
  children,
  tom = "ok",
}: {
  children: React.ReactNode;
  tom?: "ok" | "erro";
}) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    setVisivel(true);
    const url = new URL(window.location.href);
    if (url.searchParams.has("ok") || url.searchParams.has("erro")) {
      url.searchParams.delete("ok");
      url.searchParams.delete("erro");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  return (
    <Aviso tom={tom} className={`transition-opacity duration-300 ease-out ${visivel ? "opacity-100" : "opacity-0"}`}>
      {children}
    </Aviso>
  );
}
