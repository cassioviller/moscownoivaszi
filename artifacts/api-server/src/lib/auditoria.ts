import { auditLogTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import type { DbExecutor } from "./disponibilidade";

/**
 * Trilha de auditoria (E10). Registrar SEMPRE dentro da transação da ação:
 * se o log falhar, a ação não acontece — ação sensível sem rastro é pior que
 * um 500. União fechada de ações: quem inventa ação nova passa por aqui e o
 * relatório já a conhece.
 */
export const ACOES_AUDITORIA = [
  "PARCELA_RECEBIDA",
  "RECEBIMENTO_ESTORNADO",
  "CONTA_PAGA",
  "PAGAMENTO_REGISTRADO",
  "PAGAMENTO_ESTORNADO",
  "ESTORNO_COMISSAO_BAIXADO",
  "COMISSAO_FECHAMENTO_REABERTO",
  // B3/E94: cancelar contrato é a MAIOR ação de dinheiro do sistema — anula as
  // parcelas previstas e, com `destinoPago: "estornar"`, zera o recebido das
  // PAGAS, tirando da receita dinheiro que já tinha entrado. Ela não deixava
  // rastro nenhum, enquanto a ação irmã e menor (estornar UMA parcela) sempre
  // deixou. Quem conferisse o caixa via a receita cair sem nada que explicasse.
  "CONTRATO_CANCELADO",
  // Administração (E56): mexer em quem entra e no que cada um pode é ação
  // sensível — a trilha era 100% financeira, e o feed do E18 mostrava "sem
  // ações sensíveis" justamente para quem só administra.
  "MEMBRO_ADICIONADO",
  "MEMBRO_ALTERADO",
  "MEMBRO_REMOVIDO",
  "CONVITE_CRIADO",
  "CONVITE_CANCELADO",
  "PERMISSOES_ALTERADAS",
  "PERMISSOES_RESTAURADAS",
  // E74: a noiva aceitou pelo link publico — sem sessao, autor desnormalizado.
  "ORCAMENTO_ACEITO",
  // E85: a noiva confirmou a presença pelo portal — mesma mecânica do aceite.
  "PROVA_CONFIRMADA",
  // E100/F37: e a noiva avisou que NÃO pode ir. Ela já era gravada desde a
  // parte 2, mas ficara fora desta união — o CSV da contadora caía no código
  // cru. Terceiro fato da mesma família do E97.
  "REMARCACAO_PEDIDA",
  "LEADS_ANONIMIZADOS",
  // Apagar a ficha da noiva leva junto atendimento, orçamento, interesse e
  // registro de cobrança pelo cascade. Era um `delete` cru — sem 404, sem
  // contagem e sem rastro —, e depois dele não há linha nenhuma de onde
  // reconstituir quem foi apagada. O detalhe guarda o nome e o que foi junto.
  "LEAD_REMOVIDO",
  // Remover uma parcela some com uma obrigação do carnê da noiva. É a operação
  // espelho do CONTA_PAGAR_REMOVIDA do E107, e ficou sem trilha pelo mesmo
  // tempo em que a irmã já tinha a dela.
  "PARCELA_REMOVIDA",
  // S4/E107: apagar uma conta PREVISTA some com uma obrigação. Não move caixa
  // realizado (a paga é recusada antes), e por isso é um degrau abaixo do B3 —
  // mas depois do DELETE não há linha para consultar, então o que não estiver
  // no detalhe da trilha está perdido.
  "CONTA_PAGAR_REMOVIDA",
  // F34/E103: declarar o mês à contabilidade. O carimbo é de MÃO ÚNICA — não há
  // rota que o limpe —, e a ação era a única escrita irreversível do financeiro
  // sem autor. O `entidadeId` carrega a JANELA, porque o fato é o período e não
  // um registro: é o que alguém procura ao perguntar "quem declarou junho?".
  "CONTABILIDADE_ENVIADA",
  // E115: dar um movimento por conferido com o extrato (F32/E103). Carimbo de
  // mão única sem rota que desfaça — era a única escrita irmã da de cima sem
  // autor, e "quem deu este movimento por conferido?" ficava sem resposta.
  "CONCILIACAO_MARCADA",
  // E115: os DELETEs que eram crus — a régua do E91/E106/E111 ("nada some sem
  // 404, contagem e rastro") aplicada a reserva, bloqueio, atendimento,
  // orçamento e avaria. Depois do DELETE a trilha é o único rastro deles.
  "RESERVA_REMOVIDA",
  "BLOQUEIO_REMOVIDO",
  "ATENDIMENTO_REMOVIDO",
  "ORCAMENTO_REMOVIDO",
  "AVARIA_REMOVIDA",
  // S-M1: o sexto DELETE cru, que o E115 não alcançou. A cabine é o único cuja
  // cascata leva ATENDIMENTOS inteiros — a guarda nova recusa apagar cabine com
  // agenda, e o rastro cobre a que não tem: depois do DELETE não sobra linha de
  // onde reconstituir nem o nome dela.
  "CABINE_REMOVIDA",
  // S-M16: os três que a conferência da S-M1 achou fora da régua do E115. O
  // item de estoque leva o nome e quantos itens o citavam (o set null é
  // decisão escrita — S-A14); o ajuste cobrado é recusado antes (409), então
  // o rastro só cobre o que saiu limpo; a regra de comissão é regra de
  // dinheiro, e sumia sem uma linha dizendo quem a levou.
  "ITEM_ESTOQUE_REMOVIDO",
  "AJUSTE_REMOVIDO",
  "COMISSAO_REGRA_REMOVIDA",
  // E120/S-D4: contrato nascido de orçamento com OUTRA vendedora no corpo. A
  // divergência é aceita (P1 — a venda pode legitimamente ser de outra pessoa)
  // mas é ela que decide de quem é a comissão, então deixa rastro: quem montou
  // o orçamento, em nome de quem o contrato nasceu, e quem clicou (a sessão).
  "CONTRATO_VENDEDORA_DIVERGENTE",
  // E123/B3: desfazer um registro de cobrança. O registro nasce do clique num
  // link que abre outra aba (a fila de /mensagens) — errar é barato, e o
  // desfazer devolve a verdade ao histórico. Depois do DELETE a trilha é o
  // único lugar que lembra o que o registro dizia, então o detalhe carrega
  // canal, observação e o instante do contato desfeito.
  "REGISTRO_COBRANCA_DESFEITO",
  // S3: os dois atos GLOBAIS de superadmin, os únicos que não pertencem a loja
  // nenhuma — e por isso os únicos que gravam `loja_id` nulo. Eram um
  // `req.log.warn`: greppável enquanto o log existir, invisível para quem abre
  // o sistema. O detalhe carrega o NOME do que sumiu, porque depois do DELETE
  // não sobra linha para consultar.
  "USUARIO_EXCLUIDO",
  "LOJA_EXCLUIDA",
] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export function acaoValida(s: string): s is AcaoAuditoria {
  return (ACOES_AUDITORIA as readonly string[]).includes(s);
}

/**
 * Rótulos legíveis das ações, para o CSV da trilha (E47).
 *
 * ESPELHO de `ROTULO_ACAO` em moscow-noivas/src/pages/financeiro/auditoria.tsx
 * — a planilha da contadora e a tela têm de chamar a mesma coisa pelo mesmo
 * nome. Ação nova entra na união acima e o TypeScript cobra o rótulo aqui;
 * do outro lado o mapa é frouxo (cai no código cru) de propósito, porque tela
 * velha lendo trilha nova não pode quebrar.
 */
export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  PARCELA_RECEBIDA: "Parcela recebida",
  RECEBIMENTO_ESTORNADO: "Recebimento estornado",
  CONTA_PAGA: "Conta paga",
  PAGAMENTO_REGISTRADO: "Pagamento registrado",
  PAGAMENTO_ESTORNADO: "Pagamento estornado",
  ESTORNO_COMISSAO_BAIXADO: "Estorno de comissão baixado",
  COMISSAO_FECHAMENTO_REABERTO: "Fechamento de comissão reaberto",
  CONTRATO_CANCELADO: "Contrato cancelado",
  MEMBRO_ADICIONADO: "Membro adicionado",
  MEMBRO_ALTERADO: "Membro alterado",
  MEMBRO_REMOVIDO: "Membro removido",
  CONVITE_CRIADO: "Convite criado",
  CONVITE_CANCELADO: "Convite cancelado",
  PERMISSOES_ALTERADAS: "Permissões do perfil alteradas",
  PERMISSOES_RESTAURADAS: "Permissões do perfil restauradas ao padrão",
  ORCAMENTO_ACEITO: "Orçamento aceito pela noiva",
  PROVA_CONFIRMADA: "Prova confirmada pela noiva",
  REMARCACAO_PEDIDA: "Remarcação pedida pela noiva",
  LEADS_ANONIMIZADOS: "Noivas perdidas anonimizadas (LGPD)",
  LEAD_REMOVIDO: "Noiva removida do cadastro",
  PARCELA_REMOVIDA: "Parcela removida",
  CONTA_PAGAR_REMOVIDA: "Conta a pagar removida",
  CONTABILIDADE_ENVIADA: "Período declarado à contabilidade",
  CONCILIACAO_MARCADA: "Movimentos conferidos com o extrato",
  RESERVA_REMOVIDA: "Reserva removida",
  BLOQUEIO_REMOVIDO: "Bloqueio de vestido removido",
  ATENDIMENTO_REMOVIDO: "Atendimento removido da agenda",
  ORCAMENTO_REMOVIDO: "Orçamento removido",
  AVARIA_REMOVIDA: "Avaria removida",
  CABINE_REMOVIDA: "Cabine removida",
  ITEM_ESTOQUE_REMOVIDO: "Item de estoque removido",
  AJUSTE_REMOVIDO: "Trabalho de costura removido da fila",
  COMISSAO_REGRA_REMOVIDA: "Regra de comissão removida",
  CONTRATO_VENDEDORA_DIVERGENTE: "Contrato com a venda em nome de outra pessoa",
  REGISTRO_COBRANCA_DESFEITO: "Registro de cobrança desfeito",
  USUARIO_EXCLUIDO: "Pessoa excluída do cadastro (ato global)",
  LOJA_EXCLUIDA: "Loja excluída (ato global)",
};

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "21/07/2026 14:32" no fuso da loja. A trilha é INSTANTE, e a hora importa
 * tanto quanto o dia: "quem estornou às 23h50" é metade da pergunta.
 */
