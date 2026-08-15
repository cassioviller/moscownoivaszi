# Moscow Noivas — como se trabalha neste repositório

Sistema interno de um ateliê de noivas. O **que** o sistema é, como rodar e os
invariantes que já valem estão em **`replit.md`** — leia antes de mexer em
código.

Este arquivo é sobre o **como**. Ele é curto de propósito; cada seção aponta
para o documento que manda.

## Leia no começo da sessão

1. **`docs/revisao/METODO.md`** — como este sistema é revisado, criticado e
   ampliado. As **regras acumuladas** no fim do arquivo valem para o trabalho de
   hoje, e a seção de crítica diz por que cada uma existe, com a evidência que a
   motivou. Não é história: é o contrato.
2. **A trilha em curso** — `docs/revisao/2026-08-13-contrato-de-papel/`, aberta
   em 2026-08-13: o **instrumento de locação em papel** (21 cláusulas) virou fila
   de código. A transcrição (`A-transcricao.md`) e a auditoria (`B-auditoria.md`)
   compararam cláusula por cláusula com o que o sistema faz, e o plano
   (`docs/propostas/2026-08-13-o-contrato-vira-regra-plano.md`) fechou **12
   épicos, E211–E222, em quatro ondas** — ordenadas não por cláusula nem por
   valor, mas por **de onde vem o dado**. **As Ondas A, B e C estão EXECUTADAS**,
   menos o E219: E211 (`0c8874a`), E212 (`a88d7ead`), E213 (`fa7d838`), E214
   (`0c15cda`), E215 (`c3adcf93`), E216 (`eaa4e90`), E217 (`a2ada8aa`), E218
   (`f8ab561`), **E219 (`c0071940`)**, E221 (`fcc24e9`) e E222 (`31422db`) —
   **11 de 12**, mais os que a medição fez nascer: **E224** (`75fa2cbf`) e
   **E223** (`7455bc39`, a porta de trocar peça, que destravou o E219 em
   15/08). **O ÚNICO épico de código aberto na trilha é o E220**, travado em
   D4/D7.
   A tabela do `EXECUCAO.md` é a fila; **conte, não deduza** — depois da
   madrugada de 15/08 (E223 → E219 → S-C234, mais o **lote paralelo dos
   blocos 5–8**: quatro agentes, 20 sobras fechadas de uma vez, 9 abertas
   pelos próprios fechos) são **23 sobras** (**ZERO 🟠**, **2 🟡** — S-C51
   espera a contadora, S-C270 são os manuais atrás da onda —, 21 🔵) e **5
   pendências que não são software** (a P5 nasceu no E219: confirmar que os 7
   dias da 17ª contam do fecho). A sessão está contada em
   `docs/revisao/2026-08-15-sessao-a-fila-do-que-restava.md`. E a manhã de
   14/08 provou a S-A5 dentro do próprio rastreador: a linha-resumo dizia 55
   quando a tabela media 57.

   **O E215 é o primeiro épico da trilha em que a medição mudou o tamanho nos
   DOIS sentidos**, e as duas metades valem para os que faltam. Encareceu: o
   achado não era campo faltando, era **campo que existia e dava para pular** —
   `contratos.cpf` estava no schema, a tela o oferecia, era `optional()`, e
   estava em **0 de 735**. Barateou: dos que criam contrato, **58 arquivos usam
   um helper que faz `db.insert` direto e não passam pela porta**, então a
   primeira contagem (84+20) media a coisa errada; os que a guarda atinge eram
   43, e o conserto coube em **um lugar**. **Antes de estimar o custo de apertar
   uma porta, conte quem passa POR ELA, não quem escreve na tabela.**

   **O QUARTO lote foi o primeiro escrito em paralelo por agentes que não se
   falaram, e o resultado é que ELES corrigiram o plano de volta.** Quatro
   amarelas fecharam em `36a71b67` (S-C130), `33b54bdc` (S-C100), `f516b29f`
   (S-C140) e `202d4816` (S-C120), com **zero conflito de `cherry-pick`** —
   porque os arquivos foram cruzados antes de disparar. **O plano dizia que
   sete das oito sobras estavam erradas sobre si mesmas; os agentes acharam que
   o plano também estava, em três pontos, e cada correção é de MEDIÇÃO:**

   - **O vermelho que o plano prometeu não existia.** Ele afirmava que tirar o
     `.slice(0, 200)` reprovaria o `e212-...test.ts:182`. **Não reprova**: a
     fixture de lá é de UMA peça, a frase dá **147 caracteres**, e cortar 147 em
     200 é inócuo. O assert pregava o defeito **na letra e não no efeito**, e
     passava nas duas versões do código — o vermelho teve de ser CONSTRUÍDO com
     três peças. **Régua que prega a implementação em vez do efeito é verde nos
     dois lados do conserto.**
   - **O recorte do plano era estreito.** Ele mandava varrer `pages/**` atrás dos
     `z.enum`; isso descreve **onde os cinco estão, não onde o sexto pode
     nascer**. A varredura entregue cobre `src/` inteiro — 193 arquivos contra 73
     — e achou os mesmos cinco, o que é um fato NOVO: não há `z.enum` de
     formulário fora de `pages/` hoje.
   - **O plano viu duas telas e eram três vozes.** A mesma lista silenciada por
     `?? []` alimentava o banner do próximo passo, que mandava a Recepção
     **"Fechar o contrato — ela já disse sim"**, em botão, sobre contrato já
     fechado que ela não pode fechar.

   **E o paralelo cobrou um degrau novo, do lado da ferramenta: worktree de
   agente NÃO nasce na ponta.** Três dos quatro nasceram em `cbcd8b30`, **7 e 8
   commits atrás** da base que a tarefa mandou usar — e no worktree do E215 o
   `estadoCivil` ainda não estava em `PARES`, então medir ali teria descrito a
   sobra com 4 pares em vez de 5. Os três perceberam e se reposicionaram.
   **O primeiro gesto de todo agente é conferir a própria base**
   (`git merge-base --is-ancestor <base> HEAD`), e o do integrador é conferir a
   dos quatro antes de acreditar em qualquer medição que eles reportem. É a
   regra 29 pelo outro lado: lá o custo era o agente ATRASADO em relação ao
   `origin`; aqui é o agente atrasado em relação ao que a sessão acabou de
   commitar.

   **E o lote achou um 🟠 que sobra nenhuma mencionava, dentro do épico do dia
   anterior:** a **S-C150** — o E217 pôs `DEVOLUCAO` no enum do spec e **não
   re-rodou o codegen**, então a conta a pagar que a própria 13ª §3º cria fazia
   o `GET /financeiro/contas-pagar` responder **500** (`RESPOSTA_FORA_DO_CONTRATO`)
   — a tela inteira, não a linha nova. Conferido no `main` antes do conserto, com
   **1254 linhas em `contas_pagar` e ZERO `DEVOLUCAO`**: estava **armado, não
   disparado**. O `_cobreTodosOsTipos` do `dre.ts` existe para pegar isso e não
   pegou, e a frase é a lição: **guarda que depende do codegen só protege depois
   de o codegen rodar.**

   Das 7 🟡 de hoje, três não se fecham escrevendo código: **S-C60** (produto) e
   **S-C51** (modelagem) esperam decisão, e **S-C96** (os manuais) **destravou
   com o E217** e é a próxima da fila. As outras quatro são a **S-C110** e três
   que nasceram do lote — **S-C151** (a 13ª existe na API e `iniciativa` aparece
   0 vezes em `pages/` e 0 em `e2e/`), **S-C170** (o PDF manda 240 e 294
   caracteres para uma linha de 92 e **já sai da página no `main`**) e
   **S-C180**. O que resta tem plano próprio:
   [`2026-08-14-as-oito-amarelas-plano.md`](docs/propostas/2026-08-14-as-oito-amarelas-plano.md),
   e o anterior segue em
   [`2026-08-13-fechar-o-contrato-plano.md`](docs/propostas/2026-08-13-fechar-o-contrato-plano.md).

   **O E219 DESTRAVOU em 15/08, e o caminho foi o que a medição mandou:** a
   porta que ele guardaria não existia (`contrato_itens` e `contrato_bloqueios`
   recebiam escrita num sítio só — o `INSERT` do `POST /contratos`), então
   primeiro nasceu o **E223** (`7455bc39`, `POST /contratos/:id/trocar-peca`:
   prende a reserva nova ANTES de libertar a antiga, snapshot da PEÇA sem
   tocar no preço — os dois preços vão para a trilha) e só então a guarda da
   17ª (`c0071940`: 7 dias contados do FECHO, convenção declarada na frase e
   pendente de confirmação na P5; sextas e sábados vedados pelo dia do GESTO).
   De brinde nasceu `relogio.agora()` — a primeira regra que decide pelo dia
   da semana do clique não é testável sem relógio que o teste alcance.

   **Quatro épicos seguidos ensinaram a mesma coisa, de quatro formas: o plano
   deste contrato supõe portas que o sistema não tem.** No E213 a régua faltava
   na porta AO LADO (o `POST /receber` recusava os R$ 515,00 que as outras três
   leituras mostravam); no E222 o campo existia e **nenhuma tela** o oferecia (1
   de 723); no E219 a porta não existe; no E215 a porta existe, o campo é
   **opcional**, e por isso está em **0 de 723**. Por isso a primeira pergunta de
   cada épico virou *quantos passam por aqui hoje* — respondida com
   `git ls-files` e um `SELECT`, antes da primeira linha, e nos quatro casos ela
   mudou o tamanho do épico.

   **E o banco de `DATABASE_URL` é o `heliumdb`, não o `moscow_base`.** Os dois
   existem e não contam a mesma história: `moscow_base` tem **0 contratos e 0
   parcelas**. Três relatórios desta trilha nasceram dizendo `moscow_base` sobre
   medições que saíram do `heliumdb` (corrigido em `1d9ccff`). **Rode
   `SELECT current_database()` antes de escrever o nome do banco num relatório.**

   Os três da Onda A estabeleceram o mecanismo que a Onda B reusa: **uma cobrança
   nasce de um fato do contrato**, a conta é **DERIVADA** (cresce todo dia, e
   gravá-la estaria errado a partir da meia-noite seguinte) e o que o banco guarda
   é o **fato datado** — o degrau da troca, a peça que não voltou, o perdão da
   multa. Ele foi escrito três vezes antes de virar hábito.

   **A lição mais cara da trilha é de medição, e ela se repetiu:** o plano diz
   *"falta a conta"*, e falta a conta **mais a porta ao lado dela**. No E213, com
   a cláusula 9ª ligada, o `POST /receber` **RECUSAVA** os R$ 515,00 devidos por
   uma parcela de R$ 500,00 vencida há 30 dias — quatro leituras do mesmo número,
   e a única que decide dizia não. É o mesmo formato do E172 (tirar o contrato de
   `leads` fazia a Recepção **aprovar o orçamento**) e do E185.

   **E uma de operação, que o E213 pagou inteira: código sem medição parece
   pronto.** O épico chegou escrito na árvore — 805 linhas, duas migrações, o
   spec e o codegen — **sem uma única medição registrada**, porque a sessão que o
   escreveu caiu antes do commit. A árvore estava verde porque ninguém tinha
   rodado nada, e os vermelhos tiveram de ser **reproduzidos** depois do fato
   (reverter a linha do conserto, rodar, desfazer). O `PROGRESSO.md` da trilha
   anterior já dizia: **o arquivo é o registro, o resto é conveniência.**

   **2026-08-14, segunda metade: as OITO 🟡 de código fecharam em cinco
   commits, e não sobrou NENHUMA linha de código aberta em 🟡.** A sessão leu
   as 57 sobras em bloco
   ([`2026-08-14-a-clausula-sem-gesto-plano.md`](docs/propostas/2026-08-14-a-clausula-sem-gesto-plano.md))
   e executou a fila inteira em série:

   - **E226** (`6d1cf08a`) — a mora aparece onde se decide sobre ela (S-C190,
     S-C200, S-C210). A correção de medição que ordenou o épico: **o carnê era
     a quarta porta que a nota do E213 dava por coberta, e o dado NÃO chegava**
     (`with: { parcelas: true }` cru; `Parcela.mora` é `optional`, nada
     reprovava). O gesto de perdoar ganhou botão sob a régua do P6, e o E2E
     derrubou o spec 35 inteiro — era o único teste que encenava o diálogo
     sobre parcela vencida, e o número esperado agora é LIDO da fila (a mora
     cresce com os dias, lição da S-O119).
   - **E227** (`19296ca1`) — a 18ª e a 13ª ganham gesto (S-C211, S-C151). As
     portas estavam prontas desde o E217; **o épico inteiro coube num `<input>`
     e num rádio**, e é isso que a sobra denunciava: uma cláusula assinada
     morta por falta de campo.
   - **S-C170** (`a2822b82`) — a quebra de linha mudou de DONO: saiu dos
     call-sites e entrou no paginador, por onde todo papel passa. Régua de
     EFEITO sobre as linhas desenhadas (`(...) Tj`): `add()` novo sem quebra
     reprova no dia em que nascer.
   - **S-C180** (`e176746d`) — a tela deriva a oferta do schema e a varredura
     reprova a lista literal que repete o conjunto: **a cópia idêntica de hoje
     é a divergência de amanhã, e só a idêntica é detectável.**
   - **E225** (`68fa7239`) — a peça que saiu e não voltou OCUPA mesmo com o contrato
     cancelado (S-C110). Ocupar ganhou a segunda forma ("na rua": retirada real
     sem devolução, cancelado ou não — a frase da S-C85 aplicada à
     disponibilidade), num predicado só, e as dez portas herdaram. O vermelho:
     a noiva B levava **201** sobre a peça na casa da A. E um vermelho FALSO
     que virou nota: `dataFutura(-10)` não é passado — a base do helper é fixa
     em 2027, e a cena do atraso precisa de `Date.now()` real.

   **O que resta em 🟡 depois de 15/08**: a **S-C51** espera a contadora (o
   leitor de atos é decisão de modelagem) e a **S-C270** é a reescrita dos
   manuais depois da onda E223–E232 — quatro frases negam UI que existe, e as
   quatro estão PREGADAS como dívida declarada na
   `varredura-manuais-contradicao`, que nasceu no mesmo lote: a reescrita dá
   baixa e a régua cobra. Fora isso, 21 🔵 — conte na tabela.

   Esta linha já apontou para o **E222** depois de ele estar executado, que é a
   **S-A5 acontecendo de novo**: quem abre a sessão lê o estado velho como se
   fosse o de hoje. Se a fila mudar, é aqui que muda.

