# A conferência do contrato — a fila

A tabela de épicos é a **fila**; a de Sobras é a **fonte da verdade do que
continua aberto**. **Conte, não deduza** — a linha aberta é a que não está
riscada.

Plano: [`2026-08-16-conferencia-do-contrato-plano.md`](../../propostas/2026-08-16-conferencia-do-contrato-plano.md)
· Consolidado: [`G-consolidado.md`](G-consolidado.md)
· Lentes: [A](A-dinheiro.md) · [B](B-portas.md) · [C](C-telas.md) · [D](D-e2e-portatil.md) · [E](E-spec-codegen-datas.md) · [F](F-manuais.md) · [G](G-reguas.md)
· Base: `da5148e8`

## O que a conferência abriu

Contado em 16/08/2026: **0 🔴 · 7 🟠 · 17 🟡 · ~30 🔵**, em **8 épicos +
1 lote de higiene**. Duas decisões da dona (E241, E244), nenhuma trava.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E241**~~ | ~~a rescisão devolve UMA vez~~ | A1=C1 🟠 | ✅ `e9231ce1` · [relatório](execucao/E241.md) — sob `estornar` a conta `DEVOLUCAO` não nasce (o estorno é sempre ≥ a devolução da cláusula, e o clamp "devolucaoTotal − totalEstornado" seria zero sempre); a trilha ganha `devolucaoPorContaAPagar`; a tela troca a frase com o rádio; o `e2e/63` conta `contas_pagar` = 0 — **o `afterAll` da S-O130 já apagava essa conta como sobra de fixture.** Vermelho antes: `expected [ { …(15) } ] to have a length of +0 but got 1`. A régua achou a suíte de API vermelha no `main` desde `ec53e2d6` (S-CF1, `c8dda201`) |
| ~~**E242**~~ | ~~o seed real não inventa índice~~ | A2 🟠, C4, C7 | ✅ `3029efba` · [relatório](execucao/E242.md) — o bloco 7b só corre sob `SEED_IPCA_EXEMPLO=true` (o E2E liga; a instalação real nasce sem índice); **era um PEDIDO da dona (bb03a0f7) e a leitura está na tabela de Decisões**; Índices gateia por `financeiro.editar` nas duas pontas e a s36 ganha `gravar` (reprovou antes: "chama gravarIndiceMonetario sem afirmar gate nenhum"); a lista amplia de 12 em 12. Vermelho antes: `expected [ …(12) ] to have a length of +0 but got 12`. Banco virgem 16 passed |
| ~~**E243**~~ | ~~a mora é do dia do FATO~~ | A3 🟠, A4=C2, C3, C6 | ✅ `c4e152b1` · [relatório](execucao/E243.md) — o `/receber` calcula em `diaLocal(recebidoEm)` (no máximo hoje); porta nova `GET /parcelas/:id/mora?em=` para o diálogo sugerir pela MESMA função (a `mora-na-tela.ts` proíbe recalcular no navegador, e o docblock ganhou); a conciliação deriva a mora dos recibos válidos; recibo e ficha datam em SP (9 de 303); rótulos com "correção". Vermelho antes: `expected [ 33, 5.5 ] to deeply equal [ 30, 5 ]` · `expected 422, got 200` ×2 · `[ parcela, 515 …` |
| ~~**E244**~~ | ~~a 16ª cobra pelo que o papel manda~~ | E1 🟠 (decisão da dona), C5, C10 | ✅ `d880b43a` · [relatório](execucao/E244.md) — `fimPrevistoDaDevolucao` (o papel, senão a janela) nos três sítios; executado na recomendação (o papel), para a dona confirmar; a S-C89 cobrou o primeiro conserto (`expected 9 to be 7`) e a fila passa a data já lida; a cobrança de atraso ganha o prazo na tela; prazo vazio não vira 0. Vermelho antes: `expected 1750 to be 750` |
| ~~**E245**~~ | ~~as portas ao lado~~ | B1, A5=B2, B3–B6, B8 | ✅ `a736229f` · [relatório](execucao/E245.md) — sete consertos, sete cenas de corrida rodadas sobre o código quebrado de propósito (B1 por `pg_locks`); a varredura de trancas cobrou o retrato (45 · 13 · 14); o E225 reprovou a primeira versão do B5 (a devolução se registra no cancelado de propósito) e a guarda encolheu para a saída; B6 declarado como ponto cego, não consertado |
| **E246** | o E2E para de depender do dev | D1–D4, D6–D9 | em execução |
| **E247** | as réguas veem a segunda forma | G1–G8, G10 | aberto |
| **E248** | os manuais dizem o que o sistema faz | F1–F8 | aberto |
| higiene 🔵 | lote | B7, C8, C9, C11, C12, E2–E4, G9, G11–G15, A6, A7 | aberto |

## Sobras

O que aparecer de passagem durante a execução entra aqui **no mesmo commit que
o viu** (regra 12) e sai riscada no commit que a fecha (regra 21).

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
$1| S-CF2 | 🔵 | `reservas/[bloqueioId].tsx` (`cobrar-atraso`) | Nenhum E2E clica "Cobrar o atraso" — a 16ª pela tela nunca foi encenada, e o campo de prazo do E244 tampouco. Candidata ao lote do E246 | aberta (E244, 16/08) |

## Decisões da dona

| Épico | Pergunta | Recomendação | Estado |
|---|---|---|---|
| E241 | sob `estornar`, a conta a pagar `DEVOLUCAO` nasce? | não nasce — o dinheiro já voltou pelo estorno | executada na recomendação em `e9231ce1` (16/08); corrigível numa linha |
| E242 | os 12 meses de IPCA DE EXEMPLO (pedido de 15/08, `bb03a0f7`) valem para a instalação de TESTE (E2E, demo) — a REAL nasce sem índice, e a 9ª fica dita até a dona digitar o IPCA. Confirma? | sim; se quiser os exemplos também na real, `SEED_IPCA_EXEMPLO=true` | executada na leitura recomendada em `3029efba`; a dona confirma ou vira uma env |
| E244 | a 16ª cobra pelo `dataDevolucao` do papel ou pela janela? | o papel — é o que a noiva assinou | executada na recomendação em `d880b43a`; corrigível numa linha (`fimPrevistoDaDevolucao`) |
