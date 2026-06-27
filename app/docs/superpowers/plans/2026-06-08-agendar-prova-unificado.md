# Agendar Prova Unificado ao Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir `Prova` dentro de `Atendimento` (discriminador `tipo`), agendar prova pela mesma tela Agendar/grade, e tornar a aba "Provas & ajustes" acionável (iniciar → cadastrar ajustes → concluir).

**Architecture:** Prova vira `Atendimento{tipo:PROVA, bloqueioId}`. Ajuste passa a apontar para `atendimentoId`. Cabine/vendedora seguem obrigatórias; a grade já bloqueia o mesmo espaço para os dois tipos. Provas antigas são descartadas (sem backfill). Spec: `docs/superpowers/specs/2026-06-08-agendar-prova-unificado-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 (Postgres), Vitest, TypeScript.

**Regras do repo (CLAUDE.md):** trabalhar e commitar **direto na `main`** (sem branch/worktree). Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo (ignorar o ruído pré-existente `.next/types/...zzprobe`) e `npx vitest run` verde.

**⚠️ Não confundir:** `BloqueioVestido.provaDataReal` (campo da reserva, usado pelo motor de disponibilidade em `src/lib/disponibilidade/*`) **NÃO** é o modelo `Prova`. Não tocar nesse campo nem nos testes do motor.

---

## File Structure

**Schema/dados**
- `prisma/schema.prisma` — enum `AtendimentoTipo`; `Atendimento` ganha `tipo`/`bloqueioId`/relations; `Ajuste.provaId`→`atendimentoId`; remove `Prova`/`ProvaTipo`/`ProvaComparecimento`; `BloqueioVestido.provas`→`atendimentos`.
- `src/lib/atendimentos/atendimentos.ts` — `agendarAtendimento` com `tipo`/`bloqueioId`; filtros `tipo:"ATENDIMENTO"`; novo `concluirProva`; novo `listarProvasAbertas`.
- `src/lib/atelier/provas.ts` — reescrito: só **leituras** de prova sobre `Atendimento{tipo:PROVA}` (`listarProvasDaReserva`, `listarProvasDaLoja`). Remove `registrarProva`/`editarProva`/`removerProva`.
- `src/lib/atelier/ajustes.ts` — `provaId`→`atendimentoId`; join `atendimento→bloqueio`.
- `src/lib/calendario/dados.ts` — marcador "prova" lê `Atendimento{tipo:PROVA}.inicio`.

**UI / actions**
- `src/app/(app)/loja/[lojaId]/atendimentos/novo/{agendar-form.tsx,actions.ts,page.tsx}` — seletor Tipo + picker de reserva.
- `src/app/(app)/loja/[lojaId]/atendimentos/{page.tsx}` — fila já filtrada por `tipo:"ATENDIMENTO"` (via lib).
- `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx` (+ novo `actions.ts`) — provas abertas acionáveis.
- `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/{page.tsx,actions.ts}` — remove form de prova, mantém leitura, atalho "Agendar prova".
- `src/app/(app)/loja/[lojaId]/provas/page.tsx` — adapta tipos (situacao no lugar de tipo/comparecimento).

**Testes / seed**
- `src/lib/atelier/__tests__/atelier.test.ts` — reescrito para o novo modelo.
- `src/lib/calendario/__tests__/dados.test.ts`, `src/lib/loja/__tests__/painel.test.ts`, `src/lib/__tests__/tenant.test.ts` — atualizar criação de prova → `atendimento{tipo:PROVA}`.
- `prisma/seed.ts`, `prisma/seed-demo.ts` — provas viram `atendimento{tipo:PROVA}`.

---

## SLICE 1 — Schema + migração + client

### Task 1.1: Alterar o schema Prisma

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Adicionar enum `AtendimentoTipo`** (logo acima do enum `AtendimentoSituacao`, ~linha 408)

```prisma
// Tipo do agendamento na grade. Roteia o destino, não a forma de agendar:
// ATENDIMENTO → fila /atendimentos; PROVA → aba Provas & ajustes (presa a uma reserva).
enum AtendimentoTipo {
  ATENDIMENTO
  PROVA
}
```

- [ ] **Step 2: Alterar o model `Atendimento`** (linhas ~426-445) — adicionar `tipo`, `bloqueioId`, relação `bloqueio` e `ajustes`:

```prisma
model Atendimento {
  id          String              @id @default(cuid())
  lojaId      String
  leadId      String
  cabineId    String
  vendedoraId String
  tipo        AtendimentoTipo     @default(ATENDIMENTO)
  bloqueioId  String?
  inicio      DateTime
  situacao    AtendimentoSituacao  @default(AGENDADO)
  atendidoEm  DateTime?
  desfecho    AtendimentoDesfecho?
  observacao  String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  loja      Loja             @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead      Lead             @relation(fields: [leadId], references: [id], onDelete: Cascade)
  cabine    Cabine           @relation(fields: [cabineId], references: [id], onDelete: Cascade)
  vendedora Usuario          @relation(fields: [vendedoraId], references: [id], onDelete: Cascade)
  bloqueio  BloqueioVestido? @relation(fields: [bloqueioId], references: [id], onDelete: Cascade)
  orcamentos Orcamento[]
  ajustes    Ajuste[]
}
```

- [ ] **Step 3: Alterar `Ajuste`** (linhas ~341-353) — `provaId`→`atendimentoId`, relação `prova`→`atendimento`:

```prisma
model Ajuste {
  id            String       @id @default(cuid())
  lojaId        String
  atendimentoId String
  descricao     String
  status        AjusteStatus @default(PENDENTE)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  loja        Loja        @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  atendimento Atendimento @relation(fields: [atendimentoId], references: [id], onDelete: Cascade)
  checklist   AjusteChecklistItem[]
}
```

- [ ] **Step 4: Alterar `BloqueioVestido`** (linha ~313) — trocar a relação `provas`:

```prisma
  // (dentro de BloqueioVestido, no lugar de `provas  Prova[]`)
  atendimentos Atendimento[]
```

- [ ] **Step 5: Remover** o `model Prova` inteiro (linhas ~317-337) e os enums `ProvaTipo`/`ProvaComparecimento` (procure por `enum ProvaTipo` e `enum ProvaComparecimento`).

- [ ] **Step 6: Verificar que não sobrou referência a `Prova`/`ProvaTipo`/`ProvaComparecimento` no schema**

Run: `grep -nE "Prova|ProvaTipo|ProvaComparecimento" prisma/schema.prisma`
Expected: nenhuma linha (o campo `BloqueioVestido.provaDataReal` é outro — se aparecer, é só esse e está OK).

### Task 1.2: Migrar e regenerar o client

**Files:** (gerados) `src/generated/prisma/*`, `prisma/migrations/*`

- [ ] **Step 1: Descobrir o fluxo de migração do projeto**

Run: `ls prisma/migrations 2>/dev/null && echo "USA-MIGRATIONS" || echo "USA-DB-PUSH"`

- [ ] **Step 2: Aplicar a mudança de schema (descarta provas/ajustes antigos — combinado)**

Se `USA-MIGRATIONS`: `npx prisma migrate dev --name agendar_prova_unificado`
Se `USA-DB-PUSH`: `npx prisma db push` e depois `npx prisma generate`
Expected: migração aplicada / schema sincronizado; client regenerado em `src/generated/prisma`.

- [ ] **Step 3: Confirmar o client regenerado**

Run: `grep -RnE "AtendimentoTipo" src/generated/prisma/enums.ts`
Expected: o enum `AtendimentoTipo` aparece. (O `tsc` vai quebrar em vários arquivos agora — esperado; consertamos nas próximas slices.)

- [ ] **Step 4: Commit** (schema só compila ao fim da Slice 2; commitamos schema+client juntos com a Slice 2. **Não commitar aqui** — seguir para a Slice 2.)

---

## SLICE 2 — Camada de dados (lib) + testes do atelier

> Esta slice deixa o `tsc` limpo de novo. Faça tudo e só então rode os gates + commit.

### Task 2.1: `atendimentos.ts` — agendar com tipo/bloqueio, filtros, concluirProva, listarProvasAbertas

**Files:** Modify `src/lib/atendimentos/atendimentos.ts`

- [ ] **Step 1: Importar tipos e o enum em runtime**

No topo, trocar o import de tipos por (inclui `AtendimentoTipo`):

```typescript
import type { AtendimentoSituacao, AtendimentoDesfecho, AtendimentoTipo } from "@/generated/prisma/client";
```

- [ ] **Step 2: Estender `ResultadoAgendar`** (linha ~49) com os motivos de prova:

```typescript
export type ResultadoAgendar =
  | { ok: true; atendimentoId: string }
  | { ok: false; motivo: "lead_invalido" | "cabine_invalida" | "vendedora_invalida" | "sem_horario" | "fora_funcionamento" | "indisponivel" | "tipo_invalido" | "reserva_invalida" | "reserva_nao_e_da_noiva" };
```

- [ ] **Step 3: Reescrever `agendarAtendimento`** (linhas ~53-82) — aceitar `tipo`/`bloqueioId`, validar prova:

```typescript
const TIPOS_AGENDAMENTO = new Set<AtendimentoTipo>(["ATENDIMENTO", "PROVA"]);

export async function agendarAtendimento(
  lojaId: string,
  input: {
    leadId: string;
    cabineId: string;
    vendedoraId: string;
    dataYMD: string;
    hora: number;
    observacao?: string | null;
    tipo?: AtendimentoTipo;
    bloqueioId?: string | null;
  },
): Promise<ResultadoAgendar> {
  const { leadId, cabineId, vendedoraId, dataYMD, hora, observacao } = input;
  const tipo: AtendimentoTipo = input.tipo ?? "ATENDIMENTO";
  if (!TIPOS_AGENDAMENTO.has(tipo)) return { ok: false, motivo: "tipo_invalido" };
  if (!dataYMD || !Number.isInteger(hora)) return { ok: false, motivo: "sem_horario" };

  const db = tenantPrisma(prisma, lojaId);
  const [lead, cab, vinc, { abertura, fechamento }] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    db.cabine.findUnique({ where: { id: cabineId }, select: { ativo: true } }),
    prisma.usuarioLoja.findUnique({ where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } }, select: { usuarioId: true } }),
    obterHorarioLoja(lojaId),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!cab || !cab.ativo) return { ok: false, motivo: "cabine_invalida" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };
  if (hora < abertura || hora >= fechamento) return { ok: false, motivo: "fora_funcionamento" };

  // Prova exige uma reserva de casamento da própria noiva.
  let bloqueioId: string | null = null;
  if (tipo === "PROVA") {
    if (!input.bloqueioId) return { ok: false, motivo: "reserva_invalida" };
    const reserva = await db.bloqueioVestido.findUnique({
      where: { id: input.bloqueioId },
      select: { tipo: true, leadId: true },
    });
    if (!reserva || reserva.tipo !== "RESERVA_CASAMENTO") return { ok: false, motivo: "reserva_invalida" };
    if (reserva.leadId !== leadId) return { ok: false, motivo: "reserva_nao_e_da_noiva" };
    bloqueioId = input.bloqueioId;
  }

  const ocupadas = await horasOcupadas(lojaId, dataYMD, cabineId, vendedoraId);
  if (ocupadas.includes(hora)) return { ok: false, motivo: "indisponivel" };

  const obs = observacao?.trim();
  const criado = await db.atendimento.create({
    data: { leadId, cabineId, vendedoraId, tipo, bloqueioId, inicio: instante(dataYMD, hora), observacao: obs ? obs : null } as never,
  });
  return { ok: true, atendimentoId: criado.id };
}
```

- [ ] **Step 4: Filtrar a fila/próximos por `tipo:"ATENDIMENTO"`** — em `listarProximosAtendimentos` (where vira `{ inicio: { gte: hojeUTC() }, tipo: "ATENDIMENTO" }`) e em `listarAtendimentos` (where vira `{ situacao: { in: ... }, tipo: "ATENDIMENTO" }`).

- [ ] **Step 5: Adicionar `concluirProva` e estender `ResultadoSituacao`** (perto de `concluirAtendimento`):

```typescript
export type ResultadoSituacao =
  | { ok: true }
  | { ok: false; motivo: "atendimento_invalido" | "transicao_invalida" | "desfecho_invalido" | "nao_e_prova" };

/** Conclui uma PROVA (sem desfecho). AGENDADO|EM_ATENDIMENTO → CONCLUIDO. */
export async function concluirProva(lojaId: string, id: string): Promise<ResultadoSituacao> {
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true, tipo: true, atendidoEm: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.tipo !== "PROVA") return { ok: false, motivo: "nao_e_prova" };
  if (at.situacao !== "AGENDADO" && at.situacao !== "EM_ATENDIMENTO") return { ok: false, motivo: "transicao_invalida" };
  await db.atendimento.update({ where: { id }, data: { situacao: "CONCLUIDO", atendidoEm: at.atendidoEm ?? new Date() } });
  return { ok: true };
}
```

- [ ] **Step 6: Adicionar `listarProvasAbertas`** (provas em aberto, para a aba acionável) ao fim do arquivo:

```typescript
export type ProvaAberta = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  leadId: string;
  noivaNome: string | null;
  cabineNome: string | null;
  vendedoraNome: string | null;
  bloqueioId: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
  casamentoData: Date | null;
  ajustes: { id: string; descricao: string; status: import("@/generated/prisma/client").AjusteStatus; checklistFeitos: number; checklistTotal: number }[];
};