3. **A trilha anterior, e a que ainda tem sobras abertas** —
   `docs/revisao/2026-08-11-otica-dos-papeis/`,
   aberta em 2026-08-11 a pedido da dona: a revisão pela ótica de quem USA
   (dona, vendedora, costureira, noiva), mirando o **gate entre o aceite e o
   contrato**. Três lentes (8 ângulos, 3 alvos `high`, 4 fatias `max`)
   produziram **149 achados**; o plano
   (`docs/propostas/2026-08-11-otica-dos-papeis-plano.md`) os colapsou em
   **14 épicos, E158–E171, em quatro faixas**, e a Fase 0 (4 decisões da dona
   + 2 contagens) fechou no mesmo dia — todas na recomendação. **As Faixas A
   e B estão EXECUTADAS e publicadas**: E158–E163, seis commits de código,
   ~64 achados riscados, cada um com o vermelho medido literal antes do verde
   (a tabela do `EXECUCAO.md` da trilha é a fila; **conte, não deduza**). O
   maior fecho: o E162 abriu o caminho aceite → fila → reserva inline →
   contrato que NENHUM teste cruzava, e o beco do APROVADO terminal ganhou a
   porta gerencial. **A Faixa C está EXECUTADA**: E164 (`0eeb297`), E165
   (`784dd3c`), E166 (`3af3064`), E167 (`8b12b0d`), E168 (`4db042d`) e E169
   (`fe8afdd`). O E166 fez nascer o **primeiro E2E do caminho público**, que
   era ZERO enquanto o lado da loja tinha 165. **Os três últimos rodaram em
   PARALELO**, um agente por épico em worktree próprio, ~50 min de relógio, e
   os três `cherry-pick` entraram sem um único conflito — inclusive no
   `openapi.yaml`, que dois editaram (codegen re-rodado sobre o spec fundido:
   zero drift). Duas lições do paralelo, e as duas são do integrador: a
   **numeração de sobras colide** (os três reservaram faixas de S-O que se
   atropelaram), e **vermelho de worktree não é vermelho** — os três
   relataram o mesmo `backup-download-api.test.ts` reprovando, um deles como
   🟠, e no `main` ele passa: `res.download` recusa caminho com componente
   oculto, e todo worktree vive sob `.claude/`.

   **A Faixa D fechou junto, e com ela a trilha INTEIRA: os 14 épicos,
   E158–E171, estão EXECUTADOS.** O E170 (`50a4043`) contou os cinco testes que
   pregavam o defeito e achou **3 já fechados** pelos épicos que passaram pela
   área — a assimetria é o achado: *as duas que sobraram são as duas que
   ninguém tinha motivo de abrir*, e o defeito atrás de uma delas (a A05.5) não
   estava em épico nenhum. Dele nasceu a **regra 34**. O E171 (`30a8377`)
   enumerou **26 portas de escrita, não as 14 que o plano supunha** (as 14 eram
   as ABERTAS), em 16 tranca · 4 CAS · 6 dívida declarada — e **achou 4 portas
   abertas**, a mais grave dentro do E166 desta mesma sessão (S-O31 🟠: o
   `POST /link` lê o status no pool e dois cliques congelam duas versões da
   mesma proposta) — **fechada no mesmo dia** (`7763ee3`), com a varredura
   cobrando a baixa da dívida de 6 para 5 antes de aceitar o fecho. As outras
   três estão em `comissao.ts` (S-O32 🟡), **a única tabela quente que as
   Faixas A e B não abriram**. A sessão está contada em
   `docs/revisao/2026-08-11-sessao-faixas-c-e-d.md`, inclusive a terceira lição
   do paralelo: **escrever em paralelo, medir em série** — duas suítes de API
   simultâneas deadlockaram no banco compartilhado (13 s de CPU em 8 min de
   relógio).

   A trilha anterior — `2026-08-10-revisao-max/` — está de pé como história:
   a revisão `max` do aplicativo inteiro (68 agentes, 5,58 M tokens) sobre um
   repositório com ZERO sobras achou 15 defeitos verdadeiros (regra 33), e as
   mais graves fecharam no mesmo dia: o `DELETE` de cabine em cascata (S-M1
   `3f21fa7`), o carnê que nascia `AVULSA` e dobrava a venda (S-M3 `ae4a8e7`),
   a corrida das duas noivas pelo mesmo vestido (S-M7 `75882f0`) e a régua do
   banco virgem que escrevia no dev (S-M15 `050fa33`).

   **2026-08-11: a RODADA 2 rodou e a fila dela está EXECUTADA.** A segunda
   varredura (`RODADA-2.md`: 77 agentes, 3,76 M tokens, na 3ª tentativa — as
   duas primeiras morreram com a sessão, e a lição virou gravação por ângulo
   em `rodada-2-achados/`) devolveu **53 achados verificados** (nenhum 🔴,
   2 🟠, 45 🟡, 6 🔵), consolidados em **10 épicos**
   (`rodada-2-consolidado.md`) e fechados em 10 commits no dia seguinte —
   inclusive **a S-M9 (`bcbdf27`, 10 sítios criar×editar) e a S-M18
   (`d4bdc76`, 10 sítios check-then-write sob tranca)**, cujas enumerações
   saíram dos ângulos 4 e 3. **Resta 1**: a S-M17 🟡, que espera dados de banco
   real, não código — a **S-M10 fechou no E169** (`fe8afdd`) da trilha nova, que
   a absorveu por tocar as mesmas duas pontas. A tabela do `EXECUCAO.md` é a
   fila.

   O registro da sessão anterior — `2026-08-07-sessao-zerando-o-codigo.md` —
   continua valendo para tudo que não seja a fila: ele é quem conta como o
   backlog chegou a zero. (E `2026-08-06-sessao-faixa-b.md` continua sendo onde
   as regras 28–31 nasceram.)

   O registro traz também o que a execução ensinou e virou regra (28–31 do
   METODO), e a régua de varredura que continua valendo: **enumere com
   `git ls-files`, não com `find`/`grep -r`** — 65% do que o disco devolvia era
   cópia de worktree órfão, e desde `c98341e` as **16 varreduras** do
   repositório enumeram pelo versionamento, com piso de população.

   **A trilha em curso é a da ótica dos papéis; o resto é backlog de
   SOBRAS.** As tabelas de Sobras continuam sendo a fonte da verdade de cada
   rastreador. **Conte-as, não deduza** — a linha aberta é a que NÃO está
   riscada, e o fecho de 2026-08-07 achou sete fechadas sem risco justamente
   por contar:

   | Trilha | Rastreador | Estado |
   |---|---|---|
   | **Ótica dos papéis** | **`2026-08-11-otica-dos-papeis/`** | **EXECUTADA — 149 achados em 14 épicos (E158–E171), as quatro faixas fechadas, mais o **E172** que os manuais fizeram nascer, o **resto das sobras em E173–E188**, a **onda 1 (E189–E192)**, a **onda 2 (E193–E196)** e o **E197** (onda 3). O que resta dela são as sobras S-O da tabela do `EXECUCAO.md` — **27, e a única 🟡 entre elas nasceu no E197**; conte lá** |
   | Revisão max | `2026-08-10-revisao-max/` | fechada como fila — 18 sobras da rodada 1 (16 fechadas) + 53 da rodada 2 (10 épicos). **Resta 1 🟡**: a S-M17, que espera dados de banco real. A **S-M10 fechou no E169** (`fe8afdd`) |
   | Rodada 6 | `2026-07-25-rodada-6/` | fechada — **ZERO sobras abertas.** Era o backlog mais pesado do repositório |
   | Rodada 7 (design) | `2026-07-30-rodada-7-design/` | fechada — **ZERO sobras abertas** |
   | Arqueologia do legado (29 fotos do papel) | `2026-08-04-arqueologia-legado/` | fechada em 2026-08-05 — 10 épicos, 2 sobras abertas (2 🟡): S-A2, S-A27 |

   **Fora da trilha em curso são 3 sobras abertas, e NENHUMA delas é código:**
   a S-M17 espera um dump de instalação real, e as outras 2 esperam gente —
   S-A2 (as fotos que faltam do caderno) e S-A27 (classificar as peças com a
   dona; o acervo tem 132 peças do legado em `moscow_base`, todas sem "Tipo de
   peça"). Toda linha de código aberta hoje está na tabela de Sobras da trilha
   da ótica dos papéis — **conte lá, são 27** (2026-08-12, depois da onda 2).

   **O E197 (onda 3) fechou a S-O117, que era a única 🟡 aberta — e a que restou
   nasceu dele, pela mesma confusão do outro lado.** A sobra apontava a leitura;
   o fecho foram **sete portas**, porque enquanto a coluna guardar meia-noite UTC
   são quatro réguas que não se falam tendo de saber da convenção. O vermelho
   mais caro não estava na sobra: **a guarda de divergência RECUSAVA o contrato**
   (`expected 422 to be 201`), dizendo à vendedora que a data do contrato não
   batia com a da reserva quando as duas eram o mesmo dia. **352 linhas no banco,
   zero desancoradas** — sem migração, porque tudo que existe entrou pela tela, e
   **não se acha clicando o que só se alcança pela API**. A nova 🟡 é a
   **S-O119**: a mesma troca de instante por dia, agora nas RÉGUAS —
   `ajustes-prazo.test.ts` reprova entre 00:00 e 03:00 UTC, e o `global-setup` do
   E2E insere a data sem âncora. E uma lição de ferramenta que custou o conserto
   inteiro: **`cmd > arquivo && git checkout` são duas sentenças**, e a segunda
   roda mesmo quando a primeira falha por diretório inexistente — para guardar
   trabalho antes de mexer na árvore o instrumento é `git stash push
   --include-untracked`, que ou guarda tudo ou falha inteiro.

   **A onda 2 (E193–E196) fechou as três 🟡 que estavam abertas, e a única 🟡
   que restou nasceu dentro dela.** O que ela ensinou, e as três lições são de
   MEDIÇÃO:

   - **O E193** achou que a sobra pedia menos do que era: mover a data do
     casamento pela reserva move a peça e o contrato, **e não havia trilha
     nenhuma da data** — reserva sem contrato mudava de dia sem uma linha
     dizendo quem mudou. A prova continua onde estava (a decisão da prova órfã,
     pela mesma razão), e agora é DITA: `RESERVA_DATA_MOVIDA` conta quantas
     ficaram fora da janela, e o selo âmbar entra nas quatro telas do selo
     vermelho. Dele nasceu a **S-O117**, fechada no E197: `casamentoData` é
     data de NEGÓCIO e a disponibilidade a lê como INSTANTE —
     `2028-09-05T00:00:00Z` vira **2028-09-04** em fuso SP e as três janelas
     andam um dia. A tela ancora ao meio-dia antes de mandar; **a porta não
     obrigava** — e é o que o E197 mudou.
   - **O E194 foi acusado pela própria régua.** Ao tirar a conta do prazo do
     `GET /ajustes` para um helper — justamente para as TRÊS portas a entregarem
     —, a varredura do E192 passou a dizer que `Ajuste.pecaDoAcervo` **não é
     entregue por ninguém**, porque o motor lê o corpo do handler e não segue a
     chamada. A aresta foi de 1 para 3 e o retrato piorou. Isso tira a
     **S-O114** do plano hipotético: hoje ela esconde uma entrega real.
   - **O E196 achou o inverso do E184.** Lá o manual ENSINAVA a contornar
     defeito já consertado; aqui ele CALAVA uma capacidade que existe — o selo
     da prova órfã, do E173, **não estava em manual nenhum nove épicos depois**.
     Só o segundo é invisível para quem lê: não há como estranhar o que não está
     escrito. Manual é para ser **reescrito depois de cada onda**, não corrigido
     quando alguém tropeça.

   E uma nota de higiene que a sessão pagou para aprender: a **onda 2 foi
   aberta duas vezes**. A primeira disparou quatro agentes em worktree às 18h20,
   morreu com a sessão e deixou **quatro worktrees `locked` e dois bancos
   `moscow_wt_*` órfãos** — e nenhuma linha de código. Quem abrir a sessão
   seguinte confere `git worktree list` e `psql -l` antes de assumir que o que
   está no disco é trabalho.

   **A composição delas é o resultado da sessão, e vale mais que o número: de
   tudo que estava aberto quando o dia começou, sobrou UMA** — a **S-O50**, que
   espera decisão da dona (confecção com prazo próprio pede coluna nova, então
   pede migração). **As outras 20 nasceram hoje**, dos próprios épicos que
   fecharam as antigas: o resto das sobras foi executado em **E173–E188**, e a
   régua saiu de **API 1257 · frontend 611** para **API 1349 · frontend 683 ·
   E2E 171 · typecheck verde em 5 projetos**.

   **Três achados do dia não estavam em sobra nenhuma, e os três nasceram de
   MEDIR o que já se acreditava saber:**

   - O **E185** achou que o `POST /contratos` da noiva A prendia **o véu
     pendurado na reserva-mãe da noiva B** (201 Created), e a adoção do E111
     gravava o `lead_id` de A por cima: a guarda `RESERVA_DE_OUTRA_NOIVA` lia
     `bloqueio.lead_id` cru, **e o véu não tem um**. Mais duas portas liam o
     mesmo campo errado. População em `moscow_base` hoje: zero — o que estava
     aberto era o mecanismo.
   - O **E187** achou que, no desconto **percentual**, a tela exibia o próprio
     percentual: `expected 10 to be 500` — *R$ 10,00* onde o desconto era
     *R$ 500,00*. Eram **cinco grafias da mesma conta**, três acertando por
     cópia e duas errando.
   - O **E186** achou contra a própria régua: a dívida declarada de
     `comissao.ts` dizia *"as três não trancam o contrato"* sobre portas que o
     **E176 fechou dez épicos atrás** — a varredura media `trancou=[]` por não
     entrar no helper, e a tabela do teste repetia a frase antiga desde então.

   **E os manuais cobraram a conta que vinham dando de graça** (E184): eles
   viraram a fonte de achado mais barata do repositório, e envelhecem a cada
   épico que fecha. O da costureira ensinava uma **rotina de trabalho** para
   contornar um defeito fechado naquela manhã; quatro contavam uma limitação que
   a dona já removera; o do proprietário listava como pendente uma decisão **já
   tomada**. A `varredura-manuais` passava verde sobre os quatro, porque confere
   o MENU e não a prosa — nasceu a `varredura-manuais-prazos`, que prega os
   prazos citados contra as constantes do código (**9 células, 5 constantes**).

   Duas capacidades novas mudaram como se trabalha aqui, e as duas estão no
   `replit.md`: **um agente pode medir a suíte de API no seu próprio banco**
   (`createdb` + `push` + **seed**, que não é opcional), o que fez quatro épicos
   rodarem em paralelo de verdade; e **worktree isola arquivo e banco, não
   isola PORTA** — dois E2E na mesma máquina se atropelam, medido em
   `46 passed · 22 failed` com 33 artefatos dizendo `ERR_CONNECTION_REFUSED`.
   O E2E completo continua sendo o recurso que se mede EM SÉRIE, e no banco de
   dev: ele **não passa em banco virgem** (S-O73), por uma linha do
   `global-setup` que grava na coluna legada o que a ficha lê como atributo
   desde o E149.

   **O paralelo cobrou o oposto do anterior, e a lição é do integrador.** Na
   Faixa C os três agentes colidiram na NUMERAÇÃO de sobras. Desta vez as faixas
   foram reservadas antes de disparar e ninguém colidiu — apareceu o inverso: **o
   mesmo achado com três números**. O defeito do seed (S-O71) foi encontrado por
   três agentes que não se falaram, e a falha do E2E em banco virgem (S-O73)
   também. **Cada agente monta o próprio ambiente, e todo mundo tropeça no mesmo
   degrau** — então fundir duplicata é tão do integrador quanto reconciliar
   numeração era.

   **O E172 é o épico que não estava no plano, e é o de maior alcance depois do
   E162**: os manuais acharam quatro sobras que só se resolviam decidindo, a
   dona decidiu as três de perfil no dia 12, e o conserto **mudou o eixo de
   permissão do sistema** — `orcamentos` e `contratos` saíram de dentro de
   `leads`, que virou "a ficha da noiva", e nasceu o perfil **Costureira**.
   Duas lições, e as duas são de medição:

   - **Fechar uma porta sem medir a porta ao lado dela é meio conserto.** O
     plano mandava tirar o contrato de `leads`. Feito só isso, a Recepção — que
     ganhou `leads.editar` para corrigir um telefone — passava a **aprovar o
     orçamento**, medido em **404, não 403**. E aprovar congela a versão que o
     contrato confere: quem aprova decide o preço que ele cobra. O contrato e o
     aceite eram a mesma decisão vista em dois pontos, e só um estava na sobra.
   - **Duas réguas pegaram o que a minha leitura não pegou.** A
     `s36-gate-da-tela-unit` acusou `noivas/[leadId]/index.tsx — gateia por
     [agenda,leads] e escreve em [orcamentos]` (o botão "Novo orçamento", o
     S-O40 uma camada abaixo), e a `varredura-manuais` obrigou os manuais da
     recepção e da costureira a serem reescritos no mesmo commit. **A migração
     foi RODADA, não só escrita** — `UPDATE 20`/`UPDATE 4`/`UPDATE 1`, segunda
     passada toda zero —, e quem cobrou isso foi o E2E: `12-permissoes`
     reprovava porque o banco de dev tinha os perfis semeados antes dos módulos
     novos, e o seed é idempotente. **O E2E encenou o cliente que já instalou.**
   **O plano dos manuais está EXECUTADO** — as quatro entregas, os **cinco
   documentos** em `docs/manuais/` (`vendedora`, `costureira`, `noiva`,
   `recepcao`, `proprietario`), cada um publicado como página e com o endereço
   no plano. **Eles viraram a fonte de achado mais barata do repositório**, e as
   três primeiras entregas acharam nas três: a 1 (vendedora, `3f3ec02`) achou
   dois defeitos que duas rodadas de revisão não tinham achado; a 2 (costureira
   + noiva) achou a **S-O40 🟡 — a Recepção fecha contrato**; a 3 (recepção)
   achou a **S-O41 🟡 — a Recepção cadastra a noiva e não consegue corrigi-la**.
   As duas últimas são o mesmo `VER_E_CRIAR` visto pelas duas pontas: o perfil
   dá o que não devia e nega o que devia. O motivo é sempre o mesmo: as rodadas
   olham o sistema por dentro, e escrever o manual obriga a andar por onde a
   pessoa anda. A entrega 3 trouxe a régua junto — a
   **`varredura-manuais.test.ts`** (`f82efc9`) calcula o menu do zero (sidebar ×
   perfis semeados) e cobra a lista inteira que cada manual promete, de modo que
   item novo na sidebar reprova a documentação que o esqueceu. **A entrega 4 não
   achou defeito de sistema e achou dois erros MEUS** — o manual afirmava que a
   aba "Administração" era do proprietário (é do superadmin) e que o selo
   "Portal vencido" aparecia na Cobrança (aparece em Mensagens). Os dois vieram
   de deduzir em vez de ler, e é a mesma lição da regra 22 na direção da
   documentação. O manual do proprietário fecha com **"O que espera uma decisão
   sua"**: eram quatro pendências que não se resolvem escrevendo (S-O36, S-O37,
   S-O39, S-O40/S-O41), na língua de quem decide — **três viraram o E172 no dia
   seguinte, e só a S-O39 (o link de 7 dias contra a proposta de 30) continua
   esperando o Renato.** A tabela CRESCEU no fim da trilha, e é o que se espera de uma que
   termina em varredura: o E171 tornou contável o que ninguém contava. O parágrafo abaixo é o fim de 2026-08-07, e ele descreve
   como se chegou ao zero de que a revisão max partiu: nove fechos de código, a dívida do S-A17
   paga, a folha respondida (doze por decisão escrita) e as duas decisões que
   viraram código — S-D36 (`74c540f`) e S-A16 (`8179ae5`) — implementadas no
   mesmo dia — e **o plano das cinco fases está EXECUTADO de
   ponta a ponta**: fase 0 e 1 no dia 06 (`49c5cdb`), fase 2 em seis épicos
   seriais (`60adc7c` → `f72628c`), fase 3 em quatro agentes de faixa B
   aplicados em série (B3 `cbe79f6`, B4 `cc9720f`, B1 `c98341e`, B2
   `f4cb527`), fase 4 nos sete épicos (S32 `f901275`, S33 `24e9054`, S35
   `cafe56c`, S10+S-A17 `8b9c574`, S30+S21 `d8ef73f`). Naquele dia não havia
   NENHUMA linha de código aberta em rastreador nenhum — a primeira vez desde a
   rodada 6, e o estado durou três dias. **A folha**
   (`docs/propostas/2026-08-06-folha-de-perguntas.md`) guarda as
   treze respostas com a data — o que era conversa virou decisão registrada.

   A frase abaixo é a da conferência, e continua valendo pelo mesmo motivo: a
   **conferência de 2026-08-05** (`docs/revisao/2026-08-05-conferencia-de-sobras.md`)
   passou sete agentes de leitura pura sobre 48 linhas e achou três defeitos que
   quatro rodadas de revisão não tinham achado — os três na fronteira entre dois
   arquivos, que é o que a regra 22 diz não se pegar lendo nenhum dos dois. **As
   três fecharam no mesmo dia:** S37 (`85d5108`), S-D29 (`042d1b5`) e S-A25
   (`2912526`). Antes da conferência a tabela também dizia zero 🟠 — a diferença
   é que agora é verdade.

   **Tudo isso está no `main`, e o `main` está PUBLICADO.** Em 2026-08-11 o
   `origin/main` foi de `8b4dd28` para a ponta da rodada 2 — **23 commits**
   (a segunda varredura, a consolidação e os 10 épicos executados),
   fast-forward puro, com autorização da dona no mesmo dia. Antes disso,
   2026-08-10 publicou os 31 da revisão max. O costume vem de 2026-08-07,
   quando o remoto destravou de 322 commits e o custo de deixá-lo para trás
   ficou medido: **todo worktree de agente nasce em `origin/main`**, e cada
   agente atrasado gastava o primeiro gesto se reposicionando (regra 29).
   Confira com `git rev-list --count origin/main..main` antes de assumir que
   ainda está em dia — esta linha envelhece a cada commit, e já envelheceu
   cinco vezes.

   Hoje a régua é **API 1726 (242 arquivos) · frontend 974 (104 arquivos) ·
   E2E 177 · typecheck verde** — as quatro medidas em série na madrugada de
   2026-08-15, no fecho da integração dos blocos 5–8 (a API rodou INTEIRA
   cinco vezes na sessão: 1697 no E223, 1700 no E219, 1707 na S-C234, 1726 na
   integração — mais as quatro dos agentes em bancos próprios; o E2E, duas:
   177 no lote E223+E219 e 177 no fecho). O parágrafo abaixo, dos números de
   14/08, fica como a prova viva de sempre: **E este parágrafo é a prova
   viva do que ele manda fazer: os QUATRO agentes do lote da manhã acharam,
   cada um por conta própria, que ele estava três épicos atrás** — ele dizia
   *1616 (221) · 879 (96)* e a base `c2b8a274` já media *1624 (223) · 887
   (97)*, antes de qualquer um deles tocar em nada. Quatro medições
   independentes do mesmo número errado é o formato da duplicata que cabe ao
   integrador fundir. **Meça antes de citar** — a régua do `heliumdb` mede
   **~11,6 min** de API e **~7 min** de E2E.
   **O E2E é a régua obrigatória e a única que agente nenhum pode rodar**: todo
   relatório de worktree abre dizendo *"E2E obrigatório e NÃO rodado"*, porque
   worktree isola arquivo e banco e **não isola PORTA** — rodá-lo é trabalho do
   integrador, e ele leva **6,6 min**; as duas suítes juntas deadlocam no banco
   compartilhado. Ele já foi a régua que pagou um épico inteiro: no **E215** as
   outras três ficaram verdes e ele derrubou **11 specs de uma vez**, todas com a
   mesma recusa nomeando doze campos — noiva montada com `{ noivaNome, origem }`
   num spec que fecha contrato. Nenhuma das outras enxergava isso, porque as
   fixtures de API não passam pela porta. E **o
   frontend pode não estar verde**, pela S-O119 — o helper `emDiasISO` fabrica a data
   como instante e o código a lê como dia, então o arquivo `ajustes-prazo`
   reprova entre 00:00 e 03:00 UTC e passa nas outras 21 horas. **Régua que
   depende da hora em que roda não é régua**; quem medir de madrugada e vir
   vermelho, confira a hora antes de procurar o defeito. O typecheck passou a incluir os 68 arquivos de `e2e/` (S-D23,
   `acdd9b3`) **e o `scripts/`** (`60adc7c`), que nenhum `tsconfig` cobria. O
   `scripts/tsconfig.json` ganhou `lib: DOM` em 2026-08-12, com o custo
   declarado no próprio arquivo: o corpo de `page.evaluate` roda no NAVEGADOR, e
   sem isso o `document` de dentro dele não compila — em troca, o pacote inteiro
   passa a enxergar `document` como se existisse em Node. Há
   uma **quarta régua fora das suítes**: `scripts/banco-virgem.ts` (S-D43), que
   exercita o caminho da primeira execução — banco descartável, seed,
   `global-setup` — e é a única que enxerga defeito de instalação nova. **Rode-a
   antes de mexer em seed, schema ou `global-setup`**; leva ~40 s.

