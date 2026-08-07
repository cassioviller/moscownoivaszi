# Arqueologia do legado — rastreador

**Aberta em 2026-08-04** · branch `rodada-7-sobras`

Esta é a trilha que a rodada 7 adiou: *"traçador e arqueologia ficaram para
rodada futura"* (`METODO.md`, histórico de 2026-07-30). A matéria-prima não é
o código — são **29 fotos do sistema em papel do ateliê**, tiradas em
2026-07-24, cobrindo 22/06 a 25/10 de 2026 e **136 saídas de peça**.

A lente é uma só: **o que o ateliê faz todo dia e o sistema não deixa fazer.**

## Como retomar

1. Leia `INVENTARIO.md` — o mapa foto → semana, o código de cores do ateliê e
   os **limites da evidência** (é caligrafia; o caderno registra semana, não
   data de casamento; um único número monetário em 29 fotos).
2. Leia `A-o-sistema-em-papel.md` — os 6 achados, o que está BEM, e a seção
   "o que a verificação derrubou do meu próprio diagnóstico".
3. Leia `adversarial.md` — as 6 defesas escritas e conferidas (regra 7).
4. Leia `B-releitura-dos-sete-pontos.md` — a segunda passada pelas fotos, uma
   leitura por PERGUNTA em vez de uma por arquivo. **Ela corrige quatro
   números da trilha A**; onde os dois divergirem, vale a B.
5. Leia a **spec**, `../../propostas/2026-08-04-acervo-a-identidade-da-peca.md`
   — ela é o que manda sobre ordem, numeração e escopo dos épicos, e reordenou
   o que este rastreador propunha (o acervo ainda não entrou no sistema; a
   forma do cadastro custa mais caro que a régua de ocupação).
6. **As nove perguntas de produto estão respondidas** (P1–P9, tabela abaixo).
   Não há bloqueio nenhum, e a spec está na 4ª versão, com uma correção
   registrada na seção do E152 (S-A19).
7. Leia **"Onde paramos"**, logo abaixo — é o estado da mesa no fim da última
   sessão, com o que sobrou para fazer.

## Onde paramos — fim da sessão 5 (2026-08-05)

**Os dez épicos estão fechados, e a trilha não tem épico aberto.** O que sobrou
está na tabela de Sobras, e é lá que a próxima sessão pega trabalho.

| | |
|---|---|
| Último commit de código | `3c0b5df` (S-A8 · S-A23) |
| Último commit de docs | este |
| Branch | `rodada-7-sobras`, **não fundida no main** |
| Suítes no fim | API **997** · frontend **451** · E2E **156** · typecheck verde — **zero vermelho, zero skipped nas três** |

**Pela primeira vez a suíte inteira sai verde**, e `pnpm run test:e2e` volta a
sair com `EXIT=0`. Os dois vermelhos que viveram do E148 ao E156 eram defeito de
FIXTURE sobre código certo, e fecharam hoje (S-A11 e S-A21) — viraram as regras
18 e 19 do método. **Isso muda como se lê um vermelho daqui para a frente: agora
ele é notícia de novo.**

E **não resta nenhuma 🟠 na trilha**. As dez sobras fechadas hoje incluem as
quatro que corroíam alguma régua do método (as duas suítes vermelhas, o `push`
travado e a afirmação errada na spec).

### O que fazer primeiro na próxima sessão

Não há épico pendente nem sobra 🟠. O que resta é escolha, não dívida:

1. **S-A3 🟡** — a segunda linha de negócio (festa/madrinha/dama, **38
   compromissos em 15 páginas**, e em setembro elas superam as provas de noiva)
   nunca foi olhada como JORNADA: prazo, preço e prova podem não ser os mesmos.
   É a maior sobra ainda não medida, e a única que pode virar trilha inteira.
2. **S-A2 🟡** — pedir à dona as fotos que faltam (o verso de 21–27/09 e as
   semanas de 28/09 a 11/10) antes que as 136 saídas virem número de negócio.
   Depende de outra pessoa, então quanto antes for pedida, melhor.
3. **S-A24 🟡** — *"domingo com hora marcada"* é uma distinção que o modelo não
   sabe dizer, e a P8 a expôs. Pergunta de produto antes de ser código.
4. **As de higiene** (S-A12, S-A13, S-A9, S-A7 🔵) valem um commit só de faxina,
   e a S-A13 é a que mais atrapalha: 223 atributos no banco de dev, com quatro
   deles chamados "Cor", "Cor A", "Cor B" e "Tamanho".

### O estado do banco de dev

Em dia. As migrações do E156, da S-A20 e da S-A8 **já foram aplicadas**, e a
baseline do drizzle está no `0008_tidy_red_skull.sql`. Um banco que já existe
precisa dos **oito** scripts de `docs/migracoes/2026-08-04-*.sql` mais os
**dois** de `2026-08-05-*.sql`.

**E o `push` voltou a funcionar** (S-A20): ele diz "Changes applied" sem prompt.
O `psql` continua sendo o caminho de quem já tem banco — é o que os scripts de
`docs/migracoes/` existem para fazer —, mas deixou de ser a única saída.

### Fora do git, de propósito

Há um `imagens … .zip` na raiz do repositório, não rastreado — é o pacote
original das fotos, e as 29 já estão versionadas em `fotos/` (S-A1). **Não
commitei**: decidir se o zip entra, vira repo de evidências ou some é da dona do
repositório, não de quem passou por aqui.

## As duas mídias — o achado que organiza o resto

| | Agenda (15 fotos) | Caderno verde (14 fotos) |
|---|---|---|
| Unidade | o dia, com hora | **a semana** |
| Entidade | a pessoa que vem à loja | **a peça que sai** |
| Registra | prova, retirada, recado, férias | a locação |
| Cobertura | 29/06 – 25/10 | 22/06 – 27/09 |