/** Provas ABERTAS (AGENDADO/EM_ATENDIMENTO) da loja, por horário — a fila de trabalho da aba Provas & ajustes. */
export async function listarProvasAbertas(lojaId: string): Promise<ProvaAberta[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "PROVA", situacao: { in: ["AGENDADO", "EM_ATENDIMENTO"] } },
    orderBy: { inicio: "asc" },
    include: {
      lead: { select: { noivaNome: true } },
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
      bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      ajustes: { orderBy: { createdAt: "asc" }, include: { checklist: { select: { feito: true } } } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    leadId: a.leadId,
    noivaNome: a.lead?.noivaNome ?? null,
    cabineNome: a.cabine?.nome ?? null,
    vendedoraNome: a.vendedora?.nome ?? null,
    bloqueioId: a.bloqueioId,
    vestidoCodigo: a.bloqueio?.vestido.codigo ?? null,
    vestidoNome: a.bloqueio?.vestido.nome ?? null,
    casamentoData: a.bloqueio?.casamentoData ?? null,
    ajustes: a.ajustes.map((aj) => ({
      id: aj.id,
      descricao: aj.descricao,
      status: aj.status,
      checklistFeitos: aj.checklist.filter((c) => c.feito).length,
      checklistTotal: aj.checklist.length,
    })),
  }));
}
```

### Task 2.2: `provas.ts` — só leituras, sobre Atendimento{tipo:PROVA}

**Files:** Modify `src/lib/atelier/provas.ts` (reescrita completa)

- [ ] **Step 1: Substituir o arquivo inteiro por:**

```typescript
// src/lib/atelier/provas.ts
// Leituras de PROVA. Prova é um Atendimento{tipo:PROVA} preso a uma reserva
// (bloqueioId). Agendamento e ciclo vivem em @/lib/atendimentos/atendimentos.
// Aqui só leitura, para a tela de Reservas e a página /provas.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { paginar } from "@/lib/paginacao";
import type { AtendimentoSituacao, AjusteStatus } from "@/generated/prisma/client";

