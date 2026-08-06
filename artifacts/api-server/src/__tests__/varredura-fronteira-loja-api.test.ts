import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * A varredura da fronteira: **toda** rota `/lojas/:lojaId/...` recusa a loja da
 * outra pessoa — não as nove que eu escolhi à mão.
 *
 * O E111 achou o guard de loja pulado em dez routers e escreveu um teste com
 * uma LISTA de caminhos digitada por mim. Aquilo prova os dez de hoje e não
 * prova o décimo primeiro: router novo montado sem path volta a nascer aberto, e
 * o teste segue verde porque ninguém acrescentou a linha.
 *
 * Aqui os recursos saem do CÓDIGO — `routes/*.ts` são lidos e cada
 * `/lojas/:lojaId/<recurso>` distinto vira um caso. É a mesma forma da
 * varredura do E101 (`e101-acao-da-rota-api.test.ts`), pela mesma razão: o que
 * se enumera à mão para de crescer sozinho.
 *
 * **O que ela NÃO prova**, e está dito para ninguém confundir cobertura com
 * garantia: ela chama o GET de cada recurso. Uma rota de escrita cujo escopo
 * dependa de outro guard continua sendo assunto do teste dela.
 */

const RAIZ_ROTAS = join(import.meta.dirname, "..", "routes");

/**
 * Recursos servidos sob `/lojas/:lojaId/`, extraídos do código.
 *
 * Só o PRIMEIRO segmento depois do `:lojaId` interessa — é ele que identifica o
 * router, e é o router que monta (ou não) o guard. `/financeiro/parcelas` e
 * `/financeiro/dre` respondem pelo mesmo `router.use`.
 */
function recursosDeLoja(): string[] {
  const achados = new Set<string>();
  for (const arquivo of readdirSync(RAIZ_ROTAS).filter((f) => f.endsWith(".ts"))) {
    const conteudo = readFileSync(join(RAIZ_ROTAS, arquivo), "utf8");
    // Comentários fora: eles CITAM caminhos para explicar decisões, e uma
    // varredura que lê documentação inventa recurso que não existe.
    const fonte = conteudo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const re = /router\.(?:get|post|patch|put|delete|use)\(\s*"\/lojas\/:lojaId\/([^/"]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      const recurso = m[1]!;
      if (!recurso.startsWith(":")) achados.add(recurso);
    }
  }
  return [...achados].sort();
}

describe("varredura — a loja da URL é conferida em TODA rota de loja", () => {
  let A: Fixture;
  let B: Fixture;
  let agenteA: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    A = await criarFixture();
    B = await criarFixture();
    // O SUPERADMIN de propósito: ele tem bypass de MÓDULO (`requireModulo`
    // libera), então o único gate que pode recusá-lo é o da fronteira. Com uma
    // vendedora comum, um 403 poderia estar vindo da permissão e o teste
    // passaria sem provar nada sobre a loja.
    agenteA = await loginComLoja(A.superAdminEmail, A.lojaId);
  });

  afterAll(async () => {
    await limparFixture(A);
    await limparFixture(B);
    await fecharPool();
  });

  it("a lista de recursos sai do código e não está vazia", () => {
    const recursos = recursosDeLoja();
    expect(recursos.length).toBeGreaterThan(10);
    // Âncoras: se o extrator quebrar, ele devolve lista vazia ou lixo, e um
    // `toBeGreaterThan` sozinho não acusaria.
    expect(recursos).toContain("leads");
    expect(recursos).toContain("contratos");
    expect(recursos).toContain("financeiro");
  });

  it("NENHUM recurso responde 200 para a loja de outra pessoa", async () => {
    const vazaram: string[] = [];
    for (const recurso of recursosDeLoja()) {
      const r = await agenteA.get(`/api/lojas/${B.lojaId}/${recurso}`);
      // 403 é o esperado (fronteira). 404 e 400 também não vazam nada — a rota
      // pode exigir sub-caminho ou query. O que não pode é 200 com dado de B.
      if (r.status === 200) vazaram.push(`${recurso} → 200`);
    }
    expect(vazaram).toEqual([]);
  });

  it("e o 403 vem da FRONTEIRA, não de permissão — a loja de casa responde", async () => {
    const r = await agenteA.get(`/api/lojas/${B.lojaId}/leads`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("LOJA_DIVERGE_DA_SESSAO");
    await agenteA.get(`/api/lojas/${A.lojaId}/leads`).expect(200);
  });
});
