import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import { comArquivoSintetico, diferencaNomeada } from "./populacao-da-varredura";
import {
  arquivosVarridos,
  colunasDeEstadoDe,
  degrauDaTranca,
  ehColunaDeEstado,
  enumerarPortas,
  escritasComTabelaDinamica,
  escritasComTabelaDinamicaNoTexto,
  excecoesDe,
  portasNoTexto,
  sqlCruEscrevendoEmTabelaQuente,
  sqlCruNoTexto,
  trancasEmLacoNaoOrdenado,
  trancasForaDeOrdem,
  trancasNoTexto,
  trancasPorTransacao,
  trancasSemDegrauDeclarado,
  COLUNAS_DE_ESTADO,
  NOMES_NO_BANCO,
  TABELAS_QUENTES,
  type Porta,
  type TabelaQuente,
} from "./portas-de-escrita";

/**
 * E171 — a varredura que CONTA as portas de escrita nas quatro tabelas quentes.
 *
 * A decisão D4 da Fase 0 autorizou este arquivo com uma frase que é o contrato
 * dele: *"as varreduras S-M7/S-M18/S-M22/S-M24 acertaram o padrão e erraram o
 * alcance — 14 portas apareceram abertas hoje"*. Quatro rodadas de revisão
 * escreveram a régua certa e nenhuma escreveu a ENUMERAÇÃO, então cada rodada
 * seguinte reencontrava a mesma classe em portas novas.
 *
 * O que muda aqui: a população não é uma lista curada por quem leu — ela sai de
 * `git ls-files` + AST a cada execução, e cresce sozinha quando nasce uma porta.
 *
 * **Medido em 2026-08-11**, sobre a base `46f54f0` (E165, Faixa C):
 *
 * | | Portas |
 * |---|---|
 * | **TRANCA** — transação + `FOR UPDATE` + releitura | **16** |
 * | **CAS** — a condição de estado repetida no `where` da escrita | **4** |
 * | **ABERTA** — dívida reconhecida abaixo | **6** |
 * | **Total** | **26**, em 266 arquivos-fonte versionados |
 *
 * Das 6 abertas, **2 são nascimento de linha-pai** (não há linha anterior para
 * reler) e **4 são portas de verdade**, cada uma com âncora na tabela de Sobras.
 *
 * **Remedido em 2026-08-12**, sobre a base `aaf4c8e`: **271 arquivos, 32
 * portas, 11 abertas**. As 6 que entraram são todas do gerador da loja de
 * demonstração (`0cfae03`) — nenhuma porta de rota nasceu no intervalo, e a
 * S-O31 que a coluna ABERTA perdeu já estava contada acima. A varredura pegou
 * as 6 sozinha, no commit seguinte ao que as criou; quem não a leu foi quem
 * commitou.
 *
 * **E180 — `parcelas` entra como a QUINTA tabela quente (S-O34).** A D4 escolheu
 * quatro tabelas e deixou de fora justamente aquela onde o dinheiro mora: o
 * E158 já tivera de trancá-la (`contratos.ts:1229`) e a varredura que conta as
 * portas não a contava. Ela custou uma linha em `TABELAS_QUENTES`, uma em
 * `PAIS`, uma em `COLUNAS_DE_ESTADO` e uma em `NOMES_NO_BANCO` — **e as duas
 * últimas foram aposentadas em 2026-08-13**: as colunas saem do schema desde a
 * S-C33 e os nomes desde a S-C55, então tabela quente nova custa hoje duas
 * linhas, não quatro. Ela trouxe **15 portas de uma vez**, das quais **14 já
 * tinham disciplina** (11 sob tranca, 3 por CAS). A décima quinta é o gerador da
 * demonstração, que já estava perdoado pelo mesmo motivo que as outras seis
 * dele.
 *
 * | | Portas |
 * |---|---|
 * | **TRANCA** | **28** |
 * | **CAS** | **8** |
 * | **ABERTA** | **12** |
 * | **Total** | **48**, em 271 arquivos-fonte versionados |
 *
 * **E191 — a dívida cai a 9 (S-O79).** As três portas de `comissao.ts` passaram
 * a reler a guarda depois da tranca, e com isso **nenhuma porta ABERTA deste
 * repositório é mais uma porta de ROTA**: as 9 que sobram são 2 nascimentos de
 * linha-pai e 7 do gerador da loja de demonstração, todas julgadas e absolvidas
 * abaixo. Remedido: **283 arquivos, 48 portas, 31 TRANCA · 8 CAS · 9 ABERTA**,
 * com as 28 transações e as 38 trancas inalteradas — o E191 não criou tranca
 * nenhuma, ele fez as que já existiam decidirem alguma coisa.
 *
 * **HOJE (2026-08-13, base `4ada7c3`): 304 arquivos · 57 portas · 33 TRANCA ·
 * 11 CAS · 13 ABERTA · 29 transações · 40 trancas.** A porta a mais é a da
 * S-C70: o estorno avulso passou a CANCELAR a linha de `MORA` que aquele
 * recebimento criou, dentro da transação que já trancava o contrato — **um
 * `update` novo em `parcelas`, nenhuma tranca nova**. As três tabelas acima são
 * história e ficam por isso; o número corrente mora nos dois retratos travados
 * (`RETRATO`, `RETRATO_DA_ORDEM`), e ele é travado por IGUALDADE desde a
 * S-C46 — **enquanto foi piso, esta prosa envelheceu 8 portas, 1 transação e 2
 * trancas sem que nada reprovasse.** O critério de quando travar e quando pôr
 * piso está declarado ao lado das constantes.
 *
 * ## O que esta varredura NÃO vê
 *
 * Dito aqui porque é a informação mais útil da próxima rodada — a régua que
 * esconde o próprio alcance é a que autoriza:
 *
 * 1. **Ela é léxica, não sensível a caminho.** `reservas.ts:781-784` toma o
 *    `FOR UPDATE` do vestido DENTRO de um `if (mudouJanelas)`; a varredura vê o
 *    `.for("update")` antes da escrita e aprova. Quando o `if` é falso a escrita
 *    de `:801` roda sem tranca nenhuma. Nenhuma varredura sintática resolve
 *    isso; resolve-se com corrida determinística no molde `sm7`.
 * 2. **Ela não confere o que o helper PERGUNTA.**
 *    `verificarDisponibilidade({ executor: tx })` conta como releitura da guarda
 *    porque recebe o executor da transação, e a varredura não lê o que ele
 *    pergunta lá dentro. ~~**Vale igual para a ordem.**~~ **A metade da ORDEM
 *    fechou no E186 (S-O59)**: a conta segue o `tx` para dentro das funções do
 *    mesmo módulo, então `trancarContratos` (`comissao.ts:224`) e `trancarEixos`
 *    (`agenda.ts:98`) contam nas três contas. O que sobra de fora é o helper
 *    IMPORTADO de outro arquivo — resolução de módulo, não de projeto.
 * 3. **Ela não sabe se a linha trancada é A linha.** `PAIS` diz que trancar o
 *    lead serve para escrever no contrato; não diz que é o lead CERTO. Trancar
 *    outro lead passaria.
 * 4. ~~**Ela conta a tranca, não a ordem.**~~ **Fechado no E180 (S-O33)**, nas
 *    duas metades que a AST pode responder: a sequência de tabelas sobe os
 *    degraus de `DEGRAUS_DA_ORDEM` sem descer nenhum, e a tranca tomada dentro
 *    de um laço percorre coleção ORDENADA. O que fica de fora está declarado no
 *    enumerador e é o mesmo ponto cego 1: ramo condicional é lido como
 *    sequência, e a leitura erra para MAIS — acusa ordem que talvez não
 *    aconteça, nunca aprova inversão que aconteça.
 * 5. **Ela é da camada do drizzle.** Um `pool.query("UPDATE contratos …")` fora
 *    do drizzle não é porta para ela. O caso vizinho — template `sql` com verbo
 *    de escrita — TEM peneira (regex sobre o texto do template, porque template
 *    string não tem AST por dentro) e hoje dá zero. **Zero é também o que ela
 *    daria estando cega**, e era o que a S-C55 tinha aberto: o nome de cada
 *    tabela vinha de um mapa escrito à mão. Hoje ele sai de `getTableConfig` e
 *    o autoteste prega que a peneira ACHA o template sintético.
 * 6. **Ela não olha o frontend de verdade.** `moscow-noivas/src` entra na
 *    população para que um `contratosTable` que apareça lá seja visto, mas
 *    escrita de tela passa por HTTP, não por tabela.
 */

const portas = enumerarPortas();
const sitio = (p: Porta): string => `${p.arquivo}:${p.linha} ${p.verbo}(${p.tabela})`;

