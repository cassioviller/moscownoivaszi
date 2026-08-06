# Plano — as 46 sobras que restam

**Escrito em 2026-08-06**, depois das ondas 0, 1 e 2 da sessão
`docs/revisao/2026-08-06-sessao-faixa-b.md`. Sucede o
`2026-08-05-plano-de-subagentes-para-as-sobras.md`, que está **executado até a
fase 2 inclusive** — a fila do banco tem um item em pé, e é o item 3 dele.

Régua de hoje: **API 1043 · frontend 495 · E2E 161 · typecheck verde.**
Backlog: **46 abertas — 22 🟡 · 24 🔵, nenhuma 🟠 nem 🔴** (14 na rodada 6, 19 na
rodada 7, 13 na arqueologia).

## O que mudou, e é o que torna este plano diferente dos anteriores

**Todas as 46 estão medidas nos últimos dois dias, e é a primeira vez.** Trinta e
uma passaram pela [conferência de 2026-08-05](../revisao/2026-08-05-conferencia-de-sobras.md)
— que confirmou 26 como escritas, corrigiu 9 e matou 4 — e as outras 15 nasceram
nas ondas 1 e 2 de hoje, já com número. A regra 20 manda remedir a sobra antes de
consertá-la; **esse pedágio está pago**, e é o único momento do repositório em
que esteve.

Isso muda o formato: os planos anteriores abriam com uma fase de leitura. Este
não precisa dela, e por isso começa pelo que não tem código nenhum.

## Fase 0 — três linhas que não são trabalho ✅ **EXECUTADA em 2026-08-06**

A regra 21 diz que sobra fechada por DECISÃO se risca com a resposta escrita.
Estas três já trazem a decisão dentro do próprio texto e continuam ocupando a
tabela como se fossem trabalho pendente:

| # | O que a linha já decidiu | Peso |
|---|---|---|
| **S14** | *"Não há backfill possível: casar por texto adivinharia… a guarda vale para o que nasce daqui."* Não é tarefa, é o aceite de um passivo que não se recupera | 🔵 |
| **S24** | A guarda não foi escrita porque o conjunto ficou **vazio**. É uma regra condicional para o futuro (*"se a lista voltar a crescer"*), não trabalho de hoje | 🔵 |
| **S-A1** | As 29 fotos no git foram decisão **deliberada** e contrária à da rodada 7, com o motivo escrito (evidência primária não se recaptura) | 🔵 |

O ganho não é o número: é que uma tabela onde 3 de 46 linhas descrevem decisões
já tomadas obriga quem a lê a conferir cada uma contra o código para saber o que
ainda é verdade — exatamente o trabalho que ela existe para poupar.

## Fase 1 — a folha de perguntas ✍️ **ESCRITA em 2026-08-06**, esperando resposta

A folha está em [`2026-08-06-folha-de-perguntas.md`](2026-08-06-folha-de-perguntas.md),
com a frase de cada pergunta na linguagem de quem responde e, embaixo de cada
uma, o número medido e **o que muda com cada resposta possível**. O que segue
aqui é o índice.

**Um quarto do backlog não tem conserto até alguém perguntar.** Não são pedidos
de funcionalidade: são pontos onde o sistema já se comporta de um jeito e
ninguém decidiu se é o certo. Sete são para a dona do ateliê, quatro para a dona
do repositório.

### Para a dona do ateliê (7)

