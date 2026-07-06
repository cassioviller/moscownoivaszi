# Design — Agendar prova unificado ao Atendimento

Data: 2026-06-08

## 1. Contexto e objetivo

Hoje há **dois fluxos diferentes** para marcar um encontro com a noiva:

- **Atendimento** (consulta): agendado pela tela **Agendar** (`/atendimentos/novo`), com grade real de disponibilidade (cabine + vendedora + hora, 60 min) e ciclo de vida AGENDADO → EM_ATENDIMENTO → CONCLUIDO/FALTOU.
- **Prova**: criada de dentro da tela de **Reservas** (`/reservas/[bloqueioId]`), presa à reserva (`bloqueioId`), com `tipo` (1ª/intermediária/final), `comparecimento` e uma data — **sem grade, sem cabine, sem horário**. Não tem relação alguma com `Atendimento`.

Isso é o que está estranho: a prova não recebe o mesmo tratamento de agendamento do atendimento, ainda que ocupe o mesmo espaço físico (cabine) e o mesmo tempo da vendedora.

**Objetivo:** a prova passa a ser agendada **pela mesma tela Agendar**, com a **mesma grade de disponibilidade** (cabine e vendedora obrigatórias, checadas por horário). Um campo **Tipo (Atendimento | Prova)** apenas **roteia o destino**: atendimento vai para a fila `/atendimentos`; prova vira um **card acionável** na aba **Provas & ajustes** do Calendário, onde se **inicia** a prova, **cadastram-se os ajustes** e o card passa a exibir os ajustes pedidos.

## 2. Decisões (validadas com o dono)

1. **Prova vira um tipo de Atendimento** — fundir `Prova` dentro de `Atendimento` com um discriminador `tipo`. (Abordagem A.)
2. **Prova continua ligada a uma reserva/vestido** (`bloqueioId`). Pressupõe que a noiva já tem reserva.
3. **Prova reaproveita o mesmo ciclo** do atendimento: AGENDADO → EM_ATENDIMENTO → CONCLUIDO/FALTOU.
4. **Sem sub-tipo de prova** — 1ª/intermediária/final são eliminados. Toda prova é só "prova".
5. **Cabine + vendedora obrigatórias** para agendar prova, com a **mesma checagem de disponibilidade** do atendimento. O campo Tipo **não** altera a lógica de agendamento.
6. **Provas antigas são descartáveis** (sistema em testes) → **sem migração de dados**; `cabine`/`vendedora` permanecem **NOT NULL**.
7. **Form de registrar prova sai da tela de Reservas**; a tela continua **mostrando** (leitura) as provas da reserva e seus ajustes.
8. **Card acionável da prova mora na aba "Provas & ajustes"** do Calendário; a fila `/atendimentos` passa a mostrar só Tipo=Atendimento.
9. **Provas abertas (agendada/em atendimento) ficam sempre visíveis** no topo da aba como fila de trabalho, independentes do filtro de período; o filtro De/Até segue valendo só para os **ajustes pendentes**.
10. **Prova conclui sem desfecho** (RESERVOU/VAI_PENSAR/NAO_SERVIU é exclusivo de atendimento).

## 3. Modelo de dados

### 3.1 Enum novo
```prisma
enum AtendimentoTipo {
  ATENDIMENTO // consulta com a noiva (fluxo atual)
  PROVA       // prova de vestido (presa a uma reserva)
}
```

### 3.2 `Atendimento` (alterado)
```prisma
model Atendimento {
  id          String              @id @default(cuid())
  lojaId      String
  leadId      String
  cabineId    String              // continua NOT NULL
  vendedoraId String              // continua NOT NULL
  tipo        AtendimentoTipo     @default(ATENDIMENTO)  // NOVO
  bloqueioId  String?             // NOVO — a reserva/vestido, preenchido quando tipo=PROVA
  inicio      DateTime
  situacao    AtendimentoSituacao @default(AGENDADO)
  atendidoEm  DateTime?
  desfecho    AtendimentoDesfecho?                       // só ATENDIMENTO usa
  observacao  String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  loja      Loja             @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead      Lead             @relation(fields: [leadId], references: [id], onDelete: Cascade)
  cabine    Cabine           @relation(fields: [cabineId], references: [id], onDelete: Cascade)
  vendedora Usuario          @relation(fields: [vendedoraId], references: [id], onDelete: Cascade)
  bloqueio  BloqueioVestido? @relation(fields: [bloqueioId], references: [id], onDelete: Cascade) // NOVO
  orcamentos Orcamento[]
  ajustes    Ajuste[]                                    // NOVO (só provas terão)
}
```
**Invariante de aplicação (não-DB):** `tipo=PROVA` ⇒ `bloqueioId` presente; `tipo=ATENDIMENTO` ⇒ `bloqueioId` nulo e sem ajustes. Validado na action de agendar.