/**
 * S-C46 — O CRITÉRIO DAS CONTAGENS: o que é RETRATO trava, o que é MÍNIMO tem
 * piso, e só isso.
 *
 * Esta régua nasceu com `>=` em toda parte, e o preço apareceu duas vezes num
 * dia só:
 *
 * - **A S-C11 remediu e achou 8 portas de atraso**: a prosa anunciava *48
 *   portas · 31 TRANCA · 8 CAS · 9 ABERTA* e o medido era *56 · 32 · 11 · 13*.
 *   Sete das oito tinham entrado nos épicos da trilha do contrato sem que nada
 *   reprovasse.
 * - **E o commit que denunciou isso envelheceu a prosa do lado de baixo, no
 *   mesmo diff**: o `PATCH /avarias/:id` da S-C11 abriu **1 transação e 2
 *   trancas**, e o § da ordem continuou dizendo *"28 transações trancam, e são
 *   38 trancas"* enquanto os pisos `>= 20` e `>= 25` passavam verdes sobre
 *   **29 e 40**. O piso não cobra a remedida: ele só protege a régua de
 *   ENCOLHER, e a régua não estava encolhendo — estava crescendo sem ninguém
 *   olhando.
 *
 * Daí o critério, e ele é por PERGUNTA, não por gosto:
 *
 * 1. **RETRATO — igualdade.** O número é o que esta varredura existe para
 *    medir, e mudá-lo é uma decisão sobre disciplina de escrita. Toda porta,
 *    toda transação que tranca, toda tranca. Igualdade transforma "a população
 *    cresceu" em vermelho, e vermelho é o único lugar onde alguém escreve POR
 *    QUE cresceu — que é o parágrafo que faltou nas oito.
 * 2. **PISO — desigualdade.** Só onde o número é genuinamente um MÍNIMO: ele não
 *    descreve nada, ele impede a sonda de cegar. Sobrou **um** no arquivo, o da
 *    população de arquivos-fonte, e ele está declarado no lugar.
 *
 * **A objeção é séria e a resposta é medida: igualdade em tudo vira parede.**
 * Ela é aceitável aqui porque o custo é o mesmo que `SEM_DISCIPLINA` já cobra
 * desde o E171 — porta nova custa UM número e o parágrafo que o explica —, e
 * porque o vermelho é legível: as contas são comparadas como OBJETO
 * (`{TRANCA, CAS, ABERTA}`), então o diff diz qual das três se mexeu em vez de
 * um `expected 33 to be 32` que não diz de onde veio.
 *
 * O que já estava na forma certa e fica como está: `SEM_DISCIPLINA` (contagem
 * por arquivo, igualdade — S30), as 7 trancas via helper, as 2 sem degrau e os
 * 6 laços, todos `toHaveLength`.
 *
 * **Medido em 2026-08-13 (S-C46), base `c34ac62`: 304 arquivos-fonte
 * versionados.**
 *
 * E228: TRANCA 33 → 34 — a solta do órfão vencido (S-C60) é um UPDATE dentro
 * da transação de `criarReservaDeVestido`, atrás do MESMO `FOR UPDATE` do
 * vestido que serializa os criadores (S-M22). Porta nova, disciplina velha.
 *
 * E223: TRANCA 34 → 36 — a troca de peça do contrato abre transação própria
 * (contrato → bloqueio antigo, e o vestido novo é trancado pela transação
 * ANINHADA de `criarReservaDeVestido`, que agora aceita executor): o
 * soft-cancel do bloqueio antigo e o `updatedAt` do contrato são as duas
 * escritas novas, as duas atrás do `FOR UPDATE` da própria linha.
 */
const RETRATO = { TRANCA: 36, CAS: 11, ABERTA: 13 } as const;

/**
 * O retrato da ORDEM, travado pelo mesmo critério — e é ele que estava 1 e 2
 * atrás. As duas contas descrevem a mesma coisa por ângulos diferentes:
 * `transacoes` é quantos blocos `db.transaction` tomam ao menos uma linha, e
 * `trancas` é quantos `FOR UPDATE` eles tomam ao todo (contando os que chegam
 * seguindo o executor para dentro de um helper do módulo, desde o E186).
 *
 * **28 → 29 e 38 → 40, e o movimento é UM commit**: o `PATCH /avarias/:id` da
 * S-C11 (`9fa70a5`) abriu uma transação que tranca a avaria (degrau 3) e depois
 * a parcela (degrau 6) — `git show 9fa70a59` sobre as quatro pastas varridas dá
 * exatamente `+1 db.transaction` e `+2 .for("update")`. Nenhuma outra
 * transação nasceu ou morreu no intervalo.
 *
 * **29 → 30 e 40 → 42 (E223)**: a troca de peça tranca o contrato (degrau 5)
 * e o bloqueio antigo (degrau 7), na ordem. A tranca do vestido novo não
 * aparece aqui como terceira porque vive na transação ANINHADA de
 * `criarReservaDeVestido` (savepoint), que já era contada como transação
 * própria — o degrau 8 continua sendo tomado por ela, depois dos dois de cá.
 */
const RETRATO_DA_ORDEM = { transacoes: 30, trancas: 42 } as const;

/**
 * A dívida reconhecida: as portas que hoje não são TRANCA nem CAS.
 *
 * **É contagem por arquivo, não lista de nomes** — foi o defeito que a
 * conferência de 2026-08-05 achou na S30: *"trava a lista de arquivos, não a
 * contagem"*, e um arquivo perdoado podia ir de 6 para 60 com a suíte verde.
 * Aqui `comissao.ts` não pode ganhar a quarta porta aberta em silêncio.
 *
 * ### ~~`comissao.ts` — 3 portas~~ — FECHADA no E191 (S-O79), e a tabela cobrou
 *
 * **Esta tabela descreveu o defeito errado por dez épicos.** Até o E186 ela
 * dizia *"as três escrevem `contratos.comissao_estornada_em` e nenhuma tranca a
 * linha do contrato"* — e isso **deixou de ser verdade no E176**, que criou
 * `trancarContratos` e o chamou das três. O que sustentava a frase antiga era a
 * varredura não enxergar o helper: `trancou=[]` nas três. Com o executor
 * seguido (S-O59/E186), o que se media era `trancou=[contratosTable]` nas três,
 * e o que faltava era outra coisa — a tranca chegava DEPOIS da pergunta:
 *
 * - `:1071` (reabrir fechamento) — a lista de estornos saía de
 *   `fechamento.estornoContratoIds`, lido no **POOL**, antes da transação.
 * - `:1340` (fechar competência) e `:1449` (baixar estorno à mão) — a lista saía
 *   de `estornosPendentes(tx, …)`, dentro da transação e **antes** do
 *   `FOR UPDATE`.
 *
 * O E191 fechou as três com uma releitura só — `relerEstornosSobATranca`,
 * chamada logo depois de `trancarContratos` —, e o reabrir ganhou o `returning()`
 * do próprio DELETE no lugar da lista do pool. Medido nas três:
 * `TRANCA rel=guarda delegada a relerEstornosSobATranca`.
 *
 * **A baixa foi cobrada por aqui antes de ser aceita**, como a da S-O31: a
 * contagem de `comissao.ts` caiu de 3 para 0 e o total de 12 para 9, com os dois
 * casos vermelhos na frente (`expected 9 to be 12`). É a terceira vez nesta
 * trilha que a dívida cobra a própria baixa.
 *
 * ### ~~`orcamentos.ts:1114`~~ — FECHADA, e esta varredura foi quem cobrou
 *
 * A S-O31 (🟠) era o `POST /orcamentos/:id/link` lendo o orçamento no POOL e
 * decidindo pelo `status === "RASCUNHO"` lido lá fora, enquanto a transação
 * gravava o token E chamava `criarVersaoEnviada`. **Medido: dois cliques
 * simultâneos congelavam DUAS versões da mesma proposta** — `expected [ … ] to
 * have a length of 1 but got 2` —, e a versão congelada é o que o gate do E115
 * confere contra o contrato. Fechada movendo as três perguntas e as duas
 * decisões para DENTRO da transação, sob `FOR UPDATE`, como as portas de item
 * já faziam via `sobPaiTrancado`.
 *
 * **O fecho passou por aqui antes de ser aceito:** baixar a porta fez a
 * contagem de `orcamentos.ts` cair de 2 para 1 e o total de 6 para 5, e os dois
 * casos abaixo ficaram VERMELHOS (`expected 5 to be 6`). É o comportamento que
 * esta tabela existe para ter — a dívida trava a CONTAGEM, não a lista de
 * nomes, que foi o defeito que a conferência de 2026-08-05 achou na S30.
 *
 * ### As 2 de nascimento — julgadas e absolvidas, não perdoadas
 *
 * - `orcamentos.ts:290` (`POST /orcamentos`) e `reservas.ts:133`
 *   (`POST /reservas`) inserem a linha-PAI que ainda não existe. Não há estado
 *   anterior para reler nem linha para trancar; a unicidade que importa é a do
 *   `id` gerado. **Elas ficam nesta tabela de propósito** — automatizar
 *   "INSERT não precisa de tranca" seria a régua que autoriza, e o
 *   `contratos.ts:685` é a prova: é um INSERT e precisa de duas trancas.
 *
 * ### `scripts/loja-de-demonstracao.ts` — 7 portas, e a varredura acertou em
 * vê-las
 *
 * O gerador da loja de demonstração (`0cfae03`) escreve orçamento, contrato e
 * bloqueio direto na tabela, com `db` e sem tranca — e **a varredura ficou
 * vermelha no commit seguinte, que é exatamente o que ela existe para fazer**.
 * O `main` viveu 2 dias com este vermelho, e ele foi encontrado por acidente,
 * ao medir outra coisa: a régua 18 diz que vermelho que vira paisagem apaga a
 * régua 11, e foi o que aconteceu aqui.
 *
 * **Julgadas e absolvidas, não perdoadas**, pelos mesmos critérios das duas de
 * nascimento acima:
 *
 * - O script **cria a loja que ele povoa**, na mesma execução. Não existe outra
 *   sessão escrevendo naquelas linhas: não há noiva, vendedora nem tela — há um
 *   `tsx` rodando sozinho contra ids que ele acabou de gerar.
 * - Ele é **descartável por desenho**: a loja de demonstração existe para
 *   produzir os prints dos manuais e é recriada do zero quando muda.
 * - Ele **não roda em produção**. Nenhuma rota o chama; o caminho é o `tsx` na
 *   mão de quem gera a documentação.
 *
 * A contagem fica travada pelo mesmo motivo pelo qual a de `comissao.ts` ficava
 * em 3: o que esta tabela impede não é a porta existir, é ela se multiplicar em
 * silêncio. **E ela cobrou de novo no E180:** `parcelas` entrando como quinta
 * tabela quente revelou o carnê da demonstração (`:525`), e a contagem foi de 6
 * para 7 com o vermelho `expected 12 to be 11` na frente.
 */
