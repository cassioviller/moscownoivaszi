# Roteiro de jornada — Noivas / Leads

> Auditoria de leitura do código real em `app/src` (2026-06-29). Âncoras em `arquivo:linha`.
> Módulo: cadastro e acompanhamento das noivas (`Lead`), jornada derivada, interesses e indicação de vestidos.

## Propósito (1-2 linhas)

Cadastrar e acompanhar cada noiva (`Lead`) ao longo de uma jornada **derivada dos fatos reais** (atendimentos, interesses, orçamentos, contratos, provas, reservas, devolução) — exibida como timeline de 11 estágios. É a âncora do funil: amarra atendimentos, interesses, orçamentos, contratos e reservas, tratando a noiva como jornada, não como lead frio.

## Personas e permissões

Gates resolvidos sempre por `podeNoModulo(usuarioId, lojaId, modulo, acao)` (porta única, falha-fechada). As flags de nav são só UX; a autorização real vive em cada page/action.

| Gate | O que libera | Onde (arquivo:linha) |
|---|---|---|
| `leads:ver` | abrir lista e perfil da noiva | `noivas/page.tsx:36` (`exigirAcesso("leads")`), `[leadId]/page.tsx:103` |
| `leads:criar` | botão "Adicionar noiva", cadastrar, "Agendar atendimento" | `nova/page.tsx:13`, `actions.ts:35`, `[leadId]/page.tsx:121,216` |
| `leads:editar` | editar dados, marcar perdida/reativar, "Iniciar atendimento", gerar contrato em branco | `actions.ts:53`, `jornada-actions.ts:14`, `[leadId]/page.tsx:120` |
| `interesses:ver` | ver a página de interesses | `interesses/page.tsx:24` |
| `interesses:criar` / `interesses:editar` | salvar/editar desejos (upsert) | `interesses/actions.ts:36-40` |
| `vestidos:editar` | reservar/cancelar reserva pela noiva | `reserva-actions.ts:23,38,60` |

Personas típicas (perfis seedados — ver módulo Permissões): **Recepção/Vendedora** cadastra e acompanha (leads:*); **Vendedora** mexe em interesses e reserva (interesses:*, vestidos:editar); **Admin** vê tudo na loja. Cada perfil real depende do template global + override por loja.

## Rotas/telas envolvidas (rota → arquivo)

| Rota | Arquivo |
|---|---|
| `/loja/[lojaId]/noivas` (lista em cards) | `noivas/page.tsx` |
| `/loja/[lojaId]/noivas/nova` (cadastro) | `noivas/nova/page.tsx` + `noivas/noiva-form.tsx` + `noivas/actions.ts` |
| `/loja/[lojaId]/noivas/[leadId]` (perfil concierge) | `noivas/[leadId]/page.tsx` |
| `/loja/[lojaId]/noivas/[leadId]/editar` | `noivas/[leadId]/editar/page.tsx` |
| `/loja/[lojaId]/noivas/[leadId]/interesses` | `noivas/[leadId]/interesses/page.tsx` + `interesse-form.tsx` + `interesses/actions.ts` |
| (ações sem rota) marcos da jornada | `noivas/[leadId]/jornada-actions.ts` |
| (ações sem rota) reservar/cancelar pela noiva | `noivas/[leadId]/reserva-actions.ts` |

Lógica de domínio: `src/lib/leads/{leads,jornada,contagem-casamento,interesses}.ts`, `src/lib/indicacao/indicacao.ts`. Todas as páginas são `force-dynamic`.

## Jornada(s) principal(is)

### J1 — Cadastrar noiva e emendar no agendamento · Recepção (leads:criar) · trazer a noiva para dentro do atelier e já marcar a 1ª visita

