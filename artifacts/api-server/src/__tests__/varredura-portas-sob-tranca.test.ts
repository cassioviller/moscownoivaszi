import { describe, expect, it } from "vitest";
import {
  arquivosVarridos,
  enumerarPortas,
  escritasComTabelaDinamica,
  portasNoTexto,
  sqlCruEscrevendoEmTabelaQuente,
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
 * 2. **Ela não entra no helper.** `verificarDisponibilidade({ executor: tx })`
 *    conta como releitura da guarda porque recebe o executor da transação — mas
 *    a varredura não confere o que ele pergunta lá dentro.
 * 3. **Ela não sabe se a linha trancada é A linha.** `PAIS` diz que trancar o
 *    lead serve para escrever no contrato; não diz que é o lead CERTO. Trancar
 *    outro lead passaria.
 * 4. **Ela conta a tranca, não a ordem.** A ordem `lead → contrato → parcelas →
 *    bloqueios → vestidos` que evita deadlock está escrita em
 *    `contratos.ts:586-594` e `reservas.ts:62-71` e **não é conferida aqui**.
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
 * ### `comissao.ts` — 3 portas (S-O41, 🟡)
 *
 * As três escrevem `contratos.comissao_estornada_em`, e nenhuma tranca a linha
 * do contrato:
 * - `:1035` (reabrir fechamento) zera a marca de reconciliação. A transação
 *   tranca a CONTA A PAGAR (`:1011-1016`, S-M22) — não o contrato.
 * - `:1301` (fechar competência) carimba a marca. Sem tranca nenhuma.
 * - `:1407` (baixar estorno à mão) carimba a marca e o motivo. Sem tranca.
 *
 * Reabrir e fechar no mesmo segundo decidem a mesma coluna em ordens
 * diferentes: o estorno de uma venda cancelada volta a PENDENTE e é recarimbado
 * como reconciliado sem ter sido abatido, ou o contrário. É a mesma família das
 * Faixas A/B, na única tabela quente que os quatro épicos não abriram.
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
 */
const SEM_DISCIPLINA: Record<string, number> = {
  "artifacts/api-server/src/routes/comissao.ts": 3,
  // Era 2; a S-O31 (`POST /link`) fechou e a contagem caiu — o vermelho desta
  // linha foi o que cobrou a baixa. Resta o nascimento de `POST /orcamentos`.
  "artifacts/api-server/src/routes/orcamentos.ts": 1,
  "artifacts/api-server/src/routes/reservas.ts": 1,
};
const TOTAL_SEM_DISCIPLINA = 5;

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

  it("acha as portas — o piso é 22, e hoje são 26", () => {
    expect(portas.length).toBeGreaterThanOrEqual(22);
  });

  it("as quatro tabelas quentes têm porta — nenhuma some da conta", () => {
    const porTabela = new Set(portas.map((p) => p.tabela));
    expect([...porTabela].sort()).toEqual([
      "bloqueioVestidosTable",
      "contratosTable",
      "orcamentosTable",
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

  it("o total da dívida é 6 — 4 portas de verdade e 2 nascimentos julgados", () => {
    expect(abertas.length).toBe(TOTAL_SEM_DISCIPLINA);
    expect(Object.values(SEM_DISCIPLINA).reduce((s, n) => s + n, 0)).toBe(TOTAL_SEM_DISCIPLINA);
  });

  /**
   * O outro lado da conta: as portas COM disciplina também são contadas. Sem
   * isto, um refactor que apagasse metade das trancas deixaria a dívida em 6 e
   * a suíte verde — a varredura estaria contando o que sobrou, não o que há.
   */
  it("e as portas com disciplina são 20 — 16 sob tranca e 4 por CAS", () => {
    const conta = { TRANCA: 0, CAS: 0, ABERTA: 0 };
    for (const p of portas) conta[p.disciplina] += 1;
    expect(conta.TRANCA).toBeGreaterThanOrEqual(16);
    expect(conta.CAS).toBeGreaterThanOrEqual(4);
  });
});