const SEM_DISCIPLINA: Record<string, number> = {
  // `comissao.ts` saiu daqui no E191 (S-O79): eram 3, e as três eram a mesma
  // coisa — tranca sem repergunta. Hoje as três releem sob ela.
  //
  // Era 2; a S-O31 (`POST /link`) fechou e a contagem caiu — o vermelho desta
  // linha foi o que cobrou a baixa. Resta o nascimento de `POST /orcamentos`.
  "artifacts/api-server/src/routes/orcamentos.ts": 1,
  /**
   * **E213 — 0 para 1.** A linha de MORA que o recebimento cristaliza é
   * **nascimento** (cláusula 9ª): ela não existe antes do `INSERT`, não há
   * estado anterior a reler, e a unicidade que importa é a do `unique(contratoId,
   * numero)` — o mesmo critério das três de `reservas.ts` e da de
   * `orcamentos.ts`. Ela nasce DENTRO da transação do recebimento, que já
   * escreveu a parcela-mãe sob o CAS do B6/E94: quem perder a corrida derruba a
   * transação inteira e leva a linha de mora junto.
   *
   * As duas portas do PERDÃO não entram aqui, e é o achado: elas nasceram
   * abertas e foram fechadas por CAS de verdade — o `where` repete a condição
   * lida (`mora_perdoada_em IS NULL` para perdoar, `IS NOT NULL` para
   * desfazer). A varredura só passou a enxergá-las depois de `moraPerdoadaEm`
   * entrar em `COLUNAS_DE_ESTADO`, que é a S-C33 acontecendo pela segunda vez
   * em dois épicos seguidos. **A terceira vez não acontece**: a S-C33 fechou e
   * a lista sai do schema — `moraPerdoadaEm` seria vista sozinha, por ser um
   * `timestamp` anulável terminado em `Em`.
   */
  "artifacts/api-server/src/routes/contratos.ts": 1,
  /**
   * De 1 para 3 no E211 — as duas novas são o reajuste da troca de data
   * (cláusula 17ª §§2º e 3º), e estão **julgadas e absolvidas, não perdoadas**:
   *
   * - o `INSERT` da parcela do reajuste é **nascimento**: a linha não existe,
   *   não há estado anterior a reler, e a unicidade que importa é a do `id`
   *   gerado — o mesmo critério do `POST /reservas` logo acima;
   * - o `UPDATE contratos SET reajustes_de_data` **é serializado pela linha do
   *   contrato**, e não por um `FOR UPDATE` que a varredura enxergue: o
   *   `UPDATE … RETURNING` que propaga `dataCasamento` (`:493`) já tomou o
   *   lock daquela linha alguns statements antes. Em READ COMMITTED, quem chega
   *   depois **bloqueia ali, relê a versão nova quando o primeiro commita, e o
   *   `returning()` devolve o `reajustesDeData` já incrementado** — que é
   *   exatamente o degrau certo para a segunda troca.
   *
   * A segunda é a que merece o olho de quem reabrir: ela depende de um lock
   * IMPLÍCITO, tomado por outra sentença. Se algum dia a propagação da data
   * deixar de passar por aquele `UPDATE`, esta conta perde a serialização em
   * silêncio — e é por isso que ela fica declarada aqui em vez de resolvida com
   * um comentário no código.
   *
   * **De 3 para 4 no E212** — a cobrança do atraso na devolução (cláusula 16ª).
   * A rota escreve DUAS vezes e só uma entra aqui, e a diferença é o achado:
   *
   * - o `INSERT` da parcela do atraso é **nascimento**, pelo mesmo critério das
   *   duas linhas acima — a linha não existe, não há estado anterior a reler;
   * - o `UPDATE contratos SET atraso_parcela_id` **é CAS de verdade**, e a
   *   varredura não o enxergava. O `where` da escrita repete a condição lida
   *   (`atraso_parcela_id IS NULL`, ou o valor morto que a rota conferiu), o
   *   segundo clique não casa, o `returning()` volta vazio e a transação
   *   inteira cai — levando junto a parcela que ela acabou de inserir. Estava
   *   invisível porque `COLUNAS_DE_ESTADO.contratosTable` listava só `status` e
   *   `canceladoEm`: **a régua media menos do que anuncia**, e desta vez na
   *   direção que acusa código certo. `atrasoParcelaId` entrou na lista
   *   (`portas-de-escrita.ts`), e com ela a porta passou a medir CAS.
   *
   * **A S-C33 fechou e esta linha é a prova de que a exceção vale:**
   * `atrasoParcelaId` é o único estado que a grafia derivada não pega — ele é
   * VÍNCULO, não data. Removê-la da lista de exceções faz esta contagem ir de
   * **4 para 5** e a dívida de **13 para 14**, medido.
   */
  "artifacts/api-server/src/routes/reservas.ts": 4,
  // Era 6; a sétima é o carnê (`:525`), que só ficou visível quando `parcelas`
  // virou tabela quente no E180. Mesma família das outras seis, mesmo veredito.
  "scripts/loja-de-demonstracao.ts": 7,
};
const TOTAL_SEM_DISCIPLINA = RETRATO.ABERTA;

