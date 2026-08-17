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

**Contado em 17/08/2026, depois do E249 (`458adf11`) e do E250 (`91012acb`)**:
das 18, **cinco fecharam** — S-R2 🔴, S-R3 🟠, S-R12 🟡 pelo E249; S-R5 🟠 e
S-R9 🟠 pelo E250 —, e o E249 abriu **uma** (S-RM1 🟡, na tabela abaixo). O
repositório inteiro tem hoje **15 sobras abertas: 0 🔴 · 4 🟠 · 9 🟡 · 2 🔵** —
as **13** S-R que restam, mais a S-M17 (que espera a instalação real) e a
S-RM1. **Conte as tabelas, não este parágrafo.**

*Uma correção de contagem, feita aqui em 17/08:* o cabeçalho da conferência
publicava *"1 🔴 · 8 🟠 · 8 🟡 · 2 🔵"*, que soma **19** para **18** linhas.
Contadas uma a uma, as 18 são **1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**. O número errado
tinha sido copiado para o ponteiro, para o plano e para este arquivo.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E249**~~ | ~~a data do papel segue o casamento, e todo mundo lê a mesma data~~ | S-R2 🔴, S-R3 🟠, S-R12 🟡 | ✅ `458adf11` · [relatório](execucao/E249.md) — o papel recalcula pela janela nova quando o casamento é adiado (hora preservada, e só cede à 4ª); `disponibilidade.ts` lê `fimPrevistoDaDevolucao` pelo SELECT que já existia; o `PATCH /contratos` derruba a fila. Vermelho antes: `expected 48000 to be +0` — e a sobra dizia R$ 12.000,00, porque o caput da 16ª multiplica POR PEÇA. API 1878 · E2E 187 |
| ~~**E250**~~ | ~~o que se escreve num banco que já existe~~ | S-R5 🟠, S-R9 🟠 | ✅ `91012acb` · [relatório](execucao/E250.md) — a faxina apaga o índice de exemplo pela marca (que virou constante), e NÃO um filtro no leitor, que desfaria a decisão do E242; o backfill da S-A27 ganha `loja_id` nas três pontas e a vírgula vira `JOIN … ON`. **A sobra errava para MENOS o alcance do S-R9 e para MAIS o dano vivo do S-R5**: hoje ele cobra R$ 0,00 (nenhuma das 110 parcelas tem mês cheio de mora). Duas réguas novas, as duas medidas em vermelho. API 1881 · banco virgem 16 |
| **E251** | as portas ao lado, segunda passada | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡 | pendente |
| **E252** | o envio à contabilidade é por ATO, não por parcela | S-R6 🟠 | pendente |
| **E253** | as telas apagam e mostram o que o banco tem | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | pendente |
| **E254** | a letra e a régua | S-R14 🟡, S-R15 🟡, S-R18 🔵 | ⏳ **integrado em `f0f4b5d6`, régua completa PENDENTE** — typecheck verde em 5 projetos e os arquivos tocados verdes (`s-r18-cerca-da-fila` 4/4, `varredura-manuais-textos` 3/3). Falta a suíte de API inteira e o **E2E**, que o agente não podia rodar (S-O93) e que este épico exige: ele reescreve o `e2e/64`. **Não está fechado até isso rodar** (regra 25) |

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
| S-RM2 | 🟡 | `docs/manuais/*.html` × as telas que elas citam | **A prosa citada dos manuais não tem régua, e o E254 provou com um caso vivo.** São **161 aspas curvas em `<em>`** nos manuais; **82 batem literalmente com a tela e 79 não**. A família nova que o E254 escreveu (aspa que nomeia cláusula, em qualquer tag) cobre **13**. A prova é `docs/manuais/vendedora.html:800`: frase de sistema, envelhecida pelo E248, corrigida à mão no E254 — e nenhuma régua olhava para ela. **O atalho foi tentado e reprovou na regra 34**: a peneira automática por segmentos fixos derruba 79 → 52 e **aprova o próprio `:800`** (o segmento que sobra tem 17 caracteres); não entrou, e foi certo não entrar | aberta (E254, 17/08) — **medida pelo agente, 161/82/79 contadas** |
| S-RM3 | 🔵 | `e2e/64-portas-ganham-tela.spec.ts` × `admin/index.tsx:493,585` | `e2e/64` é o **único E2E que abre `/admin`**, e `editar-loja-${loja.id}` e `editar-usuario-${u.id}` nunca são clicados por spec nenhum. É a mesma tela da S-R19, e a mesma classe da S-CF2 (a porta que ganhou tela e nenhum E2E encena) | aberta (E254, 17/08) |
| S-RM4 | 🔵 | `varredura-manuais-textos` × JSX | A varredura compara a citação do manual com o **código-fonte cru**, e o JSX parte frases no meio: três das 11 declarações do E254 tiveram de escolher um fragmento mais curto que a frase da tela (`noivas/[leadId]/index.tsx:692-694`, `contratos/index.tsx:252-253`, `peca-exclusiva.ts:72-73`). A régua vale; o que ela compara é menos do que promete | aberta (E254, 17/08) |
| S-RM1 | 🟡 | `disponibilidade.ts` (`janelasSemOlharCancelamento`) × `reservas.ts` (`PATCH /reservas`) × `contratos.ts` (`POST /contratos`) | **A data do papel agora ESTICA a janela física, e ninguém revalida os dias que ela estica.** Desde o E249/S-R3, `fimUsoPrevisto` é `fimPrevistoDaDevolucao` — e o papel do E224 anda para a frente até dia de expediente, logo é `≥ casamento + usoDiasDepois`. O `PATCH /reservas` valida a disponibilidade do candidato pela JANELA (`casamento + 2`) e grava um papel que pode ir a `+3` ou `+4`; o `POST /contratos` grava `dataDevolucao` vinda da sugestão da tela sem consultar disponibilidade nenhuma. Nos dias entre a janela e o papel a peça fica ocupada por uma escrita que o 409 não viu. Casamento sábado, janela até segunda (fechada), papel na terça: a terça é ocupada sem ter sido validada. **Não é regressão do E249** — o `POST /contratos` já gravava assim desde o E224; o que o E249 fez foi dar efeito de ocupação a um campo que antes não tinha nenhum. O conserto é passar o papel novo ao candidato antes de validar (e validar no `POST /contratos`), e mora na mesma família da S-R8: precisa da ordem de trancas do E251 | aberta (E249, 16/08) — **vista de passagem, conferida no código** |
