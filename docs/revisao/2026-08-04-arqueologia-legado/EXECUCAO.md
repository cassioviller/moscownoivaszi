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
6. As **perguntas de produto** bloqueiam o bloco 2 da spec (E152 e E153). O
   bloco 1 — **E148, E149, E150, E154, E155 e E151** — não depende de resposta
   nenhuma (regra 5).

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
| A4 | Não há preço de realuguel, embora a contagem de locações já exista | 🟡 | — (pergunta de produto) |
| A5 | Ausência de vendedora não existe no modelo, e é o 1º dado que a agenda registra | 🟡 | — |
| A6 | Os dois cadernos guardam o mesmo dado e já divergem — decide a importação | 🟡 | reinterpretado em B3 |
| B1 | Configurações mostra "2 min" para uma prova de 60 min — o valor está em slots de 30 | 🟠 | — |
| B2 | O código fecha domingo por premissa escrita; o ateliê atendeu 5 domingos | 🟠 | — |
| B3 | A cópia agenda↔caderno foi abandonada em 24/08, não falhada: 79 saídas sem nenhuma linha | 🟡 | — |
| B4 | 6 provas às 18:30 não cabem no expediente padrão (última possível: 18:00) | 🟡 | — |

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
| **E156** — a confecção vira peça do acervo | P4 | ⬜ | — |
| **E157** — a peça conta as locações, e o preço acompanha | A4 · P5 | ⬜ | — |

**Os oito épicos do bloco estão fechados.** P4 e P5, respondidas em 2026-08-04
depois do fecho, abriram dois novos (E156 e E157) — a 4ª versão da spec os
descreve. A ordem é sequencial —
banco de dev e suíte E2E são compartilhados, E149 é dependência dura de E150 e
E154, e o método pede um commit por épico com a suíte lida inteira entre eles
(regras 10, 11, 14, 16).

**Os três acessórios** (2ª versão da spec): o que os distingue não é o que são,
é **como se decide se estão disponíveis** — o tipo 1 **por peça** (existe uma),
o tipo 2 **por contagem** (existem dez), o tipo 3 **por prazo** (não existe
ainda). Três naturezas, três mecanismos; forçar as três no acervo encheria de
anágua a lista que a vendedora abre com a noiva na cabine.

**As perguntas RESPONDIDAS pela dona em 2026-08-04** — as três primeiras antes
do bloco, P4 e P5 depois de ele fechar:

