# Spec — Reserva: carrinho multi-item de vestidos (Fatia 1 do núcleo Seleção → Reserva)

> Data: 2026-06-15. Primeira fatia do núcleo **Seleção → Reserva** mapeado em
> `docs/superpowers/research/2026-06-15-atendimento-selecao-reserva.md` (§3.6, fatia 1).
> Objetivo: deixar a vendedora **reservar vários vestidos de uma vez** para a mesma noiva,
> agrupados numa **sacola/reserva**, em vez de uma reserva por vez como hoje — **sem quebrar**
> o motor de disponibilidade, as provas/ajustes, o contrato nem o livro de reservas.

## 1. Problema

Hoje a "reserva" de um vestido é **um `BloqueioVestido` (`tipo = RESERVA_CASAMENTO`)**, criado
um por vez no perfil da noiva (`reservarPelaNoivaAction` → `reservarVestido`). Não existe a noção
de "a noiva reservou estes 3 vestidos juntos": cada bloqueio é solto, o livro de reservas lista
bloqueios soltos, e o desfecho M1 "RESERVOU" joga a vendedora no `#reserva` do perfil sem um
lugar para montar uma seleção. O `Atendimento` termina em "RESERVOU" mas a reserva é firme,
unitária e dispersa.

## 2. Decisão central — migração **aditiva** (não renomear `BloqueioVestido`)

O `BloqueioVestido` faz dupla função: (a) **reserva** de um vestido para um casamento, (b)
**manutenção** de um vestido (sem noiva). Ele também é o **insumo do motor de disponibilidade**
(lido **por vestido**, com `casamentoData` em cada linha) e a raiz de `Atendimento.bloqueioId`
(prova de um vestido) e `Contrato.bloqueioVestidoId`.

Por isso **não** renomeamos a tabela. Em vez disso:

- Criamos uma **cabeça `Reserva`** (a sacola: noiva + data do casamento + status).
- Damos ao `BloqueioVestido` um campo **`reservaId String?`** (FK opcional para `Reserva`).
- Cada `BloqueioVestido` `tipo = RESERVA_CASAMENTO` passa a **pertencer a uma `Reserva`** (é o
  "item" da reserva). Manutenção continua com `reservaId = null`.

**Consequência (o ganho do design):** o motor, a `agenda`, as provas (`Atendimento.bloqueioId`),
o contrato (`Contrato.bloqueioVestidoId`) e a jornada (`leads.ts`) **não mudam** — todos seguem
apontando para o **item** (o vestido específico), que é o nível semanticamente correto. A novidade
é só uma camada de **composição** por cima.

### Por que não as alternativas
- **Renomear `BloqueioVestido → ReservaItem` + cabeça nova:** manutenção **não** é item de reserva;
  renomear a tabela inteira mistura os dois papéis e força migrar ~70 referências + o motor.
  Rejeitado.
- **Mover `casamentoData` para a cabeça:** o motor lê `casamentoData` de cada `BloqueioVestido`.
  Mover quebraria o motor ou exigiria join em todo lugar. Mantemos `casamentoData` **no item**
  (fonte da verdade do motor); a cabeça também guarda `casamentoData` (a data da sacola, usada
  para abrir/agrupar e para a UI), e os itens nascem com a mesma data.

## 3. Modelo de dados

### 3.1 Novo `model Reserva` (cabeça) — entra em `TENANT_MODELS`
```prisma
enum ReservaStatus {
  SACOLA     // em montagem (carrinho aberto)
  RESERVADA  // fechada/confirmada (firme)
  CANCELADA  // cancelada (terminal)
}

model Reserva {
  id            String        @id @default(cuid())
  lojaId        String
  leadId        String
  casamentoData DateTime      // data da sacola; itens nascem com a mesma data
  status        ReservaStatus @default(SACOLA)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  loja  Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead  Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  itens BloqueioVestido[]
}
```
- `Lead` ganha back-relation `reservas Reserva[]`; `Loja` ganha `reservas Reserva[]`.
- `Reserva` entra em `TENANT_MODELS` (`src/lib/tenant.ts`) — toda leitura/escrita via
  `tenantPrisma`.

### 3.2 `BloqueioVestido` ganha `reservaId`
```prisma
model BloqueioVestido {
  // ...campos atuais inalterados...
  reservaId String?
  reserva   Reserva? @relation(fields: [reservaId], references: [id], onDelete: Cascade)
}
```
- `onDelete: Cascade`: cancelar/apagar a cabeça remove os itens (que são bloqueios) — coerente
  com "cancelar a reserva libera os vestidos". `reservaId` é **nullable** porque manutenção e
  dados legados (até o backfill) não têm cabeça.