1. [`/noivas`] Usuário clica "Adicionar noiva" → link só aparece com `leads:criar` (`page.tsx:86-93`); botão principal em bordô (CTA com intenção).
2. [`/noivas/nova`] Página revalida o gate no servidor (`nova/page.tsx:13`, redireciona à lista se negado) e renderiza `NoivaForm` (`noiva-form.tsx`). Campos: nome da noiva (obrigatório, `autoFocus`), origem (Loja/WhatsApp), e opcionais (noivo, WhatsApp, cerimonialista, data/horário/local do casamento).
3. [submit] `criarNoivaAction` (`actions.ts:28`) reconfere `leads:criar`, chama `criarLead` (`leads.ts:92`) → valida nome (`leads.ts:66`), parseia origem (`leads.ts:38`) e data com `parseDiaUTC` estrito (`leads.ts:50`, rejeita "2027-02-30"). Persiste via `tenantPrisma` (carimba `lojaId`). **`etapa` é omitido de propósito** → cai no default `NOVO` do schema (`leads.ts:80`).
4. [redireciona] **`criarNoivaAction` redireciona para `/atendimentos/novo?noiva={lead.id}`** (`actions.ts:44`) — o cadastro "emenda" direto no agendamento da 1ª visita, em vez de voltar à lista. **ATRITO:** quem só queria cadastrar (sem agendar agora) é jogado na grade de horários e precisa navegar de volta manualmente; não há caminho "salvar e ficar na lista".
5. **ATRITO:** o form não dá feedback de duplicata — nada impede cadastrar a mesma noiva duas vezes (não há unique por nome/WhatsApp); a lista vai mostrar duas jornadas paralelas.

### J2 — Ver o perfil concierge e entender onde a noiva está · Vendedora (leads:ver) · ler a jornada e decidir a próxima ação

1. [`/noivas`] Usuário acha a noiva (filtro/busca, ver J5) e clica "Detalhes" (`page.tsx:227`); o link carrega a "lente" atual via `?de=` (`page.tsx:228`) para o voltar devolver à mesma vista.
2. [`/noivas/[leadId]`] Página gateia `leads:ver` (`page.tsx:103`), confirma que a noiva é da loja com `obterNoivaComInteresse` (`page.tsx:113`; null → redireciona, falha-fechada) e dispara um `Promise.all` (`page.tsx:119-130`) carregando: gates, reservas, vestidos pré-escolhidos, contratos e **`fatosDaNoiva`** (`leads.ts:163`).
3. [render] `estagioDaNoiva(fatos)` (`jornada.ts:79`) deriva a timeline; `PainelJornadaNoiva` desenha os 11 passos (`page.tsx:197`). Cabeçalho mostra o rótulo do estágio atual ou o selo de encerramento (`page.tsx:178`).
4. [blocos] "Atendimentos" (agendar/iniciar), "Interesses", "Contratos", "O casamento" (contagem regressiva, bordô se ≤14d — `page.tsx:149-151`), "Contato" (WhatsApp → `https://wa.me/{digits}`, `page.tsx:297`), "Vestidos pré-escolhidos" (histórico dos orçamentos) e "Vestido reservado".
5. **Como a jornada é derivada (chave do módulo):** `fatosDeLead` (`leads.ts:138`) monta o vetor de fatos a partir das relações do `Lead` (`INCLUDE_JORNADA`, `leads.ts:119`); `satisfeitos` (`jornada.ts:58`) gera um booleano por estágio e o **estágio atual = maior índice satisfeito** (`jornada.ts:84-94`). Os 11 estágios: `cadastrada → atendimento_agendado → atendida → prova_marcada → interesses → orcamento_aberto → contrato_fechado → em_provas → retirado → casamento → devolucao` (`jornada.ts:6-18`). `houveAtendimento` é **sticky** (`leads.ts:142-144`): quem faltou não regride para "cadastrada". `perdidaEm` não muda o índice — apenas encerra com selo "Perdida"; `devolucao` encerra positivo ("Devolvido") (`jornada.ts:95`). **Não há mudança manual de etapa** — só o marco "perdida" é manual.