Se a trilha mudar, é aqui que o ponteiro muda. **Foi a S-A5 da arqueologia que
mandou este ponteiro estar certo** — ele passou uma rodada inteira apontando
para a anterior, e quem abrisse a sessão leria o estado errado como se fosse o
de hoje.

## As regras que mais mordem no dia a dia

Estão todas no METODO, com a prova. Estas quatro são as que se esquece:

- **Nada é dado por feito sem commit.** Se o rastreador diz ✅ e não há hash, o
  trabalho não sobreviveu — refaça.
- **Um épico por commit**, escopo fechado. O que aparecer fora do escopo vira
  **sobra**, não conserto.
- **Sobra vista de passagem entra na tabela de Sobras do rastreador no mesmo
  commit** (regra 12). A nota do épico é onde o raciocínio mora; o rastreador é
  onde o trabalho é reclamado. Achado que fica só na nota de um épico fechado
  não vira trabalho — foi assim que um 🔴 quase se perdeu.
- **Mudou o que a trilha grava, ou o formato do que alguma tela lê, roda o E2E
  completo antes do commit** (regra 11). Verde em unidade + API + typecheck é o
  piso, não a régua.

E a que sustenta todas: **nenhum achado sem `arquivo:linha` que você leu, e
nenhum achado de dinheiro sem exemplo numérico.** Sem âncora, é impressão.

