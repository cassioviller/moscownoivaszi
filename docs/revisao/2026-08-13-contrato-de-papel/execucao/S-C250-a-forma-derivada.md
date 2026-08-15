# S-C250/S-C251 — a lista silenciada que troca de nome antes de mentir

**Trilha do contrato de papel, sessão de 2026-08-15 (segunda metade)** ·
base `0ac71d2c` (S-C281)
Fecha: S-C250 🔵, S-C251 🔵
Suíte: API 1731 · frontend 974 → **979** · E2E 177 · typecheck verde

## O que o enunciado errou, ANTES do código

A sobra dizia **"10 atribuições, 2 sem estado lido"** e nomeava os dois sítios.
Medido sobre os **197 fontes de tela** que a varredura enumera pelo
versionamento: **20 atribuições, 5 sem estado lido.**

As duas medidas eram exatamente metade, e a causa é a de sempre nesta trilha —
**a sobra achou os sítios lendo os dois arquivos de que já suspeitava; a
varredura lê 197.** É a mesma correção que o lote de 15/08 fez ao plano
(*"o recorte do plano era estreito: ele descreve onde os cinco estão, não onde o
sexto pode nascer"*), agora do lado do frontend.

Dos cinco sem estado, **quatro mentem e o quinto silencia:**

| sítio | o que um 500 faz a tela dizer |
|---|---|
| `ajustes/nova-confeccao.tsx` | *"Esta noiva ainda não tem atendimento nenhum"* — e manda marcar um na Agenda |
| `noivas/[leadId]/lookbook.tsx` | *"Nenhum vestido ativo encontrado."* |
| `atendimentos/novo.tsx` (cabines) | manda **cadastrar uma cabine** numa loja que pode ter cinco |
| `atendimentos/novo.tsx` (bloqueios) | *"Esta noiva ainda não tem reserva de casamento — crie agora"* |
| `dashboard.tsx` (aceitosQuery) | **nada** — o card silencia |

**Os dois de `atendimentos/novo.tsx` não estavam em sobra nenhuma**, e o
segundo é o mais caro dos quatro: ali o ramo do zero não afirma só, ele
**OFERECE o gesto** — o formulário de reserva inline que o E65 pôs para tirar a
vendedora do beco. Um 500 em `bloqueios` diz que a noiva não tem reserva, sobre
uma noiva que tem a peça presa, e o clique seguinte prenderia **uma segunda
peça para a mesma noiva**. A S-C160 fechou uma frase que a dona lê antes de
decidir; esta tem gesto pendurado no fim.

## O conserto

Os quatro ganharam o `Erro` de `@/components/estado` à frente da frase — o
idioma da S-C120, o mesmo do fecho da S-C160. Os quatro já liam **algum**
estado (`isLoading`, `isPending`); nenhum lia `isError`, que é a diferença
entre *"ainda não respondeu"* e *"respondeu que não deu"*.

## S-C251 — a decisão é EMBUTIR, e o que a sustenta é um número

A sobra pedia a decisão e supunha o número: *"hoje pegaria os 2 sem falso
positivo entre os 10 medidos"*. Medido: a grafia derivada acha **5 e erra 1**.

O falso positivo é `dashboard.tsx`. O `aceitosParados.length === 0` de lá é um
`return 0` dentro do `useMemo` do `idadeMaisAntigo` — **guarda interna, não ramo
de frase** — e o card que consome aquilo **silencia** (`:421`,
`length > 0 ? … : null`). Um 500 apaga o card; nada falso é afirmado. É a
exceção que a própria varredura já declarava pela outra grafia (S-C163:
*silêncio não é mentira*), agora vista do lado da atribuição.

**Um em cinco é o preço declarado de fingir data-flow com regex.** Ele é menor
que o preço medido de deixar a classe fora da régua, que foi quatro frases
falsas vivas, duas delas com gesto pendurado. Por isso embutiu-se — com o falso
positivo entrando em `SILENCIOS_DECLARADOS`, **nomeado e com o motivo escrito**,
e um autoteste que exige a frase e não a etiqueta (a lição da S-C130: nome sem
motivo é a dívida que ninguém revisa).

### O que a grafia derivada não alcança, dito

- **atribuição através de função ou de arquivo** — só o par no mesmo texto;
- **ramo-de-frase × guarda interna** — é o falso positivo acima, e é por isso
  que a exceção pede motivo;
- a exceção medida da grafia direta (`contratos/[id].tsx`, S-C162) **não cai
  aqui**, porque a lista de lá vem de `contrato?.parcelas` e não de
  `consulta.data ?? []`.

## Verificação

Vermelho encenado com `git stash push -- artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx`
(a S-O119 pelo lado certo: guardar trabalho antes de mexer na árvore é `stash`,
que ou guarda tudo ou falha inteiro):

```
AssertionError: expected [ …(2) ] to deeply equal []
+ "pages/atendimentos/novo.tsx:233 batiza `cabines.data ?? []` e testa o vazio
   do nome sem ler `cabines.isError` …"
+ "pages/atendimentos/novo.tsx:240 batiza `bloqueios.data ?? []` … o ramo do
   zero costuma OFERECER criar o que já existe (S-C250)."
```

A denúncia nomeia arquivo, linha, consulta e as **duas** saídas — pôr o `Erro`
ou declarar a exceção com motivo.

Quatro autotestes novos provam que a peneira enxerga (o batismo com
spread+sort; o batismo dentro de `useMemo` com filtro) e que não vê o que não é
a classe (o nome que ninguém testa a zero; o `> 0` que silencia).
