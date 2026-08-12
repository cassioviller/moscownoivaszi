import { describe, expect, it } from "vitest";
import {
  ajustesDaSemana,
  casamentoDeReferencia,
  prazoDias,
  rotuloCasamento,
  rotuloProva,
  naSemana,
  urgenteAjuste,
} from "./ajustes-da-semana";

/** Um dia YMD a N dias de hoje, no fuso da loja. */
function emDias(n: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + n * 24 * 3_600_000),
  );
}

describe("ajustesDaSemana — o cartão do painel conta o que a fila mostra (E132)", () => {
  it("pendente com prova em 3 dias entra; em 10 dias fica fora", () => {
    const dentro = { status: "PENDENTE", proximaProva: emDias(3) };
    const fora = { status: "PENDENTE", proximaProva: emDias(10) };
    expect(ajustesDaSemana([dentro, fora])).toEqual([dentro]);
  });

  it("atrasado é 'da semana' — é o que mais precisa da costureira", () => {
    expect(ajustesDaSemana([{ status: "PENDENTE", proximaProva: emDias(-2) }])).toHaveLength(1);
  });

  it("FEITO não conta, mesmo com prova amanhã", () => {
    expect(ajustesDaSemana([{ status: "FEITO", proximaProva: emDias(1) }])).toEqual([]);
  });

  it("sem prova, vale o casamento; sem referência nenhuma, fica fora do recorte", () => {
    const peloCasamento = {
      status: "PENDENTE",
      atendimento: { bloqueio: { casamentoData: emDias(5) } },
    };
    const semReferencia = { status: "PENDENTE" };
    expect(ajustesDaSemana([peloCasamento, semReferencia])).toEqual([peloCasamento]);
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
    expect(ajustesDaSemana([confeccao])).toEqual([confeccao]);
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
    expect(ajustesDaSemana([a])).toEqual([]);
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
 * caso                                             | naSemana | fila(cor) | ficha(cor)
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
  const emDiasISO = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
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

  it("a CONFECÇÃO com casamento perto é vermelha — era cinza na fila", () => {
    // Sem bloqueio: é a definição de confecção. A fila lia `bloqueio.casamentoData`
    // e não achava nada, então nunca pintava.
    const c = trabalho({ casNoiva: emDiasISO(5) });
    expect(urgenteAjuste(c)).toBe(true);
    expect(naSemana(c), "e ela ESTÁ no recorte da semana — era esse o absurdo").toBe(true);
  });

  it("casamento em 10 dias é vermelho e NÃO está na semana — os dois ao mesmo tempo", () => {
    // Estado válido, e é o ponto de separar os dois nomes: a cor avisa antes,
    // o recorte lista o que se costura até sexta.
    const c = trabalho({ casNoiva: emDiasISO(10) });
    expect(urgenteAjuste(c)).toBe(true);
    expect(naSemana(c)).toBe(false);
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
