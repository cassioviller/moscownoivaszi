/**
 * E25: as datas do financeiro moram no motor único (@workspace/financeiro-core)
 * — a MESMA régua de dia local/dia de negócio que o api-server usa. Porta
 * local; datas.test.ts ao lado prova o core.
 */
export {
  diaLocal,
  diaDeNegocio,
  inicioDoDia,
  hojeLocal,
  competenciaValida,
  competenciaAtual,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  addDias,
  diasEntre,
  ultimasCompetencias,
  resolverIntervalo,
  intervaloDaCompetencia,
  instanteNoIntervalo,
  negocioNoIntervalo,
  type Intervalo,
} from "@workspace/financeiro-core";
