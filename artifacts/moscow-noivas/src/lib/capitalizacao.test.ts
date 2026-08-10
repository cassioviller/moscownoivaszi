import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E21/E99 — sentence case nos títulos, e o teste que impede a volta.
 *
 * O app misturava três convenções na mesma tela: "Atendimentos do Dia" ao lado
 * de "Fotos do vestido" e de "Histórico de contato". Title Case é convenção do
 * inglês; em português ele lê como texto de máquina — o mesmo motivo pelo qual
 * o E92 matou os nove `className="capitalize"` que produziam "Julho De 2026".
 *
 * A varredura vale mais que a correção: sem ela, o próximo `<CardTitle>` volta
 * a ser escrito em Title Case e ninguém percebe, porque o sintoma é uma tela
 * levemente estranha e não um vermelho.
 *
 * **A régua é frouxa de propósito**: só reprova a SEGUNDA palavra em diante com
 * inicial maiúscula, e perdoa nomes próprios e siglas (a lista abaixo). Um
 * detector rígido acusaria "Pix" e "WhatsApp", e um teste que grita errado é
 * desligado na semana seguinte.
 */

const RAIZ = join(import.meta.dirname, "..");

/** Nomes próprios e siglas que SOBEM legitimamente no meio da frase. */
const PROPRIOS = new Set([
  "WhatsApp",
  "Pix",
  "CSV",
  "PDF",
  "LGPD",
  "Moscow",
  "Noivas",
  "Instagram",
  "DRE",
]);

/**
 * A enumeração sai do versionamento, não do disco (S-D30). Caminhos relativos
 * a `src/`.
 */
function arquivosTsx(): string[] {
  return arquivosVersionados(RAIZ, ["."]).filter((r) => r.endsWith(".tsx"));
}

/** `<CardTitle …>Texto literal</CardTitle>` — só os que não interpolam. */
function titulosLiterais(fonte: string): string[] {
  const achados: string[] = [];
  const re = /<CardTitle[^>]*>([^<{}]+)<\/CardTitle>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const texto = m[1]!.trim();
    if (texto) achados.push(texto);
  }
  return achados;
}

/** Palavras da segunda em diante que começam em maiúscula e não são próprias. */
export function palavrasEmTitleCase(titulo: string): string[] {
  return titulo
    .split(/\s+/)
    .slice(1)
    .filter((p) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(p) && !PROPRIOS.has(p.replace(/[.,:—-]+$/, "")));
}

describe("E21 — títulos em sentence case", () => {
  it("a régua perdoa nome próprio e reprova Title Case", () => {
    expect(palavrasEmTitleCase("Atendimentos do dia")).toEqual([]);
    expect(palavrasEmTitleCase("Enviar por WhatsApp")).toEqual([]);
    expect(palavrasEmTitleCase("Atendimentos do Dia")).toEqual(["Dia"]);
    expect(palavrasEmTitleCase("Membros da Equipe")).toEqual(["Equipe"]);
  });

  it("nenhum <CardTitle> do app está em Title Case", () => {
    const ofensores: string[] = [];
    for (const relativo of arquivosTsx()) {
      for (const titulo of titulosLiterais(readFileSync(join(RAIZ, relativo), "utf8"))) {
        const palavras = palavrasEmTitleCase(titulo);
        if (palavras.length > 0) {
          ofensores.push(`src/${relativo}: "${titulo}" → ${palavras.join(", ")}`);
        }
      }
    }
    expect(ofensores).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 120 arquivos `.tsx` versionados em `src/` — com folga para
   * baixo.
   */
  it("a varredura olha os arquivos de verdade, não um conjunto vazio", () => {
    expect(arquivosTsx().length).toBeGreaterThan(100);
  });
});
