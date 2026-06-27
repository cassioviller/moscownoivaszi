# Estado atual — Moscow Noivas

> 📍 **Mapa por módulo:** para entender o que cada módulo faz (telas, fluxos, lógica, dados, dependências, arestas) antes de mexer, veja **[`docs/estado-por-modulo.md`](./estado-por-modulo.md)** (referência por módulo, 2026-06-27). Este arquivo aqui é o **changelog cronológico** das fatias entregues.
>
> Snapshot de onde paramos. Atualizado em **2026-06-15**. Envelhece — confira os commits e os testes antes de confiar.
>
> **Sessão 2026-06-15 (fim):** backlog de atendimento ESGOTADO (B1/B3/F1-F2/M1-M2/V-c-V-d ✅,
> suíte 501 verde, tudo na `main`, **não** foi feito `git push`). Próxima frente: núcleo
> **Seleção → Reserva** — ver `docs/superpowers/research/2026-06-15-atendimento-selecao-reserva.md`
> e a nota no fim do bloco "Atendimento" abaixo.

## Verdade de hoje — fast-follows JÁ entregues (re-auditoria 2026-06-15)

> As seções abaixo são um **diário cronológico**: cada nota de "Fast-follow" é um instantâneo
> da época, não a verdade de hoje. Re-auditando contra o código (2026-06-15), estes itens
> que aparecem como pendentes/fast-follow **já foram entregues** — não reabrir:
>
> - **Foto do vestido** (✅ commit `080591d`): até 2 fotos WebP no Postgres, upload com Sharp,
>   serving autenticado por rota, exibição na lista/detalhe/destaque do dashboard, com teste
>   (`src/lib/vestidos/__tests__/fotos.test.ts`). Supera a nota de `## Jornada derivada`.
> - **Agenda em formato de calendário** (✅): entregue como "Dia do atelier — Início + Calendário"
>   (ver seção própria). Supera a nota de `## Jornada derivada`.
> - **Leads/Interesses ativados** (✅): `interesses` está em `MODULOS` **e** `MODULOS_VISIVEIS`
>   (`src/lib/permissoes/modulos.ts`), com gate enforçado (page + criar + editar) e páginas reais
>   sob `noivas/[leadId]/interesses`; a nav já mostra "Noivas" sob `podeVerNoivas`. Supera as notas
>   de `## Em uma frase` e `## Onde estamos no loop` ("quando Leads ganhar página, entra em
>   `MODULOS_VISIVEIS`").
> - **Atendimento: status compareceu/faltou** (✅): `AtendimentoSituacao` + `atendidoEm` +
>   `AtendimentoDesfecho` no schema. Supera o fast-follow de `## Agendar atendimento`.
> - **Orçamento como entidade** (✅ essencialmente): `model Orcamento` existe e `jornada.ts` deriva
>   de `temOrcamento`/`temContrato`; os marcos manuais `orcamentoAbertoEm`/`contratoFechadoEm`
>   viraram só **legado/compatibilidade**. Supera o fast-follow de `## Jornada derivada`.
>
> **Suíte E2E integrada ✅ (2026-06-15):** entregue. `playwright.config.ts` + pasta `e2e/` +
> `npm run test:e2e` (Chromium via nix, sem download). Isolamento por **loja efêmera `loja-e2e`**
> que nasce no `globalSetup` (Prisma via subprocess `tsx`, ver `scripts/e2e-db.ts`) e é destruída
> no `globalTeardown` (cascade) — `loja-moscow` nunca é tocada. Cobre gate + jornada read-only +
> **6 fluxos de mutação** (cadastrar noiva/vestido, agendar atendimento, fechar/cancelar contrato,
> lançar conta a pagar, receber parcela), cada um exercido pela UI real (**12 specs**). Spec/plano:
> `docs/superpowers/specs/2026-06-15-e2e-mutacao-design.md` /
> `docs/superpowers/plans/2026-06-15-e2e-mutacao.md`. Fora de escopo (próximas fatias): pipeline de
> CI propriamente (idealmente contra `next build && next start`, sem compile on-demand do dev) e
> specs de fluxos adicionais (reserva/prova/ajuste, cobrança).

## Atendimento — diagnóstico + 1ª leva de melhorias (2026-06-15)

Revisão da área de **Atendimento** com 3 skills em sequência (atelier-design-review →
impeccable critique → improve-codebase-architecture). Diagnóstico completo virou backlog;
a 1ª leva de melhorias já foi implementada e commitada na `main` (tsc limpo, **vitest 482**).

**Entregue (commits `d718e96`, `ca12e19`):**
- **I1** — toggle Tipo (Atendimento/Prova) em grafite neutro; bordô reservado só ao CTA "Agendar"
  (`atendimentos/novo/agendar-form.tsx`).
- **I2** — botão "Agendar" mostra a próxima pré-condição que falta (noiva / vestido da prova /
  cabine+vendedora+data / horário), em vez de só `disabled` mudo (mesmo arquivo).
- **N1** — link recíproco fila `/atendimentos` ↔ calendário aba atendimentos
  (`atendimentos/page.tsx`, `calendario/_abas/AbaAtendimentos.tsx`).
- **B2** — `listarProximosAtendimentos` (`src/lib/atendimentos/atendimentos.ts`) agora exclui
  CONCLUÍDO/FALTOU (só ABERTOS) — antes um concluído com data futura aparecia como "próximo".
  Coberto por teste novo.
- **Vestidos V-a** — link "Ver acervo completo" ao lado das sugestões (Interesses + Orçamento).
  A indicação (`src/lib/indicacao/indicacao.ts`) é **curadoria proposital**: top-6 por afinidade
  (`limite=6` + `.filter(pontos>0)`); texto livre (`algoAMais`/`naoQuerUsar`) não pontua. Não é
  bug — o link dá a saída para o acervo inteiro sem quebrar a curadoria.

**Backlog priorizado (próximas fatias):**
- **B1** [bug, alta] **double-booking** ✅ (2026-06-15, spec/plano `…/2026-06-15-b1-double-booking*`):
  fechado por **duas** `@@unique` no `Atendimento` — `[cabineId, inicio]` e
  `[lojaId, vendedoraId, inicio]` (o eixo de conflito é cabine **OU** vendedora, escopado por loja)
  — mais tradução de `P2002` → `motivo: "indisponivel"` no `create` de `agendarAtendimento`
  (padrão otimista; o pré-check `horasOcupadas` vira só fast-path/UX). Migração
  `20260615120000_atendimento_unique_slot` (hand-authored + `migrate deploy`, pois o `migrate dev`
  do Replit é não-interativo). 4 testes novos (constraint cabine/vendedora, cross-loja permitido,
  **corrida real via `Promise.all` → 1 ok / 1 indisponivel**). **Fora de escopo:** rebooking-após-FALTOU
  (a linha CONCLUIDO/FALTOU segue ocupando o slot, como hoje) e transação serializável (a constraint basta).
- **B3** [refactor] **3 leituras divergentes** ✅ (2026-06-15, spec/plano
  `…/2026-06-15-b3-leitura-atendimentos-unificada*`): núcleo
  `buscarAtendimentos(lojaId, { tipo?, situacoes?, desde?, ate?, ordem? })` em `atendimentos.ts`
  (where dinâmico + include rico lead/cabine/vendedora) + consts exportadas `SITUACOES_ABERTAS`/
  `SITUACOES_FECHADAS`. `listarProximosAtendimentos`, `listarAtendimentos` e
  `atendimentosNoIntervalo` (calendario/dados.ts) viraram **wrappers finos** que preservam
  assinaturas e tipos (`AtendimentoItem`/`AtendimentoFila`/`AtendimentoCalendario`) — zero mudança
  de comportamento, a suíte existente passou sem edição de consumidor. `listarProvasAbertas` ficou
  fora (tipo=PROVA + include pesado). Abre caminho p/ **F1/F2** (os filtros vão usar `FiltroAtendimentos`).
- **F1/F2** [UX] busca + filtros ✅ (2026-06-15, spec/plano `…/2026-06-15-f1-f2-filtros-atendimento*`):
  componente `RefinarAtendimentos` (`src/components/atendimentos/refinar.tsx`) — um `<details>`
  "Refinar" calmo (Concierge, abre sozinho com filtro ativo) + `<form method="get">`, **sem client
  JS**, na fila `/atendimentos` **e** na semana do calendário. Filtra por **noiva** (busca contains
  case-insensitive), **vendedora** (`listarEquipe`) e **situação**. Núcleo `FiltroAtendimentos`
  ganhou `vendedoraId`/`noivaBusca`; `listarAtendimentos` aceita `{vendedoraId,noivaBusca,situacao}`
  (situação singular **estreita** o grupo da vista) e `atendimentosNoIntervalo` ganhou 4º param
  `filtro`. Bordô só com intenção (dot de filtro ativo + foco). Revisado pela skill
  `atelier-design-review` (microcopy "Todas as situações"). 4 testes de data layer; suíte 491 verde.
- **M1/M2** ✅ (2026-06-15, spec/plano `…/2026-06-15-m1-m2-concluir-desfazer*`): **M1** — concluir
  com desfecho **RESERVOU** encaminha a vendedora ao perfil da noiva direto na reserva
  (`?ok=reservou_concluido#reserva`, `<section id="reserva">` + aviso "Agora reserve o vestido
  escolhido"); demais desfechos voltam à fila como antes. Concluir **não** cria reserva — só roteia.
  **M2** — `reabrirAtendimento(lojaId,id)` (EM_ATENDIMENTO/CONCLUIDO/FALTOU → AGENDADO, limpa
  desfecho/atendidoEm; AGENDADO → transicao_invalida) + `reabrirAtendimentoAction`. Confirmação
  `BotaoConfirmar` nas terminais (**Marcou falta**, **Concluir**); "**Voltar para agendado**"
  (EM_ATENDIMENTO) e "**Reabrir**" (CONCLUIDO/FALTOU no histórico, que agora recebe `podeEditar`
  real) — recuperação discreta em grafite, bordô só no Concluir. 5 testes de reabrir; revisado pela
  skill `atelier-design-review`.
- **Vestidos V-c/V-d** ✅ (2026-06-15, spec/plano `…/2026-06-15-vestidos-vc-vd-sugestoes*`):
  em `VestidosSugeridos` — **V-c** card indisponível para a data dela esmaecido (`opacity-60`) +
  tag "Indisponível na data" (substitui a frase do rodapé); **V-d** `conflitaComRecusa` (pura, em
  `indicacao.ts`, **só exibição** — token ≥4 letras, não pontua nem ordena) marca "Pode bater no
  que ela não quer." em rose-dust no card. 5 testes da pura; revisado pela `atelier-design-review`.
  **V-b** ("Outros do acervo") **fora de escopo de propósito** — já coberto pelo link "Ver acervo
  completo" (V-a); reabrir só se pedirem.

**Backlog de atendimento ESGOTADO** (B1/B3/F1/F2/M1/M2/V-c/V-d entregues; V-b deixado
de propósito). Próxima **frente grande** mapeada: o **núcleo Seleção → Reserva** está cru
(hoje reserva 1 vestido por vez, sem carrinho nem acessórios). Pesquisa + proposta de redesign
(sem código) em **`docs/superpowers/research/2026-06-15-atendimento-selecao-reserva.md`**
(⚠️ o harness `deep-research` foi interrompido por crédito → é síntese de conhecimento
consolidado, não relatório citado; pontos `[verificar]` pendentes). **Próximo passo recomendado:**
Fatia 1 = **carrinho multi-item de vestidos** (`Reserva` cabeça + `ReservaItem` filhos, migrando
`BloqueioVestido` p/ papel de item sem quebrar o motor de disponibilidade), no ciclo
brainstorming → writing-plans → executing-plans.

> **Falso positivo registrado (não reabrir):** o uso de `prisma` cru em `atendimentos.ts:78`
> (`usuarioLoja.findUnique` por chave composta `usuarioId_lojaId`) **não** vaza tenant — o `lojaId`
> vem da sessão (`sc.loja.id`), não de input, e escopa só a loja. É a exceção documentada do guard.

> **ADR a respeitar:** `docs/adr/0001-dia-do-atelier-inicio-e-calendario.md` — a duplicação
> Início ↔ Calendário do "Dia do atelier" é **aceita de propósito**. Não unificar essas duas.

> **Ambiente:** o dev server do Replit (instância única + `force-dynamic`) **degrada na corrida
> serial longa de E2E** (compila rotas on-demand; vimos login dar timeout e a suíte ir a ~11min).
> Cada spec passa **isolado**; a flakiness da suíte cheia é do server, não do código. Para um verde
> limpo dos 12: reiniciar o app antes de `npm run test:e2e`, ou rodar contra `next build && next start`.

## DRE por categoria (2026-06-14) ✅ — Fatia 3 de 3 (financeiro completo)

Spec: `docs/superpowers/specs/2026-06-14-dre-por-categoria-design.md`. Plano:
`docs/superpowers/plans/2026-06-14-dre-por-categoria.md` (2 tarefas). Commits `b10d524`/`8495baf`
+ ajuste de escopo de loja. `main` com gates verdes (`tsc` limpo, **473 testes**).

"Resultado do mês" simples, **regime de caixa**: receitas − despesas por categoria = resultado.
- **Motor** `src/lib/financeiro/dre.ts` (leitura pura, **sem tabela/migração**): `rotuloCategoria`
  (pura — categoria livre, com fallback no rótulo do tipo: Salários/Comissões/Fornecedores/Despesas)
  + `dreDoMes(lojaId, competencia)` → receitas (`Parcela` PAGA por `recebidoEm`) − despesas
  (`PagamentoItem` por `pagamento.data`, agrupado por `rotuloCategoria`, maior primeiro) = resultado.
  Competência inválida → DRE zerado.
- **Tela** `/loja/[id]/financeiro/dre`: seletor de competência (mês ‹ ›), Recebimentos, Despesas por
  categoria, Resultado (bordô se negativo), estado vazio. Gate `financeiro:ver`, read-only. Link do Fluxo.
- Receita é **uma linha** (não há categoria de receita no dado). Sem gráfico/export (YAGNI).

**As 3 fatias do financeiro estão fechadas:** Projeção de caixa, Cobrança/inadimplência e DRE por
categoria. Nota operacional comum: reiniciar o dev server `:5000` para o client Prisma pegar as
migrações da sessão (Projeção e Cobrança criaram tabelas; o DRE não).

## Cobrança / inadimplência (2026-06-14) ✅ — Fatia 2 de 3 melhorias do financeiro

Spec: `docs/superpowers/specs/2026-06-14-cobranca-inadimplencia-design.md`. Plano:
`docs/superpowers/plans/2026-06-14-cobranca-inadimplencia.md` (6 tarefas, por subagentes).
Commits `bfd03d5`…`<fix linkWhatsApp>`. `main` com gates verdes (`tsc` limpo, **467 testes**).

Régua de cobrança no tom Concierge: **ver** quem está em atraso, **agir** e **registrar**.
- **Motor** `src/lib/financeiro/cobranca.ts`: `faixaDeAtraso` (pura — 1-30/31-60/60+), `linkWhatsApp`
  (pura — deep-link `wa.me`, sem API; prefixa DDI 55 só p/ número nacional), `agingDaLoja`
  (parcelas PREVISTA vencidas agrupadas por faixa e por noiva, mais antigo primeiro),
  `historicoCobranca`, `registrarCobranca` (por noiva; valida lead da loja + canal).
- **Dados**: `RegistroCobranca` (nova tabela em `TENANT_MODELS`) `{ leadId, data, canal, observacao }`
  + enum `CobrancaCanal` (WHATSAPP/TELEFONE/PRESENCIAL/OUTRO).
- **Tela** `/loja/[id]/financeiro/cobranca`: 3 cards de faixa (60+ em bordô), lista de inadimplentes
  por noiva com **Abrir WhatsApp** (mensagem pronta, gentil), **Registrar cobrança** (`<details>` +
  form) e histórico inline; estado vazio gentil. Gate `financeiro:ver`; registrar exige `financeiro:editar`.
  Links de entrada a partir de Contas a receber e do bloco "Em atraso" da Projeção.
- **Sem mensageria automática** (YAGNI): o WhatsApp é só um link; o histórico nasce do registro manual.

**Nota:** mesma pendência da Projeção — reiniciar o dev server `:5000` p/ pegar o client Prisma
após a migração. **Próxima fatia:** (3) DRE por categoria.

## Projeção de caixa (2026-06-14) ✅ — Fatia 1 de 3 melhorias do financeiro

Spec: `docs/superpowers/specs/2026-06-14-projecao-de-caixa-design.md`. Plano:
`docs/superpowers/plans/2026-06-14-projecao-de-caixa.md` (7 tarefas, executado por subagentes).
Commits `cbde207`…`b6fdedb`. `main` com gates verdes (`tsc` limpo, **457 testes**).

Enquanto o S7 (Fluxo de caixa) mostra o **realizado**, esta fatia mostra o **futuro projetado**:
a partir de um saldo de referência, soma recebíveis e subtrai contas a pagar **por vencimento**
e responde *"em que dia o caixa fica negativo?"*. Leitura quase pura sobre `Parcela`/`ContaPagar`.

- **Âncora** `SaldoReferencia` (nova tabela, em `TENANT_MODELS`): `{ dataReferencia, valor }`. O
  registro mais recente ≤ hoje é a âncora ativa. Convenção: `valor` = saldo no início do dia da
  âncora; o realizado conta `[âncora, hoje]`. `src/lib/financeiro/saldo-referencia.ts`
  (`definirSaldoReferencia`, `ancoraAtiva`, `saldoDeHoje` = âncora + `resumoCaixaIntervalo` do S7).
- **Motor** `src/lib/financeiro/projecao.ts`: `montarCurva` (pura — curva dia a dia, menor saldo,
  primeiro dia negativo) + `projecaoCaixa` (curva de quem vence em `[hoje, hoje+H]`, H∈{30,60,90};
  vencidos em aberto vão num bloco **"Em atraso" fora da curva**, via `resumoReceber/Pagar.emAtraso`).
- **Tela** `/loja/[id]/financeiro/projecao`: saldo de hoje, bloco "Em atraso", veredito
  ("fica negativo em DD/MM" em bordô), curva dia a dia e seletor de horizonte; estado vazio
  convidando a cadastrar o saldo. Gate `financeiro:ver`; registrar saldo exige `financeiro:editar`
  (ação em `projecao/actions.ts`). Link a partir do Fluxo de caixa. Verificação: `scripts/repro/verify_projecao.mjs`.

**Nota operacional:** o dev server `:5000` que subiu antes da migração fica com o client Prisma
defasado (tela dá erro até reiniciar). Código verificado em processo novo + suíte; reiniciar o dev
server resolve. **Próximas fatias:** (2) Régua de cobrança/inadimplência, (3) DRE por categoria.

## Dia do atelier — Início + Calendário (2026-06-11 → fechado 2026-06-14) ✅

Spec: `docs/superpowers/specs/2026-06-11-calendario-mes-painel-central-design.md`. Decisão:
`docs/adr/0001-dia-do-atelier-inicio-e-calendario.md`. Planos:
`docs/superpowers/plans/2026-06-11-dia-do-atelier.md` (8 tarefas, entregue) e
`docs/superpowers/plans/2026-06-14-dia-do-atelier-fechamento.md` (fechamento). Commits `d0fa4a7`…`94208f2`
+ `b8d559d`. `main` com gates verdes (`tsc` limpo, **443 testes**).

Deu ao gestor a visão de "tudo de um dia" (agenda + financeiro), servida em duas telas a partir de **uma
leitura** e **um componente** reusados:
- **Dado** `detalheDoDia(lojaId, ymd, {financeiro})` (`src/lib/calendario/dia.ts`): atendimentos, provas,
  casamentos e — só com permissão — parcelas a receber / contas a pagar que vencem no dia. Janela
  [meia-noite UTC, +1d), escopo de loja via `tenantPrisma`.
- **Componente** `DiaDoAtelier` (`src/components/dashboard/dia-do-atelier.tsx`): as seções de um dia. Server,
  recebe o dado já filtrado por permissão.
- **Início** (`src/app/(app)/loja/[lojaId]/page.tsx`): "Hoje no atelier" + `AvisoVencidas`
  (`src/components/dashboard/aviso-vencidas.tsx`, contas vencidas via `vencidasDaLoja` em
  `src/lib/financeiro/vencidas.ts`, soma em centavos).
- **Calendário aba Mês** (`_abas/AbaMes.tsx`): a grade virou **mini-agenda** — `itensDoMes`
  (`src/lib/calendario/dados.ts`) agrupa casamento (nome, bordô) + provas/atendimentos (hora) por dia;
  clicar num dia abre o Dia do atelier via `?dia=` (repassado pela `calendario/page.tsx`). Fallback de
  contagem por categoria em telas estreitas.

**Gating de financeiro** (dado sensível, atrás de `financeiro:ver`) confirmado e **testado** nos três
pontos: a camada de dados nem busca parcela/conta sem permissão (`dia.test.ts`), o Início não chama
`vencidasDaLoja` nem renderiza `AvisoVencidas`, e a célula do calendário só mostra o marcador `R$` quando
`itensDoMes` recebe `financeiro:true` — este último trancado por teste de regressão com prova de mutação
(`itens-mes.test.ts`, commit `b8d559d`).

Diagnósticos Playwright versionados em `scripts/repro/` (`verify_dia.mjs` cobre esta feature).

## Agendar prova unificado — fusão Prova→Atendimento (2026-06-08) ✅

Spec: `docs/superpowers/specs/2026-06-08-agendar-prova-unificado-design.md`. Commits `da35ec8`
(fusão) + `e5b4d97` (rename `provaId`→`atendimentoId`) + `31ed9d2`/`e06a987` (polish UX do seletor).

"Prova" deixou de ser entidade separada e passou a ser um **tipo de `Atendimento`** (`tipo` + `bloqueioId`;
ajuste aponta para `atendimentoId`). No fluxo de agendar prova, o seletor de reserva mostra o **vestido
reservado** (prefixo "Vestido") para o nome do modelo não ser lido como noiva. Diagnóstico daquela
investigação em `scripts/repro/repro_prova*.mjs`.

## Concierge Atelier — roteiro das telas + DRY da urgência (2026-06-08) ✅

Plano: `docs/superpowers/plans/2026-06-06-dry-urgencia-e-roteiro-concierge.md` (concluído e verificado).

Fechou o roteiro de direção criativa **Concierge Atelier** (`docs/design/`) nas telas operacionais e
unificou a contagem de urgência do casamento. Três fases, todas na `main` com gates verdes (`tsc` limpo,
427 testes) e o módulo Financeiro verificado visualmente no app (desktop + 375px).

- **Fase A — DRY da urgência:** a lógica do "faltam N dias / urgente ≤14d" deixou de ser recopiada em
  reservas/ajustes/calendário e passou a viver em `src/lib/leads/contagem-casamento.ts` (`diasAteCasamento`,
  `casamentoUrgente`, `JANELA_URGENCIA_DIAS`), na convenção de dia de São Paulo (`hojeUTC` de `@/lib/tempo`,
  meia-noite UTC) — some um off-by-one latente entre 21h–24h. Puro e testado.
- **Fase B — verificação visual de Noivas:** `verify_b1.mjs` (Playwright/Chromium) com o fluxo login +
  seleção de loja + checklist da lista e do detalhe.
- **Fase C — Concierge nas telas restantes (C1→C6):** acervo/detalhe do vestido como peça (capa 3:4,
  lookbook), agenda→calendário, ajustes, reservas e **financeiro**. No financeiro, além dos títulos em
  serifa, três refinos presentacionais (sem tocar regra/rota/banco): (1) **bordô como joia** — a ação que
  se repete por linha (Receber/Pagar) virou contorno bordô (`botaoLinha` em `ui.tsx`), deixando o bordô
  sólido para os momentos singulares (Lançar/Gerar/Salvar/Confirmar); (2) **componente `Aviso`** calmo com
  intenção ok (champagne) / erro (bordô), no lugar da linha cinza de log; (3) **faixas de comissão como
  régua legível** ("De __ até __ rende __% + bônus __") no lugar da grade de planilha. Verificação visual:
  `verify_c6.mjs` (7 telas, screenshots em `/tmp/c6`).

Tokens reusados de `globals.css` (`bordo`/`champagne`/`papel-suave`/`borda-suave`/`font-display`) — nenhum
token novo. Nota: o *submit* das ações do financeiro não foi exercitado na verificação (não mexer em dados);
o `Aviso` foi validado pelo caminho de render `?ok=`/`?erro=`.

## Agendar atendimento (2026-06-01)

Spec/plano: `docs/superpowers/specs/2026-06-01-agendar-atendimento-design.md`, `docs/superpowers/plans/2026-06-01-agendar-atendimento.md`.

Nova feature: agendar o atendimento (consulta) de uma noiva. Entidades `Cabine` e `Atendimento`
(em `TENANT_MODELS`) + horário de funcionamento por loja em `RegraDisponibilidade`. Disponibilidade
via grade visual: o client busca `gradeDoDia` (server action) e mostra os slots de 1h livres/ocupados
(ocupado quando a cabine OU a vendedora já têm atendimento na hora); o servidor revalida ao salvar.
Telas: `/loja/[id]/atendimentos/novo` (Agendar) e `/atendimentos/config` (cabines + horário). Sidebar:
item "Agendar"; o antigo "Agenda" virou rótulo "Calendário" (rota `/agenda` mantida). Cadastrar uma
noiva agora leva direto para Agendar com ela pré-selecionada. Gating: `leads` (agendar) / `config` (cabines).

**Fast-follow:** atendimento na Agenda/Calendário e no perfil da noiva; status compareceu/faltou; horário por dia da semana.

## Jornada derivada (2026-06-01)

Spec/plano: `docs/superpowers/specs/2026-06-01-jornada-derivada-design.md`, `docs/superpowers/plans/2026-06-01-jornada-derivada.md`.

A etapa da jornada deixou de ser guardada (`Lead.etapa`, que congelava em "Novo") e passou a ser **derivada dos fatos** por `estagioDaNoiva` (`src/lib/leads/jornada.ts`): cadastrada → prova marcada → interesses → orçamento aberto → contrato fechado → em provas → retirado → casamento → devolução. Sinais automáticos vêm de interesse/provas/retirada/devolução/casamento; **Orçamento (#4), Contrato (#5) e Perdida** são marcos manuais (campos novos no `Lead`: `orcamentoAbertoEm`/`contratoFechadoEm`/`perdidaEm`), com botões no perfil da noiva (gate `leads:editar`). Consumidores migrados: perfil da noiva, lista de noivas, livro de reservas e dashboard (`painel.ts` agrega por estágio derivado em memória). A coluna `Lead.etapa` e o enum `LeadEtapa` ficam **deprecados** (sem migração destrutiva).

**Fast-follow:** Orçamento como entidade com histórico de negociação (valor, status Aberto→Fechado, trilha) substituirá os marcos manuais #4/#5 por derivação real. Outros sub-projetos pendentes: foto no cadastro do vestido; agenda em formato de calendário.

## Provas & Ajustes + bloco contínuo (fatia 2026-06-01)

Spec/decisão: `docs/superpowers/specs/2026-06-01-provas-ajustes-design.md`. **Opção B** —
núcleo da noiva (provas/ajustes na reserva) + tela global de Ajustes da costureira.

**Decisão de regra de negócio (registrada):** (1) indisponibilidade do vestido é um
**bloco contínuo, sem buracos** (preparação → uso → higienização, encostadas); (2) a
**prova real é operacional e NÃO alimenta o motor** — registrar/remarcar/faltar prova não
move a disponibilidade nem libera a peça.

| Peça | Onde | Notas |
|---|---|---|
| Schema | `prisma/schema.prisma` + migration `..._atelier_provas_ajustes` | Enums `ProvaTipo`/`ProvaComparecimento`/`AjusteStatus`. `Prova` (filha de `BloqueioVestido`), `Ajuste` (filha de `Prova`) — ambas com `lojaId`, em `TENANT_MODELS`. `AjusteChecklistItem` (filha pura, via pai). |
| Motor | `src/lib/disponibilidade/{motor,tipos,agenda}.ts` | `calcularJanelas` projeta bloco **contínuo**: fase `preparacao` (renomeada de `prova`) vai de `C−provaDiasAntes` até **encostar no uso** (sem buraco). **Ignora `provaDataReal`** (coluna mantida, deprecada — sem migração destrutiva). `provaDuracao` não afeta mais a disponibilidade. |
| Data layer | `src/lib/atelier/{provas,ajustes}.ts` (+ `__tests__/atelier.test.ts`, 9) | Tudo via `tenantPrisma`. `registrarProva` valida que o bloqueio é RESERVA da loja; `listarAjustesPendentes` é a fila global (junta prova→reserva→noiva/vestido, ordena por casamento). Checklist confirma o Ajuste pai antes de tocar a filha (padrão `fotos.ts`). |
| Permissão | `src/lib/permissoes/modulos.ts` + `prisma/seed.ts` | Novo módulo **`ajustes`** na grade. Admin = TODAS; novo perfil **Costureira** (só `ajustes`); vendedora ganha `ajustes:ver`; usuário dev `costureira@moscow.local`. |
| Navegação | `src/components/layout/nav-items.ts` + `loja/[lojaId]/layout.tsx` | Item "Ajustes" sob flag `podeVerAjustes` (resolvida no servidor). |
| Detalhe da reserva | `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/{page,actions}.tsx` | Noiva/vestido/casamento + fases do bloco + provas (registrar/comparecimento/remover) + ajustes por prova (add/marcar feito/remover) + checklist. Ver = `leads:ver`; mutações = `ajustes:criar/editar`. Linkado do perfil da noiva e do livro de reservas. |
| Ajustes (global) | `src/app/(app)/loja/[lojaId]/ajustes/{page,actions}.tsx` | Fila da costureira: pendentes por urgência (bordô ≤14d), "marcar feito". Gate `ajustes:ver`/`ajustes:editar`. |

**Fast-follow (fora desta fatia):** transformar provas reais em compromissos próprios da
Agenda (hoje a Agenda mostra a fase de preparação como período reservado). Gates: `npm test`
**195/195**, `tsc` limpo, rotas novas compilam e gateiam (307 sem auth). Smoke HTTP autenticado
(click-through) não feito — o fluxo reserva→prova→ajuste→fila→feito está coberto por
`atelier.test.ts` contra Postgres real.

### Conserto (2026-06-01)

Spec/plano: `docs/superpowers/specs/2026-06-01-conserto-provas-ajustes-design.md`, `docs/superpowers/plans/2026-06-01-conserto-provas-ajustes.md`.

- **Acesso da costureira:** o detalhe da reserva (`reservas/[bloqueioId]`) agora abre com `leads:ver` **OU** `ajustes:ver`; links de noiva/vestido viram texto puro sem a permissão; "voltar" vai p/ `/ajustes` quando sem `leads`. A costureira passa a registrar provas, criar ajustes e usar checklist (antes só "marcar feito").
- **Robustez (falha-fechada):** `registrarProva`/`editarProva` validam formato de data (via `parseDiaUTC`) e o enum `comparecimento`, retornando motivo (`data_invalida`/`comparecimento_invalido`) em vez de 500/silêncio; a action de edição mostra o erro.
- **Edição completa da prova:** o form por prova vira "Editar prova" (data/tipo/comparecimento/responsável/observação) — `editarComparecimentoAction` → `editarProvaAction`.
- **Smoke commitado:** `scripts/smoke-atelier.ts` (HTTP autenticado + camada de dados, com cleanup em `finally`). Rodar com o app no ar: `BASE_URL=http://localhost:5000 node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts` → 13/13 (inclui "costureira abre o detalhe").
- **Operacional:** após mudar schema, reiniciar o app (Run) p/ recarregar o client Prisma — senão telas com models novos dão 500.

## Em uma frase

**`main` integrada** (fast-forward, `ee8c440`): agora contém **central de permissões** + **direção criativa Concierge Atelier** (docs) + **tokens CSS** + **shell de navegação** (sidebar/topbar/mobile-nav + layout/dashboard da loja). A dívida de merge foi paga — as branches `feat/central-permissoes` e `feat/design-concierge-atelier` ficaram empilhadas linearmente sobre a `main` e foram trazidas de uma vez. Antes fecharam: Central de permissões, Módulo Vestidos, B.1, B.2-T1/T1b/T2/T3, B.3 F1–2. Próximo: continuar o **dashboard Concierge Command** (Passo 6 do `IMPLEMENTACAO_DESIGN.md`) **ou** abrir o módulo **Leads/Interesses** (entra na grade de permissões quando ganhar superfície).

> Central de permissões — **templates globais + override por loja**: tabela `PerfilOverrideLoja` (PK composta, dentro do `tenantPrisma`); `podeNoModulo` resolve `override(loja) ?? template(perfil)` normalizado (snapshot + `normalizarAcessos` fail-closed; `criar|editar ⇒ ver`); Admin = acesso total travado. Telas `/admin/perfis` (super-admin) e `/loja/[lojaId]/permissoes` (admin da loja), ambas reusando `MatrizPermissoes`. Spec/plano: `docs/superpowers/specs/2026-05-29-central-permissoes-design.md` (v2), `docs/superpowers/plans/2026-05-29-central-permissoes.md`.

> **Design Concierge Atelier (shell):** docs em `docs/design/` + `DESIGN.md`; tokens CSS warm (marfim/champagne/bordô) em `globals.css`; shell de navegação em `src/components/layout/{sidebar,topbar,mobile-nav,nav-items}` montado no `loja/[lojaId]/layout.tsx` — flags de nav resolvidas no servidor (esconder link não é autorização; gates reais seguem nas pages/actions). Falta o **dashboard Concierge Command** (cards do dia → agenda → atenções → jornada → destaque do atelier).

> **Estado do banco de dev:** `admin@moscownoivas.local` está com `isSuperAdmin=true` (UPDATE manual). Há 2 lojas (`loja-moscow`, `loja-teste-2`). A vendedora (`vendedora@lojateste.local`) tem vínculo em **uma só loja** (`loja-moscow`) — auto-seleciona e cai direto na home. **Sessões: 0** (as 3 sessões forjadas de smoke foram removidas em 2026-05-30; recriar via `scripts/forge-sessao-smoke.ts` quando precisar).

## Onde estamos no loop

```
Motor de Disponibilidade: PLAN ✓ → RED-TEAM ✓ → BUILD ✓ → VERIFY ✓ → POLISH ✓ → REVIEW ✓ → correções #1/#2 ✓ [fechada]
B.1 Identidade:           PLAN ✓ → RED-TEAM ✓ → BUILD ✓ (T1-6) → POLISH ✓ (T7) → VERIFY ✓ (T8) [fechada]
B.2 Scoping de loja:      T2 (guard tenantPrisma + zero-vazamento) ✓ → T1 (sessão.lojaAtivaId + /selecionar-loja) ✓ → T3 (rota /loja/[lojaId]/ + dashboard scoped) ✓ [fechada]
Módulo Vestidos + permissões: PLAN (brainstorming + impeccable consultiva) ✓ → BUILD (subagent-driven, 8 tasks) ✓ → VERIFY (119/119 + tsc + smoke) ✓ [fechada]
Central de permissões:        PLAN (brainstorming + grill-me + spec v2) ✓ → BUILD (tdd, 8 tasks) ✓ → VERIFY (133/133 + tsc + smoke) ✓ → CODE-REVIEW (high, 7 finders) + correções ✓ [fechada, mergeada na main]
Design Concierge Atelier:     docs+tokens (drop-in) ✓ → shell de navegação (Fatia 2: sidebar/topbar/mobile-nav) ✓ → INTEGRAÇÃO (ff main) ✓ → dashboard Concierge Command [próximo]
```

Próxima fatia: **dashboard Concierge Command** (Passo 6 do `IMPLEMENTACAO_DESIGN.md`) ou **módulos Leads/Interesses**. Quando Leads ganhar página, entra em `MODULOS_VISIVEIS` da grade de permissões. O módulo `config` segue fora da grade até ter superfície real.

## O que está pronto na Central de permissões

| Peça | Onde | Notas |
|---|---|---|
| Tabela de override | `prisma/schema.prisma` + migration `..._add_perfil_override_loja` | `PerfilOverrideLoja { lojaId, perfilId, acessosModulos, @@id([lojaId,perfilId]) }`, cascade. Entra em `TENANT_MODELS` (`src/lib/tenant.ts`). |
| Helpers puros | `src/lib/permissoes/modulos.ts` (+ `__tests__/acessos.test.ts`, 7) | `normalizarAcessos` (reconcilia shape, fail-closed, `criar\|editar⇒ver`) e `resolverAcessosEfetivos` (snapshot: override ?? template). |
| Enforcement | `src/lib/permissoes/modulos.ts` (P5/P6 em `modulos.test.ts`) | `podeNoModulo`: super-admin→true; perfil Admin→true; senão `override(loja via tenantPrisma, where {perfilId}) ?? template`. |
| Camada de dados | `src/lib/permissoes/perfis.ts` (+ `__tests__/perfis.test.ts`, 4) | `listarPerfis`, `salvarTemplate`, `listarOverridesDaLoja`, `salvarOverride` (findFirst→updateMany/create), `removerOverride` (deleteMany idempotente). `PERFIL_RECEPCAO_ID` add. |
| Componente | `src/components/permissoes/matriz-permissoes.tsx` | Grade `módulos×ações` reutilizável; coerência no cliente; Admin readonly; badge Padrão/Personalizado; Restaurar c/ confirm. |
| Tela templates | `src/app/admin/perfis/{page,actions}.tsx` + link no `/admin` | super-admin; recusa editar Admin. |
| Tela override | `src/app/(app)/loja/[lojaId]/permissoes/{page,actions}.tsx` + link no dashboard | admin da loja (`ehAdminDaLoja`); nested → herda gates do layout; `salvar`/`restaurar`. |

Smoke (`scripts/smoke-permissoes.ts`): override liga `vestidos.criar` da vendedora na `loja-moscow` → `podeNoModulo` true; outra loja não afetada; restaurar → volta a false. HTTP: `/admin/perfis` e `/loja/[id]/permissoes` redirecionam sem auth.

**Correções do `/code-review` (commit `664f353`):** (1) o save preserva módulos fora da grade — `MatrizPermissoes` emite inputs hidden p/ os ocultos (ex.: `config`), senão o snapshot zerava o que o template concedia; (2) a grade remonta (key por assinatura) quando o servidor reenvia valores, senão o checkbox ficava stale após "Restaurar padrão"; (3) DRY: `lerAcessosDoForm` e `MODULOS_VISIVEIS` extraídos p/ `permissoes/modulos` (eram duplicados em 2 actions + 2 pages). Refutados na verificação (não eram bugs): "Admin renderiza vazio" (seed real = `TODAS`) e "rota ignora `[lojaId]`" (o layout já faz espelhamento).

## O que está pronto no Módulo Vestidos + permissões

Spec: `docs/superpowers/specs/2026-05-29-modulo-vestidos-design.md`. Plano: `docs/superpowers/plans/2026-05-29-modulo-vestidos.md`. **Sem mudança de schema** (shape granular coube no `Json`).

| Peça | Onde | Notas |
|---|---|---|
| Helper de permissão | `src/lib/permissoes/modulos.ts` (+ testes, 4: P1–P4) | `podeNoModulo(usuarioId, lojaId, modulo, acao)`. super-admin → true; senão lê `perfil.acessosModulos[modulo][acao]`; ausência → false (falha-fechada). `MODULOS`/`ACOES`/tipos. |
| Seed granular | `prisma/seed.ts` (+ `seed.test.ts` S1) | `acessosModulos` = `{ módulo: { ver, criar, editar } }`. Admin tudo; vendedora vê vestidos (não muta); recepção idem. |
| Data layer | `src/lib/vestidos/vestidos.ts` (+ testes, 6: V1–V6) | `listar/obter/criar/editar` 100% via `tenantPrisma`; valida código/nome/preço (parse pt-BR), traduz `P2002` ("código duplicado"). |
| Rotas + UI | `src/app/(app)/loja/[lojaId]/vestidos/{page,actions,vestido-form,novo,[vestidoId]/editar}` | Lista (gate ver) + CTA/editar condicionais; criar/editar em rotas dedicadas reusando 1 form (`useActionState`); gate duplo page+action; `force-dynamic`. Dashboard linka "Ver vestidos →". |

Vendedora read-only verificada no smoke (vê lista sem CTA; `/vestidos/novo` redireciona). UI seguiu a direção da `impeccable` (lista, não tabela; bordô ≤5%; estado-zero orientado).

## Porta obrigatória de dados de tenant — `tenantPrisma`

A partir de agora, **toda leitura/escrita** em `Vestido`, `Lead`, `Atributo`, `BloqueioVestido` e `RegraDisponibilidade` deve passar por `tenantPrisma(prisma, lojaId)` (ver `src/lib/tenant.ts`). Acesso direto via `prisma.vestido.*` etc. é considerado bug de segurança.

- **O que o guard garante:** filtro por `lojaId` em `findUnique/First/Many/count/aggregate/groupBy/update/delete/upsert`; carimbo de `lojaId` em `create/createMany/upsert.create`; impede `update.data.lojaId` (não dá pra re-tenantar uma linha).
- **Falha fechada:** sem `lojaId` válido, o guard lança. `findUnique` em linha de outra loja retorna `null`; `delete` lança `P2025`.
- **Exceção:** `UsuarioLoja` (tabela de acesso) NÃO entra no guard — é lida via `prisma` direto, filtrada por `usuarioId`. Razão e detalhes no cabeçalho de `src/lib/tenant.ts`.
- **Limitação conhecida:** tabelas-filha sem coluna `lojaId` (`AtributoOpcao`, `VestidoAtributo`, `LeadInteresse`, `LeadInteresseAtributo`) **não** são escopadas pelo guard. Convenção: só acessar via `include` do pai.
- **Canário anti-raw:** `src/lib/__tests__/tenant.test.ts` falha o CI se `$queryRaw*` aparecer em arquivo que cite model de tenant. Raw em tabela de tenant é proibido.

A prova de isolamento vive em `src/lib/__tests__/tenant.test.ts` — 10 testes cobrindo Vestido (create/createMany/upsert/update/cross-loja-read) + helper `proveZeroVazamento` aplicado em Lead. Use o helper pra cobrir novos models conforme forem criados.

## O que está pronto na B.1

| Task | Status | Commit | Notas |
|---|---|---|---|
| 1 — Migration `Sessao` | ✓ | `c39f090` | tabela + índices em `expiraEm` e `usuarioId`; FK cascade pra `Usuario`. Smoke test no `seed.test.ts`. |
| 2 — `senha.ts` | ✓ | `a54efea` | `gerarHash` + `verificarSenha`; 5 testes. |
| 3 — `sessao.ts` | ✓ | `67184fa` | `criarSessao`/`lerSessao`/`destruirSessao` + cleanup lazy; 9 testes de integração. |
| 4 — `cookie.ts` + barrel `index.ts` | ✓ | `eb9f6c6` | wrappers sobre `cookies()` (async no Next 16) + `getSessao()` composto. |
| 5 — Rota `/login` | ✓ | `6f8e470` | page (Server) + login-form (Client `useActionState`) + Server Action; mensagem de erro genérica. |
| 6 — Layout `(app)` + dashboard `/` + logout | ✓ | `b501cc2` + `93d3abd` (catch-up dos checkboxes) | layout faz `getSessao()→redirect`; `/` mostra "Olá, {nome}" + form logout. |
| 7 — Polish da `/login` (impeccable) | ✓ | `cf0e0cd` (PRODUCT.md + DESIGN.md) + `fc63fd2` (polish) | tokens warm-tinted + acento bordô; tipografia humanista; light-only; respeita reduced-motion. |
| 8 — Verify manual end-to-end | ✓ | (snapshot) | 7 critérios verificados via curl + psql + sessão forçada-expirar; check de produto: `vendedora@lojateste.local` (perfil Vendedora ligada à `loja-moscow` via `UsuarioLoja`) logou e viu "Olá, Vendedora" — sem hardcode de admin. Fixture deixada no banco pra B.2-T1. |

## Estado das gates

- `npm test`: **133/133 verdes** (119 anteriores + 8 de `permissoes/acessos` (7 puros + `lerAcessosDoForm`) + 2 casos novos em `permissoes/modulos` (P5/P6) + 4 de `permissoes/perfis`). Rodar via `node node_modules/vitest/vitest.mjs run`. **Após mudar schema, rodar `npx prisma generate`** — o `migrate dev` nem sempre regenera o client no output custom (`src/generated/prisma`), e o runtime falha com `prisma.<model>` undefined mesmo com `tsc` limpo.
- `npx tsc --noEmit`: limpo (`node node_modules/typescript/bin/tsc --noEmit`).
- Smoke test na app rodando (porta 5000): `/login` 200; `/admin`, `/equipe`, `/` redirecionam pra `/login` sem auth; com sessão de super-admin, `/admin` renderiza o console; com loja ativa, `/equipe` renderiza a equipe.
- Dev server compila; fluxo de auth + loja ativa end-to-end verificado manualmente: admin e vendedora (1 loja) auto-selecionam e caem direto em `/`; vendedora com 2 lojas cai em `/selecionar-loja`, escolhe e segue pra `/`. Cleanup da `loja-teste-2` feito.
- **Ambiente:** o Node às vezes não está no PATH do shell (Nix/Replit); quando faltar, está em `/nix/store/*/bin`. Os binários `node_modules/.bin/{tsc,vitest}` dão "permission denied" via symlink — rodar via `node node_modules/typescript/bin/tsc --noEmit` e `node node_modules/vitest/vitest.mjs run`. Tsx: `node node_modules/tsx/dist/cli.mjs <script>`. **Python não está no PATH** (a skill `ui-ux-pro-max` precisa dele — usar o Quick Reference inline em vez do `search.py`).
- **Smoke / dev server:** a **porta 5000 é gerida pelo Replit** e some/reaparece entre turnos (contenção) — não dá pra confiar nela pro smoke próprio. Suba um server em **outra porta** e faça tudo num **único comando** (start em background → poll até 200 → curl → `kill`): `node node_modules/next/dist/bin/next dev -p 5050 &` … ver [[dev-server-porta-replit]]. Em dev o CSS do Tailwind v4 não sai em `/_next/static/css/*.css` (injetado por outro caminho), então confirmar regra de CSS pelo fonte/`.next`, não por curl do CSS.

## Revisão de UI/UX (skill `ui-ux-pro-max`, 2026-05-29)

Passada de auditoria em **todas as páginas** contra o Quick Reference da skill + o perfil (`PRODUCT.md`/`DESIGN.md`, que commita WCAG AA). Veredito: produto muito coerente com o próprio perfil; pouca correção real. Commit `1acc04d`.

- **Corrigido:** `html lang` en→pt-BR; inputs de texto ≥16px (regra global em `globals.css`, fora de `@layer` → vence as utilities do Tailwind; evita zoom-on-focus do Safari iOS no tablet); empty state no `/equipe`.
- **Contraste auditado e MANTIDO:** calculei OKLCH→sRGB→WCAG — texto todo ≥4.5:1 (cinza-fumo 4.59:1 é o mais justo, mas passa). **Não re-investigar; tokens de cor estão certos.**
- **Flags abertos (decisão de design, não bug):** (1) botões de ação ~40px `py-2.5` vs. 44px de toque — desktop é primário; subir a `py-3` muda o ritmo global. (2) borda do input em repouso 1.49:1 (WCAG 1.4.11 pede 3:1 p/ afordância) — é o "flat" intencional. (3) `/admin` tem "Lojas" h1 + "Admins" h2 irmãos; um h1 de página limparia a hierarquia. (4) **DRY:** `Field`/`Submit` duplicados em ~5 forms → extrair p/ `src/components/ui/` no checkpoint de consolidação de UI (após Leads).

## Documentos desta fatia

- **Spec B.2-T1 (esta fatia):** `docs/superpowers/specs/2026-05-28-b2-t1-loja-ativa.md`
- **Spec B.1:** `docs/superpowers/specs/2026-05-28-multitenant-b1-identidade-design.md`
- **Plano B.1 (8/8 tasks):** `docs/superpowers/plans/2026-05-28-multitenant-b1-identidade.md`
- **PRODUCT.md** + **DESIGN.md** (raiz do projeto) — escritos via `impeccable teach` na Task 7. Servem qualquer fatia de UI daqui pra frente.
- Spec/plano da Base: `docs/superpowers/specs/2026-05-27-moscow-noivas-base-design.md`, `docs/superpowers/plans/2026-05-27-base-plano-{a,b}-*.md`
- Mapa de workflow × skills: `docs/workflow-skills.md`

## O que está pronto na B.2-T1

| Peça | Onde | Notas |
|---|---|---|
| Migration `Sessao.lojaAtivaId` | `prisma/migrations/20260528185829_sessao_loja_ativa/` | `ADD COLUMN lojaAtivaId TEXT` + FK `onDelete: SetNull → Loja`. Aditiva (nullable). Schema: campo + relação `lojaAtiva` em `Sessao` e back-relation **virtual** `sessoesAtivas Sessao[]` em `Loja` (sem coluna/SQL em `Loja`). |
| Helpers de loja ativa | `src/lib/auth/sessao.ts` + re-export `index.ts` | `listarLojasDoUsuario` (cross-loja, filtra `ativo`), `selecionarLojaPorPadrao`, `definirLojaAtiva` (valida `UsuarioLoja` antes de gravar — falha fechada), `lerSessaoComLojaId`/`getSessaoComLoja`, `gateSessaoLojaAtivaPorId`/`gateSessaoLojaAtiva` (+ tipo `GateEstado`). Padrão **helper-por-id** pra testar sem mockar `cookies()`. |
| Rota `/selecionar-loja` | `src/app/(public)/selecionar-loja/{page,actions,selecao-form}.tsx` | Adaptativa: 0 lojas → estado vazio + logout; 1 loja → auto-select server-side → `/`; >1 → form de escolha. `selecionarLojaAction` valida e manda `?erro=acesso` se forjado. `page` usa `getSessaoComLoja()` (não o campo cru) pro short-circuit → evita loop quando a loja foi desativada. |
| Gate triplo | `src/app/(app)/layout.tsx` | `gateSessaoLojaAtiva()` → `sem-sessao`/`sem-loja-ativa`/`ok`, mapeado pra redirect. |
| Testes | `src/lib/auth/__tests__/loja-ativa.test.ts` | 14 novos (A1–E3 da spec §5), Prisma real. |

Decisão de produto desta fatia (seletor adaptativo, hipótese 1-loja-99%) e follow-ups vivem na spec `2026-05-28-b2-t1-loja-ativa.md` §7.

## O que está pronto na B.2-T3 (dashboard scoped)

Spec: `docs/superpowers/specs/2026-05-29-b2-t3-dashboard-scoped.md`. Plano: `docs/superpowers/plans/2026-05-29-b2-t3-dashboard-scoped.md`. **Sem mudança de schema.** O guard `tenantPrisma` (B.2-T2) saiu do laboratório e entrou num fluxo real.

| Peça | Onde | Notas |
|---|---|---|
| Regra de espelhamento (pura) | `src/lib/loja/acesso.ts` (+ `__tests__/acesso.test.ts`, 6) | `resolverAcessoLoja(lojaIdUrl, lojaAtivaId)` → `{ok}`/`{redirectTo}` (falha-fechada ao canônico); `mostrarTrocaLoja(qtd)` → só com >1 loja. Testável sem `cookies()` (padrão helper-por-id). |
| Leitura escopada | `src/lib/loja/resumo.ts` (+ `__tests__/resumo.test.ts`, 3) | `carregarResumoLoja(lojaId)` → `{ vestidos }` via `tenantPrisma(prisma, lojaId).vestido.count()`. **Migra o teste D**: prova zero-vazamento entre lojas no fluxo real. |
| Gate de espelhamento | `src/app/(app)/loja/[lojaId]/layout.tsx` | `getSessaoComLoja()` + `await params` + `resolverAcessoLoja` → redirect. `export const dynamic = "force-dynamic"`. |
| Dashboard scoped | `src/app/(app)/loja/[lojaId]/page.tsx` | Bloco de catálogo honesto ("N vestidos cadastrados" / "Nenhum vestido cadastrado ainda", sem CTA); link "Trocar loja" só p/ multi-loja; nav + logout migrados. `force-dynamic`. |
| Hub de redirect | `src/app/(app)/page.tsx` | `/` resolve a loja ativa e redireciona p/ `/loja/{id}` (lógica de loja-padrão centralizada num lugar). |

**Decisões de produto (no spec §3, fechadas via brainstorming + grill-me):** fonte da verdade = sessão (URL espelha); dashboard transitório/mínimo; só vestidos (leads fica p/ o módulo); estado-zero sem link morto; troca-loja condicional; **contagem de tenant nunca cacheada** entre requests (`force-dynamic`). Smoke end-to-end (porta 5000): redirects sem-auth/com-auth e espelhamento falha-fechada verificados.

## O que está pronto na B.3 (gestão de usuários)

Spec: `docs/superpowers/specs/2026-05-28-b3-gestao-usuarios.md`. **Sem mudança de schema** — usa `Usuario.isSuperAdmin` + `UsuarioLoja(perfilId)` + `Perfil.acessosModulos`.

| Peça | Onde | Notas |
|---|---|---|
| Data layer | `src/lib/admin/usuarios.ts` (+ testes em `__tests__/usuarios.test.ts`, 14) | `criarLoja`/`listarLojas`; `criarAdmin`/`listarAdmins`; `criarVendedora`/`listarEquipe`; `ehAdminDaLoja` (super-admin OU perfil Admin). Núcleo `criarUsuarioComPerfil` atômico ($transaction), valida e-mail único + lojas + senha≥8. |
| Console super-admin (Fatia 1) | `src/app/admin/{layout,page,actions,loja-form,admin-form}.tsx` | Grupo de rota FORA do gate de loja; guard `isSuperAdmin`. Lista/cria lojas e admins (admin pode receber N lojas). Login manda super-admin pra `/admin`. |
| Gestão de equipe (Fatia 2) | `src/app/(app)/equipe/{page,actions,vendedora-form}.tsx` + links no dashboard | Dentro do gate de loja; guard `ehAdminDaLoja` (vendedora é redirecionada). Admin cadastra vendedoras na loja ativa. |

Toda Server Action revalida o papel server-side (defesa em profundidade). Falta a **Fatia 3** (enforce de `acessosModulos`) — só faz sentido quando existirem páginas de módulo (leads/vestidos/etc.), que ainda não existem.

## Pendências de housekeeping (fora do escopo da fatia)

- `.claude/settings.local.json` — entradas de permissão acumuladas. Pode virar uma corrida do `fewer-permission-prompts` em algum momento.
- `.claude/worktrees/` — worktrees de subagentes antigos.
- `.replit` — **resolvido** (commit `8ab3738`): removidas portas órfãs 3001/5050 e o wrapper "Project"; `runButton` aponta direto p/ "Start application".
- `scripts/` — `smoke-permissoes.ts` agora **commitado** (na branch). Os demais utilitários seguem untracked (`inspect-multiloja`, `remove-vinculo-loja`, `forge-sessao-smoke`, `cleanup-smoke`, `forge-smoke-vestidos`, `smoke-cria-vestido`, `smoke-limpa-vestido`). Decidir manter ou remover (precisa de OK explícito).
- **UI flags** da revisão `ui-ux-pro-max` (touch target 44px, borda 1.4.11, heading do `/admin`) — ver seção "Revisão de UI/UX". A extração DRY dos forms começou nesta fatia (`MatrizPermissoes`, `lerAcessosDoForm`, `MODULOS_VISIVEIS`); `Field`/`Submit` ainda duplicados nos forms antigos.
- **Skills:** instaladas as suítes completas `obra/superpowers` (14) e `mattpocock/skills` (14) no esquema `.agents/skills` + symlink + `skills-lock.json` (32 skills no total). Install funcional, não via plugin oficial (sem hook de SessionStart).

## Últimos commits relevantes

Branch `feat/central-permissoes` (10 commits à frente da `main`, **falta merge**):

- `664f353` fix(permissoes): review — preserva módulos ocultos no save + reset de estado da grade
- `b454de9` docs+smoke: fecha fatia central de permissões (override por loja verificado)
- `5d12a80` feat(permissoes): tela /loja/[id]/permissoes (override por loja)
- `e00c891` feat(permissoes): tela /admin/perfis (edita templates globais)
- `4ebdef7` feat(permissoes): componente MatrizPermissoes
- `990df10` feat(permissoes): camada de dados perfis (template + override) + PERFIL_RECEPCAO_ID
- `1825e1b` feat(permissoes): podeNoModulo resolve override > template (Admin=total)
- `9a1dd5b` feat(permissoes): normalizarAcessos + resolverAcessosEfetivos (puros, TDD)
- `11f5ecf` feat(permissoes): tabela PerfilOverrideLoja + entrada no tenantPrisma
- `8ab3738` chore: limpa .replit (portas órfãs + wrapper)

Na `main` (antes da branch): `7389c52` plano · `3ad1734` spec v2 · `b697917` spec v1 · `7772095` skills mattpocock · `ba0d2a8` skills superpowers · `f8bdac9` scripts dev/ops.
