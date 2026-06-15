# Contrato da reserva — Implementation Plan (Fatia 1.5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Steps com checkbox (`- [ ]`).
>
> **Pré-requisito:** a **Fatia 1** (cabeça `Reserva` + `reservas/reservas.ts`) precisa estar entregue. ADR: `docs/adr/0002-contrato-referencia-reserva-e-herda-valor-do-orcamento.md`. Spec: `docs/superpowers/specs/2026-06-15-contrato-da-reserva-design.md`.

**Goal:** O contrato cobre a **reserva inteira** (`Contrato.reservaId`) e **sempre herda o valor do orçamento aprovado** da noiva — nenhuma porta grava mais `valorTotal = "0.00"`.

**Architecture:** Aditiva — `Contrato.reservaId?` (FK `SetNull` → `Reserva`), `bloqueioVestidoId` deprecado mas mantido. `criarContratoDeOrcamento` anexa a reserva confirmada; `criarContratoDaNoiva` deixa de gravar `0.00` e passa a delegar ao orçamento aprovado mais recente (ou recusa `sem_orcamento_aprovado`). Comissão/parcelas inalteradas (derivam de `valorTotal`).

**Gates (commitar direto na `main`):** `tsc --noEmit` limpo + `vitest run` verde; após schema: `npx prisma migrate deploy && npx prisma generate`. (Comandos via `node node_modules/...` se PATH faltar.)

---

## Task 1: Schema — `Contrato.reservaId` + migração + backfill

**Files:**
- Modify: `prisma/schema.prisma` (`Contrato` ~509; `Reserva` — back-relation)
- Create: `prisma/migrations/20260615140000_contrato_reserva/migration.sql`

- [ ] **Step 1: Campo + relação no `Contrato`**

No `model Contrato`, adicionar:
```prisma
  reservaId         String?
```
e na lista de relações:
```prisma
  reserva   Reserva?         @relation(fields: [reservaId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Back-relation no `Reserva`**

No `model Reserva` (criado na Fatia 1), adicionar:
```prisma
  contratos Contrato[]
