# Revisão de código do aplicativo inteiro — nível `max`

**Data:** 2026-08-10 · base `e624e4e` (`main`, limpo) · sem branch de trabalho

Revisão multi-agente sobre **o aplicativo inteiro**, não sobre um diff. Pedido
literal: *"max aplicativo inteiro e ir documentando tudo enquanto faz caso a
sessao caia"* — este arquivo é a metade "documentando": ele existe para que uma
sessão que caia no meio seja retomada sem perder o que já foi apurado.

## Como retomar se a sessão cair — NÃO DÁ MAIS

Esta seção fica como estava escrita, riscada, porque o que ela ensina vale mais
que o que ela prometia. Ela dizia que a rodada era retomável, e **não é**: a
sessão seguinte (2026-08-10) foi conferir e **a transcrição inteira já não
existia** — nem o `journal.jsonl`, nem o script, nem o diretório do run.

~~O workflow roda em background e guarda tudo em disco. A retomada não repete o
que já terminou: os agentes concluídos voltam do cache.~~

```
Workflow({
  scriptPath: ".claude/.../workflows/scripts/code-review-wf_e6080a26-c18.js",
  resumeFromRunId: "wf_e6080a26-c18"
})
```

| Handle | Valor | Estado em 2026-08-10 |
|---|---|---|
| Task ID | `wfkph4w8v` | — |
| Run ID | `wf_e6080a26-c18` | — |
| Transcrição | `~/.claude/projects/…/subagents/workflows/wf_e6080a26-c18` | **não existe** |
| Script | `~/.claude/projects/…/workflows/scripts/code-review-wf_e6080a26-c18.js` | **não existe** |

~~**Antes de concluir que a rodada voltou vazia, leia `journal.jsonl` na pasta da
transcrição**~~ — o conselho continua certo enquanto o arquivo vive, e o ponto é
que ele vive pouco. **O que não estiver no `git` no dia em que a rodada termina
não sobreviveu a ela.** Os 15 achados abaixo sobreviveram porque foram escritos
aqui; os 22 da seção "O que não entrou" se perderam com a transcrição.

## O que esta rodada é

Um localizador por ângulo de correção, mais um localizador cobrindo os ângulos
de limpeza; depois um verificador **independente** para cada par
(arquivo, linha) do conjunto reunido, e só então o relatório ordenado. O
verificador é adversarial de propósito: achado plausível que ninguém consegue
refutar é o único que sobrevive.

Vale aqui a régua da casa: **nenhum achado sem `arquivo:linha` que alguém leu, e
nenhum achado de dinheiro sem exemplo numérico.**

## Estado

- [x] Workflow lançado — 2026-08-10
- [x] Localizadores concluídos — 6 localizadores + 1 varredura, **59 candidatos**
- [x] Verificação concluída — **59 verificadores independentes, 0 refutados**
- [x] Achados relatados — **15 defeitos distintos**, todos de correção

**68 agentes · 1.579 chamadas de ferramenta · 5,58 M tokens · 1h58 de relógio.**
O escopo foi o repositório inteiro (`git diff` da árvore vazia até `HEAD`, fora
`docs/**`, `*.md`, mockup-sandbox, gerados e lock): **612 arquivos**.

Nenhum candidato caiu na verificação. Isso não é bom sinal de exigência — é o
que se espera quando os localizadores já vêm com âncora e cenário numérico, mas
significa que a régua desta rodada foi a do localizador, não a do verificador.

## Os 15 achados

Ordem de gravidade. Cada um tem `arquivo:linha` lido e cenário concreto; os de
dinheiro têm o número.

