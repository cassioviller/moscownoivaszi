import { describe, expect, it } from "vitest";
import {
  aContatarNaJanela,
  faltaProcurar,
  jaFoiProcurada,
  respondeu,
  jaContatadasNaJanela,
  pediramRemarcacaoNaJanela,
  orcamentosVencendoNaJanela,
  resumoDaFila,
  comMarcaDeCobranca,
  comRegistroDaCobranca,
  semMarcaDeCobranca,
  particionaPorCobranca,
  marcasPersistentesDeCobranca,
  type MarcasCobranca,
} from "./mensagens-do-dia";

/**
 * A régua da fila do dia (E69) saiu da tela para o `lib` no F7, para o
 * dashboard contar a MESMA coisa que "Mensagens de hoje" mostra. Estes casos
 * fixam as fronteiras que a tela nunca teve teste para defender.
 */

const AGORA = new Date("2026-07-28T10:00:00-03:00").getTime();
const H = 3_600_000;

function atendimento(over: Partial<Parameters<typeof aContatarNaJanela>[0][number]> = {}) {
  return {
    situacao: "AGENDADO",
    inicio: new Date(AGORA + 2 * H).toISOString(),
    contatadoEm: null,
    confirmadoEm: null,
    ...over,
  };
}

describe("a fila de quem procurar", () => {
  it("pega o atendimento agendado dentro das 48h", () => {
    expect(aContatarNaJanela([atendimento()], AGORA)).toHaveLength(1);
  });

  it("não pega quem a loja já procurou", () => {
    const ja = atendimento({ contatadoEm: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([ja], AGORA)).toHaveLength(0);
  });

  it("não pega quem já respondeu pelo portal — não há o que perguntar a ela", () => {
    const respondeu = atendimento({ confirmadoEm: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([respondeu], AGORA)).toHaveLength(0);
  });

  it("não pega o que já passou: confirmar presença de ontem não existe", () => {
    const passado = atendimento({ inicio: new Date(AGORA - H).toISOString() });
    expect(aContatarNaJanela([passado], AGORA)).toHaveLength(0);
  });

  it("a fronteira das 48h é inclusiva, e 1ms depois já é fora", () => {
    const naBorda = atendimento({ inicio: new Date(AGORA + 48 * H).toISOString() });
    const foraPorUmMs = atendimento({ inicio: new Date(AGORA + 48 * H + 1).toISOString() });
    expect(aContatarNaJanela([naBorda], AGORA)).toHaveLength(1);
    expect(aContatarNaJanela([foraPorUmMs], AGORA)).toHaveLength(0);
  });

  it("ordena por horário — quem é atendida antes precisa ser procurada antes", () => {
    const tarde = atendimento({ inicio: new Date(AGORA + 10 * H).toISOString() });
    const cedo = atendimento({ inicio: new Date(AGORA + 2 * H).toISOString() });
    expect(aContatarNaJanela([tarde, cedo], AGORA)[0]).toBe(cedo);
  });

  it("só conta AGENDADO — quem faltou ou concluiu não recebe confirmação", () => {
    const concluido = atendimento({ situacao: "CONCLUIDO" });
    const faltou = atendimento({ situacao: "FALTOU" });
    expect(aContatarNaJanela([concluido, faltou], AGORA)).toHaveLength(0);
  });
});

describe("F37 — quem avisou que NÃO pode ir", () => {
  it("sai da fila de procurar: ela JÁ respondeu", () => {
    const pediu = atendimento({ remarcacaoPedidaEm: new Date(AGORA - H).toISOString() });
    // Perguntar "você vem?" a quem acabou de avisar que não vem é a forma mais
    // rápida de a noiva concluir que ninguém leu o aviso dela.
    expect(aContatarNaJanela([pediu], AGORA)).toHaveLength(0);
    expect(jaContatadasNaJanela([pediu], AGORA)).toHaveLength(0);
  });

  it("entra na fila PRÓPRIA, porque o gesto é outro — remarcar, não escrever", () => {
    const pediu = atendimento({ remarcacaoPedidaEm: new Date(AGORA - H).toISOString() });
    expect(pediramRemarcacaoNaJanela([pediu], AGORA)).toHaveLength(1);
  });

  it("quem não pediu não aparece nela", () => {
    expect(pediramRemarcacaoNaJanela([atendimento()], AGORA)).toHaveLength(0);
  });

  it("sai da fila quando o horário passa — não há mais o que devolver", () => {
    const passado = atendimento({
      inicio: new Date(AGORA - H).toISOString(),
      remarcacaoPedidaEm: new Date(AGORA - 2 * H).toISOString(),
    });
    expect(pediramRemarcacaoNaJanela([passado], AGORA)).toHaveLength(0);
  });
});

describe("a fila de quem já foi procurada", () => {
  it("é o complemento exato da outra: procurada, sem resposta", () => {
    const procurada = atendimento({ contatadoEm: new Date(AGORA - H).toISOString() });
    expect(jaContatadasNaJanela([procurada], AGORA)).toHaveLength(1);
    expect(aContatarNaJanela([procurada], AGORA)).toHaveLength(0);
  });

  /**
   * S-O21/E181 — as duas filas são a MESMA pergunta com o `contatadoEm`
   * trocado de sinal, e agora é o código que diz isso: as duas passaram a
   * derivar de `respondeu`.
   *
   * A régua enumera os fatos de resposta em vez de citá-los um a um: fato novo
   * na família entra em `respondeu` e as duas filas o ganham juntas. Antes, a
   * `jaContatadasNaJanela` reconstruía os três pela negativa, e o quarto fato
   * entraria só na fila que o autor tivesse aberto.
   */
  it("todo fato de resposta tira a noiva das DUAS filas, e é uma lista só", () => {
    const RESPOSTAS = ["confirmadoEm", "remarcacaoPedidaEm"] as const;
    for (const fato of RESPOSTAS) {
      const respondeuAssim = atendimento({
        contatadoEm: new Date(AGORA - 2 * H).toISOString(),
        [fato]: new Date(AGORA - H).toISOString(),
      });
      expect(respondeu(respondeuAssim), fato).toBe(true);
      expect(jaContatadasNaJanela([respondeuAssim], AGORA), fato).toHaveLength(0);
      expect(aContatarNaJanela([respondeuAssim], AGORA), fato).toHaveLength(0);
    }
  });

  it("sem resposta, a única diferença entre as duas filas é ter sido procurada", () => {
    const procurada = atendimento({ contatadoEm: new Date(AGORA - H).toISOString() });
    const nova = atendimento();
    expect(respondeu(procurada)).toBe(false);
    expect(faltaProcurar(nova)).toBe(true);
    expect(jaFoiProcurada(nova)).toBe(false);
    expect(faltaProcurar(procurada)).toBe(false);
    expect(jaFoiProcurada(procurada)).toBe(true);
  });

  it("quem respondeu sai das duas listas", () => {
    const respondeu = atendimento({
      contatadoEm: new Date(AGORA - 2 * H).toISOString(),
      confirmadoEm: new Date(AGORA - H).toISOString(),
    });
    expect(jaContatadasNaJanela([respondeu], AGORA)).toHaveLength(0);
    expect(aContatarNaJanela([respondeu], AGORA)).toHaveLength(0);
  });
});

describe("orçamentos vencendo — a validade é DIA de negócio (S-M25)", () => {
  // O teste antigo fabricava validades como INSTANTES relativos — pregava a
  // semântica errada que o achado 2#2 mediu: às 12:00:01 do próprio dia de
  // validade o lembrete morria, na tarde em que "vence hoje" mais converte.
  const HOJE = "2026-08-14";
  const anc = (dia: string) => `${dia}T15:00:00.000Z`; // meio-dia SP

  it("pega o ENVIADO que vence na janela de 3 dias — inclusive o de HOJE, o dia INTEIRO", () => {
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: anc(HOJE) }], HOJE)).toHaveLength(1);
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: anc("2026-08-17") }], HOJE)).toHaveLength(1);
  });

  it("não pega o que venceu ONTEM nem o de depois da janela", () => {
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: anc("2026-08-13") }], HOJE)).toHaveLength(0);
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: anc("2026-08-18") }], HOJE)).toHaveLength(0);
  });

  it("não pega rascunho nem aprovado, mesmo com validade próxima", () => {
    const validade = anc("2026-08-15");
    const rascunho = { status: "RASCUNHO", validade };
    const aprovado = { status: "APROVADO", validade };
    expect(orcamentosVencendoNaJanela([rascunho, aprovado], HOJE)).toHaveLength(0);
  });

  it("orçamento sem validade não vence e não entra na fila", () => {
    expect(orcamentosVencendoNaJanela([{ status: "ENVIADO", validade: null }], HOJE)).toHaveLength(0);
  });
});

