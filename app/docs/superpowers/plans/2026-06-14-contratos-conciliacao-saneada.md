# Contratos: conciliação saneada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o bug de cancelamento (parcelas vazando para recebíveis), unificar a entrada na parcela nº0 do plano e transformar forma de pagamento em seleção (enum).

**Architecture:** Um novo status `Parcela.CANCELADA` faz as parcelas de contrato cancelado saírem das leituras de recebíveis automaticamente (já filtram `PREVISTA`/`PAGA`). Um `enum FormaPagamento` substitui os dois campos texto-livre. A entrada deixa de ser um campo do contrato e passa a ser a parcela nº0 do plano (fonte única), refletida no PDF.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 (enum + migração destrutiva sobre dados de teste), Tailwind v4, vitest (integração com Postgres real), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-14-contratos-conciliacao-saneada-design.md`.

**Convenções do repo:**
- Commits **direto na `main`**. Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npx vitest run` verde.
- **Após mudar schema:** `node node_modules/prisma/build/index.js generate`. Prisma CLI via `node node_modules/prisma/build/index.js ...`.
- Dinheiro em centavos (`@/lib/dinheiro`); `tenantPrisma`; `as never` em `create`/`update` com tenant. Testes: prefixo `MARK`, limpeza em `afterAll`.
- Gates: `acaoAutorizada("leads","editar")` para editar/cancelar; `("financeiro","editar")` para baixa.

---

## File Structure

**Modificar:** `prisma/schema.prisma` (+migração), `prisma/seed-demo.ts`, `src/lib/contratos/contratos.ts`, `src/lib/contratos/pdf.ts`, `src/lib/financeiro/receber.ts`, telas `contratos/[contratoId]/page.tsx` + `contratos/actions.ts`.
**Criar:** `src/lib/financeiro/forma.ts` (+teste), casos novos em `contratos.test.ts`/`receber.test.ts`/`pdf.test.ts`.

---

## Task 1: Schema (enum + CANCELADA + Contrato/Parcela) + migração + seed

**Files:** `prisma/schema.prisma`, `prisma/seed-demo.ts`, migração gerada.

- [x] **Step 1: Editar o schema**

Em `prisma/schema.prisma`:
1. Adicionar o enum (perto dos outros enums):
```prisma
enum FormaPagamento {
  PIX
  CARTAO_CREDITO
  CARTAO_DEBITO
  DINHEIRO
  BOLETO
  TRANSFERENCIA
  OUTRO
}
```
2. No `enum ParcelaStatus`, adicionar `CANCELADA`:
```prisma
enum ParcelaStatus {
  PREVISTA
  PAGA
  CANCELADA
}
```
3. No `model Contrato`: trocar `formaPagamento String?` por `formaPagamento FormaPagamento?`; **remover** a linha `entrada Decimal? @db.Decimal(10, 2)`; adicionar `canceladoMotivo String?`.
4. No `model Parcela`: trocar `formaRecebimento String?` por `formaRecebimento FormaPagamento?`.

- [x] **Step 2: Criar a migração SEM aplicar (para editar o SQL do cast)**

Run: `node node_modules/prisma/build/index.js migrate dev --create-only --name contratos_saneamento`
Expected: cria `prisma/migrations/<ts>_contratos_saneamento/migration.sql` sem aplicar.

- [x] **Step 3: Editar a migração para zerar os texto-livre ANTES do cast**

Abrir o `migration.sql` gerado. **No topo do arquivo** (antes de qualquer `ALTER TABLE ... TYPE`), inserir:
```sql
-- Dados de teste sem backfill: zera as formas texto-livre antes de virar enum (cast falharia).
UPDATE "Contrato" SET "formaPagamento" = NULL;
UPDATE "Parcela" SET "formaRecebimento" = NULL;
```
Garantir que o arquivo também contém o `CREATE TYPE "FormaPagamento"`, o `ALTER TYPE "ParcelaStatus" ADD VALUE 'CANCELADA'`, os `ALTER TABLE` de tipo das colunas, o `DROP COLUMN "entrada"` em `Contrato` e o `ADD COLUMN "canceladoMotivo"`. (Se o Prisma gerou o cast com `USING (...::text::"FormaPagamento")`, manter — com as colunas já NULL ele passa.)

