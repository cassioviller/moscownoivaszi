# A fila da conferência — o plano para E241–E248

**Escrito em 2026-08-16**, sobre `da5148e8` (o ponteiro apontando para a
conferência). Fonte: a tabela do
[`G-consolidado.md`](../revisao/2026-08-16-conferencia-do-contrato/G-consolidado.md)
da conferência de 16/08 — sete lentes de leitura pura sobre as ~10,4 mil linhas
que entraram desde `cd990767`, **0 🔴 · 7 🟠 · 17 🟡 · ~30 🔵**. Este plano diz
o que cada épico custa, em que ordem, o que cada um tem de MEDIR antes de
mexer, e o que só a dona pode dizer.

O rastreador desta fila é
[`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../revisao/2026-08-16-conferencia-do-contrato/EXECUCAO.md)
— a tabela de épicos é a fila; a de Sobras é a fonte da verdade do que continua
aberto. **Conte, não deduza.**

## A ordem, e a razão dela

A mesma da trilha do contrato: **dinheiro primeiro** (E241–E244), **a porta ao
lado** (E245), **cobertura** (E246–E247), **documentação** (E248). O critério
não é severidade sozinha — os três primeiros são os únicos que fazem a loja
devolver ou cobrar um número que o instrumento não autoriza, e o quarto é o
único que depende da dona.

| # | Épico | Tese | Fecha | Custo medido |
|---|---|---|---|---|
| 1 | **E241** | A rescisão devolve UMA vez: sob `estornar` a conta a pagar `DEVOLUCAO` não nasce, a tela diz por onde a devolução sai, e o `e2e/63` conta `contas_pagar` | A1=C1 🟠 | 1 porta (`contratos.ts:1932`), 1 tela, 2 `it` na API, 1 assert no E2E — **1 commit** |
| 2 | **E242** | O seed real não inventa índice: os 12 meses de exemplo saem do caminho da instalação nova; Índices gateia por `financeiro.editar`; `gravar` entra no regex da `s36` | A2 🟠, C4, C7 | 1 seed, 1 tela, 1 varredura, **banco-virgem obrigatório** — 1 commit |
| 3 | **E243** | A mora é do dia do FATO (`recebidoEm`): descrição/trilha da linha `MORA`, sugestão/teto do `/receber`, a conciliação deriva do recibo, a tela diz "correção" onde inclui, a data do recibo é `instanteDia` | A3 🟠, A4=C2, C3, C6 | 1 porta, 1 lib, 1 diálogo, 1 recibo — 1 commit |
| 4 | **E244** | A 16ª cobra pelo que o papel manda: `fimPrevistoDaDevolucao` = `dataDevolucao` do contrato quando existe, senão a janela — UMA função nos três sítios | E1 🟠, C5, C10 | **decisão da dona** (recomendado: o papel) — 1 commit |
| 5 | **E245** | As portas ao lado: cobrança de atraso tranca o contrato; o reabrir tranca a linha-alvo ANTES de ler posteriores; CAS do receber/perdão; `PATCH /bloqueios` repete `cancelado_em IS NULL`; rescisão e qualificação releem sob a tranca | B1, A5=B2, B3–B6, B8 | 1–2 commits, cada um com a cena de corrida que prova que a rota ESPEROU |
| 6 | **E246** | O E2E para de depender do dev: fixture da reserva renovada a cada run; `13` pelo `href`; contrato próprio no `08` e `15`; `16` num ramo só; competência do `36` em SP; a data do `52` derivada de hoje | D1–D4, D6–D9 | 1 commit + E2E |
| 7 | **E247** | As réguas veem a segunda forma: `requestBody` inline, banco virgem exige exercício, cabines por `db.insert`, a bomba de calendário do `e217` (02/11/2027) | G1–G8, G10 | 1 commit |
| 8 | **E248** | Os manuais dizem o que o sistema faz (F1–F8) | F1–F8 | 1 commit + PDFs |
| 9 | higiene 🔵 | lote, sem tese própria | B7, C8, C9, C11, C12, E2–E4, G9, G11–G15, A6, A7 | 1 lote |

## As decisões da dona — nenhuma trava a fila

| Pergunta | Recomendação | Estado |
|---|---|---|
| **E241** — sob `estornar`, a conta a pagar `DEVOLUCAO` não nasce (o dinheiro já voltou pelo estorno)? Ou o rádio "estornar" some quando a iniciativa é da LOJA? | **Não nasce.** A alternativa "nasce só `devolucaoTotal − totalEstornado`" é a MESMA coisa: `devolucaoTotal ≤ totalPagoPlano ≤ totalRecebido = totalEstornado`, o clamp dá zero sempre. Tirar o rádio sob LOJA não fecha o caso LOCATÁRIA + estornar (R$ 2.600,00 sobre R$ 2.200,00) | **executada na recomendação** em 16/08 (E241); corrigível numa linha se a dona preferir |
| **E244** — a 16ª cobra pelo `dataDevolucao` do papel ou pela janela do bloqueio? | **O papel** — é o que a noiva assinou; a janela é operação interna | aberta |

## O que cada épico MEDE antes de mexer (regra 20)

- **E241**: `SELECT count(*) FROM contas_pagar WHERE tipo='DEVOLUCAO'` e as 32
  trilhas `CONTRATO_CANCELADO` com `estornar` — a população real hoje é ZERO
  contas (armado, não disparado). O teste novo reprova ANTES do conserto:
  `expected [ {…} ] to have a length of 0`.
- **E242**: `SELECT * FROM indices_monetarios WHERE atualizado_por LIKE 'seed%'`
  no `heliumdb` E em `scripts/banco-virgem.ts` — a instalação nova é o caso.
- **E243**: 9 de 303 parcelas com `recebido_em` entre 21h e 23h59 SP; a
  população de `MORA` é ZERO (armado).
- **E244**: quantos contratos têm `data_devolucao` ≠ fim da janela do bloqueio.
- **E245**: cada tranca com a cena de corrida (o molde do E212/S-C240).
- **E246**: a data em que o `13` reprova sem mudar linha: **15/10/2026**.

## O que este plano custa

Oito épicos, cada um de UM commit (o E245 pode ser dois). A régua por commit
é a API inteira (~11,6 min) + typecheck; o E2E (~6,5 min) roda UMA vez por
lote (emenda da regra 11), **e antes do commit que muda o que a trilha grava
ou o que a tela lê** — o E241 muda as duas coisas.
