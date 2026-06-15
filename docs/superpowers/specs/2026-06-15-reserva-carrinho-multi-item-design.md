# Spec — Reserva multi-item de vestidos (Fatia 1 do núcleo Seleção → Reserva)

> Data: 2026-06-15 (revisado pós-grill `grill-with-docs`). Primeira fatia do núcleo
> **Seleção → Reserva** (`docs/superpowers/research/2026-06-15-atendimento-selecao-reserva.md`, §3.6
> fatia 1). Objetivo: a noiva pode reservar **vários vestidos de uma vez** para o seu casamento,
> agrupados numa **Reserva**, em vez de uma reserva solta por vez — **sem quebrar** o motor de
> disponibilidade, as provas/ajustes, o contrato nem o livro de reservas.
>
> Linguagem canônica em `CONTEXT.md` (**Reserva**, **Item da reserva**).

## 1. Problema

Hoje "reserva" = **um `BloqueioVestido` (`tipo = RESERVA_CASAMENTO`)**, criado um por vez no perfil
da noiva. Não existe a noção de "a noiva reservou estes 3 vestidos juntos": cada bloqueio é solto,
o livro lista bloqueios soltos, e o desfecho M1 "RESERVOU" joga a vendedora no `#reserva` sem um
lugar para compor a escolha.

## 2. Decisão central — migração **aditiva** (não renomear `BloqueioVestido`)

`BloqueioVestido` faz dupla função: (a) reserva de um vestido para um casamento, (b) manutenção.
É também o **insumo do motor** (lido **por vestido**, com `casamentoData` em cada linha) e a raiz de
`Atendimento.bloqueioId` e `Contrato.bloqueioVestidoId`. Por isso **não** renomeamos a tabela:

- Criamos a **cabeça `Reserva`** (o compromisso: noiva + data + estado).
- `BloqueioVestido` ganha **`reservaId String?`**. Cada `BloqueioVestido RESERVA_CASAMENTO` passa a
  ser um **item** da reserva. Manutenção fica com `reservaId = null`.

**Ganho:** motor, `agenda`, provas (`Atendimento.bloqueioId`), contrato e jornada **não mudam** —
seguem apontando para o **item** (o vestido), nível semanticamente correto. A novidade é só uma
camada de **composição** por cima.

### Por que não as alternativas
- **Renomear `BloqueioVestido → ItemDaReserva`:** manutenção não é item de reserva; renomear mistura
  papéis e força migrar ~70 referências + o motor. Rejeitado.
- **Mover `casamentoData` para a cabeça:** o motor lê `casamentoData` de cada `BloqueioVestido`.
  Mantemos no item (fonte da verdade do motor); a cabeça também guarda `casamentoData` (data do
  compromisso, usada para abrir/agrupar) e os itens nascem com a mesma data.

## 3. Modelo de dados

### 3.1 Novo `model Reserva` (cabeça) — entra em `TENANT_MODELS`
```prisma
enum ReservaStatus {
  EM_MONTAGEM // a escolha ainda está sendo composta
  CONFIRMADA  // a escolha está fechada
}

model Reserva {
  id            String        @id @default(cuid())
  lojaId        String
  leadId        String
  casamentoData DateTime
  status        ReservaStatus @default(EM_MONTAGEM)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  loja  Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead  Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  itens BloqueioVestido[]
}
```
- **Sem `CANCELADA`.** A regra do sistema para reserva é **apagar** (cancelar = remover o
  bloqueio/cabeça; cascade libera as peças) — não há cancelamento-soft de reserva (só `Contrato`
  tem distrato). Espelha `cancelarReserva`/`removerManutencao` atuais.
- `Lead` ganha `reservas Reserva[]`; `Loja` ganha `reservas Reserva[]`.

### 3.2 `BloqueioVestido` ganha `reservaId`
```prisma
  reservaId String?
  reserva   Reserva? @relation(fields: [reservaId], references: [id], onDelete: Cascade)
```
- `onDelete: Cascade`: apagar a cabeça remove os itens (que são bloqueios) → libera os vestidos.
  `reservaId` nullable (manutenção e legado pré-backfill).

### 3.3 Migração (hand-authored + `migrate deploy`)
1. `CREATE TYPE "ReservaStatus"`; `CREATE TABLE "Reserva"`.
2. `ALTER TABLE "BloqueioVestido" ADD COLUMN "reservaId"` + FK.
3. **Backfill:** cada grupo de `BloqueioVestido RESERVA_CASAMENTO` com `leadId NOT NULL`, agrupado por
   **(`lojaId`, `leadId`, `casamentoData`)**, vira **uma** `Reserva` (`status = CONFIRMADA`) e seus
   bloqueios recebem `reservaId`. Reservas existentes da mesma noiva+data **viram uma reserva
   multi-item**. `RESERVA_CASAMENTO` com `leadId NULL` (anomalia; nenhuma esperada — `reservarVestido`
   sempre seta `leadId`) **fica com `reservaId = NULL`** (verificado pela query). Manutenção idem.