### 3.3 Migração (hand-authored + `migrate deploy`, padrão do Replit)
1. `CREATE TYPE "ReservaStatus"`; `CREATE TABLE "Reserva"`.
2. `ALTER TABLE "BloqueioVestido" ADD COLUMN "reservaId" TEXT` + FK.
3. **Backfill:** para cada grupo de `BloqueioVestido` com `tipo = 'RESERVA_CASAMENTO'` e
   `leadId IS NOT NULL`, agrupado por **(`lojaId`, `leadId`, `casamentoData`)**, criar **uma**
   `Reserva` (`status = RESERVADA`, `casamentoData` do grupo) e setar `reservaId` nos bloqueios
   do grupo. Reservas existentes da mesma noiva+data **viram uma sacola multi-item** (o efeito
   desejado). `RESERVA_CASAMENTO` com `leadId NULL` (anomalia — nenhuma esperada, pois
   `reservarVestido` sempre seta `leadId`) **fica com `reservaId = NULL`** e é reportada pela
   query de verificação (não recebe cabeça, porque `Reserva.leadId` é `NOT NULL`). **Manutenção
   também fica com `reservaId = NULL`.**
4. Aditiva e não-destrutiva (nenhuma coluna removida). Depois: `npx prisma generate`.

## 4. Camada de dados

Operações da **cabeça** (a sacola/carrinho) ficam num módulo novo e focado
**`src/lib/reservas/sacola.ts`** (`tenantPrisma` sempre). O **primitivo de item** continua sendo
`reservarVestido`/`cancelarReserva` de `src/lib/disponibilidade/reservas.ts` (que já validam o
motor) — `sacola.ts` os chama; a validação anti-double-booking **não muda**.

| Função (nova, em `sacola.ts`) | O que faz |
|---|---|
| `abrirOuObterSacola(lojaId, leadId)` | Acha a `Reserva` aberta (`SACOLA`) da noiva para a `casamentoData` do lead, ou cria uma (`status=SACOLA`). Falha-fechada se o lead não tem `casamentoData` (`sem_data`). |
| `adicionarItem(lojaId, reservaId, vestidoId)` | Garante reserva `SACOLA` da loja; chama `reservarVestido` (valida motor) **com `reservaId` setado no `BloqueioVestido`**; devolve `{ok}`/`{motivo}` (bubble de `indisponivel`/etc.). |
| `removerItem(lojaId, reservaId, bloqueioId)` | Valida que o bloqueio é item dessa reserva `SACOLA`; chama `cancelarReserva`. Se a sacola ficar **sem itens**, apaga a cabeça vazia. |
| `fecharReserva(lojaId, reservaId)` | `SACOLA → RESERVADA`. Rejeita se não é `SACOLA` (`transicao_invalida`) ou se tem **0 itens** (`sacola_vazia`). |
| `cancelarReservaInteira(lojaId, reservaId)` | Apaga a cabeça (cascade remove os itens-bloqueios → libera os vestidos). |
| `listarReservasDaNoiva(lojaId, leadId)` | Cabeças da noiva (`SACOLA`+`RESERVADA`) **com seus itens** (vestido + fases via motor já existente). Substitui o uso flat atual no perfil. |
| `listarReservasDaLoja(lojaId, {passadas?})` | Livro de reservas agora por **cabeça** (uma linha por reserva, N vestidos), ordenado por casamento. |
| `obterSacolaDetalhe(lojaId, reservaId)` | Cabeça + itens, para a vista de montagem. |

**O que `reservarVestido` precisa ganhar:** um parâmetro opcional `reservaId` no input,
carimbado no `create` do `BloqueioVestido`. Sem `reservaId` (chamadas legadas de
manutenção/reserva-pelo-vestido) segue igual. Mudança mínima e retrocompatível.

**Leitura de item (provas/ajustes/movimentação) NÃO muda:** `obterReservaDetalhe(bloqueioId)` em
`disponibilidade/reservas.ts` segue servindo o detalhe **por vestido**. A cabeça lista os itens e
cada item linka para o seu `reservas/[bloqueioId]` (detalhe do item).

## 5. Telas (escopo da fatia)

A migração é additiva, mas três superfícies passam a ser **cabeça-cientes**:

### 5.1 Perfil da noiva — seção `#reserva` (superfície principal — onde M1 "RESERVOU" cai)
`src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx` + `reserva-actions.ts`.
- Mostra a **sacola aberta** (`SACOLA`, se houver) como um carrinho: lista de vestidos (itens),
  cada um com **remover**; o form inline atual "Reservar vestido" (`ReservaLivreInline` +
  `buscarVestidosLivresAction`) passa a **adicionar item à sacola** (`abrirOuObterSacola` +
  `adicionarItem`); botão **"Fechar reserva"** (`fecharReserva`).
- Abaixo, as **reservas fechadas** (`RESERVADA`) da noiva, cada uma com seus vestidos linkando
  para o detalhe do item (`reservas/[bloqueioId]`), e **cancelar reserva**.
- Mensagens flash reusam o padrão `?ok=`/`?erro=` atual. M1 segue chegando em `#reserva`.

### 5.2 Livro de reservas (lista)
`src/app/(app)/loja/[lojaId]/reservas/page.tsx`: uma linha **por reserva (cabeça)** — noiva, data
do casamento (bordô se ≤14d, via `contagem-casamento`), **chips dos N vestidos**, status
(Sacola/Reservada). Mantém o filtro `?quando=passadas`.

