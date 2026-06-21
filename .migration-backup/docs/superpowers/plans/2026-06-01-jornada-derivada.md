# Jornada da noiva — derivada dos fatos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a etapa da jornada (hoje guardada e congelada em "Novo") por uma etapa **derivada dos fatos**, com marcos manuais para Orçamento/Contrato/Perdida, refletida no perfil da noiva, na lista, no livro de reservas e no dashboard.

**Architecture:** Função pura `estagioDaNoiva(fatos)` calcula o estágio a partir de fatos (prova agendada/realizada, interesse, retirada, casamento, devolução) + 3 marcos manuais novos em `Lead`. Carregadores montam os fatos via `tenantPrisma`. A coluna `Lead.etapa` fica deprecada.

**Tech Stack:** Next 16 (App Router, Server Actions, `force-dynamic`), React 19, Prisma 7 (client em `src/generated/prisma`), Postgres, Vitest, Tailwind v4. Comandos: testes `node node_modules/vitest/vitest.mjs run [path]`; tsc `node node_modules/typescript/bin/tsc --noEmit`; eslint `node node_modules/eslint/bin/eslint.js <arquivo>`; prisma `node node_modules/prisma/build/index.js <cmd>`; tsx `node node_modules/tsx/dist/cli.mjs <script>`.

Spec: `docs/superpowers/specs/2026-06-01-jornada-derivada-design.md`. Branch: `feat/jornada-derivada`.

---

## File Structure

- **Create** `src/lib/leads/jornada.ts` — função pura + tipos (sem Prisma): `ESTAGIOS`, `EstagioChave`, `ROTULO_ESTAGIO`, `FatosJornada`, `PassoJornada`, `estagioDaNoiva`, `noivaAtiva`.
- **Create** `src/lib/leads/__tests__/jornada.test.ts` — testes puros.
- **Modify** `prisma/schema.prisma` — 3 campos em `Lead` (+ migration).
- **Modify** `src/lib/leads/leads.ts` — carregadores de fatos (`fatosDaNoiva`, `estagiosDasNoivas`), `definirMarcoJornada`; remover ao fim o `jornadaDaNoiva`/`PassoJornada`/`JORNADA_NOIVA` antigos.
- **Modify** `src/lib/leads/__tests__/leads.test.ts` — testes dos carregadores/marcos.
- **Create** `src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts` — 3 Server Actions de marco.
- **Modify** `noivas/[leadId]/page.tsx`, `noivas/page.tsx`, `reservas/page.tsx`, `painel-jornada-noiva.tsx`, `painel-jornada.tsx`, `painel-atencoes` (tipo), `src/lib/loja/painel.ts`, `src/lib/disponibilidade/reservas.ts` — consumidores.

---

## Task 1: Schema — marcos manuais no Lead

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<gerada>/migration.sql` (via CLI)

- [ ] **Step 1: Adicionar os campos ao model `Lead`**

No `model Lead`, logo após `casamentoLocal     String?` (antes de `origem`), adicionar:

```prisma
  // Marcos manuais da jornada derivada (etapas sem dado próprio no sistema).
  // Provisório: a fatia de Orçamento (entidade + histórico) substituirá os 2
  // primeiros por derivação. Decisão: docs/superpowers/specs/2026-06-01-jornada-derivada-design.md
  orcamentoAbertoEm DateTime?
  contratoFechadoEm DateTime?
  perdidaEm         DateTime?
```

- [ ] **Step 2: Gerar e aplicar a migration**

Run: `node node_modules/prisma/build/index.js migrate dev --name lead_marcos_jornada`
Expected: cria e aplica a migration; "Your database is now in sync".

- [ ] **Step 3: Regenerar o client (output custom)**

Run: `node node_modules/prisma/build/index.js generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Verificar que nada quebrou**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.
Run: `node node_modules/vitest/vitest.mjs run src/lib/leads src/lib/__tests__/tenant.test.ts`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(jornada): campos de marco manual no Lead (orçamento/contrato/perdida)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Função pura `estagioDaNoiva` + tipos

