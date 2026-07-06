# Roteiro de jornada — Reservas · Provas · Ajustes

> Investigação de UX ancorada no código real (2026-06-29). Escopo: motor de
> disponibilidade (Reservas), Provas (operacional) e Ajustes (fila da costureira).
> Não inventa: cada passo cita `função`/`arquivo:linha`.

## Propósito (1-2 linhas)
Reservas é a **fonte de verdade da disponibilidade** do acervo: projeta o "bloco contínuo de indisponibilidade" (preparação → uso → higienização) e impede dupla-reserva consultando o motor ANTES de gravar. Provas e Ajustes penduram nessa reserva (`bloqueioId`) e operam o ateliê sem mover a disponibilidade.

## Personas e permissões (gates: leads:ver/editar, ajustes:*)
- **Atelier / atendente (`leads:ver`, `leads:editar`)** — vê o livro de reservas e o detalhe; agenda provas; registra movimentação (retirada/devolução).
- **Costureira (`ajustes:ver`, `ajustes:criar`, `ajustes:editar`)** — vê a fila de ajustes e o detalhe da reserva (mesmo sem `leads:ver`); cria/marca/reabre ajustes e itens de checklist; também pode registrar movimentação.
- **Gates concretos:**
  - `/reservas` (livro) → `exigirAcesso("leads")` (`reservas/page.tsx:48`) — só `leads:ver`.
  - `/reservas/[bloqueioId]` (detalhe) → entra com `leads:ver` **OU** `ajustes:ver`; sem nenhum, redirect (`reservas/[bloqueioId]/page.tsx:107`).
  - Movimentação (retirada/devolução) → gate **OR** `leads:editar` OU `ajustes:editar` (`guardMovimentacao`, `actions.ts:29-40`; espelhado em `page.tsx:109`).
  - Ajustes/checklist → `acaoAutorizada("ajustes", "criar"|"editar")` (`reservas/[bloqueioId]/actions.ts:42-79`).
  - `/provas` → `leads:ver` OU `ajustes:ver` (`provas/page.tsx:63-67`); agendar prova → `leads:editar` (`page.tsx:270`).
  - `/ajustes` (fila) → `ajustes:ver`; "Marcar feito" → `ajustes:editar` (`ajustes/page.tsx:41-49`, `ajustes/actions.ts:11`).
  - Ciclo da prova (iniciar/falta/concluir) → `leads:editar` (`calendario/actions.ts:13-23`).
- Módulos válidos: `MODULOS = ["leads","interesses","vestidos","ajustes","config","financeiro"]` (`permissoes/modulos.ts:6`); ações `ver/criar/editar` com cascata `criar||editar ⇒ ver` (`modulos.ts:50`).

## Rotas/telas envolvidas (rota → arquivo)
| Rota | Arquivo |
|---|---|
| `/loja/[lojaId]/reservas` (livro, próximas/passadas) | `src/app/(app)/loja/[lojaId]/reservas/page.tsx` |
| `/loja/[lojaId]/reservas/[bloqueioId]` (detalhe: bloco, movimentação, provas, ajustes) | `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx` |
| Server actions do detalhe (ajustes + movimentação) | `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts` |
| `/loja/[lojaId]/provas` (agenda de provas, read-only) | `src/app/(app)/loja/[lojaId]/provas/page.tsx` |
| `/loja/[lojaId]/ajustes` (fila da costureira) | `src/app/(app)/loja/[lojaId]/ajustes/page.tsx` |
| Action "Marcar feito" da fila | `src/app/(app)/loja/[lojaId]/ajustes/actions.ts` |
| Ciclo da prova (iniciar/falta/concluir) + ajuste na aba | `src/app/(app)/loja/[lojaId]/calendario/actions.ts`, `_abas/AbaProvasAjustes.tsx` |
| **Motor (puro):** projeção, conflito, sentinela | `src/lib/disponibilidade/motor.ts`, `tipos.ts`, `datas.ts` |
| Máquina de estados da movimentação (pura) | `src/lib/disponibilidade/movimentacao.ts` |
| Ponte Prisma↔motor (reservar, mover, manutenção, detalhe) | `src/lib/disponibilidade/reservas.ts` |
| Agenda derivada dos bloqueios | `src/lib/disponibilidade/agenda.ts` |
| Leitura de provas (reserva e loja) | `src/lib/atelier/provas.ts` |
| Ajustes + checklist + fila global | `src/lib/atelier/ajustes.ts` |

