# Roteiro de jornada — Atendimentos & Calendário

## Propósito (1-2 linhas)
Organizar o ato de **receber a noiva** (agendar na grade de slots e atender na fila com desfecho) e dar **quatro vistas da mesma agenda** no Calendário (Mês, Vestidos fora, semana de Atendimentos, Provas & ajustes). Atendimentos é a operação do dia; Calendário é a operação no tempo.

## Personas e permissões
Gates resolvidos por `podeNoModulo` / `acaoAutorizada` / `exigirAcesso`:

- **Recepcionista / Vendedora** — `leads:ver` (ver fila e grade), `leads:criar` (agendar e cancelar atendimento — `agendarAtendimentoAction`, `cancelarAtendimentoAction`), `leads:editar` (transições iniciar/concluir/falta/reabrir, ciclo de prova). Pode `ajustes:criar`/`ajustes:editar` para os ajustes na aba Provas & ajustes.
- **Gerente / Config** — `config:ver` (vê o link "Cabines & horário" e o horário em leitura), `config:editar` (criar/ativar cabine e salvar horário — `criarCabineAction`, `alternarCabineAction`, `salvarHorarioAction`).
- **Financeiro** — `financeiro:ver` é um gate *aditivo* no Calendário: sem ele, Mês e Dia do atelier **não consultam** Parcela/ContaPagar (não vaza valor); com ele, aparecem o marcador `R$` e as seções "A receber"/"A pagar".

Portas de entrada por rota:
- `/atendimentos` e `/atendimentos/novo` → gate `leads` (`getSessaoComLoja` + `podeNoModulo(...,"leads","ver")`; novo via `exigirAcesso("leads")`).
- `/atendimentos/config` → `exigirAcesso("config")`.
- `/calendario` → `exigirAcesso("leads")` (mesma porta da antiga Agenda).

## Rotas/telas envolvidas (rota → arquivo)
- `/loja/[lojaId]/atendimentos` (fila Atrasados/Hoje/Próximos + histórico) → `app/src/app/(app)/loja/[lojaId]/atendimentos/page.tsx`
- transições da fila → `.../atendimentos/actions.ts`
- `/loja/[lojaId]/atendimentos/novo` (Agendar; grade de slots) → `.../atendimentos/novo/page.tsx` + client `.../novo/agendar-form.tsx`
- RPC/agendar/cancelar → `.../atendimentos/novo/actions.ts`
- `/loja/[lojaId]/atendimentos/config` (Cabines & horário) → `.../atendimentos/config/page.tsx` + `.../config/actions.ts`
- `/loja/[lojaId]/calendario` (Server Component, 4 abas, `?aba=`) → `.../calendario/page.tsx`
  - Mês → `.../calendario/_abas/AbaMes.tsx`
  - Vestidos fora (Gantt) → `.../calendario/_abas/AbaVestidos.tsx`
  - Atendimentos (semana) → `.../calendario/_abas/AbaAtendimentos.tsx`
  - Provas & ajustes → `.../calendario/_abas/AbaProvasAjustes.tsx`
  - ciclo de prova + ajustes → `.../calendario/actions.ts`
- `/loja/[lojaId]/agenda` → redirect legado para o Calendário
- Núcleo: `app/src/lib/atendimentos/{slots,cabines,atendimentos}.ts`; `app/src/lib/calendario/{mes,semana,periodo,gantt,dia,dados,abas}.ts`
- Componente compartilhado do "Dia do atelier" → `app/src/components/dashboard/dia-do-atelier.tsx`

---

## Jornada(s) principal(is)