describe("o resumo do dashboard", () => {
  it("some quando não há nada a enviar — o cartão não vira paisagem", () => {
    expect(resumoDaFila(0)).toBeNull();
  });

  it("fala no singular quando é uma só", () => {
    expect(resumoDaFila(1)?.frase).toBe("1 mensagem pronta para enviar");
  });

  it("fala no plural a partir de duas", () => {
    expect(resumoDaFila(4)?.frase).toBe("4 mensagens prontas para enviar");
  });
});

/**
 * E123/B3 — a fila marca o que já saiu. O desenho é o da seção irmã ("Procurar
 * para confirmar"): a linha sai ao cobrar e o desfazer devolve. Estes casos são
 * a versão pura do que a tela faz — o repo decidiu não ter render test (E99),
 * então o que se afirma aqui é a DECISÃO, e o E2E afirma o gesto.
 */
describe("a marca de cobrada da fila de inadimplentes", () => {
  const vazia: MarcasCobranca = new Map();
  const ana = { leadId: "ana", noivaNome: "Ana" };
  const bia = { leadId: "bia", noivaNome: "Bia" };
  const semLead = { leadId: null, noivaNome: "Órfã de contrato" };

  it("o clique marca, e a linha muda de lado: sai de aCobrar, entra em cobradas", () => {
    const marcas = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    const { aCobrar, cobradas } = particionaPorCobranca([ana, bia], marcas);
    expect(aCobrar).toEqual([bia]);
    expect(cobradas).toEqual([{ noiva: ana, marca: { quando: "2026-07-30T10:00:00.000Z" } }]);
  });

  it("o SEGUNDO clique não remarca nem duplica — o primeiro manda (é o dedup)", () => {
    const primeira = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    const segunda = comMarcaDeCobranca(primeira, "ana", "2026-07-30T10:05:00.000Z");
    expect(segunda).toBe(primeira);
    expect(segunda.get("ana")!.quando).toBe("2026-07-30T10:00:00.000Z");
  });

  it("a resposta do POST dá alvo ao desfazer, sem mexer no instante", () => {
    let marcas = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    expect(marcas.get("ana")!.registroId).toBeUndefined();
    marcas = comRegistroDaCobranca(marcas, "ana", "reg-1");
    expect(marcas.get("ana")).toEqual({ quando: "2026-07-30T10:00:00.000Z", registroId: "reg-1" });
  });

  it("resposta atrasada de marca já desfeita não ressuscita a linha", () => {
    const marcada = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    const desfeita = semMarcaDeCobranca(marcada, "ana");
    expect(comRegistroDaCobranca(desfeita, "ana", "reg-1").has("ana")).toBe(false);
  });

  it("o desfazer devolve a linha à fila, na posição dela (a ordem é a do atraso)", () => {
    const marcas = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    const depois = semMarcaDeCobranca(marcas, "ana");
    const { aCobrar, cobradas } = particionaPorCobranca([ana, bia], depois);
    expect(aCobrar).toEqual([ana, bia]);
    expect(cobradas).toEqual([]);
  });

  it("noiva sem leadId não é marcável e fica na fila — o registro é por noiva", () => {
    const marcas = comMarcaDeCobranca(vazia, "ana", "2026-07-30T10:00:00.000Z");
    const { aCobrar } = particionaPorCobranca([semLead], marcas);
    expect(aCobrar).toEqual([semLead]);
  });
});

