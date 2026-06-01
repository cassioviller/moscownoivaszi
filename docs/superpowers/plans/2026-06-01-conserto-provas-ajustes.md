# Conserto Provas & Ajustes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consertar a fatia Provas & Ajustes — dar acesso da costureira ao detalhe da reserva, endurecer a validação (falha-fechada), completar a edição da prova na UI e deixar um smoke HTTP commitado.

**Architecture:** Página adaptativa (A1): reusa `reservas/[bloqueioId]/page.tsx` com portão de visão `leads:ver` OU `ajustes:ver` e links condicionais por permissão. Validação na camada de dados (`src/lib/atelier/provas.ts`) retorna motivos em vez de estourar/silenciar. Edição completa via um formulário por prova. Smoke autenticado no padrão de `scripts/smoke-permissoes.ts`.

**Tech Stack:** Next 16 (App Router, Server Actions, `force-dynamic`), React 19, Prisma 7 (client custom em `src/generated/prisma`), Postgres, Vitest, Tailwind v4. Comandos: testes `node node_modules/vitest/vitest.mjs run`; tsc `node node_modules/typescript/bin/tsc --noEmit`; tsx `node node_modules/tsx/dist/cli.mjs <script>`.

Spec: `docs/superpowers/specs/2026-06-01-conserto-provas-ajustes-design.md`. Branch: `feat/conserto-provas-ajustes`.

---

## File Structure

- `src/lib/atelier/provas.ts` — **Modify:** validação de data (formato) e enums em `registrarProva`/`editarProva`; novos motivos.
- `src/lib/atelier/__tests__/atelier.test.ts` — **Modify:** testes da validação nova.
- `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx` — **Modify:** portão de visão `leads:ver` OU `ajustes:ver`; links condicionais; back link adaptativo; AVISOS novos; formulário "Editar prova".
- `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts` — **Modify:** `editarComparecimentoAction` → `editarProvaAction` (todos os campos + erro visível).
- `scripts/smoke-atelier.ts` — **Create:** smoke autenticado HTTP + camada de dados.

---

## Task 1: Robustez na camada de dados (B)

