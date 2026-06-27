import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { api } from "@/lib/api";

const brl = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORMAS = [
  ["PIX", "Pix"], ["CARTAO_CREDITO", "Cartão de crédito"], ["CARTAO_DEBITO", "Cartão de débito"],
  ["DINHEIRO", "Dinheiro"], ["BOLETO", "Boleto"], ["TRANSFERENCIA", "Transferência"], ["OUTRO", "Outro"],
] as const;

interface Vestido { id: string; codigo: string; nome: string; precoBase: string }
interface Item { id: string; tipo: string; descricao: string; valorUnitario: string; quantidade: number }

export default function OrcamentoPage() {
  const { lojaId, orcamentoId } = useParams<{ lojaId: string; orcamentoId: string }>();
  const [, navigate] = useLocation();
  const [data, setData] = useState<any>(null);
  const [vestidos, setVestidos] = useState<Vestido[]>([]);
  const [erro, setErro] = useState("");

  // form de item
  const [tipo, setTipo] = useState("VESTIDO");
  const [vestidoId, setVestidoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [qtd, setQtd] = useState(1);

  // desconto
  const [descTipo, setDescTipo] = useState("");
  const [descValor, setDescValor] = useState("");

  // fechar contrato
  const [entrada, setEntrada] = useState("");
  const [numParcelas, setNumParcelas] = useState(3);
  const [primeiroVenc, setPrimeiroVenc] = useState("");
  const [forma, setForma] = useState("PIX");
  const [cpf, setCpf] = useState("");
  const [comissao, setComissao] = useState(5);
  const [fechando, setFechando] = useState(false);
  const [sucesso, setSucesso] = useState<any>(null);

  function carregar() {
    api.get(`/loja/${lojaId}/orcamentos/${orcamentoId}`).then((d) => {
      setData(d);
      setDescTipo(d.orcamento.descontoTipo ?? "");
      setDescValor(d.orcamento.descontoValor != null ? String(Number(d.orcamento.descontoValor)) : "");
    }).catch((e) => setErro(e.message));
  }
  useEffect(() => { if (lojaId && orcamentoId) carregar(); }, [lojaId, orcamentoId]);
  useEffect(() => {
    if (lojaId) api.get(`/loja/${lojaId}/vestidos?pagina=1`).then((d) => setVestidos(d.vestidos)).catch(() => {});
  }, [lojaId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    try {
      const body: any = { tipo, descricao, valorUnitario: Number(valor), quantidade: qtd };
      if (tipo === "VESTIDO" && vestidoId) body.vestidoId = vestidoId;
      await api.post(`/loja/${lojaId}/orcamentos/${orcamentoId}/itens`, body);
      setVestidoId(""); setDescricao(""); setValor(""); setQtd(1);
      carregar();
    } catch (err: any) { setErro(err.message); }
  }
  async function removerItem(id: string) {
    setErro("");
    try { await api.delete(`/loja/${lojaId}/orcamentos/${orcamentoId}/itens/${id}`); carregar(); }
    catch (err: any) { setErro(err.message); }
  }
  async function salvarDesconto() {
    setErro("");
    try {
      await api.put(`/loja/${lojaId}/orcamentos/${orcamentoId}`, {
        descontoTipo: descTipo || null, descontoValor: descTipo ? Number(descValor || 0) : null,
      });
      carregar();
    } catch (err: any) { setErro(err.message); }
  }
  async function fecharContrato(e: React.FormEvent) {
    e.preventDefault(); setErro(""); setFechando(true);
    try {
      const r = await api.post(`/loja/${lojaId}/orcamentos/${orcamentoId}/fechar-contrato`, {
        entrada: entrada === "" ? null : Number(entrada),
        numParcelas, primeiroVencimento: primeiroVenc, formaPagamento: forma, cpf, comissaoPct: comissao,
      });
      setSucesso(r);
    } catch (err: any) { setErro(err.message); setFechando(false); }
  }

  if (erro && !data) return <div className="p-8 text-bordo">{erro}</div>;
  if (!data) return <div className="p-8 text-cinza-fumo">Carregando…</div>;

  const { orcamento, itens, totais, editavel, contratoId } = data as {
    orcamento: any; itens: Item[]; totais: any; editavel: boolean; contratoId: string | null;
  };
  const vestidoSel = vestidos.find(v => v.id === vestidoId);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/orcamentos`} className="text-[12px] text-grafite hover:text-bordo">← Orçamentos</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Carrinho · {orcamento.noivaNome}</h1>
        <p className="text-[13px] text-cinza-fumo">Vendedora: {orcamento.vendedoraNome}</p>
      </header>

      {erro && <p className="text-[13px] text-bordo">{erro}</p>}

      {/* Itens */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-light text-tinta">Itens</h2>
        {itens.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Carrinho vazio. Adicione vestidos e serviços.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
            {itens.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{it.descricao}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {it.tipo} · {it.quantidade} × {brl(it.valorUnitario)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[14px] text-tinta">{brl(Number(it.valorUnitario) * it.quantidade)}</span>
                  {editavel && (
                    <button onClick={() => removerItem(it.id)} className="text-[12px] text-bordo hover:underline">remover</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {editavel && (
          <form onSubmit={addItem} className="flex flex-col gap-3 rounded-md border border-borda bg-papel-elevado p-4">
            <div className="flex flex-wrap gap-3">
              <select value={tipo} onChange={e => { setTipo(e.target.value); setVestidoId(""); setDescricao(""); setValor(""); }}
                className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta">
                <option value="VESTIDO">Vestido</option>
                <option value="SERVICO">Serviço</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
              {tipo === "VESTIDO" ? (
                <select value={vestidoId}
                  onChange={e => {
                    const v = vestidos.find(x => x.id === e.target.value);
                    setVestidoId(e.target.value);
                    if (v) { setDescricao(`${v.nome} (${v.codigo})`); setValor(String(Number(v.precoBase))); }
                  }}
                  className="flex-1 min-w-[180px] rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta">
                  <option value="">Selecione o vestido…</option>
                  {vestidos.map(v => <option key={v.id} value={v.id}>{v.codigo} · {v.nome} — {brl(v.precoBase)}</option>)}
                </select>
              ) : (
                <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição"
                  className="flex-1 min-w-[180px] rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-cinza-fumo">Valor unitário (R$)</label>
                <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} required
                  className="w-36 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-cinza-fumo">Qtd</label>
                <input type="number" min="1" value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
              </div>
              <button type="submit"
                className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90">+ Adicionar</button>
            </div>
            {tipo === "VESTIDO" && vestidoSel && (
              <p className="text-[12px] text-cinza-fumo">Preenche descrição e preço do catálogo — você pode ajustar o valor.</p>
            )}
          </form>
        )}
      </section>

      {/* Desconto + Totais */}
      <section className="flex flex-col gap-3 rounded-md border border-borda bg-papel-elevado p-4">
        {editavel && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">Desconto</label>
              <select value={descTipo} onChange={e => setDescTipo(e.target.value)}
                className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta">
                <option value="">Sem desconto</option>
                <option value="PERCENTUAL">Percentual (%)</option>
                <option value="VALOR">Valor (R$)</option>
              </select>
            </div>
            {descTipo && (
              <input type="number" step="0.01" min="0" value={descValor} onChange={e => setDescValor(e.target.value)}
                placeholder={descTipo === "PERCENTUAL" ? "%" : "R$"}
                className="w-28 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            )}
            <button onClick={salvarDesconto}
              className="rounded-md border border-borda px-3 py-2 text-[13px] text-grafite hover:border-cinza-fumo">Aplicar</button>
          </div>
        )}
        <div className="flex flex-col gap-1 text-[14px]">
          <div className="flex justify-between text-cinza-fumo"><span>Subtotal</span><span>{brl(totais.subtotal)}</span></div>
          <div className="flex justify-between text-cinza-fumo"><span>Desconto</span><span>− {brl(totais.desconto)}</span></div>
          <div className="flex justify-between text-tinta text-[18px] font-medium pt-1"><span>Total</span><span>{brl(totais.total)}</span></div>
        </div>
      </section>

      {/* Fechar contrato */}
      {sucesso ? (
        <section className="flex flex-col gap-3 rounded-md border border-bordo/40 bg-champagne/20 p-5">
          <h2 className="text-[16px] font-medium text-tinta">✓ Contrato fechado!</h2>
          <ul className="text-[14px] text-grafite flex flex-col gap-1">
            <li>Valor do contrato: <strong>{brl(sucesso.total)}</strong></li>
            <li>Contas a receber geradas: <strong>{sucesso.parcelasGeradas} parcela(s)</strong></li>
            <li>Conta a pagar (comissão): <strong>{brl(sucesso.comissao)}</strong></li>
          </ul>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/loja/${lojaId}/contratos/${sucesso.contratoId}`)}
              className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90">Ver contrato →</button>
            <button onClick={() => navigate(`/loja/${lojaId}/financeiro/receber`)}
              className="rounded-md border border-borda px-4 py-2 text-[13px] text-grafite hover:border-cinza-fumo">Contas a receber</button>
          </div>
        </section>
      ) : contratoId ? (
        <section className="flex items-center justify-between gap-4 rounded-md border border-borda bg-papel-elevado p-5">
          <p className="text-[14px] text-grafite">Este orçamento já virou contrato.</p>
          <button onClick={() => navigate(`/loja/${lojaId}/contratos/${contratoId}`)}
            className="rounded-md bg-bordo px-4 py-2 text-[13px] font-medium text-champagne hover:bg-bordo/90">Ver contrato →</button>
        </section>
      ) : itens.length > 0 ? (
        <form onSubmit={fecharContrato} className="flex flex-col gap-4 rounded-md border border-borda bg-papel-elevado p-5">
          <h2 className="text-[16px] font-light text-tinta">Fechar contrato</h2>
          <p className="text-[12px] text-cinza-fumo">
            Gera o contrato e, automaticamente, as <strong>contas a receber</strong> (parcelas) e a <strong>conta a pagar</strong> (comissão da vendedora).
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">Entrada (R$)</label>
              <input type="number" step="0.01" min="0" value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="0,00"
                className="w-32 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">Nº de parcelas *</label>
              <input type="number" min="1" max="360" value={numParcelas} onChange={e => setNumParcelas(Math.max(1, Number(e.target.value)))} required
                className="w-24 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">1º vencimento *</label>
              <input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} required
                className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">Forma de pagamento</label>
              <select value={forma} onChange={e => setForma(e.target.value)}
                className="rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta">
                {FORMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">CPF da noiva</label>
              <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
                className="w-44 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-cinza-fumo">Comissão (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={comissao} onChange={e => setComissao(Number(e.target.value))}
                className="w-24 rounded-md border border-borda bg-papel px-3 py-2 text-[14px] text-tinta" />
            </div>
          </div>
          <button type="submit" disabled={fechando}
            className="self-start rounded-md bg-bordo px-5 py-2.5 text-[14px] font-medium text-champagne hover:bg-bordo/90 disabled:opacity-60">
            {fechando ? "Fechando…" : "Fechar contrato"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
