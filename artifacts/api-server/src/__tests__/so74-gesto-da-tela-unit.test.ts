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
 * ✔ cobre, desde o E239 (S-O96): as OUTRAS operações do cliente, no bloco de
 *   baixo — com o detector que enxerga as três formas de chamar (o hook, o
 *   `getXUrl(` e a URL literal num `href`/`src`), e a dívida nomeada.
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

/**
 * **S-O96/E239 — a régua de gesto para o cliente INTEIRO, e o detector que
 * não erra com URL em `href`/`src`.**
 *
 * A sobra media *"32 das 200 sem chamador"* e dizia que a maioria era falso
 * positivo. Medido de novo em 2026-08-15, antes de escrever: são **216
 * operações** (não 200), **34 sem hook** pelo detector do E189; dessas, **5**
 * usam `getXUrl(` (a foto do vestido e os quatro `exportar*`) e **18** usam a
 * URL LITERAL num `href`, `src` ou `request.<verbo>` (o PDF do contrato, o
 * recibo, o backup, a foto da avaria, os PDFs do portal, o manual…). Sobram
 * **11** — e ao escrever a régua sobraram **10**: o `createReserva` tem
 * chamador LITERAL no `62-avaria-fecha` (`request.post(…/reservas)`), que o
 * detector do E189 não via. Ele continua na dívida do bloco de cima, que mede
 * só o HOOK (gesto de tela), e sai desta, que mede quem exercita a porta.
 * Contando só as TELAS (sem o `e2e/`) seriam 17: as seis a mais são portas
 * que só a suíte encena (`deletePerfil`, `deleteLead`, `deleteCabine`,
 * `createReserva`, `deleteBloqueio`, `pagarContaPagar`) — a régua conta o
 * `e2e/` como o E189 contava, porque é onde a porta é EXERCITADA.
 *
 * O detector: uma operação tem chamador se em `moscow-noivas/src` (fora de
 * teste) ou em `e2e/` aparece `useX(`/`x(`, OU `getXUrl(`, OU o caminho da
 * operação como template literal (`/api/lojas/${…}/contratos/${…}/pdf`).
 */
function operacoesDoCliente(): { op: string; caminhos: string[] }[] {
  const cli = readFileSync(join(RAIZ, "lib", "api-client-react", "src", "generated", "api.ts"), "utf8");
  const out: { op: string; caminhos: string[] }[] = [];
  for (const m of cli.matchAll(/export const get(\w+)Url = [\s\S]*?\n\}/g)) {
    const op = m[1]![0]!.toLowerCase() + m[1]!.slice(1);
    const caminhos = [...m[0].matchAll(/`(\/api\/[^`]+)`/g)].map((t) =>
      t[1]!.replace(/\$\{[^}]+\}/g, ":p").split("?")[0]!,
    );
    out.push({ op, caminhos: [...new Set(caminhos)] });
  }
  return out;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** As três formas de chamar uma operação, num texto só. */
function temChamador(op: string, caminhos: string[], fonte: string): "hook" | "url" | "literal" | null {
  const Op = op[0]!.toUpperCase() + op.slice(1);
  if (new RegExp(`\\b(use${Op}|${op})\\s*\\(`).test(fonte)) return "hook";
  if (new RegExp(`\\bget${Op}Url\\s*\\(`).test(fonte)) return "url";
  for (const c of caminhos) {
    const re = new RegExp(escapar(c).replace(/:p/g, "\\$\\{[^}]+\\}") + "(?![\\w/-])");
    if (re.test(fonte)) return "literal";
  }
  return null;
}

/**
 * A dívida do cliente inteiro — cada linha é um julgamento, e o julgamento
 * separa as duas classes que a sobra pedia: **sem gesto por decisão** e
 * **porta sem tela**. As seis "porta sem tela" que a S-O131 recolhia
 * (`deleteLoja`, `deleteUsuario`, `deleteAtributo`, `deleteAtributoOpcao`,
 * `updateComissaoRegra`, `listAuditoriaGlobal`) **ganharam tela em
 * 2026-08-16 por decisão da dona** ("ganha tela"), e saíram daqui — o teste
 * ao lado cobra a baixa. O que fica é só o "por decisão".
 */
const SEM_GESTO_NO_CLIENTE: Record<string, string> = {
  healthCheck: "por decisão — é o monitor quem bate em /healthz, não uma pessoa; a tela não tem o que fazer com ele.",
  deleteReserva: SEM_GESTO_POR_DECISAO.deleteReserva!,
  deleteVestido:
    "por decisão — a peça sai de linha pelo status (`inativo`, em `vestidos/[id]/editar.tsx`) e não some: contrato e trilha apontam para ela. Apagar é porta de API para o acervo de teste.",
  deleteOrcamento:
    "por decisão — orçamento recusado/vencido é histórico da noiva; a tela muda o status e não apaga (o E162 fez o gate em cima dele).",
  createParcelaAvulsa:
    "por decisão — a parcela avulsa nasce por gesto com vínculo: o reparo (`POST /avarias/:id/cobrar`, F22/E97) e as cobranças do contrato (E217). A porta crua fica para a API.",
};

describe("S-O96 — toda operação do cliente gerado tem chamador, ou dívida com motivo", () => {
  const operacoes = operacoesDoCliente();
  const fonte = fonteDeQuemChama();

  it("o cliente é lido inteiro e o detector enxerga as três formas", () => {
    // Piso: 216 operações em 2026-08-15. Sem ele, um regex quebrado no cliente
    // devolveria zero e a dívida abaixo seria toda "linha morta".
    expect(operacoes.length).toBeGreaterThanOrEqual(200);
    const fonteDeProva = [
      "const { data } = useListReservas(lojaId);",
      "<img src={getGetVestidoFotoUrl(lojaId, id, 0)} />",
      "<a href={`/api/lojas/${lojaId}/contratos/${contrato.id}/pdf`}>PDF</a>",
    ].join("\n");
    const de = (op: string) => operacoes.find((o) => o.op === op)!;
    expect(temChamador("listReservas", de("listReservas").caminhos, fonteDeProva)).toBe("hook");
    expect(temChamador("getVestidoFoto", de("getVestidoFoto").caminhos, fonteDeProva)).toBe("url");
    expect(temChamador("getContratoPdf", de("getContratoPdf").caminhos, fonteDeProva)).toBe("literal");
    // E o que NÃO é chamador: a URL da lista de contratos não é a do PDF, e
    // `/contratos/${id}/pdf-x` não casa com `/pdf` — a régua exige a fronteira.
    expect(temChamador("getReciboPdf", de("getReciboPdf").caminhos, fonteDeProva)).toBeNull();
    expect(temChamador("getContratoPdf", de("getContratoPdf").caminhos, "`/api/lojas/${l}/contratos/${c}/pdf-x`")).toBeNull();
  });

  it("nenhuma operação fica sem chamador e sem julgamento", () => {
    const semGesto = operacoes.filter((o) => temChamador(o.op, o.caminhos, fonte) === null).map((o) => o.op).sort();
    expect(semGesto).toEqual(Object.keys(SEM_GESTO_NO_CLIENTE).sort());
  });

  it("a dívida não guarda linha morta", () => {
    const paga = Object.keys(SEM_GESTO_NO_CLIENTE).filter((op) => {
      const o = operacoes.find((x) => x.op === op);
      return !o || temChamador(op, o.caminhos, fonte) !== null;
    });
    expect(paga, "operação que ganhou gesto (ou saiu do cliente) — tire-a da dívida").toEqual([]);
  });
});
