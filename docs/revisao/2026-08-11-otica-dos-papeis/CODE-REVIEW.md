# Code review por arquivo — os três arquivos quentes do gate

**Aberto em 2026-08-11**, base `05eb1d2` (`main` local, 2 commits de documentação
à frente de `origin/main`). Pedido da dona, na letra:

> `/code-review high artifacts/api-server/src/routes/contratos.ts`
> `/code-review high artifacts/api-server/src/lib/aceite-orcamento.ts`
> `/code-review high artifacts/api-server/src/routes/reservas.ts`
> "e vá anotando tudo que for fazendo e descobrindo em um documento caso caia
> a sessão"

## Por que não foi o `/code-review ultra`

O `ultra` revisa um **diff** — branch atual ou PR. O tema desta revisão é código
**não modificado** no `main`. Antes dos commits de hoje ele recusava três vezes
por diff vazio; depois deles o diff passou a ser 4.022 linhas da documentação
dos 8 ângulos, e ele revisaria a prosa achando que revisou o sistema. A forma
que aceita **caminho** é a não-ultra, um arquivo por vez — que é esta.

O `ultra` fica para o **conserto**, quando os épicos virarem branch e houver
diff real de tranca em transação e de máquina de estados.

## Como este arquivo é escrito

Uma seção por alvo, gravada **assim que o alvo termina** — não no fim dos três.
Se a sessão cair, o alvo que já tem seção está pago e não se refaz. A tabela
abaixo é a fila; conte o que tem seção, não deduza.

| # | Alvo | Estado | Achados |
|---|---|---|---|
| 1 | `artifacts/api-server/src/routes/contratos.ts` | ⏳ rodando | — |
| 2 | `artifacts/api-server/src/lib/aceite-orcamento.ts` | ⏳ rodando | — |
| 3 | `artifacts/api-server/src/routes/reservas.ts` | ⏳ rodando | — |

### Os três disparados em paralelo — como retomar se a sessão cair

Cada alvo é um workflow de revisão (vários agentes de achado por ângulo, mais um
verificador independente por local achado). Os três correm ao mesmo tempo. **Se
a sessão cair antes de a seção do alvo existir neste arquivo, o trabalho do
workflow NÃO se perde** — os agentes já concluídos voltam do cache:

| Alvo | Run ID | Script |
|---|---|---|
| 1 · contratos | `wf_b4268826-564` | `code-review-wf_b4268826-564.js` |
| 2 · aceite-orcamento | `wf_e4adec97-d19` | `code-review-wf_e4adec97-d19.js` |
| 3 · reservas | `wf_7ad38c46-f45` | `code-review-wf_7ad38c46-f45.js` |

Os scripts vivem em
`~/.claude/projects/-home-runner-workspace/bd5ae487-d28a-4f60-89a9-9b09aa57dc1b/workflows/scripts/`.
Retomar: `Workflow({scriptPath: "<script acima>", resumeFromRunId: "<run id>"})`.
O `journal.jsonl` do diretório de transcrição diz o que cada agente devolveu —
leia-o antes de concluir que um resultado veio vazio.

**Retomada só vale na MESMA sessão.** Se a sessão morreu, os run IDs não
resolvem: refaça o alvo que não tem seção aqui. É por isso que a seção é
gravada assim que o alvo termina, e não no fim dos três.

## O que esta revisão NÃO é

Ela não substitui a **etapa 4** (verificação âncora por âncora dos 59 achados
dos 8 ângulos, regra 20). São coisas diferentes com propósitos diferentes:

- os **8 ângulos** olharam o fluxo por ótica de papel — o que quebra na vida de
  quem usa;
- este **code review** olha três arquivos por dentro — correção, reuso,
  simplificação, eficiência.

O cruzamento entre os dois é achado por si só: defeito que aparece nas duas
lentes é candidato a subir de severidade no consolidado; defeito que aparece só
aqui é o que a ótica de papel não alcança.

## Contexto que o revisor precisa ter (dos 8 ângulos, ainda NÃO verificados)

Os três arquivos são exatamente onde o gate mora. O que os ângulos disseram
sobre eles, para o revisor não redescobrir do zero — **e para ser conferido, não
assumido**:

- `contratos.ts:448` / `:470-486` — o E150 exige bloqueio por peça de acervo
- `contratos.ts:184-193` — `CONTRATO_ATIVO_DUPLICADO` lido no pool, nunca relido
- `contratos.ts:541` — o `FOR UPDATE` da S-M7 dentro de `if (bloqueioIds.length > 0)`
- `contratos.ts:236` — `if (orcamento.aceiteHash)`, guarda que se desliga sozinha
- `aceite-orcamento.ts:16-71` — não encosta em reserva; `db` fora da transação em `:20-25`
- `reservas.ts:507` — o único criador de reserva do repositório, atrás de sessão + módulo
- `reservas.ts:157` — conta contratos ativos antes de qualquer tranca

---

# Alvo 1 — `artifacts/api-server/src/routes/contratos.ts`

⏳ em curso — nada gravado ainda.
