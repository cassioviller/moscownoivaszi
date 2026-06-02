// src/app/(app)/loja/[lojaId]/contratos/novo/page.tsx
// Formulário de contrato. Ao enviar, faz POST para o route handler que devolve
// o PDF como download (attachment) — form HTML nativo, sem JS no cliente.
// O conteúdo/layout do PDF é provisório e será revisto depois.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";

export const dynamic = "force-dynamic";

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[15px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const rotulo = "text-[12px] font-medium text-grafite";

function Campo({ name, label, type = "text", placeholder }: { name: string; label: string; type?: string; placeholder?: string }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className={rotulo}>{label}</span>
      <input name={name} type={type} placeholder={placeholder} className={campo} aria-label={label} />
    </label>
  );
}

export default async function NovoContratoPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) redirect(`/loja/${sc.loja.id}`);
  const { lojaId } = await params;
  const podeGerar = await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite hover:text-tinta">← {sc.loja.nome}</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Gerar contrato</h1>
        <p className="text-[13px] text-cinza-fumo">Preencha os dados e baixe o contrato em PDF. O modelo do documento será refinado depois.</p>
      </header>

      {!podeGerar ? (
        <p className="text-[14px] text-grafite">Você não tem permissão para gerar contratos.</p>
      ) : (
        <form action={`/loja/${lojaId}/contratos/gerar`} method="post" className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Noiva</h2>
            <Campo name="noivaNome" label="Nome da noiva" placeholder="Nome completo" />
            <div className="flex flex-wrap gap-3">
              <Campo name="cpf" label="CPF" placeholder="000.000.000-00" />
              <Campo name="whatsapp" label="WhatsApp" placeholder="(00) 00000-0000" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Vestido</h2>
            <Campo name="vestido" label="Modelo / código" placeholder="Ex.: Coleção Aurora — A-102" />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Valores e pagamento</h2>
            <div className="flex flex-wrap gap-3">
              <Campo name="valorTotal" label="Valor total" placeholder="R$ 0,00" />
              <Campo name="entrada" label="Entrada / Sinal" placeholder="R$ 0,00" />
            </div>
            <Campo name="formaPagamento" label="Forma de pagamento" placeholder="Ex.: 50% sinal + 2x" />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Datas</h2>
            <div className="flex flex-wrap gap-3">
              <Campo name="dataCasamento" label="Casamento" type="date" />
              <Campo name="dataRetirada" label="Retirada" type="date" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Campo name="dataDevolucao" label="Devolução" type="date" />
              <Campo name="dataContrato" label="Data do contrato" type="date" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Observações</h2>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Observações</span>
              <textarea name="observacao" rows={3} className={campo} aria-label="Observações" />
            </label>
          </section>

          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel
              transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-bordo"
          >
            Baixar contrato em PDF
          </button>
        </form>
      )}
    </main>
  );
}