describe("varredura — a enumeração das portas de escrita", () => {
  /**
   * **S-C79 — a população se afirma por DIFERENÇA contra o `git ls-files`, não
   * por tamanho.** O piso `> 200` era o único número do arquivo que NADA
   * derivava: medido uma vez (304 na S-C46, 2026-08-13) e envelhecendo verde —
   * em 2026-08-15 a população era **315**, onze arquivos em dois dias sem que
   * nada cobrasse remedida. Pior: o piso não sentia um RECORTE novo no
   * enumerador — um quarto `.filter` que apagasse `routes/` inteira passava
   * com folga, e a justificativa do piso ("o RETRATO cobre a mesma direção")
   * deixa de valer para qualquer peneira sobre população que não produza porta
   * nenhuma, como a de SQL cru, que dá zero por desenho.
   *
   * O que este teste faz agora: declara AQUI as pastas e os três recortes que
   * `arquivosVarridos()` promete aplicar, recomputa a referência, e cobra a
   * diferença VAZIA nas duas direções — com os arquivos nomeados. Recorte
   * não-declarado no enumerador aparece em `aMenosNaPopulacao`, pasta removida
   * idem, e o vermelho é uma lista legível em vez de um número que não diz de
   * onde veio.
   */
  it("olha para TODO o versionado das quatro pastas — a diferença é vazia e nomeada", () => {
    const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
    // A promessa do enumerador, escrita uma segunda vez DE PROPÓSITO: é a
    // cópia daqui que prega a de lá (`portas-de-escrita.ts`, `PASTAS` e
    // `arquivosVarridos`). Mudou lá sem mudar aqui, a diferença nomeia quem
    // entrou ou saiu.
    const referencia = arquivosVersionados(RAIZ, [
      "artifacts/api-server/src",
      "artifacts/moscow-noivas/src",
      "lib",
      "scripts",
    ]).filter(
      (rel) =>
        /\.tsx?$/.test(rel) &&
        !rel.includes(".test.") &&
        !rel.split("/").includes("__tests__") &&
        !rel.split("/").includes("generated"),
    );
    const populacao = arquivosVarridos();
    expect(diferencaNomeada(populacao, referencia)).toEqual({
      aMaisNaPopulacao: [],
      aMenosNaPopulacao: [],
    });
    // Zero não é número mágico: referência e população podem esvaziar JUNTAS.
    expect(populacao.length).toBeGreaterThan(0);
  });

  /**
   * S-C182 — a encenação do arquivo plantado, de ponta a ponta: o arquivo no
   * DISCO não existe para a população (a enumeração é `git ls-files`), passa a
   * existir com o `git add -N` que a utilitária faz, e sai no desfazer. É o
   * degrau que três épicos reescreveram de cabeça (S-C33, S-C46, S-C130) e que,
   * esquecido, deixa a encenação verde por não ter olhado.
   */
  it("o arquivo sintético só entra na população pelo index — e sai no desfazer", () => {
    const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
    const rel = "artifacts/api-server/src/zz-sintetico-populacao-s-c182.ts";
    expect(arquivosVarridos()).not.toContain(rel);
    comArquivoSintetico(RAIZ, rel, "export const sintetico = true;\n", () => {
      expect(arquivosVarridos(), "plantado e adicionado ao index, ele é visto").toContain(rel);
    });
    expect(arquivosVarridos(), "desfeito, ele some da população").not.toContain(rel);
  });

  /**
   * O total é a soma do RETRATO, e não um número solto: ele não pode divergir
   * das três disciplinas contadas mais abaixo, porque toda porta tem
   * exatamente uma.
   *
   * **57 medidas em 2026-08-13.** O título dizia 48 até a S-C11 remedir e achar
   * oito de atraso — uma dela mesma (a parcela que segue o valor corrigido da
   * avaria) e sete acumuladas nos épicos da trilha do contrato. O piso era
   * `>= 22` e nada reprovava; hoje o número é igualdade, que é o que obriga a
   * próxima a ser explicada — e a **57ª foi explicada por esta régua**: a S-C70
   * abriu o `update` que CANCELA a linha de `MORA` no estorno avulso
   * (`contratos.ts`), e o vermelho `expected 57 to be 56` foi o que cobrou este
   * parágrafo.
   */
  it("acha as portas — são 60, e o total é o retrato somado", () => {
    expect(portas.length).toBe(RETRATO.TRANCA + RETRATO.CAS + RETRATO.ABERTA);
  });

  it("as cinco tabelas quentes têm porta — nenhuma some da conta", () => {
    const porTabela = new Set(portas.map((p) => p.tabela));
    expect([...porTabela].sort()).toEqual([
      "bloqueioVestidosTable",
      "contratosTable",
      "orcamentosTable",
      "parcelasTable",
      "reservasTable",
    ]);
  });

  /**
   * A tabela do alvo tem de ser um identificador simples para a AST classificar
   * a porta. Zero hoje; a primeira exceção vira decisão, não silêncio.
   */
  it("nenhuma escrita esconde a tabela atrás de expressão", () => {
    expect(escritasComTabelaDinamica()).toEqual([]);
  });

  it("nenhum SQL cru escreve nas quatro tabelas quentes", () => {
    expect(sqlCruEscrevendoEmTabelaQuente()).toEqual([]);
  });
});

/**
 * S-C55 — o nome no banco sai do DRIZZLE, e a peneira prova que enxerga.
 *
 * `NOMES_NO_BANCO` era um mapa escrito à mão, e é dele que sai a `RegExp` da
 * peneira de SQL cru. **Nome errado ali é a peneira devolvendo `[]` por não ter
 * olhado** — o mesmo `[]` que ela devolve hoje por não haver o que achar, e
 * indistinguível dele. Os cinco batiam; nada obrigava.
 *
 * O conserto tem duas metades, e a segunda é a que faltava na S-C33:
 *
 * 1. **Derivar** — `getTableConfig(t).name` é o nome que o `CREATE TABLE` usou.
 *    Tabela renomeada no schema renomeia a peneira no mesmo commit, e erro de
 *    digitação deixa de ser possível.
 * 2. **Pregar que a sonda ACHA** — derivação tira o erro de digitação e não
 *    prova enxergo nenhum. O autoteste abaixo dá o template sintético que a
 *    peneira TEM de achar, ao lado dos três que ela tem de deixar passar.
 */
