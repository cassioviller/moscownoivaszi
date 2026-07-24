# Propostas — 2ª rodada: 5 melhorias por módulo, cada uma por uma lente (2026-07-21)

> Segunda rodada, aberta depois de a E30 fechar as 30 da rodada anterior
> (`2026-07-18-melhorias-por-modulo.md`). Mesma regra: para cada módulo, cinco
> propostas, cada uma como se viesse de um tipo diferente de desenvolvedor ou de
> usuário. Ancoradas no estado REAL do código em `main` DEPOIS dos épicos
> E1–E30 — o terreno mudou, então estas são net-new. O padrão que mais se
> repete aqui: **coluna/campo que o schema já grava mas nenhuma tela lê**, e
> **motor puro que já calcula mas ninguém consome fora de uma aba**.

## Leads (inclui Noivas, Orçamentos, Contratos)

1. **Dev de manutenção** — Aposentar a tela `/leads` legada. Ela ainda está
   registrada em `App.tsx` e o dashboard aponta para lá, mas ficou para trás dos
   épicos: sem busca/paginação (ignora o E7), só origem LOJA/WHATSAPP (sem
   SITE/INSTAGRAM do E19), sem motivo de perda (E4). Redirecionar `/leads` e
   `/leads/:id` para `/noivas` e deixar um módulo único.
2. **Vendedora** — Registrar contato de dentro da ficha da noiva. O selo "parado
   há N dias" (E27) acende, mas o único lugar que cria registro de contato é a
   cobrança financeira, amarrada a parcela atrasada. Reusar
   `registros_cobranca` como timeline no detalhe da noiva com botão "liguei
   hoje" — o mesmo POST que já zera o relógio do funil.
3. **Noiva (cliente final)** — Confrontar o orçamento com o teto que ela mesma
   deu. `leadInteresses.tetoOrcamento` é coletado em Interesses e nunca é
   comparado; a tela de orçamento calcula o líquido sem olhar para ele. Sinalizar
   "acima do teto de R$ X" quando o líquido passa — a conversa difícil antes do
   envio, não depois.
4. **Dev de dados/BI** — Relatório de conversão que finalmente lê o E4/E19. O
   motivo de perda e a origem são gravados e prometem "alimenta o relatório",
   mas relatório não existe. Um recorte simples: perdas por `perdidaMotivo` e
   leads por `origem` (quanto o site trouxe, por que as noivas não fecham) —
   agregado puro sobre dado que já está no banco.
5. **Dev de estoque/produto** — Item de orçamento escolhido do catálogo. A
   coluna `orcamentoItens.vestidoId` existe (e o snapshot do contrato também),
   mas a UI só digita descrição livre — o vestido que a noiva provou no lookbook
   nunca é referenciado. Um seletor de vestido que preenche `vestidoId`+valor e,
   no fecho, aciona o `bloqueioVestidoId` do contrato (a reserva que
   `verificarDisponibilidade` já sustenta e ninguém dispara).

## Agenda (inclui Atendimentos, Provas, Ajustes)

1. **Recepcionista** — Medir espera e duração de verdade. A coluna
   `atendimentos.atendidoEm` existe e nenhuma linha do app a escreve nem lê — ao
   "Iniciar" só muda `situacao`. Carimbar `atendidoEm` na entrada em atendimento
   e mostrar tempo de espera vs. `inicio` e duração real na fila e no histórico.
2. **Costureira (ateliê)** — Concluir a prova fechar o loop com a
   disponibilidade. A regra colapsa a janela de prova quando `bloqueio.provaDataReal`
   existe, mas esse campo só é setado à mão na reserva — a conclusão do
   atendimento de PROVA (que já carrega `bloqueioId`) nunca o propaga. Ao
   concluir, gravar `atendidoEm → provaDataReal`, sem redigitação.
3. **Dona da loja** — Dias em que a loja fecha. A regra de disponibilidade só
   tem horas (abre 9, fecha 19); não há conceito de domingo/feriado, e é daí que
   nascem os "órfãos" da grade. Um `diasFuncionamento` na regra, validado pelo
   mesmo `dentroDoFuncionamento` estendido, elimina agendamento em dia fechado.
