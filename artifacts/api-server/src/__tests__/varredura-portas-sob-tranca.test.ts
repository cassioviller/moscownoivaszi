import { describe, expect, it } from "vitest";
import {
  arquivosVarridos,
  degrauDaTranca,
  enumerarPortas,
  escritasComTabelaDinamica,
  portasNoTexto,
  sqlCruEscrevendoEmTabelaQuente,
  trancasEmLacoNaoOrdenado,
  trancasForaDeOrdem,
  trancasNoTexto,
  trancasPorTransacao,
  trancasSemDegrauDeclarado,
  type Porta,
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
 * `PAIS`, uma em `COLUNAS_DE_ESTADO` e uma em `NOMES_NO_BANCO` — e trouxe **15
 * portas de uma vez**, das quais **14 já tinham disciplina** (11 sob tranca, 3
 * por CAS). A décima quinta é o gerador da demonstração, que já estava perdoado
 * pelo mesmo motivo que as outras seis dele.
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
 *    string não tem AST por dentro) e hoje dá zero.
 * 6. **Ela não olha o frontend de verdade.** `moscow-noivas/src` entra na
 *    população para que um `contratosTable` que apareça lá seja visto, mas
 *    escrita de tela passa por HTTP, não por tabela.
 */

const portas = enumerarPortas();
const sitio = (p: Porta): string => `${p.arquivo}:${p.linha} ${p.verbo}(${p.tabela})`;

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
   * em dois épicos seguidos.
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
   */
  "artifacts/api-server/src/routes/reservas.ts": 4,
  // Era 6; a sétima é o carnê (`:525`), que só ficou visível quando `parcelas`
  // virou tabela quente no E180. Mesma família das outras seis, mesmo veredito.
  "scripts/loja-de-demonstracao.ts": 7,
};
const TOTAL_SEM_DISCIPLINA = 13;

describe("varredura — a enumeração das portas de escrita", () => {
  /**
   * O piso. Conjunto vazio aprova tudo em silêncio, que é a falha mais cara
   * possível numa sonda: verde por não ter olhado.
   *
   * Medido em 2026-08-11: **266 arquivos-fonte versionados** nas quatro pastas e
   * **26 portas**. Os pisos ficam abaixo com folga para o repositório respirar —
   * o que eles impedem é um refactor cegar a varredura e ela seguir verde.
   */
  it("olha para os arquivos versionados, e não para um conjunto vazio", () => {
    expect(arquivosVarridos().length).toBeGreaterThan(200);
  });

  it("acha as portas — o piso é 22, e hoje são 48", () => {
    expect(portas.length).toBeGreaterThanOrEqual(22);
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
   * isto, um refactor que apagasse metade das trancas deixaria a dívida em 12 e
   * a suíte verde — a varredura estaria contando o que sobrou, não o que há.
   */
  it("e as portas com disciplina são 39 — 31 sob tranca e 8 por CAS", () => {
    const conta = { TRANCA: 0, CAS: 0, ABERTA: 0 };
    for (const p of portas) conta[p.disciplina] += 1;
    // Eram 28 até o E191, que fechou as três de `comissao.ts` (S-O79).
    expect(conta.TRANCA).toBeGreaterThanOrEqual(31);
    expect(conta.CAS).toBeGreaterThanOrEqual(8);
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
   * S-O59/E186 — os números subiram porque a conta passou a seguir o executor
   * para dentro dos helpers do módulo: **28 transações e 38 trancas**, contra as
   * 25 e 31 do E180. As sete que apareceram são as mesmas duas funções vistas de
   * cada chamador — `trancarContratos` (3×) e `trancarEixos` (2× cabine + 2×
   * vendedora).
   */
  it("olha para as transações de verdade — 28 transações trancam, e são 38 trancas", () => {
    const porTransacao = trancasPorTransacao();
    expect(porTransacao.size).toBeGreaterThanOrEqual(20);
    expect([...porTransacao.values()].reduce((s, t) => s + t.length, 0)).toBeGreaterThanOrEqual(25);
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