4. Aditiva, não-destrutiva. Depois: `npx prisma generate`.

## 4. Camada de dados

A composição (a cabeça) fica num módulo novo **`src/lib/reservas/reservas.ts`** (`tenantPrisma`
sempre). O **primitivo de item** continua em `src/lib/disponibilidade/reservas.ts` (`reservarVestido`,
movimentação) — `reservas/reservas.ts` o chama; a validação anti-double-booking **não muda**.

| Função (nova, em `reservas/reservas.ts`) | O que faz |
|---|---|
| `abrirReserva(lojaId, leadId)` | Acha a reserva `EM_MONTAGEM` da noiva para a `casamentoData` do lead, ou cria. Falha-fechada `sem_data` se o lead não tem data; `lead_invalido` se não existe. |
| `adicionarVestido(lojaId, reservaId, vestidoId)` | Exige reserva `EM_MONTAGEM` da loja; chama `reservarVestido` (valida motor) **com `reservaId`**; propaga `indisponivel`/etc. |
| `removerVestido(lojaId, reservaId, bloqueioId)` | Valida que o bloqueio é item dessa reserva; chama `removerBloqueio`. Se a reserva ficar **sem itens**, apaga a cabeça `EM_MONTAGEM` vazia. |
| `fecharReserva(lojaId, reservaId)` | `EM_MONTAGEM → CONFIRMADA`. Rejeita não-`EM_MONTAGEM` (`transicao_invalida`) / 0 itens (`reserva_vazia`). |
| `cancelarReserva(lojaId, reservaId)` | Apaga a cabeça (cascade remove os itens → libera as peças). |
| `listarReservasDaNoiva(lojaId, leadId)` | Reservas (`EM_MONTAGEM`+`CONFIRMADA`) da noiva **com itens** (vestidos). |
| `listarReservasDaLoja(lojaId, {passadas?})` | Livro de reservas por **cabeça** (uma linha, N vestidos), por casamento. |
| `obterReserva(lojaId, reservaId)` | Cabeça + itens. |

Tipos: **`Reserva`** (resumo: id, status, casamentoData, leadId, noivaNome, itens) e
**`ItemDaReserva`** (bloqueioId, vestidoId, codigo, nome).

**`reservarVestido` ganha** `reservaId?` opcional no input, carimbado no `create`. Sem `reservaId`
(manutenção / reserva-pelo-vestido legada) segue igual.

**Desambiguação da colisão com o código atual** (regras estudadas no grill):
- O flat `listarReservasDaNoiva` de `disponibilidade/reservas.ts` é **por-vestido** e é consumido por
  `contratos.ts` (casa o contrato pelo `vestidoId`) → **renomear para `listarVestidosReservadosDaNoiva`**
  e atualizar `contratos.ts`. Não é órfão.
- O flat `listarReservasDaLoja` de `disponibilidade/reservas.ts` (por-vestido) **fica órfão** depois
  que o livro migra → **remover** (e o trecho de teste).
- O primitivo de item `cancelarReserva(bloqueioId)` (que apaga **um** bloqueio) → **renomear para
  `removerBloqueio`** e atualizar `vestidos/[vestidoId]/reserva-actions.ts`. Elimina o nome duplicado
  (`cancelarReserva` passa a ser só a da cabeça).

**Leitura de item NÃO muda:** `obterReservaDetalhe(bloqueioId)` (detalhe por vestido:
provas/ajustes/movimentação) segue como está. A cabeça lista os itens; cada item linka para o seu
`reservas/[bloqueioId]`.

## 5. Telas (escopo da fatia)

### 5.1 Perfil da noiva — `#reserva` (superfície principal; onde M1 "RESERVOU" cai)
- A reserva `EM_MONTAGEM` (se houver) aparece como a escolha em montagem: vestidos (itens) com
  **remover**; o form inline atual (`ReservaLivreInline` + `buscarVestidosLivresAction`) passa a
  **adicionar vestido** (`abrirReserva` + `adicionarVestido`); botão **"Fechar a reserva"**
  (`fecharReserva`).
- Abaixo, as reservas **`CONFIRMADA`**, cada uma com seus vestidos linkando para o detalhe do item,
  e **cancelar reserva** (`cancelarReserva`).