> Nota Postgres: `ALTER TYPE ... ADD VALUE` não pode rodar na mesma transação que usa o valor novo. Como esta migração só **adiciona** o valor `CANCELADA` (não o usa), roda sem problema.

- [x] **Step 4: Aplicar a migração + gerar client**

Run:
```bash
node node_modules/prisma/build/index.js migrate dev --name contratos_saneamento
node node_modules/prisma/build/index.js generate
```
Expected: migração aplicada; client com `FormaPagamento`, `ParcelaStatus.CANCELADA`, `Contrato` sem `entrada`/com `canceladoMotivo`.

- [x] **Step 5: Atualizar o seed-demo (não usar mais entrada/texto-livre)**

Em `prisma/seed-demo.ts`:
- No import de enums, adicionar `FormaPagamento`.
- Linha ~467 (`contrato.upsert` data): **remover** `entrada: dec(entrada),` e trocar `formaPagamento: "Pix + 2x"` por `formaPagamento: FormaPagamento.PIX`.
- Linha ~486 (parcela): trocar `formaRecebimento: pa.pago ? "Pix" : null` por `formaRecebimento: pa.pago ? FormaPagamento.PIX : null`.
- A const `entrada` (linha ~464) continua sendo usada para calcular a parcela nº0 do plano — **manter** o cálculo, só não gravar no contrato.
- Adicionar 1 contrato cancelado de exemplo: após o loop de contratos, escolher um id existente (ex.: `demo-ct-11`) e setar `status: ContratoStatus.CANCELADO, canceladoMotivo: "Noiva desistiu"` via update, e marcar suas parcelas PREVISTA como `CANCELADA`:
```ts
    await prisma.contrato.updateMany({ where: { id: "demo-ct-11" }, data: { status: ContratoStatus.CANCELADO, canceladoMotivo: "Noiva desistiu" } });
    await prisma.parcela.updateMany({ where: { contratoId: "demo-ct-11", status: ParcelaStatus.PREVISTA }, data: { status: ParcelaStatus.CANCELADA } });
```
(`ParcelaStatus` já é importado no seed.)

- [x] **Step 6: Rodar o seed + tsc**

Run:
```bash
npm run db:seed:demo
node node_modules/typescript/bin/tsc --noEmit
```
Expected: seed conclui; tsc reclamará nos arquivos que ainda usam `entrada`/string em forma — **isso é esperado** e será corrigido nas próximas tasks. Se o ÚNICO erro de tsc for nesses pontos (contratos.ts, receber.ts, page.tsx), seguir. (Para isolar o schema, conferir que o seed rodou sem erro de runtime.)

- [x] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed-demo.ts
git commit -m "feat(contratos): schema — FormaPagamento enum, Parcela.CANCELADA, remove Contrato.entrada"
```
(tsc ainda não está limpo aqui; será fechado na Task 5. Commitar o schema isolado é aceitável pois as próximas tasks dependem dele.)

---

## Task 2: `forma.ts` — helpers do enum (puro)

**Files:** Create `src/lib/financeiro/forma.ts`, Test `src/lib/financeiro/__tests__/forma.test.ts`.

- [x] **Step 1: Teste que falha**

Criar `src/lib/financeiro/__tests__/forma.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formaValida, rotuloForma, FORMAS } from "@/lib/financeiro/forma";

