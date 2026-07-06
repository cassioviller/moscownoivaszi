# Roteiro de jornada — Financeiro

## Propósito (1-2 linhas)
Central financeira do ateliê: consolida recebíveis (parcelas nascidas dos contratos) e saídas (despesas, fornecedores, salários, comissões). Dinheiro em centavos, competência `"YYYY-MM"`, **ATRASADA sempre derivado**, caixa pela data do movimento (não do vencimento). Núcleos de cálculo puros e testados em `src/lib/financeiro/`.

## Personas e permissões (gates: financeiro:ver/editar)
- **Dona / gestora financeira** (`financeiro:editar`, implica `ver`): faz tudo — gera plano, dá baixa, lança/paga contas, define salários, fecha comissões, registra cobrança, ancora saldo.
- **Vendedora / leitura** (`financeiro:ver` apenas): vê fluxo, DRE, projeção, ranking e aging; **não** vê os formulários de mutação (renderizados sob `if (podeEditar)`).
- O módulo só usa `financeiro:ver` e `financeiro:editar` — **nunca `criar`** (`estado-por-modulo.md:340`).
- Gate de leitura: `podeNoModulo(usuarioId, lojaId, "financeiro", "ver")` ou `exigirAcesso("financeiro")` no topo de cada page/route; sem ele → `redirect` para a loja.
- Gate de escrita: cada Server Action é embrulhada em `acaoAutorizada("financeiro", "editar", …)` (ex.: `receber/actions.ts:18`). A exportação XLSX usa só `ver` (`pagar/folha/exportar/route.ts:14`).

## Rotas/telas envolvidas (rota → arquivo, por submódulo)
| Submódulo | Rota | Arquivo página / actions | Núcleo (lib) |
|---|---|---|---|
| Fluxo de caixa | `/financeiro` | `financeiro/page.tsx`, `ui.tsx` | `fluxo.ts` |
| Contas a receber | `/financeiro/receber` | `receber/page.tsx` · `receber/actions.ts` | `receber.ts`, `obrigacao.ts`, `plano.ts` |
| Contas a pagar | `/financeiro/pagar` | `pagar/page.tsx` · `pagar/actions.ts` | `pagar.ts`, `forma.ts` |
| Folha | `/financeiro/pagar/folha` (+ `…/exportar`) | `pagar/folha/page.tsx` · `pagar/folha/exportar/route.ts` | `pagar.ts`, `contabilidade.ts`, `planilha-contabilidade.ts` |
| Comissões | `/financeiro/comissoes` e `…/comissoes/regras` | `comissoes/page.tsx`, `comissoes/regras/page.tsx` · `comissoes/actions.ts` | `comissao.ts` |
| DRE | `/financeiro/dre` | `dre/page.tsx` | `dre.ts` |
| Projeção | `/financeiro/projecao` | `projecao/page.tsx` · `projecao/actions.ts` | `projecao.ts`, `saldo-referencia.ts` |
| Cobrança | `/financeiro/cobranca` | `cobranca/page.tsx` · `cobranca/actions.ts` | `cobranca.ts`, `vencidas.ts` |
| Comuns | — | — | `datas.ts`, `intervalo.ts`, `intervalo-params.ts` (`lerFiltroFinanceiro`) |

## Jornada(s) principal(is) — UMA por submódulo

### J1 — Conferir o caixa realizado do mês · **Dona** · *saber quanto entrou e saiu no período*
1. **[/financeiro]** Abre a tela → `page.tsx:26` checa `financeiro:ver`; `lerFiltroFinanceiro(sp)` resolve a janela `?ini=&fim=` (default = mês corrente, `intervalo.ts`).
2. **[/financeiro]** Lê os cards → `resumoCaixaIntervalo(lojaId, janela)` (`fluxo.ts:33`) soma `Parcela.valorRecebido` (PAGA, `recebidoEm` na janela) menos `PagamentoItem`; saldo pode ser negativo (pintado em bordô, `page.tsx:42`).
3. **[/financeiro]** Vê a timeline → `movimentosNoIntervalo` (`fluxo.ts:51`) e a tendência de 6 meses → `tendenciaCaixa({meses:6})` (`fluxo.ts:117`); "horizonte em aberto" → `horizonteAberto` (`fluxo.ts:142`).
4. **[/financeiro]** Ajusta o filtro de datas para investigar outro intervalo → recarrega via querystring (leitura pura, sem mutação).
   **ATRITO:** não é extrato bancário — sem saldo inicial nem conciliação (`fluxo.ts:4`); o número só "fecha" com a realidade do banco se a operadora registrou tudo manualmente.

