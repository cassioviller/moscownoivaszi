import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Teste de contrato: garante que TODO path+método documentado no spec
 * OpenAPI (lib/api-spec/openapi.yaml) possui rota equivalente registrada
 * no servidor Express (src/routes/*.ts).
 *
 * Rotas do servidor que não constam no spec geram apenas warning, desde
 * que estejam na allowlist explícita abaixo.
 */

// vitest roda com cwd em artifacts/api-server
const SPEC_PATH = path.resolve(process.cwd(), "../../lib/api-spec/openapi.yaml");
const ROUTES_DIR = path.resolve(process.cwd(), "src/routes");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

// Rotas implementadas no servidor mas (ainda) não documentadas no spec.
// Se adicionar uma rota nova ao servidor, documente-a no spec — só adicione
// aqui em último caso, com justificativa.
const SERVER_ONLY_ALLOWLIST = new Set<string>([
  // Parcelas de um contrato específico (o spec só documenta a listagem geral)
  "GET /lojas/{lojaId}/contratos/{contratoId}/parcelas",
  // Delete de ajuste (spec documenta apenas o PATCH)
  "DELETE /lojas/{lojaId}/ajustes/{ajusteId}",
]);

function extractSpecEndpoints(): Set<string> {
  const raw = readFileSync(SPEC_PATH, "utf-8");
  const lines = raw.split("\n");
  const endpoints = new Set<string>();
  let currentPath: string | null = null;
  let inPaths = false;

  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    // Outro bloco top-level (ex.: components:) encerra a seção paths
    if (inPaths && /^[A-Za-z]/.test(line)) {
      inPaths = false;
    }
    if (!inPaths) continue;

    const pathMatch = line.match(/^  (\/[^\s:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) {
      endpoints.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return endpoints;
}

function extractServerEndpoints(): Set<string> {
  const endpoints = new Set<string>();
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
  const routeRegex = /router\.(get|post|put|patch|delete)\("([^"]+)"/g;

  for (const file of files) {
    const content = readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    for (const match of content.matchAll(routeRegex)) {
      const method = match[1].toUpperCase();
      // normaliza :param → {param}
      const routePath = match[2].replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      endpoints.add(`${method} ${routePath}`);
    }
  }
  return endpoints;
}

describe("contrato API: spec OpenAPI vs rotas Express", () => {
  const specEndpoints = extractSpecEndpoints();
  const serverEndpoints = extractServerEndpoints();

  it("extrai endpoints do spec e do servidor", () => {
    expect(specEndpoints.size).toBeGreaterThan(0);
    expect(serverEndpoints.size).toBeGreaterThan(0);
  });

  it("todo path+método do spec existe no servidor", () => {
    const missing = [...specEndpoints].filter((e) => !serverEndpoints.has(e));
    expect(missing, `Endpoints do spec sem rota no servidor:\n${missing.join("\n")}`).toEqual([]);
  });

  it("rotas do servidor sem spec estão na allowlist", () => {
    const undocumented = [...serverEndpoints].filter((e) => !specEndpoints.has(e));
    for (const endpoint of undocumented) {
      // eslint-disable-next-line no-console
      console.warn(`[contrato-api] rota do servidor sem spec: ${endpoint}`);
    }
    const notAllowed = undocumented.filter((e) => !SERVER_ONLY_ALLOWLIST.has(e));
    expect(
      notAllowed,
      `Rotas do servidor sem spec e fora da allowlist (documente no spec ou adicione à allowlist):\n${notAllowed.join("\n")}`
    ).toEqual([]);
  });

  it("methods HTTP conhecidos", () => {
    for (const endpoint of [...specEndpoints, ...serverEndpoints]) {
      const method = endpoint.split(" ")[0].toLowerCase();
      expect(HTTP_METHODS).toContain(method);
    }
  });
});
