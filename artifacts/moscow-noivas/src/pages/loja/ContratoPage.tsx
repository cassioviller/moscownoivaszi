import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";
import { brl } from "@/lib/dinheiro";

export default function ContratoPage() {
  const params = useParams<{ lojaId: string; contratoId: string }>();
  const { lojaId, contratoId } = params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId && contratoId) {
      api.get(`/loja/${lojaId}/contratos/${contratoId}`).then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [lojaId, contratoId]);

  if (loading) return <div className="p-8 text-cinza-fumo text-[14px]">Carregando…</div>;
  if (!data) return <div className="p-8 text-bordo text-[14px]">Contrato não encontrado.</div>;

  const { contrato, parcelas } = data;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/contratos`} className="text-[13px] text-grafite hover:text-tinta w-fit">← Contratos</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Contrato · {contrato.noivaNome}</h1>
        <p className="text-[13px] text-cinza-fumo">{new Date(contrato.fechadoEm).toLocaleDateString("pt-BR")} · {contrato.status}</p>
      </header>

      <section className="rounded-md border border-borda bg-papel-elevado p-4 flex flex-col gap-3">
        <h2 className="text-[14px] font-medium text-tinta">Dados do contrato</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-cinza-fumo">Valor total</dt><dd className="text-tinta font-medium">{brl(contrato.valorTotal)}</dd>
          {contrato.formaPagamento && <><dt className="text-cinza-fumo">Forma de pagamento</dt><dd className="text-tinta">{contrato.formaPagamento}</dd></>}
          {contrato.vendedoraNome && <><dt className="text-cinza-fumo">Vendedora</dt><dd className="text-tinta">{contrato.vendedoraNome}</dd></>}
          {contrato.vestidoDescricao && <><dt className="text-cinza-fumo">Vestido</dt><dd className="text-tinta">{contrato.vestidoDescricao}</dd></>}
          {contrato.dataCasamento && <><dt className="text-cinza-fumo">Data do casamento</dt><dd className="text-tinta">{new Date(contrato.dataCasamento).toLocaleDateString("pt-BR")}</dd></>}
          {contrato.dataRetirada && <><dt className="text-cinza-fumo">Retirada</dt><dd className="text-tinta">{new Date(contrato.dataRetirada).toLocaleDateString("pt-BR")}</dd></>}
          {contrato.dataDevolucao && <><dt className="text-cinza-fumo">Devolução</dt><dd className="text-tinta">{new Date(contrato.dataDevolucao).toLocaleDateString("pt-BR")}</dd></>}
        </dl>
      </section>

      {parcelas?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-light text-tinta">Parcelas</h2>
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {parcelas.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-tinta">{p.descricao ?? `Parcela ${p.numero}`}</span>
                  <span className="text-cinza-fumo">Vence: {new Date(p.vencimento).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="text-right flex flex-col gap-0.5">
                  <span className="text-tinta tabular-nums">{brl(p.valorPrevisto)}</span>
                  <span className={`text-[12px] ${p.status === "PAGA" ? "text-bordo" : "text-cinza-fumo"}`}>{p.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
