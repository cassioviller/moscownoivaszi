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

**Contado em 16/08/2026 à noite: os 8 épicos E o lote de higiene estão EXECUTADOS** (higiene `484f429b`, 13 de 17 🔵; o resto na S-CF3) (E241 `e9231ce1` · E242 `3029efba` · E243 `c4e152b1` · E244 `d880b43a` · E245 `a736229f` · E246 `f373a65e` · E247 `fb00bd96` · E248 `5096469b`) — **7 🟠 e 17 🟡 fechados, ZERO abertos**; restam as duas linhas da tabela de Sobras (**S-CF2** 🔵 e **S-CF3** 🔵). As três decisões executadas na recomendação (E241, E242, E244) estão na tabela de Decisões para a dona confirmar. **Conte a tabela, não este parágrafo.**

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E241**~~ | ~~a rescisão devolve UMA vez~~ | A1=C1 🟠 | ✅ `e9231ce1` · [relatório](execucao/E241.md) — sob `estornar` a conta `DEVOLUCAO` não nasce (o estorno é sempre ≥ a devolução da cláusula, e o clamp "devolucaoTotal − totalEstornado" seria zero sempre); a trilha ganha `devolucaoPorContaAPagar`; a tela troca a frase com o rádio; o `e2e/63` conta `contas_pagar` = 0 — **o `afterAll` da S-O130 já apagava essa conta como sobra de fixture.** Vermelho antes: `expected [ { …(15) } ] to have a length of +0 but got 1`. A régua achou a suíte de API vermelha no `main` desde `ec53e2d6` (S-CF1, `c8dda201`) |
| ~~**E242**~~ | ~~o seed real não inventa índice~~ | A2 🟠, C4, C7 | ✅ `3029efba` · [relatório](execucao/E242.md) — o bloco 7b só corre sob `SEED_IPCA_EXEMPLO=true` (o E2E liga; a instalação real nasce sem índice); **era um PEDIDO da dona (bb03a0f7) e a leitura está na tabela de Decisões**; Índices gateia por `financeiro.editar` nas duas pontas e a s36 ganha `gravar` (reprovou antes: "chama gravarIndiceMonetario sem afirmar gate nenhum"); a lista amplia de 12 em 12. Vermelho antes: `expected [ …(12) ] to have a length of +0 but got 12`. Banco virgem 16 passed |
| ~~**E243**~~ | ~~a mora é do dia do FATO~~ | A3 🟠, A4=C2, C3, C6 | ✅ `c4e152b1` · [relatório](execucao/E243.md) — o `/receber` calcula em `diaLocal(recebidoEm)` (no máximo hoje); porta nova `GET /parcelas/:id/mora?em=` para o diálogo sugerir pela MESMA função (a `mora-na-tela.ts` proíbe recalcular no navegador, e o docblock ganhou); a conciliação deriva a mora dos recibos válidos; recibo e ficha datam em SP (9 de 303); rótulos com "correção". Vermelho antes: `expected [ 33, 5.5 ] to deeply equal [ 30, 5 ]` · `expected 422, got 200` ×2 · `[ parcela, 515 …` |
| ~~**E244**~~ | ~~a 16ª cobra pelo que o papel manda~~ | E1 🟠 (decisão da dona), C5, C10 | ✅ `d880b43a` · [relatório](execucao/E244.md) — `fimPrevistoDaDevolucao` (o papel, senão a janela) nos três sítios; executado na recomendação (o papel), para a dona confirmar; a S-C89 cobrou o primeiro conserto (`expected 9 to be 7`) e a fila passa a data já lida; a cobrança de atraso ganha o prazo na tela; prazo vazio não vira 0. Vermelho antes: `expected 1750 to be 750` |
| ~~**E245**~~ | ~~as portas ao lado~~ | B1, A5=B2, B3–B6, B8 | ✅ `a736229f` · [relatório](execucao/E245.md) — sete consertos, sete cenas de corrida rodadas sobre o código quebrado de propósito (B1 por `pg_locks`); a varredura de trancas cobrou o retrato (45 · 13 · 14); o E225 reprovou a primeira versão do B5 (a devolução se registra no cancelado de propósito) e a guarda encolheu para a saída; B6 declarado como ponto cego, não consertado |
| ~~**E246**~~ | ~~o E2E para de depender do dev~~ | D1–D4, D6–D9 | ✅ `f373a65e` · [relatório](execucao/E246.md) — a fixture da reserva renovada a cada run (respeitando a EXCLUDE), o `13` pelo `href`, o `07` pela busca, contrato próprio no `08` e no `15` (os 4 `skip` saíram), o `16` num ramo só, a competência do `36` em SP, o rastro por tela de `04`/`05`/`51` apagado, as 779 contas do `34`, a data do `52` derivada. E2E 186 em 6,8 min, 0 skipped · banco virgem 16 passed |
| ~~**E247**~~ | ~~as réguas veem a segunda forma~~ | G1–G8, G10 | ✅ `fb00bd96` · [relatório](execucao/E247.md) — cada régua aprende a segunda forma e prova que vê: dois vermelhos literais sobre o repositório como estava (`createParcelaAvulsa (requestBody inline).descricao` sem teto → `maxLength: 1000` no spec; o `52` com `T12:00:00Z` → a âncora da casa); cabines 9 → 12; escritores diretos derivados; a régua do gesto prega a chamada; a cena CANCELADA afirma; as corridas por `sleep` provam a espera; a bomba do `e217` (02/11/2027) desarmada. API 1865 · E2E 186 |
| ~~**E248**~~ | ~~os manuais dizem o que o sistema faz~~ | F1–F8 | ✅ `5096469b` · [relatório](execucao/E248.md) — vendedora (F1, F2, F4), recepção (F4), proprietário (F3, F5, F6, F7, F8); as cinco varreduras dos manuais 29/29 (moldes 11 → 12); PDFs republicados |
| ~~higiene 🔵~~ | ~~lote~~ | B7, C8, C9, C11, C12, E2–E4, G9, G11–G15, A6, A7 | ✅ `484f429b` · [relatório](execucao/higiene.md) — **13 de 17** fechados (A6, A7, B7, C8, C9, C11, C12, E2, E3, E4, G9, G14, dois títulos de G15); **G11, G12, G13 e o resto de G15 ficam declarados na S-CF3** (réguas de propósito grossas, e a régua de prazos é numérica). API 1865 · frontend 1017 · E2E 186 em 7,4 min |

