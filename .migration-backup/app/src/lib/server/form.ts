// src/lib/server/form.ts
// Utilitários de FormData e redirect de resultado, compartilhados pelas Server Actions de
// loja. Antes copiados idênticos em vários actions.ts (str/comAviso/destino). Puros — sem
// "use server"; importados pelos arquivos de action.
import { caminhoInternoSeguro } from "@/lib/url-interna";

/** Lê um campo do formulário como string aparada (vazio se ausente). */
export function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/** Anexa ?ok=… ou ?erro=… à URL de volta (preserva query existente). */
export function comAviso(base: string, chave: "ok" | "erro", valor: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}${chave}=${valor}`;
}

/** Destino de volta: o campo "voltar" saneado (interno à loja) ou um fallback. */
export function destino(fd: FormData, lojaId: string, fallback: string): string {
  return caminhoInternoSeguro(str(fd, "voltar"), lojaId, fallback);
}