describe("S-D13 — a metade persistente da marca de cobrada", () => {
  // O dia no fuso da loja, como `diaLocal` faz — fixado aqui para o teste não
  // depender do relógio de quem executa.
  const diaSP = (instante: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
  const HOJE = "2026-08-06";

  it("contato de HOJE no fuso da loja marca a noiva como cobrada, sem alvo de desfazer", () => {
    const marcas = marcasPersistentesDeCobranca(
      [{ leadId: "ana", ultimoContatoEm: "2026-08-06T14:00:00.000-03:00" }],
      HOJE,
      diaSP,
    );
    expect(marcas.get("ana")).toEqual({ quando: "2026-08-06T14:00:00.000-03:00" });
    expect(marcas.get("ana")!.registroId).toBeUndefined();
  });

  it("contato de ANTEONTEM não tira a linha da fila de hoje — a régua é o dia, não 'houve contato'", () => {
    const marcas = marcasPersistentesDeCobranca(
      [{ leadId: "ana", ultimoContatoEm: "2026-08-04T09:00:00.000-03:00" }],
      HOJE,
      diaSP,
    );
    expect(marcas.size).toBe(0);
  });

  it("o contato das 22h de ontem em SP é 01h de hoje em UTC — e continua sendo ontem", () => {
    // 2026-08-06T01:00Z = 2026-08-05 22:00 em São Paulo. Comparar o instante
    // pelo dia UTC marcaria como cobrada hoje uma noiva procurada ontem.
    const marcas = marcasPersistentesDeCobranca(
      [{ leadId: "ana", ultimoContatoEm: "2026-08-06T01:00:00.000Z" }],
      HOJE,
      diaSP,
    );
    expect(marcas.size).toBe(0);
  });

  it("sem leadId ou sem contato, não há marca", () => {
    const marcas = marcasPersistentesDeCobranca(
      [
        { leadId: null, ultimoContatoEm: "2026-08-06T14:00:00.000-03:00" },
        { leadId: "bia", ultimoContatoEm: null },
      ],
      HOJE,
      diaSP,
    );
    expect(marcas.size).toBe(0);
  });

  it("fundida com a marca de sessão, a da sessão manda — é ela que tem o registroId", () => {
    const persistente = marcasPersistentesDeCobranca(
      [{ leadId: "ana", ultimoContatoEm: "2026-08-06T10:00:00.000-03:00" }],
      HOJE,
      diaSP,
    );
    let sessao = comMarcaDeCobranca(new Map(), "ana", "2026-08-06T14:00:00.000-03:00");
    sessao = comRegistroDaCobranca(sessao, "ana", "reg-1");
    const fundidas = new Map([...persistente, ...sessao]);
    expect(fundidas.get("ana")).toEqual({ quando: "2026-08-06T14:00:00.000-03:00", registroId: "reg-1" });
  });
});
