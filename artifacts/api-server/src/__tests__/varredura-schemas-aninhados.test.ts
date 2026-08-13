import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cruzar, lerRotas, lerSpec, SPEC, versionado } from "./schemas-aninhados";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E192/S-O76 — **a varredura que responde "quem serializa este schema
 * aninhado?"**
 *
 * Ela não conserta nada: **conta, julga e trava a contagem**, na forma da
 * `varredura-portas-sob-tranca` (E171) e da `varredura-restricoes-do-spec`
 * (E177). O motor está em `schemas-aninhados.ts`, com os pontos cegos
 * declarados no topo.
 *
 * O que ela cruza (regra 22): as **operações do spec**, resolvendo `$ref`
 * TRANSITIVO, contra o **`with` da consulta relacional** que monta a resposta.
 * A conta que ela devolve tinha sido feita à mão três vezes, e as três saíram
 * erradas — E167 (5, não 2), E179 (10, não 11) e E185 (a S-O75).
 *
 * **Medido em 2026-08-12, depois do conserto da S-O75:**
 *
 * > 200 operações · 143 com schema de resposta · 70 com relação declarada ·
 * > 254 pares (operação, caminho) na fronteira · 165 entregues · 89 não.
 *
 * (Medida de novo no E199, quando o motor passou a seguir a chamada para fora
 * do handler: 252 → 254 pares e 147 → 165 entregues, sem uma linha de porta
 * mudar. Um sexto do "não entrega" era o motor não olhando.)
 *
 * Os 89 não são 89 defeitos, e é isso que as duas tabelas abaixo separam:
 * schema é COMPARTILHADO, e a mesma `Lead` viaja em 27 respostas prometendo um
 * `interesse` que só as portas de noiva carregam. O que a varredura torna
 * contável é a diferença entre **"esta porta entrega menos que a irmã"** e
 * **"ninguém entrega isto em porta nenhuma"**.
 */

