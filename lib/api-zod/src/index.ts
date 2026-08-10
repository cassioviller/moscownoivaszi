export * from "./generated/api";
export * from "./generated/types";
// Colisão de nomes entre o schema zod (generated/api) e o tipo de query
// params (generated/types) — o re-export explícito desambigua a favor do
// schema zod, que é o que o servidor consome para validar.
export {
  CheckDisponibilidadeVestidosParams,
  ListPagamentosParams,
  ListParcelasParams,
  ListContasPagarParams,
  ExportarFolhaParams,
  ListComissaoFechamentosParams,
  PreviewComissaoParams,
  GetVestidoFotoParams,
  ExportarContasPagarParams,
  ExportarParcelasParams,
  ExportarFluxoParams,
  ListLeadsParams,
  GetMinhaComissaoParams,
  GetUtilizacaoVestidosParams,
  ListLookbooksParams,
  ListBloqueiosParams,
  ListAuditoriaParams,
  ExportarAuditoriaParams,
  ListOrcamentosParams,
  ListContratosParams,
  CreateParcelaAvulsaBody,
  ExpurgarLeadsPerdidosBody,
  PreviaExpurgoLeadsPerdidosParams,
  GetConversaoLeadsParams,
  GetFluxoCaixaParams,
  GetDreParams,
  ListAtendimentosParams,
  ConfirmarProvaPortalParams,
  PedirRemarcacaoPortalParams,
  GetComprometimentoEstoqueParams,
  ListAusenciasParams,
} from "./generated/api";
