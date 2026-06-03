# Spec S1 — Atendimentos (o ato de "atender")

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> **Início da cadeia comercial.** Maior que as S0: tem **migração de banco** e toca a
> **jornada**. Não constrói orçamento (isso é a S2).

---

## 1. Problema

Agendar um atendimento **não move a jornada**: `FatosJornada` (`leads.ts:136`) não tem
nenhum campo vindo de `Atendimento`. A noiva é agendada e o perfil dela segue
"Cadastrada". E **não existe o ato de "atender"** — entre *agendou* e *reservou* não há
registro nenhum (sem fila de trabalho, sem status, sem desfecho). Este é o vão de
entrada da jornada.

## 2. O que existe hoje

- `Atendimento` (`schema.prisma:388`): `leadId`, `cabineId`, `vendedoraId`, `inicio`,
  `observacao`. **Sem status.**
- Data layer (`src/lib/atendimentos/atendimentos.ts`): `agendarAtendimento`,
  `gradeDoDia`, `listarProximosAtendimentos`, `cancelarAtendimento`.
- Tela **Agendar** (`/atendimentos/novo`): grade de horários, cria e cancela.
- Jornada derivada (`jornada.ts`, `leads.ts`): etapas `cadastrada → prova_marcada →
  interesses → orcamento_aberto → …`. O enum `LeadEtapa` tem `ATENDIMENTO_AGENDADO`/
  `EM_ATENDIMENTO` mas é **morto** (nunca lido/escrito).

## 3. Escopo