describe("varredura — quem serializa o schema aninhado (S-O76)", () => {
  const c = cruzar();

  /**
   * O piso. Conjunto vazio aprova tudo em silêncio, que é a falha mais cara de
   * uma sonda — verde por não ter olhado.
   */
  it("olha para o spec inteiro e para o roteador inteiro", () => {
    const spec = versionado(SPEC);
    expect(spec.length).toBeGreaterThan(100_000);
    const { schemas, operacoes } = lerSpec(spec);
    expect(schemas.size, "o spec tem mais de cem schemas").toBeGreaterThanOrEqual(100);
    expect(operacoes.length, "e mais de cento e cinquenta operações").toBeGreaterThanOrEqual(150);
    expect(c.pares.length, "e a fronteira não é vazia").toBeGreaterThanOrEqual(150);
  });

  /**
   * **Toda operação do spec tem porta no roteador.** É a régua que cai fora do
   * assunto do épico e nasce de graça do cruzamento: o spec é a fonte da
   * verdade, e uma operação que ninguém registrou é contrato que o cliente
   * gerado promete e o servidor responde 404.
   */
  it("toda operação com relação declarada casa com um `router.<metodo>` do api-server", () => {
    expect(
      c.semHandler,
      "operação do spec sem porta no roteador — o cliente gerado a chama e o servidor devolve 404",
    ).toEqual([]);
  });

  /**
   * **O retrato, travado.** O número não é meta: ele SOBE quando alguém
   * acrescenta um objeto aninhado a um schema de resposta, e é aí que a régua
   * serve — obriga a perguntar quem vai preenchê-lo.
   */
  it("200 operações · 143 com schema de resposta · 70 com relação · 254 pares na fronteira", () => {
    expect(c.operacoes, "operação nova no spec: confira quem monta a resposta dela e atualize esta contagem").toBe(200);
    expect(c.comSchemaDeResposta).toBe(143);
    expect(c.comRelacao).toBe(70);
    // E194: 250 → 252. A fronteira CRESCE quando um pai passa a ser entregue —
    // o `PATCH /contratos` deixou de responder a linha crua, então `lead`,
    // `vendedora`, `itens` e `parcelas` chegaram, e os filhos DELES entraram na
    // conta. Régua que só desce estaria medindo outra coisa.
    // E199/S-O114: 252 → 254. O motor passou a SEGUIR a chamada para fora do
    // handler, então dois pais que eram montados por helper passaram a chegar e
    // os filhos deles entraram na fronteira.
    expect(c.pares.length, "a fronteira mudou — um objeto aninhado nasceu, ou um pai passou a ser entregue").toBe(254);
    /**
     * **E199/S-O114 — 147 → 165 entregues, e é o maior salto que esta conta já
     * deu.** Não entrou uma linha de porta: o motor deixou de parar na borda da
     * função. Dezoito pares que o repositório JÁ entregava passaram a ser
     * medidos como entregues, e a coluna do não caiu de 105 para 89.
     *
     * A medida do ponto cego é essa: **um sexto do "não entrega" era o motor
     * não olhando**, não a porta não entregando.
     */
    expect(c.pares.filter((p) => p.entregue).length).toBe(165);
    expect(c.pares.filter((p) => !p.entregue).length).toBe(89);
  });

  /**
   * **As operações que não montam a resposta por consulta relacional.** Elas
   * montam à mão, e a contagem está travada para a lista não crescer calada.
   */
  it("28 operações montam a resposta fora do `with`, e a conta está travada", () => {
    // E194: 31 → 30. O `PATCH /contratos` saiu desta lista no dia em que passou
    // a reler pelo mesmo `with` do `GET` (S-O113) — a régua enxerga uma porta a
    // mais por dentro, e essa é a direção certa desta conta.
    //
    // E199/S-O114: 30 → 28. Saíram `POST /parcelas/:id/receber` e
    // `POST /parcelas/:id/estornar` — as duas TÊM consulta relacional, dentro do
    // helper que o motor não seguia. **As duas estão nomeadas na S-O112 como
    // portas mudas**, e a medição diz que não são: a sobra listava 6 mudas e são
    // 5, porque a régua cega inflava a conta. Quem for fechar a S-O112 (E203)
    // parte de 5.
    expect(c.montadasAMao.length, "operação nova sem consulta relacional? A varredura não a enxerga — conte-a aqui").toBe(28);
  });

  /**
   * **A promessa que ninguém cumpria — e a lista ESVAZIOU quando o motor
   * passou a enxergar (S-O114/E199).**
   *
   * Esta tabela nasceu no E192 com 7 linhas e chegou a 8 no E194. Cada linha
   * era um julgamento ESCRITO À MÃO: *"esta aresta não aparece na consulta
   * relacional, mas há um serializador em tal arquivo, confie"*. A sobra
   * S-O114 dizia exatamente isso — **julgamento escrito, não medição** — e
   * cobrava conferência manual toda vez que um serializador mudasse de arquivo.
   *
   * O E199 fez o motor seguir a chamada para fora do handler, e as OITO
   * viraram medição:
   *
   * | aresta | quem serializa |
   * |---|---|
   * | `BackupStatus.ultimo` · `.recentes` · `.ultimoDrill` | `lib/backup.ts` — `statusDosBackups` |
   * | `LookbookPublicoVestido.fotos` | `lib/visao-noiva.ts` — `montarVestidosLookbook` |
   * | `OrcamentoPublico.itens` | `lib/visao-noiva.ts` — `montarOrcamentoPublico` |
   * | `ComissaoRegra.faixas` | `routes/comissao.ts` — `regrasDaLoja` |
   * | `ComissaoPreviewLinha.projecao` | `routes/comissao.ts` — `projecaoDaLinha` |
   * | `Ajuste.pecaDoAcervo` | `routes/agenda.ts` — `enriquecerAjustes` (E194/S-O111) |
   *
   * A última é a que fecha o círculo: o E194 a pôs aqui **por causa do próprio
   * conserto** — extrair a conta para um helper fez a aresta ir de 1 para 3
   * portas entregues E aparecer como órfã. Agora o motor lê as três.
   *
   * A régua fica, e agora ela é forte: **lista vazia**. Aresta que apareça aqui
   * é promessa que ninguém cumpre de verdade — ou o campo sai do spec, ou
   * alguém escreve quem o serializa. Não há mais "confie na tabela".
   */
  it("nenhuma aresta fica órfã: tudo que o spec promete, alguma porta entrega", () => {
    const vazias = [...c.arestas]
      .filter(([, v]) => v.entrega === 0)
      .map(([k]) => k)
      .sort();
    expect(
      vazias,
      "aresta que NINGUÉM entrega: ou o campo sai do spec, ou diga quem a serializa — e note que o motor já segue a chamada, então isto é promessa vazia de verdade",
    ).toEqual([]);
  });

  /**
   * **A porta que entrega menos que a irmã.** Aqui a aresta É entregue em algum
   * lugar, e não naquela porta. Quase sempre é o schema COMPARTILHADO fazendo
   * o seu papel (`Lead.interesse` viaja em 27 respostas e só 4 o carregam), e
   * quase sempre está certo. As exceções são o material do épico, e as três
   * que ele achou viraram sobra: `Ajuste.pecaDoAcervo` (S-O111),
   * `Parcela.contrato` (S-O112) e as quatro relações do `PATCH /contratos`
   * (S-O113).
   *
   * A lista trava os NOMES, não os números: a proporção muda a cada porta nova,
   * e o que não pode mudar em silêncio é o CONJUNTO.
   */
  const ENTREGA_DESIGUAL = [
    "BloqueioVestido.lead",
    "BloqueioVestido.vestido",
    "Contrato.lead",
    "Contrato.parcelas",
    "Contrato.vendedora",
    "Lead.interesse",
    "LeadInteresse.atributos",
    "Orcamento.itens",
    "Orcamento.lead",
    "Parcela.contrato",
    "ParcelaContrato.lead",
    "Perfil.acessosModulos",
    "Vestido.atributos",
    "Vestido.fotos",
  ];

  it("14 arestas são entregues por umas portas e não por outras, e o conjunto está travado", () => {
    const desiguais = [...c.arestas]
      .filter(([, v]) => v.entrega > 0 && v.promete > v.entrega)
      .map(([k]) => k)
      .sort();
    expect(
      desiguais,
      "aresta nova entregue por umas portas e não por outras: confira se a que falta é defeito (S-O111/112/113) ou schema compartilhado",
    ).toEqual(ENTREGA_DESIGUAL);
  });

  /**
   * **A outra metade da S-O76, e ela não é de caminho: é de CAMPO.**
   *
   * A sobra pergunta *"quem serializa `BloqueioVestido` aninhado"*, e o motivo
   * dela é o **`donoLeadId`** — o campo que diz de quem é a peça quando o véu
   * pende de uma reserva-mãe. Ele é **escalar**, não `$ref`, então o
   * cruzamento de caminhos acima nunca o veria: quem o preenche é um
   * serializador (`bloqueioComDono` e os irmãos), não um `with`.
   *
   * Esta é a régua que fecha aquela conta. As operações cuja resposta ALCANÇA
   * `BloqueioVestido` — resolvendo o mesmo `$ref` transitivo — passam pelo
   * serializador de dono, e **hoje são 18 de 18**. O E167 fechou 5 (dentro de
   * `reservas.ts`), o E179 fechou as outras 3 do arquivo e o E185 fechou as 10
   * de fora; até aqui isso era afirmação de relatório, e agora é conta que
   * reprova quando a 19ª porta nascer muda.
   */
  const SERIALIZADORES_DE_DONO = /bloqueioComDono|atendimentoComDono|ajusteComDono|reservaComDonos|donoDoBloqueio/;

  it("as 18 operações que alcançam BloqueioVestido passam pelo serializador de dono", () => {
    const { schemas, operacoes } = lerSpec(versionado(SPEC));
    const { handlers } = lerRotas();
    const alcanca = (raiz: string): boolean => {
      const visto = new Set<string>();
      const fila = [raiz];
      while (fila.length) {
        const s = fila.shift()!;
        if (s === "BloqueioVestido") return true;
        if (visto.has(s)) continue;
        visto.add(s);
        for (const p of schemas.get(s) ?? []) if (p.ref) fila.push(p.ref);
      }
      return false;
    };

    const alcancam = operacoes.filter((o) => o.raiz && alcanca(o.raiz));
    expect(alcancam.length, "o piso: se ninguém alcança o bloqueio, o `$ref` deixou de ser resolvido").toBe(18);

    const mudas = alcancam
      .filter((o) => {
        const h = handlers.find((x) => x.rota === o.rota.replace(/\{([A-Za-z0-9_]+)\}/g, ":$1") && x.metodo === o.metodo);
        return !h || !SERIALIZADORES_DE_DONO.test(h.corpo);
      })
      .map((o) => `${o.metodo.toUpperCase()} ${o.rota}`);

    expect(
      mudas,
      "porta que alcança o bloqueio e não diz de quem ele é — o `donoLeadId` sai `undefined` (E167/E179/E185)",
    ).toEqual([]);
  });

  /**
   * **A prova viva da S-O75**, no molde do caso do P5 na varredura do E177: a
   * classe se fecha quando o schema para de prometer a volta ao pai.
   *
   * `Atendimento.ajustes` apontava `Ajuste`, que carrega `atendimento`,
   * `proximaProva` e `pecaDoAcervo` — três coisas que só a fila da costureira
   * monta. `ATENDIMENTO_WITH` traz `ajustes` com `checklist` e mais nada, então
   * as **5 portas de atendimento** prometiam um subárvore inteira que nenhuma
   * preenchia.
   */
  it("o ajuste dentro do atendimento não promete a volta ao atendimento (S-O75)", () => {
    const { schemas } = lerSpec(versionado(SPEC));
    const atendimento = schemas.get("Atendimento")!;
    const ajustes = atendimento.find((p) => p.nome === "ajustes")!;
    expect(ajustes.ref, "o item de `Atendimento.ajustes` é o schema estreito, não o `Ajuste` inteiro").toBe("AtendimentoAjuste");

    const nomes = (schemas.get("AtendimentoAjuste") ?? []).map((p) => p.nome);
    expect(nomes, "o checklist vem — é o que o `with` da agenda carrega").toContain("checklist");
    for (const perdido of ["atendimento", "proximaProva", "pecaDoAcervo"]) {
      expect(nomes, `\`${perdido}\` só a fila da costureira monta — prometê-lo aqui é promessa vazia`).not.toContain(perdido);
    }

    // E o espelho continua de pé: o ajuste, esse sim, promete o atendimento —
    // e as três portas de `/ajustes` o entregam.
    expect(schemas.get("Ajuste")!.find((p) => p.nome === "atendimento")!.ref).toBe("AjusteAtendimento");
  });
});

