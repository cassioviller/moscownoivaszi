export * from "./generated/api";
export * from "./generated/types";
// Colisão de nomes entre o schema zod (generated/api) e o tipo de query
// params (generated/types) — o re-export explícito desambigua a favor do
// schema zod, que é o que o servidor consome para validar.
export {
  // E273 — o corpo da importação do legado colide pelo mesmo motivo dos outros:
  // o zod de `generated/api` e o tipo de `generated/types` têm o mesmo nome, e
  // quem o servidor consome para VALIDAR é o zod.
  ImportarLegadoBody,
  CheckDisponibilidadeVestidosParams,
  ListPagamentosParams,
  ListMovimentosConciliacaoParams,
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
  ListReservasParams,
  ListAuditoriaParams,
  ExportarAuditoriaParams,
  ListOrcamentosParams,
  ListContratosParams,
  CreateParcelaAvulsaBody,
  ReservarPecaDoOrcamentoBody,
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
  MoraDaParcelaNoDiaParams,
} from "./generated/api";