### J2 — Receber uma parcela da noiva · **Dona** · *gerar o plano e dar baixa*
1. **[contrato]** O plano nasce no **detalhe do Contrato**, não aqui → `gerarPlanoDePagamento` (`receber.ts:24`): exige contrato `ATIVO` e `_count.parcelas === 0`; cria entrada nº0 + N parcelas (`createMany` atômico), a **última absorve o resto** (`receber.ts:67-68`).
2. **[/financeiro/receber]** Abre a lista → `page.tsx:44` resolve `[podeVer, podeEditar]`; filtra por `abertas|atrasadas|recebidas|todas` + intervalo; `resumoReceber` + `listarContasAReceber`.
3. **[/financeiro/receber]** Numa parcela PREVISTA preenche valor/forma e envia o form `registrarRecebimentoAction` (`page.tsx:128`) → `registrarRecebimento` (`receber.ts:179`): exige contrato ATIVO + parcela PREVISTA + valor > 0 (barra "baixa fantasma de R$0", `receber.ts:201`); grava `status=PAGA, valorRecebido, recebidoEm, formaRecebimento`.
4. **[/financeiro/receber]** Errou a baixa → `estornarRecebimentoAction` (`page.tsx:137`) → `estornarRecebimento` (`receber.ts:221`): exige PAGA, volta a PREVISTA e zera `valorRecebido/recebidoEm/forma`.
   **ATRITO:** o usuário que abre "/receber" esperando lançar parcelas não encontra o gerador — ele mora no Contrato. A lista de receber só edita/remove parcelas **PREVISTA** (`receber.ts:142,172`).

### J3 — Pagar várias contas de uma vez · **Dona** · *lançar despesas e quitar N contas num pagamento*
1. **[/financeiro/pagar]** Lança uma conta → form `lancarDespesaAction` (`page.tsx:120`) → `lancarConta` (`pagar.ts:31`); tipos DESPESA/FORNECEDOR/SALARIO/COMISSAO.
2. **[/financeiro/pagar]** Seleciona contas PREVISTA, informa data/forma e envia `pagarContasAction` (`page.tsx:165`) → `registrarPagamento` (`pagar.ts:218`): transação tudo-ou-nada cria **1 `Pagamento`** + N `PagamentoItem` e marca as contas `PAGA` (`pagar.ts:246-264`). Valida que todas existem (`length !== Set(ids).size → conta_invalida`) e estão PREVISTA; `P2002` no `contaPagarId @unique` = já quitada → `nao_previsto`.
3. **[/financeiro/pagar]** Pagamento errado → `estornarPagamentoAction` (`page.tsx:180`) → `estornarPagamento` (`pagar.ts:274`): devolve contas a PREVISTA e apaga o Pagamento (cascade nos itens).
4. **[/financeiro/pagar]** Marca enviado à contabilidade → `marcarEnviadoContabilidade` (`pagar.ts:288`): re-marcar **não** sobrescreve o carimbo original (`pagar.ts:296`).
   **ATRITO:** o split por item (`PagamentoItem.valor`) permite pagar valor diferente do `valorPrevisto` da conta, mas a conta inteira vira PAGA — não há pagamento parcial real; sobra/falta fica invisível na carteira.