**Files:**
- Create: `src/lib/leads/jornada.ts`
- Test: `src/lib/leads/__tests__/jornada.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/leads/__tests__/jornada.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estagioDaNoiva, noivaAtiva, type FatosJornada } from "@/lib/leads/jornada";

const ZERO: FatosJornada = {
  temProvaAgendada: false, temInteresse: false, orcamentoAbertoEm: null,
  contratoFechadoEm: null, temProvaRealizada: false, temRetirada: false,
  casamentoPassou: false, temDevolucao: false, perdidaEm: null,
};
const d = new Date("2026-06-01T00:00:00.000Z");

describe("estagioDaNoiva — maior índice satisfeito", () => {
  it("só cadastrada", () => {
    const r = estagioDaNoiva(ZERO);
    expect(r.atual).toBe("cadastrada");
    expect(r.encerrada).toBeNull();
    expect(r.passos[0].estado).toBe("atual");
    expect(r.passos[1].estado).toBe("futuro");
  });
  it("prova agendada → prova_marcada", () => {
    expect(estagioDaNoiva({ ...ZERO, temProvaAgendada: true }).atual).toBe("prova_marcada");
  });
  it("interesse → interesses", () => {
    expect(estagioDaNoiva({ ...ZERO, temInteresse: true }).atual).toBe("interesses");
  });
  it("orçamento aberto → orcamento_aberto", () => {
    expect(estagioDaNoiva({ ...ZERO, orcamentoAbertoEm: d }).atual).toBe("orcamento_aberto");
  });
  it("contrato fechado → contrato_fechado", () => {
    expect(estagioDaNoiva({ ...ZERO, contratoFechadoEm: d }).atual).toBe("contrato_fechado");
  });
  it("prova realizada (sem marcos) → em_provas, anteriores = feito", () => {
    const r = estagioDaNoiva({ ...ZERO, temProvaRealizada: true });
    expect(r.atual).toBe("em_provas");
    expect(r.passos.find((p) => p.chave === "orcamento_aberto")!.estado).toBe("feito");
  });
  it("retirada → retirado", () => {
    expect(estagioDaNoiva({ ...ZERO, temRetirada: true }).atual).toBe("retirado");
  });
  it("casamento passou → casamento (não encerra como 'Devolvido')", () => {
    const r = estagioDaNoiva({ ...ZERO, casamentoPassou: true });
    expect(r.atual).toBe("casamento");
    expect(r.encerrada).toBeNull();
  });
  it("devolução → devolucao + encerrada 'Devolvido'", () => {
    const r = estagioDaNoiva({ ...ZERO, temDevolucao: true });
    expect(r.atual).toBe("devolucao");
    expect(r.encerrada).toBe("Devolvido");
  });
  it("perdida sobrepõe: mantém o atual e encerra como 'Perdida'", () => {
    const r = estagioDaNoiva({ ...ZERO, temInteresse: true, perdidaEm: d });
    expect(r.atual).toBe("interesses");
    expect(r.encerrada).toBe("Perdida");
  });
});

describe("noivaAtiva", () => {
  it("ativa em etapas vivas", () => {
    expect(noivaAtiva("interesses", null)).toBe(true);
  });
  it("inativa: casamento, devolução, perdida", () => {
    expect(noivaAtiva("casamento", null)).toBe(false);
    expect(noivaAtiva("devolucao", "Devolvido")).toBe(false);
    expect(noivaAtiva("interesses", "Perdida")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/leads/__tests__/jornada.test.ts`
Expected: FAIL (módulo `@/lib/leads/jornada` não existe).

- [ ] **Step 3: Criar `src/lib/leads/jornada.ts`**