### J3 — Editar dados da noiva · (leads:editar) · corrigir/completar dados do casamento

1. [`/noivas/[leadId]`] "Editar dados" aparece só com `leads:editar` (`page.tsx:181`).
2. [`/noivas/[leadId]/editar`] Gate reconferido (`editar/page.tsx:19`), `obterLead` escopado (null → volta à lista, `editar/page.tsx:25-26`); `NoivaForm` com `defaults` pré-preenchidos (data fatiada do ISO UTC, `editar/page.tsx:35`).
3. [submit] `editarNoivaAction` (`actions.ts:47`) reconfere gate, `editarLead` via `tenantPrisma.update` (`leads.ts:110`) — noiva de outra loja lança P2025 (falha-fechada). Redireciona à lista com `?ok=1`. Nota: `etapa`/`interesse` não são tocados aqui (`leads.ts:109`).

### J4 — Marcar perdida / reativar · (leads:editar) · tirar/devolver a noiva da jornada ativa

1. [`/noivas` card OU `/noivas/[leadId]`] Botão "Desativar" (com `BotaoConfirmar`) ou "Reativar" conforme `perdidaEm` (`page.tsx:237-256` na lista; `page.tsx:187` no perfil via `MarcoForm`). Em jornada concluída (Devolvido) não há nada a desativar (`page.tsx:184,233`).
2. [submit] `marcarPerdidaAction` (`jornada-actions.ts:14`) via `acaoAutorizada("leads","editar")` → `definirMarcoJornada(..., "perdidaEm", ligar)` (`leads.ts:225`) seta/limpa o timestamp via `updateMany` escopado. **Encerramento reversível** — reativar é só limpar `perdidaEm`.
3. [redireciona] Volta de onde veio (lista preserva a lente via `voltar`; fallback no perfil) com `?ok=desativada|reativada` (`jornada-actions.ts:19-20`).
4. Nota histórica: `marcarOrcamentoAbertoAction`/`marcarContratoFechadoAction` foram **aposentadas** (`jornada-actions.ts:10-13`) — esses estágios hoje derivam de Orçamento/Contrato reais; os campos `orcamentoAbertoEm`/`contratoFechadoEm` ficam só por compat.

### J5 — Encontrar a noiva na lista (lente: estado + etapa + busca) · (leads:ver) · achar a noiva certa rápido

1. [`/noivas`] `listarNoivasComEstagio` (`leads.ts:199`) faz **uma** leitura ordenada por nome já com o estágio derivado (antes eram duas `findMany`).
2. [chips] Filtro por estado: Ativas (default) / Concluídas (Devolvido) / Desativadas (Perdida) / Todas (`page.tsx:25-27,49-59`). Contagem por chip (`page.tsx:51-52`).
3. [busca + etapa] Form GET (sem JS): busca por nome (noiva ou noivo) e select de etapa (11 estágios) (`page.tsx:142-170`). Compõem com o estado (`page.tsx:60-65`). **ATRITO/borda:** busca é `includes` simples e **sensível a acento** (`page.tsx:57-63`) — "Tania" não acha "Tânia".
4. [lente] O estado da lente vira query (`page.tsx:69-74`) e é propagado ao detalhe via `?de=` para o voltar reabrir a mesma vista.

### J6 — Registrar interesses e ver vestidos sugeridos · Vendedora (interesses:*) · capturar os desejos e indicar acervo compatível

