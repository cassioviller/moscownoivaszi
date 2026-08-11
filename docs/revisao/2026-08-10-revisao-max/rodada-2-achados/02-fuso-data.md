# Ângulo 2 — fuso-data
**Rodada 2, base `89b38c8`** · localizador + cético por achado

Quatro achados sobreviveram ao cético em 601 arquivos varridos; nenhum foi
refutado. O grosso do ângulo já estava pago por E111/E115/D15/C10 — o que
sobrou vive nas bordas onde uma camada pergunta pelo DIA e outra pergunta pelo
INSTANTE.

## Sobreviventes

### 1. 🟡 Vigência de comissão: validação pergunta pelo DIA, dedup pergunta pelo INSTANTE — a correção vira segunda regra na mesma competência

**Âncora:** `artifacts/api-server/src/routes/comissao.ts:413` · **Sobra:** nenhuma enumerada.

**Evidência.** A linha 387–391 declara a semântica: "A pergunta é sobre o DIA,
não sobre o instante: `2020-01-01T12:00-03:00` e `2020-01-01T00:00-03:00` são o
mesmo primeiro dia" — e valida com
`const diaDoMesSP = Number(diaLocal(vigenciaInicio).slice(8, 10))`. A linha 413,
no MESMO handler, deduplica com
`eq(comissaoRegrasTable.vigenciaInicio, vigenciaInicio)` — igualdade de
timestamp cru. O default da tela é `limitesCompetencia(...).fim` =
`T00:00:00-03:00` (linha 372, `lib/comissao.ts:214`); a âncora canônica do
sistema para dia de negócio é `T12:00:00-03:00` (`datas.ts:107`).