export type AjusteDaProva = {
  id: string;
  descricao: string;
  status: AjusteStatus;
  checklist: { id: string; descricao: string; feito: boolean; ordem: number }[];
};

export type ProvaDaReserva = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  observacao: string | null;
  cabineNome: string | null;
  vendedoraNome: string | null;
  ajustes: AjusteDaProva[];
};

/** Provas de uma reserva (mais antiga → recente), com ajustes e checklist. */
export async function listarProvasDaReserva(lojaId: string, bloqueioId: string): Promise<ProvaDaReserva[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "PROVA", bloqueioId },
    orderBy: { inicio: "asc" },
    include: {
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
      ajustes: { orderBy: { createdAt: "asc" }, include: { checklist: { orderBy: { ordem: "asc" } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    situacao: p.situacao,
    observacao: p.observacao,
    cabineNome: p.cabine?.nome ?? null,
    vendedoraNome: p.vendedora?.nome ?? null,
    ajustes: p.ajustes.map((a) => ({
      id: a.id,
      descricao: a.descricao,
      status: a.status,
      checklist: a.checklist.map((c) => ({ id: c.id, descricao: c.descricao, feito: c.feito, ordem: c.ordem })),
    })),
  }));
}

export type ProvaDaLoja = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  bloqueioId: string | null;
  leadId: string;
  noivaNome: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
  casamentoData: Date | null;
};