| # | Onde | O defeito |
|---|---|---|
| 1 | `artifacts/api-server/src/routes/agenda.ts:237` | `DELETE` de cabine sem checagem de existência, de uso, sem auditoria e sem transação — e `atendimentos.cabine_id` é `ON DELETE CASCADE`. Some a fila da costureira e o histórico de provas inteiro, irrecuperável. Todo delete irmão carrega o 409 que falta aqui. Também em `vestidos.ts:850`, `comissao.ts:476`, `agenda.ts:796` |
| 2 | `lib/api-spec/openapi.yaml:6399` | `PagamentoInput.valorPago` com `minimum: 0` — a rota multi-conta quita contas com **R$ 0,00**. A porta irmã tem `0.01`, e o comentário dela (linha 6383) afirma que esta já tinha o piso. O zod gerado é a única validação; o guard existe só no navegador |
| 3 | `artifacts/api-server/src/routes/contratos.ts:535` | `POST /contratos` não grava `origem`, o carnê nasce `AVULSA`, e a guarda `jaTemCarne` nunca dispara. Uma venda de **R$ 5.000,00** aceita um segundo carnê inteiro e fica com **R$ 10.000,00** em parcelas; a entrada perde o `numero 0` e deixa de ser rotulada |
| 4 | `lib/financeiro-core/src/projecao.ts:50` | O alerta de caixa só testa o negativo **depois** de aplicar um evento — o saldo de partida nunca é testado. Loja **R$ 2.000,00 no vermelho hoje** e o cartão não aparece |
| 5 | `lib/financeiro-core/src/extrato.ts:112` | Delimitador do CSV adivinhado **linha a linha**: um `;` dentro de um arquivo de vírgulas fatia a linha errado e o lançamento some sem erro. A conciliação então acusa divergência falsa e manda lançar de novo — **R$ 1.500,00 contados duas vezes** |
| 6 | `artifacts/api-server/src/lib/estoque.ts:67` | O docstring promete janela ABERTA sem devolução; o código só abre quando não há data de casamento. A peça é liberada enquanto ainda está com a noiva — e a metade do vestido, do mesmo ciclo, acerta. As duas discordam |
| 7 | `artifacts/api-server/src/routes/contratos.ts:325` | A guarda de reserva exclusiva é lida fora da transação que escreve `contrato_bloqueios`, sem row lock — e a PK permite o mesmo bloqueio em dois contratos. Duas vendedoras no mesmo segundo prometem o mesmo vestido a duas noivas. O repo já consertou esta forma no `DELETE /admin/lojas` com `.for("update")` |
| 8 | `artifacts/api-server/src/routes/vestidos.ts:128` | Nada impede a mesma confecção de virar **duas** peças do acervo: sem unique em `origem_ajuste_id`, o invariante "uma vez só" vive só no cliente |
| 9 | `artifacts/moscow-noivas/src/pages/financeiro/pagar.tsx:621` | A tela libera por `criar`, o servidor exige `editar`. A gerente que o E115 desbloqueou no servidor não vê o botão; a estagiária vê e leva 403. Mais 7 sítios com o mesmo descasamento |
| 10 | `.../pages/noivas/[leadId]/interesses.tsx:161` | Campo vazio vira `undefined`, some do JSON, e o `onConflictDoUpdate` preserva o antigo: apagar o teto de orçamento é ignorado em silêncio, com toast de sucesso. Nem um `null` explícito passaria — o contrato não o admite |
| 11 | `artifacts/moscow-noivas/src/pages/vestidos/estoque.tsx:133` | `Number("") === 0` passa pelo guard: limpar o campo para redigitar **zera o estoque** da peça. Depois disso todo orçamento com ela alarma |
| 12 | `artifacts/api-server/src/routes/orcamentos.ts:397` | O item de orçamento prova a loja do `itemEstoqueId` e do `ajusteId`, mas não a do `vestidoId`. A venda vira beco sem saída: 422 apontando peça que a loja nunca poderá reservar |
| 13 | `lib/agenda-core/src/mover.ts:98` | `EXPEDIENTE_PADRAO` diz espelhar o schema, mas ficou em 19h quando o S-A8 mudou para 20h — e não carrega `dias` nem `provaDuracao`. Loja recém-criada perde 19:00 e 19:30 da grade, e a prova das 18:30 passa como se durasse 30 min |
| 14 | `artifacts/api-server/src/lib/busca-lead.ts:15` | A busca por noiva interpola no ILIKE sem escapar `%` e `_`. Buscar `%` devolve o cadastro inteiro; colar "50% entrada" busca outra coisa. Idem `leads.ts:105` |
| 15 | `scripts/banco-virgem.ts:161` | A régua de primeira execução importa o `global-setup` **uma linha antes** de trocar a `DATABASE_URL`, então o pool nasce no banco de dev: ela escreve no dev e declara sucesso sobre um banco que não tocou. O ramo S-D38 que ela existe para exercitar continua sem execução nenhuma |

## O que não entrou — e não volta

O relatório tem teto. Ficaram de fora **18 achados de limpeza** e **4 de
correção de severidade menor**, todos verificados e todos no `journal.jsonl` da
transcrição — ~~recuperáveis sem repetir a rodada~~. **Perdidos:** a transcrição
foi apagada antes de alguém os ler. Recuperá-los custa a rodada inteira de novo.

## As três formas que se repetem

Vale mais que os quinze itens: eles são a mesma coisa acontecendo em lugares
diferentes.

1. **Invariante que mora só no cliente.** Portões de permissão, "uma vez só",
   validação cruzada de campos — a tela sabe, a rota não. Achados 2, 8, 9, 11.
2. **Check-then-write tomado no pool global e nunca reconferido dentro da
   transação que escreve.** Achado 7, e mais três sítios com a mesma escrita.
3. **Campo de formulário vazio querendo dizer "mantenha o antigo" ou "zero"**,
   em vez de "apague". Achados 10 e 11.

## Contexto de onde o repositório estava

O backlog de código estava **zerado** na abertura desta sessão: as trilhas da
rodada 6, da rodada 7 (design) e da arqueologia do legado estão fechadas, e as
duas sobras abertas — S-A2 e S-A27 — **esperam gente, não código**. Ou seja:
achado desta rodada é achado **novo**, não sobra represada. É a primeira
varredura de código depois do zero.

Réguas vigentes na abertura: **API 1089 · frontend 530 · E2E 165 · typecheck
verde em 5 projetos**, mais `scripts/banco-virgem.ts` fora das suítes.
