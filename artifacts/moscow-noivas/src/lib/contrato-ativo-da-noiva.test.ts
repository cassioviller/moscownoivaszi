import { describe, expect, it } from "vitest";
import { contratoAtivoDaNoiva } from "./contrato-ativo-da-noiva";

/**
 * S-O20 — a régua que as duas fichas faziam à mão com `find`.
 *
 * O caso das linhas 3 e 4 é o que o `find` errava: com a lista chegando em
 * outra ordem — página, cache antigo, dump sem o índice do E158 —, ele
 * devolvia o primeiro que aparecesse. A tela da reserva usa esse contrato para
 * jogar o reparo no carnê da noiva; escolher pela ordem da resposta é escolher
 * por acaso.
 */

const CANCELADO = { id: "c-cancelado", status: "CANCELADO", fechadoEm: "2026-08-01T12:00:00.000Z" };
const ATIVO = { id: "c-ativo", status: "ATIVO", fechadoEm: "2026-07-01T12:00:00.000Z" };
const ATIVO_NOVO = { id: "c-novo", status: "ATIVO", fechadoEm: "2026-08-10T12:00:00.000Z" };

describe("S-O20 — o contrato ATIVO da noiva", () => {
  it("acha o ativo no meio dos cancelados, que é o caso de toda noiva que já trocou de vestido", () => {
    expect(contratoAtivoDaNoiva([CANCELADO, ATIVO])?.id).toBe("c-ativo");
  });

  it("sem ativo, devolve null — e não o primeiro contrato que houver", () => {
    expect(contratoAtivoDaNoiva([CANCELADO])).toBeNull();
    expect(contratoAtivoDaNoiva([])).toBeNull();
    expect(contratoAtivoDaNoiva(undefined)).toBeNull();
  });

  it("com dois ativos — o que o índice do E158 proíbe — devolve o MAIS RECENTE, venha na ordem que vier", () => {
    expect(contratoAtivoDaNoiva([ATIVO, ATIVO_NOVO])?.id).toBe("c-novo");
    expect(contratoAtivoDaNoiva([ATIVO_NOVO, ATIVO])?.id).toBe("c-novo");
  });
});