1. [`/noivas/[leadId]`] Bloco "Interesses" → "Preencher/Editar interesses" (`page.tsx:235`); rótulo muda se já há interesse.
2. [`/noivas/[leadId]/interesses`] Gate `interesses:ver` (`interesses/page.tsx:24`), `obterNoivaComInteresse` read-only (**nunca cria registro**, `interesses.ts:63`). Carrega catálogo, seleções já feitas e `indicarVestidos` (`interesses/page.tsx:49-51`).
3. [form] `InteresseForm` (atributos do catálogo — mesmo vocabulário dos vestidos — + campos livres: algo a mais, não quer usar, teto de orçamento). `readonly` se sem criar/editar (`interesses/page.tsx:73`).
4. [submit] `salvarInteresseAction` (`interesses/actions.ts:27`) exige `criar` OU `editar`, monta `InteresseInput` validando seleções contra o catálogo (`interesses/actions.ts:19`), chama `salvarInteresse` (`interesses.ts:89`). **Isolamento manual:** `LeadInteresse` não tem `lojaId` → `exigirLeadDaLoja` confirma a posse ANTES do upsert (`interesses.ts:55,94`). Atributos: substitui o conjunto inteiro (`deleteMany`+`create`, `interesses.ts:85`).
5. [sugeridos] `indicarVestidos` (`indicacao.ts:56`) ranqueia o acervo ativo por afinidade = nº de pares (atributo,opção) em comum com o interesse (`indicacao.ts:97-120`). Ordena: **dentro do teto primeiro → mais pontos → mais barato no empate** (`indicacao.ts:124-130`), top 6 (`indicacao.ts:59`). `VestidosSugeridos` também recebe `naoQuerUsar` como lembrete manual (`interesses/page.tsx:77`).
6. **ATRITO:** texto livre `naoQuerUsar`/`algoAMais` **não entra no score** (limite consciente, `indicacao.ts:9-11`); `conflitaComRecusa` (`indicacao.ts:39`) só sinaliza visualmente por tokens ≥4 letras — depende de a vendedora escrever bem e olhar. Atributos do catálogo desativados depois somem silenciosamente do `total` (`indicacao.ts:81,90`).

### J7 — Reservar um vestido pela noiva · Vendedora (vestidos:editar) · comprometer a peça para a data do casamento

1. [`/noivas/[leadId]` bloco "Vestido reservado"] Aparece com reserva existente ou `vestidos:editar` (`page.tsx:375`). **Pré-condição dura:** sem `casamentoData` mostra "Defina a data do casamento para reservar um vestido" e não oferece o seletor (`page.tsx:410-411`).
2. [seletor] `ReservaLivreInline` chama `buscarVestidosLivresAction` sob demanda (`reserva-actions.ts:20`) — calcula vestidos livres só quando abre o seletor (evita varrer o acervo a cada load). Reconfere `vestidos:editar` e exige `casamentoData` (`reserva-actions.ts:23-25`).
3. [submit] `reservarPelaNoivaAction` (`reserva-actions.ts:29`) reconfere gate, exige vestido (`?erro=sem_vestido`), confirma lead da loja e data, chama `reservarVestido` (motor de disponibilidade, `reserva-actions.ts:46`). Sucesso → `?ok=reserva`; colisão → `?erro={motivo}&em={data}` que vira "já reservado para DD/MM" (`page.tsx:142-145`).
4. [cancelar] `cancelarReservaPelaNoivaAction` (`reserva-actions.ts:52`) com `BotaoConfirmar`, gate `vestidos:editar`, `cancelarReserva` (alias deprecado de `removerBloqueio`).
5. Efeito na jornada: a reserva e suas provas/devolução **realimentam** os fatos (`INCLUDE_JORNADA.bloqueios`, `leads.ts:125-133`), avançando os estágios `em_provas → retirado → casamento → devolucao` sem ação manual.

## Ramificações e estados de borda