### J1 — Agendar um atendimento · Recepcionista · marcar uma noiva numa cabine/vendedora num horário livre
1. [/atendimentos] Clica em **Agendar** (`page.tsx:229`) → navega para `/atendimentos/novo`.
2. [/atendimentos/novo] O sistema carrega noivas ativas, equipe, cabines **ativas** e próximos atendimentos (`novo/page.tsx:28-35`). Se `cabines.length === 0`, bloqueia com texto pedindo cadastrar cabine em Config (`novo/page.tsx:53-56`). **ATRITO:** pré-condição "ter cabine" só aparece como parágrafo; sem cabine, não há formulário nenhum.
3. [/atendimentos/novo] Mantém Tipo = **Atendimento** (toggle em `agendar-form.tsx:88-104`), escolhe a **Noiva** no select.
4. [/atendimentos/novo] Escolhe **Cabine**, **Vendedora** e **Data**. Só com a tríade completa (`prontoParaGrade`, `agendar-form.tsx:44`) o client chama `gradeDoDiaAction` (`novo/actions.ts:17`) → `gradeDoDia` (`lib/atendimentos/atendimentos.ts:45`) → `gradeDeSlots` (`slots.ts:9`) renderiza slots de **1h** (`DURACAO_MIN=60`) entre abertura e fechamento.
5. [/atendimentos/novo] A grade pinta cada hora como livre/ocupada; um slot fica ocupado se a **cabine OU a vendedora** já têm atendimento naquela hora (`atendimentos.ts:29-43` `horasOcupadas` com `OR:[{cabineId},{vendedoraId}]`). Slots ocupados vêm desabilitados e riscados (`agendar-form.tsx:167-176`).
6. [/atendimentos/novo] Clica num horário livre → fica em bordô. O botão **Agendar** só habilita com `leadId && horaValida && !provaSemReserva` (`agendar-form.tsx:194`); enquanto não, `dicaBloqueio` diz a *próxima* pré-condição faltante ("Escolha a noiva…", "Escolha cabine, vendedora e data.", "Escolha um horário livre na grade.") (`agendar-form.tsx:65-73`).
7. [/atendimentos/novo] Clica **Agendar** → `agendarAtendimentoAction` (`novo/actions.ts:47`) revalida tudo em `agendarAtendimento` (`atendimentos.ts:62`): tipo, data+hora inteira, lead da loja, cabine ativa, vendedora membro (`usuarioLoja`), fora-funcionamento (`hora<abertura||hora>=fechamento`), e revalida sobreposição (`ocupadas.includes(hora)` → `indisponivel`). Sucesso → redirect `?ok=1` ("Atendimento agendado."); o atendimento nasce **AGENDADO**.
8. [/atendimentos/novo] **ATRITO:** após agendar, a tela volta para o mesmo formulário (não vai para a fila nem para o perfil da noiva); a confirmação é só um flash + a lista "Próximos atendimentos" embaixo.

### J2 — Agendar uma prova · Vendedora · marcar prova presa a uma reserva de casamento
1. [/atendimentos/novo] Alterna Tipo para **Prova** (`agendar-form.tsx:92`) — ou chega via link `/atendimentos/novo?tipo=PROVA&reserva=[bloqueioId]` (da aba Provas & ajustes / detalhe de reserva), que pré-seleciona tipo e reserva (`novo/page.tsx:26,63-65`).
2. [/atendimentos/novo] Escolhe a **Noiva**; o `useEffect` dispara `reservasDaNoivaAction(leadId)` (`agendar-form.tsx:34-42` → `novo/actions.ts:26` → `listarVestidosReservadosDaNoiva`) e mostra o **picker de reserva/vestido**.
3. [/atendimentos/novo] Se a noiva não tem reserva de casamento, o picker exibe "Esta noiva não tem reserva de casamento. Crie a reserva antes de agendar a prova." (`agendar-form.tsx:120-121`) e o botão fica travado (`provaSemReserva`, `agendar-form.tsx:62`). **ATRITO:** a reserva nasce em *outra* tela (perfil da noiva / vestido / fechamento de orçamento) — daqui não há atalho para criá-la; a vendedora precisa sair, reservar e voltar.
4. [/atendimentos/novo] Escolhe o vestido reservado, depois cabine/vendedora/data/horário (igual J1).
5. [/atendimentos/novo] **Agendar** → `agendarAtendimento` valida a reserva: precisa existir, ser `RESERVA_CASAMENTO` e ter `reserva.leadId === leadId`, senão `reserva_invalida`/`reserva_nao_e_da_noiva` (`atendimentos.ts:95-103`). A prova nasce `Atendimento{tipo:PROVA, bloqueioId}` e **não** move o motor de disponibilidade (decisão 2026-06-01, ver Arestas no estado-por-módulo).