describe("varredura — a peneira de SQL cru enxerga, e o nome sai do schema", () => {
  /**
   * O que a mão sabia no dia em que foi aposentada — mesma forma da
   * `CURADA_ATE_2026_08_13` das colunas: prova que a troca não perdeu nada.
   * Não é piso e não é retrato: é a foto do que se substituiu, e ela só sai
   * daqui quando uma tabela quente for renomeada de verdade.
   */
  const CURADO_ATE_2026_08_13: Record<TabelaQuente, string> = {
    bloqueioVestidosTable: "bloqueio_vestidos",
    reservasTable: "reservas",
    contratosTable: "contratos",
    orcamentosTable: "orcamentos",
    parcelasTable: "parcelas",
  };

  it("o derivado diz o mesmo que a mão dizia — a troca não renomeou nada", () => {
    expect(NOMES_NO_BANCO).toEqual(CURADO_ATE_2026_08_13);
  });

  /**
   * O piso da S-D31 aplicado aos nomes: `undefined` ou string vazia monta
   * `\b\b`, que casa com qualquer coisa ou com nada — e nos dois casos a
   * peneira para de dizer a verdade sem ficar vermelha.
   */
  it("nenhuma tabela quente fica sem nome no banco", () => {
    for (const t of TABELAS_QUENTES) expect(NOMES_NO_BANCO[t]).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  /**
   * **A PONTE é a última coisa escrita à mão, e nada a pregava.** Trocar
   * `contratosTable: schema.orcamentosTable` em `TABELAS_DO_SCHEMA`
   * **TYPECHECKA** — as duas são `PgTable` —, e a partir dali as colunas de
   * estado E o nome no banco de `contratos` passam a ser os de `orcamentos`:
   * uma sonda medindo a tabela errada e verde. Enquanto o nome era escrito à
   * mão não havia contra o que conferir; com ele derivado a conferência sai de
   * graça, porque a CHAVE do mapa já diz o nome — sem o sufixo `Table` e em
   * snake_case, `bloqueioVestidosTable` é `bloqueio_vestidos`.
   *
   * A convenção vale para as cinco. A primeira tabela quente cujo nome no banco
   * não sair da chave fica vermelha aqui e vira exceção nomeada, do mesmo jeito
   * que `atrasoParcelaId` é exceção do critério das colunas.
   */
  it("e a ponte aponta para a tabela certa — a chave do mapa diz o nome do banco", () => {
    const pelaChave = (t: TabelaQuente) =>
      t.replace(/Table$/, "").replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    expect(NOMES_NO_BANCO).toEqual(
      Object.fromEntries(TABELAS_QUENTES.map((t) => [t, pelaChave(t)])),
    );
  });

  it("acha o UPDATE cru numa tabela quente — é este achado que ela nunca tinha feito", () => {
    const fonte = "await db.execute(sql`UPDATE contratos SET status = 'CANCELADO' WHERE id = ${id}`);";
    expect(sqlCruNoTexto("sintetico.ts", fonte)).toEqual([
      "sintetico.ts:1 [contratos] `UPDATE contratos SET status = 'CANCELADO' WHERE id = ${id}`",
    ]);
  });

  /**
   * S-C78 — os dois comportamentos que ninguém tinha escrito, pregados:
   * a caixa não importa (o Postgres normaliza identificador sem aspas para
   * minúsculo, então `Contratos` É `contratos` — recusar seria buraco, não
   * rigor), e o template que cita DUAS quentes é UM sítio com as duas
   * nomeadas — a forma antiga o listava duas vezes com o mesmo
   * `arquivo:linha`, e contar linhas da saída como sítios contaria errado.
   */
  it("S-C78: `UPDATE Contratos` casa — a leniência de caixa é deliberada e dita", () => {
    expect(sqlCruNoTexto("sintetico.ts", "await db.execute(sql`UPDATE Contratos SET x = 1`);")).toEqual([
      "sintetico.ts:1 [contratos] `UPDATE Contratos SET x = 1`",
    ]);
  });

  it("S-C78: o template que cita duas quentes é UM sítio, com as duas nomeadas", () => {
    const fonte = "await db.execute(sql`UPDATE contratos SET x = (SELECT count(*) FROM parcelas)`);";
    expect(sqlCruNoTexto("sintetico.ts", fonte)).toEqual([
      "sintetico.ts:1 [contratos, parcelas] `UPDATE contratos SET x = (SELECT count(*) FROM parcelas)`",
    ]);
  });

  /**
   * O SQL sintético é escrito com o nome LITERAL, não com `NOMES_NO_BANCO[t]` —
   * a diferença é a régua. Montar o texto com a mesma constante que configura a
   * peneira faria o caso passar com qualquer nome, inclusive um errado: a sonda
   * acharia o que ela mesma escreveu. Com o literal, um nome torto em qualquer
   * das cinco apaga a peneira daquela tabela E fica vermelho aqui.
   */
  it("acha as cinco quentes, uma a uma — nenhuma some da peneira", () => {
    for (const t of TABELAS_QUENTES) {
      const fonte = `await db.execute(sql\`DELETE FROM ${CURADO_ATE_2026_08_13[t]} WHERE id = 1\`);`;
      expect({ [t]: sqlCruNoTexto("sintetico.ts", fonte).length }).toEqual({ [t]: 1 });
    }
  });

  it("e deixa passar o que não é escrita, o que não é tabela quente e o que não é `sql`", () => {
    // Leitura não é porta.
    expect(sqlCruNoTexto("s.ts", "await db.execute(sql`SELECT * FROM contratos`);")).toEqual([]);
    // Tabela fria escrita em SQL cru não é assunto desta varredura.
    expect(sqlCruNoTexto("s.ts", "await db.execute(sql`UPDATE usuarios SET nome = 'a'`);")).toEqual([]);
    // Sem a tag `sql` é texto: mensagem de erro e comentário não disparam. É o
    // recorte que a AST dá, e sem ele a peneira acusaria a própria documentação.
    expect(sqlCruNoTexto("s.ts", "const m = `UPDATE contratos SET status = 'X'`;")).toEqual([]);
    // E o nome quente EMBUTIDO noutro identificador não casa — o `\b` da regex
    // é o que separa `contratos` de `contratos_itens`.
    expect(sqlCruNoTexto("s.ts", "await db.execute(sql`UPDATE contratos_itens SET x = 1`);")).toEqual([]);
  });
});

/**
 * S-C76 — `escritasComTabelaDinamica()` nunca tinha se visto achando nada.
 *
 * Desde o E171 ela devolvia `[]` sobre o repositório, e `[]` de sonda cega e
 * `[]` de repositório limpo são o MESMO valor: um refactor da AST que parasse
 * de reconhecer `db.update(tabelas[i])` deixava a régua verde, e a primeira
 * escrita dinâmica de verdade nasceria invisível. O par abaixo é o molde da
 * S-C180 — acha o plantado, ignora o que não é — sobre a versão por texto, que
 * é a mesma função que a varredura de população chama.
 */
describe("varredura — a peneira das escritas dinâmicas enxerga, e ignora o que não é", () => {
  it("acha a tabela atrás de expressão — é este achado que ela nunca tinha feito", () => {
    expect(
      escritasComTabelaDinamicaNoTexto("sintetico.ts", "await db.update(schema.contratosTable).set({ x }).where(w);"),
    ).toEqual(["sintetico.ts:1 db.update(schema.contratosTable)"]);
    expect(
      escritasComTabelaDinamicaNoTexto("sintetico.ts", "await tx.insert(tabelas[i]).values({});"),
    ).toEqual(["sintetico.ts:1 tx.insert(tabelas[i])"]);
  });

  it("e ignora o identificador simples, o receptor que não executa e o delete de Map", () => {
    // Identificador simples é assunto do enumerador de portas, não desta peneira.
    expect(
      escritasComTabelaDinamicaNoTexto("s.ts", "await db.update(contratosTable).set({ x }).where(w);"),
    ).toEqual([]);
    // Receptor fora de EXECUTORES não é caminho para o banco.
    expect(escritasComTabelaDinamicaNoTexto("s.ts", "consulta.update(montarSet(x));")).toEqual([]);
    // O `.delete(chave)` de um Map tem o mesmo verbo e nada a ver com escrita.
    expect(escritasComTabelaDinamicaNoTexto("s.ts", "mapa.delete(chaves[0]);")).toEqual([]);
  });
});

/**
 * S-C33 — a régua medindo a si mesma: `COLUNAS_DE_ESTADO` sai do SCHEMA.
 *
 * A constante era lista escrita à mão, e **coluna de estado nova nascia
 * invisível para a detecção de CAS**. O preço apareceu em dois épicos seguidos,
 * e nos dois a régua acusou código CERTO — a direção cara, porque manda
 * consertar o que não está quebrado:
 *
 * - **E212** — sem `contratos.atrasoParcelaId` na lista, a porta media ABERTA
 *   com o `where` da escrita repetindo exatamente a condição lida.
 * - **E213** — sem `parcelas.moraPerdoadaEm`, `contratos.ts` contava **3**
 *   portas sem disciplina onde há **1**: as DUAS portas do perdão apareciam
 *   abertas estando sob CAS de verdade.
 *
 * Os dois consertos foram POR COLUNA, o que não impede a terceira vez. O
 * critério que os substitui está declarado em `portas-de-escrita.ts` e tem duas
 * grafias — `status` enum, e `timestamp` ANULÁVEL terminado em `Em` —, mais uma
 * exceção nomeada para o que a grafia não pega.
 *
 * **A troca não mexeu em contagem nenhuma, e é o resultado.** Medido nas duas
 * pontas sobre a mesma base (`2dc9eec0`), com o enumerador antigo e o novo lado
 * a lado: **303 arquivos · 55 portas · 31 TRANCA · 11 CAS · 13 ABERTA**, e o
 * mapa por arquivo idêntico nos quatro nomes. O derivado enxergou **seis colunas
 * que a lista curada não tinha** — `bloqueio_vestidos.lavagemConcluidaEm`,
 * `contratos.comissaoEstornadaEm`, `orcamentos.publicoExpiraEm` e as três
 * `bloqueio_vestidos.*DataReal` — e **nenhuma porta de hoje as repete no `where`
 * nem as projeta na tranca**, então nenhuma porta mudou de disciplina. Não subiu
 * dívida escondida nem se perdoou porta: o que mudou não é o retrato, é que a
 * próxima coluna de estado nasce VISTA.
 *
 * **S-C56 — e uma das seis era PRAZO, não fato: saiu.** `publicoExpiraEm`
 * termina em `Em` e responde *"até quando"*, não *"já aconteceu"* — a linha
 * nasce com a data no futuro, e a presença dela não diz que ato nenhum
 * aconteceu. Mantê-la afrouxava na direção que autoriza: a escrita que pusesse
 * `publico_expira_em` no `where` sem ter lido o valor seria promovida a CAS de
 * graça. Os sufixos `ExpiraEm`/`VenceEm` saem do critério ANTES da grafia do
 * fato, e a contagem não se moveu com a exclusão — **60 portas · 36 TRANCA ·
 * 11 CAS · 13 ABERTA nas duas pontas**, porque nenhuma porta de hoje toca a
 * coluna. A exclusão é de grafia, não exceção nomeada: exceção sem defeito
 * medido é a lista curada nascendo pela outra ponta, e o que havia aqui era o
 * CRITÉRIO aceitando uma pergunta que ele não faz.
 *
 * **O quanto cada metade do critério pesa foi medido tirando-a.** Sem a grafia
 * do fato datado a dívida vai de 13 para **18** (`expected 18 to be 13`) e o CAS
 * cai de 11 para 6 (`expected 6 to be greater than or equal to 8`); sem a
 * exceção nomeada, `reservas.ts` vai de 4 para 5 e a dívida para **14**
 * (`expected 14 to be 13`). Nenhuma das duas é decoração.
 */
describe("varredura — as colunas de estado saem do schema, não da mão de quem leu", () => {
  /**
   * O que a lista curada dizia no dia em que foi aposentada (base `2dc9eec0`,
   * depois do E212 e do E213). É PISO, não igualdade: coluna nova entra de
   * graça — que é o épico inteiro —, e coluna que SUMISSE do derivado fica
   * vermelha aqui. A assimetria é a régua: sobrar aprova código certo, faltar
   * aprova porta aberta.
   */
  const CURADA_ATE_2026_08_13: Record<TabelaQuente, readonly string[]> = {
    contratosTable: ["status", "canceladoEm", "atrasoParcelaId"],
    reservasTable: ["status"],
    orcamentosTable: ["status", "aceitoEm", "aprovadoEm", "publicoAbertoEm"],
    bloqueioVestidosTable: ["canceladoEm"],
    parcelasTable: ["status", "recebidoEm", "conciliadoEm", "enviadoContabilidadeEm", "moraPerdoadaEm"],
  };

  it("o derivado contém tudo o que a lista curada sabia — nada se perdeu na troca", () => {
    for (const t of TABELAS_QUENTES) {
      const perdidas = CURADA_ATE_2026_08_13[t].filter((c) => !COLUNAS_DE_ESTADO[t].includes(c));
      expect({ [t]: perdidas }).toEqual({ [t]: [] });
    }
  });

  /**
   * O piso da S-D31 aplicado às colunas: conjunto vazio faria toda porta medir
   * ABERTA e a dívida explodir — e conjunto vazio em UMA tabela passaria
   * despercebido no total.
   */
  it("nenhuma tabela quente fica sem coluna de estado", () => {
    for (const t of TABELAS_QUENTES) expect(COLUNAS_DE_ESTADO[t].length).toBeGreaterThan(0);
    expect(COLUNAS_DE_ESTADO).toEqual(
      Object.fromEntries(TABELAS_QUENTES.map((t) => [t, colunasDeEstadoDe(t)])),
    );
  });

  /**
   * **Exceção que a grafia já pega é exceção MORTA**, e lista morta é o começo
   * da lista curada de novo. No dia em que `atrasoParcelaId` virar
   * `atrasoParceladoEm`, ou em que o critério abrir, esta linha fica vermelha e
   * cobra a baixa — do mesmo jeito que `SEM_DISCIPLINA` cobra a da dívida.
   */
  it("e toda exceção nomeada é necessária — nenhuma delas cabe na grafia", () => {
    const mortas: string[] = [];
    for (const t of TABELAS_QUENTES) {
      const pelaGrafia = colunasDeEstadoDe(t).filter((c) => !excecoesDe(t).includes(c));
      for (const e of excecoesDe(t)) if (pelaGrafia.includes(e)) mortas.push(`${t}.${e}`);
    }
    expect(mortas).toEqual([]);
    // Uma só hoje: o vínculo que responde "este atraso já virou parcela?".
    expect(TABELAS_QUENTES.flatMap((t) => excecoesDe(t).map((c) => `${t}.${c}`))).toEqual([
      "contratosTable.atrasoParcelaId",
    ]);
  });

  /**
   * O autoteste do CRITÉRIO, com colunas sintéticas — o mesmo motivo do
   * autoteste do enumerador: ele nasce verde sobre o schema de hoje. Cada par
   * abaixo é uma peneira do critério isolada, e a coluna recusada está ao lado
   * da aceita para que a diferença seja legível.
   */
  it("aceita as duas grafias do estado, e recusa o que se parece com elas", () => {
    const ts = (notNull: boolean) => ({ columnType: "PgTimestamp", notNull });
    // 1. `status` enum — o estágio nomeado.
    expect(ehColunaDeEstado("status", { columnType: "PgEnumColumn", notNull: true })).toBe(true);
    // 2. O fato datado: timestamp ANULÁVEL cujo nome diz que o ato aconteceu. É
    //    esta grafia que teria pego `moraPerdoadaEm` no E213 sem ninguém
    //    escrever uma linha.
    expect(ehColunaDeEstado("moraPerdoadaEm", ts(false))).toBe(true);
    expect(ehColunaDeEstado("devolvidoEm", ts(false))).toBe(true);
    // A segunda soletração do mesmo fato — o `real` que separa o que ACONTECEU
    // do previsto, e é sobre ele que a cláusula 16ª decide se a peça voltou.
    expect(ehColunaDeEstado("devolucaoDataReal", ts(false))).toBe(true);
    // Mas a data PREVISTA não é fato: ela diz o combinado, não o ocorrido.
    expect(ehColunaDeEstado("devolucaoDataPrevista", ts(false))).toBe(false);
    // `fechadoEm` é `notNull` com default: nasce preenchida e nunca responde "já?".
    expect(ehColunaDeEstado("fechadoEm", ts(true))).toBe(false);
    // `createdAt`/`updatedAt` caem pelas duas peneiras — sufixo `At` e `notNull`.
    expect(ehColunaDeEstado("updatedAt", ts(true))).toBe(false);
    // Data de NEGÓCIO com sufixo parecido não é fato: `validade` é prazo, e
    // `publicoToken` é texto.
    expect(ehColunaDeEstado("validade", ts(false))).toBe(false);
    expect(ehColunaDeEstado("publicoToken", { columnType: "PgText", notNull: false })).toBe(false);
    // S-C56 — o PRAZO escrito na grafia do fato: `publicoExpiraEm` termina em
    // `Em`, é timestamp anulável, e responde "até quando" — fora. As duas
    // soletrações de prazo do vocabulário caem, e o fato PASSADO do mesmo
    // radical continua dentro: `expiradaEm` diz "já expirou".
    expect(ehColunaDeEstado("publicoExpiraEm", ts(false))).toBe(false);
    expect(ehColunaDeEstado("carneVenceEm", ts(false))).toBe(false);
    expect(ehColunaDeEstado("expiradaEm", ts(false))).toBe(true);
    // O enum que CLASSIFICA não é o enum que decide estágio: `parcelas.origem` e
    // `bloqueio_vestidos.tipo` nascem com a linha e não mudam.
    expect(ehColunaDeEstado("origem", { columnType: "PgEnumColumn", notNull: true })).toBe(false);
    expect(ehColunaDeEstado("tipo", { columnType: "PgEnumColumn", notNull: true })).toBe(false);
    // E o vínculo de PARENTESCO fica de fora da grafia de propósito — é ele que
    // obriga `atrasoParcelaId` a ser exceção nomeada em vez de regra aberta.
    expect(ehColunaDeEstado("orcamentoId", { columnType: "PgText", notNull: false })).toBe(false);
  });

  /**
   * **CONFIGURAÇÃO não é estado**, e a diferença é a pergunta que a coluna
   * responde: a regra diz *como a loja funciona*, e continua a mesma depois da
   * corrida que o CAS existe para arbitrar. As quatro que o E222 acrescentou a
   * `regra_disponibilidade` são o caso vivo — e o critério as recusa pelas duas
   * peneiras ao mesmo tempo (tipo errado e `notNull`), o que é o que se quer de
   * uma régua: recusar por mais de um motivo, não por sorte de nome.
   */
  it("e a REGRA da loja não é estado — as quatro colunas do E222 ficam de fora", () => {
    const inteiro = { columnType: "PgInteger", notNull: true };
    expect(ehColunaDeEstado("retiradaAberturaMinutos", inteiro)).toBe(false);
    expect(ehColunaDeEstado("retiradaFechamentoMinutos", inteiro)).toBe(false);
    expect(ehColunaDeEstado("retiradaFechamentoSabadoMinutos", inteiro)).toBe(false);
    expect(ehColunaDeEstado("retiradaDias", { columnType: "PgJsonb", notNull: true })).toBe(false);
  });
});

describe("varredura — o enumerador reconhece a porta certa e a errada", () => {
  /**
   * O autoteste da régua, com fonte sintética. Ele existe porque a varredura de
   * verdade nasce VERDE — e uma varredura que nunca se viu vermelha é
   * decoração. Cada caso abaixo é uma metade da disciplina removida, e a régua
   * tem de sentir a falta de cada uma isoladamente.
   */
  const trancaCompleta = `
    import { contratosTable } from "@workspace/db";
    await db.transaction(async (tx) => {
      const [sob] = await tx.select({ status: contratosTable.status }).from(contratosTable)
        .where(eq(contratosTable.id, id)).for("update");
      if (sob.status !== "ATIVO") return;
      await tx.update(contratosTable).set({ cpf }).where(eq(contratosTable.id, id));
    });`;

  it("aprova transação + FOR UPDATE no alvo + releitura da guarda", () => {
    const [p] = portasNoTexto("sintetico.ts", trancaCompleta);
    expect(p!.disciplina).toBe("TRANCA");
    expect(p!.releituraDaGuarda).toBe("tranca lê contratosTable.status");
  });

  it("reprova a porta 15: escrita solta, sem transação e sem CAS", () => {
    const fonte = `
      import { contratosTable } from "@workspace/db";
      const atual = await db.query.contratosTable.findFirst({ where: eq(contratosTable.id, id) });
      if (atual.status !== "ATIVO") return;
      await db.update(contratosTable).set({ cpf }).where(eq(contratosTable.id, id));`;
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.disciplina).toBe("ABERTA");
  });

  it("reprova a transação SEM FOR UPDATE — transação sozinha não serializa", () => {
    const fonte = trancaCompleta.replace(`.for("update")`, "");
    expect(portasNoTexto("sintetico.ts", fonte)[0]!.disciplina).toBe("ABERTA");
  });

  it("reprova o FOR UPDATE que tranca linha alheia à cadeia declarada", () => {
    const fonte = `
      import { contratosTable, parcelasTable } from "@workspace/db";
      await db.transaction(async (tx) => {
        const [sob] = await tx.select({ status: contratosTable.status }).from(parcelasTable)
          .where(eq(parcelasTable.id, id)).for("update");
        if (sob.status !== "ATIVO") return;
        await tx.update(contratosTable).set({ cpf }).where(eq(contratosTable.id, id));
      });`;
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.trancadas).toEqual(["parcelasTable"]);
    expect(p!.trancaNoAlvoOuPai).toBe(false);
    expect(p!.disciplina).toBe("ABERTA");
  });

  it("reprova a tranca que NÃO relê a guarda — trancar sem reperguntar não decide nada", () => {
    const fonte = trancaCompleta.replace("{ status: contratosTable.status }", "{ id: contratosTable.id }");
    expect(portasNoTexto("sintetico.ts", fonte)[0]!.disciplina).toBe("ABERTA");
  });

  it("aprova o CAS sem transação — o where da escrita repete a condição lida", () => {
    const fonte = `
      import { contratosTable } from "@workspace/db";
      await db.update(contratosTable).set({ cpf })
        .where(and(eq(contratosTable.id, id), eq(contratosTable.status, "ATIVO"))).returning();`;
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.disciplina).toBe("CAS");
    expect(p!.casNoWhere).toEqual(["status"]);
  });

  /**
   * S-C56 — o PRAZO no `where` não é CAS. Antes da exclusão, esta porta media
   * `CAS cas=[publicoExpiraEm]`: repetir o prazo do link público no `where` —
   * que a rota faz para recusar link vencido, sem ter "lido" estado nenhum —
   * ganhava disciplina de graça. O prazo não arbitra corrida: ele não muda
   * embaixo de quem leu, ele apenas passa.
   */
  it("reprova a escrita que só repete o PRAZO no where — prazo não é a condição lida", () => {
    const fonte = `
      import { orcamentosTable } from "@workspace/db";
      await db.update(orcamentosTable).set({ publicoToken: novo })
        .where(and(eq(orcamentosTable.id, id), gt(orcamentosTable.publicoExpiraEm, agora)));`;
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.casNoWhere).toEqual([]);
    expect(p!.disciplina).toBe("ABERTA");
  });

  it("enxerga a tabela importada sob apelido — o buraco clássico da busca por nome", () => {
    const fonte = `
      import { contratosTable as ct } from "@workspace/db";
      await db.update(ct).set({ cpf }).where(eq(ct.id, id));`;
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.tabela).toBe("contratosTable");
    expect(p!.disciplina).toBe("ABERTA");
  });

  it("não confunde o `db` de dentro da transação com o `tx` dela", () => {
    const fonte = trancaCompleta.replace("await tx.update(contratosTable)", "await db.update(contratosTable)");
    const [p] = portasNoTexto("sintetico.ts", fonte);
    expect(p!.executor).toBe("db");
    expect(p!.disciplina).toBe("ABERTA");
  });
});