**Dentro:**
- **Migração:** `Atendimento.situacao` (enum) + `atendidoEm` (quando virou "em
  atendimento"/concluído) + `desfecho` opcional.
- **Data layer:** transições de status (iniciar, concluir, marcar falta) + listagem por
  situação (fila do dia / próximos / histórico).
- **Tela `/atendimentos`:** a **fila de trabalho** — iniciar atendimento, concluir com
  desfecho, marcar falta; deep-link para o perfil da noiva.
- **Jornada:** dois fatos novos (`temAtendimentoAgendado`, `foiAtendida`) + duas etapas
  (`atendimento_agendado`, `atendida`), para o agendamento e o atendimento moverem a
  jornada.

**Fora (YAGNI / outras fatias):**
- **Orçamento** dentro do atendimento → **S2**. Em S1, "abrir orçamento" não existe ainda.
- **Reservar o vestido** a partir do atendimento → ver §8 (decisão): por padrão **fora**
  de S1 (a reserva continua no perfil da noiva); só um link.
- Limpeza do enum `LeadEtapa` morto e reordenação de `prova_marcada` → **fatia de higiene
  futura** (não foldar aqui, para manter S1 focada).
- Mudar a tela **Agendar** (continua criando; S1 só consome o que ela cria).

## 4. Migração (schema)

```prisma
enum AtendimentoSituacao {
  AGENDADO        // criado, ainda não aconteceu
  EM_ATENDIMENTO  // noiva chegou, vendedora atendendo
  CONCLUIDO       // atendimento encerrado
  FALTOU          // não compareceu
}

enum AtendimentoDesfecho {   // só faz sentido em CONCLUIDO
  RESERVOU        // saiu com vestido reservado
  VAI_PENSAR      // ficou de decidir
  NAO_SERVIU      // nada serviu
}

model Atendimento {
  // … campos atuais …
  situacao   AtendimentoSituacao  @default(AGENDADO)
  atendidoEm DateTime?            // quando entrou em atendimento
  desfecho   AtendimentoDesfecho?
}
```

> `@default(AGENDADO)` cobre as linhas existentes sem backfill manual. `CANCELADO` não
> vira status — cancelar continua sendo `delete` (`cancelarAtendimento`), como hoje.

## 5. Data layer (`atendimentos.ts`)

Retornos discriminados no mesmo padrão de `ResultadoAgendar`.

```ts
export type ResultadoSituacao =
  | { ok: true }
  | { ok: false; motivo: "atendimento_invalido" | "transicao_invalida" | "desfecho_invalido" };

/** AGENDADO → EM_ATENDIMENTO (carimba atendidoEm). */
export async function iniciarAtendimento(lojaId, id): Promise<ResultadoSituacao>;

/** EM_ATENDIMENTO|AGENDADO → CONCLUIDO, com desfecho. */
export async function concluirAtendimento(lojaId, id, desfecho): Promise<ResultadoSituacao>;

/** AGENDADO → FALTOU. */
export async function marcarFalta(lojaId, id): Promise<ResultadoSituacao>;
```

- Transições válidas barram saltos sem sentido (ex.: concluir um que já FALTOU →
  `transicao_invalida`). Escopo de loja via tenantPrisma (cross-loja →
  `atendimento_invalido`).
- **Nova listagem:** `listarAtendimentos(lojaId, { dia? | passados? })` devolvendo
  situação + desfecho + noiva, para a fila/histórico. (Reaproveita o include de
  `listarProximosAtendimentos`, somando os novos campos.)

## 6. Tela `/atendimentos` (fila de trabalho)

Server Component, `force-dynamic`. **Permissão de ver:** `leads:ver`. **Mutar:**
`leads:editar` (mesmo gate dos marcos da jornada).

- **Hoje** em destaque: atendimentos do dia, com horário, noiva, cabine, vendedora e
  badge de situação. **Próximos** abaixo; link para o **histórico** (concluídos/faltas).
- **Ações por linha** (Server Actions com `<form>`, padrão da casa):
  - AGENDADO → **Iniciar atendimento** (vira EM_ATENDIMENTO) · **Marcou falta**.
  - EM_ATENDIMENTO → **Concluir** (escolhe desfecho: reservou / vai pensar / não serviu).
  - Sempre: **abrir o perfil da noiva** (onde hoje se preenche interesse e se reserva).
- Tom Concierge: "Atendimentos de hoje", linguagem humana, bordô só na ação principal.
- Vazio: "Nenhum atendimento hoje." + atalho para **Agendar**.

> Divisão de papéis clara: **Agendar** (`/atendimentos/novo`) = marcar horário na grade;
> **Atendimentos** (`/atendimentos`) = trabalhar a fila do dia.

## 7. Jornada (integração)

**Fatos novos** (`fatosDeLead`, lendo os atendimentos da noiva no `INCLUDE_JORNADA`):
- `temAtendimentoAgendado` = algum atendimento `situacao = AGENDADO`.
- `foiAtendida` = algum atendimento `situacao ∈ {EM_ATENDIMENTO, CONCLUIDO}`.

**Etapas novas** (`ESTAGIOS`, logo após `cadastrada`):
```
cadastrada → atendimento_agendado → atendida → prova_marcada → interesses → …
```
Mantém o modelo linear atual ("maior índice satisfeito"). Sim, o mesmo comportamento
retroativo já existente se aplica (uma noiva com interesse mas sem atendimento mostra as
etapas anteriores como "feito") — é o design vigente da jornada derivada, não uma
regressão.

> A reordenação de `prova_marcada` e a remoção do enum morto ficam para a fatia de
> higiene (fora de S1). Aqui só **inserimos** as duas etapas de atendimento.

## 8. Decisões a confirmar (pontos seus)

1. **Desfecho no concluir:** capturar `desfecho` (reservou / vai pensar / não serviu) já
   em S1, ou deixar "Concluir" sem desfecho por enquanto? *(Recomendo capturar — é barato
   e alimenta relatório/funil depois.)*
2. **Reservar a partir do atendimento:** em S1, "Concluir → reservou" só **registra o
   desfecho** e leva ao perfil da noiva para reservar (reserva continua lá); ou você quer
   o **seletor de vestido livre embutido** no atendimento já agora? *(Recomendo só o
   link em S1; embutir reserva/orçamento casa melhor com a S2.)*
3. **Etapas da jornada:** ok inserir `atendimento_agendado` + `atendida` aceitando o
   modelo linear atual (sem mexer em `prova_marcada` agora)? *(Recomendo sim.)*

## 9. Testes

- **Data layer** (`atendimentos.test.ts`): cada transição válida; transições inválidas
  (`transicao_invalida`); desfecho exigido no concluir; isolamento de loja;
  `listarAtendimentos` por dia/histórico.
- **Jornada** (`jornada.test.ts` / `leads.test.ts`): `temAtendimentoAgendado` e
  `foiAtendida` derivam as etapas certas; uma noiva agendada chega a "Atendimento
  agendado"; após iniciar, "Atendida".

## 10. Plano (fatias finas, commit na `main`)

1. Migração + `prisma generate`.
2. Data layer (transições + listagem) **+ testes** (TDD).
3. Jornada: fatos + etapas **+ testes**.
4. Tela `/atendimentos` + Server Actions.
5. Verificação (agendar → iniciar → concluir; conferir jornada) e gates verdes.

## 11. Riscos

- **Migração** num banco com dados: `@default` cobre, mas rodar `prisma migrate` exige
  cuidado (confirmar ambiente). Operação de banco = **requer confirmação** (CLAUDE.md).
- **Modelo linear da jornada:** inserir etapas no meio desloca índices; revisar os testes
  de jornada que assumem posições.
- **Sobreposição com Agendar:** evitar duplicar a lista; deixar claro o papel de cada tela.

## 12. Definição de pronto

Uma noiva agendada aparece na fila de `/atendimentos`; a vendedora **inicia** e
**conclui** (com desfecho) o atendimento; a **jornada reflete** "Atendimento agendado" e
"Atendida"; data layer e jornada cobertos por testes; gates verdes.