### J3 — Trabalhar a fila do dia (situação) · Recepcionista · ver quem está atrasado/hoje/próximo e filtrar
1. [/atendimentos] Abre a fila → `listarAtendimentos` traz só os **abertos** (AGENDADO/EM_ATENDIMENTO) por data asc (`atendimentos.ts:243`). A fila **particiona por SITUAÇÃO, não por data**: um agendado vencido não some.
2. [/atendimentos] A página re-particiona em memória por data: **Atrasados** (`inicio < hoje`, título em bordô), **Hoje**, **Próximos** (`page.tsx:205-209`). Atrasados e Próximos mostram a data; Hoje só a hora.
3. [/atendimentos] Refina por **noiva (q)**, **vendedora** e **situação** via `RefinarAtendimentos` (`page.tsx:241-248`). As opções de situação são só as válidas *desta vista* — abertas na fila, fechadas no histórico (`page.tsx:186-189`); o filtro de situação só estreita se pertencer ao grupo (`atendimentos.ts:249`).
4. [/atendimentos] Alterna para **Atendimentos anteriores** (histórico, `?quando=historico`) → mesma lista com `finalizados:true` (CONCLUIDO/FALTOU, por data desc) (`page.tsx:315-321`).
5. [/atendimentos] Links cruzados: "Ver na semana" → `/calendario?aba=atendimentos` (`page.tsx:226`); cada noiva linka ao perfil. **ATRITO:** a fila não tem botão para **agendar prova** (só "Agendar", que abre em modo Atendimento); a entrada de prova mora na aba Provas & ajustes do Calendário.

### J4 — Atender: iniciar → concluir / faltar / reabrir · Vendedora · registrar o desfecho do atendimento
1. [/atendimentos] Numa linha **AGENDADO**, vê **Iniciar atendimento** e **Marcou falta** (`page.tsx:97-112`).
2. [/atendimentos] **Iniciar** → `iniciarAtendimentoAction` → `iniciarAtendimento` exige situação AGENDADO, carimba `atendidoEm` e vai a EM_ATENDIMENTO (`atendimentos.ts:277`).
3. [/atendimentos] Em **EM_ATENDIMENTO**, surgem: **Abrir orçamento** (`criarOrcamentoAction`), o seletor **Desfecho** (`required`, "Como terminou?") + **Concluir**, e **Voltar para agendado** (`page.tsx:114-149`).
4. [/atendimentos] **Concluir** → `concluirAtendimentoAction` (`actions.ts:19`): valida desfecho ∈ {RESERVOU, VAI_PENSAR, NAO_SERVIU} (`atendimentos.ts:274`), conclui (carimba `atendidoEm` se nulo — concluir direto de AGENDADO é permitido). **Clímax:** desfecho **RESERVOU** redireciona ao perfil da noiva direto na seção reserva (`actions.ts:25-27`, `#reserva`).
5. [/atendimentos] **Marcou falta** (com `BotaoConfirmar`) → `marcarFalta` exige AGENDADO → FALTOU (`atendimentos.ts:313`).
6. [/atendimentos] Em CONCLUIDO/FALTOU aparece **Reabrir** → `reabrirAtendimento` volta a AGENDADO limpando desfecho/atendidoEm (`atendimentos.ts:326`). **ATRITO:** o desfecho é obrigatório só na UI (select `required`); o erro `desfecho_invalido` aparece como flash genérico depois do submit, não inline no select.
7. [/atendimentos] **ATRITO:** "Marcar falta" só existe a partir de AGENDADO — se a vendedora já iniciou (EM_ATENDIMENTO) e a noiva sumiu, não há botão de falta; precisa "Voltar para agendado" primeiro.