**Observação de IA:** a **criação** da reserva NÃO mora nestas telas — vem do perfil da noiva, do detalhe do vestido ou do fechamento de orçamento (`reservarVestido`, chamado de fora deste escopo). O livro e o detalhe são read-only quanto a criar/cancelar.

---

## Jornada(s) principal(is)

### Jornada A — Reservar um vestido (motor checa ANTES de gravar)
**Persona:** Atelier (`leads:editar`). **Objetivo:** comprometer uma peça com uma noiva sem causar dupla-reserva.

1. [perfil da noiva / detalhe do vestido / fechamento de orçamento] Atendente escolhe vestido + data de casamento → chama `reservarVestido(lojaId, {vestidoId, leadId, casamentoData})` (`reservas.ts:70`).
2. [server] Sistema valida campos: sem data → `sem_data`; vestido fora da loja → `vestido_invalido`; lead fora da loja → `lead_invalido` (`reservas.ts:77-84`).
3. [server] Sistema busca regras da loja (`obterRegras`, cai em `REGRAS_PADRAO` se a loja não personalizou — `reservas.ts:39-51,16-22`) e todos os bloqueios do vestido, e chama `vestidoDisponivel(...)` (`motor.ts:117`) **antes** de qualquer `create`.
4. [motor] Sistema monta um bloqueio candidato e projeta o **bloco contínuo**: `[preparacao, uso, lavagem]` via `calcularJanelas` (`motor.ts:34-94`). A preparação vai de `casamento − provaDiasAntes` e **encosta** no início do uso (`prepInicio → usoInicio`, `motor.ts:65-67`) — sem buraco entre as fases. Compara janela-a-janela com `janelasSobrepoem` (`datas.ts:53`).
5. [server] Se `disponivel === false`: recusa (falha fechada) e devolve `conflitos`, `erros` e `conflitaComDatas` — as datas de casamento que já ocupam a peça, para a UI dizer "já reservada para 12/09" em vez de erro genérico (`reservas.ts:97-115`).
6. [server] Se livre: grava `BloqueioVestido{tipo:RESERVA_CASAMENTO}` com `casamentoData` à meia-noite UTC (`reservas.ts:117-128`). `lojaId` é carimbado pelo `tenantPrisma` (escopo de loja).
7. [/reservas] A reserva passa a aparecer no livro, agrupada por mês do casamento, ordenada da mais próxima à mais distante (`listarReservasDaLoja`, `reservas.ts:302`; render `reservas/page.tsx:91-160`). Bordô só na urgência ≤14d (`casamentoUrgente`, `page.tsx:102`).

**ATRITO:** o motor recusa com `conflitos`/`conflitaComDatas`, mas o livro de reservas **não tem botão de reservar nem de cancelar** — quem dispara o fluxo é outra tela. Quem chega em `/reservas` esperando "nova reserva" não encontra o ponto de entrada.

### Jornada B — Ver conflito / por que a peça está indisponível
**Persona:** Atelier. **Objetivo:** entender o bloqueio de uma peça já reservada.

1. [/reservas] Atendente clica "Provas & ajustes" da linha → vai para `/reservas/[bloqueioId]` (`reservas/page.tsx:147-155`).
2. [/reservas/[bloqueioId]] Sistema carrega `obterReservaDetalhe` (`reservas.ts:385`) e renderiza a seção **"Indisponível"**: "De {início} a {fim}" + chips das fases (Preparação / provas, Uso / casamento, Higienização) com datas (`page.tsx:157-179`, rótulos em `agenda.ts:14-19`).
3. [motor] As fases vêm de `calcularJanelas` (`reservas.ts:398-409`); se o bloqueio for malformado, `fases = []` e a seção some — a página **ainda abre** (`reservas.ts:407-409`).

**ATRITO:** o conflito que o motor calcula em `reservarVestido` (`conflitaComDatas`) só existe no momento da recusa; o detalhe da reserva mostra apenas o bloco da **própria** peça. Não há tela que mostre "este vestido conflita com a reserva X da noiva Y" depois do fato — o porquê do "indisponível" some assim que a recusa passa.

### Jornada C — Cancelar reserva
**Persona:** Atelier (no perfil da noiva / detalhe do vestido). **Objetivo:** liberar a peça.

