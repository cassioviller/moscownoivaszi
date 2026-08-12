import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ACOES_FILTRAVEIS, ROTULO_ACAO } from "./auditoria";

/**
 * S-O1 — **a lista de ações filtráveis era curada à mão, e envelhecia calada.**
 *
 * O comentário de `api-server/src/lib/auditoria.ts` já declarava o pacto:
 * *"ESPELHO de `ROTULO_ACAO` em moscow-noivas — a planilha da contadora e a
 * tela têm de chamar a mesma coisa pelo mesmo nome"*. Do lado do servidor o
 * TypeScript cobra (`Record<AcaoAuditoria, string>`); **deste lado não cobrava
 * nada**, porque a tela não importa o api-server.
 *
 * **Medido em 2026-08-12: 43 ações no servidor, 37 no mapa da tela, 35 na lista
 * do select.** Seis ações que a trilha GRAVA e o filtro não oferecia — entre
 * elas `RESERVA_CANCELADA` (S-M24), `CARNE_COMPLETADO` (P7/E169) e as duas que
 * nasceram no E173 hoje. Quem procurasse por elas não achava, e a linha estava
 * lá.
 *
 * Duas coisas mudaram: `ACOES_FILTRAVEIS` passou a ser **derivada** do mapa
 * (regra 26 — ação que ganha rótulo ganha filtro), e esta varredura cobra o
 * mapa contra a união do servidor. O sentido é um só, e é o que importa: **toda
 * ação gravada tem rótulo**. O contrário — rótulo sem ação — é lixo barato, e a
 * varredura o acusa junto porque custa a mesma linha.
 *
 * **Enumera pelo versionamento**, a régua da casa.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..", "..");
const FONTE_DO_SERVIDOR = "artifacts/api-server/src/lib/auditoria.ts";

function acoesDoServidor(): string[] {
  const versionado = execFileSync("git", ["ls-files", FONTE_DO_SERVIDOR], {
    cwd: RAIZ,
    encoding: "utf8",
  }).trim();
  if (!versionado) throw new Error(`${FONTE_DO_SERVIDOR} não está versionado`);
  const fonte = readFileSync(path.join(RAIZ, FONTE_DO_SERVIDOR), "utf8");
  // A união fechada é uma lista de strings entre `ACOES_AUDITORIA = [` e `]`.
  const bloco = /export const ACOES_AUDITORIA = \[([\s\S]*?)\] as const;/.exec(fonte);
  if (!bloco) throw new Error("não achei ACOES_AUDITORIA no api-server");
  return [...bloco[1]!.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
}

describe("varredura — a trilha da tela espelha a do servidor (S-O1)", () => {
  const doServidor = acoesDoServidor();

  it("olha para uma união de verdade — não para uma lista vazia", () => {
    expect(doServidor.length).toBeGreaterThanOrEqual(40);
  });

  it("toda ação que o servidor GRAVA tem rótulo na tela", () => {
    const semRotulo = doServidor.filter((a) => !(a in ROTULO_ACAO));
    expect(
      semRotulo,
      "ação nova no servidor precisa de rótulo aqui — senão a trilha a grava e a tela mostra o código cru",
    ).toEqual([]);
  });

  it("e toda ação com rótulo é oferecida no filtro", () => {
    // Derivada, então isto não pode falhar por construção — e é exatamente o
    // ponto: o teste prega a DERIVAÇÃO, e fica vermelho se alguém voltar a
    // escrever a lista à mão.
    expect([...ACOES_FILTRAVEIS].sort()).toEqual(Object.keys(ROTULO_ACAO).sort());
  });

  it("não há rótulo órfão — nome que a trilha nunca vai gravar", () => {
    const orfaos = Object.keys(ROTULO_ACAO).filter((a) => !doServidor.includes(a));
    expect(orfaos, "rótulo sem ação é um filtro que nunca devolve nada").toEqual([]);
  });
});