### J5 — Configurar cabines + horário · Gerente · preparar a loja para agendar
1. [/atendimentos/config] Abre via link "Cabines & horário" (visível só com `config:ver`, `novo/page.tsx:43-47`) → `exigirAcesso("config")`.
2. [/atendimentos/config] Com `config:editar`, edita **Abre (h)** / **Fecha (h)** e salva → `salvarHorarioAction` → `salvarHorarioLoja` valida inteiros, `0..24` e `abertura < fechamento`, senão `intervalo_invalido` (`cabines.ts:47-60`). Sem permissão, vê só "9h às 19h" (default).
3. [/atendimentos/config] Adiciona cabine (campo "Nova cabine") → `criarCabine` (trim, recusa vazio) (`cabines.ts:21`). Ativa/Desativa via toggle → `alternarCabineAtiva` (`cabines.ts:28`). **Sem delete** — desativar só risca o nome (`config/page.tsx:68-73`).
4. **ATRITO:** o horário é um único intervalo da loja inteira (slots sempre 1h cheia, em UTC) — não há almoço/pausa, horário por dia da semana, nem duração configurável (o `provaDuracao` da regra **não afeta mais** a grade). Cabine desativada some da grade mas atendimentos já marcados nela continuam.

### J6 — Calendário Mês → Dia do atelier · Qualquer equipe · navegar o mês e abrir um dia
1. [/calendario?aba=mes] Abre a grade de **42 células** (`gradeDoMes`, `AbaMes.tsx:29`). Cada dia mostra casamento (`♥ Nome`, bordô), provas/atend. (`Hh prova/atend.`) e, com `financeiro:ver`, um `R$` discreto (`AbaMes.tsx:18-21,75`). Mobile colapsa em contagem por categoria.
2. [/calendario?aba=mes] Dias **passados com pendência** ganham anel bordô (`info.atencao`): financeiro PREVISTA vencido OU prova/atend. ainda aberto (`dados.ts:103,109`). Hoje vem com pílula bordô.
3. [/calendario?aba=mes] Navega `‹ ›` entre meses (`?ref=YYYY-MM`, `AbaMes.tsx:51-52`).
4. [/calendario?aba=mes&dia=YMD] Clica um dia → carrega `detalheDoDia` (`dia.ts:60`) e renderiza **Dia do atelier** (`dia-do-atelier.tsx`): Atendimentos, Provas (com "Abrir" → reserva), Casamentos, e A receber / A pagar **só com `financeiro:ver`**. **ATRITO:** o Dia do atelier é **read-only** — não dá para iniciar/concluir um atendimento nem agendar dali; é preciso ir à fila `/atendimentos` ou à aba Provas & ajustes.

### J7 — Calendário Vestidos fora (Gantt) · Atelier · ver o acervo em movimento
1. [/calendario?aba=vestidos] Abre o Gantt: uma linha por vestido, barras de **preparação → uso → lavagem → manutenção** (`AbaVestidos.tsx`), dado vindo de `agendaDoAtelier` + `montarGantt` (`gantt.ts`). Janela padrão hoje→+60d.
2. [/calendario?aba=vestidos] Ajusta a janela com **De/Até** (`?ini=&fim=`, form GET) → `resolverPeriodo` (defensivo, teto 366d, nunca vazia — `periodo.ts`). Eixo com 5 marcas de data; "hoje" em bordô; cada barra tem `title` com rótulo+período.
3. [/calendario?aba=vestidos] Vazio → texto explicativo "Quando uma noiva reservar um vestido…". Clica no nome → `/vestidos/[id]`. **ATRITO:** read-only e desacoplado da prova operacional — a prova (Atendimento/PROVA) **não** aparece aqui, só as janelas do motor de disponibilidade.

