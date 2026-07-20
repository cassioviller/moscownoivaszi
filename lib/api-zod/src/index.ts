export * from "./generated/api";
export * from "./generated/types";
// Colisão de nomes entre o schema zod (generated/api) e o tipo de query
// params (generated/types) — o re-export explícito desambigua a favor do
// schema zod, que é o que o servidor consome para validar.
export {
  CheckDisponibilidadeVestidosParams,
  ListPagamentosParams,
  ListParcelasParams,
  ExportarFolhaParams,
  ListComissaoFechamentosParams,
  PreviewComissaoParams,
  GetVestidoFotoParams,
  ExportarContasPagarParams,
  ExportarParcelasParams,
  ListLeadsParams,
  GetMinhaComissaoParams,
  GetUtilizacaoVestidosParams,
  ListLookbooksParams,
} from "./generated/api";