```ts
// src/lib/leads/jornada.ts
// Jornada da noiva DERIVADA dos fatos (nunca guardada/desatualizada). Função pura,
// sem Prisma — os carregadores (leads.ts) montam os FatosJornada e chamam aqui.
// Decisão: docs/superpowers/specs/2026-06-01-jornada-derivada-design.md

export const ESTAGIOS = [
  "cadastrada",
  "prova_marcada",
  "interesses",
  "orcamento_aberto",
  "contrato_fechado",
  "em_provas",
  "retirado",
  "casamento",
  "devolucao",
] as const;
export type EstagioChave = (typeof ESTAGIOS)[number];

export const ROTULO_ESTAGIO: Record<EstagioChave, string> = {
  cadastrada: "Cadastrada",
  prova_marcada: "Prova marcada",
  interesses: "Interesses preenchidos",
  orcamento_aberto: "Orçamento aberto",
  contrato_fechado: "Contrato fechado",
  em_provas: "Em provas",
  retirado: "Vestido retirado",
  casamento: "Casamento realizado",
  devolucao: "Devolução",
};

export type FatosJornada = {
  temProvaAgendada: boolean;
  temInteresse: boolean;
  orcamentoAbertoEm: Date | null;
  contratoFechadoEm: Date | null;
  temProvaRealizada: boolean;
  temRetirada: boolean;
  casamentoPassou: boolean;
  temDevolucao: boolean;
  perdidaEm: Date | null;
};

export type PassoJornada = {
  chave: EstagioChave;
  rotulo: string;
  estado: "feito" | "atual" | "futuro";
};

// Vetor de "satisfeito?" por estágio, na ordem de ESTAGIOS.
function satisfeitos(f: FatosJornada): boolean[] {
  return [
    true, // cadastrada (base)
    f.temProvaAgendada, // prova_marcada
    f.temInteresse, // interesses
    f.orcamentoAbertoEm !== null, // orcamento_aberto
    f.contratoFechadoEm !== null, // contrato_fechado
    f.temProvaRealizada, // em_provas
    f.temRetirada, // retirado
    f.casamentoPassou, // casamento
    f.temDevolucao, // devolucao
  ];
}

/**
 * Estágio atual = o de MAIOR índice satisfeito (anteriores = feito; seguintes =
 * futuro). `perdidaEm` não muda o atual — encerra a jornada com selo "Perdida".
 * Devolução fecha positiva ("Devolvido").
 */
export function estagioDaNoiva(f: FatosJornada): {
  passos: PassoJornada[];
  atual: EstagioChave;
  encerrada: string | null;
} {
  const ok = satisfeitos(f);
  let idx = 0;
  ok.forEach((s, i) => {
    if (s) idx = i;
  });
  const passos: PassoJornada[] = ESTAGIOS.map((chave, i) => ({
    chave,
    rotulo: ROTULO_ESTAGIO[chave],
    estado: i < idx ? "feito" : i === idx ? "atual" : "futuro",
  }));
  const atual = ESTAGIOS[idx];
  const encerrada = f.perdidaEm ? "Perdida" : atual === "devolucao" ? "Devolvido" : null;
  return { passos, atual, encerrada };
}

/** Noiva em acompanhamento ATIVO (dashboard): fora se perdida, casada ou devolvida. */
export function noivaAtiva(atual: EstagioChave, encerrada: string | null): boolean {
  return encerrada === null && atual !== "casamento";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/leads/__tests__/jornada.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads/jornada.ts src/lib/leads/__tests__/jornada.test.ts
git commit -m "feat(jornada): função pura estagioDaNoiva + tipos derivados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Carregadores de fatos + marco manual (leads.ts)

**Files:**
- Modify: `src/lib/leads/leads.ts`
- Test: `src/lib/leads/__tests__/leads.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/leads/__tests__/leads.test.ts`, adicionar imports no topo (junto aos existentes) e um novo `describe` ao final. Imports a garantir:

```ts
import { fatosDaNoiva, estagiosDasNoivas, definirMarcoJornada } from "@/lib/leads/leads";
import { estagioDaNoiva } from "@/lib/leads/jornada";
import { tenantPrisma } from "@/lib/tenant";
import { prisma } from "@/lib/db";
```

Novo bloco de teste (usa uma loja marcada própria, no estilo dos outros testes de integração do repo):

```ts
describe("jornada derivada (fatos + marcos)", () => {
  const MARK = "t-jornada-";
  let loja = "";
  let leadId = "";

  beforeAll(async () => {
    loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
    leadId = (await tenantPrisma(prisma, loja).lead.create({
      data: { noivaNome: `${MARK}Ana` } as never,
    })).id;
  });
  afterAll(async () => {
    await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  });

  it("noiva recém-cadastrada → estágio 'cadastrada'", async () => {
    const f = await fatosDaNoiva(loja, leadId);
    expect(f).not.toBeNull();
    expect(estagioDaNoiva(f!).atual).toBe("cadastrada");
  });

  it("interesse com atributo → 'interesses'; e o marco manual avança", async () => {
    // marco manual de orçamento liga e desliga (idempotente, escopado)
    await definirMarcoJornada(loja, leadId, "orcamentoAbertoEm", true);
    let f = await fatosDaNoiva(loja, leadId);
    expect(f!.orcamentoAbertoEm).not.toBeNull();
    expect(estagioDaNoiva(f!).atual).toBe("orcamento_aberto");

    await definirMarcoJornada(loja, leadId, "orcamentoAbertoEm", false);
    f = await fatosDaNoiva(loja, leadId);
    expect(f!.orcamentoAbertoEm).toBeNull();
  });

  it("estagiosDasNoivas mapeia a loja inteira", async () => {
    const mapa = await estagiosDasNoivas(loja);
    expect(mapa.get(leadId)?.atual).toBeDefined();
  });

  it("marco de outra loja é no-op (escopo)", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    await definirMarcoJornada(outra, leadId, "perdidaEm", true); // lead é da `loja`, não da `outra`
    const f = await fatosDaNoiva(loja, leadId);
    expect(f!.perdidaEm).toBeNull(); // não marcou nada
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/leads/__tests__/leads.test.ts`
Expected: FAIL (`fatosDaNoiva`/`estagiosDasNoivas`/`definirMarcoJornada` não existem).

- [ ] **Step 3: Implementar em `src/lib/leads/leads.ts`**

3a. No topo, adicionar imports:

```ts
import { estagioDaNoiva, type FatosJornada, type EstagioChave } from "./jornada";
```

3b. Ao final do arquivo, adicionar:

```ts
// Meia-noite UTC do dia de HOJE no fuso da loja (mesma convenção de painel/reservas).
function inicioDeHojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

// include mínimo p/ derivar a jornada: interesse (atributos), reservas (datas + provas).
const INCLUDE_JORNADA = {
  interesse: { select: { atributos: { select: { atributoId: true } } } },
  bloqueios: {
    where: { tipo: "RESERVA_CASAMENTO" as const },
    select: {
      retiradaDataReal: true,
      devolucaoDataReal: true,
      provas: { select: { comparecimento: true } },
    },
  },
} as const;

type LeadComJornada = Prisma.LeadGetPayload<{ include: typeof INCLUDE_JORNADA }>;

function fatosDeLead(lead: LeadComJornada, hoje: Date): FatosJornada {
  const provas = lead.bloqueios.flatMap((b) => b.provas);
  return {
    temProvaAgendada: provas.some((p) => p.comparecimento === "AGENDADA"),
    temInteresse: (lead.interesse?.atributos.length ?? 0) > 0,
    orcamentoAbertoEm: lead.orcamentoAbertoEm,
    contratoFechadoEm: lead.contratoFechadoEm,
    temProvaRealizada: provas.some((p) => p.comparecimento === "COMPARECEU"),
    temRetirada: lead.bloqueios.some((b) => b.retiradaDataReal !== null),
    casamentoPassou: lead.casamentoData !== null && lead.casamentoData < hoje,
    temDevolucao: lead.bloqueios.some((b) => b.devolucaoDataReal !== null),
    perdidaEm: lead.perdidaEm,
  };
}

/** Fatos da jornada de UMA noiva (null se não for da loja). */
export async function fatosDaNoiva(lojaId: string, leadId: string): Promise<FatosJornada | null> {
  const lead = await tenantPrisma(prisma, lojaId).lead.findUnique({
    where: { id: leadId },
    include: INCLUDE_JORNADA,
  });
  if (!lead) return null;
  return fatosDeLead(lead, inicioDeHojeUTC());
}

export type EstagioResumo = { atual: EstagioChave; encerrada: string | null };

/** Estágio derivado de TODAS as noivas da loja (lote, em memória). */
export async function estagiosDasNoivas(lojaId: string): Promise<Map<string, EstagioResumo>> {
  const hoje = inicioDeHojeUTC();
  const leads = await tenantPrisma(prisma, lojaId).lead.findMany({ include: INCLUDE_JORNADA });
  const mapa = new Map<string, EstagioResumo>();
  for (const l of leads) {
    const { atual, encerrada } = estagioDaNoiva(fatosDeLead(l, hoje));
    mapa.set(l.id, { atual, encerrada });
  }
  return mapa;
}

export type MarcoJornada = "orcamentoAbertoEm" | "contratoFechadoEm" | "perdidaEm";

/** Liga/desliga um marco manual da jornada. Escopado por loja (updateMany). */
export async function definirMarcoJornada(
  lojaId: string,
  leadId: string,
  campo: MarcoJornada,
  ligar: boolean,
): Promise<void> {
  await tenantPrisma(prisma, lojaId).lead.updateMany({
    where: { id: leadId },
    data: { [campo]: ligar ? new Date() : null } as never,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/leads/__tests__/leads.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads/leads.ts src/lib/leads/__tests__/leads.test.ts
git commit -m "feat(jornada): carregadores de fatos (fatosDaNoiva/estagiosDasNoivas) + marco manual

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Perfil da noiva — jornada derivada + marcos manuais

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx`
- Modify: `src/components/dashboard/painel-jornada-noiva.tsx`

- [ ] **Step 1: Criar `jornada-actions.ts`**

```ts
// src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts
// Marcos manuais da jornada (orçamento/contrato/perdida). Server Actions com <form>
// nativo; revalida sessão + leads:editar; volta por query-param.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { definirMarcoJornada, type MarcoJornada } from "@/lib/leads/leads";

async function marco(formData: FormData, campo: MarcoJornada) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"))) redirect(base);
  const ligar = String(formData.get("ligar") ?? "") === "1";
  await definirMarcoJornada(sc.loja.id, leadId, campo, ligar);
  redirect(`${base}?ok=jornada`);
}

export async function marcarOrcamentoAbertoAction(formData: FormData) {
  return marco(formData, "orcamentoAbertoEm");
}
export async function marcarContratoFechadoAction(formData: FormData) {
  return marco(formData, "contratoFechadoEm");
}
export async function marcarPerdidaAction(formData: FormData) {
  return marco(formData, "perdidaEm");
}
```

- [ ] **Step 2: Atualizar `painel-jornada-noiva.tsx` (etapa→chave)**

Trocar o import e a key. No topo, trocar:
`import type { PassoJornada } from "@/lib/leads/leads";`
por:
`import type { PassoJornada } from "@/lib/leads/jornada";`
E na lista, trocar `key={p.etapa}` por `key={p.chave}`. (O resto do componente usa `p.estado`/`p.rotulo`, inalterado.)

- [ ] **Step 3: Migrar `noivas/[leadId]/page.tsx` para o estágio derivado**

3a. Ajustar os imports da jornada. A linha de import de `@/lib/leads/leads` hoje é
`import { jornadaDaNoiva, ROTULO_ETAPA, ROTULO_ORIGEM } from "@/lib/leads/leads";` — trocar por:
```ts
import { ROTULO_ORIGEM, fatosDaNoiva } from "@/lib/leads/leads";
import { estagioDaNoiva, ROTULO_ESTAGIO } from "@/lib/leads/jornada";
import { marcarOrcamentoAbertoAction, marcarContratoFechadoAction, marcarPerdidaAction } from "./jornada-actions";
```
(remove `jornadaDaNoiva` e `ROTULO_ETAPA`; mantém `ROTULO_ORIGEM`).

3b. Onde hoje está `const { passos, encerrada } = jornadaDaNoiva(lead.etapa);`, trocar por (após já ter `dados`/`lead`):
```ts
  const fatos = await fatosDaNoiva(sc.loja.id, leadId);
  const { passos, atual, encerrada } = estagioDaNoiva(fatos!); // lead existe → fatos != null
```

3c. O subtítulo `<p ...>{ROTULO_ETAPA[lead.etapa]}</p>` (linha ~169) vira:
```tsx
        <p className="text-[14px] text-cinza-fumo">{encerrada ?? ROTULO_ESTAGIO[atual]}</p>
```

3d. Logo após `<PainelJornadaNoiva passos={passos} encerrada={encerrada} />`, adicionar os controles de marco (só com `podeEditar`, que já é resolvido na página para "Editar dados"; reutilize-o):
```tsx
      {podeEditar && (
        <section className="flex flex-wrap gap-3">
          <MarcoForm
            action={marcarOrcamentoAbertoAction}
            leadId={leadId}
            ligado={fatos!.orcamentoAbertoEm !== null}
            rotuloLigar="Marcar orçamento aberto"
            rotuloDesfazer="Desfazer orçamento aberto"
          />
          <MarcoForm
            action={marcarContratoFechadoAction}
            leadId={leadId}
            ligado={fatos!.contratoFechadoEm !== null}
            rotuloLigar="Marcar contrato fechado"
            rotuloDesfazer="Desfazer contrato fechado"
          />
          <MarcoForm
            action={marcarPerdidaAction}
            leadId={leadId}
            ligado={fatos!.perdidaEm !== null}
            rotuloLigar="Marcar como perdida"
            rotuloDesfazer="Reativar noiva"
          />
        </section>
      )}
```

3e. Adicionar, no mesmo arquivo (fora do componente da página, no fim do módulo), o helper de form:
```tsx
function MarcoForm({
  action,
  leadId,
  ligado,
  rotuloLigar,
  rotuloDesfazer,
}: {
  action: (fd: FormData) => Promise<void>;
  leadId: string;
  ligado: boolean;
  rotuloLigar: string;
  rotuloDesfazer: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
          decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
          hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-bordo"
      >
        {ligado ? rotuloDesfazer : rotuloLigar}
      </button>
    </form>
  );
}
```

3f. Adicionar o aviso de jornada no mapa `AVISOS` da página (se existir; senão, ignore): a página da noiva usa `AVISOS` para `?ok`. Acrescente a entrada `jornada: "Jornada atualizada.",` ao objeto `AVISOS`.

- [ ] **Step 4: Typecheck + lint**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0 (sem referência a `jornadaDaNoiva`/`ROTULO_ETAPA`/`lead.etapa` nesta página).
Run: `node node_modules/eslint/bin/eslint.js "src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx" "src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts" "src/components/dashboard/painel-jornada-noiva.tsx"`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx" "src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts" "src/components/dashboard/painel-jornada-noiva.tsx"
git commit -m "feat(jornada): perfil da noiva usa estágio derivado + marcos manuais

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Lista de noivas + livro de reservas — rótulos derivados

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/noivas/page.tsx`
- Modify: `src/lib/disponibilidade/reservas.ts`
- Modify: `src/app/(app)/loja/[lojaId]/reservas/page.tsx`

- [ ] **Step 1: Lista de noivas usa estágio derivado**

Em `noivas/page.tsx`:
1a. Trocar `import { listarLeads, ROTULO_ETAPA } from "@/lib/leads/leads";` por:
```ts
import { listarLeads, estagiosDasNoivas } from "@/lib/leads/leads";
import { ROTULO_ESTAGIO } from "@/lib/leads/jornada";
```
1b. Onde os leads são carregados, carregar também os estágios em paralelo. Encontre a linha `const noivas = await listarLeads(...)` (ou similar dentro do componente) e ajuste para:
```ts
  const [noivas, estagios] = await Promise.all([
    listarLeads(sc.loja.id),
    estagiosDasNoivas(sc.loja.id),
  ]);
```
1c. Na construção de `meta` (hoje `const meta = [ROTULO_ETAPA[n.etapa], ...]`), trocar a primeira posição por:
```ts
            const est = estagios.get(n.id);
            const rotuloEtapa = est ? (est.encerrada ?? ROTULO_ESTAGIO[est.atual]) : "Cadastrada";
            const meta = [rotuloEtapa, n.noivoNome ? `& ${n.noivoNome}` : null]
              .filter(Boolean)
              .join(" · ");
```

- [ ] **Step 2: `ReservaDaLoja` deixa de carregar `etapa`**

Em `src/lib/disponibilidade/reservas.ts`:
2a. No tipo `ReservaDaLoja`, remover a linha `etapa: LeadEtapa | null;`.
2b. Em `listarReservasDaLoja`, remover `etapa: true` do `select` do `lead` e remover `etapa: r.lead?.etapa ?? null,` do objeto retornado. (Mantém `noivaNome` e `leadId`.)
2c. Se o import de `LeadEtapa` em `reservas.ts` ficar sem uso, removê-lo do `import type { ... } from "@/generated/prisma/client";`.

- [ ] **Step 3: Livro de reservas deriva o estágio por noiva**

Em `reservas/page.tsx`:
3a. Trocar `import { ROTULO_ETAPA } from "@/lib/leads/leads";` por:
```ts
import { estagiosDasNoivas } from "@/lib/leads/leads";
import { ROTULO_ESTAGIO } from "@/lib/leads/jornada";
```
3b. Após carregar `reservas`, carregar os estágios:
```ts
  const estagios = await estagiosDasNoivas(sc.loja.id);
```
3c. Onde hoje mostra a etapa (linhas ~145-146):
```tsx
                          {r.etapa && (
                            <span className="text-[12px] text-cinza-fumo">{ROTULO_ETAPA[r.etapa]}</span>
                          )}
```
trocar por (deriva pelo `leadId` da reserva):
```tsx
                          {r.leadId && estagios.get(r.leadId) && (
                            <span className="text-[12px] text-cinza-fumo">
                              {estagios.get(r.leadId)!.encerrada ?? ROTULO_ESTAGIO[estagios.get(r.leadId)!.atual]}
                            </span>
                          )}
```

- [ ] **Step 4: Typecheck + testes + lint**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.
Run: `node node_modules/vitest/vitest.mjs run src/lib/disponibilidade`
Expected: verde (o teste de `listarReservasDaLoja`, se citar `etapa`, precisa parar de citar — ajuste o teste removendo a asserção de `etapa` se houver).
Run: `node node_modules/eslint/bin/eslint.js "src/app/(app)/loja/[lojaId]/noivas/page.tsx" "src/app/(app)/loja/[lojaId]/reservas/page.tsx" "src/lib/disponibilidade/reservas.ts"`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/noivas/page.tsx" "src/app/(app)/loja/[lojaId]/reservas/page.tsx" src/lib/disponibilidade/reservas.ts src/lib/disponibilidade/__tests__/reservas.test.ts
git commit -m "feat(jornada): lista de noivas e livro de reservas usam estágio derivado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Dashboard `painel.ts` — estágio derivado

**Files:**
- Modify: `src/lib/loja/painel.ts`
- Modify: `src/components/dashboard/painel-jornada.tsx`
- Test: `src/lib/loja/__tests__/painel.test.ts`

- [ ] **Step 1: Reescrever `carregarPainel` (derivado)**

Em `src/lib/loja/painel.ts`, substituir os imports de etapa e a lógica baseada em `groupBy("etapa")` pela derivação. Trocar o topo:

```ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { estagioDaNoiva, noivaAtiva, ROTULO_ESTAGIO, ESTAGIOS, type EstagioChave, type FatosJornada } from "@/lib/leads/jornada";
```

Remover `import { LeadEtapa } ...` e `import { ROTULO_ETAPA } ...`, e remover as constantes `JORNADA_ORDEM`, `ENCERRADAS`, `ETAPAS_ATENCAO`.

Trocar os tipos que citam `LeadEtapa`:
```ts
export type EtapaJornada = { chave: EstagioChave; rotulo: string; total: number };
```
e em `Atencao`, remover `etapa: LeadEtapa;` (mantém `rotulo: string`).

Adicionar (perto do topo) o conjunto de atenção e o include, e um helper de fatos local (idêntico ao de leads.ts, mantido aqui para o painel ser autossuficiente):
```ts
const ESTAGIOS_ATENCAO = new Set<EstagioChave>(["orcamento_aberto", "em_provas"]);

const INCLUDE_JORNADA = {
  interesse: { select: { atributos: { select: { atributoId: true } } } },
  bloqueios: {
    where: { tipo: "RESERVA_CASAMENTO" as const },
    select: {
      retiradaDataReal: true,
      devolucaoDataReal: true,
      provas: { select: { comparecimento: true } },
    },
  },
} as const;
```

Reescrever o corpo de `carregarPainel` (mantendo `inicioDeHojeUTC`, `vestidos`, `destaque` como estão):

```ts
export async function carregarPainel(lojaId: string): Promise<PainelLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = inicioDeHojeUTC();

  const [leads, vestidos, destaqueRow] = await Promise.all([
    db.lead.findMany({
      select: {
        id: true,
        noivaNome: true,
        casamentoData: true,
        orcamentoAbertoEm: true,
        contratoFechadoEm: true,
        perdidaEm: true,
        interesse: { select: { atributos: { select: { atributoId: true } } } },
        bloqueios: {
          where: { tipo: "RESERVA_CASAMENTO" },
          select: {
            retiradaDataReal: true,
            devolucaoDataReal: true,
            provas: { select: { comparecimento: true } },
          },
        },
      },
    }),
    db.vestido.count(),
    db.vestido.findFirst({
      where: { status: "ativo", fotos: { some: { ordem: 0 } } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        codigo: true,
        nome: true,
        categoria: true,
        fotos: { where: { ordem: 0 }, select: { updatedAt: true } },
      },
    }),
  ]);

  // Deriva o estágio de cada noiva.
  type Linha = { id: string; noivaNome: string; casamentoData: Date | null; atual: EstagioChave; encerrada: string | null };
  const linhas: Linha[] = leads.map((l) => {
    const provas = l.bloqueios.flatMap((b) => b.provas);
    const fatos: FatosJornada = {
      temProvaAgendada: provas.some((p) => p.comparecimento === "AGENDADA"),
      temInteresse: (l.interesse?.atributos.length ?? 0) > 0,
      orcamentoAbertoEm: l.orcamentoAbertoEm,
      contratoFechadoEm: l.contratoFechadoEm,
      temProvaRealizada: provas.some((p) => p.comparecimento === "COMPARECEU"),
      temRetirada: l.bloqueios.some((b) => b.retiradaDataReal !== null),
      casamentoPassou: l.casamentoData !== null && l.casamentoData < hoje,
      temDevolucao: l.bloqueios.some((b) => b.devolucaoDataReal !== null),
      perdidaEm: l.perdidaEm,
    };
    const { atual, encerrada } = estagioDaNoiva(fatos);
    return { id: l.id, noivaNome: l.noivaNome, casamentoData: l.casamentoData, atual, encerrada };
  });

  const ativas = linhas.filter((l) => noivaAtiva(l.atual, l.encerrada));
  const noivasAtivas = ativas.length;

  // Contagem por estágio vivo (na ordem de ESTAGIOS), só etapas com ≥1 noiva ativa.
  const totalPorEstagio = new Map<EstagioChave, number>();
  for (const l of ativas) totalPorEstagio.set(l.atual, (totalPorEstagio.get(l.atual) ?? 0) + 1);
  const jornada: EtapaJornada[] = ESTAGIOS.filter((c) => (totalPorEstagio.get(c) ?? 0) > 0).map(
    (chave) => ({ chave, rotulo: ROTULO_ESTAGIO[chave], total: totalPorEstagio.get(chave) ?? 0 }),
  );

  const emProvas = totalPorEstagio.get("em_provas") ?? 0;

  // Casamentos futuros (data >= hoje), ascendente.
  const futuros = linhas
    .filter((l) => l.casamentoData !== null && l.casamentoData.getTime() >= hoje.getTime())
    .sort((a, b) => a.casamentoData!.getTime() - b.casamentoData!.getTime());

  const proximosCasamentos: CasamentoProximo[] = futuros.slice(0, 5).map((l) => ({
    id: l.id,
    noivaNome: l.noivaNome,
    data: l.casamentoData!,
    diasRestantes: Math.round((l.casamentoData!.getTime() - hoje.getTime()) / DIA_MS),
  }));

  const limite = hoje.getTime() + JANELA_PROXIMOS_DIAS * DIA_MS;
  const casamentosProximos = futuros.filter((l) => l.casamentoData!.getTime() <= limite).length;

  const limiteAtencao = hoje.getTime() + JANELA_ATENCAO_DIAS * DIA_MS;
  const atencoes: Atencao[] = futuros
    .filter(
      (l) =>
        noivaAtiva(l.atual, l.encerrada) &&
        ESTAGIOS_ATENCAO.has(l.atual) &&
        l.casamentoData!.getTime() <= limiteAtencao,
    )
    .map((l) => ({
      id: l.id,
      noivaNome: l.noivaNome,
      rotulo: ROTULO_ESTAGIO[l.atual],
      data: l.casamentoData!,
      diasRestantes: Math.round((l.casamentoData!.getTime() - hoje.getTime()) / DIA_MS),
    }));

  const destaque: Destaque | null = destaqueRow
    ? {
        id: destaqueRow.id,
        codigo: destaqueRow.codigo,
        nome: destaqueRow.nome,
        categoria: destaqueRow.categoria,
        versaoFoto: destaqueRow.fotos[0]?.updatedAt.getTime() ?? 0,
      }
    : null;

  return { noivasAtivas, vestidos, emProvas, casamentosProximos, jornada, proximosCasamentos, atencoes, destaque };
}
```

- [ ] **Step 2: `painel-jornada.tsx` (etapa→chave)**

Em `src/components/dashboard/painel-jornada.tsx`, trocar `key={e.etapa}` por `key={e.chave}`. (O resto usa `e.rotulo`/`e.total`, inalterado; o tipo `EtapaJornada` importado já mudou.)

- [ ] **Step 3: Ajustar o teste do painel**

Em `src/lib/loja/__tests__/painel.test.ts`: os testes que hoje setam `etapa` em leads e esperam contagens por `LeadEtapa` precisam refletir a derivação. Substituir as asserções baseadas em `etapa`/`ROTULO_ETAPA` por asserções sobre o estágio derivado. Caso mínimo a garantir (ajuste os fixtures para refletir a realidade):
- uma noiva recém-criada (sem interesse/reserva) conta como ativa e aparece em `jornada` com `chave: "cadastrada"`;
- `noivasAtivas` reflete só as não-encerradas.
Rode e ajuste até passar:

Run: `node node_modules/vitest/vitest.mjs run src/lib/loja/__tests__/painel.test.ts`
Expected: PASS (após ajustar fixtures/asserções à derivação).

- [ ] **Step 4: Typecheck + lint**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.
Run: `node node_modules/eslint/bin/eslint.js src/lib/loja/painel.ts src/components/dashboard/painel-jornada.tsx`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loja/painel.ts src/components/dashboard/painel-jornada.tsx src/lib/loja/__tests__/painel.test.ts
git commit -m "feat(jornada): dashboard agrega por estágio derivado (jornada + atenções)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Limpeza do código morto + gates finais

**Files:**
- Modify: `src/lib/leads/leads.ts`
- Modify: `docs/estado-atual.md`

- [ ] **Step 1: Remover o legado de jornada em `leads.ts`**

Agora que nenhum consumidor usa mais o legado, remover de `src/lib/leads/leads.ts`: a constante `JORNADA_NOIVA`, o tipo `PassoJornada` (antigo, com `etapa`), e a função `jornadaDaNoiva`. **Manter `ROTULO_ETAPA`** só se ainda houver algum consumidor; verifique:

Run: `grep -rn "ROTULO_ETAPA\|jornadaDaNoiva\|JORNADA_NOIVA" src --include=*.ts --include=*.tsx`
- Se `ROTULO_ETAPA` não aparecer em nenhum consumidor (fora da própria definição), remover também o `export const ROTULO_ETAPA` e, se `LeadEtapa` ficar sem uso em `leads.ts`, removê-lo do import.
- Se ainda houver consumidor, deixar `ROTULO_ETAPA` e anotar.

- [ ] **Step 2: Gates completos**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0.
Run: `node node_modules/vitest/vitest.mjs run`
Expected: todos verdes.

- [ ] **Step 3: Atualizar `docs/estado-atual.md`**

Adicionar uma seção curta "## Jornada derivada (2026-06-01)" registrando: etapa agora derivada de `estagioDaNoiva` (não mais `Lead.etapa`); 3 marcos manuais novos no `Lead` (`orcamentoAbertoEm`/`contratoFechadoEm`/`perdidaEm`); consumidores migrados (perfil, lista, reservas, dashboard); `Lead.etapa`/`LeadEtapa` deprecados; **fast-follow:** Orçamento com histórico substitui os marcos #4/#5.

- [ ] **Step 4: Commit**

```bash
git add src/lib/leads/leads.ts docs/estado-atual.md
git commit -m "refactor(jornada): remove o legado de etapa guardada + atualiza estado-atual

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (resumo)

- `node node_modules/vitest/vitest.mjs run` → verde (jornada pura + carregadores + painel + reservas).
- `node node_modules/typescript/bin/tsc --noEmit` → limpo. `npx prisma generate` após o schema.
- Manual (app no ar, `BASE_URL`/Run): noiva nova = "Cadastrada"; reservar + prova agendada = "Prova marcada"; interesses = "Interesses preenchidos"; marcar orçamento/contrato avança; prova "Compareceu" = "Em provas"; retirada/casamento/devolução refletem; "Marcar como perdida" encerra. Após a migração, **reiniciar o app (Run)**.

## Fora de escopo

- **Orçamento com histórico de negociação** (próxima fatia) — troca os marcos #4/#5 por dado real.
- Sub-projetos B (foto no cadastro do vestido) e C (agenda em calendário).
- Remoção física da coluna `Lead.etapa` / enum `LeadEtapa`.