Até **17/08**, toda segunda-feira alguém copiava a lista do caderno para a
agenda, em rosa, e a cópia perdia linhas. A partir de **24/08** a rotina foi
abandonada: as cinco semanas seguintes somam **79 saídas no caderno e zero
linhas na agenda** (A6, reinterpretado em B3). **A saída da peça não gera
compromisso** — quem só olha a agenda não vê o negócio acontecer.

## Estado das fases

| Fase | Arquivo | Estado | Commit |
|---|---|---|---|
| Inventário das fotos | `INVENTARIO.md` | ✅ | `25f1a17` |
| Trilha A — o sistema em papel | `A-o-sistema-em-papel.md` | ✅ | `25f1a17` |
| Adversarial — refutar o 🔴 e os 🟠 | `adversarial.md` | ✅ | `25f1a17` |
| Trilha B — releitura dos 7 pontos | `B-releitura-dos-sete-pontos.md` | ✅ | `b909f18` |
| Spec de execução | `../../propostas/2026-08-04-acervo-a-identidade-da-peca.md` | ✅ | `e396574` · 2ª `a59fdf7` · 3ª `f47d533`|

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado

## Os achados

| # | Tese | Peso | Veredito adversarial |
|---|---|---|---|
| A1 | A **lavagem de 7 dias** é a única fonte da colisão: os dois usos não se tocam. O ateliê realugou uma peça em 7 dias | 🔴 → **🟠** | CONFIRMADO com **1 exemplo, não 3** (ver abaixo), e uma ameaça em aberto (`"15 dias"`) |
| A2 | O conjunto só é protegido se cada peça for cadastrada e reservada; nada exige isso | 🟠 | CONFIRMADO com escopo corrigido |
| A3 | O filtro de cor compara string exata e o cadastro é campo de texto livre | 🟠 | CONFIRMADO |
| A4 | Não há preço de realuguel, embora a contagem de locações já exista | 🟡 | **FECHADO no E157** — P5 respondeu que o `7.600` é valor |
| A5 | Ausência de vendedora não existe no modelo, e é o 1º dado que a agenda registra | 🟡 | — |
| A6 | Os dois cadernos guardam o mesmo dado e já divergem — decide a importação | 🟡 | reinterpretado em B3 |
| B1 | Configurações mostra "2 min" para uma prova de 60 min — o valor está em slots de 30 | 🟠 | — |
| B2 | O código fecha domingo por premissa escrita; o ateliê atendeu 5 domingos | 🟠 | **FECHADO na S-A8** — P8 respondeu *"domingo com hora marcada"*, e o default abre os sete dias |
| B3 | A cópia agenda↔caderno foi abandonada em 24/08, não falhada: 79 saídas sem nenhuma linha | 🟡 | — |
| B4 | 6 provas às 18:30 não cabem no expediente padrão (última possível: 18:00) | 🟡 | **FECHADO na S-A8** — P8 respondeu *"até as 20h"*, e o fechamento padrão passou de 19 para 20 |

**Correções que a trilha B fez na trilha A** (regra 9): o número de páginas
com aviso de férias estava errado por fator 4 (8 → 2 na agenda, 7 no caderno);
os compromissos de cor estavam pela metade (20 → 38) e as cores (12 → 15); a
divergência alegada no item 9 de 17–23/08 foi **retirada** por ilegibilidade;
e *Arnalda* × *Arnica*, que eu tratara como grafia do mesmo modelo, são peças
diferentes — fundi-las juntaria dois itens de acervo na importação.

## Épicos — a spec manda

A numeração e a ordem vivem em
**`docs/propostas/2026-08-04-acervo-a-identidade-da-peca.md`**, e ela
**reordenou** o que este rastreador propunha primeiro. A razão está na abertura
da spec: o `replit.md` diz que o seed do E147 *"não cadastra noiva, vestido,
contrato nem parcela"* e que o único primeiro passo pendente é *"cadastrar os
primeiros vestidos"* — **o acervo ainda não entrou**. Logo:

| | Custo se estiver errado |
|---|---|
| forma do CADASTRO (A2, A3, identidade da peça) | recadastrar o acervo à mão |
| régua de OCUPAÇÃO (A1) | um `UPDATE` de uma linha |

O 🔴 é o segundo. A ordem passou a ser esta:

| Épico | Fecha | Estado | Commit · relatório |
|---|---|---|---|
| **E148** — a régua que a tela mostra é a que o sistema usa | B1 | ✅ | `8633011` · `execucao/E148.md` |
| **E149** — cor e categoria saem do texto livre e viram catálogo | A3 | ✅ | `bf1162e` · `execucao/E149.md` |
| **E150** — acessório **tipo 1** (peça única): entra no acervo, e o contrato exige reserva | A2 | ✅ | `a8174ba` + emenda `f8bdbb5` · `execucao/E150.md` |
| **E154** — acessório **tipo 2** (estoque): é contado, não reservado — avisa, não bloqueia | A2 | ✅ | `1fb39de` · `execucao/E154.md` |
| **E155** — acessório **tipo 3** (sob medida): entra na fila da costureira, que já existe | S-A4 · S-A6 | ✅ | `b7078ad` · `execucao/E155.md` |
| **E151** — a ausência da vendedora existe e a agenda a respeita | A5 | ✅ | `90536a0` · `execucao/E151.md` |
| **E152** — a lavagem ganha **data real** (`lavagem_concluida_em`) | A1 | ✅ | `a8d094a` · `execucao/E152.md` |
| ~~**E153**~~ — ~~modelo × peça~~ | — | **CANCELADO por P2** | — |
| **E156** — a confecção vira peça do acervo | P4 | ✅ | `9dfa940` · `execucao/E156.md` |
| **E157** — a peça conta as locações, e o preço acompanha | A4 · P5 | ✅ | `f697136` · `execucao/E157.md` |