1. [perfil da noiva / vestido] Atendente aciona cancelar → `removerBloqueio(lojaId, bloqueioId)` (`reservas.ts:132-136`). É um `deleteMany` carimbado por loja: bloqueio de outra loja simplesmente não é apagado (sem throw).
2. [server] **Cancelar = delete físico, sem histórico** — a reserva some. `cancelarReserva` é alias **deprecado** de `removerBloqueio` (`reservas.ts:143`).

**ATRITO:** cancelamento é irreversível e sem trilha — nenhuma confirmação no nível do dado, nenhuma reserva "cancelada" guardada. Some da agenda, das provas e dos ajustes de uma vez.

### Jornada D — Movimentação física: retirada → devolução (com "Desfazer")
**Persona:** Atelier ou costureira (`leads:editar` OU `ajustes:editar`). **Objetivo:** registrar a saída e a volta da peça, fechando a jornada da noiva.

1. [/reservas/[bloqueioId]] Estado inicial: "Vestido ainda no atelier" + form **Registrar retirada** (`page.tsx:238-263`). O input `date` já vem com `defaultValue` = data do casamento (`page.tsx:121,252`).
2. [submit] `registrarRetiradaAction` → `definirMovimentacaoReserva(lojaId, bloqueioId, {retiradaDataReal})` (`actions.ts:83-87`, `reservas.ts:169`).
3. [server] `resolverMovimentacao` (pura, `movimentacao.ts:25`) valida o estado final; depois o wrapper **projeta pelo motor** (`calcularJanelas`) e recusa com `datas_invalidas` se a janela inverteria (falha fechada, `reservas.ts:183-189`).
4. [motor] Com retirada e **sem** devolução, o uso fica **aberto** até `FUTURO_DISTANTE` (9999-12-31) — peça fora por tempo indeterminado, bloqueando consultas futuras (`motor.ts:78-81,10`). A UI mostra "Retirado em … — com a noiva" + "enquanto a devolução não for registrada, o vestido fica indisponível para outras noivas" (`page.tsx:200-207`).
5. [/reservas/[bloqueioId]] Aparecem **Registrar devolução** (data, default = casamento) e **Desfazer retirada** (`page.tsx:208-235`).
6. [submit devolução] `registrarDevolucaoAction` → patch `{devolucaoDataReal}`. `resolverMovimentacao` exige retirada (`sem_retirada`), exige devolução ≥ retirada (`data_invertida`) (`movimentacao.ts:35-37`). Gravada, o motor fecha o uso na devolução e abre a lavagem a partir dela (`motor.ts:69-77`).
7. [/reservas/[bloqueioId]] Estado final: "Devolvido em … · A jornada desta noiva está encerrada" + **Desfazer devolução** (`page.tsx:185-199`).
8. [Desfazer] `desfazerRetiradaAction` / `desfazerDevolucaoAction` mandam o campo como `null` (limpa) (`actions.ts:95-105`). Tentar limpar a retirada com devolução ainda setada → `devolucao_orfa` ("Desfaça a devolução antes de desfazer a retirada", `movimentacao.ts:35`, aviso `page.tsx:74`).

**ATRITO:** o `defaultValue` da devolução é **a data do casamento** (`page.tsx:220`), não a de hoje nem a da retirada — quem registra a volta no dia seguinte ao casamento precisa corrigir o campo toda vez. E a data da retirada também default = casamento, o que confunde quem retira dias antes.

### Jornada E — Mandar peça para manutenção
**Persona:** Atelier (detalhe do vestido). **Objetivo:** tirar a peça do acervo por um período (bainha, mancha…).

1. [detalhe do vestido] Atendente informa início (retirada) e fim opcional → `criarManutencao(lojaId, {vestidoId, inicio, fim?, motivo?})` (`reservas.ts:211`).
2. [server] Valida: sem início → `sem_data`; `fim < inicio` → `datas_invertidas`; vestido fora da loja → `vestido_invalido` (`reservas.ts:215-221`).
3. [server] Grava `BloqueioVestido{tipo:MANUTENCAO}` com `retiradaDataReal=inicio`, `devolucaoDataReal=fim?`, `observacao=motivo` (`reservas.ts:224-234`).
4. [motor] Manutenção projeta **janela única** `[manutencao]`; fim em aberto → `FUTURO_DISTANTE`, simétrico à retirada-sem-devolução (`motor.ts:35-46`). Como o motor já considera manutenção, reservas no período são **automaticamente** recusadas.