/** Agenda de provas da loja. Padrão: futuras (inicio ≥ hoje, asc); `passadas` = histórico
 *  (desc); `intervalo` (gte/lt) tem precedência e filtra inicio na janela, asc. */
export async function listarProvasDaLoja(
  lojaId: string,
  opts: { passadas?: boolean; pagina?: number | string; tamanho?: number; intervalo?: { gte: Date; lt: Date } } = {},
): Promise<{ itens: ProvaDaLoja[]; total: number }> {
  const inicioFiltro = opts.intervalo
    ? { gte: opts.intervalo.gte, lt: opts.intervalo.lt }
    : opts.passadas
      ? { lt: hojeUTC() }
      : { gte: hojeUTC() };
  const where = { tipo: "PROVA" as const, inicio: inicioFiltro };
  const ascendente = opts.intervalo ? true : !opts.passadas;
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const db = tenantPrisma(prisma, lojaId);
  const [rows, total] = await Promise.all([
    db.atendimento.findMany({
      where,
      orderBy: { inicio: ascendente ? "asc" : "desc" },
      skip,
      take,
      include: {
        lead: { select: { noivaNome: true } },
        bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      },
    }),
    db.atendimento.count({ where }),
  ]);
  const itens = rows.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    situacao: p.situacao,
    bloqueioId: p.bloqueioId,
    leadId: p.leadId,
    noivaNome: p.lead?.noivaNome ?? null,
    vestidoCodigo: p.bloqueio?.vestido.codigo ?? null,
    vestidoNome: p.bloqueio?.vestido.nome ?? null,
    casamentoData: p.bloqueio?.casamentoData ?? null,
  }));
  return { itens, total };
}
```

### Task 2.3: `ajustes.ts` — atendimentoId no lugar de provaId

**Files:** Modify `src/lib/atelier/ajustes.ts`

- [ ] **Step 1: `adicionarAjuste`** (linhas ~24-41) — validar o atendimento (tipo PROVA) em vez da prova:

```typescript
/** Adiciona um ajuste a uma PROVA (Atendimento{tipo:PROVA}) da loja. */
export async function adicionarAjuste(
  lojaId: string,
  input: { atendimentoId: string; descricao: string },
): Promise<ResultadoAjuste> {
  const descricao = input.descricao?.trim();
  if (!descricao) return { ok: false, motivo: "sem_descricao" };

  const db = tenantPrisma(prisma, lojaId);
  const prova = await db.atendimento.findUnique({ where: { id: input.atendimentoId }, select: { tipo: true } });
  if (!prova || prova.tipo !== "PROVA") return { ok: false, motivo: "prova_invalida" };

  const criado = await db.ajuste.create({
    data: { atendimentoId: input.atendimentoId, descricao } as never,
  });
  return { ok: true, ajusteId: criado.id };
}
```

(O `ResultadoAjuste` mantém o motivo `"prova_invalida"` — semântica "prova inválida".)

- [ ] **Step 2: `AjustePendente`** (linhas ~119-134) — trocar `provaDataReal` por `provaInicio` e `bloqueioId` aceitar string:

```typescript
export type AjustePendente = {
  id: string;
  descricao: string;
  provaInicio: Date;
  noivaNome: string | null;
  leadId: string | null;
  bloqueioId: string | null;
  vestidoId: string;
  vestidoCodigo: string;
  vestidoNome: string;
  casamentoData: Date | null;
  checklistFeitos: number;
  checklistTotal: number;
};
```

- [ ] **Step 3: `listarAjustesPendentes`** (linhas ~144-201) — trocar todos os `prova` por `atendimento` no where/orderBy/include/map:

```typescript
export async function listarAjustesPendentes(
  lojaId: string,
  opts: { pagina?: number | string; tamanho?: number; intervalo?: { gte: Date; lt: Date } } = {},
): Promise<{ itens: AjustePendente[]; total: number }> {
  const db = tenantPrisma(prisma, lojaId);
  const where = opts.intervalo
    ? { status: "PENDENTE" as const, atendimento: { bloqueio: { casamentoData: { gte: opts.intervalo.gte, lt: opts.intervalo.lt } } } }
    : { status: "PENDENTE" as const };
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const [total, rows] = await Promise.all([
    db.ajuste.count({ where }),
    db.ajuste.findMany({
      where,
      orderBy: [
        { atendimento: { bloqueio: { casamentoData: { sort: "asc", nulls: "last" } } } },
        { id: "asc" },
      ],
      skip,
      take,
      include: {
        checklist: { select: { feito: true } },
        atendimento: {
          include: {
            bloqueio: {
              include: {
                lead: { select: { id: true, noivaNome: true } },
                vestido: { select: { id: true, codigo: true, nome: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const itens: AjustePendente[] = rows.map((a) => ({
    id: a.id,
    descricao: a.descricao,
    provaInicio: a.atendimento.inicio,
    noivaNome: a.atendimento.bloqueio?.lead?.noivaNome ?? null,
    leadId: a.atendimento.bloqueio?.leadId ?? null,
    bloqueioId: a.atendimento.bloqueioId,
    vestidoId: a.atendimento.bloqueio?.vestido.id ?? "",
    vestidoCodigo: a.atendimento.bloqueio?.vestido.codigo ?? "",
    vestidoNome: a.atendimento.bloqueio?.vestido.nome ?? "",
    casamentoData: a.atendimento.bloqueio?.casamentoData ?? null,
    checklistFeitos: a.checklist.filter((c) => c.feito).length,
    checklistTotal: a.checklist.length,
  }));
  return { itens, total };
}
```

- [ ] **Step 4: Atualizar o header-comment** do arquivo (linha 3): "nascem de uma Prova" → "nascem de uma prova (Atendimento{tipo:PROVA})".

### Task 2.4: `calendario/dados.ts` — marcador de prova

**Files:** Modify `src/lib/calendario/dados.ts`

- [ ] **Step 1:** Na `Promise.all` (linhas ~19-32), trocar a query de `db.prova` por:

```typescript
    db.atendimento.findMany({
      where: { tipo: "PROVA", inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
```

- [ ] **Step 2:** No loop (linha ~38), trocar para:

```typescript
  for (const p of provas) marcadores.push({ ymd: ymd(p.inicio)!, tipo: "prova" });
```

(Variável `provas` continua sendo o 2º item do destructuring; renomeie se quiser, mas não é obrigatório.)

### Task 2.5: Reescrever os testes do atelier

**Files:** Modify `src/lib/atelier/__tests__/atelier.test.ts`

- [ ] **Step 1: Ler o arquivo atual inteiro** para preservar setup (loja/cabine/vendedora/lead) e estilo.

Run: `sed -n '1,60p' src/lib/atelier/__tests__/atelier.test.ts`

- [ ] **Step 2: Substituir as chamadas a `registrarProva` por `agendarAtendimento(...tipo:"PROVA", bloqueioId...)`** e `Prova` por `Atendimento{tipo:PROVA}`. O setup precisa de cabine + vendedora (membro da loja). Exemplo de helper de prova (usar dentro dos testes):

```typescript
import { agendarAtendimento, concluirProva, listarProvasAbertas } from "@/lib/atendimentos/atendimentos";
// ... setup: criar cabine ativa + garantir vendedora = membro (usuarioLoja).

async function agendarProva(bloqueioId: string, leadId: string, dataYMD: string, hora: number) {
  const r = await agendarAtendimento(loja, { leadId, cabineId: cabine, vendedoraId: vendedora, dataYMD, hora, tipo: "PROVA", bloqueioId });
  if (!r.ok) throw new Error(`agendar prova falhou: ${r.motivo}`);
  return r.atendimentoId;
}
```

- [ ] **Step 3: Reescrever os casos** cobrindo:
  - agendar prova exige reserva da própria noiva (motivos `reserva_invalida`, `reserva_nao_e_da_noiva`);
  - `adicionarAjuste({ atendimentoId })` recusa atendimento que não é prova (`prova_invalida`);
  - ciclo: agendar prova → `iniciarAtendimento` → `adicionarAjuste` → `concluirProva` → some de `listarProvasAbertas`;
  - `listarAjustesPendentes` ordena por casamento via `atendimento→bloqueio`;
  - isolamento de loja preservado.
  (Escrever os `it(...)` com asserts concretos no padrão do arquivo atual.)

- [ ] **Step 4: Atualizar imports** — remover `registrarProva`/`editarProva`/`removerProva`/`listarProvasDaReserva` se não usados; `adicionarAjuste` agora recebe `{ atendimentoId }`.

### Task 2.6: Atualizar os outros testes que criam Prova

**Files:** Modify `src/lib/calendario/__tests__/dados.test.ts`, `src/lib/loja/__tests__/painel.test.ts`, `src/lib/__tests__/tenant.test.ts`

- [ ] **Step 1: Localizar** as criações de prova:

Run: `grep -nE "\.prova\.|registrarProva|Prova" src/lib/calendario/__tests__/dados.test.ts src/lib/loja/__tests__/painel.test.ts src/lib/__tests__/tenant.test.ts`

- [ ] **Step 2:** Em cada ocorrência, trocar `db.prova.create({ data: { bloqueioId, dataReal, tipo, ... } })` por `db.atendimento.create({ data: { leadId, cabineId, vendedoraId, tipo: "PROVA", bloqueioId, inicio } })` (criar cabine/vendedora no setup se faltar) e ajustar asserts (marcador "prova" continua vindo de `dados.ts`; `tenant.test.ts` valida escopo — trocar o model `prova` por `atendimento`/`ajuste`).

### Task 2.7: Gates + commit da Slice 1+2

- [ ] **Step 1: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v zzprobe`
Expected: vazio.

- [ ] **Step 2: testes**

Run: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma src/generated/prisma src/lib/atendimentos/atendimentos.ts src/lib/atelier/provas.ts src/lib/atelier/ajustes.ts src/lib/calendario/dados.ts src/lib/atelier/__tests__/atelier.test.ts src/lib/calendario/__tests__/dados.test.ts src/lib/loja/__tests__/painel.test.ts src/lib/__tests__/tenant.test.ts prisma/migrations
git commit -m "feat(atendimento): funde Prova em Atendimento (tipo + bloqueioId, ajuste→atendimentoId)"
```

---

## SLICE 3 — Agendar com Tipo + picker de reserva

### Task 3.1: Listar reservas de casamento de uma noiva (para o picker)

**Files:** Modify `src/lib/disponibilidade/reservas.ts` (ou onde ficam leituras de reserva — confirmar) — adicionar leitura simples.

- [ ] **Step 1: Localizar** um módulo de leitura de reservas por loja.

Run: `grep -rln "RESERVA_CASAMENTO" src/lib | head`

- [ ] **Step 2: Adicionar** uma função (no módulo adequado, ex.: `src/lib/disponibilidade/reservas.ts`):

```typescript
export type ReservaDaNoiva = { id: string; vestidoCodigo: string; vestidoNome: string; casamentoData: Date | null };

/** Reservas de casamento de uma noiva (para escolher em qual o agendamento de prova entra). */
export async function listarReservasDaNoiva(lojaId: string, leadId: string): Promise<ReservaDaNoiva[]> {
  const rows = await tenantPrisma(prisma, lojaId).bloqueioVestido.findMany({
    where: { tipo: "RESERVA_CASAMENTO", leadId },
    orderBy: { casamentoData: "asc" },
    include: { vestido: { select: { codigo: true, nome: true } } },
  });
  return rows.map((b) => ({ id: b.id, vestidoCodigo: b.vestido.codigo, vestidoNome: b.vestido.nome, casamentoData: b.casamentoData }));
}
```

(Confirmar imports `prisma`/`tenantPrisma` já presentes no arquivo.)

### Task 3.2: Action de grade/agendar com tipo + reservas

**Files:** Modify `src/app/(app)/loja/[lojaId]/atendimentos/novo/actions.ts`

- [ ] **Step 1:** Importar `AtendimentoTipo` e `listarReservasDaNoiva`; adicionar uma RPC `reservasDaNoivaAction(leadId)` que devolve `ReservaDaNoiva[]` (mesmo padrão de `gradeDoDiaAction`, gate `leads`/`ver`).

- [ ] **Step 2:** Em `agendarAtendimentoAction`, repassar `tipo` e `bloqueioId`:

```typescript
  const r = await agendarAtendimento(sc.loja.id, {
    leadId: String(formData.get("leadId") ?? ""),
    cabineId: String(formData.get("cabineId") ?? ""),
    vendedoraId: String(formData.get("vendedoraId") ?? ""),
    dataYMD: String(formData.get("data") ?? ""),
    hora: Number(formData.get("hora")),
    observacao: String(formData.get("observacao") ?? ""),
    tipo: (String(formData.get("tipo") ?? "ATENDIMENTO")) as AtendimentoTipo,
    bloqueioId: String(formData.get("bloqueioId") ?? "") || null,
  });
```

- [ ] **Step 3:** Adicionar mensagens em `MOTIVOS`: `tipo_invalido`, `reserva_invalida: "Escolha a reserva/vestido da noiva."`, `reserva_nao_e_da_noiva: "Essa reserva não é da noiva escolhida."`. Redirecionar com `?ok=1` mantendo (a tela já mostra aviso).

### Task 3.3: Form com seletor Tipo + reserva condicional

**Files:** Modify `src/app/(app)/loja/[lojaId]/atendimentos/novo/agendar-form.tsx`, `.../novo/page.tsx`

- [ ] **Step 1: page.tsx** — o `AgendarForm` não precisa receber reservas de antemão (carrega via RPC ao escolher a noiva). Sem mudança de dados obrigatória além de manter `noivas`. (Opcional: aceitar `tipoInicial`/`bloqueioInicial` via searchParams para o atalho da reserva — ver Slice 5.)

- [ ] **Step 2: agendar-form.tsx** — adicionar estado `tipo` e (quando PROVA) carregar/escolher a reserva:

```typescript
// novos imports
import { reservasDaNoivaAction } from "./actions";
type Reserva = { id: string; vestidoCodigo: string; vestidoNome: string; casamentoData: string | null };

// dentro do componente:
const [tipo, setTipo] = useState<"ATENDIMENTO" | "PROVA">("ATENDIMENTO");
const [bloqueioId, setBloqueioId] = useState("");
const [reservas, setReservas] = useState<Reserva[] | null>(null);
const [carregReservas, startReservas] = useTransition();

useEffect(() => {
  if (tipo !== "PROVA" || !leadId) { setReservas(null); setBloqueioId(""); return; }
  let ativo = true;
  startReservas(async () => {
    const rs = await reservasDaNoivaAction(leadId);
    if (ativo) { setReservas(rs); setBloqueioId(""); }
  });
  return () => { ativo = false; };
}, [tipo, leadId]);
```

Adicionar no JSX: hidden inputs `tipo` e `bloqueioId`; um seletor de Tipo (dois botões/segmented ou `<select>`), e — quando `tipo === "PROVA"` — um `<select>` de reserva populado por `reservas` (label vestido + casamento). O botão de submit deve exigir `bloqueioId` quando `tipo==="PROVA"` (`disabled` se prova sem reserva). Trocar o rótulo do submit para "Agendar" (serve aos dois). Reaproveitar a classe `campo`.

(A action de grade `gradeDoDiaAction` e a lógica de slots permanecem idênticas — a grade é a mesma para os dois tipos.)

- [ ] **Step 3: Gates + verificação manual**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v zzprobe` → vazio.
Verificação: subir o dev (`npm run dev:warm -- -p 5000`), abrir `/loja/<id>/atendimentos/novo`, escolher Tipo=Prova → aparece o select de reserva; agendar grava `Atendimento{tipo:PROVA}` (conferir que some da fila `/atendimentos` e aparece na aba Provas & ajustes na próxima slice).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/novo" src/lib/disponibilidade/reservas.ts
git commit -m "feat(agendar): seletor Tipo (atendimento|prova) + picker de reserva, mesma grade"
```

---

## SLICE 4 — Aba Provas & ajustes acionável

### Task 4.1: Actions da prova na aba (iniciar/falta/concluir/ajustes)

**Files:** Create `src/app/(app)/loja/[lojaId]/calendario/actions.ts`

- [ ] **Step 1: Criar** o arquivo com as actions (padrão `acaoAutorizada`), redirecionando de volta para a aba (`?aba=provas-ajustes`):

```typescript
"use server";
import { redirect } from "next/navigation";
import { iniciarAtendimento, marcarFalta, concluirProva } from "@/lib/atendimentos/atendimentos";
import { adicionarAjuste, alternarStatusAjuste, adicionarItemChecklist, alternarItemChecklist } from "@/lib/atelier/ajustes";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

const baseAba = (lojaId: string) => `/loja/${lojaId}/calendario?aba=provas-ajustes`;

export const iniciarProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await iniciarAtendimento(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "iniciado" : r.motivo));
});
export const faltaProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await marcarFalta(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "falta" : r.motivo));
});
export const concluirProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await concluirProva(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "concluido" : r.motivo));
});
export const adicionarAjusteProvaAction = acaoAutorizada("ajustes", "criar", async (sc, fd) => {
  const r = await adicionarAjuste(sc.loja.id, { atendimentoId: str(fd, "id"), descricao: str(fd, "descricao") });
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});
export const alternarAjusteProvaAction = acaoAutorizada("ajustes", "editar", async (sc, fd) => {
  const r = await alternarStatusAjuste(sc.loja.id, str(fd, "ajusteId"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});
```

(Checklist na aba é opcional nesta slice — o cadastro de ajuste já cobre o pedido do dono; itens de checklist seguem disponíveis na fila /ajustes.)

### Task 4.2: AbaProvasAjustes — provas abertas acionáveis (sempre visíveis) + ajustes filtrados

**Files:** Modify `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`

- [ ] **Step 1:** Trocar a fonte das provas: usar `listarProvasAbertas(lojaId)` (sem período) em vez de `listarProvasDaLoja(...intervalo)`. Manter `listarAjustesPendentes(...intervalo)` para os ajustes (filtro De/Até segue só para eles). Remover `ROTULO_TIPO_PROVA` (não há mais tipo). A seção de provas vira "Provas abertas" com cards por situação:
  - `AGENDADO`: botões **Iniciar atendimento** (`iniciarProvaAction`) e **Marcou falta** (`faltaProvaAction`).
  - `EM_ATENDIMENTO`: form **adicionar ajuste** (`adicionarAjusteProvaAction`, input `descricao` + hidden `id`), lista de ajustes já pedidos (com toggle `alternarAjusteProvaAction`), e botão **Concluir prova** (`concluirProvaAction`).
  - (Concluídas não aparecem aqui.)
  Reaproveitar `fmtDia`, o estilo de lista/cards existente e `botaoSuave`/`botaoPrincipal`. Cada `<form action={...}>` leva hidden `id` = `prova.id` (e `ajusteId`/`descricao` conforme o caso).

- [ ] **Step 2:** Atualizar o header-comment do arquivo (não é mais "só leitura").

- [ ] **Step 3: Gates + verificação**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v zzprobe` → vazio.
Verificação manual: agendar uma prova (Slice 3) → aparece em "Provas abertas"; Iniciar → aparece o editor de ajustes; adicionar ajuste; Concluir prova → some das abertas; o ajuste aparece em "Ajustes pendentes".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/calendario/actions.ts" "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx"
git commit -m "feat(provas&ajustes): provas abertas acionáveis (iniciar→ajustes→concluir)"
```

---

## SLICE 5 — Reservas (remove form, mantém leitura) + /provas + atalhos

### Task 5.1: Reservas — remover criação/edição de prova, manter leitura

**Files:** Modify `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx` e `.../actions.ts`

- [ ] **Step 1: Ler a página inteira** (550 linhas) para mapear os blocos a remover.

Run: `sed -n '1,80p' "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx"` (e seguir lendo em blocos).

- [ ] **Step 2: actions.ts** — remover `registrarProvaAction`, `editarProvaAction`, `removerProvaAction` e o import de `registrarProva/editarProva/removerProva` (não existem mais). **Manter** as actions de ajuste/checklist, mas repontar `adicionarAjusteAction` para usar `atendimentoId` (o form passa `id` da prova). As actions de movimentação ficam intactas.

- [ ] **Step 3: page.tsx** — remover: imports `ProvaTipo`/`ProvaComparecimento`, `ROTULO_TIPO`/`ROTULO_COMPARECIMENTO`/`TIPOS`/`COMPARECIMENTOS`, o form "Registrar prova" (bloco ~492-549), o form "Editar prova" (~304-352) e o "Remover prova" (~473-490). **Manter** a listagem de provas como leitura: mostrar `situacao` (rótulo via um pequeno `Record<AtendimentoSituacao,string>`), `inicio` (data/hora), cabine/vendedora e os ajustes (leitura + toggle, se mantido). Substituir `p.tipo`/`p.comparecimento`/`p.dataReal` por `p.situacao`/`p.inicio`. Adicionar atalho **"Agendar prova"** → `/loja/${lojaId}/atendimentos/novo?noiva=${leadId}&tipo=PROVA&reserva=${bloqueioId}` (link `botaoSuave`).

- [ ] **Step 4 (opcional, casa com o atalho): novo/page.tsx + agendar-form.tsx** — ler `searchParams.tipo`/`reserva` e passar como `tipoInicial`/`bloqueioInicial` ao form (pré-seleciona). Se preferir simplicidade, o atalho só pré-seleciona a noiva (`?noiva=`) e o usuário escolhe Tipo=Prova + reserva manualmente — decisão do implementador, sem placeholder: implementar uma das duas.

- [ ] **Step 5: Atualizar `AVISOS`** da página de reservas — remover chaves de prova que saíram (`prova`, `prova_removida`, `tipo_invalido`, `comparecimento_invalido`, `sem_data`, `data_invalida`, `prova_invalida` se não usados); manter as de ajuste/checklist/movimentação.

### Task 5.2: /provas — adaptar aos novos campos

**Files:** Modify `src/app/(app)/loja/[lojaId]/provas/page.tsx`

- [ ] **Step 1:** Remover imports `ProvaTipo`/`ProvaComparecimento` e os `Record` `ROTULO_TIPO`/`ROTULO_COMPARECIMENTO`. Trocar `p.dataReal`→`p.inicio` (em `agruparPorMes`, no render do dia e na ordenação) e `p.tipo`/`p.comparecimento` por `p.situacao` (rótulo via `Record<AtendimentoSituacao,string>`). `p.bloqueioId` pode ser null → o link "Abrir reserva" só quando presente.

### Task 5.3: Gates + commit

- [ ] **Step 1: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v zzprobe` → vazio.

- [ ] **Step 2: testes** → `npx vitest run` verde.

- [ ] **Step 3: Verificação manual** — abrir uma reserva: sem form de prova, com leitura + atalho "Agendar prova"; `/provas` lista provas com situação.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]" "src/app/(app)/loja/[lojaId]/provas/page.tsx" "src/app/(app)/loja/[lojaId]/atendimentos/novo"
git commit -m "feat(reservas): remove form de prova (leitura + atalho Agendar); /provas usa situacao"
```

---

## SLICE 6 — Seeds + varredura final

### Task 6.1: Seeds criam prova como Atendimento{tipo:PROVA}

**Files:** Modify `prisma/seed.ts`, `prisma/seed-demo.ts`

- [ ] **Step 1: Localizar** a criação de prova/ajuste:

Run: `grep -nE "prova|Prova|ajuste|Ajuste" prisma/seed.ts prisma/seed-demo.ts`

- [ ] **Step 2:** Trocar `prisma.prova.create / .ajuste.create({provaId})` por `atendimento.create({ tipo:"PROVA", bloqueioId, leadId, cabineId, vendedoraId, inicio })` e `ajuste.create({ atendimentoId })`. Garantir que o seed cria ao menos uma cabine + vendedora para servir de slot.

- [ ] **Step 3: Rodar o seed** (se houver script): `npm run db:seed` (e `db:seed:demo`) — Expected: sem erro.

### Task 6.2: Varredura final — nenhuma referência órfã ao modelo Prova

- [ ] **Step 1:**

Run: `grep -rnE "\.prova\.|ProvaTipo|ProvaComparecimento|registrarProva|editarProva|removerProva|provaId|provaDataReal" src/ prisma/ | grep -v "src/generated/prisma" | grep -v "provaDataReal"`
Expected: vazio. (`BloqueioVestido.provaDataReal` e os arquivos `src/generated/prisma/*` são esperados/ignorados; o `generate` já recriou o client sem o model Prova.)

- [ ] **Step 2: Gates finais** → `tsc` limpo + `npx vitest run` verde.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts prisma/seed-demo.ts
git commit -m "chore(seed): provas como atendimento tipo=PROVA"
```

---

## Self-review (cobertura do spec)

- §3 modelo de dados → Slice 1. §4 camada de dados → Slice 2. §5 Agendar → Slice 3. §6 aba acionável → Slice 4. §7 Reservas/fila/provas → Slices 4-5 (fila filtrada na 2.1). §9 testes → 2.5/2.6 + verificações manuais. Seeds → Slice 6.
- Decisão §9 (provas abertas sempre visíveis; período só nos ajustes) → Task 4.2.
- Decisão §10 (prova sem desfecho) → `concluirProva` (Task 2.1).
- `desfecho`/orçamento seguem só de atendimento (Task 2.1 filtra fila por tipo; `concluirAtendimento` inalterado).

## Riscos
- `AjustePendente.provaDataReal`→`provaInicio`: conferir consumidores (`/ajustes/page.tsx`, `/ajustes/actions.ts`) — atualizar se usarem o nome antigo (Task 2.3 muda o tipo; o `tsc` acusa).
- Migração descarta provas/ajustes reais — confirmado com o dono (sistema em testes).
- Não tocar `BloqueioVestido.provaDataReal` nem `src/lib/disponibilidade/*` (motor).
