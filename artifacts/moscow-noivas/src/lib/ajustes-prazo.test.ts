import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ancoraDeNegocio } from "@workspace/financeiro-core";
import {
  ajustesComPrazoApertado,
  casamentoDeReferencia,
  prazoDias,
  rotuloCasamento,
  rotuloProva,
  prazoApertado,
  urgenteAjuste,
} from "./ajustes-prazo";

/** Um dia YMD a N dias de hoje, no fuso da loja. */
function emDias(n: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + n * 24 * 3_600_000),
  );
}

/**
 * O mesmo dia de `emDias`, como INSTANTE — e ancorado ao meio-dia da loja
 * (S-O119).
 *
 * A versão anterior fazia `new Date()` + n dias e `.toISOString()`, o que
 * fabrica um instante com a HORA de quando a suíte roda. O código do outro lado
 * lê aquilo como dia de NEGÓCIO (`diasAteCasamento` = `diasEntre(hojeLocal(),
 * diaDeNegocio(iso))`), e entre 00:00 e 03:00 UTC — 21h à meia-noite em São
 * Paulo — o dia UTC já é amanhã enquanto `hojeLocal()` ainda é hoje: **todo
 * `emDiasISO(n)` lia como `n+1`**, e o assert do limiar exato reprovava. A suíte
 * ficava vermelha três horas por noite e passava nas outras 21.
 *
 * Ancorando, `diaDeNegocio` do que sai daqui é exatamente `emDias(n)`, e a
 * distância medida é `n` a qualquer hora. **Régua que depende da hora em que
 * roda não é régua.**
 */
function emDiasISO(n: number): string {
  return ancoraDeNegocio(emDias(n)).toISOString();
}

const trabalho = (over: {
  prova?: string | null;
  casBloqueio?: string | null;
  casNoiva?: string | null;
  status?: string;
}) => ({
  status: over.status ?? "PENDENTE",
  proximaProva: over.prova ?? null,
  atendimento: {
    bloqueio: over.casBloqueio ? { casamentoData: over.casBloqueio } : null,
    lead: over.casNoiva ? { casamentoData: over.casNoiva } : null,
  },
});