**ATRITO:** a manutenção reusa a mesma entidade `BloqueioVestido` da reserva, mas a UI de manutenção vive só no detalhe do vestido — não há ponto único onde o ateliê veja "peças em manutenção" junto das reservas; a Agenda derivada mistura as duas (`agenda.ts`).

### Jornada F — Registrar / iniciar / concluir uma prova
**Persona:** Atelier (`leads:editar`). **Objetivo:** marcar e tocar a prova onde a noiva veste a peça.

1. [/reservas/[bloqueioId]] Atendente clica **"Agendar prova"** (só com `leads:editar` + `leadId`, `page.tsx:270-277`) → deep-link `/atendimentos/novo?noiva=…&tipo=PROVA&reserva=[bloqueioId]`.
2. [/atendimentos/novo] A prova nasce como `Atendimento{tipo:PROVA}` **preso a `bloqueioId`**; sem reserva válida da própria noiva, bloqueia (`reserva_invalida`) (`atendimentos.ts:96-103`). A prova **NÃO move a disponibilidade** — `provaDataReal`/`provaDuracao` são ignorados pelo motor de propósito (decisão 2026-06-01, `motor.ts:60-64`, `tipos.ts:5-7,27-31`).
3. [aba "Provas & ajustes" do Calendário] Ciclo: AGENDADO → EM_ATENDIMENTO (`iniciarProvaAction` → `iniciarAtendimento`, carimba `atendidoEm`, `calendario/actions.ts:13`, `atendimentos.ts:276-284`) → CONCLUIDO (`concluirProvaAction` → `concluirProva`, **sem desfecho**, valida `tipo===PROVA`, `actions.ts:21`, `atendimentos.ts:335-342`). Faltou: `faltaProvaAction` → `marcarFalta` (AGENDADO→FALTOU, `actions.ts:17`, `atendimentos.ts:312-318`).
4. [/provas] A prova aparece na agenda da loja, agrupada por mês, próximas/passadas, paginada, ≤7d em bordô; **read-only** (deep-link "Abrir reserva", `provas/page.tsx:114-174`, leitura `provas.ts:69`).
5. [/reservas/[bloqueioId]] A prova também é listada (leitura) na seção "Provas" com situação, cabine, vendedora (`listarProvasDaReserva`, `provas.ts:29`; render `page.tsx:267-299`).

**ATRITO:** registrar (Agendar), iniciar/concluir (aba do Calendário) e ler (detalhe da reserva, `/provas`) estão em **três telas diferentes**. O detalhe da reserva mostra a situação da prova mas **não deixa iniciar/concluir** ali — a costureira/atendente tem de saltar para a aba do Calendário. Atrito de navegação no que é, conceitualmente, um só objeto.

### Jornada G — Adicionar ajuste numa prova + checklist + marcar feito / reabrir
**Persona:** Costureira / atelier (`ajustes:criar`/`editar`). **Objetivo:** registrar e tocar os ajustes de costura.

1. [/reservas/[bloqueioId]] Dentro de uma prova, campo "Novo ajuste (ex.: bainha 3cm)" → `adicionarAjusteAction` → `adicionarAjuste(lojaId, {atendimentoId, descricao})` (`page.tsx:405-419`, `actions.ts:42`, `ajustes.ts:25`).
2. [server] Valida: descrição vazia → `sem_descricao`; atendimento não é PROVA da loja → `prova_invalida` (`ajustes.ts:30-34`). Ajuste nasce `PENDENTE` e carrega `lojaId` (entra no `tenantPrisma`).
3. [/reservas/[bloqueioId]] Por ajuste: campo "Item do checklist…" → `adicionarItemAction` → `adicionarItemChecklist` (`page.tsx:383-397`, `ajustes.ts:77`). O checklist é **filha pura** (sem `lojaId`): `exigirAjusteDaLoja` confirma o pai antes de tocar (`ajustes.ts:68-74,84`). Item entra no fim da ordem.
4. [/reservas/[bloqueioId]] Marcar/desmarcar item → `alternarItemAction` → `alternarItemChecklist` (confirma loja pelo Ajuste pai, `ajustes.ts:93-104`). Mostrado com ✓/○ e line-through (`page.tsx:349-380`).
5. [/reservas/[bloqueioId]] "Marcar feito" / "Reabrir" o ajuste → `alternarAjusteAction` → `alternarStatusAjuste` (PENDENTE ↔ FEITO, `page.tsx:323-331`, `ajustes.ts:48-57`). Feito → texto riscado.
6. [/reservas/[bloqueioId]] "Remover" o ajuste → `removerAjusteAction` (com `BotaoConfirmar`), cascateia o checklist (`page.tsx:332-344`, `ajustes.ts:60-63`).