```

- [ ] **Step 3: Migração SQL**

Criar `prisma/migrations/20260615140000_contrato_reserva/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN "reservaId" TEXT;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: contrato antigo herda a cabeça do seu bloqueio (ligado na migração da Fatia 1).
UPDATE "Contrato" c
SET "reservaId" = b."reservaId"
FROM "BloqueioVestido" b
WHERE c."bloqueioVestidoId" = b."id" AND b."reservaId" IS NOT NULL;
```

- [ ] **Step 4: Aplicar + regenerar**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: aplica `20260615140000_contrato_reserva`; client com `prisma.contrato.reservaId`.

- [ ] **Step 5: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + suíte verde (aditivo).

- [ ] **Step 6: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260615140000_contrato_reserva
git commit -m "feat(contrato): Contrato.reservaId (FK SetNull) + backfill da cabeça

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `criarContratoDeOrcamento` anexa a reserva confirmada

**Files:**
- Modify: `src/lib/contratos/contratos.ts`
- Test: `src/lib/contratos/__tests__/contratos.test.ts`

- [ ] **Step 1: Teste que falha**

Em `contratos.test.ts`, importar a leitura da cabeça e a composição (topo do arquivo):
```ts
import { abrirReserva, adicionarVestido, fecharReserva } from "@/lib/reservas/reservas";
```
Adicionar caso ao `describe("contratos: criação pré-preenchida")`:
```ts
  it("de orçamento aprovado: anexa a reserva confirmada da noiva (reservaId)", async () => {
    const db = tenantPrisma(prisma, loja);
    const noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Cris`, casamentoData: new Date("2027-03-03T00:00:00.000Z") } as never })).id;
    const v = (await db.vestido.create({ data: { codigo: `${MARK}cv`, nome: `${MARK}Lis`, precoBase: 1000 } as never })).id;
    const rr = await abrirReserva(loja, noiva); if (!rr.ok) throw new Error("reserva");
    await adicionarVestido(loja, rr.reservaId, v);
    await fecharReserva(loja, rr.reservaId);

    const o = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend }); if (!o.ok) throw new Error("orc");
    await adicionarItem(loja, o.orcamentoId, { tipo: "VESTIDO", vestidoId: v, descricao: "Lis", valorUnitario: "1.800,00" });
    await mudarStatus(loja, o.orcamentoId, "APROVADO");

    const r = await criarContratoDeOrcamento(loja, o.orcamentoId); if (!r.ok) throw new Error("contrato");
    const det = (await obterContrato(loja, r.contratoId))!;
    expect(det.reservaId).toBe(rr.reservaId);
    expect(det.valorTotal).toBe("1800.00");
  });
```
> `obterContrato` precisa expor `reservaId` — incluir no seu retorno (Step 3).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: FALHA — `reservaId` não é gravado / não existe em `obterContrato`.

- [ ] **Step 3: Implementar a anexação da cabeça**

Em `src/lib/contratos/contratos.ts`, importar a leitura da cabeça:
```ts
import { listarReservasDaNoiva } from "@/lib/reservas/reservas";
```
> (não confundir com `listarVestidosReservadosDaNoiva` de `@/lib/disponibilidade/reservas`, que segue sendo usada para casar o `bloqueioVestidoId` por vestido.)

Em `criarContratoDeOrcamento`, após resolver `reserva` (o bloqueio por vestido, como hoje), resolver também a **cabeça** e a descrição dos vestidos:
```ts
  const itemVestido = orc.itens.find((i) => i.tipo === "VESTIDO");
  const reservasItem = await listarVestidosReservadosDaNoiva(lojaId, orc.leadId); // renomeada na Fatia 1
  const reserva = itemVestido?.vestidoId
    ? (reservasItem.find((r) => r.vestidoId === itemVestido.vestidoId) ?? null)
    : reservasItem.length === 1 ? reservasItem[0] : null;

  // Cabeça (Reserva) confirmada que casa a data do orçamento e, se possível, contém o vestido.
  const cabecas = await listarReservasDaNoiva(lojaId, orc.leadId);
  const dataCas = orc.lead.casamentoData?.getTime();
  const cabecasConfirmadas = cabecas.filter((c) => c.status === "CONFIRMADA" && (dataCas == null || c.casamentoData?.getTime() === dataCas));
  const cabeca =
    (itemVestido?.vestidoId && cabecasConfirmadas.find((c) => c.itens.some((it) => it.vestidoId === itemVestido.vestidoId)))
    ?? (cabecasConfirmadas.length === 1 ? cabecasConfirmadas[0] : null);
  const descricaoVestidos = cabeca && cabeca.itens.length > 0
    ? cabeca.itens.map((it) => `${it.codigo} · ${it.nome}`).join("; ")
    : (reserva ? `${reserva.codigo} · ${reserva.nome}` : (itemVestido?.descricao ?? null));
```
E no `db.contrato.create({ data: { ... } })`, gravar a cabeça e usar a descrição composta:
```ts
        bloqueioVestidoId: reserva?.id ?? null,
        reservaId: cabeca?.id ?? null,
        vestidoDescricao: descricaoVestidos,
```
(`valorTotal`, `dataCasamento`, `orcamentoId`, `vendedoraId` seguem como hoje.)

Incluir `reservaId` no retorno de `obterContrato` (no `select`/`return` do detalhe; o tipo `ContratoDetalhe` ganha `reservaId: string | null`).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: o caso novo passa. **Atenção:** o caso existente "com MÚLTIPLAS reservas, casa a reserva pelo vestido do item" (linha ~84) cria reservas via `reservarVestido` **sem cabeça** — segue passando pela via `bloqueioVestidoId`/`vestidoDescricao` fallback (sem cabeça, `descricaoVestidos` cai no `reserva` por-vestido). Se quebrar, ajustar para montar a reserva via `abrirReserva`+`adicionarVestido`+`fecharReserva`.

- [ ] **Step 5: Gates + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
```bash
git add src/lib/contratos/contratos.ts src/lib/contratos/__tests__/contratos.test.ts
git commit -m "feat(contrato): criarContratoDeOrcamento anexa a reserva confirmada (reservaId)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `criarContratoDaNoiva` herda do orçamento aprovado (fim do `0.00`)

**Files:**
- Modify: `src/lib/contratos/contratos.ts`
- Test: `src/lib/contratos/__tests__/contratos.test.ts`

- [ ] **Step 1: Reescrever o teste que hoje espera `0.00`**

Em `contratos.test.ts`, importar `listarOrcamentosDaNoiva` não é preciso; usar o helper `orcamentoAprovado()` já existente. **Substituir** o caso "da noiva (sem orçamento): valor inicial 0" (linha ~106-112) por:
```ts
  it("da noiva: herda o valor do orçamento aprovado; sem orçamento, recusa", async () => {
    const db = tenantPrisma(prisma, loja);
    // Noiva COM orçamento aprovado → contrato herda o valor (> 0).
    const comOrc = (await db.lead.create({ data: { noivaNome: `${MARK}Bia`, casamentoData: new Date("2027-04-04T00:00:00.000Z") } as never })).id;
    const oc = await criarOrcamento(loja, { leadId: comOrc, vendedoraId: vend }); if (!oc.ok) throw new Error("orc");
    await adicionarItem(loja, oc.orcamentoId, { tipo: "VESTIDO", descricao: "x", valorUnitario: "2.500,00" });
    await mudarStatus(loja, oc.orcamentoId, "APROVADO");
    const r = await criarContratoDaNoiva(loja, comOrc, vend);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await obterContrato(loja, r.contratoId))!.valorTotal).toBe("2500.00");

    // Noiva SEM orçamento aprovado → recusa (nunca 0.00).
    const semOrc = (await db.lead.create({ data: { noivaNome: `${MARK}Lia` } as never })).id;
    expect(await criarContratoDaNoiva(loja, semOrc, vend)).toMatchObject({ ok: false, motivo: "sem_orcamento_aprovado" });

    // Validações de borda seguem antes da busca de orçamento.
    expect(await criarContratoDaNoiva(loja, "x", vend)).toMatchObject({ ok: false, motivo: "lead_invalido" });
    expect(await criarContratoDaNoiva(loja, comOrc, "x")).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: FALHA — `criarContratoDaNoiva` ainda grava `0.00` / não conhece `sem_orcamento_aprovado`.

- [ ] **Step 3: Reescrever `criarContratoDaNoiva`**

Em `src/lib/contratos/contratos.ts`:
- Ampliar `ResultadoCriar` com o motivo `"sem_orcamento_aprovado"`.
- Importar `listarOrcamentosDaNoiva` de `@/lib/orcamentos/orcamentos`.
- Corpo novo:
```ts
export async function criarContratoDaNoiva(lojaId: string, leadId: string, vendedoraId: string): Promise<ResultadoCriar> {
  const db = tenantPrisma(prisma, lojaId);
  const [lead, vinc] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    prisma.usuarioLoja.findUnique({ where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } }, select: { usuarioId: true } }),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };

  // Valor SEMPRE do orçamento aprovado mais recente (nunca 0.00). Sem orçamento → recusa.
  const orcamentos = await listarOrcamentosDaNoiva(lojaId, leadId); // ordenado por createdAt desc
  const aprovado = orcamentos.find((o) => o.status === "APROVADO");
  if (!aprovado) return { ok: false, motivo: "sem_orcamento_aprovado" };
  return criarContratoDeOrcamento(lojaId, aprovado.id);
}
```
> Delegar reusa valor + reserva + descrição e o guard `orcamentoId @unique` (um contrato por orçamento). Se o orçamento já tem contrato, o motivo `ja_tem_contrato` propaga.

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: o caso novo passa.

- [ ] **Step 5: Consertar os DEMAIS casos que usavam `criarContratoDaNoiva` para obter um contrato a editar**

Os casos "edita valores/datas…" (~116) e "editarContrato valida a forma…" (~133) chamam
`criarContratoDaNoiva(loja, lead, vend)` contando com o `0.00`. Agora isso exige orçamento aprovado e
**consome** o orçamento (um contrato por orçamento). Ajustar **cada** um para criar um lead novo + um
orçamento aprovado próprio antes:
```ts
    const db = tenantPrisma(prisma, loja);
    const noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Ed${/* sufixo único do caso */""}`, casamentoData: new Date("2027-06-06T00:00:00.000Z") } as never })).id;
    const oc = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend }); if (!oc.ok) throw new Error("orc");
    await adicionarItem(loja, oc.orcamentoId, { tipo: "VESTIDO", descricao: "x", valorUnitario: "1.000,00" });
    await mudarStatus(loja, oc.orcamentoId, "APROVADO");
    const r = await criarContratoDaNoiva(loja, noiva, vend);
    if (!r.ok) throw new Error("falhou");