describe("forma", () => {
  it("formaValida aceita os 7 valores do enum e rejeita o resto", () => {
    for (const f of ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"]) {
      expect(formaValida(f)).toBe(true);
    }
    expect(formaValida("")).toBe(false);
    expect(formaValida("Pix + 2x")).toBe(false);
    expect(formaValida("pix")).toBe(false);
  });
  it("rotuloForma traduz para PT-BR", () => {
    expect(rotuloForma("PIX")).toBe("Pix");
    expect(rotuloForma("CARTAO_CREDITO")).toBe("Cartão de crédito");
    expect(rotuloForma("CARTAO_DEBITO")).toBe("Cartão de débito");
    expect(rotuloForma("TRANSFERENCIA")).toBe("Transferência");
  });
  it("FORMAS lista os 7 em ordem", () => {
    expect(FORMAS).toHaveLength(7);
    expect(FORMAS[0]).toBe("PIX");
  });
});
```

- [x] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/financeiro/__tests__/forma.test.ts` (módulo inexistente).

- [x] **Step 3: Implementar**

Criar `src/lib/financeiro/forma.ts`:
```ts
// src/lib/financeiro/forma.ts
// Forma de pagamento como seleção (enum). Helpers de validação e rótulo PT-BR, compartilhados
// pelo contrato (forma combinada) e pela baixa de parcela (forma do recebimento).
import type { FormaPagamento } from "@/generated/prisma/client";

export const FORMAS: FormaPagamento[] = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};

/** True se `v` é um valor válido do enum FormaPagamento. */
export function formaValida(v: string): v is FormaPagamento {
  return (FORMAS as string[]).includes(v);
}

/** Rótulo PT-BR de uma forma. */
export function rotuloForma(f: FormaPagamento): string {
  return ROTULO_FORMA[f];
}
```

- [x] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/financeiro/__tests__/forma.test.ts` (3 testes).

- [x] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/forma.ts src/lib/financeiro/__tests__/forma.test.ts
git commit -m "feat(financeiro): forma.ts — enum FormaPagamento (validação + rótulo)"
```
(tsc ainda pode acusar contratos.ts/receber.ts; ok até a Task 5.)

---

## Task 3: `cancelarContrato(opts)` — correção do bug

**Files:** Modify `src/lib/contratos/contratos.ts`, Test `src/lib/contratos/__tests__/contratos.test.ts`.

- [x] **Step 1: Teste de integração que falha (regressão do bug)**

Em `src/lib/contratos/__tests__/contratos.test.ts`, adicionar (usando os imports já existentes do arquivo + os de receber/financeiro; importar `gerarPlanoDePagamento`, `listarContasAReceber`, `resumoReceber` de `@/lib/financeiro/receber`, `registrarRecebimento` idem, e `agingDaLoja` de `@/lib/financeiro/cobranca`):
```ts
describe("contratos: cancelar limpa as parcelas (bug de conciliação)", () => {
  it("manter: previstas viram CANCELADA e somem de receber/atraso; paga continua", async () => {
    const { loja, leadId, vendId } = await semearLojaNoivaVendedora(); // helper já existente OU criar inline
    const r = await criarContratoDaNoiva(loja, leadId, vendId);
    expect(r.ok).toBe(true);
    const cid = r.ok ? r.contratoId : "";
    await editarContrato(loja, cid, { valorTotal: "3000,00" });
    await gerarPlanoDePagamento(loja, cid, { numParcelas: 3, primeiroVencimento: "2026-01-10", periodicidadeDias: 30 });
    // paga a 1ª parcela (numero 1)
    const parcelas = await listarParcelasDoContrato(loja, cid);
    await registrarRecebimento(loja, parcelas[0].id, { valor: parcelas[0].valorPrevisto, forma: "PIX" });

    const antes = await listarContasAReceber(loja, { filtro: "todas" });
    expect(antes.total).toBe(3);

    const cc = await cancelarContrato(loja, cid, { destinoPago: "manter", motivo: "desistiu" });
    expect(cc.ok).toBe(true);

    const abertas = await listarContasAReceber(loja, { filtro: "abertas" });
    expect(abertas.total).toBe(0); // previstas viraram CANCELADA
    const rr = await resumoReceber(loja);
    expect(rr.emAtraso).toBe("0.00");
    const ag = await agingDaLoja(loja);
    expect(ag.noivas.length).toBe(0);
    // a paga continua como recebida
    const recebidas = await listarContasAReceber(loja, { filtro: "recebidas" });
    expect(recebidas.total).toBe(1);
  });

  it("estornar: a paga também vira CANCELADA (sai da receita)", async () => {
    const { loja, leadId, vendId } = await semearLojaNoivaVendedora();
    const r = await criarContratoDaNoiva(loja, leadId, vendId);
    const cid = r.ok ? r.contratoId : "";
    await editarContrato(loja, cid, { valorTotal: "1000,00" });
    await gerarPlanoDePagamento(loja, cid, { numParcelas: 1, primeiroVencimento: "2026-01-10" });
    const ps = await listarParcelasDoContrato(loja, cid);
    await registrarRecebimento(loja, ps[0].id, { valor: ps[0].valorPrevisto, forma: "PIX" });
    await cancelarContrato(loja, cid, { destinoPago: "estornar" });
    const recebidas = await listarContasAReceber(loja, { filtro: "recebidas" });
    expect(recebidas.total).toBe(0);
  });
});
```
> Se já não houver um helper `semearLojaNoivaVendedora`, criar um local no arquivo de teste que cria loja+lead+usuário+usuarioLoja (prefixo `MARK`) e devolve `{ loja, leadId, vendId }`, espelhando o `beforeAll` existente. Garantir limpeza no `afterAll` por `startsWith(MARK)`.