### J4 — Rodar a folha do mês e mandar pra contabilidade · **Dona** · *salário recorrente → gerar → pagar → XLSX*
1. **[/financeiro/pagar/folha]** Define salário recorrente por colaborador → `definirSalarioAction` (`page.tsx:128`) → `definirSalarioRecorrente` (`pagar.ts:131`); `@@unique [lojaId, colaboradorId]` (um por pessoa).
2. **[/financeiro/pagar/folha]** Gera a folha do mês → `gerarFolhaAction` (`page.tsx:152`) → `gerarFolhaDoMes` (`pagar.ts:181`): cria 1 `ContaPagar` SALARIO por recorrência ativa, vencimento no `diaVencimento`. **Idempotente** — pula quem já tem conta SALARIO na competência (`pagar.ts:190-194`), retorna `geradas: N`.
3. **[/financeiro/pagar/folha]** Filtra por colaborador e paga salário + comissão juntos → `pagarContasAction` (`page.tsx:206`) → `registrarPagamento` com `colaboradorId`: as contas **têm de ser dele**, senão item forjado quitaria conta de outro (`pagar.ts:255-258`).
4. **[/financeiro/pagar/folha → …/exportar]** Baixa o XLSX do período → GET `exportar/route.ts`: `itensPagosNoIntervalo` → `montarPlanilhaContabilidade` (ExcelJS) → **e marca o período como enviado** (`marcarEnviadosNoIntervalo`) no mesmo request.
   **ATRITO:** o GET de exportação tem **efeito colateral de escrita** (marca enviado) — recarregar/pré-buscar o link re-marca silenciosamente; e o gate é só `ver`, então quem só lê consegue disparar essa escrita.

### J5 — Fechar as comissões do mês · **Dona** · *faixas/degraus → ranking ao vivo → fechar competência*
1. **[/financeiro/comissoes/regras]** Define faixas por vendedora/vigência → `definirRegraAction` → `definirRegra` (`comissao.ts:116`): `validarFaixas` (sem sobreposição, só topo aberto, buracos permitidos, `comissao.ts:62`); salvar **substitui** as faixas da vigência (deleteMany + createMany, `comissao.ts:144-151`).
2. **[/financeiro/comissoes]** Vê o ranking ao vivo do período → `previewComissaoIntervalo` (`comissao.ts:284`): soma contratos ATIVO por `fechadoEm` na janela, aplica a regra vigente **já descontando o estorno §6.4 pendente** (`comissao.ts:312`); `calcularComissao` é retroativo — a faixa do acumulado final rege o mês todo (`comissao.ts:35`).
3. **[/financeiro/comissoes]** Confere o card "Comissão no período" e `temEstorno` → marca prévia, não definitivo (banner em `page.tsx:85`).
4. **[/financeiro/comissoes]** Fecha o mês (só ≤ mês anterior, em dois passos sob `<details>`) → `fecharCompetenciaAction` → `fecharCompetencia` (`comissao.ts:471`): recusa `competencia_corrente`; por vendedora grava `ComissaoFechamento` + gera `ContaPagar` COMISSAO (venc. dia 05 do mês seguinte, `comissao.ts:413`). **Idempotente** via `@@unique vendedora×competência` (pula já fechadas, `comissao.ts:480`).
   **ATRITO:** o ranking acumula sobre o **intervalo escolhido** (pode ser uma semana → faixa de % menor), mas o fechamento usa o **mês inteiro** — o número que a dona vê no ranking não é o que será pago. Pior: o page deriva a competência do fechamento do **início** do intervalo (`comissoes/page.tsx:48`, `iniYMD.slice(0,7)`), enquanto o preview ancora regra/estorno no **fim** do intervalo (`comissao.ts:295`) — em janelas que cruzam dois meses os dois divergem.