```
> Usar um nome de noiva distinto por caso (sufixo) para o `afterAll` por `MARK` continuar limpando tudo. Qualquer outro caso do arquivo que dependia do contrato-da-noiva-a-0 recebe o mesmo tratamento.

- [ ] **Step 6: Gates + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run src/lib/contratos/__tests__/contratos.test.ts`
Expected: arquivo de contratos verde.
```bash
git add src/lib/contratos/contratos.ts src/lib/contratos/__tests__/contratos.test.ts
git commit -m "feat(contrato): criarContratoDaNoiva herda do orçamento aprovado; fim do valor 0.00

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Telas — aviso sem-orçamento + vestidos da reserva no detalhe

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/contratos/actions.ts` (`gerarContratoDaNoivaAction`)
- Modify: `src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx`
- Modify (se o aviso precisar de rótulo): a página que mostra o `?erro=` da geração (perfil da noiva / `contratos/novo`)

- [ ] **Step 1: Mapear o novo `?erro=sem_orcamento_aprovado`**

`gerarContratoDaNoivaAction` já redireciona `?erro=${r.motivo}`. Onde esse `?erro` é exibido (perfil da
noiva e/ou `contratos/novo`), adicionar a mensagem:
```ts
  sem_orcamento_aprovado: "Aprove um orçamento desta noiva antes de gerar o contrato.",
```
(usar o mesmo dicionário de mensagens já existente na página que mostra o erro de geração de contrato.)

