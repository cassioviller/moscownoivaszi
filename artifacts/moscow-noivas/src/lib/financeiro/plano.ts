/**
 * E95: o carnê mora no motor único (@workspace/financeiro-core) — a MESMA
 * função que o `gerar-plano` do servidor usa e que o `POST /contratos` vai
 * validar. Porta local; `plano.test.ts` ao lado prova o core pela borda em que
 * a divergência aparecia — a tela, onde 1,77% dos carnês saíam diferentes do
 * que o servidor teria gerado, em silêncio.
 */
export {
  montarPlanoParcelas,
  ratearRestante,
  addMeses,
  ancoraDeNegocio,
  type ParcelaPlanejada,
  type PlanoParams,
} from "@workspace/financeiro-core";
