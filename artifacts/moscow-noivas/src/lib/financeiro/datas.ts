/**
 * E25: as datas do financeiro moram no motor único (@workspace/financeiro-core)
 * — a MESMA régua de dia local/dia de negócio que o api-server usa. Porta
 * local; datas.test.ts ao lado prova o core.
 */
export {
  diaLocal,
  diaDeNegocio,
  hojeLocal,
  competenciaValida,
  competenciaAtual,
  addDias,
  diasEntre,
  ultimasCompetencias,
  resolverIntervalo,
  instanteNoIntervalo,
  negocioNoIntervalo,
} from "@workspace/financeiro-core";