describe("ajustesComPrazoApertado — o cartão do painel conta o que a fila mostra (E132)", () => {
  it("pendente com prova em 3 dias entra; em 10 dias fica fora", () => {
    const dentro = { status: "PENDENTE", proximaProva: emDias(3) };
    const fora = { status: "PENDENTE", proximaProva: emDias(10) };
    expect(ajustesComPrazoApertado([dentro, fora])).toEqual([dentro]);
  });

  it("atrasado é 'da semana' — é o que mais precisa da costureira", () => {
    expect(ajustesComPrazoApertado([{ status: "PENDENTE", proximaProva: emDias(-2) }])).toHaveLength(1);
  });

  it("FEITO não conta, mesmo com prova amanhã", () => {
    expect(ajustesComPrazoApertado([{ status: "FEITO", proximaProva: emDias(1) }])).toEqual([]);
  });

  it("sem prova, vale o casamento; sem referência nenhuma, fica fora do recorte", () => {
    const peloCasamento = {
      status: "PENDENTE",
      atendimento: { bloqueio: { casamentoData: emDias(5) } },
    };
    const semReferencia = { status: "PENDENTE" };
    expect(ajustesComPrazoApertado([peloCasamento, semReferencia])).toEqual([peloCasamento]);
    expect(prazoDias(semReferencia)).toBeNull();
  });

  /**
   * E170/A05.5 — o teste acima escrevia o ponto cego como se fosse a intenção.
   *
   * "Sem referência nenhuma fica fora do recorte" é verdade e é inofensiva; o
   * que ela escondia é que a CONFECÇÃO caía nesse ramo por construção. O
   * trabalho cortado do zero não tem peça de acervo, logo não tem reserva, logo
   * não tem `bloqueio.casamentoData` — e o casamento da noiva, que viaja no
   * mesmo payload (`agenda.ts:1002` carrega `lead: true`), era descartado. A
   * peça que leva MAIS tempo era a única fora de "Esta semana", o recorte
   * padrão da costureira (`ajustes/index.tsx:80`).
   *
   * O caso não era testado em lugar nenhum — e é o caso do E170: o teste
   * afirmava o ramo `null` e nunca perguntava por que ele era alcançado.
   */
  it("a confecção sem reserva vale pelo casamento DA NOIVA — é a peça que leva mais tempo", () => {
    const confeccao = {
      status: "PENDENTE",
      atendimento: { bloqueio: null, lead: { casamentoData: emDias(5) } },
    };
    expect(prazoDias(confeccao)).toBe(5);
    expect(ajustesComPrazoApertado([confeccao])).toEqual([confeccao]);
  });

  it("o casamento do BLOQUEIO manda sobre o da noiva quando os dois existem", () => {
    const a = {
      status: "PENDENTE",
      atendimento: {
        bloqueio: { casamentoData: emDias(3) },
        lead: { casamentoData: emDias(40) },
      },
    };
    expect(prazoDias(a)).toBe(3);
  });

  it("a prova segue mandando sobre os dois casamentos", () => {
    const a = {
      status: "PENDENTE",
      proximaProva: emDias(1),
      atendimento: { bloqueio: null, lead: { casamentoData: emDias(40) } },
    };
    expect(prazoDias(a)).toBe(1);
  });

  it("sem prova, sem reserva e sem casamento na ficha, o prazo segue nulo", () => {
    const a = { status: "PENDENTE", atendimento: { bloqueio: null, lead: { casamentoData: null } } };
    expect(prazoDias(a)).toBeNull();
    expect(ajustesComPrazoApertado([a])).toEqual([]);
  });

  it("`casamentoDeReferencia` devolve uma grafia só — o `Date` do tipo gerado vira ISO", () => {
    const comDate = { atendimento: { bloqueio: null, lead: { casamentoData: new Date("2027-05-15T12:00:00Z") } } };
    expect(casamentoDeReferencia(comDate)).toBe("2027-05-15T12:00:00.000Z");
    expect(casamentoDeReferencia({ atendimento: { bloqueio: null, lead: null } })).toBeNull();
  });

  it("a prova manda quando as duas referências existem", () => {
    const a = {
      status: "PENDENTE",
      proximaProva: emDias(2),
      atendimento: { bloqueio: { casamentoData: emDias(30) } },
    };
    expect(prazoDias(a)).toBeLessThanOrEqual(2);
  });

  // S-A17: os rótulos saíram da fila para cá — a ficha do trabalho diz o
  // prazo com as mesmas palavras, e o singular não vira "em 1 dias".
  it("os rótulos do prazo cobrem atrasado, hoje, amanhã e o plural", () => {
    expect(rotuloProva(-1)).toBe("prova atrasada");
    expect(rotuloProva(0)).toBe("prova hoje");
    expect(rotuloProva(1)).toBe("prova amanhã");
    expect(rotuloProva(4)).toBe("prova em 4 dias");
    expect(rotuloCasamento(-1)).toBe("casamento passou");
    expect(rotuloCasamento(0)).toBe("casamento hoje");
    expect(rotuloCasamento(1)).toBe("casamento amanhã");
    expect(rotuloCasamento(14)).toBe("casamento em 14 dias");
  });
});

/**
 * S-O27 — **"da semana" e "urgente" são duas coisas, e o comentário da ficha
 * dizia que eram uma.**
 *
 * Medido em 2026-08-12, com as três grafias que existiam:
 *
 * ```
 * caso                                             | prazoApertado | fila(cor) | ficha(cor)
 * casamento em 10 dias, sem prova, com bloqueio    |  false   |   true    |   true
 * casamento em 10 dias, sem prova, SEM bloqueio    |  false   |   false   |   true
 * casamento em  5 dias, sem prova, SEM bloqueio    |  true    |   false   |   true
 * ```
 *
 * A linha de baixo é a que dói: a confecção com casamento em 5 dias entrava no
 * recorte "esta semana" da fila e saía **CINZA** nela — a costureira lia a
 * linha na lista da semana sem destaque nenhum, e a mesma linha aparecia
 * vermelha ao abrir a ficha. A causa é a S-A05.5 pela metade: o E170 ensinou a
 * FICHA a usar `casamentoDeReferencia` e deixou a fila lendo só o bloqueio — e
 * confecção não tem bloqueio, por definição.
 */