- **Falha-fechada em toda fronteira:** `obterLead`/`obterNoivaComInteresse` retornam null para noiva de outra loja → redireciona à lista (`editar/page.tsx:25`, `[leadId]/page.tsx:114`, `interesses/page.tsx:33`). Escritas em outra loja lançam P2025 (`leads.ts:108-113`).
- **Isolamento manual de tabelas-filha sem `lojaId`:** `LeadInteresse`/`LeadInteresseAtributo` só são tocadas após `exigirLeadDaLoja` (`interesses.ts:55`); `indicarVestidos` só lê `LeadInteresse` depois de confirmar o lead pela loja (`indicacao.ts:63-66`).
- **Busca sensível a acento:** `includes(buscaLower)` sem normalização (`page.tsx:57-63`) — borda conhecida; nomes acentuados exigem digitar o acento.
- **Estágio sticky vs. regressão:** como o atual é o maior índice satisfeito, um fato tardio (ex.: reserva → `em_provas`) "pula" estágios intermediários não satisfeitos; isso é por design (timeline mostra anteriores como "feito").
- **Datas:** `parseData` rejeita data impossível (`leads.ts:50`); tudo exibido em UTC (`page.tsx:40-52`) exceto timestamps reais (orçado em São Paulo, `page.tsx:56`). Contagem regressiva só no futuro e fora de perdida/concluída (`page.tsx:190-193`).
- **`naoQuerUsar` é só sinal visual** (`indicacao.ts:9-11`), nunca filtra/pontua.
- **Reserva exige data de casamento**: sem ela, o caminho de reserva fica inacessível (`page.tsx:410`, `reserva-actions.ts:25,43`).
- **Origem inválida** lança ("Origem inválida", `leads.ts:42`); vazio cai em `LOJA`.

## Pontos de fricção observados no código real

1. **Cadastro força o agendamento.** `criarNoivaAction` sempre redireciona para `/atendimentos/novo?noiva=...` (`actions.ts:44`). Não existe "salvar e voltar à lista" — quem só queria registrar a noiva precisa abandonar a grade de horários manualmente.
2. **Busca por nome sensível a acento** (`page.tsx:57-63`). `includes` sem `normalize`/strip de diacríticos faz "Tania" não achar "Tânia"; em um cadastro pt-BR isso falha com frequência.
3. **Sem deduplicação no cadastro.** Nenhuma checagem de noiva já existente (nome/WhatsApp); fácil criar jornadas duplicadas para a mesma pessoa.
4. **Indicação ignora texto livre.** "Não quer usar"/"algo a mais" não pontuam nem filtram (`indicacao.ts:9-11`); só há uma heurística visual frágil (`conflitaComRecusa`) baseada em tokens ≥4 letras.
5. **`Lead.etapa` é resíduo** ainda no schema mas nunca atualizado (`leads.ts:80`); marcos `orcamentoAbertoEm`/`contratoFechadoEm` só por compat (`jornada.ts:42-43,65-66`). Dívida a remover, confunde quem lê o schema.
6. **Encerramento "perdida" sem motivo nem histórico.** `definirMarcoJornada` só liga/desliga um timestamp (`leads.ts:225`); não registra por que se perdeu nem quando reativou — perde-se sinal de funil.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)

- **"Salvar e ficar"** no cadastro: oferecer escolha entre emendar no agendamento e voltar à lista (ou um toast com link "agendar agora"), respeitando o fluxo concierge sem aprisionar na grade.
- **Busca tolerante a acento/parcial:** normalizar (`NFD` + strip diacríticos) na busca e talvez incluir WhatsApp; baixo custo, alto alívio operacional.
- **Detecção suave de duplicata** ao cadastrar (mesmo nome/WhatsApp na loja) com aviso não-bloqueante "talvez já exista esta noiva".
- **Motivo de perda + mini-histórico de jornada:** capturar motivo ao desativar e registrar marcos com data para nutrir métricas de funil (sem reintroduzir etapa manual).
- **Interesses mais ricos na indicação:** mapear sinônimos de "não quer usar" contra o catálogo (ou um campo estruturado de "evitar") para que a recusa pese de fato no ranking.
- **Limpeza da dívida `etapa`/marcos legados:** plano para remover `Lead.etapa` e os `*Em` de compat, simplificando o modelo agora que a jornada é 100% derivada.
- **Atalho de jornada no card da lista:** micro-timeline ou "próxima ação sugerida" direto no card, reforçando a metáfora de jornada antes mesmo de abrir o perfil.