4. **Recepcionista (anti-no-show)** — A fila "Confirmar presença" parar de
   repetir. O E8 é 100% manual e não registra que confirmou — quem já recebeu o
   wa.me reaparece amanhã. Um `confirmadoEm` marcado ao abrir a mensagem separa
   "já falei" de "falta falar" e destaca só o que resta.
5. **Dev mobile/UX** — A prova longa ocupar o espaço que ocupa. A grade usa
   slot fixo de 30 min e a PROVA toma 1 célula mesmo com `provaDuracao=2` (campo
   que existe e ninguém desenha). Renderizar a prova ocupando `provaDuracao`
   slots e checar sobreposição de intervalo — não só do instante — no
   `recusaDeMover`.

## Vestidos (inclui Catálogo, Reservas)

1. **Vendedora** — Achar o vestido pelos atributos, não abrindo um a um. A lista
   já traz os `atributos` de cada vestido e a disponibilidade batch por data,
   mas filtra só tamanho/cor/categoria. Selects por atributo (decote, volume) +
   um toggle "só livres nesta data" transformam o catálogo em ferramenta de
   descoberta — zero backend novo.
2. **Dona da loja** — Poder tirar de linha o que o relatório aponta. A
   utilização (E15) destaca "candidatos a sair de linha", mas `vestido.status`
   nunca é editável em tela nenhuma. Um toggle Ativo/Inativo no form fecha o
   loop relatório→ação; a régua de disponibilidade já trata inativo como
   indisponível.
3. **Ateliê/operação** — Marcar vestido em manutenção. O motor de janelas
   (MANUTENCAO), o POST `/bloqueios` e o badge "Em manutenção" existem inteiros;
   só falta o botão que chama `useCreateBloqueio` com `tipo=MANUTENCAO`. Um
   caminho que o backend já sustenta de ponta a ponta.
4. **Noiva (cliente final)** — Lookbook público que mostra o que decide a
   compra. Hoje o payload público esconde `precoBase` e as características — ambos
   já no banco, já JOINáveis. Enriquecer o lookbook com preço e atributos, e
   deixar "adicionar ao lookbook" nascer também do catálogo, não só da ficha da
   noiva.
5. **Dev de performance** — Parar de baixar a loja inteira para ver um vestido.
   O detalhe do vestido e o da reserva puxam TODA a lista de bloqueios e juntam
   com leads no cliente (marcado PROVISÓRIO no código), quando
   `buscarBloqueiosAtivos` já aceita `vestidoId` e já devolve `noivaNome`. Expor
   `?vestidoId=` e usar o envelope `ocupacaoInicio/Fim` já materializado (some a
   divergência entre as duas telas).

## Financeiro

1. **Dona da loja** — O caixa avisar que vai furar antes de furar. `projetarCaixa`
   já calcula `diaNegativo`/`menorSaldo` e ninguém consome fora da aba Projeção —
   o dashboard já importa o motor só para o `previstoNaJanela`. Um alerta "caixa
   fica negativo em DD/MM" no dashboard e no hub de fluxo, pelo mesmo caminho.
2. **Contadora** — A trilha de auditoria virar consultável e exportável. É a
   única visão de dinheiro sem CSV (E5/E22 deram a todas as outras), sem filtro
   por ação/autor/data e sem link para a entidade — apesar de `entidade`+
   `entidadeId` estarem gravados. Filtros + deep-link + `.../auditoria/exportar`
   reusando `montarCsv` e a régua anti-injeção já provada.
3. **Dev arquiteto** — Recorrência que não seja só salário. Aluguel, assinatura
   e fornecedor fixo são relançados à mão todo mês, enquanto
   `salarios_recorrentes` + índice parcial único + `onConflictDoNothing` já são
   um motor de recorrência idempotente. Generalizar para "despesas recorrentes"
   (DESPESA/FORNECEDOR) e deixar o `gerarFolha` gerá-las na competência.
4. **Vendedora (recebimento)** — Aceitar que a noiva pague metade. Parcela e
   conta têm status binário (vira PAGA), então um pagamento parcial ou some do "a
   receber" ou fica 100% aberto. Um status PARCIAL derivado de
   `sum(pagamento_itens.valor) < previsto` (soma que já é invariante mantida),
   com o resto ainda entrando no aging.
