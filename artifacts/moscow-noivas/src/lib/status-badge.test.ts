import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VARIANTE_DA_SEMANTICA,
  varianteAtivo,
  varianteSituacao,
  varianteStatusContrato,
  varianteStatusOrcamento,
} from "./status-badge";

describe("E130 — a tabela semântica do badge (P6)", () => {
  it("a tabela é a decidida — mudar aqui é mudar a decisão de produto", () => {
    expect(VARIANTE_DA_SEMANTICA).toEqual({
      emDia: "default",
      emAndamento: "default",
      terminouBem: "secondary",
      terminouMal: "destructive",
      inativo: "outline",
      precisaDeReacao: "aviso",
    });
  });

  it("'Faltou' se distingue de 'Agendado' sem ler o texto — o achado A1 literal", () => {
    expect(varianteSituacao("FALTOU")).not.toBe(varianteSituacao("AGENDADO"));
    expect(varianteSituacao("FALTOU")).toBe("aviso");
  });

  it("Recusado e Cancelado são a mesma notícia — terminou mal", () => {
    expect(varianteStatusOrcamento("RECUSADO")).toBe(varianteStatusContrato("CANCELADO"));
    expect(varianteStatusOrcamento("RECUSADO")).toBe("destructive");
  });

  it("cabine e vestido falam a mesma língua: ativo em dia, inativo apagado", () => {
    expect(varianteAtivo(true)).toBe("default");
    expect(varianteAtivo(false)).toBe("outline");
  });

  it("situação desconhecida degrada para em dia — status novo não vira alarme por engano", () => {
    expect(varianteSituacao("INVENTADO")).toBe("default");
  });
});

describe("a varredura: o mapeamento inline não volta às telas migradas", () => {
  // O mesmo desenho do E99 (escala-dinheiro): a decisão mora em
  // `status-badge.ts`; um `variant={x === "FALTOU" ? …}` numa dessas telas é a
  // gramática se desfazendo em silêncio.
  const RAIZ = join(import.meta.dirname, "..");
  const TELAS = [
    "pages/dashboard.tsx",
    "pages/atendimentos/index.tsx",
    "pages/agenda/index.tsx",
    "pages/vestidos/index.tsx",
    "pages/vestidos/[id].tsx",
    "pages/contratos/index.tsx",
    "pages/orcamentos/index.tsx",
  ];
  // `variant={` com comparação de status/situação/ativo na vizinhança — em
  // JANELA de 3 linhas, não por linha: o prettier separa atributo e condição,
  // e foi exatamente essa fresta que escondeu o ofensor do E127 (lição S-D7).
  // `(?!variante` deixa passar a forma certa — `variant={varianteSituacao(…)}`
  // — e o `[=!?]` exige comparação/ternário, que é o que define o inline.
  const INLINE = /variant=\{(?!variante)[^}]*(situacao|status|ativo)\s*[=!?]/s;

  it.each(TELAS)("%s não mapeia status→variant inline", (tela) => {
    const linhas = readFileSync(join(RAIZ, tela), "utf8").split("\n");
    const ofensores: string[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const janela = linhas.slice(i, i + 3).join("\n");
      if (linhas[i].includes("variant={") && INLINE.test(janela)) {
        ofensores.push(`${tela}:${i + 1}: ${janela.trim().slice(0, 80)}`);
      }
    }
    expect(ofensores).toEqual([]);
  });
});