/**
 * S-O75, medida na RESPOSTA — o que a varredura conta pelo papel, aqui se lê
 * pelo fio.
 *
 * O spec dizia, até o E192, que cada ajuste de dentro de um atendimento traz o
 * `atendimento` (com `lead` e `bloqueio` dentro), o `proximaProva` e o
 * `pecaDoAcervo`. Nenhum dos três chega, e é isso que este teste mede: o
 * contrato passou a descrever o que a agenda entrega.
 */
describe("S-O75 — o ajuste dentro do atendimento, medido na resposta", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("a agenda entrega o ajuste com checklist, e não a volta ao atendimento", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const cabine = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine ${Date.now()}` })
      .expect(201);
    const inicio = dataFutura(9);
    const atendimento = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId: cabine.body.id,
        vendedoraId: f.vendedoraId,
        tipo: "ATENDIMENTO",
        inicio: inicio.toISOString(),
      })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.body.id, descricao: "Barra e alça" })
      .expect(201);

    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?de=${inicio.toISOString().slice(0, 10)}`)
      .expect(200);
    const meu = lista.body.find((a: { id: string }) => a.id === atendimento.body.id);
    const ajuste = meu.ajustes[0];

    // O que a agenda ENTREGA — e o schema estreito promete exatamente isto.
    expect(ajuste.descricao).toBe("Barra e alça");
    expect(ajuste.checklist).toEqual([]);

    // O que ela NUNCA entregou, e prometia até o E192.
    expect(ajuste.atendimento, "a volta ao atendimento nunca vem: `ATENDIMENTO_WITH` traz `ajustes` só com `checklist`").toBeUndefined();
    expect(ajuste.proximaProva, "o prazo é calculado só na fila da costureira").toBeUndefined();
    expect(ajuste.pecaDoAcervo, "a peça de acervo é consulta própria do `GET /ajustes`").toBeUndefined();
  });
});