### 3.3 `Ajuste` (alterado)
```prisma
model Ajuste {
  id            String       @id @default(cuid())
  lojaId        String
  atendimentoId String       // ANTES: provaId
  descricao     String
  status        AjusteStatus @default(PENDENTE)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  loja        Loja        @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  atendimento Atendimento @relation(fields: [atendimentoId], references: [id], onDelete: Cascade)
  checklist   AjusteChecklistItem[]
}
```
`AjusteChecklistItem` permanece inalterado (filha pura).

### 3.4 Removidos
- `model Prova`
- `enum ProvaTipo`
- `enum ProvaComparecimento`
- relação `BloqueioVestido.provas` → vira `atendimentos Atendimento[]`

### 3.5 Migração
Como os dados de prova/ajuste são descartáveis: a migration Prisma **dropa** `Prova` (e por cascade os `Ajuste`/`AjusteChecklistItem` existentes), adiciona `AtendimentoTipo`, as colunas `tipo`/`bloqueioId` em `Atendimento`, e recria `Ajuste` com `atendimentoId NOT NULL`. **Sem backfill.** (Confirmar com o dono que nenhuma prova real precisa sobreviver antes de rodar em produção.)

## 4. Camada de dados (`src/lib`)

Consolidação: a lógica de prova deixa `src/lib/atelier/provas.ts` e passa a viver no domínio de atendimento, porque prova **é** um atendimento.

- **`src/lib/atendimentos/atendimentos.ts`**
  - `agendarAtendimento(...)` ganha `tipo: AtendimentoTipo` e `bloqueioId?: string`. Quando `tipo=PROVA`: exige `bloqueioId`, valida que o bloqueio é da loja e pertence ao `leadId` escolhido. Grade/`horasOcupadas` **inalterados** — já contam qualquer atendimento por cabine OU vendedora, então provas entram automaticamente ("mesmo espaço").
  - `listarAtendimentos`, `listarProximosAtendimentos`: passam a filtrar `tipo: "ATENDIMENTO"`.
  - Novas leituras de prova: `listarProvasAbertas(lojaId)` (situação AGENDADO/EM_ATENDIMENTO, tipo=PROVA, com noiva + vestido + cabine + vendedora + ajustes), `listarProvasDaReserva(lojaId, bloqueioId)` (para a tela de Reservas), e `listarProvasDaLoja(lojaId, opts)` (para a página `/provas` e marcadores do calendário) — reescritas sobre `Atendimento{tipo:PROVA}`.
  - Conclusão de prova **sem desfecho**: `concluirProva(lojaId, id)` (AGENDADO|EM_ATENDIMENTO → CONCLUIDO, sem desfecho). `iniciarAtendimento`/`marcarFalta` são reaproveitados (servem aos dois tipos). `concluirAtendimento` (com desfecho) segue só para Tipo=Atendimento.
- **`src/lib/atelier/ajustes.ts`**: `provaId` → `atendimentoId` em `adicionarAjuste`, `listarAjustesPendentes` (o join `prova → bloqueio` vira `atendimento → bloqueio`), e nas projeções. Demais funções (checklist, alternar status) só trocam o nome do vínculo.
- **`src/lib/atelier/provas.ts`**: removido (funções migram para atendimentos) — ou mantido como fino re-export se reduzir churn; decisão na fase de plano.
- **`src/lib/calendario/dados.ts`**: o marcador "prova" passa a ler `Atendimento{tipo:PROVA}.inicio` em vez de `Prova.dataReal`.

## 5. Fluxo Agendar (UI)

`src/app/(app)/loja/[lojaId]/atendimentos/novo/` (`page.tsx`, `agendar-form.tsx`, `actions.ts`):

- **Seletor Tipo** (Atendimento | Prova), default Atendimento, no topo do form.
- **Tipo=Atendimento:** idêntico a hoje (noiva, cabine, vendedora, data, slot, observação).
- **Tipo=Prova:** mesmos campos **+ "Reserva / vestido"** — um select com as reservas de casamento (`BloqueioVestido` tipo `RESERVA_CASAMENTO`) da noiva escolhida. Se a noiva não tiver reserva, o form orienta a criar a reserva antes.
- **Grade:** sem mudança — `gradeDoDia` continua igual; o slot escolhido vale para os dois tipos.
- **`agendarAtendimentoAction`:** repassa `tipo` e `bloqueioId`. Permissão: `leads`/`criar` (mesma de hoje).
- **Pontos de entrada extra:** atalho **"Agendar prova"** a partir da tela de Reservas (pré-seleciona reserva + noiva via query) e a partir da aba Provas & ajustes (link para o Agendar com Tipo=Prova).

## 6. Aba "Provas & ajustes" (vira acionável)

`src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx` (+ actions):