- [x] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/contratos/__tests__/contratos.test.ts` (assinatura nova de `cancelarContrato`; previstas não somem).

- [x] **Step 3: Implementar `cancelarContrato(opts)`**

Em `src/lib/contratos/contratos.ts`, substituir a função `cancelarContrato` por:
```ts
export type DestinoPago = "manter" | "estornar";

export async function cancelarContrato(
  lojaId: string,
  contratoId: string,
  opts: { destinoPago: DestinoPago; motivo?: string },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, contratoId ? lojaId : lojaId);
  const c = await db.contrato.findUnique({ where: { id: contratoId }, select: { status: true } });
  if (!c) return { ok: false, motivo: "contrato_invalido" };
  if (c.status !== "ATIVO") return { ok: false, motivo: "nao_ativo" };

  await prisma.$transaction(async (tx) => {
    const tdb = tenantPrisma(tx, lojaId);
    await tdb.contrato.updateMany({
      where: { id: contratoId },
      data: { status: "CANCELADO", canceladoMotivo: opts.motivo?.trim() || null },
    });
    await tdb.parcela.updateMany({ where: { contratoId, status: "PREVISTA" }, data: { status: "CANCELADA" } });
    if (opts.destinoPago === "estornar") {
      await tdb.parcela.updateMany({
        where: { contratoId, status: "PAGA" },
        data: { status: "CANCELADA", valorRecebido: null, recebidoEm: null, formaRecebimento: null },
      });
    }
  });
  return { ok: true };
}
```
> `tenantPrisma` aceita um client transacional? Conferir a assinatura de `tenantPrisma` (em `src/lib/tenant.ts`) — ele recebe um `PrismaClient`-like; o `tx` do `$transaction(async (tx) => ...)` é compatível. Se `tenantPrisma(tx, ...)` não tipar, usar `tx.contrato.updateMany({ where: { id: contratoId, lojaId }, ... })` etc. com `lojaId` explícito no where (o contrato já foi validado como da loja acima). Manter o comportamento.

- [x] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/contratos/__tests__/contratos.test.ts`.

> Observação: o teste antigo `"edita valores/datas só em ATIVO; cancelar trava edição"` chama `cancelarContrato(loja, id)` sem opts e usa `entrada`. **Atualizar** essa chamada para `cancelarContrato(loja, id, { destinoPago: "manter" })` e **remover** o uso de `entrada` (ver Task 5) — fazer aqui a parte do `cancelarContrato`; a parte de `entrada` fecha na Task 5.

