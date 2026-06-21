// Cobre todo o subtree do financeiro (fluxo, receber, pagar, folha, comissões, regras):
// cabeçalho + 3 cards de resumo + lista. Suspense por segmento — sem mais tela congelada.
import { EsqueletoTela } from "@/components/EsqueletoTela";

export default function CarregandoFinanceiro() {
  return <EsqueletoTela largura="2xl" cards={3} linhas={6} />;
}