- **Provas abertas** (topo, sempre visíveis, ignoram o filtro de período), ordenadas por horário, via `listarProvasAbertas`:
  - **Agendada:** card com noiva + vestido + horário + cabine/vendedora; botões **"Iniciar atendimento"** (`iniciarAtendimento`) e **"Marcou falta"** (`marcarFalta`).
  - **Em atendimento:** o card expande o **editor de ajustes** — adicionar ajuste (`adicionarAjuste`) e itens de checklist — e o botão **"Concluir prova"** (`concluirProva`).
  - **Concluída:** sai da lista de abertas; o card de histórico mostra os **ajustes pedidos** (o "card do atendimento com os ajustes"). Histórico acessível via `/provas` / Agenda.
- **Ajustes pendentes** (fila da costureira): como hoje, **filtrável pelo período** De/Até (`listarAjustesPendentes`).
- Ações de prova: permissão `leads`/`editar`; cadastro de ajuste: `ajustes`/`criar` (mantém o módulo atual dos ajustes).

## 7. Reservas, fila de Atendimentos e outras leituras

- **Reservas** (`/reservas/[bloqueioId]/page.tsx` + `actions.ts`): remover o formulário de registrar prova e o de editar prova/comparecimento. Manter **exibição** (leitura) das provas da reserva (via `listarProvasDaReserva`) com seus ajustes e status. Adicionar atalho **"Agendar prova"**. As actions `registrarProvaAction`/`editarProvaAction` saem.
- **Fila `/atendimentos`** e **"próximos atendimentos" do dashboard**: filtram `tipo=ATENDIMENTO` (prova não aparece na fila de consultas).
- **`/provas`** (página dedicada): passa a listar `Atendimento{tipo:PROVA}` — leitura/agenda de provas.
- **Calendário (AbaMês):** marcador de prova vem de `Atendimento{tipo:PROVA}`.

## 8. Permissões

- Agendar (qualquer tipo): `leads`/`criar` (inalterado).
- Ciclo de prova (iniciar/concluir/falta): `leads`/`editar`.
- Cadastro/checklist de ajustes: `ajustes`/`criar` e `ajustes`/`editar` (mantém o módulo `ajustes`).

## 9. Testes

- **Unit/pure:** validação `tipo=PROVA ⇒ bloqueioId` e `bloqueio↔lead`; roteamento de `listarAtendimentos` (só ATENDIMENTO) e `listarProvasAbertas` (só PROVA).
- **Integração (Postgres):**
  - Agendar prova ocupa o mesmo slot de cabine/vendedora (a grade bloqueia atendimento e prova no mesmo horário).
  - Agendar prova aparece em Provas & ajustes e **não** na fila `/atendimentos`; agendar atendimento o contrário.
  - Ciclo: iniciar prova → adicionar ajuste → concluir prova; ajuste referencia `atendimentoId`; fila de pendentes ordena por casamento (via `atendimento → bloqueio`).
  - Isolamento de loja preservado em todas as leituras.
- **Reescrever** `src/lib/atelier/__tests__/atelier.test.ts` (hoje sobre `Prova`) para o novo modelo. Atualizar `src/lib/disponibilidade/__tests__` se tocar marcadores.
- **Gates:** `tsc --noEmit` limpo e `vitest run` verde antes de cada commit (na `main`).
- **Seed:** `prisma/seed.ts` / `seed-demo.ts` passam a criar provas como `Atendimento{tipo:PROVA}` com cabine/vendedora/slot.

## 10. Ordem de implementação (fatias)

1. Schema + migration (drop Prova, enum/colunas em Atendimento, Ajuste→atendimentoId) + `prisma generate`.
2. Camada de dados: `atendimentos.ts` (agendar com tipo/bloqueio, listas filtradas, `listarProvas*`, `concluirProva`), `ajustes.ts` (atendimentoId), `calendario/dados.ts`. Reescrever testes do atelier.
3. Agendar UI: seletor Tipo + picker de reserva + action.
4. Aba Provas & ajustes acionável (cards + ciclo + editor de ajustes).
5. Reservas (remove form, mantém leitura, atalho) + filtro `tipo=ATENDIMENTO` na fila/dashboard + `/provas`.
6. Seed/seed-demo + varredura final de gates.

(O detalhamento por tarefa fica para o `writing-plans`.)

## 11. Riscos e fora de escopo

- **Risco:** muitos pontos de leitura tocam "prova" hoje (reservas, calendário mês, /provas, dashboard, ajustes). A varredura precisa ser completa para não deixar referência ao modelo `Prova` removido — `tsc` é a rede de segurança.
- **Risco:** confirmar com o dono, antes de rodar em produção, que nenhuma prova real precisa sobreviver (a migration descarta).
- **Fora de escopo:** atendimento (consulta) gerar ajustes (só prova tem ajustes); notificações/lemb--retes de prova; remarcação com histórico; qualquer mudança no motor de disponibilidade/reservas.