**Files:**
- Modify: `src/lib/atelier/provas.ts`
- Test: `src/lib/atelier/__tests__/atelier.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

No fim do `describe("provas", ...)` em `src/lib/atelier/__tests__/atelier.test.ts`, adicionar (dentro do mesmo `describe`, após o último `it`):

```ts
  it("recusa data malformada e comparecimento inválido (falha fechada, sem 500)", async () => {
    expect(await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-13-40", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await registrarProva(loja, { bloqueioId: reservaId, dataReal: "31/12/2026", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await registrarProva(loja, {
      bloqueioId: reservaId, dataReal: "2026-08-20", tipo: "PRIMEIRA",
      comparecimento: "XPTO" as never,
    })).toMatchObject({ ok: false, motivo: "comparecimento_invalido" });
  });

  it("editarProva também valida data e comparecimento", async () => {
    const r = await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-08-21", tipo: "PRIMEIRA" });
    if (!r.ok) throw new Error("prova não criada");
    expect(await editarProva(loja, r.provaId, { dataReal: "2026-99-99" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await editarProva(loja, r.provaId, { comparecimento: "NOPE" as never }))
      .toMatchObject({ ok: false, motivo: "comparecimento_invalido" });
    await removerProva(loja, r.provaId);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atelier`
Expected: FAIL — `registrarProva` com data inválida hoje lança (não retorna `data_invalida`); comparecimento inválido grava ou lança.

- [ ] **Step 3: Implementar a validação em `provas.ts`**

3a. No topo dos imports, adicionar o import de `parseDiaUTC`:

```ts
import { parseDiaUTC } from "@/lib/disponibilidade/datas";
```

3b. Logo após a função `meiaNoiteUTC` (linha ~22), adicionar os validadores:

```ts
// Valida "YYYY-MM-DD" reusando o parser do motor (rejeita formato e datas
// impossíveis, ex.: 2026-13-40). True = data utilizável.
function diaValido(s: string): boolean {
  try {
    parseDiaUTC(s);
    return true;
  } catch {
    return false;
  }
}

const COMPARECIMENTOS_VALIDOS = new Set<ProvaComparecimento>([
  "AGENDADA",
  "COMPARECEU",
  "FALTOU",
  "REMARCADA",
]);
```

3c. Atualizar o tipo `ResultadoProva` (linha ~78) para incluir os novos motivos:

```ts
export type ResultadoProva =
  | { ok: true; provaId: string }
  | { ok: false; motivo: "sem_data" | "data_invalida" | "tipo_invalido" | "comparecimento_invalido" | "reserva_invalida" };
```

3d. Em `registrarProva`, logo após a checagem de `tipo` (`if (!TIPOS_VALIDOS.has(tipo)) ...`), adicionar:

```ts
  if (!diaValido(dataReal)) return { ok: false, motivo: "data_invalida" };
  if (comparecimento !== undefined && !COMPARECIMENTOS_VALIDOS.has(comparecimento)) {
    return { ok: false, motivo: "comparecimento_invalido" };
  }
```

3e. Atualizar o tipo `ResultadoEdicaoProva` (linha ~124) para os novos motivos:

```ts
export type ResultadoEdicaoProva =
  | { ok: true }
  | { ok: false; motivo: "prova_invalida" | "sem_data" | "data_invalida" | "tipo_invalido" | "comparecimento_invalido" };
```

3f. Em `editarProva`, logo após `if (patch.dataReal !== undefined && !patch.dataReal) return { ok: false, motivo: "sem_data" };`, adicionar:

```ts
  if (patch.dataReal && !diaValido(patch.dataReal)) return { ok: false, motivo: "data_invalida" };
  if (patch.tipo !== undefined && !TIPOS_VALIDOS.has(patch.tipo)) return { ok: false, motivo: "tipo_invalido" };
  if (patch.comparecimento !== undefined && !COMPARECIMENTOS_VALIDOS.has(patch.comparecimento)) {
    return { ok: false, motivo: "comparecimento_invalido" };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atelier`
Expected: PASS (todos, incl. os 2 novos).

- [ ] **Step 5: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros (saída vazia).

- [ ] **Step 6: Commit**

```bash
git add src/lib/atelier/provas.ts src/lib/atelier/__tests__/atelier.test.ts
git commit -m "fix(atelier): valida data e comparecimento em provas (falha fechada)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Acesso da costureira — página adaptativa (A)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx`

- [ ] **Step 1: Trocar o portão de visão e resolver as flags de link**

Substituir o bloco do gate + `Promise.all` (hoje linhas ~88-104) por:

```tsx
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const { lojaId, bloqueioId } = await params;
  const { ok, erro } = await searchParams;

  // Visão: atelier (leads:ver) OU costureira (ajustes:ver). Sem nenhum → fora.
  const [podeVerNoivas, podeVerAjustes, podeVerVestidos, podeCriar, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
  ]);
  if (!podeVerNoivas && !podeVerAjustes) redirect(`/loja/${sc.loja.id}`);

  const reserva = await obterReservaDetalhe(sc.loja.id, bloqueioId);
  if (!reserva) redirect(podeVerNoivas ? `/loja/${lojaId}/reservas` : `/loja/${lojaId}/ajustes`);

  const provas = await listarProvasDaReserva(sc.loja.id, bloqueioId);
```

(Remove a linha antiga `if (!(await podeNoModulo(... "leads","ver"))) redirect(...)` e o `Promise.all` que trazia só `podeCriar, podeEditar, provas`.)

- [ ] **Step 2: Back link adaptativo**

Substituir o `<Link>` "← Reservas" do header (hoje linhas ~116-121) por:

```tsx
        <Link
          href={podeVerNoivas ? `/loja/${lojaId}/reservas` : `/loja/${lojaId}/ajustes`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {podeVerNoivas ? "Reservas" : "Ajustes"}
        </Link>
```

- [ ] **Step 3: Noiva e vestido como link só com permissão**

Substituir o `<h1>` da noiva (hoje ~122-130) por:

```tsx
        <h1 className="font-display text-[28px] font-light leading-tight tracking-tight text-tinta">
          {reserva.leadId && podeVerNoivas ? (
            <Link href={`/loja/${lojaId}/noivas/${reserva.leadId}`} className="hover:text-bordo">
              {reserva.noivaNome ?? "Noiva"}
            </Link>
          ) : (
            (reserva.noivaNome ?? "Noiva")
          )}
        </h1>
```

E substituir o parágrafo do vestido (hoje ~131-136) por (vestido vira texto puro sem `vestidos:ver`):

```tsx
        <p className="text-[14px] text-cinza-fumo">
          {podeVerVestidos ? (
            <Link href={`/loja/${lojaId}/vestidos/${reserva.vestidoId}`} className="hover:text-bordo">
              {reserva.codigo} · {reserva.nome}
            </Link>
          ) : (
            <span>
              {reserva.codigo} · {reserva.nome}
            </span>
          )}
          {reserva.casamentoData && <> · casamento {dataCurta.format(reserva.casamentoData)}</>}
        </p>
```

- [ ] **Step 4: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx"
git commit -m "fix(reserva): costureira abre o detalhe (visão leads:ver OU ajustes:ver, links condicionais)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Edição completa da prova + erro visível (C + B-action)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx`

- [ ] **Step 1: Renomear a action e passar todos os campos + erro visível**

Em `actions.ts`, substituir `editarComparecimentoAction` (hoje linhas ~49-55) por:

```ts
export async function editarProvaAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  const r = await editarProva(lojaId, str(formData, "provaId"), {
    dataReal: str(formData, "dataReal"),
    tipo: str(formData, "tipo") as ProvaTipo,
    comparecimento: str(formData, "comparecimento") as ProvaComparecimento,
    responsavel: str(formData, "responsavel"),
    observacao: str(formData, "observacao"),
  });
  redirect(r.ok ? `${base}?ok=prova` : `${base}?erro=${r.motivo}`);
}
```

(`responsavel`/`observacao` vazios chegam como `""` → `editarProva` normaliza para `null`, limpando o campo — comportamento esperado num formulário de edição.)

- [ ] **Step 2: AVISOS novos na página**

Em `page.tsx`, no objeto `AVISOS` (hoje ~58-69), adicionar duas entradas após `tipo_invalido`:

```ts
  data_invalida: "Data inválida.",
  comparecimento_invalido: "Comparecimento inválido.",
```

- [ ] **Step 3: Trocar o import e o formulário por "Editar prova"**

3a. Em `page.tsx`, no import das actions (`from "./actions"`), trocar `editarComparecimentoAction` por `editarProvaAction`.

3b. Substituir todo o `{podeEditar && ( <form action={editarComparecimentoAction} ...> ... </form> )}` (o formulário "Atualizar comparecimento" dentro do `<li>` de cada prova) por o formulário completo abaixo:

```tsx
                {podeEditar && (
                  <form action={editarProvaAction} className="flex flex-col gap-2 border-t border-borda-suave pt-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Editar prova</span>
                    <input type="hidden" name="bloqueioId" value={bloqueioId} />
                    <input type="hidden" name="provaId" value={p.id} />
                    <div className="flex flex-wrap gap-2">
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Data</span>
                        <input
                          type="date"
                          name="dataReal"
                          defaultValue={p.dataReal.toISOString().slice(0, 10)}
                          className={`${inputBase} py-2 text-[14px]`}
                          aria-label="Data da prova"
                        />
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Tipo</span>
                        <select name="tipo" defaultValue={p.tipo} aria-label="Tipo da prova" className={`${inputBase} py-2 text-[14px]`}>
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Comparecimento</span>
                        <select name="comparecimento" defaultValue={p.comparecimento} aria-label="Comparecimento" className={`${inputBase} py-2 text-[14px]`}>
                          {COMPARECIMENTOS.map((c) => (
                            <option key={c} value={c}>{ROTULO_COMPARECIMENTO[c]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <input
                      name="responsavel"
                      defaultValue={p.responsavel ?? ""}
                      placeholder="Responsável (opcional)"
                      className={`${inputBase} py-2 text-[14px]`}
                      aria-label="Responsável"
                    />
                    <input
                      name="observacao"
                      defaultValue={p.observacao ?? ""}
                      placeholder="Observação (opcional)"
                      className={`${inputBase} py-2 text-[14px]`}
                      aria-label="Observação"
                    />
                    <button type="submit" className={`${botaoSuave} no-underline self-start`}>Salvar prova</button>
                  </form>
                )}
```

- [ ] **Step 4: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros (não pode sobrar referência a `editarComparecimentoAction`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts" "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx"
git commit -m "feat(reserva): editar prova por completo (data/tipo/comparecimento/notas) + erro visível

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Smoke HTTP autenticado commitado (D)

**Files:**
- Create: `scripts/smoke-atelier.ts`

- [ ] **Step 1: Criar o script**

Criar `scripts/smoke-atelier.ts` com exatamente:

```ts
// scripts/smoke-atelier.ts
// Smoke autenticado da fatia Provas & Ajustes. Forja sessão de gerente e de
// costureira, cria fixture marcada em loja-moscow e exercita o fluxo. Com o app
// no ar (BASE_URL, default http://localhost:5000) valida o HTTP — incl. a
// costureira ABRINDO o detalhe da reserva (a correção de acesso). Sem app no ar,
// degrada para checagens só de dados. Limpa tudo no fim.
//
// Uso:
//   1) suba o app numa porta (ex.: porta 5000 do Replit) e então:
//      BASE_URL=http://localhost:5000 node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts
//   2) sem app: node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts
import { prisma } from "../src/lib/db";
import { tenantPrisma } from "../src/lib/tenant";
import { criarSessao, definirLojaAtiva } from "../src/lib/auth/sessao";
import { reservarVestido, vestidosLivresPara, vestidosLivresEntre } from "../src/lib/disponibilidade/reservas";
import { registrarProva, listarProvasDaReserva } from "../src/lib/atelier/provas";
import { adicionarAjuste, alternarStatusAjuste, listarAjustesPendentes } from "../src/lib/atelier/ajustes";

const LOJA = "loja-moscow";
const MARK = "SMOKE-ATELIER";
const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const pass: string[] = [], fail: string[] = [];
const ck = (c: boolean, l: string) => { (c ? pass : fail).push(l); console.log(`${c ? "  ok " : "  XX "}${l}`); };

async function http(cookie: string, path: string): Promise<{ status: number; html: string } | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    return { status: res.status, html: await res.text() };
  } catch {
    return null; // app fora do ar
  }
}

async function forjarSessao(email: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  const s = await criarSessao(u.id);
  await definirLojaAtiva(s.id, LOJA, u.id);
  return s.id;
}

async function main() {
  // fixture limpa
  await prisma.lead.deleteMany({ where: { lojaId: LOJA, noivaNome: { startsWith: MARK } } });
  await prisma.vestido.deleteMany({ where: { lojaId: LOJA, codigo: { startsWith: MARK } } });

  const db = tenantPrisma(prisma, LOJA);
  const vestido = await db.vestido.create({ data: { codigo: `${MARK}-001`, nome: `${MARK} Vestido Sereia`, precoBase: "3500.00" } as never });
  const outro = await db.vestido.create({ data: { codigo: `${MARK}-OUT`, nome: `${MARK} Outro`, precoBase: "2000.00" } as never });
  const noiva = await db.lead.create({ data: { noivaNome: `${MARK} Ana`, etapa: "EM_PROVAS", casamentoData: new Date("2026-06-30T00:00:00.000Z") } as never });
  const r = await reservarVestido(LOJA, { vestidoId: vestido.id, leadId: noiva.id, casamentoData: "2026-06-30" });
  if (!r.ok) throw new Error("reserva: " + JSON.stringify(r));
  const BID = r.bloqueioId;

  const sGerente = await forjarSessao("gerente@moscow.local");
  const sCostureira = await forjarSessao("costureira@moscow.local");
  const ckGerente = `moscow_sessao=${sGerente}`;
  const ckCostureira = `moscow_sessao=${sCostureira}`;
  const reservaPath = `/loja/${LOJA}/reservas/${BID}`;
  const ajustesPath = `/loja/${LOJA}/ajustes`;

  console.log("\n[HTTP] (pulado se o app não responder)");
  const probe = await http("", "/login");
  if (probe) {
    const semCookie = await http("", reservaPath);
    ck(semCookie?.status === 307, `detalhe sem cookie → 307 (foi ${semCookie?.status})`);
    const ger = await http(ckGerente, reservaPath);
    ck(ger?.status === 200 && ger.html.includes(`${MARK} Ana`), "gerente abre o detalhe (200, mostra noiva)");
    const cos = await http(ckCostureira, reservaPath);
    ck(cos?.status === 200 && cos.html.includes("Vestido Sereia"), "COSTUREIRA abre o detalhe (200) — correção A");
    const filaCos = await http(ckCostureira, ajustesPath);
    ck(filaCos?.status === 200, `costureira abre /ajustes (200; foi ${filaCos?.status})`);
  } else {
    console.log("  -- app fora do ar; pulando HTTP (rode com BASE_URL apontando pro app) --");
  }

  console.log("\n[Fluxo] prova → ajuste → fila → feito (camada real)");
  const p = await registrarProva(LOJA, { bloqueioId: BID, dataReal: "2026-06-16", tipo: "PRIMEIRA", comparecimento: "COMPARECEU" });
  ck(p.ok, "registrarProva ok");
  const provaId = p.ok ? p.provaId : "";
  const a = await adicionarAjuste(LOJA, { provaId, descricao: "Bainha 3cm" });
  ck(a.ok, "adicionarAjuste ok");
  const ajusteId = a.ok ? a.ajusteId : "";
  ck((await listarProvasDaReserva(LOJA, BID))[0]?.ajustes.length === 1, "prova lista 1 ajuste");
  ck((await listarAjustesPendentes(LOJA)).some((x) => x.id === ajusteId), "ajuste aparece na fila global");
  await alternarStatusAjuste(LOJA, ajusteId);
  ck(!(await listarAjustesPendentes(LOJA)).some((x) => x.id === ajusteId), "após marcar feito, sai da fila");

  console.log("\n[Motor] bloco contínuo + prova não altera disponibilidade");
  ck(!(await vestidosLivresPara(LOJA, "2026-06-30")).some((v) => v.id === vestido.id), "reservado não aparece livre em 30/06");
  ck((await vestidosLivresPara(LOJA, "2026-06-30")).some((v) => v.id === outro.id), "outro vestido aparece livre");
  ck((await vestidosLivresEntre(LOJA, "2026-06-24", [vestido.id])).length === 0, "bloqueado em 24/06 (sem buraco)");
  const antes = (await vestidosLivresEntre(LOJA, "2026-06-30", [vestido.id])).length;
  await registrarProva(LOJA, { bloqueioId: BID, dataReal: "2026-06-10", tipo: "INTERMEDIARIA", comparecimento: "COMPARECEU" });
  const depois = (await vestidosLivresEntre(LOJA, "2026-06-30", [vestido.id])).length;
  ck(antes === 0 && depois === 0, `prova não muda disponibilidade (${antes}/${depois})`);

  // cleanup
  await prisma.sessao.deleteMany({ where: { id: { in: [sGerente, sCostureira] } } });
  await prisma.lead.deleteMany({ where: { lojaId: LOJA, noivaNome: { startsWith: MARK } } });
  await prisma.vestido.deleteMany({ where: { lojaId: LOJA, codigo: { startsWith: MARK } } });

  console.log(`\n=== ${pass.length} ok / ${fail.length} falhas ===`);
  if (fail.length) console.log("FALHAS:\n" + fail.map((f) => " - " + f).join("\n"));
  await prisma.$disconnect();
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(2)); });
```

- [ ] **Step 2: Rodar (sem app no ar — degrada para dados)**

Run: `node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts`
Expected: imprime "app fora do ar; pulando HTTP" e fecha com `=== N ok / 0 falhas ===` (as checagens de fluxo/motor passam).

- [ ] **Step 3: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-atelier.ts
git commit -m "test(atelier): smoke autenticado HTTP+dados (costureira abre o detalhe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Gates finais

**Files:** nenhum (verificação)

- [ ] **Step 1: Suíte completa**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: todos verdes (195 anteriores + 2 novos de atelier = 197).

- [ ] **Step 2: Typecheck final**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: (Manual, quando o app estiver no ar) smoke HTTP**

Subir o app (botão Run reinicia o servidor e recarrega o client Prisma — necessário após a migração da fatia anterior, senão 500). Então:

Run: `BASE_URL=http://localhost:5000 node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts`
Expected: as linhas `[HTTP]` passam, incl. "COSTUREIRA abre o detalhe (200) — correção A".

- [ ] **Step 4: Atualizar o estado-atual**

Em `docs/estado-atual.md`, na seção "Provas & Ajustes", anexar uma linha registrando o conserto (acesso da costureira via página adaptativa; validação falha-fechada; edição completa da prova; `scripts/smoke-atelier.ts`). Commit:

```bash
git add docs/estado-atual.md
git commit -m "docs(estado-atual): registra conserto da fatia Provas & Ajustes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (resumo)

- `node node_modules/vitest/vitest.mjs run` → verde (incl. validação data/comparecimento).
- `node node_modules/typescript/bin/tsc --noEmit` → limpo.
- `scripts/smoke-atelier.ts` sem app → fluxo/motor verdes; com app (`BASE_URL`) → HTTP verde, costureira abre o detalhe.
- Regra de negócio intacta: bloco contínuo barra 24/06; prova real não muda disponibilidade.

## Fora de escopo

- Integração das provas reais com a Agenda (fast-follow).
- Mudanças no motor de disponibilidade.