## Onde cada coisa é anotada

O ID do épico (`E94`) é a chave que costura tudo — ele aparece igual em todas as
camadas, e é assim que se navega de uma para a outra.

| Camada | Onde | O que responde |
|---|---|---|
| Método | `docs/revisao/METODO.md` | Como olhamos, e onde a lente falhou |
| Diagnóstico | `docs/revisao/<data>-rodada-N/A–F` | O que está errado, com âncora e número |
| Consolidação | `.../G-consolidado.md` | O que é o MESMO problema; onde foi parar cada achado |
| Plano | `docs/propostas/<data>-rodada-N-*.md` | O que fazer, em que ordem, com que cuidado |
| Execução | `.../EXECUCAO.md` + `.../execucao/E9X.md` | O que foi feito, e o que o plano errou |
| Migração | `docs/migracoes/<data>-e9X-*.sql` | O DDL que um banco existente precisa |
| Capacidade | `replit.md` | O que passou a ser verdade do sistema |

**Descoberta sobre como RODAR ou OBSERVAR o sistema vai para o `replit.md`**
(regra 8), não para o relatório da trilha. Relatório é achado; `replit.md` é
capacidade.

## O formato do relatório de execução (`execucao/E9X.md`)

O que a rodada 6 convergiu, do E91 ao E94:

```
# E9X — <a tese do épico, em frase>
**Rodada N, sessão M** · branch `...` · base `<hash>` (épico anterior)
Fecha: <achados com severidade>
Suíte: API 616 → 625 · frontend 208 → 213 · E2E 131 · typecheck verde

## <as correções ao diagnóstico, ANTES do código>   ← abre o arquivo
## <uma seção por achado, não por arquivo>
## Verificação          ← cada conserto citado VERMELHO ANTES, literal
## Visto de passagem    ← e cada item também vai para a tabela de Sobras
```

Duas coisas fazem esse arquivo valer mais que o diff, e as duas são
contraintuitivas: **o que o plano errou** e **o que você errou**. O E94 registra
um assert que o executor escreveu errado enquanto o código estava certo — é a
página mais útil do arquivo.

## Commits

Um épico, um commit de código, e em seguida um
`docs(rodada-N): registra o hash do E9X no rastreador`.

O assunto é a **tese** do épico, não um rótulo:
`fix(financeiro): E94 — todo movimento de dinheiro deixa rastro, e a régua é uma só`.

O corpo tem um parágrafo por achado fechado, dizendo o defeito, o conserto e o
número medido — e termina na contagem das três suítes.

## Voz

A documentação deste repo é escrita em **português, em frases afirmativas, com
o número medido junto**. Não "pode divergir": *1,77% dos planos divergem — R$
1.282,00 em 10x sai como 128,19 ×9 + 128,29*. Não "melhorou a performance": *a
tela pedia 3.400 linhas para desenhar 20*. Mantenha o tom — ele é o que faz
esses arquivos serem lidos depois.
