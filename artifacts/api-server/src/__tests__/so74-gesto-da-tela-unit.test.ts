import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-O74/E189 — **porta de escrita sem gesto de tela é conserto que não
 * dispara.**
 *
 * O `PATCH /reservas/:id` aprendeu no E173 a propagar a data nova do casamento
 * para todos os bloqueios vinculados **e para o contrato ATIVO**, gravando
 * `CONTRATO_DATA_SEGUIU_RESERVA` na trilha. Ele ficou **seis épicos** sem um
 * único chamador: a noiva mudava o casamento de 12/09 para 03/10, a ficha
 * passava a dizer 03/10 e o vestido continuava preso em 12/09 — o V5 do
 * CODE-REVIEW, vivo pela metade porque a metade que faltava era um botão.
 *
 * A lição não é sobre `reservas`: **o conserto do servidor não é medido por
 * nenhuma régua do lado de quem usa**, e a suíte de API fica verde sobre uma
 * porta que ninguém abre. Esta varredura fecha a classe onde ela mordeu, e o
 * que ela cobra é uma decisão escrita por operação — chamador na tela, ou
 * motivo na dívida.
 *
 * ## O escopo, dito por extenso
 *
 * ✔ cobre: as operações do cliente gerado cuja URL cai em
 *   `/lojas/:id/reservas` — as cinco do agregado.
 * ✔ conta como chamador: `useOperacao` ou `operacao(` em `moscow-noivas/src`
 *   (fora de teste) e em `e2e/`. É onde a pessoa clica.
 * ✘ NÃO cobre: as outras 195 operações do cliente. Medido em 2026-08-12:
 *   **32 das 200 não têm chamador**, e a maioria é falso positivo deste
 *   detector — a tela usa a URL da operação (`<img src>`, `href` de exportação)
 *   em vez do hook. Separar as duas classes é a **S-O96**.
 * ✘ NÃO cobre: se o gesto está no lugar CERTO, nem se ele pede o módulo certo
 *   — a segunda é a `s36-gate-da-tela-unit`, ao lado.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/** As operações do cliente gerado que batem no agregado `reservas`. */
function operacoesDeReservas(): string[] {
  const cli = readFileSync(
    join(RAIZ, "lib", "api-client-react", "src", "generated", "api.ts"),
    "utf8",
  );
  const achadas: string[] = [];
  // O corpo vai até a chave que fecha na coluna 0 — a operação COM filtro tem
  // `}` no meio (o `forEach` que monta a query), então não dá para parar no
  // primeiro. Dentro dele, todo caminho declarado conta: a de filtro tem dois
  // (com e sem query), e os dois apontam para o mesmo recurso.
  for (const m of cli.matchAll(/export const get(\w+)Url = [\s\S]*?\n\}/g)) {
    const operacao = m[1]![0]!.toLowerCase() + m[1]!.slice(1);
    for (const t of m[0].matchAll(/`(\/api\/[^`]+)`/g)) {
      const caminho = t[1]!.replace(/\$\{[^}]+\}/g, ":p").split("?")[0]!;
      if (/^\/api\/lojas\/:p\/reservas(\/:p)?$/.test(caminho)) achadas.push(operacao);
    }
  }
  return [...new Set(achadas)].sort();
}

/** Onde a pessoa clica: as telas e a suíte que as encena. */
function fonteDeQuemChama(): string {
  const arquivos = [
    ...arquivosVersionados(RAIZ, ["artifacts/moscow-noivas/src"]),
    ...arquivosVersionados(RAIZ, ["e2e"]),
  ].filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
  // Piso de população: conjunto vazio aprovaria tudo em silêncio (S-D31).
  expect(arquivos.length).toBeGreaterThan(100);
  return arquivos.map((f) => readFileSync(join(RAIZ, f), "utf8")).join("\n");
}

/**
 * A dívida, com o motivo de cada linha — não é licença, é julgamento escrito.
 *
 * As duas que sobram do E189 são as duas em que a reserva NASCE e MORRE por
 * outro caminho, e nos dois casos o caminho de hoje é mais guardado que uma
 * chamada crua seria.
 */
const SEM_GESTO_POR_DECISAO: Record<string, string> = {
  createReserva:
    "a reserva nasce por `POST /orcamentos/:id/reservar` (E162), que reserva as peças do orçamento em nome da noiva dele, e por `POST /bloqueios` com `reservaId`. Criar reserva solta, sem venda atrás, não é gesto que a loja faça.",
  deleteReserva:
    "apagar a reserva cascateia avaria, prova e vínculo de contrato (E115). Quem quer tirar a peça do caminho usa o soft-cancel — `PATCH /reservas/:id` com `status: CANCELADA` —, que conta o que solta e deixa trilha.",
};

describe("S-O74 — toda porta de `reservas` tem gesto de tela, ou dívida com motivo", () => {
  it("nenhuma operação do agregado fica sem chamador e sem julgamento", () => {
    const operacoes = operacoesDeReservas();
    // Se este número desabar, o casamento URL↔operação quebrou e a varredura
    // estaria passando por vazio.
    expect(operacoes).toEqual([
      "createReserva",
      "deleteReserva",
      "getReserva",
      "listReservas",
      "updateReserva",
    ]);

    const fonte = fonteDeQuemChama();
    const semGesto = operacoes.filter((op) => {
      const Op = op[0]!.toUpperCase() + op.slice(1);
      return !new RegExp(`\\b(use${Op}|${op})\\s*\\(`).test(fonte);
    });

    expect(semGesto).toEqual(Object.keys(SEM_GESTO_POR_DECISAO).sort());
  });

  it("a dívida não guarda linha morta — o que ganhou gesto sai dela", () => {
    const fonte = fonteDeQuemChama();
    const paga = Object.keys(SEM_GESTO_POR_DECISAO).filter((op) => {
      const Op = op[0]!.toUpperCase() + op.slice(1);
      return new RegExp(`\\b(use${Op}|${op})\\s*\\(`).test(fonte);
    });
    // Dívida que fica na tabela depois de paga é a S-A4/S-A6 da regra 21: a
    // lista deixa de dizer o que falta.
    expect(paga).toEqual([]);
  });
});