- [ ] **Step 2: Detalhe do contrato lista os vestidos da reserva**

Em `contratos/[contratoId]/page.tsx`, onde mostra o vestido, quando o contrato tiver `reservaId`,
listar os vestidos da reserva (carregar via `obterReserva(lojaId, contrato.reservaId)` de
`@/lib/reservas/reservas`, server-side); fallback a `vestidoDescricao` para contratos antigos. Sem
mudança de regra/rota — só exibição.

- [ ] **Step 3: Gates + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
```bash
git add "src/app/(app)/loja/[lojaId]/contratos/actions.ts" "src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx"
git commit -m "feat(contrato): aviso sem-orçamento na geração + vestidos da reserva no detalhe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Regressão do financeiro + verificação + gate final

**Files:**
- Modify: `src/lib/financeiro/__tests__/receber.test.ts`

- [ ] **Step 1: Adaptar `receber.test.ts`**

`receber.test.ts:38` cria o contrato com `criarContratoDaNoiva(lojaId, leadId, vend)` esperando o
comportamento antigo. Ajustar a fixture para criar um **orçamento aprovado** da noiva antes (mesmo
padrão da Task 3 Step 5), para `criarContratoDaNoiva` ter de onde herdar o valor. Se o teste depende de
um `valorTotal` específico, definir o `valorUnitario` do item do orçamento para esse valor.

- [ ] **Step 2: Suíte cheia**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: tudo verde — contratos, **financeiro/receber**, **comissão** (deriva de `valorTotal`, agora
sempre o total do orçamento), e o resto intacto.

- [ ] **Step 3: Verificação visual (app no ar, porta própria)**
```bash
node node_modules/next/dist/bin/next dev -p 5052 &
APP=$!
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:5052/login && break; sleep 2; done
# 1) noiva sem orçamento aprovado → gerar contrato → aviso "Aprove um orçamento…".
# 2) aprovar um orçamento dela → gerar contrato → valor = total do orçamento; detalhe lista os
#    vestidos da reserva confirmada.
kill $APP
```

- [ ] **Step 4: `atelier-design-review` no detalhe do contrato + aviso**

Invocar a skill sobre o detalhe do contrato e o aviso de geração (tom Concierge, sem linguagem fria).
Aplicar ajustes e commitar se houver.

- [ ] **Step 5: `docs/estado-atual.md`**

Registrar a Fatia 1.5 entregue (Contrato.reservaId, valor sempre do orçamento aprovado, fim do `0.00`,
ADR 0002). Mover o ponteiro para a **Fatia 2 (acessórios + preço de pacote)**.

- [ ] **Step 6: Commit**
```bash
git add src/lib/financeiro/__tests__/receber.test.ts docs/estado-atual.md
git commit -m "test+docs(contrato): regressão financeiro com orçamento aprovado + estado-atual (Fatia 1.5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas
- **Comissão/parcelas não mudam de cálculo** — só param de existir contratos a `0.00`.
- Datas de retirada/devolução seguem no contrato; movimentação por peça fica no item da reserva (ADR 0002).
- Aprovar orçamento **não** cria reserva (fora de escopo) — o contrato só referencia a reserva já montada.