- [x] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/contratos/contratos.ts src/lib/contratos/__tests__/contratos.test.ts
git commit -m "fix(contratos): cancelar marca parcelas como CANCELADA (some dos recebíveis)"
```
(tsc pode acusar `entrada`/forma string em outros arquivos; ok até a Task 5.)

---

## Task 4: `receber.ts` — valida forma + exclui CANCELADA

**Files:** Modify `src/lib/financeiro/receber.ts`, Test `src/lib/financeiro/__tests__/receber.test.ts`.

- [x] **Step 1: Testes que falham**

Em `src/lib/financeiro/__tests__/receber.test.ts`, adicionar (reusar o setup do arquivo):
```ts
it("registrarRecebimento valida a forma (enum)", async () => {
  // usar um contrato+parcela PREVISTA do setup do arquivo; ajustar nomes às vars locais
  const ok = await registrarRecebimento(loja, parcelaPrevistaId, { valor: "100", forma: "PIX" });
  expect(ok.ok).toBe(true);
  const bad = await registrarRecebimento(loja, outraParcelaPrevistaId, { valor: "100", forma: "qualquer" });
  expect(bad).toEqual({ ok: false, motivo: "forma_invalida" });
});
```
> Adaptar `parcelaPrevistaId`/`outraParcelaPrevistaId` aos dados do `beforeAll` existente em `receber.test.ts` (criar duas parcelas PREVISTA se necessário). Se o arquivo não tiver setup reaproveitável, criar um `describe` próprio com `beforeAll`/`afterAll` (prefixo `MARK`).

- [x] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/financeiro/__tests__/receber.test.ts`.

- [x] **Step 3: Implementar**

Em `src/lib/financeiro/receber.ts`:
1. Import: `import { formaValida } from "@/lib/financeiro/forma";`. Trocar o tipo de `ParcelaStatus` import se necessário (já importa de `@/generated/prisma/client`).
2. Em `ResultadoOp`, adicionar o motivo `"forma_invalida"`.
3. Em `registrarRecebimento`, após validar valor/data e antes do `updateMany`, validar a forma:
```ts
  const forma = input.forma?.trim();
  if (forma && !formaValida(forma)) return { ok: false, motivo: "forma_invalida" };
```
e no `data` do update usar `formaRecebimento: forma || null` (em vez do `input.forma?.trim() || null` atual). O cast para o enum é automático (string válida).
4. Em `listarContasAReceber`, o filtro `"todas"` hoje usa `status: {}` — trocar para excluir cancelada:
```ts
      : { status: { not: "CANCELADA" as const } };
```
(os filtros `abertas`/`atrasadas`/`recebidas` já fixam `PREVISTA`/`PAGA`, então não mudam.)
5. Em `listarParcelasDoContrato`, manter as canceladas visíveis mas marcadas: incluir `status` no retorno já existe (`ParcelaView.status`); nenhuma query muda (o detalhe do contrato mostra todas com rótulo). **Não** filtrar aqui — a UI rotula `CANCELADA`.

- [x] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/financeiro/__tests__/receber.test.ts`.

- [x] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/receber.ts src/lib/financeiro/__tests__/receber.test.ts
git commit -m "feat(financeiro): registrarRecebimento valida forma (enum) + 'todas' exclui CANCELADA"
```

---

## Task 5: `editarContrato` — remove entrada + valida forma

**Files:** Modify `src/lib/contratos/contratos.ts`, Test `src/lib/contratos/__tests__/contratos.test.ts`.

- [x] **Step 1: Atualizar/adicionar testes**

No `contratos.test.ts`:
- No teste existente `"edita valores/datas só em ATIVO; cancelar trava edição"`, **remover** `entrada: "1.000"` da chamada e a asserção `expect(det.entrada).toBe("1000.00")` (o campo não existe mais); trocar `formaPagamento: "50% + 2x"` por `formaPagamento: "PIX"`.
- Adicionar:
```ts
it("editarContrato valida a forma de pagamento (enum)", async () => {
  const { loja, leadId, vendId } = await semearLojaNoivaVendedora();
  const r = await criarContratoDaNoiva(loja, leadId, vendId);
  const id = r.ok ? r.contratoId : "";
  expect((await editarContrato(loja, id, { formaPagamento: "PIX" })).ok).toBe(true);
  expect(await editarContrato(loja, id, { formaPagamento: "qualquer" })).toEqual({ ok: false, motivo: "forma_invalida" });
});
```