5. **Contadora (conciliação)** — Recebimentos por meio. `formaRecebimento` é
   gravada e nenhum relatório a agrega; a loja precisa disso para conciliar taxa
   de cartão contra caixa físico. Um breakdown PIX/cartão/boleto no DRE/fluxo
   reusando `entradasDoIntervalo` + o `ROTULO_FORMA` que já existe.

## Comissões

1. **Vendedora** — "No seu ritmo, o mês fecha em Y%". `proximoDegrau` diz quanto
   falta, mas ninguém projeta se a faixa será batida até dia 30. Combinar
   `vendasDaCompetencia` com dias decorridos vs. `limitesCompetencia` e rodar
   `calcularComissao` sobre a base projetada — run-rate no preview e no
   "minha-comissão", sem schema novo.
2. **Dona da loja** — O custo de comissão como linha do tempo. Todo
   `comissao_fechamentos` já guarda `totalVendas`/`valorTotal`/`percentualAplicado`,
   e nenhuma tela agrega — o dono não vê a tendência nem a taxa efetiva média
   (`SUM(comissao)/SUM(vendas)`). Uma série por competência sobre dado já
   persistido, sem recálculo.
3. **Dev de operação** — Avisar a competência esquecida. O fechamento é um mês
   por vez e nada sinaliza meses passados com venda ainda não fechada — a
   pendência acumula invisível. Uma varredura `vendasDaCompetencia` ×
   `comissao_fechamentos` nas últimas N competências vira um badge de alerta.
4. **Dev de segurança** — Reabrir um fechamento errado sem mexer no banco. O
   fechamento cria `ContaPagar` e é idempotente, mas não há rollback — fechou
   errado, só o SQL salva. Um endpoint transacional que cancela a conta
   vinculada, inverte o fechamento e re-reconcilia os estornos
   (`comissaoEstornadaEm` de volta a NULL), com `registrarAuditoria` (já
   importado).
5. **Vendedora (gamificação)** — A colocação dentro do "minha-comissão". O
   `preview` já ordena por `valorTotal` (o ranking existe), mas fica atrás do
   gate de gestão. Expor só a POSIÇÃO ordinal da própria pessoa ("3º de 8") no
   extrato dela, sem vazar os valores das colegas.

## Admin (Equipe, Permissões, Configurações)

1. **Dev de segurança** — A auditoria cobrir o que o admin faz. `ACOES_AUDITORIA`
   é 100% financeiro; add/editar/remover membro, trocar perfil, mexer em override
   e criar/cancelar convite não geram linha — então o feed do E18 mostra "sem
   ações sensíveis" justamente para quem só administra. Chamar `registrarAuditoria`
   nessas transações, com ações novas. (E, ao inativar/mudar perfil, derrubar as
   sessões vivas do membro — hoje a permissão nova só vale no próximo `/auth/me`.)
2. **Membro novo (usuário)** — Trocar a senha que o colega escolheu por mim. O
   cadastro-com-senha diz "senha inicial", mas nada força a troca — o admin
   conhece a senha do outro para sempre. Uma coluna `precisaTrocarSenha` setada no
   create, checada no login/`me`, forçando um fluxo de redefinição (reusa
   `hashSenha` e o mesmo mínimo do aceite de convite).
3. **Dev SRE** — Tirar o backup de dentro da instância — e podar o que sobra. O
   `backup_log` guarda o caminho do arquivo mas não há rota para baixá-lo, e o
   dump fica preso em `backups/` enquanto o disco cresce sem limite. Um
   `GET /admin/backup/:id/download` (mesmo gate superadmin) + poda de dumps e de
   sessões expiradas no runner agendado (o índice `expiraEm` já existe).
4. **Dona da loja** — Voltar um perfil ao padrão. A tela de permissões só tem
   `PUT` do override — uma vez personalizado, a loja fica presa a ele, sem
   "restaurar padrão" (a própria tela marca o gap). Um `DELETE` do override +
   botão, reusando o `getPermissoes` que já cai no template global quando não há
   override.
5. **Dona da loja (console)** — Editar loja e usuário pela tela, não só criar. O
   backend expõe PATCH/DELETE de lojas e usuários (desativar, revogar superadmin,
   resetar senha), mas o console só lista e cria — não dá para travar uma loja
   nem destravar um usuário. Ligar os mutations `useUpdateLoja`/`useUpdateUsuario`
   às listas que já existem, sem endpoint novo.
