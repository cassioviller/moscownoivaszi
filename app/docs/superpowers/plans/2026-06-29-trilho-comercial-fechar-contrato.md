# Trilho comercial — Fechar contrato num clique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o fechamento de venda de 3 telas em 1 clique no orçamento (aprova + cria contrato + gera parcelas, atômico), e destravar desconto e itens de serviço/quantidade na UI do orçamento.

**Architecture:** Extrai um `montarPlano` **puro** (em `financeiro/plano.ts`, ao lado da reconciliação) reusado por `gerarPlanoDePagamento` e por uma nova `fecharContratoDeOrcamento` (em `contratos.ts`) que faz aprovar+contrato+parcelas numa `prisma.$transaction` interativa. Comissão **não** é criada aqui (fica com o motor por faixas / `fecharCompetencia`). Gate do um-clique = `leads:criar`. Depois, três fatias de UI no detalhe do orçamento.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 (`tenantPrisma`), Vitest (Postgres real), Tailwind 4. Dinheiro em centavos (`@/lib/dinheiro`).

**Spec:** `docs/superpowers/specs/2026-06-29-trilho-comercial-fechar-contrato-design.md`.

**Comandos do projeto** (rodados de `app/`):
- Testes (arquivo): `node node_modules/vitest/vitest.mjs run <caminho>`
- Tipos: `node node_modules/typescript/bin/tsc --noEmit`
- Commit direto na `main` (regra do `CLAUDE.md`), gates verdes antes de cada commit.

---

## File Structure

- **Modify** `src/lib/financeiro/plano.ts` — adiciona `montarPlano` puro (+ tipos `LinhaPlano`, `PlanoInput`, `ResultadoMontarPlano`).
- **Modify** `src/lib/financeiro/__tests__/plano.test.ts` — testes do `montarPlano`.
- **Modify** `src/lib/financeiro/receber.ts` — `gerarPlanoDePagamento` passa a reusar `montarPlano`.
- **Modify** `src/lib/contratos/contratos.ts` — nova `fecharContratoDeOrcamento`.
- **Modify** `src/lib/contratos/__tests__/contratos.test.ts` — testes da `fecharContratoDeOrcamento`.
- **Modify** `src/app/(app)/loja/[lojaId]/orcamentos/actions.ts` — `fecharContratoAction`.
- **Modify** `src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx` — UI: painel "Fechar contrato", form de desconto, form de item/serviço + quantidade.

---

## Task 1: `montarPlano` puro em `plano.ts`

**Files:**
- Modify: `src/lib/financeiro/plano.ts`
- Test: `src/lib/financeiro/__tests__/plano.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `src/lib/financeiro/__tests__/plano.test.ts` (e incluir `montarPlano` no import existente da linha 2):

```ts
import { totalDoPlanoCentavos, planoDivergeDoTotal, montarPlano } from "@/lib/financeiro/plano";