- [x] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/contratos/__tests__/contratos.test.ts`.

- [x] **Step 3: Implementar**

Em `src/lib/contratos/contratos.ts`:
1. Import `import { formaValida } from "@/lib/financeiro/forma";`.
2. Em `ResultadoOp`, adicionar `"forma_invalida"` aos motivos.
3. Em `PatchContrato`, **remover** `entrada?: string;`.
4. Em `editarContrato`, **remover** o bloco `if (patch.entrada !== undefined) { ... }` inteiro.
5. Em `editarContrato`, na parte de `formaPagamento`, validar:
```ts
  if (patch.formaPagamento !== undefined) {
    const f = patch.formaPagamento.trim();
    if (f === "") data.formaPagamento = null;
    else if (!formaValida(f)) return { ok: false, motivo: "forma_invalida" };
    else data.formaPagamento = f;
  }
```
(substituindo a linha atual `if (patch.formaPagamento !== undefined) data.formaPagamento = vazioNull(patch.formaPagamento);`).
6. No tipo `ContratoDetalhe` e em `obterContrato`, **remover** `entrada` (campo e mapeamento). `formaPagamento` continua `string | null` (o valor do enum).

- [x] **Step 4: Rodar e ver passar (arquivo + suíte)** — `npx vitest run src/lib/contratos/__tests__/contratos.test.ts` e depois `npx vitest run`.

- [x] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/contratos/contratos.ts src/lib/contratos/__tests__/contratos.test.ts
git commit -m "feat(contratos): remove campo entrada (vai p/ plano) + valida forma no editar"
```
> Aqui o tsc da lib deve ficar limpo. Se a página/PDF ainda usarem `entrada`, fecham nas Tasks 6 e 7.

---

## Task 6: PDF + `dadosParaPdf` — mostra o plano

**Files:** Modify `src/lib/contratos/pdf.ts`, `src/lib/contratos/contratos.ts`, Test `src/lib/contratos/__tests__/pdf.test.ts`.

- [x] **Step 1: Teste**

Em `pdf.test.ts`, adicionar/ajustar para o novo `DadosContrato` (sem `entrada`, com `parcelas`):
```ts
it("renderiza o plano de pagamento quando há parcelas", () => {
  const pdf = gerarPdfContrato({
    lojaNome: "L", noivaNome: "Ana", valorTotal: "R$ 3.000,00", formaPagamento: "Pix",
    parcelas: [
      { descricao: "Entrada", valor: "R$ 900,00", vencimento: "10/06/2026", forma: "Pix" },
      { descricao: "Parcela 1/2", valor: "R$ 1.050,00", vencimento: "10/07/2026" },
    ],
  });
  const txt = Buffer.from(pdf).toString("latin1");
  expect(txt).toContain("Entrada");
  expect(txt).toContain("Parcela 1/2");
});
```
> Conferir o nome real da função de geração em `pdf.ts` (ex.: `gerarPdfContrato`) e o tipo de retorno (Uint8Array/Buffer) e ajustar o teste à API real.

- [x] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/contratos/__tests__/pdf.test.ts`.

- [x] **Step 3: Implementar**

Em `src/lib/contratos/pdf.ts`:
1. No tipo `DadosContrato`: **remover** `entrada?: string;` e adicionar `parcelas?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];`. Manter `formaPagamento?: string` (agora o rótulo do método).
2. Em `montarLinhas`, na seção "VALORES E PAGAMENTO", substituir as linhas de "Entrada / Sinal" por uma renderização do plano:
```ts
  add("VALORES E PAGAMENTO", 12);
  dado("Valor total", d.valorTotal);
  dado("Forma de pagamento", d.formaPagamento);
  if (d.parcelas && d.parcelas.length > 0) {
    vazio();
    add("Plano de pagamento:", 11);
    for (const p of d.parcelas) {
      const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
      const forma = p.forma ? ` · ${p.forma}` : "";
      add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
    }
  }
  vazio();