### J8 — Calendário Atendimentos (semana) · Recepcionista · ver a semana dia×hora
1. [/calendario?aba=atendimentos] Grade semana: colunas dia × linhas de hora (abertura→fechamento), blocos de 60min (`AbaAtendimentos.tsx:55-66`). Cor por situação: AGENDADO bordô, EM_ATENDIMENTO rosé, CONCLUIDO/FALTOU neutro/risco (`AbaAtendimentos.tsx:23-28`).
2. [/calendario?aba=atendimentos] Filtra por **q / vendedora / situação** (`RefinarAtendimentos`, mesmas opções da fila). Navega `‹ semana ›` preservando filtros na URL (`AbaAtendimentos.tsx:72-80`).
3. [/calendario?aba=atendimentos] Cada bloco linka ao **perfil da noiva** (`AbaAtendimentos.tsx:150-156`); link "Ir para a fila de atendimentos". **ATRITO:** a semana é **read-only** e só mostra `tipo:ATENDIMENTO` — provas não aparecem nesta grade (estão na aba Provas & ajustes e no Dia do atelier); clicar num bloco não abre o atendimento, vai para o perfil.

### J9 — Calendário Provas & ajustes (fila acionável) · Vendedora/Costureira · tocar o ciclo da prova e os ajustes
1. [/calendario?aba=provas-ajustes] As **Provas abertas** (AGENDADO/EM_ATENDIMENTO) ficam sempre no topo, **ignorando o filtro de período** (`listarProvasAbertas`, `AbaProvasAjustes.tsx:61,71-72`). Cada cartão mostra dia·hora, prazo relativo ("hoje", "há N dias"), noiva, vestido, cabine·vendedora.
2. [/calendario?aba=provas-ajustes] Em **AGENDADO**: **Iniciar atendimento** (`iniciarProvaAction` → `iniciarAtendimento`) ou **Marcou falta** (`faltaProvaAction` → `marcarFalta`) (`actions.ts:13-20`).
3. [/calendario?aba=provas-ajustes] Em **EM_ATENDIMENTO**: lista os ajustes com toggle ✓/○ (`alternarAjusteProvaAction`, gate `ajustes:editar`), adiciona ajuste novo (`adicionarAjusteProvaAction`, gate `ajustes:criar`) e **Concluir prova** (`concluirProvaAction` → `concluirProva`, sem desfecho, valida `tipo===PROVA`) (`actions.ts:21-32`).
4. [/calendario?aba=provas-ajustes] Abaixo, **Ajustes pendentes** filtráveis por período (`?ini=&fim=`, paginados ≤5, `listarAjustesPendentes`), com prazo do casamento (urgente em bordô) e link "Ver fila" → `/ajustes`. **ATRITO:** dois controles de período convivem na tela mas só um (o de baixo) afeta os ajustes; as provas no topo ignoram-no — pode confundir quem ajusta a janela esperando filtrar tudo.
5. [/calendario?aba=provas-ajustes] **Agendar prova** linka a `/atendimentos/novo?tipo=PROVA` (`AbaProvasAjustes.tsx:77`).

---

## Ramificações e estados de borda
- **Double-booking (cabine OU vendedora):** dupla proteção. Em memória, `horasOcupadas` exclui a hora na grade e `agendarAtendimento` revalida (`indisponivel`); no banco, unique constraints `[cabineId, inicio]` e `[lojaId, vendedoraId, inicio]` — corrida perdida vira `P2002` → `indisponivel` ("Esse horário acabou de ser ocupado. Escolha outro.", `atendimentos.ts:108,116-119`).
- **Fora de funcionamento:** hora `< abertura` ou `>= fechamento` → `fora_funcionamento` ("Horário fora do funcionamento da loja."). A grade já só oferece horas no intervalo, mas a validação no servidor é a real (`atendimentos.ts:91`).
- **Cancelar = delete:** `cancelarAtendimento` faz `deleteMany` — **sem histórico** (`atendimentos.ts:219`). Cancelar só existe na lista "Próximos atendimentos" da tela Agendar, não na fila de trabalho.
- **Prova sem reserva / reserva de outra noiva:** bloqueia (`reserva_invalida` / `reserva_nao_e_da_noiva`).
- **Transições inválidas:** cada transição valida a situação de origem; fora dela → `transicao_invalida` ("Essa mudança não é possível agora."). Concluir aceita AGENDADO ou EM_ATENDIMENTO; reabrir recusa AGENDADO.
- **Permissão financeira ausente:** Mês/Dia simplesmente não consultam Parcela/ContaPagar (`Promise.resolve([])`) — o `R$` e as seções somem, não há erro (`dia.ts:88-97`, `dados.ts:77-82`).
- **Tudo em UTC, tudo na URL:** as abas não têm estado de cliente; `resolverPeriodo`/`resolverAba` são defensivos (janela nunca vazia, aba desconhecida → "mes"). `/agenda` é só redirect ao Calendário.
- **Sem cabine cadastrada:** Agendar não renderiza o formulário; pede ir à Config.
- **Cabine desativada:** sai da grade (lista `ativasApenas`), mas não há delete e agendamentos existentes permanecem.

