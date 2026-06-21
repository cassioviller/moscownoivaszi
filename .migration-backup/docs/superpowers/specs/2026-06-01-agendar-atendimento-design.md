# Agendar atendimento — design

> Registrado em **2026-06-01**. Feature nova: agendar o atendimento (consulta inicial) de uma
> noiva, com cabine, vendedora e **grade visual de horários** do dia. Trabalho direto na `main`
> (sem branch `feat/*` — ver `CLAUDE.md`).

## Contexto / objetivo

Hoje não existe entidade de agendamento no sistema (a "Agenda" atual só DERIVA provas/reservas).
O atelier precisa **marcar o atendimento** de uma noiva: escolher data, **cabine**, **vendedora**
e um **horário livre**. A tela aparece em dois lugares: (1) item "Agendar" na sidebar (escolhe a
noiva) e (2) logo após cadastrar uma noiva (já vem com ela pré-selecionada).

## Modelo de dados (Prisma + migration)

- **`Cabine`** — `{ id, lojaId, nome, ativo @default(true), createdAt, updatedAt }`. Lista cadastrável
  por loja. Entra em `TENANT_MODELS`.
- **`Atendimento`** — `{ id, lojaId, leadId, cabineId, vendedoraId, inicio DateTime, observacao String?,
  createdAt, updatedAt }`. `vendedoraId` → `Usuario.id` (membro da equipe da loja). Entra em
  `TENANT_MODELS`. Duração **fixa de 60 min** (constante `DURACAO_MIN = 60`; vira config depois se
  preciso). Relações: `loja`, `lead` (onDelete Cascade), `cabine`, `vendedora` (Usuario).
- **Horário de funcionamento (configurável por loja):** dois campos novos em `RegraDisponibilidade`
  (singleton por loja que já existe): `atendimentoAberturaHora Int @default(9)` e
  `atendimentoFechamentoHora Int @default(19)`. A grade vai de abertura a fechamento, em slots de 1h.
- Relações inversas: `Loja` ganha `cabines`/`atendimentos`; `Lead` ganha `atendimentos`; `Cabine`
  ganha `atendimentos`; `Usuario` ganha `atendimentos` (back-relation da FK `vendedoraId`).

