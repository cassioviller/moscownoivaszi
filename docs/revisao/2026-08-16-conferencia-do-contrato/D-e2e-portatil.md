# Lente 4 — o que só passa porque o dev acumulou

**2026-08-16** · agente de leitura pura · base `main` · `heliumdb`, loja da suíte `84e539bd-…` · lidos os 65 `e2e/*.spec.ts` inteiros, `global-setup.ts`, `helpers.ts`, `auth.setup.ts`, `seed.ts`, a `varredura-fixture-do-e2e`.

**Em uma linha:** a medição da S-O93 (175 · 1 · 4 skipped) está certa e continua certa; a leitura acha além dela **3 🟡 e 8 🔵**, e o mais caro tem data marcada: o `13` reprova no `heliumdb` a partir de **15/10/2026** sem que uma linha de código mude.

## 🟡

1. **`07-orcamentos.spec.ts:14,24` — a página 1 de `/orcamentos` está cheia de lixo da MESMA noiva, e é isso que faz o assert passar.** `e2e-orcamento-1` (RASCUNHO, 07/07) é o **#303 de 303** na ordem da tela; as posições 1–60 são 60 RASCUNHOs de `e2e-lead-1` de 30/07 que nenhum spec vivo cria. Em banco virgem passa; em qualquer banco onde outra coisa ocupe 24 linhas antes dela, reprova — a lição que o `05` aprendeu no E124/D2. Conserto: buscar por `input-busca-orcamento` (o `54` usa) ou ir a `/orcamentos/e2e-orcamento-1`.
2. **`13-onda2-telas.spec.ts:67-68` + `global-setup.ts:331-352` — a fixture da reserva tem casamento em 14/10/2026 e o `garantir` nunca a renova.** "+90 dias" da PRIMEIRA criação (16/07 → 2026-10-14). `/reservas` abre em `futuras=true`; o teste clica o PRIMEIRO "Provas & ajustes" e exige `/reservas/e2e-bloqueio-1` — passa porque a fixture ainda é futura E é a reserva viva mais antiga (0 vivas antes de 14/10, conferido). **Em 15/10/2026** o `.first()` cai na `06838133…` (2027-02-06) e reprova. Conserto: renovar `casamentoData`/`ocupacao*` em todo run (o desenho do `AJUSTE_E2E`); no spec, `a[href$="/reservas/e2e-bloqueio-1"]`.
3. **`08-contratos.spec.ts:12,36,64` e `15-onda5-pdf-e-folha.spec.ts:176` — os "4 skipped" da S-O93 são quatro testes AUSENTES (regra 19), e quando rodam, rodam contra um contrato ARBITRÁRIO** (`contratos … limit(1)` sem `order by`, `lista[0]`) — hoje o `81bb2c3f…`, amanhã um dos 496 CANCELADOs. Receita no `09` (~15 linhas). Conserto: contrato próprio nos dois specs; retirar os `skip`.

## 🔵

4. `16` continua bifurcado por ambiente depois da S-O145 (o ramo "cria" só roda em banco virgem). Criar sempre a própria noiva e mirar a linha dela.
5. `38-serie-comissao.spec.ts:86-87` — "4.2%" é a taxa da LOJA INTEIRA; passa porque há 0 outros fechamentos. Derivar o esperado do `GET`.
6. `36-recebimentos-por-forma.spec.ts:22-23` — competência pelo mês UTC do processo (classe S-M25/S-O119; o `37` e o `41` fazem `-3h`). `diaLocalSP().slice(0, 7)`.
7. Rastro criado pela TELA, invisível à `varredura-fixture-do-e2e`: `04` deixa "Vestido Criado Pelo Teste" (**305**), `05` "Noiva Criada Pelo E2E" (**295**), `51` "Noiva Combobox …" (**225**). +3 por passada. Hook por nome+stamp ou pelo id da URL.
8. `34-despesa-recorrente.spec.ts:61,81` — "Gerar competência" gera TODAS as recorrências ativas para 20XX-0Y; **779** contas entre 2040-04 e 2089-09. A receita do `15`.
9. `52-orcamento-vira-contrato.spec.ts:189` — `"2026-09-10"` cravado, vira passado em 25 dias (a partir de 11/09 o caminho encena parcela vencida com mora). Derivar de `Date.now()`.
10. `helpers.ts:94` + `55:79-90` — a reserva de prova nasce ANTES do laço de horários e some se os 12 estiverem ocupados (0 hoje — armado).
11. Datas cravadas com validade: `18-agenda-grade` (2027-05-18), `47`, `48`, `52` (2027-05-15), `62`, `06` (2028-02-14). A mais próxima com efeito plausível: maio/2027.

## Conferido e portátil

00–06 (fora o rastro do 7), 09–12, 14, 17–33, 35, 39–50, 53–64; ids fixos sem `onConflict` e `afterAll` por nome amplo: nenhuma ocorrência viva; padrão de data já tratado no `37` (skip antes do dia 5) e no `63`.

## O que a lente ensina sobre a S-O93

A medição rodou UMA passada num banco novo — exatamente a passada em que os itens 1 e 2 são verdes por construção. O que reprova está ENTRE os extremos: o banco que acumulou meio caminho, o único que existe de verdade. E os quatro `skipped` são, pela regra 19, quatro testes que a suíte nunca mediu num cliente novo.
