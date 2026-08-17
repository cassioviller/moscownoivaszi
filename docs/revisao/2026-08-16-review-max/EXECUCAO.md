# A fila do `/code-review max` — a execução

A tabela de épicos abaixo é a **fila**. A **fonte da verdade do que continua
aberto é a tabela S-R2…S-R19** da conferência —
[`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../2026-08-16-conferencia-do-contrato/EXECUCAO.md),
seção *"O que o `/code-review max` achou depois"* —, e é lá que cada linha é
riscada com o hash do commit que a fecha (regra 21). **Conte aquela tabela,
não este arquivo.**

Plano: [`2026-08-16-a-fila-do-review-max-plano.md`](../../propostas/2026-08-16-a-fila-do-review-max-plano.md)
· Base: `619f347d`

## O que a revisão abriu

Dez ângulos sobre `fb3dcb50`, **19 achados**, conferidos um a um antes de
entrar na tabela — nenhum descartado. A S-R1 (a suíte de API vermelha no
`main`) fechou em `3c71d474` e virou a **regra 35**. Eram **18 abertos:
1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**, em **6 épicos**. Sete deles nasceram da fila do
mesmo dia (E242, E244, E245, higiene, E248).

**Contado em 17/08/2026, depois do E249** (`458adf11`): das 18, **três
fecharam** — S-R2 🔴, S-R3 🟠, S-R12 🟡 —, e o E249 abriu **uma** (S-RM1 🟡, na
tabela abaixo). O repositório inteiro tem hoje **17 sobras abertas: 0 🔴 · 6 🟠
· 9 🟡 · 2 🔵** — as 15 S-R que restam, mais a S-M17 (que espera a instalação
real) e a S-RM1. **Conte as tabelas, não este parágrafo.**

*Uma correção de contagem, feita aqui em 17/08:* o cabeçalho da conferência
publicava *"1 🔴 · 8 🟠 · 8 🟡 · 2 🔵"*, que soma **19** para **18** linhas.
Contadas uma a uma, as 18 são **1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**. O número errado
tinha sido copiado para o ponteiro, para o plano e para este arquivo.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E249**~~ | ~~a data do papel segue o casamento, e todo mundo lê a mesma data~~ | S-R2 🔴, S-R3 🟠, S-R12 🟡 | ✅ `458adf11` · [relatório](execucao/E249.md) — o papel recalcula pela janela nova quando o casamento é adiado (hora preservada, e só cede à 4ª); `disponibilidade.ts` lê `fimPrevistoDaDevolucao` pelo SELECT que já existia; o `PATCH /contratos` derruba a fila. Vermelho antes: `expected 48000 to be +0` — e a sobra dizia R.000,00, porque o caput da 16ª multiplica POR PEÇA. API 1878 · E2E 187 |
| **E250** | o que se escreve num banco que já existe | S-R5 🟠, S-R9 🟠 | pendente |
| **E251** | as portas ao lado, segunda passada | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡 | pendente |
| **E252** | o envio à contabilidade é por ATO, não por parcela | S-R6 🟠 | pendente |
| **E253** | as telas apagam e mostram o que o banco tem | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | pendente |
| **E254** | a letra e a régua | S-R14 🟡, S-R15 🟡, S-R18 🔵 | pendente |

## Decisões

| Pergunta | Recomendação | Estado |
|---|---|---|
| **E249** — casamento adiado: a data de devolução do papel recalcula pela janela nova, anda os mesmos dias, ou fica onde está? | **Recalcula pela janela nova** (E224: janela de uso andando até dia de expediente), preservando a hora; a retirada anda junto | aberta — executada na recomendação |

## Sobras

Sobra NOVA, vista de passagem durante esta execução, entra aqui no mesmo
commit que a viu (regra 12) e sai riscada no que a fecha (regra 21). As
S-R\* não moram aqui: elas moram na tabela da conferência.

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
| S-RM1 | 🟡 | `disponibilidade.ts` (`janelasSemOlharCancelamento`) × `reservas.ts` (`PATCH /reservas`) × `contratos.ts` (`POST /contratos`) | **A data do papel agora ESTICA a janela física, e ninguém revalida os dias que ela estica.** Desde o E249/S-R3, `fimUsoPrevisto` é `fimPrevistoDaDevolucao` — e o papel do E224 anda para a frente até dia de expediente, logo é `≥ casamento + usoDiasDepois`. O `PATCH /reservas` valida a disponibilidade do candidato pela JANELA (`casamento + 2`) e grava um papel que pode ir a `+3` ou `+4`; o `POST /contratos` grava `dataDevolucao` vinda da sugestão da tela sem consultar disponibilidade nenhuma. Nos dias entre a janela e o papel a peça fica ocupada por uma escrita que o 409 não viu. Casamento sábado, janela até segunda (fechada), papel na terça: a terça é ocupada sem ter sido validada. **Não é regressão do E249** — o `POST /contratos` já gravava assim desde o E224; o que o E249 fez foi dar efeito de ocupação a um campo que antes não tinha nenhum. O conserto é passar o papel novo ao candidato antes de validar (e validar no `POST /contratos`), e mora na mesma família da S-R8: precisa da ordem de trancas do E251 | aberta (E249, 16/08) — **vista de passagem, conferida no código** |