As três primeiras já estão com a frase exata na conferência (§ "As três
perguntas") — reproduzidas aqui só pelo assunto:

1. **S-A16, a lavagem** — a peça de estoque volta para a lavagem como o vestido?
   Medido: 7 dias de diferença entre peças que saíram e voltaram juntas.
2. **S-A18, a ausência** — férias por cima de agenda cheia avisam ou aceitam
   caladas? Hoje o `POST /ausencias` não consulta `atendimentos` uma vez.
3. **S-A24, o domingo** — a grade oferece 20 slots por domingo por cabine, e
   domingo tem 4 atendimentos contra 90 da segunda.
4. **S39, a data do casamento** — *"a senhora anota em algum lugar a data do
   casamento de cada noiva? Onde?"* É a pergunta que vem antes das outras:
   **4 de 1.351 leads têm a data**, `contratos.data_casamento` está em 0 de 836,
   e a curva que diz quando falta vestido devolve 0 linhas para toda loja.
5. **S27, a reserva sem dona** — *"a loja segura um vestido antes de a noiva ter
   ficha?"* O E107 decidiu que sim, num teste nomeado; a sobra pergunta se aquilo
   ainda vale. Sem resposta não há `CHECK` a aplicar — e a preparação que propôs
   um já caiu com 17 vermelhos.
6. **S-A3, a segunda linha de negócio** — festa/madrinha/dama tem o mesmo prazo,
   preço e prova que noiva? **496 vestidos no acervo, 0 classificados** pelo
   atributo "Tipo de peça" que o E149 criou: o ganho tem uso real zero.
7. **S-A14, apagar peça vendida** — o defeito de código virou a S-A25 e fechou
   (`2912526`); o que resta é se `contrato_itens.vestidoId` deve mesmo ser
   `set null`.

E uma que não é pergunta e sim recado: **S-A2** — faltam as fotos do verso da
última página e das semanas de 28/09 a 11/10. **As 136 saídas contadas são piso,
não total**, e nenhuma delas deve virar número de negócio antes disso.

### Para a dona do repositório (3)

8. **S23** — apagar o `mockup-sandbox` (`rm -rf`) destrói o preview do Canvas que
   o E104 restaurou. Custo hoje é zero medido (o grafo do `main.tsx` alcança 3 de
   61 arquivos); as 8 divergências viram dívida no primeiro mockup que importar o
   calendário.
9. **S29** — manter `@workspace/api-client-react` na raiz por **1 import em 1
   spec** (symlink, 0 bytes de rede) ou trocar a amarração com o codegen por um
   assert de `200` na URL literal.
10. **S-D36** — a tela de perfis globais lista e edita, e não cria. É decisão de
    produto, e é o que torna o vazio da S-D9 um beco.

## Fase 2 — a fila do banco (serial, 6 épicos, 11 sobras)

Um banco só, `workers: 1`, `fileParallelism: false`. Ordem por risco, e os pares
não são estéticos: **em cinco dos seis casos as duas sobras são a mesma linha de
código ou a mesma população.**

| # | Épico | Sobras | Por quê |
|---|---|---|---|
| 1 | **A régua do banco virgem, e o resumo do seed que só ela vê** | S-D43 · S-A12 · S-D41 | A S-D43 pede um script que faça `createdb` + `push` + setup e afirme que termina sem erro; as outras duas são o output do MESMO seed (`seed.ts:44-53` e `:54`), e a S-D41 só se prova num banco novo. Foi assim que a S-D38 apareceu. |
| 2 | **A faxina das cabines** | S-D25 · S-D40 | Mesma população por dois recortes: 206 cabines na loja do seed, 3 com id do seed, **~26 novas por semana**. A guarda tem de distinguir `Cabine E2E {timestamp}` de cabine viva — a da S-A13 não serve. |
| 3 | **A marca de cobrada, e o lead inteiro na parcela** | S-D13 · S-D37 | Mesma linha: `financeiro.ts:141` monta `with: { lead: true }`. O lote que a S-D13 diz não existir **já existe** (`ultimoContatoPorLead`, `leads.ts:59-70`); falta chamá-lo ali. Comparar contra o dia de negócio da loja, não contra "último contato". |
| 4 | **Os 37 perfis planos, e a fonte que os recria** | S-D26 | O `UPDATE` sozinho **não fecha**: `helpers.ts:64` escreve formato plano a cada suíte e `configuracao-inicial.ts:465` usa `onConflictDoNothing`. São 37 de 40, não 2. Mudar permissão derruba sessões (E56/E60). |
| 5 | **As duas fixtures que o E2E não fixa** | S-D42 · S-D39 | A hora de fechamento (dev 19, banco novo 20, ninguém escolheu) e o `bloqueioId` que o state grava e nenhum spec lê. |
| 6 | **O teto que o spec 19 deixa para trás** | S-D24 | `19-orcamento-teto.spec.ts:62` deixa o teto do lead do seed em 100.000. |

Cada item: **um commit de código + um `docs(...)` com o hash**, e o E2E completo
antes do commit sempre que mexer no que a trilha grava (regra 11). O relatório se
lê inteiro, pelo JSON, com os `skipped` (regras 14 e 19).

## Fase 3 — faixa B em paralelo (4 agentes, 14 sobras)

Divisão **por arquivo tocado** (regra 24), para o orquestrador aplicar os diffs
em série sem fabricar conflito. Nenhum agente commita e nenhum toca nas tabelas
de Sobras.

| Agente | Sobras | O que junta |
|---|---|---|
| **B1 — as varreduras** | S-D30 · S-D31 · S-D32 · S-D33 | Catorze sondas enumeram pelo disco (6 no servidor, 8 no frontend), catorze não têm piso de população, quatro números circulam como "os formatadores `Intl`" sem recorte, e o item 3 sumiu da numeração. **A pior é a `s36-gate-da-tela`, que o METODO cita como exemplar.** Os 8 do frontend pedem decisão: uma segunda cópia de `arquivos-versionados.ts` ou um pacote de utilitário de teste que não existe. |
| **B2 — a tela** | S-D34 · S-D35 · S-A10 | `input.tsx:11` em `h-9` (a classe da S-D18 no primitivo que ninguém mediu), o `AlertaCaixa` que empurra o painel depois da pintura, e a "Duração da prova" sem campo editável — com o cabeçalho do arquivo afirmando que ela mora numa tela onde não mora. |
| **B3 — a evidência visual** | S-D1 · S-D2 · S-A9 | O script de captura não existe no repo (as 81 saíram de um scratchpad perdido) e o manifest não declara ambiente — a locale foi provada pelos próprios PNGs, **en-US**. Mais 4 linhas de comentário que mentem sobre um defeito morto há oito dias. |
| **B4 — o servidor sem banco** | S8 · S9 · S-A26 · S-A7 | `cent`/`reais` duplicados em `contratos.ts` com dezenas de call-sites; o teto do orçamento comparando em float; `VestidoUpdate.status` sem enum (um `"Ativo"` maiúsculo tira a peça do acervo em silêncio); e o `30` de `provaDuracao` com **duas fontes** — `agenda.ts:99` e `agenda-core/slots.ts:17` — que divergiriam sem ninguém ver. |

**O que a onda 1 cobrou e vale repetir:** worktree de agente nasce no commit em
que foi criado, não no `main` de hoje; **lock é arquivo derivado e não viaja em
patch**; e agente de workflow não é endereçável depois que o workflow fecha —
quem orquestra termina o que o agente não pôde ver. Verde na faixa que o agente
roda não é verde (regra 25).

## Fase 4 — os sete que não cabem numa onda

Cada um é um épico com diagnóstico próprio. Estão aqui em ordem de quanto o
número já medido justifica o gasto:

1. **S32 — `requireSessaoComLoja` roda 11× por request.** Medido: `GET /dashboard`
   dispara **22 consultas sequenciais**, `comissao` 20, `financeiro` 18. É o
   caminho mais quente do servidor, o custo é função da POSIÇÃO no `index.ts`, e
   **qualquer router novo montado sem path antes do dashboard o leva a 24**.
2. **S35 — os 18 achados do E115 abaixo do corte.** Duplicações (`haQuanto` ×3
   com tetos divergentes, parse `de`/`ate` ×9, envelope CSV ×4), código morto,
   N+1 e o dashboard executando consultas de dinheiro que descarta. Lista com
   âncoras no adendo do E115 — é o único item que já vem decomposto.
3. **S33 — a corrida do `DELETE /admin/lojas`.** O `DELETE` **está** em
   transação; quem fica de fora é a LEITURA da guarda. Mover para dentro do `tx`
   **não basta** em READ COMMITTED (0 ocorrências de `FOR UPDATE`/`SERIALIZABLE`
   no servidor), e não há rede do banco: **33 FKs em CASCADE para `lojas` e zero
   `restrict`** — o irmão `DELETE /admin/usuarios` só não corre o risco porque lá
   existem 5.
4. **S21 — o pacote do financeiro.** Juntar os quatro exports como estão produz
   **regime misto** (parcelas por vencimento, folha por data de pagamento) que
   não fecha com o DRE nem com o fluxo. Fazer direito é derivá-lo de
   `GET /financeiro/fluxo`, que já entrega os dois lados com régua única.
5. **S30 — consolidar os 17 formatadores `Intl`.** O mecanismo fechou em
   `973c364` (contagem congelada arquivo a arquivo, vermelho literal
   `expected 18 to be 17`); o passivo é o que resta, e consolidar exige decidir
   quais viram função pública em `formatos.ts` — julgamento de API de tela.
   Casa com a S-D32 do B1, que é o mesmo assunto pelo lado do recorte.
6. **S10 — a prévia do carnê na tela de contrato.** A função existe desde o E95;
   é o F16 aplicado à tela irmã.
7. **S-A17 — a fila da costureira sem tela por trabalho.** Não existe rota
   `/ajustes/:id`; o link do item leva à fila inteira. Pesa agora que a confecção
   tem custo e é cobrada.

## A ordem que este plano recomenda

**Fases 0 e 1 primeiro, e no mesmo dia.** Elas não têm código, custam um commit
de documento mais uma conversa, e juntas tiram **14 das 46 linhas** do caminho —
ou as fecham, ou as transformam em trabalho que alguém pode planejar. Enquanto as
perguntas não forem feitas, um quarto do backlog é ruído que a próxima sessão vai
reler inteiro para descobrir, de novo, que não dá para começar.

**Depois a fase 2, porque ela é serial e não encolhe.** Seis épicos, um banco, o
E2E de 7 minutos em cada um que mexe no que a trilha grava.

**A fase 3 em paralelo com a 2 só se o agente não tocar no banco** — é o que a
divisão acima garante, e é a regra 24: worktree isola arquivo e **não** isola
banco.

**A fase 4 é para depois, um épico por sessão**, com diagnóstico antes do código.
A S32 e a S33 são as duas que valem começar por medida já feita.

## O que este plano NÃO resolve

- **As perguntas não têm prazo e não são minhas.** Nenhuma das 11 trava as outras
  35, e é por isso que a fase 1 vem antes: para que parem de parecer trabalho.
- **A fase 2 não encolhe com paralelismo.** Seis itens seriais são seis itens
  seriais; subagente nenhum torna o E2E de 7,1 min paralelo.
- **A fase 4 não cabe num plano.** Cada um dos sete pede o diagnóstico que a
  rodada 6 fazia antes de qualquer código — e S21, S30 e S-A17 mudam a forma do
  que alguma tela lê, então nenhum deles fecha sem E2E completo.