describe("montarPlano", () => {
  it("entrada + N parcelas somam o total; última absorve o resto", () => {
    const r = montarPlano(100_00, { entrada: "40,00", numParcelas: 3, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(4); // entrada (0) + 3
    expect(r.linhas[0]).toMatchObject({ numero: 0, descricao: "Entrada", valor: 40_00 });
    const soma = r.linhas.reduce((s, l) => s + l.valor, 0);
    expect(soma).toBe(100_00);
    // 60_00 / 3 = 20_00 cada, sem resto
    expect(r.linhas.slice(1).map((l) => l.valor)).toEqual([20_00, 20_00, 20_00]);
  });

  it("sem entrada: só N parcelas, última absorve o resto da divisão", () => {
    const r = montarPlano(100_00, { numParcelas: 3, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas.map((l) => l.valor)).toEqual([33_33, 33_33, 33_34]); // última +1 centavo
    expect(r.linhas[0].numero).toBe(1);
  });

  it("vencimentos avançam de 30 em 30 dias a partir do primeiro", () => {
    const r = montarPlano(90_00, { numParcelas: 2, primeiroVencimento: "2026-07-10" });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.linhas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(r.linhas[1].vencimento.toISOString().slice(0, 10)).toBe("2026-08-09"); // +30d
  });

  it("rejeita nº de parcelas fora de 1..360", () => {
    expect(montarPlano(100_00, { numParcelas: 0, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "num_invalido" });
    expect(montarPlano(100_00, { numParcelas: 361, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "num_invalido" });
  });

  it("rejeita data impossível e entrada maior que o total e valor não-parseável", () => {
    expect(montarPlano(100_00, { numParcelas: 2, primeiroVencimento: "2027-02-30" })).toEqual({ ok: false, motivo: "data_invalida" });
    expect(montarPlano(100_00, { entrada: "200,00", numParcelas: 2, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "entrada_maior" });
    expect(montarPlano(100_00, { entrada: "abc", numParcelas: 2, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "valor_invalido" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/financeiro/__tests__/plano.test.ts`
Expected: FAIL — `montarPlano is not a function` / sem export.

- [ ] **Step 3: Implementar `montarPlano` em `plano.ts`**

No topo de `src/lib/financeiro/plano.ts`, ampliar o import e adicionar a função (depois das existentes):

```ts
import { decParaCentavos, paraCentavos } from "@/lib/dinheiro";
import { diaParaData } from "@/lib/financeiro/datas";

const DIA_MS = 86_400_000;

export type LinhaPlano = { numero: number; descricao: string; valor: number; vencimento: Date };
export type PlanoInput = { entrada?: string; numParcelas: number; primeiroVencimento: string; periodicidadeDias?: number };
export type ResultadoMontarPlano =
  | { ok: true; linhas: LinhaPlano[] }
  | { ok: false; motivo: "num_invalido" | "data_invalida" | "entrada_maior" | "valor_invalido" };

/**
 * Constrói o plano de parcelas (puro, centavos): entrada (nº 0, opcional) + N parcelas, a
 * ÚLTIMA absorvendo o resto da divisão (sem drift). Vencimentos a cada `periodicidadeDias`
 * (default 30) a partir de `primeiroVencimento`. Espelha a regra que vivia embutida em
 * gerarPlanoDePagamento — agora reusada também pelo fechar-contrato atômico.
 */
export function montarPlano(totalC: number, input: PlanoInput): ResultadoMontarPlano {
  const n = Math.trunc(input.numParcelas);
  if (!Number.isInteger(n) || n < 1 || n > 360) return { ok: false, motivo: "num_invalido" };

  let venc0: Date;
  try {
    venc0 = diaParaData(input.primeiroVencimento);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  const periodicidade = Math.trunc(input.periodicidadeDias ?? 30);
  if (periodicidade < 1 || periodicidade > 3650) return { ok: false, motivo: "num_invalido" };

  let entradaC = 0;
  if (input.entrada && input.entrada.trim() !== "") {
    try {
      entradaC = paraCentavos(input.entrada);
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (entradaC > totalC) return { ok: false, motivo: "entrada_maior" };

  const restanteC = totalC - entradaC;
  const base = Math.floor(restanteC / n);
  const resto = restanteC - base * n;

  const linhas: LinhaPlano[] = [];
  if (entradaC > 0) linhas.push({ numero: 0, descricao: "Entrada", valor: entradaC, vencimento: venc0 });
  const startMonth = entradaC > 0 ? 1 : 0;
  for (let i = 1; i <= n; i++) {
    const valor = base + (i === n ? resto : 0);
    const vencimento = new Date(venc0.getTime() + (startMonth + (i - 1)) * periodicidade * DIA_MS);
    linhas.push({ numero: i, descricao: `Parcela ${i}/${n}`, valor, vencimento });
  }
  return { ok: true, linhas };
}
```

> Nota: `decParaCentavos` já era importado; manter os dois (`decParaCentavos, paraCentavos`).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/financeiro/__tests__/plano.test.ts`
Expected: PASS (todos os `describe`, inclusive os antigos).

- [ ] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/plano.ts src/lib/financeiro/__tests__/plano.test.ts
git commit -m "feat(financeiro): montarPlano puro (plano de parcelas reusável)"
```
Expected: tsc limpo; commit criado.

---

## Task 2: `gerarPlanoDePagamento` reusa `montarPlano`

**Files:**
- Modify: `src/lib/financeiro/receber.ts:24-86`
- Test: `src/lib/financeiro/__tests__/receber.test.ts` (existentes — devem passar SEM edição)

- [ ] **Step 1: Adicionar o import do `montarPlano`**

No bloco de imports de `src/lib/financeiro/receber.ts`, acrescentar:

```ts
import { montarPlano } from "@/lib/financeiro/plano";
```

- [ ] **Step 2: Substituir o miolo de cálculo por `montarPlano`**

Em `gerarPlanoDePagamento`, **manter** as validações do contrato (linhas ~30-36: existe/da-loja, ATIVO, sem plano) e **substituir** o trecho que vai do cálculo de `n` até o `createMany`/`return` (linhas ~38-85) por:

```ts
  const plano = montarPlano(decParaCentavos(contrato.valorTotal), input);
  if (!plano.ok) return plano; // motivos (num/data/entrada/valor) ⊂ ResultadoPlano

  // createMany = inserção ATÔMICA (sem plano parcial). O guard carimba lojaId em cada linha.
  await db.parcela.createMany({
    data: plano.linhas.map((l) => ({
      contratoId,
      numero: l.numero,
      descricao: l.descricao,
      valorPrevisto: deCentavos(l.valor),
      vencimento: l.vencimento,
    })) as never,
  });
  return { ok: true };
```

- [ ] **Step 3: Remover imports/constantes que ficaram órfãos**

Run: `grep -n "DIA_MS\|paraCentavos\|diaParaData" src/lib/financeiro/receber.ts`

Se `DIA_MS` (const local, ~linha 16) não tiver mais nenhum uso, **remova a linha** `const DIA_MS = 86_400_000;`. Mantenha `paraCentavos`/`diaParaData` se ainda forem usados por outras funções do arquivo (ex.: `registrarRecebimento`, `adicionarParcela`) — só remova do import o que o passo seguinte (tsc) acusar como não usado.

- [ ] **Step 4: Rodar os testes existentes + tsc**

Run: `node node_modules/vitest/vitest.mjs run src/lib/financeiro/__tests__/receber.test.ts`
Expected: PASS (comportamento idêntico ao anterior).

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/receber.ts
git commit -m "refactor(financeiro): gerarPlanoDePagamento reusa montarPlano (sem mudança de comportamento)"
```

---

## Task 3: `fecharContratoDeOrcamento` (lib atômica)

**Files:**
- Modify: `src/lib/contratos/contratos.ts`
- Test: `src/lib/contratos/__tests__/contratos.test.ts` (novo `describe`, reusa fixtures do arquivo)

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `src/lib/contratos/__tests__/contratos.test.ts`. Reusa os fixtures de módulo já existentes (`loja`, `lead`, `vestido`, `vend`) e o helper `orcamentoAprovado`. Importar a função nova no import de `@/lib/contratos/contratos` do topo do arquivo (acrescentar `fecharContratoDeOrcamento`). Também importar `listarParcelasDoContrato` já está no arquivo:

```ts
describe("fecharContratoDeOrcamento (atômico)", () => {
  it("aprova + cria contrato ATIVO + gera parcelas, num clique", async () => {
    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("criar orçamento falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Vestido Aurora", valorUnitario: "2.000,00" });
    await mudarStatus(loja, r0.orcamentoId, "ENVIADO");

    const r = await fecharContratoDeOrcamento(loja, r0.orcamentoId, {
      cpf: "123.456.789-00", formaPagamento: "PIX", entrada: "500,00", numParcelas: 3, primeiroVencimento: "2026-08-10",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const det = (await obterContrato(loja, r.contratoId))!;
    expect(det.status).toBe("ATIVO");
    expect(det.valorTotal).toBe("2000.00");
    expect(det.orcamentoId).toBe(r0.orcamentoId);

    const parcelas = await listarParcelasDoContrato(loja, r.contratoId);
    expect(parcelas).toHaveLength(4); // entrada + 3
    const soma = parcelas.reduce((s, p) => s + Math.round(Number(p.valorPrevisto) * 100), 0);
    expect(soma).toBe(200_000); // R$2000 em centavos
  });

  it("NÃO cria comissão (fica para o fechamento por competência)", async () => {
    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("criar orçamento falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "X", valorUnitario: "1.000,00" });
    const r = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 1, primeiroVencimento: "2026-08-10" });
    expect(r.ok).toBe(true);
    const comissoes = await prisma.contaPagar.findMany({ where: { lojaId: loja, tipo: "COMISSAO" } });
    expect(comissoes).toHaveLength(0);
  });

  it("recusa orçamento sem itens, recusado, e já-com-contrato (sem criar parcelas órfãs)", async () => {
    // sem itens
    const vazio = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!vazio.ok) throw new Error("falhou");
    expect(await fecharContratoDeOrcamento(loja, vazio.orcamentoId, { numParcelas: 1, primeiroVencimento: "2026-08-10" }))
      .toEqual({ ok: false, motivo: "orcamento_vazio" });

    // já-com-contrato: fechar e tentar de novo
    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Y", valorUnitario: "1.000,00" });
    const ok1 = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 2, primeiroVencimento: "2026-08-10" });
    expect(ok1.ok).toBe(true);
    if (!ok1.ok) return;
    const antes = (await listarParcelasDoContrato(loja, ok1.contratoId)).length;
    const dup = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 5, primeiroVencimento: "2026-09-10" });
    expect(dup).toEqual({ ok: false, motivo: "ja_tem_contrato" });
    const depois = (await listarParcelasDoContrato(loja, ok1.contratoId)).length;
    expect(depois).toBe(antes); // nenhuma parcela órfã
  });

  it("avança a jornada da noiva para contrato_fechado (derivado)", async () => {
    const noiva = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia`, casamentoData: new Date("2026-11-11T00:00:00.000Z") } as never })).id;
    const r0 = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend });
    if (!r0.ok) throw new Error("falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Z", valorUnitario: "1.500,00" });
    await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 2, primeiroVencimento: "2026-08-10" });
    const estagio = estagioDaNoiva(await fatosDaNoiva(loja, noiva));
    expect(estagio).toBe("contrato_fechado");
  });
});
```

> `MARK`, `tenantPrisma`, `estagioDaNoiva`, `fatosDaNoiva`, `listarParcelasDoContrato`, `criarOrcamento`, `adicionarItem`, `mudarStatus`, `obterContrato` já estão importados no arquivo. Só **acrescente `fecharContratoDeOrcamento`** ao import de `@/lib/contratos/contratos`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: FAIL — `fecharContratoDeOrcamento` não existe.

- [ ] **Step 3: Implementar `fecharContratoDeOrcamento`**

Em `src/lib/contratos/contratos.ts`, acrescentar os imports e a função. Imports a adicionar:

```ts
import { montarPlano } from "@/lib/financeiro/plano";
import { decParaCentavos } from "@/lib/dinheiro"; // somar ao import já existente { paraCentavos, deCentavos }
import { formaValida } from "@/lib/financeiro/forma"; // já importado junto de rotuloForma — confirmar
import type { FormaPagamento } from "@/generated/prisma/client"; // já importado
```

Função (após `criarContratoDaNoiva`):

```ts
export type ResultadoFechar =
  | { ok: true; contratoId: string }
  | {
      ok: false;
      motivo:
        | "orcamento_invalido"
        | "orcamento_vazio"
        | "ja_tem_contrato"
        | "num_invalido"
        | "data_invalida"
        | "entrada_maior"
        | "valor_invalido"
        | "forma_invalida";
    };

/**
 * Fecha a venda num passo: aprova o orçamento + cria o contrato ATIVO + gera o plano de
 * parcelas, tudo numa transação (rollback total em erro). NÃO cria comissão — o motor por
 * faixas a deriva no fecharCompetencia (por Contrato.fechadoEm). Decisão: spec 2026-06-29.
 */
export async function fecharContratoDeOrcamento(
  lojaId: string,
  orcamentoId: string,
  input: { cpf?: string; formaPagamento?: string; entrada?: string; numParcelas: number; primeiroVencimento: string },
): Promise<ResultadoFechar> {
  const db = tenantPrisma(prisma, lojaId);
  const orc = await db.orcamento.findUnique({
    where: { id: orcamentoId },
    include: { itens: true, lead: { select: { casamentoData: true } }, contrato: { select: { id: true } } },
  });
  if (!orc) return { ok: false, motivo: "orcamento_invalido" };
  if (orc.status === "RECUSADO") return { ok: false, motivo: "orcamento_invalido" };
  if (orc.contrato) return { ok: false, motivo: "ja_tem_contrato" };
  if (orc.itens.length === 0) return { ok: false, motivo: "orcamento_vazio" };

  const forma = (input.formaPagamento ?? "").trim();
  if (forma !== "" && !formaValida(forma)) return { ok: false, motivo: "forma_invalida" };

  const totalStr = calcularTotais(orc.itens, orc.descontoTipo, orc.descontoValor).total;
  const plano = montarPlano(decParaCentavos(totalStr), {
    entrada: input.entrada,
    numParcelas: input.numParcelas,
    primeiroVencimento: input.primeiroVencimento,
  });
  if (!plano.ok) return plano; // num/data/entrada/valor ⊂ ResultadoFechar

  // Casa a reserva pelo vestido do item (mesma regra do criarContratoDeOrcamento).
  const itemVestido = orc.itens.find((i) => i.tipo === "VESTIDO");
  const reservas = await listarVestidosReservadosDaNoiva(lojaId, orc.leadId);
  const reserva = itemVestido?.vestidoId
    ? (reservas.find((r) => r.vestidoId === itemVestido.vestidoId) ?? null)
    : reservas.length === 1
      ? reservas[0]
      : null;

  try {
    const contratoId = await prisma.$transaction(async (tx) => {
      // tx NÃO passa pelo guard do tenant → lojaId explícito em todo where/data.
      await tx.orcamento.updateMany({
        where: { id: orcamentoId, lojaId, status: { in: ["RASCUNHO", "ENVIADO", "APROVADO"] } },
        data: { status: "APROVADO", aprovadoEm: new Date() },
      });
      const c = await tx.contrato.create({
        data: {
          lojaId,
          leadId: orc.leadId,
          orcamentoId,
          vendedoraId: orc.vendedoraId,
          bloqueioVestidoId: reserva?.id ?? null,
          status: "ATIVO",
          cpf: input.cpf?.trim() || null,
          valorTotal: totalStr,
          vestidoDescricao: reserva ? `${reserva.codigo} · ${reserva.nome}` : (itemVestido?.descricao ?? null),
          formaPagamento: forma === "" ? null : (forma as FormaPagamento),
          dataCasamento: orc.lead.casamentoData ?? reserva?.casamentoData ?? null,
          observacoes: orc.observacoes ?? null,
        } as never,
      });
      await tx.parcela.createMany({
        data: plano.linhas.map((l) => ({
          lojaId,
          contratoId: c.id,
          numero: l.numero,
          descricao: l.descricao,
          valorPrevisto: deCentavos(l.valor),
          vencimento: l.vencimento,
        })) as never,
      });
      return c.id;
    });
    return { ok: true, contratoId };
  } catch (e) {
    if (ehErroP2002(e)) return { ok: false, motivo: "ja_tem_contrato" }; // corrida no orcamentoId @unique
    throw e;
  }
}
```

> `calcularTotais`, `listarVestidosReservadosDaNoiva`, `ehErroP2002`, `tenantPrisma`, `prisma`, `deCentavos` já estão no arquivo. Se o `tsc` reclamar do `as never` nos `create`/`createMany`, é o mesmo motivo já documentado em `criarContratoDeOrcamento` (mantenha o cast).

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: PASS (inclusive os testes antigos do arquivo).

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contratos/contratos.ts src/lib/contratos/__tests__/contratos.test.ts
git commit -m "feat(contratos): fecharContratoDeOrcamento — aprova+contrato+parcelas atômico"
```

---

## Task 4: `fecharContratoAction` + painel "Fechar contrato" na UI

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/orcamentos/actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx`

- [ ] **Step 1: Criar a action (gate `leads:criar`)**

Em `orcamentos/actions.ts`, adicionar ao import de `@/lib/orcamentos/orcamentos` nada novo, mas importar a lib de contratos e criar a action:

```ts
import { fecharContratoDeOrcamento } from "@/lib/contratos/contratos";

export const fecharContratoAction = acaoAutorizada("leads", "criar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const r = await fecharContratoDeOrcamento(lojaId, id, {
    cpf: str(formData, "cpf"),
    formaPagamento: str(formData, "formaPagamento"),
    entrada: str(formData, "entrada"),
    numParcelas: Number(str(formData, "numParcelas") || "1"),
    primeiroVencimento: str(formData, "primeiroVencimento"),
  });
  if (!r.ok) redirect(`${detalhe(lojaId, id)}?erro=${r.motivo}`);
  redirect(`/loja/${lojaId}/contratos/${r.contratoId}?ok=fechado`);
});
```

- [ ] **Step 2: Resolver `podeCriar` na page**

Em `orcamentos/[orcamentoId]/page.tsx`, no `Promise.all` de permissões (~linhas 65-68), acrescentar `leads:criar`:

```ts
  const [podeVer, podeEditar, podeCriar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
  ]);