**Mecanismo.** O handler diz que dois instantes do mesmo primeiro dia são a
MESMA vigência, mas o upsert que decide entre "corrigir" e "inserir" compara o
timestamp. Uma regra criada pela tela nasce em `2026-09-01T00:00:00-03:00`
(03:00Z); uma correção enviada pela API com a âncora canônica do próprio
sistema, `2026-09-01T12:00:00-03:00` (15:00Z), passa na validação (dia 01) mas
não casa no `eq` — insere uma SEGUNDA regra da mesma competência para a mesma
vendedora, quebrando o invariante da linha 418 ("Redefinir a mesma vigência é
corrigir a regra, não versionar de novo"). O
`find(r => r.vigenciaInicio < fimComp)` em ordem desc (linha 618) passa a
escolher pela hora da âncora, não pela intenção; e a linha do tempo da tela
(`comissoes/index.tsx:914-915`, `fim = sucessora.vigenciaInicio − 86_400_000`)
desenha "valeu de 01/09/2026 a 31/08/2026" — um período invertido.

**Consequência.** Se a regra vigente nasceu via API ao meio-dia (5%) e a
operadora depois a "corrige" pela tela (3%, âncora meia-noite), a antiga
continua vencendo o `find` — o fechamento de uma venda de R$ 10.000,00 paga
R$ 500,00 de comissão em vez de R$ 300,00, com a tela mostrando duas versões da
mesma competência e um intervalo invertido.

**O cético confirmou em todas as camadas:** o Zod gerado (`api.ts:7235`) aceita
qualquer instante sem normalizar hora; a unique do schema
(`lib/db/src/schema/comissao.ts:32`) é sobre o timestamp exato e aceita duas
regras da mesma competência com horas diferentes; o teste de upsert
(`lote9:113-137`) só exercita o mesmo timestamp duas vezes. O gatilho exige
criação por API direta com `vigenciaInicio` explícita (a tela não a envia
hoje) — por isso 🟡, não 🟠.

### 2. 🟡 Fila "orçamento vencendo": validade é data de negócio (âncora meio-dia) mas é comparada como instante — o lembrete morre ao meio-dia do último dia

**Âncora:** `artifacts/moscow-noivas/src/lib/mensagens-do-dia.ts:108` · **Sobra:** nenhuma enumerada.

**Evidência.** `const t = new Date(o.validade).getTime(); return t >= agora &&
t <= agora + JANELA_ORCAMENTO_MS;` — sob o comentário "os já vencidos não
entram". A validade nasce em `ancoraDeNegocio(addDias(hojeLocal(), 30))`
(`orcamentos.ts:216`) e a tela a edita como dia puro (`diaDeNegocio`/
`diaParaISO`, `orcamentos/[id].tsx:411` e `:581`): o meio-dia é representação
do DIA, não prazo.

**Mecanismo.** O `t` é sempre o meio-dia de São Paulo do dia de validade. A
comparação `t >= agora` declara o orçamento "vencido" às 12:00:01 do próprio
dia de validade — enquanto a régua do sistema para vencimento é por dia
(`estaAtrasada`: `diaDeNegocio(vencimento) < hoje`,
`lib/financeiro-core/src/caixa.ts:213`, que só considera atrasado no dia
SEGUINTE). Na outra ponta, `t <= agora + 72h` só deixa o orçamento entrar na
fila a partir do meio-dia do primeiro dia da janela: às 09:00 de 10/08, uma
validade de 13/08 (âncora 12:00 de 13/08 = 75 h à frente) ainda não aparece.
São duas réguas de "vencido" no mesmo sistema: o core conta dias, a fila
compara instantes contra uma âncora que não é prazo.

**Consequência.** Validade 2026-08-13: a fila de mensagens
(`mensagens/index.tsx:256`, "validade nas próximas 72h — ainda não vencidos") e
o card do dashboard param de oferecer o lembrete às 12:00 de 13/08 —
exatamente a tarde do último dia, quando a mensagem "sua proposta vence hoje"
mais converte. A proposta segue valendo o dia inteiro pela régua do resto do
sistema; a loja perde meio dia de follow-up em todo orçamento.

**O cético confirmou** que não há guarda noutra camada: nenhum status
`VENCIDO`, nenhum job de expiração, e o teste
(`mensagens-do-dia.test.ts:119-140`) fabrica validades como instantes
relativos, nunca ancoradas — ele prega a semântica errada. Ambos os
consumidores (`dashboard.tsx:204`, `mensagens/index.tsx:258`) passam
`Date.now()` cru. 🟡: gatilho diário, mas o custo é janela de follow-up, não
dinheiro nem dado.

### 3. 🟡 Dez specs E2E computam "hoje" no dia UTC contra um app que vive em `hojeLocal` — nas 3 horas finais do último dia do mês, o spec 09 falha determinístico

**Âncora:** `e2e/09-financeiro.spec.ts:45` · **Sobra:** nenhuma enumerada.

**Evidência.** `const hoje = new Date().toISOString().slice(0, 10); const
vencimento = `${hoje}T12:00:00-03:00`;` — sob o comentário "Meio-dia de São
Paulo: o dia não escorrega para o vizinho em fuso nenhum" (linha 44), que
protege a HORA mas não o DIA, que já nasceu do calendário UTC. O mesmo padrão
em `e2e/23:94`, `24:21`, `25:38`, `26:64`, `29:49`, `57:66`, `58:41`, `59:69`
e `60:65` — o grep via `git ls-files` devolveu exatamente as dez linhas.

**Mecanismo.** Das 21:00 à meia-noite de São Paulo, o dia UTC já é o dia
SEGUINTE da loja. O spec 09 cria a conta "Aluguel" com vencimento nesse dia-UTC
e depois exige `getByText("Aluguel")` visível em `/financeiro/pagar` — cuja
janela padrão é o mês corrente de `hojeLocal()` (`resolverIntervalo` +
`negocioNoIntervalo(c.vencimento, intervalo)`, `pagar.tsx:82/201`;
`lib/financeiro-core/src/datas.ts:17-25` prega a America/Sao_Paulo). Rodando em
2026-08-31 às 22:00 SP (= 2026-09-01T01:00Z): hoje-UTC = "2026-09-01", a conta
nasce vencendo 01/09 ao meio-dia, a tela mostra 01–31/08 — o Aluguel não
aparece e o assert da linha 113 estoura. Nos demais dias o dia deslocado cai no
mesmo mês e o assert passa; nos nove specs irmãos as janelas são largas
(próximas 48 h, provas futuras) e o hoje errado passa por sorte.

**Consequência.** Falha certa nas ~3 horas finais do último dia de cada mês
para o spec 09 (o cético corrigiu o localizador aqui: não são 3 h por dia): o
run vermelho sem código errado consome exatamente o tipo de investigação que a
régua das quatro suítes existe para evitar. Custo por run quebrado, não
dinheiro do ateliê. Sem guarda em backend, Zod ou schema; não duplica a S-M13
(que era hora de expediente, não dia) nem as quatro sobras abertas.

### 4. 🟡 Sazonalidade de casamentos: `casamentoData >= now()` compara data de negócio com instante — o casamento de hoje sai da curva ao meio-dia

**Âncora:** `artifacts/api-server/src/routes/leads.ts:438` · **Sobra:** nenhuma enumerada. · **Severidade corrigida pelo cético: 🔵 → 🟡.**

**Evidência.** `` sql`${leadsTable.casamentoData} >= now()` `` e
`` sql`${leadsTable.casamentoData} < now() + interval '12 months'` `` — enquanto
a linha 430 do MESMO SELECT já trata `casamentoData` como dia
(`to_char(... at time zone 'America/Sao_Paulo', 'YYYY-MM')`).

**Mecanismo.** `casamentoData` é data de negócio ancorada ao meio-dia de São
Paulo (`vestidos.ts:240`, `atendimentos/novo.tsx:266`; a convenção de escrita é
`diaParaISO`, `formatos.ts:151-152`). Comparar contra `now()` faz o recorte
depender da hora da consulta: um casamento de hoje à noite tem âncora 12:00 SP
e, a partir de 12:00:01, `>= now()` é falso — ele some da curva embora ainda vá
acontecer. A régua da casa para "hoje pra frente" é `inicioDoDia`/dia local,
explícita duas rotas ao lado (`reservas.ts:286-297`, E87, no recorte de
bloqueios futuros).

**Consequência.** O bucket do mês corrente do gráfico de sazonalidade oscila
com a hora do dia — perde o casamento do próprio dia à tarde. É gráfico de
planejamento de arara, sem dinheiro nem dado perdido.

**O cético confirmou** que não há guarda em outra camada (nenhum teste prega a
fronteira de data da sazonalidade) e subiu a severidade: a saída muda com a
hora da consulta — é defeito real de comportamento, de gatilho raro e custo
baixo, não só limpeza. 🟡.

## Refutados

Nenhum. Os quatro achados que o localizador levou ao cético sobreviveram — dois
deles com correção (o alcance temporal do spec 09 no achado 3; a severidade no
achado 4). Os candidatos que morreram, morreram antes, na leitura do próprio
localizador, e estão listados na Cobertura.

| Título | Âncora | Refutação |
|---|---|---|
| — | — | — |

## Cobertura

**Teto NÃO atingido:** 4 achados em 601 arquivos varridos.

**Padrões varridos:** `new Date` cru sobre YMD, `toISOString().slice(0,10)`,
`setHours`, `gte`/`lt` de janelas, formatadores `Intl`, e
`diaLocal`×`diaDeNegocio` em todos os call sites.

**Por que o ângulo rendeu pouco:** o grosso já foi pago por E111/E115/D15/C10 —
dashboard, fluxo, extrato, conciliação, contabilidade, alerta-caixa, expurgo
LGPD, agenda (dia/semana/grade), portal e recorrências estão na régua única: o
servidor corta instantes por `[inicioDoDia(de), inicioDoDia(ate+1))` e
vencimentos ancorados ao meio-dia SP casam com os dois fusos de leitura.

**Candidatos investigados e descartados com leitura** (não chegaram ao cético):

- `semana.tsx` com `T12:00:00` sem offset — colunas-calendário sintéticas,
  decisão documentada do E115; o filtro re-corta por `diaLocal`.
- `parseDia` local em `vestidos/index.tsx` — alimenta o react-day-picker,
  correto em fuso do navegador.
- `diaMesAno` UTC sobre `vigenciaInicio` — âncora 00:00−03:00 → mesmo dia UTC.
- Validade formatada com `instanteLongo` — meio-dia SP → mesmo dia.
- `lte(dataReferencia, inicioDoDia(hoje+1))` no alerta-caixa — a âncora de
  meio-dia exclui o amanhã.
- `vencimentoComissao` via `toISOString` do fim — 03:00Z → mês certo.
- `ausenciaQueCobre` ao meio-dia — ausência tem grão de dia.
