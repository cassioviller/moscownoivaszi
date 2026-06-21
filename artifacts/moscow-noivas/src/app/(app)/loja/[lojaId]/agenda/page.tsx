// src/app/(app)/loja/[lojaId]/agenda/page.tsx
// A Agenda virou Calendário (4 abas). Mantemos a rota como redirect para não
// quebrar links antigos. Ver docs/superpowers/specs/2026-06-05-calendario-abas-design.md.
import { redirect } from "next/navigation";

export default async function AgendaRedirect({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  redirect(`/loja/${lojaId}/calendario`);
}