| | Resposta | Consequência |
|---|---|---|
| **P1** | *"uma semana, lavagem externa"* | A régua está **certa**. O A1 se inverte: a colisão é o sistema funcionando. O **E152 troca de escopo** — a lavagem é a única etapa do ciclo **sem data real**, e ganha uma |
| **P2** | *"dois vestidos"* | **E153 CANCELADO.** Era o único irreversível, o único com prazo e o mais caro. O cadastro do acervo deixa de esperar |
| **P3** | *"não sei"* | Deixou de importar — P2 respondeu o que ela existia para descobrir |
| **P4** | *"vira"* | A peça confeccionada **vira item do acervo** depois do casamento: existe a transição produção → acervo que o E155 registrou sem modelar. **Entra o E156** |
| **P5** | *"é valor"* | O `7.600` é dinheiro, não código. **Destrava o A4** e entra o **E157** — a contagem de locações já existe e é da vida inteira (`routes/vestidos.ts:274-277`); falta a régua de preço |

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

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-A1 | **As 29 fotos entraram no git (3,8 MB).** Decisão contrária à da rodada 7, que deixou as 81 capturas fora (`.gitignore`) — e deliberada: aquelas eram **regeneráveis por script** (S-D1), estas são evidência primária de um sistema em papel que não se recaptura. Se o peso incomodar, o caminho é um repo de evidências, não apagar. | 🔵 | montagem da trilha |
| S-A2 | **Falta o verso da última página do caderno.** A semana de 21–27/09 termina com "ATRÁS →" e o verso não foi fotografado; as semanas de 28/09 a 11/10 também faltam. As 136 saídas contadas são piso, não total. Pedir as fotos que faltam antes de qualquer contagem virar número de negócio. | 🟡 | trilha A |
| S-A3 | **O ateliê tem uma segunda linha de negócio que o diagnóstico só tangenciou:** festa/madrinha/dama, indexada por COR e com código de 4 dígitos, contra noiva indexada por nome de modelo. São **38** compromissos em laranja nas 15 páginas de agenda (contagem da trilha B; a trilha A dizia ~20), e em setembro eles superam as provas de noiva. O A3 trata do filtro; ninguém olhou ainda se o fluxo comercial dessa linha (prazo, preço, prova) é o mesmo. | 🟡 | trilha A · recontada em B |
| S-A4 | **A confecção sob medida aparece 3 vezes e não tem lugar no modelo:** *"Siam + Manga **será confeccionada**"* (10–16/08), *"conversar sobre confecção de manga"* (21/07 e 24/07, dois compromissos de 10:30 dedicados ao assunto). Não é ajuste de peça existente (`ajustesTable`) — é peça nova feita para a noiva. Sem âncora de código porque não há código: é ausência. | 🟡 | trilha A |
| S-A6 | **A confecção sob medida ganhou uma segunda evidência na trilha B:** o caderno de 13–19/07 numera *"Manga renda c/ saia lisa"* como item **5** da semana, com a nota *"(Mesma noiva Dayfini)"* — a peça componente tem número de ordem próprio no acervo, igual a um vestido. Reforça a S-A4 e o A2. | 🟡 | trilha B |
| S-A7 | **O `provaDuracao` tem unidade implícita e não documentada** (slots de 30 min). O B1 conserta a tela; a raiz é o nome do campo não dizer a unidade — `provaDuracaoSlots` ou guardar minutos resolveria a classe. `e115-portal-agenda-api.test.ts:92` usa `provaDuracao: 3` (= 90 min) e `revisao-reguas-unit.test.ts:64` idem, então os testes já convivem com a ambiguidade. | 🔵 | trilha B |
| S-A8 | **A régua de dias é do sistema, mas o expediente real do ateliê nunca foi perguntado.** B2 e B4 mostram domingo aberto e 18:30 usado; `configuracao-inicial.ts:125` afirma "como todo ateliê de noiva" sobre o mundo. Vale uma passada em TODA premissa categórica escrita em comentário do `configuracao-inicial.ts` antes de a próxima loja nascer com ela. | 🟡 | trilha B |
| S-A14 | **`contrato_itens.vestidoId` e `orcamento_itens.vestidoId` são `set null`** (`contratos.ts:75`, `orcamentos.ts:54`). Apagar um vestido do acervo transforma um item com peça num item de descrição livre — e a guarda do E150 deixa de valer para aquele contrato numa reedição futura. Não é regressão (o snapshot preserva a descrição), mas a régua nova depende de um vínculo que o schema deixa evaporar. Vale decidir se peça vendida pode ser apagada do acervo. | 🟡 | execução E150 |
| S-A12 | **O output do `seed.ts` mostra o TOTAL da loja ao lado de um `+` que significa "criei algo nesta execução"** (`scripts/seed.ts:44-53`). Numa loja com 122 cabines de lixo de teste, criar 3 imprime `+ Cabines 122` — quem lê entende que o seed criou 122. Separar as duas contagens (`122 (+3)`) resolve. | 🔵 | execução E149 |
| S-A13 | **O banco de dev tem 223 atributos, dos quais 9 são do catálogo** — o resto é `Decote 1785…` deixado por specs que criam e não limpam, mais 128 cabines. É a família S-D17/S-D25, agora com número. Pior que o volume: há atributos de teste chamados **"Cor", "Cor A", "Cor B" e "Tamanho"**, que colidem com o vocabulário real e vão confundir qualquer varredura futura por nome de atributo. | 🟡 | execução E149 |
| S-A9 | **`e2e/11-configuracoes.spec.ts:13-16` carrega um comentário "FALHA ESPERADA no main (achado C2-disponibilidade)"** descrevendo um 404 por URL divergente entre cliente e servidor — e o teste **passa** hoje. Ou o C2 foi consertado e o comentário ficou, ou ele passa por outro motivo. Comentário que mente sobre o estado do teste é pior que comentário nenhum. | 🔵 | execução E148 |
| S-A10 | **"Duração da prova" é a única linha do bloco de disponibilidade sem contrapartida editável.** Para mudar, só `PATCH` na API. E o cabeçalho do próprio arquivo (`configuracoes/index.tsx:22-25`, do E98) afirma que "isso mora em 'Cabines & horário', dentro de Atendimentos" — **não mora**: `atendimentos/config.tsx` não expõe o campo, e o `EditarEm` do card (`:173`) leva a uma tela sem ele. | 🟡 | execução E148 |
| S-A11 | **`e2e/09-financeiro.spec.ts:27` e `:40` falham no `main`** — provado rodando os dois contra a base, com o diff do E148 no stash. Esperam a conta "Aluguel" e uma parcela com botão "Receber", dados que o **E147** tornou opcionais (`SEED_EXEMPLOS_FINANCEIROS`) e que o seed idempotente não recria em banco já existente. Enquanto ficarem assim, **`pnpm run test:e2e` sai com `EXIT=1` para todo mundo** e a regra 11 perde o valor: quem roda a suíte aprende a ignorar dois vermelhos — que é como o terceiro passa. Consertar com `beforeAll` próprio (família da S-D17) ou semeando os exemplos no setup do E2E. | 🟠 | execução E148 |
| S-A15 | **A sonda do snapshot de migração não vê valor de enum.** `e115-migracao-snapshot-unit.test.ts` compara tabelas e COLUNAS; o `ACESSORIO` que o E150 acrescentou a `orcamento_item_tipo` ficou fora da baseline do drizzle por um dia inteiro com a suíte verde, e só apareceu porque o E154 mexeu em coluna e forçou o `generate` (o `0001` gerado traz o `ALTER TYPE … 'ACESSORIO'` junto). Um banco provisionado por `migrate` entre os dois épicos aceitaria o tipo só até o primeiro INSERT. Estender a sonda aos `enums` do snapshot é pequeno e fecha a classe. | 🟠 | execução E154 |
| S-A16 | **A lavagem não entra na régua do estoque.** A janela do E154 é a de USO, como a spec pediu; mas o saiote também vai à lavagem, e a régua da loja reserva 7 dias para ela no vestido (P1: *"uma semana, lavagem externa"*). A conta é **otimista**: saiote devolvido no dia 21 aparece livre no 22, quando está molhado. Como o épico avisa e não bloqueia, o custo é um aviso que deixa de aparecer — não uma venda recusada à toa. Se a peça de estoque tem ciclo de lavagem é pergunta de produto. | 🟡 | execução E154 |
| S-A17 | **A fila da costureira não tem tela própria por trabalho.** O E155 põe confecção e ajuste na mesma lista e o item do orçamento aponta o trabalho, mas o link do item leva à FILA (`/ajustes?recorte=todos`), não ao trabalho — não existe rota `/ajustes/:id`. Numa loja com fila longa, "na fila da costureira" obriga a procurar a olho. Enquanto a confecção era inexistente isso não pesava; agora que ela tem custo e é cobrada, pesa. | 🔵 | execução E155 |
| S-A18 | **A ausência não olha o que já está marcado.** Registrar férias por cima de uma agenda cheia é aceito em silêncio: o E151 decidiu (com a spec) que ela só impede o NOVO, mas quem cadastra não fica sabendo que há atendimentos naquele intervalo. Um aviso na hora de marcar — *"há 4 atendimentos nesse período; eles não serão alterados"* — fecharia o buraco entre a decisão certa e a pessoa que precisa agir sobre ela. Remarcação em lote segue sendo decisão de produto; **contar e avisar não é**. | 🟡 | execução E151 |
| S-A19 | **O realuguel curto é barrado pela janela de PROVA da segunda noiva, não pela lavagem.** Medido no E152: com casamento em D e regra padrão, a segunda reserva em D+7 traz `PROVA [D−6, D+4]`, que sobrepõe o `USO [D−3, D+2]` da primeira — e PROVA × FÍSICA é conflito. O `POST /bloqueios` **não aceita `provaDataReal`**, então não há como criar a segunda reserva já com a prova num dia só, que é justamente o caso do realuguel (a noiva escolheu peça que já conhece). Duas saídas possíveis, e a escolha é de produto. **A spec do E152 afirma que aquele épico torna o caso Adelita registrável; ele NÃO torna** — há teste pregando isso. | 🟠 | execução E152 |
| S-A5 | **O `CLAUDE.md` segue apontando para o rastreador da rodada 6** — é a S-D28 da rodada 7, ainda aberta, e agora há um terceiro rastreador (este) disputando o ponteiro. Quando fechar, o ponteiro deve dizer qual é a rodada em curso **e** que a arqueologia é uma trilha paralela. | 🟡 | montagem da trilha |