```

Em `src/lib/contratos/contratos.ts`, `dadosParaPdf`: substituir `entrada: c.entrada != null ? brl(c.entrada) : undefined` e construir `parcelas` a partir das parcelas não-canceladas. Adicionar import `import { listarParcelasDoContrato } from "@/lib/financeiro/receber";` e `import { rotuloForma } from "@/lib/financeiro/forma";`:
```ts
  const parcelas = (await listarParcelasDoContrato(lojaId, contratoId))
    .filter((p) => p.status !== "CANCELADA")
    .map((p) => ({
      descricao: p.descricao ?? (p.numero === 0 ? "Entrada" : `Parcela ${p.numero}`),
      valor: brl(p.valorPrevisto),
      vencimento: dataBR.format(p.vencimento),
      forma: p.formaRecebimento ? rotuloForma(p.formaRecebimento) : undefined,
    }));
```
e no objeto de retorno trocar `entrada: ...` por `parcelas, formaPagamento: c.formaPagamento ? rotuloForma(c.formaPagamento) : undefined,`.
> `listarParcelasDoContrato` retorna `formaRecebimento: string | null` — como agora é o enum, o valor é um `FormaPagamento`. Se o tipo do `ParcelaView.formaRecebimento` for `string | null`, fazer `rotuloForma(p.formaRecebimento as FormaPagamento)` ou ajustar o tipo do view para `FormaPagamento | null`.

- [x] **Step 4: Rodar e ver passar (arquivo + suíte)** — `npx vitest run src/lib/contratos/__tests__/pdf.test.ts` e `npx vitest run`.

- [x] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/contratos/pdf.ts src/lib/contratos/contratos.ts src/lib/contratos/__tests__/pdf.test.ts
git commit -m "feat(contratos): PDF mostra o plano de pagamento (entrada = parcela nº0)"
```

---

## Task 7: Telas — select de forma, diálogo de cancelar, sem campo entrada

**Files:** Modify `src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx`, `src/app/(app)/loja/[lojaId]/contratos/actions.ts`.

- [x] **Step 1: Ação de cancelar com opts**

Em `contratos/actions.ts`, trocar `cancelarContratoAction`:
```ts
export const cancelarContratoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "contratoId");
  const destinoPago = str(formData, "destinoPago") === "estornar" ? "estornar" : "manter";
  const r = await cancelarContrato(lojaId, id, { destinoPago, motivo: str(formData, "motivo") });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=cancelado` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});