### Jornada H — Fila da costureira por urgência
**Persona:** Costureira (`ajustes:ver`). **Objetivo:** trabalhar os ajustes do casamento mais próximo primeiro.

1. [/ajustes] Sistema lista `listarAjustesPendentes` — só PENDENTES, ordenados **no banco** por `casamentoData` asc com `nulls:last` (urgência primeiro, sem-data ao fim), desempate por `id` (paginação estável) (`ajustes.ts:144-184`, render `ajustes/page.tsx:81-155`).
2. [/ajustes] Cada linha traz noiva, vestido, prazo (`prazoCasamento`), data e microindicador "checklist feitos/total" (`page.tsx:90-126`). Bordô só ≤14d (`casamentoUrgente`, `page.tsx:87,112`).
3. [/ajustes] "Marcar feito" → `marcarFeitoAction` → `alternarStatusAjuste` (sai da fila ao virar FEITO) (`ajustes/actions.ts:11`). "Abrir" deep-linka para `/reservas/[bloqueioId]` (`page.tsx:128-135`).

**ATRITO:** "Marcar feito" na fila é, na verdade, um **toggle** (`alternarStatusAjuste`) — se o item já estivesse FEITO viraria PENDENTE; na fila isso é inofensivo (só lista PENDENTES), mas o rótulo "Marcar feito" esconde que é a mesma ação de "Reabrir" do detalhe. Sem desfazer/undo aqui: clicou, sumiu da fila.

---

## Ramificações e estados de borda