**Os dez épicos estão fechados** — os oito do bloco, mais os dois que P4 e P5
abriram depois (E156 e E157), descritos na 4ª versão da spec. **A trilha não tem
épico aberto; o que sobrou está na tabela de Sobras.** A ordem é sequencial —
banco de dev e suíte E2E são compartilhados, E149 é dependência dura de E150 e
E154, e o método pede um commit por épico com a suíte lida inteira entre eles
(regras 10, 11, 14, 16).

**Os três acessórios** (2ª versão da spec): o que os distingue não é o que são,
é **como se decide se estão disponíveis** — o tipo 1 **por peça** (existe uma),
o tipo 2 **por contagem** (existem dez), o tipo 3 **por prazo** (não existe
ainda). Três naturezas, três mecanismos; forçar as três no acervo encheria de
anágua a lista que a vendedora abre com a noiva na cabine.

**As perguntas RESPONDIDAS pela dona** — P1–P3 em 2026-08-04, antes do bloco;
P4 e P5 no mesmo dia, depois de ele fechar; **P6 e P7 em 2026-08-05**, ao
executar a S-A19. As duas últimas são as únicas que fecharam uma sobra em vez
de abrir um épico:

| | Resposta | Consequência |
|---|---|---|
| **P1** | *"uma semana, lavagem externa"* | A régua está **certa**. O A1 se inverte: a colisão é o sistema funcionando. O **E152 troca de escopo** — a lavagem é a única etapa do ciclo **sem data real**, e ganha uma |
| **P2** | *"dois vestidos"* | **E153 CANCELADO.** Era o único irreversível, o único com prazo e o mais caro. O cadastro do acervo deixa de esperar |
| **P3** | *"não sei"* | Deixou de importar — P2 respondeu o que ela existia para descobrir |
| **P4** | *"vira"* | A peça confeccionada **vira item do acervo** depois do casamento: existe a transição produção → acervo que o E155 registrou sem modelar. **Entra o E156** |
| **P5** | *"é valor"* | O `7.600` é dinheiro, não código. **Destrava o A4** e entra o **E157** — a contagem de locações já existe e é da vida inteira (`routes/vestidos.ts:274-277`); falta a régua de preço |
| **P6** | *"nada muda — segue recusado"* | O realuguel em 7 dias **continua sem caminho no sistema**, e o ateliê o trata como exceção fora dele. **A S-A19 fecha como decisão, não como pendência** — e o papel sustenta a escolha: o caso aparece **uma vez em 14 semanas** |
| **P7** | *"toda reserva tem ao menos um dia de prova"* | Nem no realuguel se dispensa a prova: a peça é conferida antes de sair. **Vira invariante de negócio** — e a apuração mostrou que o código o quebra numa quina de configuração (**S-A23**) |
| **P8** | *"atende até as 20h"* · *"domingo com hora marcada"* | O expediente padrão passa a ser o **deste ateliê**: sete dias abertos, fechamento às 20h. Fecha a **S-A8**. Domingo nasce ABERTO porque o sistema não sabe dizer "só sob demanda" — ele abre ou recusa o dia |
| **P9** | *"tudo pode ser configurado em configurações"* | A configuração **não se recusa**, nem a que apaga a janela de prova. Com a P7 ao lado, sobra a única leitura que honra as duas: **aceita e mostra**. Fecha a **S-A23** pela metade que faltava — o defeito era o silêncio, não a permissão |

A4 (preço de realuguel) **deixou de ser impressão**: P5 respondeu que o `7.600`
é valor, e a releitura da trilha B já apontava para lá (ponto de milhar; nenhum
dos 8 códigos observados usa ponto). Virou o **E157**.

**B2 e B4 (expediente: domingo e 18:30) saíram dos épicos** e viraram S-A8: são
defaults configuráveis, e ninguém perguntou qual é o expediente real do ateliê.

### Correção à força do A1, feita ao escrever a spec

O diagnóstico citou **três** pares de semanas consecutivas. Indo atrás de quem
é a noiva em cada um, **só um sobrevive**:

| Par | Semana N | Semana N+1 | Vale? |
|---|---|---|---|
| **Adelita** | Larissa · *"Novo que chegou / 1º Aluguel"* | Mª Fernanda · *"Realuguel"* | **sim** |
| Konte | **Larissa** | **Larissa** | não — mesma noiva, registro movido |
| Shellyane | Isabela | Letícia · *"Shellyane **P**"* | não — o `P` pode ser outra peça |

E há uma anotação que ameaça o achado inteiro, sem resolução possível pela
foto: `CHLOE → se sabe que tá 15 dias` (21–27/09, item 10). Se a locação dura
15 dias, peça nenhuma sai em semanas consecutivas — mas o mesmo caderno usa
"15 dias" para ausência de funcionária (*"Volta da Marilza 15 dias"*), e há um
"ISA" (nome de vendedora) rabiscado ao lado. **P1 resolve.**

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

**24 sobras: 10 fechadas, 1 retirada.** **Não resta nenhuma 🟠** — as treze que
seguem abertas são 🟡 e 🔵: higiene, decisão de produto ainda não feita, ou
dependência de outra pessoa.

Duas notas que valem mais que a contagem:

- **A S-A22 é a única sobra RETIRADA da trilha**, e fica na tabela em vez de
  sumir: ela foi registrada com uma afirmação que a apuração desmentiu, e uma
  sobra que some não ensina isso a ninguém.
- **A S-A4 e a S-A6 estavam fechadas desde o E155 e a tabela não sabia** — a
  linha do épico dizia "Fecha: S-A4 · S-A6" e as duas ficaram abertas aqui por
  cinco commits. É a regra 12 pelo avesso: ela manda a sobra ENTRAR no
  rastreador, e ninguém tinha escrito que ela também precisa SAIR dele.