- Microcopy na voz do ateliê: "Reserva", "em montagem" / "confirmada", "Fechar a reserva". Mensagens
  `?ok=`/`?erro=`. M1 segue chegando em `#reserva`.

### 5.2 Livro de reservas
Uma linha **por reserva (cabeça)** — noiva, data (bordô se ≤14d), **chips dos N vestidos**, estado
(em montagem / confirmada). Mantém `?quando=passadas`. (Reservas em montagem **aparecem** — já seguram
peça, logo são compromissos, pela regra do sistema.)

### 5.3 Detalhe do item — **mantém**
`reservas/[bloqueioId]`: detalhe de **um vestido** (fases, movimentação, provas, ajustes). Único
ajuste: migalho "parte da reserva de {noiva}" linkando ao perfil. **Não** vira `[reservaId]`.

## 6. Estados e regras

- **Status:** `EM_MONTAGEM → CONFIRMADA`. Nova reserva nasce `EM_MONTAGEM`; "Fechar" → `CONFIRMADA`;
  "Cancelar" apaga a cabeça (cascade).
- **Bloqueio de inventário:** o item **bloqueia ao ser adicionado** (firme), inclusive em
  `EM_MONTAGEM` — pela regra vigente (toda reserva segura a peça). **Desvio consciente** do "sacola não
  bloqueia" da pesquisa: o HOLD que expira é a **Fatia 4**. Reservas em montagem abandonadas ficam
  visíveis no livro (mitigação), e cancelar libera.
- **Anti-double-booking:** **inalterado** — cada item nasce de `reservarVestido` (motor por janela).
- **Uma reserva em montagem por noiva+data:** `abrirReserva` é find-or-create.
- **Jornada:** **não muda.** `jornada.ts` não tem estágio "reservou"; o bloqueio só alimenta
  `retirado`/`devolucao`/`em_provas`. O status da reserva não toca a jornada.

## 7. Tratamento de erro
- `abrirReserva`: `sem_data` / `lead_invalido`.
- `adicionarVestido`: `reserva_invalida` (não-`EM_MONTAGEM`/fora da loja) + propaga `indisponivel`
  (com `conflitaComDatas`), `sem_data`, `vestido_invalido`, `lead_invalido` de `reservarVestido`.
- `fecharReserva`: `transicao_invalida` / `reserva_vazia`.
- `removerVestido`: `item_invalido`. Tudo falha-fechada via `tenantPrisma`.

## 8. Testes (vitest, Prisma real)
Novos em `src/lib/reservas/__tests__/reservas.test.ts`:
1. `abrirReserva` find-or-create; `sem_data`.
2. `adicionarVestido` grava `reservaId` **e** barra conflito (`indisponivel`); `reserva_invalida`.
3. `removerVestido` remove; remover o último **apaga a cabeça vazia**; `item_invalido`.
4. `fecharReserva`: `EM_MONTAGEM→CONFIRMADA`; rejeita não-montagem e vazia.
5. `cancelarReserva`: cascade remove itens → vestidos voltam livres (provado pelo motor).
6. `listarReservasDaNoiva`/`DaLoja`/`obterReserva` agrupam por cabeça.
7. Backfill: bloqueios da mesma noiva+data viram **uma** cabeça `CONFIRMADA`; manutenção `reservaId=null`.

**Regressão verde sem edição de lógica:** `disponibilidade/__tests__/*` (com os testes ajustados aos
renomes), `atelier`, `atendimentos`, **`contratos`** (consome `listarVestidosReservadosDaNoiva`).
`tsc` limpo + suíte cheia = gate de cada commit.

## 9. Fora de escopo (próximas fatias)
- **Contrato da reserva inteira + valor herdado do orçamento** → **Fatia 1.5** (spec/plano próprios +
  ADR `docs/adr/0002-contrato-referencia-reserva-e-herda-valor-do-orcamento.md`). Depende desta fatia.
- Acessórios + preço de pacote → Fatia 2.
- Filtro por disponibilidade-na-data + favoritos/lista de prova → Fatia 3.
- HOLD que expira + sinal/depósito → Fatia 4.
- Detalhe unificado `[reservaId]` — mantém `[bloqueioId]`.

## 10. Direção visual (Concierge Atelier)
A reserva é "a escolha da noiva", não um carrinho de e-commerce: vestidos como **peças** (chip código +
nome), bordô só no CTA "Fechar a reserva" e na urgência ≤14d; estado-zero gentil ("Nenhum vestido
reservado ainda"). Sem a palavra "sacola". Passar pela `atelier-design-review` antes de fechar.