### J6 — Ver o resultado do mês (DRE) · **Dona** · *receitas − despesas por categoria, regime de caixa*
1. **[/financeiro/dre]** Abre com `?comp=YYYY-MM` → `dre/page.tsx:22` `exigirAcesso("financeiro")`.
2. **[/financeiro/dre]** Lê o resultado → `dreDoMes` (`dre.ts:35`): receitas = `Parcela` PAGA com `recebidoEm` na competência; despesas = `PagamentoItem` cujo `pagamento.data` cai na competência, agrupadas por categoria (`rotuloCategoria`, `dre.ts:18`), ordenadas desc.
3. **[/financeiro/dre]** `resultado = receitas − totalDespesas`; negativo em bordô (`dre/page.tsx:3`).
   **ATRITO:** regime de **caixa**, não competência contábil — uma venda fechada mas não recebida não aparece como receita; comissão lançada mas não paga não aparece como despesa. Pode confundir quem espera "DRE de competência".

### J7 — Projetar o caixa dos próximos 90 dias · **Dona** · *âncora SaldoReferencia + curva 30/60/90d*
1. **[/financeiro/projecao]** Sem âncora → tela pede "Informe o saldo atual do caixa" → `definirSaldoReferenciaAction` → `definirSaldoReferencia` (`saldo-referencia.ts:17`); data ≤ hoje, valor ≥ 0.
2. **[/financeiro/projecao]** Com âncora → "Saldo hoje" = `saldoDeHoje` (`saldo-referencia.ts:48`): âncora ativa (mais recente ≤ hoje) + realizado `[âncora, hoje]`.
3. **[/financeiro/projecao]** `projecaoCaixa` (`projecao.ts:70`) monta a curva dia-a-dia do que vence em `[hoje, hoje+H]` (PREVISTA); `montarCurva` (`projecao.ts:22`) reporta `menorSaldo` e o **1º dia negativo** (`diaNegativo`, em bordô).
4. **[/financeiro/projecao]** Vencidos em aberto **não entram na curva** → vão pro bloco "Em atraso · fora da curva" (`emAtraso`, `projecao.ts:87`), com links pra receber/pagar/cobrança. Troca horizonte por `?h=30|60|90` (default 90, `projecao.ts:60`).
   **ATRITO:** **sem âncora, a curva monta sobre 0** (`projecao.ts:99`) — se a dona pula o passo do saldo, o "dia negativo" é alarmista (ou falsamente tranquilo) porque ignora o dinheiro real em caixa.

### J8 — Cobrar com delicadeza quem atrasou · **Dona** · *aging → WhatsApp → registrar*
1. **[/financeiro/cobranca]** Abre → `cobranca/page.tsx:35` `exigirAcesso`; `agingDaLoja` (`cobranca.ts:51`) classifica parcelas PREVISTA vencidas em `ate30|d31a60|mais60` por noiva (`faixaDeAtraso`, `cobranca.ts:16`).
2. **[/financeiro/cobranca]** Cada noiva mostra total vencido, dias da mais antiga e faixa; faixa `mais60` destacada em bordô.
3. **[/financeiro/cobranca]** Clica "Abrir WhatsApp ↗" → `linkWhatsApp(whatsapp, msgPadrao(nome))` (`cobranca.ts:24`) abre `wa.me` em nova aba (só se há número).
4. **[/financeiro/cobranca]** Registra a cobrança (canal + observação) → `registrarCobrancaAction` → `registrarCobranca` (`cobranca.ts:113`): valida lead + canal, grava `RegistroCobranca` (data = hoje); histórico aparece sob a noiva.
   **ATRITO:** o page faz **N+1** — `historicoCobranca` por noiva num `Promise.all` sobre `aging.noivas` (`cobranca/page.tsx:41-43`); lojas com muitos inadimplentes pagam o custo. Abrir o WhatsApp e registrar a cobrança são **passos separados** — fácil mandar a mensagem e esquecer de registrar.