- **Bloqueio malformado → bloqueia (fail-safe, decisão #6).** Em `vestidoDisponivel`, um bloqueio existente que não projeta (`calcularJanelas` lança) **não é pulado em silêncio** (isso liberaria a peça) nem derruba a consulta: vira `ErroBloqueio`, e qualquer erro força `disponivel:false` (`motor.ts:139-159`, `tipos.ts:52-58`). A reserva é **recusada** mesmo sem conflito de janela — falha fechada.
- **Mesmo bloqueio na Agenda e no detalhe → some, não trava.** `agendaDoAtelier` e `obterReservaDetalhe` envolvem `calcularJanelas` em try/catch e **pulam/zeram** o bloqueio ruim (`agenda.ts:60-65`, `reservas.ts:407-409`) — leitura nunca quebra, mas o dado ruim fica invisível ali (só aparece barrado na hora de reservar). Comportamento assimétrico de propósito: escrita = fail-safe (bloqueia), leitura = fail-soft (omite).
- **`FUTURO_DISTANTE` (9999-12-31).** Sentinela de "fim em aberto" para uso retirado-e-não-devolvido e manutenção sem fim (`motor.ts:10,81,42-44`). A UI traduz para "em aberto / peça ainda fora" via flag `abertoFim` (`reservas.ts:405`, `agenda.ts:73`, `page.tsx:164,174`).
- **`provaDataReal` ignorado de propósito.** A coluna ainda existe no banco e viaja no shape `Bloqueio`, mas o motor não a lê — a prova real é entidade operacional (`Atendimento`) e **não abre disponibilidade** (`tipos.ts:27-31`, `motor.ts:60-64`). `provaDuracao` idem (segue como dado da loja).
- **Edição de reserva sem auto-colisão.** `excluirBloqueioId` evita que uma reserva colida consigo mesma ao revalidar/mover a data (`motor.ts:104-109,135`). Em `definirMovimentacaoReserva` o candidato é projetado pelo motor antes de gravar (`reservas.ts:182-189`).
- **Datas-só "YYYY-MM-DD" → meia-noite UTC (Grill 4).** `parseDiaUTC` rejeita formato inválido e datas impossíveis (2026-02-30, 2026-13-01) que `Date.UTC` normalizaria (`datas.ts:8-21`); back-to-back permitido (intervalos meio-abertos, `datas.ts:48-55`).
- **Movimentação — estados de recusa:** `data_invalida` (`""` do form ou dia inexistente), `devolucao_orfa`, `sem_retirada`, `data_invertida` (`movimentacao.ts:12,27-37`) + `datas_invalidas` do motor + `reserva_invalida` (não existe / outra loja / é manutenção) (`reservas.ts:145-156,176`).
- **Filtro por período exclui ajustes sem casamento.** `listarAjustesPendentes` com `intervalo` casa por `bloqueio.casamentoData` — ajustes sem data de casamento ficam **de fora** enquanto o filtro está ativo (`ajustes.ts:144-154`).

## Pontos de fricção observados no código real
1. **Ponto de entrada da reserva ausente nas telas de reserva.** `/reservas` e `/reservas/[bloqueioId]` são read-only para criar/cancelar; o usuário precisa saber que o fluxo começa no perfil da noiva / detalhe do vestido / orçamento (`reservas/page.tsx` não tem CTA; nota em `estado-por-modulo.md:186`).
2. **Um objeto, três telas (prova).** Agendar (`/atendimentos/novo`), tocar o ciclo (aba do Calendário) e ler (detalhe da reserva, `/provas`) estão espalhados; o detalhe da reserva mostra a situação mas não deixa iniciar/concluir ali (`page.tsx:267-299` é leitura).
3. **`defaultValue` de retirada e devolução = data do casamento** (`page.tsx:220,252`), raramente a data real do movimento — fricção de correção repetida.
4. **Conflito é efêmero.** `conflitaComDatas` só existe no instante da recusa de `reservarVestido`; não há tela que reexiba "indisponível porque conflita com a reserva X" depois (`reservas.ts:97-114`).
5. **Cancelamento destrutivo e silencioso.** `removerBloqueio` = `deleteMany` sem histórico nem soft-delete; alias `cancelarReserva` deprecado ainda em uso (`reservas.ts:132-143`).
6. **Vocabulário "preparação" duplo.** Janela "preparacao"/"prova" do motor ≠ prova operacional (`Atendimento`); a tela chama a fase de "Preparação / provas" (`agenda.ts:15`) ao lado da seção "Provas" real — risco de o operador achar que a fase é a prova agendada.
7. **"Marcar feito" da fila é toggle sem undo** (`alternarStatusAjuste`, `ajustes/actions.ts:11`) — mesma função de "Reabrir", sem confirmação nem desfazer na fila.
8. **Manutenção sem casa própria.** Reusa `BloqueioVestido` mas só é criada/vista no detalhe do vestido; não há lista consolidada de peças em manutenção junto das reservas.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Painel de conflito persistente** no detalhe da reserva: quando o motor recusa (ou quando uma peça fica indisponível), mostrar *qual* reserva/manutenção bloqueia e a data — transformar `conflitaComDatas`/`ErroBloqueio` em estado visível, não só num flash de recusa.
- **Unificar a prova num só lugar:** trazer iniciar/concluir/falta para dentro do card de prova no detalhe da reserva (mesma reserva, mesma noiva), reduzindo o salto para a aba do Calendário.
- **Datas inteligentes na movimentação:** default da retirada = hoje (ou D-`usoDiasAntes`), default da devolução = D+1 do casamento ou hoje — em vez de sempre a data do casamento.
- **Cancelar com trilha:** soft-delete/estado "cancelada" para reservas, preservando histórico da jornada da noiva e permitindo desfazer.
- **"Peças fora do acervo" consolidado:** uma visão que junte reservas em uso (retiradas) + manutenções abertas (`FUTURO_DISTANTE`) — hoje espalhadas entre detalhe do vestido e Agenda.
- **Realçar bloqueios malformados:** como leitura os omite (fail-soft) e escrita os barra (fail-safe), um operador pode não entender por que uma peça "livre na agenda" recusa reserva — um aviso "este vestido tem dado de reserva inconsistente" fecharia o gap entre `ErroBloqueio` e a tela.
- **Microcopy do toggle de ajuste:** distinguir "Concluir" (PENDENTE→FEITO) de "Reabrir" pelo estado real, e oferecer "Desfazer" no flash da fila.