### 5.3 Detalhe do item (provas/ajustes/movimentação) — **mantém**
`src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/`: praticamente inalterado (é o detalhe de **um
vestido**: fases, movimentação, provas, ajustes). Único ajuste: um migalho "parte da reserva de
{noiva}" linkando de volta à cabeça (perfil da noiva). **Não** vira `[reservaId]`.

## 6. Estados e regras

- **Status:** `SACOLA → RESERVADA → CANCELADA`. Nova sacola nasce `SACOLA`; "Fechar" →
  `RESERVADA`; "Cancelar reserva" apaga a cabeça (cascade).
- **Bloqueio de inventário:** nesta fatia o item **bloqueia ao ser adicionado** (firme, como
  hoje) — inclusive em `SACOLA`. Ou seja, a sacola **já segura** o vestido. **Desvio consciente**
  do "sacola não bloqueia" da pesquisa (§1.4): o **HOLD que expira** e o **sinal** são a **Fatia 4**;
  trazê-los agora exigiria o motor distinguir bloqueio firme de provisório — fora de escopo. O
  cancelamento (item ou reserva) libera o vestido, igual hoje.
- **Anti-double-booking:** **inalterado** — cada item nasce de `reservarVestido`, validado pelo
  motor por sobreposição de janela. Nenhuma constraint nova.
- **Uma sacola aberta por noiva+data:** `abrirOuObterSacola` é find-or-create; não há duas
  `SACOLA` simultâneas para a mesma `(leadId, casamentoData)`.
- **Sacola vazia:** remover o último item apaga a cabeça; `fecharReserva` rejeita sacola de 0 itens.

## 7. Tratamento de erro

- `adicionarItem`: propaga `motivo` de `reservarVestido` (`indisponivel` com `conflitaComDatas`,
  `sem_data`, `vestido_invalido`, `lead_invalido`) → a UI mostra o aviso atual.
- `fecharReserva`: `transicao_invalida` (não-`SACOLA`) / `sacola_vazia`.
- `removerItem`/`cancelarReservaInteira`: validam que a reserva/bloqueio é da loja (via
  `tenantPrisma`) e que o bloqueio pertence à reserva (`item_invalido`). Falha-fechada.

## 8. Testes (vitest, Prisma real — padrão da casa)

Novos, em `src/lib/reservas/__tests__/sacola.test.ts`:
1. `abrirOuObterSacola` cria uma e reusa a mesma (find-or-create); `sem_data` quando lead sem data.
2. `adicionarItem` cria `BloqueioVestido` com `reservaId` setado **e** bloqueia inventário (segundo
   add do mesmo vestido/data conflita → `indisponivel`).
3. `removerItem` remove o item; remover o último **apaga a cabeça vazia**.
4. `fecharReserva`: `SACOLA→RESERVADA`; rejeita não-`SACOLA` e sacola vazia.
5. `cancelarReservaInteira`: cascade remove os itens → vestidos voltam a ficar livres (provado pelo
   motor).
6. `listarReservasDaNoiva`/`DaLoja` agrupam por cabeça com os itens certos.
7. **Backfill** (teste de migração lógica): bloqueios da mesma noiva+data viram **uma** cabeça
   `RESERVADA`; manutenção fica `reservaId = null`.

**Regressão (devem seguir verdes sem edição de lógica):** `disponibilidade/__tests__/{motor,
reservas,agenda,movimentação}.test.ts`, `atelier/__tests__/atelier.test.ts`,
`atendimentos/__tests__/atendimentos.test.ts`, `contratos/__tests__/contratos.test.ts`. O `tsc`
limpo e a suíte cheia verde são gate de cada commit (CLAUDE.md).

## 9. Fora de escopo (YAGNI — próximas fatias do núcleo)

- **Acessórios** (véu, tiara, sapato) como item heterogêneo + **preço de pacote** → Fatia 2.
- **Filtro por disponibilidade-na-data** na seleção + **favoritos/lista de prova** → Fatia 3.
- **HOLD que expira** + **sinal/depósito** (a sacola que não bloqueia) → Fatia 4.
- **Contrato apontar para a cabeça** `Reserva` (hoje aponta para o item `BloqueioVestido`; fica
  assim — um contrato por vestido é coerente com o modelo atual de comissão/parcela).
- Unificar o detalhe do item numa tela `[reservaId]` — mantém-se `[bloqueioId]`.

## 10. Direção visual (Concierge Atelier)

A sacola é "a seleção da noiva", não um carrinho de e-commerce: vestidos como **peças** (chip com
código + nome), bordô só no CTA "Fechar reserva" e na urgência ≤14d; linguagem humana ("Vestidos
selecionados", "Fechar a reserva"), estado-zero gentil ("Nenhum vestido selecionado ainda"). Passar
pela skill `atelier-design-review` antes de fechar a fatia.
