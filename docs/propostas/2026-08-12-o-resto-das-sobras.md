# O resto das sobras — três faixas, e a ordem tem motivo

**Aberto em 2026-08-12**, base `d6e617f` (`main`, logo depois do E172).
Rastreador: `docs/revisao/2026-08-11-otica-dos-papeis/EXECUCAO.md`.
Régua de partida: **API 1257 · frontend 611 · E2E 171 · typecheck verde em 5
projetos**.

## O que sobrou, contado

**33 sobras abertas: 14 🟡 e 18 🔵. Zero 🔴, zero 🟠.**

Isso muda o critério. Enquanto havia vermelho, a ordem era urgência. Agora não
há nada em chamas, e o critério passa a ser **consequência para quem usa** — em
primeiro lugar o que chega até a noiva, depois o que erra dinheiro, depois o que
só incomoda quem mantém.

Fora da trilha continuam 3, e **nenhuma é código**: a S-M17 espera um dump de
instalação real; a S-A2 e a S-A27 esperam gente.

---

## Fase 0 — a decisão da dona (FECHADA em 2026-08-12)

**S-O39 — o link da proposta morre em 7 dias e a proposta vale 30.**
`CONVITE_TTL_MS` (`lib/auth.ts:11`) contra `VALIDADE_PADRAO_DIAS`
(`orcamentos.ts:108`). A noiva que abre o WhatsApp no décimo dia lê "link
expirado" numa proposta de pé.

**Decisão: o link dura o que a proposta durar.** O prazo de 7 dias veio
emprestado do convite de equipe e nunca foi uma escolha sobre propostas; a
validade da proposta é que é a escolha, e a vendedora já a define. Entra na
Faixa B, no épico do orçamento.

---

## Faixa A — a reserva sai de sincronia, e a noiva chega sem vestido

**SERIAL.** As três mexem nas mesmas transações de `reservas.ts` e disputam as
mesmas linhas com `contratos.ts` — é a mesma razão que fez a Faixa A da trilha
anterior ser serial.

### A1 · S-O5 (R8) — o soft-cancel deixa a prova órfã

`PATCH /reservas/:id` com `status: CANCELADA` soft-cancela todos os bloqueios
vinculados (`reservas.ts:281-286`) e **não toca em `atendimentos`**. A prova
segue `AGENDADA` apontando um bloqueio cancelado; a peça volta ao mercado
(`disponibilidade.ts:409` e o `EXCLUDE` do banco só olham `cancelado_em IS
NULL`), é alugada para outra noiva, e sai na retirada.

**A ironia é a âncora:** o `DELETE /bloqueios/:id` **recusa com 409** justamente
porque os atendimentos sumiriam junto (`reservas.ts:889-900`, E115), e o
comentário dele manda usar o soft-cancel — *"quem quer tirar a peça do caminho
usa o soft-cancel (`canceladoEm`)"*. A saída que o código recomenda é a que não
tem guarda nenhuma.

Confirma o A05.2.

### A2 · S-O4 (R6) — a data muda na reserva e o contrato fica para trás

`PATCH /reservas/:id` propaga `casamentoData` a todos os bloqueios vinculados,
revalidando cada um (`reservas.ts:290-352`), e **não pergunta aos contratos
ATIVOS**. O PDF e o portal seguem dizendo a data velha.

E o remédio que a outra ponta oferece não existe: `PATCH /contratos/:id` recusa
com **422 `DATA_DIVERGE_DA_RESERVA`** — *"mude a reserva primeiro"*
(`contratos.ts:1025`) — e a reserva **já mudou**. As duas portas mandam a
pessoa para a outra.

### A3 · S-O11 — a reserva na noiva errada não troca de dona

A ficha da reserva não edita `leadId`; a adoção do E162 só cobre a reserva **sem
dona**. É a metade do A02.4 que não entrou.

**Fecho da faixa:** E2E completo (regra 11 — muda o que a trilha grava e o que a
ficha da reserva lê).

---

## Faixa B — três épicos em PARALELO

Um agente por worktree, como E167/E168/E169 (~50 min de relógio, três
`cherry-pick` sem um conflito). **O integrador reserva as faixas de numeração de
S-O ANTES de disparar** — no paralelo anterior os três atropelaram uns aos
outros — e **mede em série** depois de integrar: duas suítes de API simultâneas
deadlockam no banco compartilhado.

| Épico | Fecha | Tese |
|---|---|---|
| **B1 · Dinheiro** | S-O25, S-O29 | tirar item de orçamento não reconfere o teto do desconto: bruto 300000c contra desconto 400000c, e o líquido clampa em **R$ 0,00**. E nenhum teste afirma o que o `aceiteHash` NÃO cobre — ele não prende o `vestidoId` |
| **B2 · Costureira** | S-O27, S-O28 | a ficha diz 14 dias e a fila diz 7, sob um comentário que jura serem a mesma régua (`ajustes/[ajusteId].tsx:78` × `ajustes-da-semana.ts`). E a confecção sem peça de acervo não tem onde nascer pela interface |
| **B3 · Portas** | S-O44, S-O46, S-O32, S-O39 | o WhatsApp torto entra pela captação e o sintoma volta a ser mudo; a Recepção apaga noiva; `comissao.ts` escreve no contrato sem tranca (3 portas); e o link passa a durar o que a proposta durar |

**Por que estes três juntos:** não compartilham arquivo. B1 vive em
`orcamentos.ts`, B2 em `agenda.ts` + telas de ajuste, B3 em `leads.ts`,
`captacao.ts` e `comissao.ts`. `comissao.ts` é **a única tabela quente que as
Faixas A e B da trilha anterior não abriram**, e é por isso que ela entra aqui e
não na Faixa A.

---

## Faixa C — as 18 🔵, e a única que vale sozinha

**S-O3 é uma CLASSE, não um caso**, e por isso abre a faixa: o gerador de zod
perde restrições do spec, e já custou dois achados fechados na rota sem que
ninguém varresse o resto — o `integer` de `numParcelas` (P5) e a coerção de
`null` em `zod.coerce.date()`, que devolve **1970 com `success: true`** (V12).
A varredura é o épico; os consertos que ela achar são consequência.

O resto das 🔵 vai em dois lotes por vizinhança de arquivo, com a régua de
sempre: **o que não couber no lote vira sobra, não conserto**.

---

## As três regras que esta trilha já pagou para aprender

1. **Escrever em paralelo, medir em série.**
2. **O integrador reserva a numeração de S-O antes de disparar.**
3. **Fechar uma porta sem medir a porta ao lado é meio conserto** — a lição do
   E172, e ela vale literalmente para a Faixa B: cada épico ali fecha um gate, e
   cada gate tem vizinho. O E172 achou o vizinho medindo; o plano dele não o
   tinha.