describe("varredura — toda porta de escrita tem disciplina", () => {
  const abertas = portas.filter((p) => p.disciplina === "ABERTA");

  it("nenhuma porta escreve sem tranca nem CAS fora da dívida declarada", () => {
    const naoDeclaradas = abertas
      .filter((p) => !(p.arquivo in SEM_DISCIPLINA))
      .map((p) => `${sitio(p)} — executor=${p.executor}, trancou=[${p.trancadas.join(", ")}]`);
    expect(naoDeclaradas).toEqual([]);
  });

  /**
   * A CONTAGEM, não a lista. Fechou uma porta? A conta cai, o teste fica
   * vermelho, e o vermelho é o lembrete de baixar a dívida aqui (regra 31).
   */
  it("e a dívida não cresce às escondidas — a contagem por arquivo é o número", () => {
    const hoje: Record<string, number> = {};
    for (const p of abertas) hoje[p.arquivo] = (hoje[p.arquivo] ?? 0) + 1;
    expect(hoje).toEqual(SEM_DISCIPLINA);
  });

  it("o total da dívida é 13 — 6 de nascimento/serialização implícita e 7 do gerador da demo", () => {
    expect(abertas.length).toBe(TOTAL_SEM_DISCIPLINA);
    expect(Object.values(SEM_DISCIPLINA).reduce((s, n) => s + n, 0)).toBe(TOTAL_SEM_DISCIPLINA);
  });

  /**
   * O outro lado da conta: as portas COM disciplina também são contadas. Sem
   * isto, um refactor que apagasse metade das trancas deixaria a dívida em 13 e
   * a suíte verde — a varredura estaria contando o que sobrou, não o que há.
   *
   * **A conta é comparada como OBJETO, e é a S-C46 acontecendo** (§ RETRATO).
   * Eram dois `>=` separados, e `expected 33 to be greater than or equal to 32`
   * passava verde sobre a porta 33ª: o piso protege a régua de encolher e não
   * cobra remedida nenhuma quando ela cresce. Com o objeto inteiro travado, o
   * diff diz qual das três disciplinas se mexeu — e a porta nova custa um
   * número e o parágrafo que o explica, que é o mesmo preço que
   * `SEM_DISCIPLINA` cobra desde o E171.
   *
   * O histórico das três, para quem for mexer no número:
   *
   * - TRANCA era 28 até o E191, que fechou as três de `comissao.ts` (S-O79);
   * - **S-C11 — 31 → 32 sob tranca**, o `UPDATE parcelas SET valor_previsto` do
   *   `PATCH /avarias/:id`, que faz a cobrança viva seguir o valor corrigido:
   *   `TRANCA trancou=[avariasTable,parcelasTable] releitura=tranca lê
   *   parcelasTable.status cas=[recebidoEm]`;
   * - **8 → 11 por CAS** é drift ANTERIOR, medido pela S-C11 e não causado por
   *   ela: os pisos eram `>=` e ninguém os subiu depois do E212 e do E213.
   */
  it("e o censo das disciplinas é o retrato — 36 TRANCA · 11 CAS · 13 ABERTA", () => {
    const conta = { TRANCA: 0, CAS: 0, ABERTA: 0 };
    for (const p of portas) conta[p.disciplina] += 1;
    expect(conta).toEqual(RETRATO);
  });
});