## Sobras

O que aparecer de passagem durante a execução entra aqui **no mesmo commit que
o viu** (regra 12) e sai riscada no commit que a fecha (regra 21).

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
$1$1| S-CF3 | 🔵 | `varredura-campo-escalar-do-spec`, `varredura-manuais-prazos`, `varredura-das-varreduras`, `sc140`, `so18`, `revisao-reserva-avaria`, `varredura-fixture-do-e2e`, `varredura-expurgo-lgpd` | Os 🔵 da lente G que o lote de higiene deixou DECLARADOS: G11 (o `escrito()` grosso), G12 (os dias vedados da 17ª em prosa sem `data-regua` — a régua de prazos é numérica; ensinar-lhe dias da semana é régua nova), G13 (a heurística da varredura-das-varreduras) e os menores de G15 (alias de SQL pregado, `dataFutura(-n)` como "há n dias", medições em `moscow_base`, o `const r` reutilizado, `coluna:` em comentário). Nenhum tem defeito vivo atrás | aberta (higiene, 16/08) |

## Decisões da dona

| Épico | Pergunta | Recomendação | Estado |
|---|---|---|---|
| E241 | sob `estornar`, a conta a pagar `DEVOLUCAO` nasce? | não nasce — o dinheiro já voltou pelo estorno | executada na recomendação em `e9231ce1` (16/08); corrigível numa linha |
| E242 | os 12 meses de IPCA DE EXEMPLO (pedido de 15/08, `bb03a0f7`) valem para a instalação de TESTE (E2E, demo) — a REAL nasce sem índice, e a 9ª fica dita até a dona digitar o IPCA. Confirma? | sim; se quiser os exemplos também na real, `SEED_IPCA_EXEMPLO=true` | executada na leitura recomendada em `3029efba`; a dona confirma ou vira uma env |
| E244 | a 16ª cobra pelo `dataDevolucao` do papel ou pela janela? | o papel — é o que a noiva assinou | executada na recomendação em `d880b43a`; corrigível numa linha (`fimPrevistoDaDevolucao`) |
