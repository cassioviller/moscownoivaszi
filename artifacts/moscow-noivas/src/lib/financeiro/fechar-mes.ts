import type { EstadoDeConsultas } from "@/lib/estado-consulta";

/**
 * E139 (B10) — fechar o mês vira roteiro com estado.
 *
 * Fechar o mês são 5 visitas a 4 telas (Comissões → Folha → Pagar → Folha →
 * DRE) com a ordem escrita em lugar nenhum — quem fecha é a dona, uma vez por
 * mês: frequência baixa demais para decorar, alta demais para redescobrir. O
 * roteiro mora na Folha (a porta que o F31/E103 abriu) e cada passo deriva o
 * estado das MESMAS rotas que as telas de destino consomem.
 *
 * A decisão de exibição é a lição do E121 aplicada no nascimento (cuidado a):
 * **carregando não vira pendente** — um passo sem resposta diz "conferindo",
 * nunca inventa um ✗ que mande a dona refazer o que já está feito.
 */
export type PassoEstado = "conferindo" | "semResposta" | "feito" | "pendente";

export function estadoDoPasso(consulta: EstadoDeConsultas, concluido: boolean): PassoEstado {
  if (consulta === "carregando") return "conferindo";
  if (consulta === "erro") return "semResposta";
  return concluido ? "feito" : "pendente";
}