describe("urgenteAjuste — a COR, separada do RECORTE (S-O27)", () => {

  it("a CONFECÇÃO com casamento perto é vermelha — era cinza na fila", () => {
    // Sem bloqueio: é a definição de confecção. A fila lia `bloqueio.casamentoData`
    // e não achava nada, então nunca pintava.
    const c = trabalho({ casNoiva: emDiasISO(5) });
    expect(urgenteAjuste(c)).toBe(true);
    expect(prazoApertado(c), "e ela ESTÁ no recorte da semana — era esse o absurdo").toBe(true);
  });

  /**
   * **E183 — este teste pregava a decisão CONTRÁRIA, e a régua era essa mesmo.**
   *
   * O E175 escreveu, aqui e no módulo, que *"uma linha vermelha FORA do recorte
   * da semana é estado válido"*: a cor avisava antes, o recorte listava o que se
   * costura até sexta. Era coerente e tinha um furo de uso — a peça vermelha só
   * aparecia para quem trocasse de aba, e a aba padrão é a que a costureira abre
   * de manhã. **Ninguém troca de aba para procurar o que não sabe que existe.**
   *
   * Decisão da dona em 2026-08-12: o recorte enxerga o que a cor enxerga. O
   * assert virou do avesso de propósito, e fica escrito para quem reabrir o
   * arquivo não achar que a mudança foi descuido.
   */
  it("casamento em 10 dias é vermelho E entra no recorte — as duas réguas viraram uma", () => {
    const c = trabalho({ casNoiva: emDiasISO(10) });
    expect(urgenteAjuste(c)).toBe(true);
    expect(
      prazoApertado(c),
      "o que está vermelho aparece na aba padrão — era o furo que a S-O27 deixou aberto",
    ).toBe(true);
  });

  it("casamento em 20 dias continua fora das duas — a folga não virou infinita", () => {
    // O teto de 14 dias segue sendo teto: unificar as réguas não é alargar o
    // recorte sem fim, senão a aba padrão vira a lista inteira e não recorta nada.
    const c = trabalho({ casNoiva: emDiasISO(20) });
    expect(urgenteAjuste(c)).toBe(false);
    expect(prazoApertado(c)).toBe(false);
  });

  it("a PROVA manda quando existe: 8 dias já não é urgente", () => {
    // O prazo da prova é mais curto de propósito — é para ela que a peça
    // precisa estar pronta, e o casamento vem depois.
    expect(urgenteAjuste(trabalho({ prova: emDiasISO(8), casNoiva: emDiasISO(9) }))).toBe(false);
    expect(urgenteAjuste(trabalho({ prova: emDiasISO(7), casNoiva: emDiasISO(90) }))).toBe(true);
  });

  it("prova atrasada é urgente", () => {
    expect(urgenteAjuste(trabalho({ prova: emDiasISO(-2) }))).toBe(true);
  });

  it("trabalho FEITO nunca é urgente — a cor é sobre o que falta", () => {
    expect(urgenteAjuste(trabalho({ casNoiva: emDiasISO(1), status: "FEITO" }))).toBe(false);
  });

  it("sem prova e sem casamento não há o que apressar", () => {
    expect(urgenteAjuste(trabalho({}))).toBe(false);
  });

  it("o casamento do BLOQUEIO continua valendo quando existe", () => {
    expect(urgenteAjuste(trabalho({ casBloqueio: emDiasISO(10), casNoiva: emDiasISO(90) }))).toBe(true);
  });
});

/**
 * **S-O119 — a régua não pode depender da hora em que roda.**
 *
 * Este bloco existe porque o de cima passava 21 horas por dia e reprovava nas
 * outras 3, e ninguém tinha como saber disso sem esperar a madrugada. Aqui o
 * relógio é CRAVADO na janela que reprovava, então o defeito volta a ser
 * reproduzível ao meio-dia — e o conserto (ancorar `emDiasISO`) fica pregado.
 *
 * Só o limiar EXATO cai quando a régua escorrega um dia: os outros asserts do
 * arquivo têm folga (`<= 14` contra 5, 10 e 20 dias), e é por isso que o defeito
 * atravessou tantos épicos com um único teste vermelho.
 */
describe("urgenteAjuste — o limiar não se move com a hora do relógio (S-O119)", () => {
  // 02:30Z de 13/08 é 23:30 de **12/08** em São Paulo: o dia UTC já virou e o da
  // loja não. É exatamente a janela em que a suíte reprovava.
  const NA_VIRADA = new Date("2026-08-13T02:30:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NA_VIRADA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("o dia da loja e o dia UTC discordam — é a premissa do teste", () => {
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()))
      .toBe("2026-08-12");
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-13");
  });

  it("na virada, prova em 7 dias continua urgente e em 8 continua não", () => {
    expect(urgenteAjuste(trabalho({ prova: emDiasISO(7), casNoiva: emDiasISO(90) }))).toBe(true);
    expect(urgenteAjuste(trabalho({ prova: emDiasISO(8), casNoiva: emDiasISO(9) }))).toBe(false);
  });

  it("na virada, o teto de 14 dias do casamento também não escorrega", () => {
    expect(urgenteAjuste(trabalho({ casNoiva: emDiasISO(14) }))).toBe(true);
    expect(urgenteAjuste(trabalho({ casNoiva: emDiasISO(15) }))).toBe(false);
  });
});