**Nenhuma suíte sai mais vermelha.** A S-A11 e a S-A21 fecharam na sessão 5, e
as duas eram a mesma doença: teste reprovando por defeito da FIXTURE, sobre
código certo. Viraram as regras 18 e 19 do método.

| # | O quê | Peso | Origem |
|---|---|---|---|
| ~~S-A1~~ | ~~**As 29 fotos entraram no git (3,8 MB).** Decisão contrária à da rodada 7, que deixou as 81 capturas fora (`.gitignore`) — e deliberada: aquelas eram **regeneráveis por script** (S-D1), estas são evidência primária de um sistema em papel que não se recaptura. Se o peso incomodar, o caminho é um repo de evidências, não apagar.~~ **FECHADA POR DECISÃO em 2026-08-06: a decisão já estava tomada quando a linha nasceu, e a linha registrava o RACIOCÍNIO, não uma pendência.** O critério que separa as duas rodadas continua valendo e é o que fica: **evidência regenerável fica fora do git; evidência primária entra.** As 3,8 MB são 0,3% de um repositório que carregou 1,04 GB de worktree órfão até a S38 — o peso nunca foi o assunto. A saída "repo de evidências" existe se o volume crescer, e é decisão da dona do repositório no dia em que crescer, não trabalho de hoje. | 🔵 | montagem da trilha |
| S-A2 | **Falta o verso da última página do caderno.** A semana de 21–27/09 termina com "ATRÁS →" e o verso não foi fotografado; as semanas de 28/09 a 11/10 também faltam. As 136 saídas contadas são piso, não total. Pedir as fotos que faltam antes de qualquer contagem virar número de negócio. | 🟡 | trilha A |
| S-A3 | **O ateliê tem uma segunda linha de negócio que o diagnóstico só tangenciou:** festa/madrinha/dama, indexada por COR e com código de 4 dígitos, contra noiva indexada por nome de modelo. São **38** compromissos em laranja nas 15 páginas de agenda (contagem da trilha B; a trilha A dizia ~20), e em setembro eles superam as provas de noiva. O A3 trata do filtro; ninguém olhou ainda se o fluxo comercial dessa linha (prazo, preço, prova) é o mesmo. **CONFERIDA, e o mecanismo se deslocou: o vocabulário NASCEU e o acervo não foi classificado.** O épico A3 fechou (`bf1162e`/E149) e a cor virou atributo filtrado por id. O `"Tipo de peça"` existe como seed de loja nova (`configuracao-inicial.ts:206-207`, seis opções: Noiva, Festa, Dama, Madrinha, Debutante, Acessório). Medido: **496 vestidos no acervo, 0 classificados por "Tipo de peça"**, e 0 fichas de noiva apontando o atributo — o ganho do E149 tem uso real zero. O schema segue com `categoria` texto livre (`vestidos.ts:80`), e `leads`/`contratos` não têm campo de linha de negócio. **A parte que a sobra pede continua não olhada:** a JORNADA (prazo, preço, prova) da linha festa/madrinha. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) | 🟡 | trilha A · recontada em B |
| ~~S-A4~~ | **FECHADA no E155** (`b7078ad`), e a tabela não sabia até a sessão 5 — a linha do épico dizia "Fecha: S-A4 · S-A6" e esta ficou aberta cinco commits depois do conserto. **A confecção sob medida aparece 3 vezes e não tem lugar no modelo:** *"Siam + Manga **será confeccionada**"* (10–16/08), *"conversar sobre confecção de manga"* (21/07 e 24/07, dois compromissos de 10:30 dedicados ao assunto). Não é ajuste de peça existente (`ajustesTable`) — é peça nova feita para a noiva. Sem âncora de código porque não há código: é ausência. | 🟡 | trilha A |
| ~~S-A6~~ | **FECHADA no E155** (`b7078ad`), pelo mesmo épico e com o mesmo atraso de registro. **A confecção sob medida ganhou uma segunda evidência na trilha B:** o caderno de 13–19/07 numera *"Manga renda c/ saia lisa"* como item **5** da semana, com a nota *"(Mesma noiva Dayfini)"* — a peça componente tem número de ordem próprio no acervo, igual a um vestido. Reforça a S-A4 e o A2. | 🟡 | trilha B |
| ~~S-A7~~ | ~~**O `provaDuracao` tem unidade implícita e não documentada**~~ (slots de 30 min). O B1 conserta a tela; a raiz é o nome do campo não dizer a unidade — `provaDuracaoSlots` ou guardar minutos resolveria a classe. `e115-portal-agenda-api.test.ts:92` usa `provaDuracao: 3` (= 90 min) e `revisao-reguas-unit.test.ts:64` idem, então os testes já convivem com a ambiguidade. **CONFERIDA: viva pela metade, e o buraco real é OUTRO.** "Não documentada" morreu — `configuracao-inicial.ts:144-145` diz "`provaDuracao` está em SLOTS de 30 min (2 = 60 min)" desde `3c0b5df` (e o crédito é da S-A8, não do B1). O campo é de `regra_disponibilidade`, não de `lojas` (`loja.ts:30`). **O que ninguém viu: o `30` tem DUAS fontes** — `agenda.ts:99` (`* 30 * 60_000`, literal cravado na janela de conflito) e `agenda-core/src/slots.ts:17` (`SLOT_MINUTOS = 30`, que rege a grade e o `recusaDeMover`). Mudar uma corrige a grade e **não** corrige a busca de conflito: as duas divergiriam em silêncio. E o zod não guarda: `api.ts:3959` é `zod.number().optional()`, sem `.int()` e sem `.min(1)` — só os `Math.max(1, …)` de leitura impedem o estrago de um `provaDuracao: 0`. Medido: 1 linha em `regra_disponibilidade`, `prova_duracao = 2`, nunca editada; 8 arquivos consomem o campo. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) **FECHADA em `cc9720f`** (agente B4), no buraco que a conferência apontou: `agenda.ts:99` passou a importar `SLOT_MINUTOS` do agenda-core — o 30 tem UMA fonte —, e `provaDuracao` ganhou `minimum: 1` no spec (o zod gerado recusava nada; agora recusa 0 e −1, pregado em teste). A régua de tela da unidade (slots ↔ minutos) veio junto no B2. | 🔵 | trilha B |
| ~~S-A8~~ | **FECHADA em `3c0b5df`, e a varredura que ela pedia rendeu mais que o achado.** Perguntamos: a dona atende **até as 20h** e **domingo com hora marcada** (P8), e os dois defaults passaram a ser os dela — sete dias, fechamento 20h. A premissa *"como todo ateliê de noiva"* saiu do comentário e deu lugar à contagem que a refuta. **O que a varredura achou além:** a mesma régua estava escrita em **três lugares** — o default do schema, o `HORARIO_PADRAO` do seed e um fallback na tela de Cabines & horário —, e o comentário do seed afirmava ser "os defaults do schema escritos por extenso" sem nada que o obrigasse; agora há teste comparando os dois **campo a campo**. O script de migração mexe só no DEFAULT da coluna: o horário de uma loja que já existe é dela. O diagnóstico original: | ✅ | trilha B |
| ~~S-A8 (diagnóstico)~~ | **A régua de dias é do sistema, mas o expediente real do ateliê nunca foi perguntado.** B2 e B4 mostram domingo aberto e 18:30 usado; `configuracao-inicial.ts:125` afirma "como todo ateliê de noiva" sobre o mundo. Vale uma passada em TODA premissa categórica escrita em comentário do `configuracao-inicial.ts` antes de a próxima loja nascer com ela. | 🟡 | trilha B |
| S-A14 | **`contrato_itens.vestidoId` e `orcamento_itens.vestidoId` são `set null`** (`contratos.ts:75`, `orcamentos.ts:54`). Apagar um vestido do acervo transforma um item com peça num item de descrição livre — e a guarda do E150 deixa de valer para aquele contrato numa reedição futura. Não é regressão (o snapshot preserva a descrição), mas a régua nova depende de um vínculo que o schema deixa evaporar. Vale decidir se peça vendida pode ser apagada do acervo. **CONFERIDA: o `set null` confere nas duas FKs (`confdeltype = n` no banco), a faxina de hoje NÃO disparou nada — e a omissão da sobra é o que agrava.** A limpeza da S-A13 tinha guarda explícita contra isso (`AND NOT EXISTS … contrato_itens`), e `contrato_itens` tem **0 linhas** no banco; das 297 linhas de `orcamento_itens`, 98 têm vestido e a guarda protegeu todas. **Mas a rota que a loja usa todo dia não tem guarda nenhuma:** `vestidos.ts:510-514` são cinco linhas que apagam direto — não conta contrato, não conta orçamento, não conta bloqueio, não oferece 409, não faz soft-delete. **A migração de faxina foi mais cuidadosa com o acervo do que o código.** Virou a S-A25. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) | 🟡 | execução E150 |
| ~~S-A12~~ | ~~**O output do `seed.ts` mostra o TOTAL da loja ao lado de um `+` que significa "criei algo nesta execução"** (`scripts/seed.ts:44-53`). Numa loja com 122 cabines de lixo de teste, criar 3 imprime `+ Cabines 122` — quem lê entende que o seed criou 122. Separar as duas contagens (`122 (+3)`) resolve.~~ **FECHADA em `60adc7c`, exatamente no formato que ela propôs.** O `+` na frente saiu; a linha virou `Cabines 3 (+3)`, e o cabeçalho passou a dizer "o total, e entre parênteses o que esta execução criou". Quem a pegou foi a régua nova do banco virgem (S-D43), que afirma o par contra o `count(*)` da tabela — a sobra vivia num output que só se lê em instalação nova. Marca booleana (Loja, Dona, Horário, Escada) virou ` (novo)`. | 🔵 | execução E149 |
| ~~S-A13~~ | **FECHADA em `e2bb58b`** (`docs/migracoes/2026-08-05-sa13-limpeza-do-acervo-de-teste.sql`): **vestidos 899 → 494, atributos 223 → 16**, e zero vestido não-E2E sem referência — é isso que torna o script idempotente. Duas guardas fazem o trabalho: só sai o que não é referenciado por NADA (sem bloqueio, sem item de orçamento, sem item de contrato) e o acervo `E2E%` fica inteiro, porque é fixture viva. **A primeira execução abortou, e o ROLLBACK salvou:** a ficha de interesses da noiva aponta a OPÇÃO (`lead_interesse_atributos.opcao_id`) e `atributo_opcoes` cascateia do atributo, então o DELETE batia na FK pelo caminho de baixo. **O que a faxina NÃO alcança, e é o que sobra:** 121 vestidos `AVA…` com bloqueio e avaria, criados pelo spec 48 a cada run — é a **S-D22**, e é ela que os apaga na origem; as **186 cabines** seguem intocadas (**S-D25**); e "Cor" ×3 e "Cor A" ×3 ficam de propósito, porque são de OUTRAS lojas de teste e apagar atributo de loja alheia é decidir pela loja — o caminho certo é apagar a loja de teste inteira, com outra guarda. As três suítes rodaram DEPOIS do script (regra 11): API 1026 · frontend 469 · E2E 156 · typecheck verde. O diagnóstico original: **O banco de dev tem 223 atributos, dos quais 9 são do catálogo** — o resto é `Decote 1785…` deixado por specs que criam e não limpam, mais 128 cabines. É a família S-D17/S-D25, agora com número. Pior que o volume: há atributos de teste chamados **"Cor", "Cor A", "Cor B" e "Tamanho"**, que colidem com o vocabulário real e vão confundir qualquer varredura futura por nome de atributo. | 🟡 | execução E149 |
| ~~S-A9~~ | ~~**`e2e/11-configuracoes.spec.ts:13-16` carrega~~ um comentário "FALHA ESPERADA no main (achado C2-disponibilidade)"** descrevendo um 404 por URL divergente entre cliente e servidor — e o teste **passa** hoje. Ou o C2 foi consertado e o comentário ficou, ou ele passa por outro motivo. Comentário que mente sobre o estado do teste é pior que comentário nenhum. **CONFERIDA: o DEFEITO está morto e o COMENTÁRIO está vivo — é a primeira hipótese, e o teste NÃO passa pelo motivo errado.** O servidor expõe `agenda.ts:878` e o cliente gerado chama a mesma URL (`api.ts:7762`, `:7833`); o conserto foi `2141e96` (2026-07-15), **oito dias depois** de o comentário entrar em `2c2590c`. O teste foi confirmado NÃO-vacuoso: `11-configuracoes.spec.ts:22` nega uma string que existe literal no ramo `else` da tela (`configuracoes/index.tsx:225`) e `:25` afirma o `14` que o seed grava (`global-setup.ts:186`) — se o 404 voltasse, os dois asserts falhariam. Fica só a higiene de apagar 4 linhas de comentário mentiroso. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) **FECHADA em `cbe79f6`** (agente B3): as 4 linhas saíram e no lugar entrou a frase verdadeira — o que o teste prega hoje é o conserto do C2 (`2141e96`). A mensagem do `expect`, que afirmava o 404 como fato presente, também passou a dizer só o que se sabe. | 🔵 | execução E148 |
| S-A10 | **"Duração da prova" é a única linha do bloco de disponibilidade sem contrapartida editável.** Para mudar, só `PATCH` na API. E o cabeçalho do próprio arquivo (`configuracoes/index.tsx:22-25`, do E98) afirma que "isso mora em 'Cabines & horário', dentro de Atendimentos" — **não mora**: `atendimentos/config.tsx` não expõe o campo, e o `EditarEm` do card (`:173`) leva a uma tela sem ele. | 🟡 | execução E148 |
| ~~S-A11~~ | ~~**`e2e/09-financeiro.spec.ts:27` e `:40` falham no `main`**~~ **FECHADA em `4690f18`** — o describe passou a trazer a própria fixture (conta "Aluguel", lead, contrato com uma parcela) e a levá-la embora no `afterAll`, no molde do `35-recebimento-parcial`. O vencimento é HOJE, não data fixa: a janela padrão das duas telas é o mês corrente, e data fixa sairia dela na virada do mês. **E2E 156 passed, zero vermelho** — `pnpm run test:e2e` volta a sair com `EXIT=0`. O diagnóstico original: — provado rodando os dois contra a base, com o diff do E148 no stash. Esperam a conta "Aluguel" e uma parcela com botão "Receber", dados que o **E147** tornou opcionais (`SEED_EXEMPLOS_FINANCEIROS`) e que o seed idempotente não recria em banco já existente. Enquanto ficarem assim, **`pnpm run test:e2e` sai com `EXIT=1` para todo mundo** e a regra 11 perde o valor: quem roda a suíte aprende a ignorar dois vermelhos — que é como o terceiro passa. Consertar com `beforeAll` próprio (família da S-D17) ou semeando os exemplos no setup do E2E. | ✅ | execução E148 |
| ~~S-A15~~ | **FECHADA em `2a280af`.** A sonda ganhou um `it` que compara os valores de todo `pgEnum` do schema com os do snapshot. **Vermelho antes medido**: acrescentei um valor ao enum sem regenerar a baseline e ela reprovou com `orcamento_item_tipo.SONDA_TEMPORARIA_SA15` — enquanto a sonda IRMÃ, a de tabelas e colunas, seguiu **verde**. É o buraco em duas linhas de saída. O diagnóstico original: | ✅ | execução E154 |
| ~~S-A15 (diagnóstico)~~ | **A sonda do snapshot de migração não vê valor de enum.** `e115-migracao-snapshot-unit.test.ts` compara tabelas e COLUNAS; o `ACESSORIO` que o E150 acrescentou a `orcamento_item_tipo` ficou fora da baseline do drizzle por um dia inteiro com a suíte verde, e só apareceu porque o E154 mexeu em coluna e forçou o `generate` (o `0001` gerado traz o `ALTER TYPE … 'ACESSORIO'` junto). Um banco provisionado por `migrate` entre os dois épicos aceitaria o tipo só até o primeiro INSERT. Estender a sonda aos `enums` do snapshot é pequeno e fecha a classe. | 🟠 | execução E154 |
| S-A16 | **A lavagem não entra na régua do estoque.** A janela do E154 é a de USO, como a spec pediu; mas o saiote também vai à lavagem, e a régua da loja reserva 7 dias para ela no vestido (P1: *"uma semana, lavagem externa"*). A conta é **otimista**: saiote devolvido no dia 21 aparece livre no 22, quando está molhado. Como o épico avisa e não bloqueia, o custo é um aviso que deixa de aparecer — não uma venda recusada à toa. Se a peça de estoque tem ciclo de lavagem é pergunta de produto. | 🟡 | execução E154 |
| S-A17 | **A fila da costureira não tem tela própria por trabalho.** O E155 põe confecção e ajuste na mesma lista e o item do orçamento aponta o trabalho, mas o link do item leva à FILA (`/ajustes?recorte=todos`), não ao trabalho — não existe rota `/ajustes/:id`. Numa loja com fila longa, "na fila da costureira" obriga a procurar a olho. Enquanto a confecção era inexistente isso não pesava; agora que ela tem custo e é cobrada, pesa. | 🔵 | execução E155 |
| S-A18 | **A ausência não olha o que já está marcado.** Registrar férias por cima de uma agenda cheia é aceito em silêncio: o E151 decidiu (com a spec) que ela só impede o NOVO, mas quem cadastra não fica sabendo que há atendimentos naquele intervalo. Um aviso na hora de marcar — *"há 4 atendimentos nesse período; eles não serão alterados"* — fecharia o buraco entre a decisão certa e a pessoa que precisa agir sobre ela. Remarcação em lote segue sendo decisão de produto; **contar e avisar não é**. | 🟡 | execução E151 |
| ~~S-A19~~ | **FECHADA por DECISÃO (P6), não por código.** A dona respondeu que o realuguel em 7 dias **segue recusado** e o ateliê o trata como exceção fora do sistema — o caderno mostra o caso uma vez em 14 semanas, e nenhuma das duas saídas técnicas se paga por isso. O que a sobra tinha de acionável era a **afirmação errada**, e ela foi corrigida na spec (`2026-08-04-acervo-a-identidade-da-peca.md`), com as janelas remedidas e o número da própria sobra consertado. O diagnóstico, agora com data e medida: | ✅ | execução E152 |
| ~~S-A23~~ | **FECHADA em `3c0b5df`.** A dona decidiu que a configuração **não se recusa** (P9), então o conserto é a metade que faltava: Configurações mostra *"Período de prova: 11 dias por reserva"* e, quando a conta zera, *"nenhum — as reservas nascem sem prova"*, no token de aviso. **O defeito era o silêncio, não a permissão.** Régua em núcleo puro com 5 casos, incluindo as duas bordas (prova = uso apaga; prova = uso + 1 já é janela). O diagnóstico original: | ✅ | decisão P7, sessão 5 |
| ~~S-A23 (diagnóstico)~~ | **A janela de PROVA some inteira, em silêncio, quando `provaDiasAntes <= usoDiasAntes`.** Medido em `janelasDoBloqueio` com casamento em 03/03: `prova=14 uso=3` → `PROVA,USO,LAVAGEM`; **`prova=3 uso=3` → `USO,LAVAGEM`**; `prova=2 uso=3` → idem. A janela nasce em `D − provaDiasAntes` e termina em `inicioUso − 1`, então basta a prova não começar antes do uso para ela deixar de existir — e ninguém é avisado. **P7 acabou de tornar isso proibido**: *"toda reserva tem ao menos um dia de prova"*. Não morde hoje (o padrão da loja é 14 × 3), morde na primeira loja que configurar "prova até 3 dias antes" — família da S-A8, que já pede uma passada em toda premissa categórica do `configuracao-inicial.ts`. | 🟠 | decisão P7, sessão 5 |
| ~~S-A19 (diagnóstico)~~ | **O realuguel curto é barrado pela janela de PROVA da segunda noiva, não pela lavagem.** Remedido na sessão 5, com datas: casamento 1 em 03/03 e a volta da lavanderia registrada no dia da devolução ⇒ `PROVA[02-17..02-27]P USO[02-28..03-05]F`, **sem janela de lavagem**; a segunda reserva, casamento 10/03, traz `PROVA[02-24..03-06]` e dá **1 conflito** contra aquele USO — PROVA × FÍSICA. *(O número que esta linha trazia, `PROVA [D−6, D+4]`, estava errado por um dia nas duas pontas: é `[D−7, D+3]`.)* **A afirmação errada da spec foi corrigida em `2026-08-04-acervo-a-identidade-da-peca.md`.** E o caminho de saída também está medido: com `provaDataReal` num dia só (06/03), os conflitos vão a **zero**. O `POST /bloqueios` **não aceita `provaDataReal`**, então não há como criar a segunda reserva já com a prova num dia só, que é justamente o caso do realuguel (a noiva escolheu peça que já conhece). Duas saídas possíveis, e a escolha é de produto. **A spec do E152 afirma que aquele épico torna o caso Adelita registrável; ele NÃO torna** — há teste pregando isso. | 🟠 | execução E152 |
| ~~S-A20~~ | **FECHADA em `7c3c794`, e era MAIOR do que esta linha dizia.** A divergência entre `docs/migracoes/` e o schema drizzle era em **quatro** pontos, e só um gritava. Os outros três eram índices criados pelos scripts e nunca declarados no schema — `itens_estoque_loja_idx` (E154), `avarias_parcela_id_idx` e `atendimentos_loja_contato_idx` (E97) —, que existiam em todo banco antigo e em **nenhum banco novo**: ninguém tropeça num índice que falta, só fica mais lento, e num banco que ainda é pequeno. O conserto foi do lado do SCHEMA (declarar os três, e nomear a unique como o script a nomeou), porque **nenhum banco consumiu o `migrate`** e assim o conserto custa zero DDL em banco real; vai junto o script para quem nasceu de `push` antes disto. E a classe fecha por **varredura**: `e115-migracao-snapshot-unit.test.ts` reprova nome de constraint ou índice criado em `docs/migracoes/` que o snapshot não conheça. O diagnóstico original: | ✅ | execução E156 |
| ~~S-A22~~ | **RETIRADA em `2a280af` — não era defeito, e o erro foi meu.** Registrei que o `.sort()` de string mentiria no `0010`, *"porque `"0010" < "0006"`"*. **É falso**: o drizzle zera à esquerda em quatro dígitos, e com largura fixa a ordem de string **é** a ordem numérica — `"0010" > "0009"`, a diferença cai na terceira casa. Medido nos dois sentidos com 12 nomes sintéticos: as duas ordenações devolvem o mesmo arquivo. A ordenação numérica ficou no código assim mesmo, por não depender da largura do zero à esquerda, mas **não consertou nada** — e o teste que a cobre passou a usar o caso em que a de string erraria de verdade (larguras mistas). Fica registrada em vez de apagada: uma sobra que some não ensina que a apuração desmentiu quem a escreveu. | ✅ | execução S-A20 | O script à mão batizou a unique de `itens_estoque_loja_nome_tamanho_unq` (`docs/migracoes/2026-08-04-e154-itens-de-estoque.sql:37`); o drizzle gera o nome sozinho e procura `itens_estoque_loja_id_nome_tamanho_unique`. Não acha, tenta CRIAR a duplicata e pergunta se pode **truncar `itens_estoque`** — sem TTY, morre. O caminho que o `replit.md` documenta ("aplique o DDL por psql e rode o push depois") deixou de existir para **todo banco que rodou os scripts à mão**, que é todo banco que já existia. Conserto: nomear a constraint no schema (`unique("itens_estoque_loja_nome_tamanho_unq")`) OU renomeá-la nos bancos. | 🟠 | execução E156 |
| ~~S-A21~~ | ~~**`projecao-comissao-api.test.ts:106` reprova, e o código está certo.**~~ **FECHADA em `b22311c`** — a fixture passou a escrever os degraus em reais (`5_000`), e a API voltou a **990 passed, zero vermelho, zero skipped**. O diagnóstico original: A fixture insere `minAcumulado: 500_000` em `comissao_faixas`, coluna `decimal(10,2)` em **reais** que vira centavos no `paraCalc` (`routes/comissao.ts:91`): a segunda faixa do teste começa em **R$ 500.000,00**, não em R$ 5.000,00. Medido: 3.000 vendidos no dia 1, hoje dia 5 de 31 ⇒ `baseProjetada` **R$ 18.600,00**, `percentualProjetado` **3%**, `valorTotalProjetado` **R$ 558,00**; o teste espera 6% porque compara `baseProjetada >= 5000`. Família da crítica 3 do MÉTODO (reais × centavos são dois `number`) e do E94 (assert errado sobre código certo). **Estava `skipped` até ontem** (`MIN_DIAS_PROJECAO = 5`) e reprovou na primeira vez que rodou — enquanto viver, `pnpm --filter api-server test` sai vermelho, como a S-A11 no E2E. Conserto: `500_000` → `5_000` nos dois lugares da fixture. | ✅ | execução E156 |
| S-A24 | **A dona nomeou uma distinção que o sistema não sabe dizer.** Ao responder a P8 ela não disse "domingo é dia de trabalho": disse *"domingo com hora marcada"* — atende quando a noiva pede, e não é expediente de rotina. O modelo tem uma alavanca só (`diasFuncionamento`: o dia está aberto ou o `POST` recusa), então a resposta virou **domingo aberto**, que é o que não perde a venda — mas a grade passa a oferecer domingo como qualquer outro dia, e ninguém marcou para trabalhar de rotina. Um dia "sob demanda" — fora da grade, mas aceito quando alguém insiste — não existe no modelo. É pergunta de produto antes de ser código, e o custo de hoje é pequeno: uma grade que oferece a mais. | 🟡 | decisão P8, sessão 5 |
| ~~S-A25~~ | **FECHADA em `2912526`, e a cascata era mais funda do que a sobra viu.** `bloqueio_vestidos.vestido_id` é CASCADE, e dele descem `atendimentos` (a prova da noiva), `avarias` (o reparo COBRADO) e `contrato_bloqueios` — apagar a peça levava reserva, prova e cobrança junto. Medido: 334 peças com bloqueio, 14 atendimentos e 124 avarias, **R$ 43.400,00 em reparos que sumiriam**. O 409 `VESTIDO_COM_HISTORIA` sai antes de o banco decidir e diz QUEM depende, no molde do `PERFIL_EM_USO`. **Bônus que o teste revelou:** a rota respondia **204 para peça de outra loja**, afirmando ter apagado o que não apagou — agora é 404. Vermelho antes: `expected 409 "Conflict", got 204 "No Content"`. API 1027 → 1031 · E2E 156. | ✅ | S-A14 · [conferência](../2026-08-05-conferencia-de-sobras.md) · `2912526` |
| ~~S-A26~~ | ~~**`VestidoUpdate.status` é `{ type: string }` sem enum~~, e o código decide INATIVO por `status !== "ativo"`** (`vestidos.ts:248`). Um `PATCH` com `"Ativo"` maiúsculo — ou qualquer grafia — tira a peça do acervo em silêncio: ela passa a responder `disponivel: false` com motivo "Vestido inativo" e some da grade, sem que nada tenha sido recusado. A régua de estado da peça não está escrita em lugar nenhum; está implícita numa comparação de string. **E ninguém apagaria uma peça pela tela:** nenhuma tela chama o `DELETE /vestidos/:id` — ele existe no contrato e só curl o alcança, o que é parte de por que a S-A25 passou despercebida. Visto de passagem no `2912526`. **FECHADA em `cc9720f`** (agente B4): enum `[ativo, inativo]` nos três schemas do spec (medido por `git ls-files`: só os dois valores existem no sistema — o "ATIVO" do e2e/48 é status de CONTRATO), rotas decidindo pelo enum gerado, teste puro com "Ativo"/"ATIVO"/" ativo" virando 400 na borda. Como as respostas validam em runtime, grafia legada no banco viraria 500: a migração `2026-08-07-sa26-grafia-do-status-do-vestido.sql` normaliza os dois valores e denuncia o resto — e o banco de dev foi medido antes: 403 linhas, todas `ativo`. | 🟡 | `2912526` vp |
| ~~S-A5~~ | ~~**O `CLAUDE.md` segue apontando para o rastreador da rodada 6**~~ — **FECHADA no fim da sessão 4**: o ponteiro passou a apontar para esta trilha, e ganhou a tabela das três (arqueologia em curso; rodadas 6 e 7 fechadas, com as sobras delas ainda valendo). Era também a S-D28 da rodada 7. | ✅ | montagem da trilha |