## Pontos de fricção observados no código real
1. **Agendar não conduz a lugar nenhum.** Sucesso de `agendarAtendimento` redireciona de volta ao próprio formulário (`?ok=1`), sem levar à fila, ao Dia do atelier ou ao perfil — o usuário não "fecha o laço" e pode reagendar por engano.
2. **Reserva é pré-condição de prova, mas não há atalho.** O picker bloqueia "crie a reserva antes", porém criar reserva vive em três telas distantes (perfil da noiva, vestido, fechamento de orçamento). Quem quer agendar prova precisa abandonar o fluxo.
3. **Vistas de leitura sem ação.** Dia do atelier (Mês), semana (Atendimentos) e o próprio Gantt são read-only; clicar num atendimento leva ao perfil da noiva, não ao próprio atendimento — para iniciar/concluir é preciso voltar à fila `/atendimentos`. Há ida-e-volta constante entre Calendário e Atendimentos.
4. **Dois lugares para "atender" com regras sutilmente diferentes.** Atendimento se conclui com **desfecho obrigatório** na fila; prova se conclui **sem desfecho** na aba. "Iniciar atendimento" aparece nos dois, mas o vocabulário e o conjunto de botões diferem (ex.: falta só de AGENDADO).
5. **Período duplo na aba Provas & ajustes.** O filtro De/Até afeta só os ajustes; as provas no topo o ignoram — o controle parece global mas não é.
6. **Cancelar destrói sem rastro** e está escondido (só na lista "Próximos" de /novo), enquanto a fila principal não oferece cancelar — assimetria que confunde.
7. **Erros aparecem tarde.** Conflito de slot, fora-funcionamento e desfecho ausente só viram flash/`state.erro` depois do submit; a grade não distingue "ocupado por cabine" de "ocupado por vendedora" (ambos só riscados).
8. **Horário rígido.** Um único intervalo por loja, slots de 1h cheia em UTC, sem pausas, sem dias da semana, sem duração variável — `provaDuracao` existe na regra mas é ignorado.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Fechar o laço do agendamento:** após agendar, oferecer "Ver na agenda do dia" / "Voltar à fila" / "Ver perfil da noiva" em vez de recarregar o form mudo.
- **Reservar sem sair da prova:** permitir criar a reserva de casamento inline no picker (mesmo `ReservaLivreInline` usado em orçamento) quando a noiva não tem reserva.
- **Tornar as vistas do Calendário acionáveis:** popover no bloco da semana / no Dia do atelier com Iniciar·Concluir·Falta, sem precisar ir à fila — mantendo o Calendário como "operação no tempo" mas com toque rápido.
- **Distinguir o motivo do slot ocupado:** marcar "ocupada — Cabine X" vs "ocupada — Vendedora Y" na grade, e sugerir o próximo slot livre ao bater em conflito.
- **Unificar o vocabulário de "atender":** uma só linguagem de ciclo (agendado → em atendimento → concluído) entre Atendimento e Prova, com o desfecho como passo claro e a falta disponível também de EM_ATENDIMENTO.
- **Cancelar com história:** trocar o delete por um status CANCELADO (mantém auditoria, libera o slot) e expor o cancelar também na fila, com confirmação.
- **Horário mais humano:** intervalos por dia da semana, pausa de almoço e duração configurável por tipo (atendimento × prova), reaproveitando `provaDuracao`.
- **Atenção do mês como fila de pendências:** transformar o anel bordô de "dias passados com pendência" num atalho clicável que abre exatamente os atendimentos/contas em aberto daquele dia.