/**
 * E180 / S-O33 — a ORDEM das trancas, que é a metade que o E171 não contava.
 *
 * O ponto cego 4 do E171 estava escrito com a frase certa: *"uma porta nova que
 * tranque na ordem inversa passa verde e trava a produção"*. Ele ficou de fora
 * por honestidade — *"a ordem correta depende de qual linha cada `FOR UPDATE`
 * segura, e a AST só vê a tabela"* —, e a frase confunde as duas metades do
 * problema:
 *
 * - **ENTRE tabelas**, a AST vê tudo o que é preciso ver. Qual TABELA cada
 *   tranca segura sai do `.from(X)` da própria cadeia, e é a ordem das tabelas
 *   que as duas cadeias declaram em prosa (`contratos.ts:643`,
 *   `reservas.ts:63`). Isto fecha inteiro.
 * - **DENTRO da tabela**, a AST não vê a linha — e não precisa: o que ordena os
 *   bloqueios entre si é a coleção do laço estar `.sort()`ada, e isso é léxico.
 *
 * O deadlock que estas contas existem para impedir tem número: o E143 achou o
 * **40P01 fora do mapa de erros** (S20), e um ciclo entre duas rotas derruba uma
 * delas com 500 na cara de quem vende.
 */
describe("varredura — as trancas sobem a cadeia, e nunca descem", () => {
  /**
   * S-O59/E186 — os números subiram para **28 transações e 38 trancas**, contra
   * as 25 e 31 do E180, porque a conta passou a seguir o executor para dentro
   * dos helpers do módulo. As sete que apareceram são as mesmas duas funções
   * vistas de cada chamador — `trancarContratos` (3×) e `trancarEixos`
   * (2× cabine + 2× vendedora).
   *
   * **E hoje são 29 e 40, o que esta linha dizia errado desde a S-C11
   * (`9fa70a5`).** Os pisos eram `>= 20` e `>= 25`, quinze e treze abaixo do
   * real: eles nunca teriam sentido a transação que nasceu no mesmo dia, e não
   * sentiram. O `PATCH /avarias/:id` tranca a avaria (degrau 3) e depois a
   * parcela (degrau 6) — **+1 transação, +2 trancas**, medido no diff daquele
   * commit sobre as quatro pastas varridas. É o caso vivo da S-C46: *piso não
   * obriga a remedir, e a prosa envelhece calada.*
   */
  it("olha para as transações de verdade — 30 transações trancam, e são 42 trancas", () => {
    const porTransacao = trancasPorTransacao();
    expect({
      transacoes: porTransacao.size,
      trancas: [...porTransacao.values()].reduce((s, t) => s + t.length, 0),
    }).toEqual(RETRATO_DA_ORDEM);
  });

  /**
   * O piso do que o E186 abriu: sem trancas via helper, a conta voltou a ser a
   * do E180 e as três contas abaixo passam a aprovar o que não leram.
   */
  it("e sete delas são alcançadas SEGUINDO o executor para dentro do helper", () => {
    const viaHelper = [...trancasPorTransacao().values()].flat().filter((t) => t.viaHelper !== null);
    expect(viaHelper).toHaveLength(7);
    expect([...new Set(viaHelper.map((t) => t.viaHelper))].sort()).toEqual(["trancarContratos", "trancarEixos"]);
  });

  it("nenhuma transação tranca uma tabela DEPOIS de outra mais funda na cadeia", () => {
    expect(trancasForaDeOrdem()).toEqual([]);
  });

  /**
   * As trancas sobre tabela sem degrau declarado. Não são erro — são decisão
   * adiada, e a contagem trava pelo mesmo motivo que a da dívida: uma tabela sem
   * degrau não pode ser ordenada contra as outras, e a primeira transação que a
   * trancar JUNTO de uma tabela da cadeia abre um ciclo que ninguém conferiu.
   *
   * **Eram 5 e viraram 2 no E186, e o caminho é o achado.** O E180 previu que
   * `contas_pagar` precisaria de degrau *"no dia em que a S-O32 fechar"* — e a
   * S-O32 fechou no E176, três épicos antes desta linha ser lida de novo. Seguir
   * o executor (S-O59) tornou o encontro visível e trouxe **duas tabelas que a
   * previsão não citava**: `cabines` e `usuarios`, que `trancarEixos` toma antes
   * de a transação da prova seguir para bloqueio e vestido. As três ganharam
   * degrau; sobram `admin.ts:177` (loja) e `agenda.ts:1156` (ajuste), cada uma
   * sozinha na sua transação.
   */
  it("e as trancas sobre tabela fora da cadeia são 2 — cada uma sozinha na sua transação", () => {
    expect(trancasSemDegrauDeclarado()).toHaveLength(2);
    const acompanhadas = [...trancasPorTransacao().values()]
      .filter((t) => t.some((x) => x.degrau === null) && t.length > 1)
      .map((t) => t.map((x) => `${x.arquivo}:${x.linha} ${x.tabela}`));
    expect(acompanhadas).toEqual([]);
  });

  /**
   * A metade "ORDENADOS por id". Três laços estão escritos dentro da própria
   * transação e percorrem coleção ordenada: `contratos.ts:701` (bloqueios do
   * contrato), `reservas.ts:312` (bloqueios da reserva) e `reservas.ts:408`
   * (vestidos vinculados).
   *
   * **A S-O59 dizia "3 contados e 4 existentes", e são 6.** O quarto laço é o de
   * `trancarContratos` (`comissao.ts:230`), e ele é UM escrito e TRÊS tomados —
   * uma vez por chamador. Contar por chamada é o que a conta precisa fazer: o
   * deadlock não acontece na função, acontece na transação que a chama.
   */
  it("toda tranca dentro de laço percorre coleção ORDENADA", () => {
    expect(trancasEmLacoNaoOrdenado()).toEqual([]);
    const emLaco = [...trancasPorTransacao().values()].flat().filter((t) => t.laco !== null);
    expect(emLaco).toHaveLength(6);
  });
});