```

- [x] **Step 2: Página — remover campo entrada, select de forma, diálogo de cancelar**

Em `contratos/[contratoId]/page.tsx`:
1. **Remover** o `<Campo name="entrada" ... />` do form de editar (o bloco "Valores e pagamento").
2. Trocar o `<Campo name="formaPagamento" .../>` por um `<select name="formaPagamento">` com os valores do enum. Importar `import { FORMAS, ROTULO_FORMA } from "@/lib/financeiro/forma";` e renderizar:
```tsx
<label className="flex flex-col gap-1">
  <span className={rotulo}>Forma de pagamento</span>
  <select name="formaPagamento" defaultValue={c.formaPagamento ?? ""} className={campo}>
    <option value="">—</option>
    {FORMAS.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
  </select>
</label>
```
3. No bloco do plano de pagamento (a baixa de parcela, form `registrarRecebimentoAction`), trocar o `<input name="forma" .../>` por um `<select name="forma">` igual (com opção vazia + FORMAS).
4. Trocar o botão/forma de cancelar por um `<details>` "Cancelar contrato" contendo o diálogo: anula abertas (texto informativo), rádios `destinoPago` (manter/estornar) e `motivo`:
```tsx
{podeMexer && c.status === "ATIVO" && (
  <details className="border-t border-borda-suave pt-4">
    <summary className="w-fit cursor-pointer text-[13px] text-bordo">Cancelar contrato</summary>
    <form action={cancelarContratoAction} className="flex flex-col gap-3 pt-3">
      <input type="hidden" name="contratoId" value={c.id} />
      <p className="text-[13px] text-grafite">As parcelas em aberto serão anuladas. Sobre o que já foi recebido:</p>
      <label className="flex items-center gap-2 text-[14px] text-tinta"><input type="radio" name="destinoPago" value="manter" defaultChecked /> Cliente perdeu o sinal — mantém no caixa</label>
      <label className="flex items-center gap-2 text-[14px] text-tinta"><input type="radio" name="destinoPago" value="estornar" /> Devolvi o valor — estorna do caixa</label>
      <input name="motivo" placeholder="Motivo (opcional)" aria-label="Motivo do cancelamento" className={campo} />
      <button type="submit" className={botaoSuave}>Confirmar cancelamento</button>
    </form>
  </details>
)}
```
(remover o form antigo de cancelar.) Reaproveitar as classes `campo`/`rotulo`/`botaoSuave` já usadas no arquivo; se os nomes diferirem, usar os equivalentes locais.
5. Se a página exibe `c.entrada` / `det.entrada` em algum lugar (resumo/cabeçalho), remover. O resumo de "Total do plano" e a divergência (`planoDivergente`) continuam.
6. Se a lista de parcelas (plano) exibe `formaRecebimento`, mostrar `rotuloForma(...)`; marcar parcelas `status === "CANCELADA"` com rótulo "cancelada" e sem ações.

- [x] **Step 3: tsc + conferir**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: **limpo** (fecha todos os usos de `entrada`/forma string). Conferir que não restou nenhuma referência a `.entrada` no app: `grep -rn "\.entrada\b" src/app src/lib | grep -v node_modules` deve voltar vazio (fora de `gerarPlanoDePagamento`/seed, que usam `entrada` como input local, não campo do contrato).

- [x] **Step 4: Verificação final**

Run: `npx vitest run`
Expected: suíte verde.

- [x] **Step 5: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx" "src/app/(app)/loja/[lojaId]/contratos/actions.ts"
git commit -m "feat(contratos): select de forma + diálogo de cancelar (manter/estornar) + sem campo entrada"
```

---

## Self-Review

**Cobertura do spec:** §4 modelo (enum, CANCELADA, Contrato, Parcela) → Task 1; §5 cancelamento → Task 3 (+ ação/UI Task 7); §6 entrada única → Tasks 5 (remove campo) + 6 (PDF/plano); §7 forma seleção → Tasks 2 (helper) + 4 (baixa) + 5 (contrato) + 7 (UI); §8 testes → Tasks 2/3/4/5/6; exclusão de CANCELADA das leituras → Task 1 (status) + Task 4 ("todas"); seed → Task 1.

**Placeholders:** os pontos com "conferir nome real" (helper de setup nos testes, nome da função do PDF, tipo do view) têm instrução explícita de verificar no arquivo real — não são TODOs abertos, são adaptações pontuais ao código existente, com o comportamento esperado fixado.

**Consistência de tipos:** `FormaPagamento` (Task 1) usado em `forma.ts` (Task 2), `receber.ts` (Task 4), `contratos.ts` (Tasks 5/6), UI (Task 7). `cancelarContrato(lojaId, id, { destinoPago, motivo })` (Task 3) chamado igual na ação (Task 7) e nos testes. `ParcelaStatus.CANCELADA` (Task 1) consumido em Tasks 3/4/6/7. Motivo `forma_invalida` adicionado em `ResultadoOp` de `editarContrato` (Task 5) e `receber.ts` (Task 4).

**Ordem/risco:** a migração destrutiva é a Task 1 (dados de teste); tsc fica temporariamente vermelho entre as Tasks 1–4 (esperado, documentado) e volta limpo na Task 5/7. A suíte cheia só é exigida verde nas Tasks 5/6/7.
