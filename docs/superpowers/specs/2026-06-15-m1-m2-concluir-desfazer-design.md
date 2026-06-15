# M1/M2 — Clímax no Concluir + desfazer/confirmar (design)

> Data: 2026-06-15. Itens de UX do backlog de Atendimento. Sem mudança de schema.

## Problema

1. **M1 — o Concluir não tem clímax.** Quando a vendedora conclui um atendimento
   com desfecho **RESERVOU** (a noiva escolheu o vestido — o momento mais
   importante), o sistema só volta à fila com "Atendimento concluído." O próximo
   passo operacional óbvio (criar a **reserva** da noiva) fica escondido: a
   vendedora tem que sair, achar a noiva e abrir o perfil.
2. **M2 — as transições são irreversíveis e mudas.** `iniciar`, `concluir` e
   `marcar falta` aplicam direto, sem confirmação (só o cancelar reserva
   confirma) e **sem desfazer**. Um clique errado em "Marcou falta" ou "Concluir"
   é permanente.

## M1 — Encaminhar ao próximo passo no desfecho RESERVOU

Quando `concluirAtendimentoAction` conclui **com `desfecho === "RESERVOU"`** e dá
certo, em vez de voltar à fila, **encaminha ao perfil da noiva** direto no bloco
de reserva:

`redirect(/loja/{id}/noivas/{leadId}?ok=reservou_concluido#reserva)`

- O `leadId` vai como **input hidden** no form de concluir (o `Linha` já tem
  `a.leadId`).
- Desfechos `VAI_PENSAR`/`NAO_SERVIU` → comportamento de hoje (volta à fila com
  `?ok=concluido`).
- Perfil da noiva (`noivas/[leadId]/page.tsx`): novo aviso
  `reservou_concluido: "Atendimento concluído. Agora reserve o vestido escolhido."`
  no `AVISOS`.
- Âncora `#reserva`: envolver o bloco "Vestido reservado" num
  `<section id="reserva">` (a âncora posiciona a vendedora exatamente onde ela
  cria a reserva via `ReservaLivreInline`, que já existe).

**Não muda regra de negócio:** concluir **não cria** reserva — só roteia. A
reserva continua sendo criada manualmente no perfil (gate `vestidos:editar`).

## M2 — Confirmar (antes) + desfazer (depois)

### (a) Confirmação nas ações terminais (reusa `BotaoConfirmar`)

`BotaoConfirmar` (botão client com `window.confirm` nativo, já no projeto) passa
a envolver os submits **terminais** no `Linha` da fila:
- **Marcou falta** (AGENDADO → FALTOU): `"Registrar falta de {noiva}?"`
- **Concluir** (→ CONCLUIDO): `"Concluir o atendimento de {noiva}?"` — o botão é o
  submit do form que já carrega o `desfecho` selecionado.

`Iniciar atendimento` **não** confirma (transição benigna e agora reversível).

### (b) Desfazer — `reabrirAtendimento`

Nova função de data layer em `atendimentos.ts`:

```ts
/** Desfaz uma transição: EM_ATENDIMENTO | CONCLUIDO | FALTOU → AGENDADO,
 *  limpando desfecho e atendidoEm. AGENDADO → transicao_invalida. Só da loja. */
export async function reabrirAtendimento(lojaId: string, id: string): Promise<ResultadoSituacao>;
```

- Valida existência + loja (senão `atendimento_invalido`).
- Se já `AGENDADO` → `transicao_invalida`.
- Senão `update { situacao: "AGENDADO", desfecho: null, atendidoEm: null }`.

Exposição (gate `leads:editar`, `reabrirAtendimentoAction` → redirect):
- **"Voltar"** no `EM_ATENDIMENTO` da fila (desfaz o "iniciar").
- **"Reabrir"** no `CONCLUIDO`/`FALTOU` do **histórico** (desfaz concluir/falta).

Após reabrir, o atendimento vira AGENDADO (aberto) → sai do histórico e entra na
fila; o action redireciona à fila com `?ok=reaberto`. "Voltar"/"Reabrir" são
recuperação de baixo risco → **sem** confirm.

Para o histórico mostrar "Reabrir", a lista de histórico passa a receber o
`podeEditar` real (hoje recebe `false`); o `Linha` ganha um ramo para
`CONCLUIDO`/`FALTOU` que mostra só o "Reabrir" quando `podeEditar`.

### Jornada

`reabrir` reverte para AGENDADO; `estagioDaNoiva` deriva "atendimento_agendado"
de um atendimento aberto — consistente, sem regressão (é exatamente o estado de
antes da transição).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/atendimentos/atendimentos.ts` | + `reabrirAtendimento` |
| `src/lib/atendimentos/__tests__/atendimentos.test.ts` | + testes de `reabrirAtendimento` |
| `…/atendimentos/actions.ts` | concluir roteia no RESERVOU (lê `leadId`); + `reabrirAtendimentoAction` |
| `…/atendimentos/page.tsx` | `Linha`: hidden `leadId` + `BotaoConfirmar` (falta/concluir) + "Voltar" (EM_ATENDIMENTO) + ramo "Reabrir" (terminais); histórico passa `podeEditar` real; aviso `reaberto` |
| `…/noivas/[leadId]/page.tsx` | aviso `reservou_concluido` + `<section id="reserva">` no bloco "Vestido reservado" |

Avisos novos na fila (`AVISOS` de `atendimentos/page.tsx`): `reaberto: "Atendimento reaberto."`

## Testes (Postgres real, `atendimentos.test.ts`)

1. `reabrir` de **EM_ATENDIMENTO** → AGENDADO, `atendidoEm` nulo.
2. `reabrir` de **CONCLUIDO** (com desfecho) → AGENDADO, `desfecho` e `atendidoEm` nulos.
3. `reabrir` de **FALTOU** → AGENDADO.
4. `reabrir` de **AGENDADO** → `transicao_invalida`.
5. `reabrir` id inexistente / **outra loja** → `atendimento_invalido`.

M1 (roteamento na action) e a confirmação (`BotaoConfirmar`) são verificados por
`tsc` + revisão `atelier-design-review` + leitura; sem teste de redirect (o data
layer de concluir já é coberto).

## Fora de escopo

- Auto-criar a reserva ao concluir (mudaria regra de negócio).
- Confirmação no "Iniciar" (benigno e reversível).
- Histórico de auditoria de reaberturas (YAGNI).

## Gates

`tsc --noEmit` limpo + `vitest run` verde antes de cada commit na `main`.
