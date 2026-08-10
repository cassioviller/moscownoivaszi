import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateContratoBody, CreateLeadBody } from "@workspace/api-zod";
import { erroDeValidacao } from "../lib/erros";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E96/B13 — o 400 de validação para de falar inglês e passa a dizer ONDE.
 *
 * Noventa e cinco rotas devolviam `{ error: parsed.error.message }`, e o
 * `message` de um ZodError é o JSON do array de issues: a tela recebia
 * `[{"code":"invalid_type","path":["valorTotal"],"message":"Invalid input"}]` e
 * despejava aquilo num toast vermelho, na cara de quem está vendendo.
 */
describe("erroDeValidacao — código estável e motivo em português", () => {
  it("o caminho do campo vira endereço que a tela usa para marcar o input", () => {
    // O MESMO schema que a rota usa — não uma imitação dele.
    const r = CreateContratoBody.safeParse({
      leadId: "abc",
      vendedoraId: "def",
      valorTotal: "mil reais",
      formaPagamento: "BITCOIN",
      parcelas: [{ numero: 1, valorPrevisto: "cem", vencimento: "2026-08-10T12:00:00-03:00" }],
    });
    expect(r.success).toBe(false);
    const corpo = erroDeValidacao(r.error);

    expect(corpo.error).toBe("CORPO_INVALIDO");
    const campos = corpo.campos.map((c) => c.campo);
    expect(campos).toContain("valorTotal");
    expect(campos).toContain("formaPagamento");
    // Caminho aninhado com índice — é o formato de `path` do react-hook-form.
    expect(campos).toContain("parcelas.0.valorPrevisto");
  });

  it("nenhum motivo sai em inglês, e nenhum é o JSON do Zod", () => {
    const r = CreateLeadBody.safeParse({ noivaNome: "", origem: "TELEPATIA" });
    const corpo = erroDeValidacao(r.error!);
    expect(corpo.campos.length).toBeGreaterThan(0);
    for (const { motivo } of corpo.campos) {
      expect(motivo).not.toMatch(/expected|received|invalid|required|too_/i);
      expect(motivo).not.toContain("{");
      expect(motivo.length).toBeGreaterThan(0);
    }
    // O limite é dito com o NÚMERO — "pelo menos 1", não "too small".
    expect(corpo.campos.find((c) => c.campo === "noivaNome")!.motivo).toContain("1");
  });

  it("erro que não é do Zod não inventa campo", () => {
    expect(erroDeValidacao(new Error("qualquer coisa"))).toEqual({
      error: "CORPO_INVALIDO",
      campos: [],
    });
    expect(erroDeValidacao(undefined).campos).toEqual([]);
  });
});

/**
 * A varredura: é greppável e cabe num unitário, então não depende de alguém
 * lembrar. Uma rota nova que devolva `error.message` cru volta a vazar JSON do
 * Zod para a tela — e o teste é o único lugar onde isso é barato de perceber.
 */
describe("nenhuma rota devolve o texto cru do Zod (B13)", () => {
  const raiz = join(__dirname, "..");

  /**
   * A enumeração sai do versionamento, não do disco (S-D30). `__tests__` fica
   * de fora como antes: teste CITA a grafia errada para prová-la.
   */
  function arquivosTs(): string[] {
    return arquivosVersionados(raiz, ["."]).filter(
      (r) => r.endsWith(".ts") && !r.split("/").includes("__tests__"),
    );
  }

  it("`error: <x>.error.message` não existe em rota nem middleware nenhum", () => {
    const ofensores: string[] = [];
    for (const relativo of arquivosTs()) {
      const conteudo = readFileSync(join(raiz, relativo), "utf8");
      conteudo.split("\n").forEach((linha, i) => {
        // Só a forma que RESPONDE com o texto do Zod; comentário e log ficam.
        if (/error:\s*\w+\.error\.message/.test(linha) && !linha.trimStart().startsWith("*")) {
          ofensores.push(`src/${relativo}:${i + 1}`);
        }
      });
    }
    expect(ofensores).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 51 arquivos `.ts` versionados em `src/`, fora `__tests__` —
   * com folga para baixo.
   */
  it("a varredura olha os arquivos de verdade, não um conjunto vazio", () => {
    expect(arquivosTs().length).toBeGreaterThan(40);
  });
});