**Convenção de data/hora:** `inicio` guardado como **wall-clock tratado em UTC** —
`new Date(\`${dataYMD}T${HH}:00:00.000Z\`)` — e sempre exibido em UTC (mesma filosofia "o dia/horário
não desliza por fuso" do resto do sistema). Slots são alinhados à hora cheia.

## Disponibilidade — grade visual de horários

A vaga é livre só quando **a cabine E a vendedora** estão livres no horário.

- Função **pura** `gradeDeSlots(aberturaHora, fechamentoHora, dataYMD, ocupados)` → lista de
  `{ hora: number, inicioISO: string, livre: boolean }` para cada hora em `[abertura, fechamento)`.
  Um slot fica `livre:false` se algum `ocupado` (intervalo de atendimento existente) se sobrepõe a
  `[slot, slot+60min)`. Sobreposição = `aIni < bFim && bIni < aFim`.
- Carregador `gradeDoDia(lojaId, { data, cabineId, vendedoraId })`: lê os atendimentos do dia cuja
  **cabine == cabineId OU vendedora == vendedoraId**, mapeia para intervalos e chama a função pura.
  Retorna os slots já com `livre`.
- **Fluxo na tela:** ao ter noiva + cabine + vendedora + data escolhidas, um componente cliente chama
  a *server action* `gradeDoDiaAction` e renderiza a grade; slots ocupados **desabilitados**, livres
  **clicáveis**; clicar seleciona o horário. Ao salvar, o servidor **revalida** a sobreposição (rede
  de segurança contra corrida) antes de criar.

## Camada de dados (`src/lib/atendimentos/`, via `tenantPrisma`)

- `cabines.ts`: `listarCabines(lojaId, { ativasApenas? })`, `criarCabine(lojaId, nome)`,
  `alternarCabineAtiva(lojaId, cabineId)`.
- `config.ts`: `obterHorarioLoja(lojaId)` → `{ abertura, fechamento }` (defaults 9/19);
  `salvarHorarioLoja(lojaId, abertura, fechamento)` (valida `0 ≤ abertura < fechamento ≤ 24`).
- `slots.ts` (puro): `gradeDeSlots(...)` + `slotsSobrepoem(...)`.
- `atendimentos.ts`: `listarVendedoras(lojaId)` (equipe da loja via `UsuarioLoja`, retorna `{id,nome}`);
  `gradeDoDia(...)`; `agendarAtendimento(lojaId, { leadId, cabineId, vendedoraId, dataYMD, hora, observacao })`
  (valida: lead da loja, cabine ativa da loja, vendedora vinculada à loja, hora dentro do funcionamento,
  sem sobreposição → cria, ou retorna `{ ok:false, motivo }`); `listarProximosAtendimentos(lojaId)`
  (futuros, com noiva/cabine/vendedora) ; `cancelarAtendimento(lojaId, id)`.

Validações retornam motivos (`sem_horario`, `fora_funcionamento`, `cabine_invalida`,
`vendedora_invalida`, `lead_invalido`, `indisponivel`) — falha-fechada, nunca 500.

## Telas

1. **Agendar** — `src/app/(app)/loja/[lojaId]/atendimentos/novo/page.tsx` (+ `actions.ts` + um client
   component `agendar-form.tsx`).
   - Server carrega: noivas (select), cabines ativas, vendedoras, `{abertura,fechamento}`. Pré-seleciona
     a noiva de `?noiva=<leadId>` quando vier.
   - Client `AgendarForm`: selects **noiva / cabine / vendedora** + **data**; ao ter os quatro, chama
     `gradeDoDiaAction` e mostra a **grade**; escolher um slot livre + **observação** → `agendarAtendimentoAction`.
   - Abaixo: **próximos atendimentos** (data/hora · noiva · cabine · vendedora) com **cancelar**.
2. **Config de atendimentos** — `src/app/(app)/loja/[lojaId]/atendimentos/config/page.tsx` (+ actions):
   cadastrar/ativar/desativar **cabines** + definir **horário de abertura/fechamento**. Gate `config`.

## Pontos de entrada / navegação

- **Sidebar:** novo item **"Agendar"** → `/loja/[lojaId]/atendimentos/novo`, sob a flag `leads:ver`.
  Renomear o rótulo do item atual **"Agenda" → "Calendário"** (a rota `/agenda` continua a mesma).
  (`src/components/layout/nav-items.ts`.)
- **Pós-cadastro de noiva:** `criarNoivaAction` passa a redirecionar para
  `/loja/[id]/atendimentos/novo?noiva=<leadId>` (em vez de `/noivas?ok=1`), com a noiva pré-selecionada.

## Permissões

- Ver a tela Agendar + listar: `leads:ver`. Agendar/cancelar: `leads:criar`. (Recepção/vendedora já têm.)
- Config de cabines/horário: `config:ver` (ver) / `config:editar` (salvar). Sem módulo de permissão novo.

## Tenant / segurança

`Cabine` e `Atendimento` entram em `TENANT_MODELS` (`src/lib/tenant.ts`); testes `proveZeroVazamento`
para os dois. `vendedoraId` é validado como membro da loja (via `UsuarioLoja`) no `agendarAtendimento`.

## Testes

- **Puro** (`slots.test.ts`): `gradeDeSlots` — janela de horas; slot ocupado quando há sobreposição de
  cabine OU vendedora; bordas (encostar não conflita).
- **Integração** (`atendimentos.test.ts`, Postgres real): `agendarAtendimento` recusa fora do horário,
  cabine/vendedora/lead de outra loja, e **sobreposição** (cabine e vendedora separadamente); cria quando
  livre; `gradeDoDia` reflete reservas; `cancelar`; isolamento por loja.
- Gates: `node node_modules/vitest/vitest.mjs run` verde; `node node_modules/typescript/bin/tsc --noEmit` limpo.

## Verificação manual (app no ar)

Config: cadastrar Cabine 1/2 e horário 9–19. Cadastrar noiva → cai em Agendar com ela pré-selecionada →
escolher cabine/vendedora/data → grade mostra livres/ocupados → marcar um slot → aparece em "próximos".
Tentar marcar a mesma cabine/vendedora no mesmo horário → slot desabilitado (e bloqueado no salvar).
**Após a migração, reiniciar o app (Run)** para recarregar o client Prisma.

## Fora de escopo (fast-follow)

- Mostrar o atendimento na **Agenda/Calendário** geral e no **perfil da noiva** (próximo atendimento).
- Status **compareceu/faltou/remarcado** do atendimento (a Prova já cobre isso na jornada; aqui é só agendar).
- Horário por dia-da-semana / dias fechados; editar atendimento (por ora: cancelar + reagendar).
- Integração com a jornada derivada (ex.: sinal "atendimento marcado").
