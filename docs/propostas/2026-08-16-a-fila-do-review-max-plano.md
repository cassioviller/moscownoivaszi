# A fila do `/code-review max` — o plano para E249–E254

**Escrito em 2026-08-16**, sobre `619f347d` (o ponteiro já apontando para esta
fila). Fonte: a tabela **S-R2…S-R19** da seção *"O que o `/code-review max`
achou depois"* em
[`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../revisao/2026-08-16-conferencia-do-contrato/EXECUCAO.md)
— dez ângulos sobre `fb3dcb50`, 19 achados, **1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**
abertos (a S-R1 fechou em `3c71d474`). Sete deles nasceram da fila do MESMO
dia: E242, E244, E245, higiene e E248.

O rastreador desta fila é
[`2026-08-16-review-max/EXECUCAO.md`](../revisao/2026-08-16-review-max/EXECUCAO.md).
**A fonte da verdade das S-R continua sendo a tabela da conferência** — é lá
que cada linha é riscada com o hash (regra 21), e é lá que se conta. Sobra
NOVA, nascida durante esta execução, entra na tabela de Sobras do rastreador
novo, no mesmo commit que a viu (regra 12).

## A ordem, e a razão dela

Dinheiro primeiro, e dentro do dinheiro **o que a loja cobra da noiva** antes
do que a loja deixa de declarar. Depois as portas ao lado, depois as telas,
por último a letra e a régua.

O critério não é a severidade sozinha: o E249 é o único achado da fila que faz
o sistema **oferecer uma cobrança de R$ 12.000,00 contra quem devolveu no
prazo**, e ele nasceu do E244 — o épico de ontem que pôs o papel no comando
sem que ninguém mantivesse o papel atualizado.

| # | Épico | Tese | Fecha | Custo |
|---|---|---|---|---|
| 1 | **E249** | **A data do papel segue o casamento, e todo mundo lê a mesma data** — adiar a reserva move `contratos.data_devolucao`; o módulo que pinta o acervo lê `fimPrevistoDaDevolucao`; a porta que edita a data derruba a fila | **S-R2 🔴**, S-R3 🟠, S-R12 🟡 | 1 porta, 1 lib compartilhada, 1 módulo de disponibilidade — **1 commit + E2E** |
| 2 | **E250** | **O que se escreve num banco que já existe** — o índice de exemplo sai do banco da loja e o leitor deixa de ter o que ignorar; o backfill da S-A27 para de cruzar lojas | S-R5 🟠, S-R9 🟠 | 2 migrações + 1 script de demo + 1 varredura — 1 commit |
| 3 | **E251** | **As portas ao lado, segunda passada** — o 200 que mente vira 409; o ciclo ABBA some; o VALOR e a TRILHA entram na tranca com o `tx` | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡 | 5 consertos, cada um com a cena de corrida (molde do E212/S-C240) — 1 commit |
| 4 | **E252** | **O envio à contabilidade é por ATO, não por parcela** — o desenho do E115/E235 que a conciliação já pratica | S-R6 🟠 | 1 tabela + 1 migração + 1 porta + backfill — 1 commit |
| 5 | **E253** | **As telas apagam e mostram o que o banco tem** — o alvo por identidade, não por índice; a prévia que a dona lê antes de fechar a competência | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | 4 telas — 1 commit |
| 6 | **E254** | **A letra e a régua** — o teste que prega o caminho torto (regra 34), o manual da noiva, a cerca que não alcança | S-R14 🟡, S-R15 🟡, S-R18 🔵 | 1 spec, 1 manual + PDF, 1 cerca — 1 commit |

Soma: **18 sobras em 6 épicos**, 6 commits de código. Conta: 3 + 2 + 5 + 1 + 4
+ 3 = 18.

## A decisão da dona — uma só, e não trava a fila

| Pergunta | Recomendação | Estado |
|---|---|---|
| **E249** — o casamento foi adiado. A data de devolução que o papel imprime (a 5ª: 18:00 do dia da devolução) **recalcula pela janela nova**, **anda os mesmos dias** que o casamento andou, ou **fica onde está** para a vendedora reescrever à mão? | **Recalcula pela janela nova**, com a mesma função que a sugeriu no fecho do contrato (E224: janela de uso, andando para a frente até dia de expediente) e preservando a HORA gravada. Andar os mesmos dias cai em dia fechado quando o casamento muda de dia da semana — que é exatamente o que o E224 existe para evitar (**67 de 127 reservas**, 53%, tinham uma das pontas em domingo ou segunda). Deixar como está é o defeito de hoje. **A retirada anda junto**: é a mesma cláusula e o mesmo papel | executada na recomendação, para a dona confirmar |

Nenhuma outra pergunta desta fila é de produto. O E250 e o E252 são
técnicos, o E251 é corrida, o E253 é tela e o E254 é letra.

## O que cada épico MEDE antes de mexer (regra 20)

As sobras desta fila nasceram com âncora obrigatória e verificador
independente — a regra 33 diz para esperar taxa alta de acerto, não para pular
a conferência. O que **já medi** ao escrever este plano, no `heliumdb`:

- **E249** — `select count(*) from contratos where data_devolucao is not null`
  → **0 de 828** (316 ATIVOS). O 🔴 está **armado, não disparado**: o `dev` é
  anterior ao E224 e nenhuma venda pela tela nova entrou aqui. Ele dispara na
  primeira noiva que fecha contrato pela tela e adia o casamento — e o E244 foi
  ao ar ontem. O vermelho a escrever ANTES do conserto: mover a data de uma
  reserva com contrato ATIVO e afirmar que `contratos.data_devolucao` andou.
- **E250** — `select atualizado_por, count(*) from indices_monetarios group by
  1` → **11** linhas `seed (valor de exemplo — troque pelo IPCA publicado)` ·
  **11** `demonstração (valor de exemplo)` · 3 `Super Admin`. E **110 parcelas
  vencidas** em aberto no banco, que é a população sobre a qual a correção de
  exemplo é impressa hoje. O `banco-virgem.ts` é régua obrigatória deste épico
  (regra 27).
- **E251** — cada tranca com a cena de corrida que prova que a rota ESPEROU,
  não que ela passou. O B1 do E245 foi provado por `pg_locks`; o mesmo molde
  vale aqui.
- **E252** — `enviado_contabilidade_em` está **NULL em todas as 322 parcelas**
  (19 PREVISTA · 101 PARCIAL · 202 PAGA): o defeito é armado, e o backfill do
  épico tem população zero neste banco — o que **não** dispensa escrevê-lo, é a
  instalação real que o recebe.
- **E253** — o S-R7 se mede na tela: apagar a 1ª de três opções e afirmar qual
  sumiu. O `useFieldArray` congelado no mount é o mecanismo; a régua é o
  vermelho com o código de hoje.
- **E254** — o S-R14 pede o gesto da regra 34: **quebrar de propósito a guarda
  que o teste deveria proteger e mostrar que ele segue verde**. Sem esse
  vermelho invertido o conserto não está provado.

## As três armadilhas que este plano já conhece

1. **O conserto óbvio do S-R6 está ERRADO, e é por isso que ele é um épico
   inteiro.** Limpar `enviadoContabilidadeEm` quando chega um pedaço novo —
   que é o que o A6 da higiene fez com o irmão `conciliadoEm` — reenvia a
   parcela INTEIRA no próximo pacote e **duplica os R$ 400,00 já declarados**,
   porque o envio carimba a LINHA e o fato é o ATO. O desenho certo já existe
   no repositório: `conciliacao_de_recebimentos` (E115/E235) carimba o
   `atoId` do `PARCELA_RECEBIDA` e **deriva** o carimbo da parcela quando
   todos os atos válidos estão carimbados. O E252 espelha essa tabela; não
   inventa nada.
2. **O S-R8 é um ciclo, e ciclo não se conserta num lado só.** `PATCH
   /bloqueios` tranca contratos → vestidos; `PATCH /reservas` tranca vestidos →
   contratos. Consertar um sem o outro só muda qual das duas rotas morre com
   40P01. A ordem escrita no comentário do E245 (*contratos → bloqueios →
   vestidos*) é a que vale; o código é que tem de obedecer, nos dois sítios.
3. **O E249 mexe no que a trilha grava E no que a tela lê — o E2E é
   obrigatório ANTES do commit** (regra 11, sem a emenda: a emenda solta o E2E
   por LOTE, e mantém a obrigação para o commit que muda a gravação). O E250
   pede o `banco-virgem.ts`. O E253 pede o E2E do lote.

## O que este plano custa

Seis épicos, seis commits de código, cada um seguido do
`docs(review-max): registra o hash do E2XX no rastreador`. A régua por commit
é a **API inteira (1865 testes, ~11,6 min) + typecheck em 5 projetos**; o
**E2E (187, ~6,5 min)** roda no E249 (obrigatório), no fecho do lote de telas
(E253) e no fecho da fila; o **`banco-virgem.ts`** (~1 min) roda no E250 e no
E252, que são os dois que tocam migração.

E a ordem de gestos que a **regra 35** impôs ontem vale para os arquivos novos
deste plano (a migração do E250, a tabela do E252, o spec do E254): **`git add
-N` antes de medir**, senão as varreduras que enumeram por `git ls-files` leem
um repositório sem eles e devolvem verde sobre um conjunto que não os inclui.
