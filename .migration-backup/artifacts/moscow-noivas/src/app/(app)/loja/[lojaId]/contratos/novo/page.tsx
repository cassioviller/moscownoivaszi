// src/app/(app)/loja/[lojaId]/contratos/novo/page.tsx
// Aposentado na S3: o contrato não nasce mais de um formulário em branco, e sim
// pré-preenchido de um orçamento aprovado (ou do perfil da noiva). Redireciona para a
// lista de contratos para não deixar uma rota órfã.
import { redirect } from "next/navigation";

export default async function NovoContratoPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  redirect(`/loja/${lojaId}/contratos`);
}
