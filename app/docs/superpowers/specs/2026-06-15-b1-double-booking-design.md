# B1 — Double-booking em atendimentos (design)

> Data: 2026-06-15. Bug de alta prioridade do backlog de Atendimento
> (`docs/estado-atual.md`). Fatia própria por exigir migração.

## Problema

`agendarAtendimento` (`src/lib/atendimentos/atendimentos.ts`) tem uma corrida
**TOCTOU** (check-then-act): lê `horasOcupadas` (linha 100) e depois faz
`create` (linha 104) **sem transação e sem constraint de banco**. Duas
requisições concorrentes para o mesmo slot leem a grade vazia, passam pela
validação e ambas inserem → **dois atendimentos no mesmo horário**.

O eixo de conflito é **cabine OU vendedora** (ver `horasOcupadas`, `OR:
[{cabineId}, {vendedoraId}]`): uma cabine não atende duas noivas na mesma hora,
e uma vendedora não está em dois lugares na mesma hora. Um único `@@unique` não
cobre os dois eixos — são necessárias **duas constraints**.

## Decisão

**Constraint de banco como fonte da verdade + tradução de P2002.** O pré-check
`horasOcupadas` continua existindo (UX: mensagem rápida no caso comum e a grade
visual), mas a **garantia** passa a ser do banco. É o padrão otimista já usado
no repo (`vestidos.ts`, `contratos.ts`, `pagar.ts` traduzem P2002). Não há
necessidade de transação serializável.

### Schema (`model Atendimento`)

Duas constraints, espelhando exatamente o pré-check (que é **escopado por
loja**):

```prisma
@@unique([cabineId, inicio])             // cabineId já implica loja (FK p/ Cabine da loja)
@@unique([lojaId, vendedoraId, inicio])  // vendedora é Usuario (pode estar em N lojas) → escopa por loja
```

- `cabineId` é cuid de uma cabine que pertence a uma só loja, então
  `[cabineId, inicio]` já é loja-escopado.
- `vendedoraId` é um `Usuario` que **pode ter vínculo em várias lojas**. O
  pré-check `horasOcupadas` é por-loja (`tenantPrisma`), então a constraint
  inclui `lojaId` para **espelhar o comportamento atual** (a mesma vendedora
  pode, hoje, ter atendimento às 10h na loja A e às 10h na loja B). Mudar isso
  seria mudança de regra — fora do escopo deste bugfix.

`inicio` sempre cai numa hora exata (`instante(dataYMD, hora)`), então as
constraints por hora são corretas.

### Comportamento preservado (não é regressão)

`horasOcupadas` **não filtra por situação** — conta qualquer atendimento no dia
(inclusive `CONCLUIDO`/`FALTOU`). A grade visual mostra esse slot como ocupado
hoje. A constraint preserva isso: existe no máximo **um** atendimento por
`(cabine, inicio)` / `(loja, vendedora, inicio)`, independente de situação.

> **Consequência conhecida (fora de escopo):** após um `FALTOU`, o slot
> continua "ocupado" pela linha — não dá pra reagendar outra noiva ali sem
> cancelar (deletar) a falta. É o comportamento de hoje; rebooking-após-falta
> fica como item futuro, não entra nesta fatia.

### Código (`agendarAtendimento`)

O `create` passa a ser envolvido por try/catch que traduz P2002 →
`{ ok: false, motivo: "indisponivel" }` (motivo já existente — sem mudança no
tipo `ResultadoAgendar`). Qualquer das duas constraints mapeia para o mesmo
motivo; a mensagem de UX "horário indisponível" já cobre ambos os casos. O
pré-check permanece como fast-path.

Helper local `ehErroP2002(e)` no estilo de `contratos.ts`.

## Migração

`prisma migrate dev` adicionando os dois índices únicos. **Risco:** a migração
falha se já existirem linhas duplicadas no banco de dev. Antes de aplicar,
checar:

```sql
SELECT "cabineId", inicio, count(*) FROM "Atendimento"
  GROUP BY "cabineId", inicio HAVING count(*) > 1;
SELECT "lojaId", "vendedoraId", inicio, count(*) FROM "Atendimento"
  GROUP BY "lojaId", "vendedoraId", inicio HAVING count(*) > 1;
```

Se houver duplicatas (dados de teste), resolver manualmente (deletar as
sobras) — **requer OK explícito antes de qualquer DELETE**, conforme CLAUDE.md.
Após migrar, rodar `npx prisma generate` (output custom em
`src/generated/prisma` nem sempre regenera no `migrate dev`).

## Testes (`atendimentos.test.ts`, Postgres real)

1. **Constraint cabine:** insert direto de duas linhas com mesma
   `(cabineId, inicio)` → a 2ª lança P2002.
2. **Constraint vendedora:** duas linhas, mesma `(vendedoraId, inicio)`,
   **cabines diferentes** → a 2ª lança P2002.
3. **Cross-loja permitido:** mesma vendedora, mesmo `inicio`, **lojas
   diferentes** → ambas inserem (prova que o `lojaId` na constraint preserva o
   comportamento atual).
4. **Corrida real (caminho do catch):** dois `agendarAtendimento` no mesmo slot
   via `Promise.all` (ambos os pré-checks leem a grade vazia antes de qualquer
   create) → exatamente um `ok:true`, o outro `ok:false` `"indisponivel"`.
   Este é o teste que prova o fix: o caminho que hoje produz double-booking
   passa a retornar `indisponivel`.

## Fora de escopo

- Transação serializável (a constraint basta).
- Mudar a semântica de FALTOU/CONCLUIDO ocupar slot (rebooking-após-falta).
- Unificar as 3 leituras de atendimento (é o item B3, fatia própria).

## Gates

`tsc --noEmit` limpo + `vitest run` verde (com os 4 testes novos) antes de
commitar na `main`.