describe("varredura — o enumerador da ordem reconhece a inversão e o laço solto", () => {
  /**
   * O autoteste da conta nova, pelo mesmo motivo do autoteste do enumerador de
   * portas: ela nasce VERDE sobre o repositório, e régua que nunca se viu
   * vermelha é decoração.
   */
  const naOrdem = `
    import { leadsTable, bloqueioVestidosTable } from "@workspace/db";
    await db.transaction(async (tx) => {
      await tx.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, id)).for("update");
      for (const b of [...ids].sort()) {
        await tx.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
          .where(eq(bloqueioVestidosTable.id, b)).for("update");
      }
    });`;

  it("aprova lead → bloqueios, que é a cadeia declarada", () => {
    const trancas = [...trancasNoTexto("sintetico.ts", naOrdem).values()].flat();
    expect(trancas.map((t) => t.tabela)).toEqual(["leadsTable", "bloqueioVestidosTable"]);
    expect(trancas.map((t) => t.degrau)).toEqual([degrauDaTranca("leadsTable"), degrauDaTranca("bloqueioVestidosTable")]);
    expect(trancas[1]!.lacoOrdenado).toBe(true);
    expect(trancas.map((t) => t.viaHelper)).toEqual([null, null]);
  });

  /**
   * S-O59/E186 — o autoteste do que o épico abriu, nas duas metades que
   * importam: a tranca de dentro do helper CONTA, e ela conta **na posição da
   * chamada**, não na linha em que o helper foi escrito.
   *
   * O segundo é o que quase passou batido: `trancarBloqueios` está declarado no
   * topo do arquivo, muito ANTES da transação, e ordenar as trancas por número
   * de linha o poria na frente do lead — inventando uma inversão que não
   * existe. Foi o que a primeira versão desta conta fez.
   */
  const viaHelper = `
    import { leadsTable, bloqueioVestidosTable } from "@workspace/db";
    async function trancarBloqueios(tx, ids) {
      for (const b of [...ids].sort()) {
        await tx.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
          .where(eq(bloqueioVestidosTable.id, b)).for("update");
      }
    }
    await db.transaction(async (tx) => {
      await tx.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, id)).for("update");
      await trancarBloqueios(tx, ids);
    });`;

  it("segue o executor para dentro do helper — a tranca de lá conta aqui", () => {
    const trancas = [...trancasNoTexto("sintetico.ts", viaHelper).values()].flat();
    expect(trancas.map((t) => t.tabela)).toEqual(["leadsTable", "bloqueioVestidosTable"]);
    expect(trancas.map((t) => t.viaHelper)).toEqual([null, "trancarBloqueios"]);
    // O laço mora no helper, e a régua do `.sort()` o alcança igual.
    expect(trancas[1]!.lacoOrdenado).toBe(true);
  });

  it("e a ORDEM é a da chamada, não a da linha em que o helper foi escrito", () => {
    const trancas = [...trancasNoTexto("sintetico.ts", viaHelper).values()].flat();
    // O helper está declarado ANTES da transação — por linha, ele viria primeiro.
    expect(trancas[1]!.linha).toBeLessThan(trancas[0]!.linha);
    // E mesmo assim a ordem lida é lead → bloqueio, que é a cadeia declarada.
    expect(trancas.map((t) => t.degrau)).toEqual([degrauDaTranca("leadsTable"), degrauDaTranca("bloqueioVestidosTable")]);
  });

  it("não segue o helper que NÃO recebe o executor da transação", () => {
    const solto = viaHelper.replace("await trancarBloqueios(tx, ids);", "await trancarBloqueios(db, ids);");
    const trancas = [...trancasNoTexto("sintetico.ts", solto).values()].flat();
    expect(trancas.map((t) => t.tabela)).toEqual(["leadsTable"]);
  });

  it("reprova a inversão — o bloqueio trancado ANTES do lead é o ciclo", () => {
    const invertido = `
      import { leadsTable, bloqueioVestidosTable } from "@workspace/db";
      await db.transaction(async (tx) => {
        await tx.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
          .where(eq(bloqueioVestidosTable.id, b)).for("update");
        await tx.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, id)).for("update");
      });`;
    const trancas = [...trancasNoTexto("sintetico.ts", invertido).values()].flat();
    expect(trancas.map((t) => t.degrau)).toEqual([degrauDaTranca("bloqueioVestidosTable"), degrauDaTranca("leadsTable")]);
    expect(trancas[0]!.degrau!).toBeGreaterThan(trancas[1]!.degrau!);
  });

  it("reprova o laço sobre coleção solta — o `.sort()` é o que ordena as LINHAS", () => {
    const trancas = [...trancasNoTexto("sintetico.ts", naOrdem.replace("[...ids].sort()", "ids")).values()].flat();
    expect(trancas[1]!.laco).toBe("ids");
    expect(trancas[1]!.lacoOrdenado).toBe(false);
  });

  it("não confunde a tranca do `db` com a do `tx` — só a da transação conta", () => {
    const fora = naOrdem.replace("await tx.select({ id: leadsTable.id })", "await db.select({ id: leadsTable.id })");
    const trancas = [...trancasNoTexto("sintetico.ts", fora).values()].flat();
    expect(trancas.map((t) => t.tabela)).toEqual(["bloqueioVestidosTable"]);
  });
});