export function quandoLocalSP(instante: Date): string {
  return quandoFmt.format(instante).replace(", ", " ");
}

export interface RegistroAuditoria {
  /**
   * S3 — **`null` é o ato GLOBAL**, o que não pertence a loja nenhuma: apagar
   * uma pessoa (tabela global) ou apagar uma loja. No segundo caso o nulo é o
   * que faz o registro existir: com o id da loja, o CASCADE o apagaria junto
   * com ela.
   */
  lojaId: string | null;
  /** Autor da sessão (req.usuario) — id + nome desnormalizado. */
  usuario: { id: string; nome: string };
  acao: AcaoAuditoria;
  entidade:
    | "parcela"
    | "conta_pagar"
    | "pagamento"
    | "contrato"
    | "comissao_fechamento"
    | "usuario"
    | "convite"
    | "perfil"
    | "lead"
    // E115 — os DELETEs que ganharam trilha, e o carimbo de conciliação.
    | "reserva"
    | "bloqueio"
    | "atendimento"
    | "orcamento"
    | "avaria"
    | "conciliacao"
    // S-M1 — a cabine, pelo mesmo motivo das cinco acima.
    | "cabine"
    // S-M16 — os três deletes que a conferência da S-M1 achou crus.
    | "item_estoque"
    | "ajuste"
    | "comissao_regra"
    // E123 — o desfazer do registro de cobrança.
    | "registro_cobranca"
    // S3 — a loja como ENTIDADE, e não como escopo: é o que ela é quando o
    // que aconteceu foi ela ter sido apagada.
    | "loja";
  entidadeId: string;
  detalhe?: Record<string, unknown>;
}

export async function registrarAuditoria(
  executor: DbExecutor,
  registro: RegistroAuditoria,
): Promise<void> {
  await executor.insert(auditLogTable).values({
    id: randomUUID(),
    lojaId: registro.lojaId,
    usuarioId: registro.usuario.id,
    usuarioNome: registro.usuario.nome,
    acao: registro.acao,
    entidade: registro.entidade,
    entidadeId: registro.entidadeId,
    detalhe: registro.detalhe ?? null,
  });
}