```

- [ ] **Step 3: Acrescentar avisos novos no mapa `AVISOS`**

No objeto `AVISOS` da page, adicionar entradas para os motivos da fechar-action e o ok:

```ts
  orcamento_vazio: "Adicione ao menos um item antes de aprovar.",
  forma_invalida: "Forma de pagamento inválida.",
  num_invalido: "Número de parcelas inválido (1 a 360).",
  data_invalida: "Data de vencimento inválida.",
  entrada_maior: "A entrada não pode ser maior que o total.",
```

(`fechado` é tratado na page do **contrato** — ver Step 5.)

- [ ] **Step 4: Renderizar o painel "Fechar contrato"**

Importar a action no topo da page (junto das outras de `../actions`): acrescentar `fecharContratoAction`. Importar também as formas: `import { FORMAS, ROTULO_FORMA } from "@/lib/financeiro/forma";`.

Na seção de ações (bloco `orc.status === "APROVADO" ? ... : ...`), trocar o **botão "Gerar contrato"** (quando `!orc.contratoId`) e também oferecer o fechamento direto em RASCUNHO/ENVIADO. Inserir, dentro da `<section>` de ações, antes/ao lado do fluxo existente, este painel quando fechável e com permissão:

```tsx
{!orc.contratoId && orc.status !== "RECUSADO" && orc.itens.length > 0 && podeCriar && (
  <details className="w-full rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
    <summary className="cursor-pointer list-none font-display text-[18px] font-light text-tinta marker:content-['']">
      Fechar contrato
      <span className="ml-2 text-[12px] text-cinza-fumo">aprova, gera o contrato e o plano de parcelas</span>
    </summary>
    <form action={fecharContratoAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="orcamentoId" value={orc.id} />
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">CPF (opcional)</span>
        <input name="cpf" defaultValue={orc.cpf ?? ""} className={`${inputBase} w-44`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Forma</span>
        <select name="formaPagamento" defaultValue="" className={`${inputBase} w-40`}>
          <option value="">—</option>
          {FORMAS.map((f) => (
            <option key={f} value={f}>{ROTULO_FORMA[f]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Entrada (opcional)</span>
        <input name="entrada" placeholder="0,00" className={`${inputBase} w-32`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Nº parcelas</span>
        <input name="numParcelas" type="number" min={1} max={360} defaultValue={1} className={`${inputBase} w-24`} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">1º vencimento</span>
        <input name="primeiroVencimento" type="date" className={`${inputBase} w-44`} required />
      </label>
      <button type="submit" className={botaoPrincipal}>Fechar contrato</button>
    </form>
  </details>
)}
```

> O fluxo antigo (Aprovar → Gerar contrato → plano no contrato) **permanece** para quem não tem `leads:criar`: mantenha o botão "Gerar contrato" existente, mas envolva-o em `{podeEditar && !podeCriar && (...)}` para não duplicar com o painel. O bloco "Aprovar/Enviado/Recusado" continua igual.

> O `<select>` de forma reusa `FORMAS`/`ROTULO_FORMA` de `@/lib/financeiro/forma` (enum: `PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `DINHEIRO`, `BOLETO`, `TRANSFERENCIA`, `OUTRO`) — mesmo padrão da página do contrato. DRY, sem valores hardcoded.

- [ ] **Step 5: Tratar `?ok=fechado` na page do contrato**

Em `src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx`, no mapa de avisos `ok`, adicionar (se houver um objeto de avisos; senão, adicionar a string ao tratamento existente):

```ts
  fechado: "Contrato fechado — parcelas geradas.",
```

- [ ] **Step 6: tsc + verificação + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

Run (suite cheia das libs tocadas, garantir sem regressão):
`node node_modules/vitest/vitest.mjs run src/lib/contratos src/lib/financeiro src/lib/orcamentos`
Expected: PASS.

```bash
git add "src/app/(app)/loja/[lojaId]/orcamentos/actions.ts" "src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx" "src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx"
git commit -m "feat(orcamentos): painel Fechar contrato num clique (gate leads:criar)"
```

---

## Task 5: Desconto na UI

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx`

`definirDescontoAction` já existe e já é importável de `../actions`. O `obterOrcamento` já devolve `orc.descontoTipo`, `orc.descontoValor` e `orc.totais` (subtotal/desconto/total).

- [ ] **Step 1: Importar a action**

No import de `../actions` da page, acrescentar `definirDescontoAction`.

- [ ] **Step 2: Renderizar a seção de desconto + total**

Inserir, logo após a `</section>` de "Vestidos escolhidos" (antes de "Vestidos indicados"), um bloco que mostra o total sempre e, quando `podeMexer`, o form de desconto:

```tsx
<section className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]">
  <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Valores</h2>
  <dl className="flex flex-col gap-1 text-[14px]">
    <div className="flex justify-between"><dt className="text-cinza-fumo">Subtotal</dt><dd className="tabular-nums text-tinta">{brl(orc.totais.subtotal)}</dd></div>
    <div className="flex justify-between"><dt className="text-cinza-fumo">Desconto</dt><dd className="tabular-nums text-tinta">− {brl(orc.totais.desconto)}</dd></div>
    <div className="flex justify-between border-t border-borda-suave pt-1"><dt className="text-grafite">Total</dt><dd className="font-display text-[18px] font-light tabular-nums text-bordo">{brl(orc.totais.total)}</dd></div>
  </dl>
  {podeMexer && (
    <form action={definirDescontoAction} className="flex flex-wrap items-end gap-3 border-t border-borda-suave pt-3">
      <input type="hidden" name="orcamentoId" value={orc.id} />
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Desconto combinado</span>
        <select name="tipo" defaultValue={orc.descontoTipo ?? ""} className={`${inputBase} w-40`}>
          <option value="">Nenhum</option>
          <option value="PERCENTUAL">Percentual (%)</option>
          <option value="VALOR">Valor (R$)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Valor</span>
        <input name="valor" defaultValue={orc.descontoValor ?? ""} placeholder="0,00" className={`${inputBase} w-32`} />
      </label>
      <button type="submit" className={botaoSuave}>Aplicar desconto</button>
    </form>
  )}
</section>
```

> Deixar "Nenhum" + valor vazio chama `definirDesconto(..., null)` (a action já trata `!tipo || !valor` como limpar). O preview reflete o desconto **salvo** (sem JS de cliente — decisão do spec §5.4).

- [ ] **Step 3: tsc + verificação + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

Run: `node node_modules/vitest/vitest.mjs run src/lib/orcamentos`
Expected: PASS.

```bash
git add "src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx"
git commit -m "feat(orcamentos): desconto na UI com preview de subtotal/desconto/total"
```

---

## Task 6: Itens SERVICO/AJUSTE + quantidade na UI

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx`

`adicionarItemAction` e `editarItemAction` já leem `tipo` e `quantidade`. Falta a UI.

- [ ] **Step 1: Form "Adicionar item ou serviço"**

Dentro da seção "Vestidos indicados" (que só renderiza com `podeMexer`), acrescentar acima da grade de indicados um form de item livre:

```tsx
<form action={adicionarItemAction} className="flex flex-wrap items-end gap-2 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel p-4">
  <input type="hidden" name="orcamentoId" value={orc.id} />
  <label className="flex flex-col gap-1">
    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Tipo</span>
    <select name="tipo" defaultValue="SERVICO" className={`${inputBase} w-36`}>
      <option value="SERVICO">Serviço</option>
      <option value="AJUSTE">Ajuste</option>
      <option value="VESTIDO">Vestido avulso</option>
    </select>
  </label>
  <label className="flex flex-col gap-1">
    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Descrição</span>
    <input name="descricao" className={`${inputBase} w-52`} required />
  </label>
  <label className="flex flex-col gap-1">
    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Valor unitário</span>
    <input name="valorUnitario" placeholder="0,00" className={`${inputBase} w-32`} required />
  </label>
  <label className="flex flex-col gap-1">
    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Qtd</span>
    <input name="quantidade" type="number" min={1} defaultValue={1} className={`${inputBase} w-20`} />
  </label>
  <button type="submit" className={botaoSuave}>Adicionar</button>
</form>
```

- [ ] **Step 2: Mostrar quantidade/subtotal na lista de itens**

Na lista de itens (o componente `Linha`), quando `it.quantidade > 1`, exibir a quantidade e o subtotal. Substituir o bloco do valor por:

```tsx
<div className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
  {it.valorPadrao != null && (
    <span className="text-[11px] text-cinza-fumo">padrão {brl(it.valorPadrao)}</span>
  )}
  <span className="flex items-baseline gap-1.5">
    <span className="text-[10px] uppercase tracking-[0.14em] text-cinza-fumo">orçado</span>
    <span className="font-display text-[16px] font-light tabular-nums text-bordo">{brl(it.valorUnitario)}</span>
  </span>
  {it.quantidade > 1 && (
    <span className="text-[11px] text-cinza-fumo">× {it.quantidade} = {brl(it.subtotal)}</span>
  )}
</div>
```

- [ ] **Step 3: Campo quantidade no form de editar item**

No `<form action={editarItemAction}>` dentro do `<details>` de cada item, acrescentar o campo quantidade antes do botão Salvar:

```tsx
<label className="flex flex-col gap-1">
  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Qtd</span>
  <input name="quantidade" type="number" min={1} defaultValue={it.quantidade} aria-label="Quantidade" className={`${inputBase} w-20`} />
</label>
```

- [ ] **Step 4: tsc + verificação + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

Run (suite cheia das libs tocadas):
`node node_modules/vitest/vitest.mjs run src/lib/orcamentos src/lib/contratos src/lib/financeiro`
Expected: PASS.

```bash
git add "src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx"
git commit -m "feat(orcamentos): itens de serviço/ajuste + quantidade na UI"
```

---

## Verificação final

- [ ] **tsc limpo:** `node node_modules/typescript/bin/tsc --noEmit`
- [ ] **Suíte cheia verde:** `node node_modules/vitest/vitest.mjs run`
- [ ] **Smoke manual (opcional, app no ar):** abrir um orçamento com ≥1 item → "Fechar contrato" com entrada + 3 parcelas → conferir contrato ATIVO com 4 parcelas e nenhuma ContaPagar COMISSAO criada; conferir desconto refletindo no total; adicionar um serviço com qtd 2.
- [ ] Atualizar o `docs/estado-atual.md` com um bloco desta fatia (changelog) — fora do escopo de código, mas recomendado ao fechar.

## Notas de cobertura do spec

- §5.1 `montarPlano` → Task 1 (colocado em `plano.ts`, não `receber.ts` — melhor lar, é o módulo puro de plano).
- §5.2 `fecharContratoDeOrcamento` → Task 3.
- §5.3 action + UI um-clique → Task 4.
- §5.4 desconto na UI → Task 5.
- §5.5 itens SERVICO/AJUSTE + qtd → Task 6.
- §5.6 reconciliação → `planoDivergeDoTotal` já existe; o um-clique soma exatamente o total por construção (Task 1).
- §7 gate `leads:criar` no um-clique → Task 4 Step 1/2.
- §9 testes → Tasks 1 e 3.
