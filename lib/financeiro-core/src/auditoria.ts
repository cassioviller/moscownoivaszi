/**
 * S-O52 — **os nomes das ações da trilha, num lugar só, para os DOIS lados.**
 *
 * A união fechada das ações e o rótulo de cada uma eram **duas listas**: a do
 * servidor (`api-server/src/lib/auditoria.ts`, que rotula o CSV da contadora) e
 * a da tela (`moscow-noivas/src/lib/financeiro/auditoria.ts`, que rotula a
 * coluna "Ação"). O comentário do servidor declarava o pacto desde o E47 — *"a
 * planilha da contadora e a tela têm de chamar a mesma coisa pelo mesmo nome"* —
 * e o que o cumpria, desde o E178, era uma VARREDURA de nomes de chave, não o
 * código.
 *
 * **A varredura pregava as chaves e não os VALORES, e as duas listas divergiam
 * em três dos 43 rótulos.** Medido em 2026-08-12:
 *
 * | Ação | CSV da contadora | Tela |
 * |---|---|---|
 * | `CARNE_COMPLETADO` | "Carnê completado (parcelas que faltavam)" | "Carnê completado" |
 * | `USUARIO_EXCLUIDO` | "Pessoa excluída do cadastro (ato global)" | "Usuário excluído do sistema" |
 * | `LOJA_EXCLUIDA` | "Loja excluída (ato global)" | "Loja excluída do sistema" |
 *
 * A saída é a que o E176 já usou para a régua dos dígitos do WhatsApp: **uma
 * cópia, dois consumidores** (regra 26). `financeiro-core` é a casa certa —
 * ele já é consumido pelos dois lados, e a trilha é a tela de dinheiro que a
 * contadora lê.
 *
 * **A frouxidão da tela sobreviveu à mudança, e ela é decisão, não descuido.**
 * O mapa aqui é `Record<AcaoAuditoria, string>` — fechado, e o TypeScript cobra
 * o rótulo de toda ação nova. A tela nunca pode quebrar lendo uma ação que não
 * conhece (o servidor pode estar à frente dela), e é `rotuloDaAcao` que carrega
 * essa tolerância: código desconhecido volta como ele mesmo, em vez de
 * `undefined` na coluna.
 *
 * Puro de propósito: sem IO, sem banco.
 */

/**
 * União fechada das ações da trilha. Quem inventa ação nova passa por aqui, e o
 * relatório já a conhece.
 *
 * Registrar SEMPRE dentro da transação da ação: se o log falhar, a ação não
 * acontece — ação sensível sem rastro é pior que um 500 (E10).
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
  // E162 (A01.2): a porta gerencial do beco — desfazer o aceite devolve o
  // orçamento a RASCUNHO para trocar a peça e pedir NOVO aceite. O aceite
  // desfeito não some: esta linha guarda o que havia (instante, versão, hash).
  "ORCAMENTO_ACEITE_DESFEITO",
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
  // P2/E158: gerar o carnê depois RENUMERA as parcelas que já existiam — a
  // avulsa de R$ 350,00 que era 1 vira 11. Nada explicava o salto, e as trilhas
  // de recebimento gravavam `numero`: quem conferisse o caixa pela auditoria
  // casava o dinheiro com a linha errada. Esta linha guarda o de→para por
  // parcela, e as trilhas de parcela passaram a gravar também o `parcelaId`,
  // que é a única chave que a renumeração não move.
  "PARCELAS_RENUMERADAS",
  // P7/E169: o carnê que tinha perdido uma parcela ganhou as que faltavam.
  // A trilha guarda o buraco medido e as linhas criadas: quem lê o extrato
  // depois vê por que existem duas gerações de carnê no mesmo contrato — e
  // "Parcela 11" ao lado de "Parcela 9/10" só faz sentido com esta linha.
  "CARNE_COMPLETADO",
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
  // S-M24: cancelar a reserva solta os vestidos — nao deixava trilha nenhuma.
  "RESERVA_CANCELADA",
  // S-O4: mover a data da reserva move a data do CONTRATO ATIVO junto — e o
  // que muda ali é o papel que a noiva assinou. Sem trilha, um contrato passa
  // a dizer outra data sem ninguém saber quem o mudou.
  "CONTRATO_DATA_SEGUIU_RESERVA",
  // S-O97: mover a data da reserva move a peça e o contrato, e a PROVA fica
  // onde estava. A reserva sem contrato mudava de dia sem rastro nenhum, e o
  // número das provas que ficaram para trás não se responde depois do fato —
  // é a mesma conta que o `RESERVA_CANCELADA` guarda para a prova órfã.
  "RESERVA_DATA_MOVIDA",
  // S-O11: a reserva aberta na noiva errada passou a ter conserto, e trocar a
  // dona é mexer em de quem é a peça. O `de` não existe em lugar nenhum depois
  // da escrita — se não estiver aqui, está perdido.
  "RESERVA_DONA_TROCADA",
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
 * O rótulo legível de cada ação — o mesmo no CSV e na tela.
 *
 * O mapa é FECHADO: ação nova na união acima não compila sem rótulo aqui, que é
 * a garantia que o servidor sempre teve e que a tela nunca teve. As três
 * divergências que a consolidação encontrou foram resolvidas pelo lado do CSV,
 * porque é ele que se lê sem a tela em volta para dar contexto — e porque o
 * parêntese que distingue o ato GLOBAL do ato de loja (S3) é informação, não
 * enfeite.
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
  ORCAMENTO_ACEITE_DESFEITO: "Aceite do orçamento desfeito (gerencial)",
  PROVA_CONFIRMADA: "Prova confirmada pela noiva",
  REMARCACAO_PEDIDA: "Remarcação pedida pela noiva",
  LEADS_ANONIMIZADOS: "Noivas perdidas anonimizadas (LGPD)",
  LEAD_REMOVIDO: "Noiva removida do cadastro",
  PARCELA_REMOVIDA: "Parcela removida",
  PARCELAS_RENUMERADAS: "Parcelas renumeradas",
  CARNE_COMPLETADO: "Carnê completado (parcelas que faltavam)",
  CONTA_PAGAR_REMOVIDA: "Conta a pagar removida",
  CONTABILIDADE_ENVIADA: "Período declarado à contabilidade",
  CONCILIACAO_MARCADA: "Movimentos conferidos com o extrato",
  RESERVA_REMOVIDA: "Reserva removida",
  RESERVA_CANCELADA: "Reserva cancelada (vestidos liberados)",
  CONTRATO_DATA_SEGUIU_RESERVA: "Data do casamento do contrato seguiu a reserva",
  RESERVA_DATA_MOVIDA: "Data do casamento da reserva alterada",
  RESERVA_DONA_TROCADA: "Reserva passou para outra noiva",
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

/**
 * O rótulo de uma ação vinda do BANCO — **e é aqui que a tolerância mora.**
 *
 * O mapa da tela era `Record<string, string>` de propósito, com fallback no
 * código cru: *"ação nova nasce no servidor, e tela velha lendo trilha nova não
 * pode quebrar"*. Aquela frouxidão era do MAPA e custava a união fechada do
 * outro lado; agora ela é desta FUNÇÃO, que é onde o valor desconhecido de
 * verdade aparece — o `acao` de uma linha do banco é `string`, não
 * `AcaoAuditoria`.
 *
 * Devolver o código cru não é bonito e é o menos pior: a contadora lendo
 * `CONTABILIDADE_ENVIADA` na coluna Ação sabe procurar; lendo vazio, não.
 */
export function rotuloDaAcao(acao: string): string {
  return ROTULO_ACAO[acao as AcaoAuditoria] ?? acao;
}