## Ramificações e estados de borda
- **ATRASADA é sempre derivado**: `ehAtrasada(status, vencimento, hoje) = PREVISTA && vencimento < hoje` (`obrigacao.ts:8`); **nunca persistido** em Parcela nem ContaPagar. Mudar o relógio reclassifica sem migração.
- **Idempotência**: `gerarFolhaDoMes` pula quem já tem SALARIO na competência (`pagar.ts:190`); `fecharCompetencia` pula vendedoras já fechadas via `@@unique` (`comissao.ts:480`). Rodar de novo é seguro (`geradas:0`, `fechadas:0`).
- **Estorno §6.4 — saldo negativo entre competências** (`comissao.ts:432`, `448`, `538`-região do fecharCompetencia): contrato CANCELADO de mês já fechado gera estorno pendente que abate o bruto da competência seguinte. Se `net = bruto − estorno < 0`, a comissão salva é `Math.max(0, net)` (não paga negativo) **e o estorno NÃO é reconciliado** (`comissao.ts` regra "net ≥ 0") — **carrega o saldo devedor pra próxima competência** até ser absorvido.
- **Pagamento idempotente/atômico**: `registrarPagamento` numa transação; `contaPagarId @unique` em `PagamentoItem` impede duas quitações da mesma conta (P2002 → `nao_previsto`, `pagar.ts:268`).
- **Projeção sem âncora = 0**: `saldoHoje=null` e a curva soma sobre 0 (`projecao.ts:99`); vencidos saem da curva pro `emAtraso`.
- **Plano de pagamento**: só com contrato ATIVO e zero parcelas (`receber.ts:35-36`); entrada > total → `entrada_maior`; última parcela absorve o resto (sem drift de centavos).
- **Preview por intervalo ≠ fechamento mensal**: caveat intencional documentado em `comissao.ts:287-298` — janela menor que o mês cai em faixa de % inferior; definitivo é sempre mensal.

## Pontos de fricção observados no código real
1. **Gerar plano não está em "/receber"** — mora no detalhe do Contrato (`receber.ts:24` chamado de lá); quem entra por Financeiro→Contas a receber não acha como criar parcelas.
2. **Ranking de comissão engana**: acumula sobre o intervalo (prévia), o pago é mensal; e a competência do fechamento (`iniYMD`) diverge da do preview (`fim do intervalo`) em janelas que cruzam meses (`comissoes/page.tsx:48` vs `comissao.ts:295`).
3. **Export XLSX = GET com escrita** (`exportar/route.ts:18`): marca "enviado à contabilidade" como efeito colateral de um GET com gate só `ver` — reload/prefetch re-dispara; viola a semântica de GET idempotente.
4. **Cobrança N+1** (`cobranca/page.tsx:41`): histórico carregado por noiva em laço.
5. **Pagamento "parcial" ilusório**: `PagamentoItem.valor` aceita valor < `valorPrevisto`, mas a conta vira PAGA inteira (`pagar.ts:262`); resíduo some da carteira.
6. **DRE regime caixa sem rótulo de aviso forte** (`dre.ts:35`): receitas/despesas só pelo que foi recebido/pago — desencontra de quem espera competência.
7. **Projeção sem âncora silenciosamente monta sobre 0** (`projecao.ts:99`): conclusão de "dia negativo" pode ser falsa se a dona não registrou o saldo.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Atalho "Gerar plano" dentro de /receber** para contratos ATIVO sem parcelas, fechando o gap de descoberta da J2.
- **Coerência ranking↔fechamento de comissão**: travar a lente do ranking ao mês-calendário (ou exibir lado a lado "prévia do período" vs "comissão do mês cheio") e unificar a derivação de competência (início vs fim do intervalo).
- **Tornar a marcação "enviado à contabilidade" uma ação POST explícita**, separando o *download* do *carimbo* (botão "Marcar enviado" pós-export), e/ou elevar o gate para `editar`.
- **Pagamento parcial de verdade**: status PARCIAL com saldo residual que volta à carteira, em vez de quitar a conta inteira.
- **Curva de projeção com aviso quando `saldoHoje=null`** e CTA inline para ancorar o saldo antes de confiar no "dia negativo".
- **Aging de cobrança em uma query** (join/aggregate único) + ação combinada "abrir WhatsApp e registrar" num passo, para não perder o registro.
- **Conciliação leve no fluxo de caixa**: importar/ancorar saldo bancário para aproximar o "realizado" do extrato sem virar ERP.
