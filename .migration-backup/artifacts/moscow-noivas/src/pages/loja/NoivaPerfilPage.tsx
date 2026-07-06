import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { api } from "@/lib/api";

const ETAPA_LABEL: Record<string, string> = {
  NOVO: "Nova", INTERESSES_PREENCHIDOS: "Interesses preenchidos", ATENDIMENTO_AGENDADO: "Atendimento agendado",
  EM_ATENDIMENTO: "Em atendimento", ORCAMENTO_ABERTO: "Orçamento aberto", CONTRATO_FECHADO: "Contrato fechado",
  EM_PROVAS: "Em provas", RETIRADO: "Retirado", CASAMENTO_REALIZADO: "Casamento realizado",
  DEVOLVIDO: "Devolvido", PERDIDO: "Perdida",
};

export default function NoivaPerfilPage() {
  const params = useParams<{ lojaId: string; leadId: string }>();
  const { lojaId, leadId } = params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lojaId && leadId) {
      api.get(`/loja/${lojaId}/noivas/${leadId}`).then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [lojaId, leadId]);

  if (loading) return <div className="p-8 text-cinza-fumo text-[14px]">Carregando…</div>;
  if (!data) return <div className="p-8 text-bordo text-[14px]">Noiva não encontrada.</div>;

  const { lead, atendimentos, contratos } = data;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/noivas`} className="text-[13px] text-grafite hover:text-tinta w-fit">
          ← Noivas
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">{lead.noivaNome}</h1>
        <p className="text-[13px] text-cinza-fumo">{ETAPA_LABEL[lead.etapa] ?? lead.etapa}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-md border border-borda bg-papel-elevado p-4">
        <h2 className="text-[14px] font-medium text-tinta">Dados</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {lead.noivoNome && <><dt className="text-cinza-fumo">Noivo</dt><dd className="text-tinta">{lead.noivoNome}</dd></>}
          {lead.whatsapp && <><dt className="text-cinza-fumo">WhatsApp</dt><dd className="text-tinta">{lead.whatsapp}</dd></>}
          {lead.casamentoData && (
            <><dt className="text-cinza-fumo">Data do casamento</dt>
            <dd className="text-tinta">{new Date(lead.casamentoData).toLocaleDateString("pt-BR")}</dd></>
          )}
          {lead.casamentoLocal && <><dt className="text-cinza-fumo">Local</dt><dd className="text-tinta">{lead.casamentoLocal}</dd></>}
          <dt className="text-cinza-fumo">Origem</dt><dd className="text-tinta">{lead.origem}</dd>
        </dl>
      </section>

      {atendimentos?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-light text-tinta">Atendimentos</h2>
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {atendimentos.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-tinta">{new Date(a.inicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="text-cinza-fumo">{a.cabineNome} · {a.vendedoraNome}</span>
                </div>
                <span className="text-grafite">{a.situacao}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contratos?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-light text-tinta">Contratos</h2>
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {contratos.map((c: any) => (
              <li key={c.id}>
                <Link href={`/loja/${lojaId}/contratos/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-champagne/10">
                  <span className="text-tinta">Contrato de {new Date(c.fechadoEm).toLocaleDateString("pt-BR")}</span>
                  <span className="text-grafite">{c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-3">
        <Link href={`/loja/${lojaId}/atendimentos/novo?leadId=${lead.id}`}
          className="inline-flex items-center rounded-md border border-borda bg-papel-elevado px-4 py-2 text-[13px] text-tinta hover:border-cinza-fumo">
          Agendar atendimento
        </Link>
      </div>
    </div>
  );
}
