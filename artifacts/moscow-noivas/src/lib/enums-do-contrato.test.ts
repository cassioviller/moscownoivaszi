import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LeadOrigem,
  AtributoTipo,
  AtendimentoTipo,
  OrcamentoItemTipo,
} from "@workspace/api-client-react";

/**
 * S11 — os `z.enum` dos formulários não podem divergir do contrato.
 *
 * O D5 propunha DERIVAR os resolvers dos 12 formulários do `api-zod`, e a
 * medição do E96 derrubou a proposta por dois motivos que continuam de pé: o
 * schema gerado descreve o PAYLOAD e o formulário valida a SUPERFÍCIE DE
 * ENTRADA (`entrada`/`numParcelas` não existem no corpo da API), e importar o
 * barril de 261 KB / 539 schemas trocaria dívida de duplicação por dívida de
 * peso. O caminho barato que a sobra deixou escrito é este: **teste de
 * paridade**.
 *
 * **A contagem da sobra envelheceu, e é o que a regra 20 manda conferir.** Ela
 * dizia "a duplicação real medida é UM enum de cada lado, não doze"; hoje são
 * **quatro**. Nenhum divergia — o custo até agora foi zero —, mas quatro cópias
 * crescendo em silêncio é como a primeira nasceu.
 *
 * O que uma divergência custa: o formulário recusa no cliente um valor que a
 * API aceita (a opção some da tela e ninguém sabe por quê), ou aceita um que a
 * API recusa (a vendedora preenche, salva, e leva 400 na cara da noiva).
 *
 * A leitura é TEXTUAL de propósito. Importar o schema do formulário exigiria
 * montar o módulo da tela inteira — com React, rotas e query — para conferir uma
 * lista de strings.
 */

const SRC = join(import.meta.dirname, "..");

/** Os valores do `z.enum([...])` de um campo, lidos do arquivo da tela. */
function enumDoFormulario(arquivo: string, campo: string): string[] {
  const src = readFileSync(join(SRC, arquivo), "utf8");
  const m = src.match(new RegExp(`${campo}:\\s*z\\.enum\\(\\[([^\\]]+)\\]`));
  if (!m) throw new Error(`z.enum de \`${campo}\` não encontrado em ${arquivo}`);
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const PARES = [
  {
    o_que: "a origem da noiva",
    arquivo: "pages/noivas/noiva-form.tsx",
    campo: "origem",
    doContrato: LeadOrigem,
  },
  {
    o_que: "o tipo do atributo do catálogo",
    arquivo: "pages/catalogo/novo.tsx",
    campo: "tipo",
    doContrato: AtributoTipo,
  },
  {
    o_que: "o tipo do compromisso na agenda",
    arquivo: "pages/atendimentos/novo.tsx",
    campo: "tipo",
    doContrato: AtendimentoTipo,
  },
  {
    o_que: "o tipo do item do orçamento",
    arquivo: "pages/orcamentos/[id].tsx",
    campo: "tipo",
    doContrato: OrcamentoItemTipo,
  },
] as const;

describe("S11 — os enums do formulário e os do contrato dizem a mesma coisa", () => {
  for (const { o_que, arquivo, campo, doContrato } of PARES) {
    it(`${o_que} — ${arquivo}`, () => {
      // Ordenados: o que importa é o CONJUNTO. Um valor novo no contrato que a
      // tela não oferece é tão defeito quanto o contrário, e nas duas direções
      // a lista some ou sobra sem ninguém ser avisado.
      expect(enumDoFormulario(arquivo, campo).sort()).toEqual(Object.values(doContrato).sort());
    });
  }

  it("a varredura reprova de verdade quando o formulário fica para trás", () => {
    // Um valor a menos no formulário é o caso real: o contrato ganha `ESTOQUE`
    // (E154) e a tela continua oferecendo quatro tipos.
    const doFormulario = ["VESTIDO", "ACESSORIO", "SERVICO", "AJUSTE"];
    expect(doFormulario.sort()).not.toEqual(Object.values(OrcamentoItemTipo).sort());
  });

  it("o leitor falha alto quando o campo muda de forma, em vez de aprovar vazio", () => {
    // Se alguém trocar o `z.enum` por outra coisa, o teste tem de QUEBRAR — um
    // leitor que devolve lista vazia calaria a paridade inteira.
    expect(() => enumDoFormulario("pages/noivas/noiva-form.tsx", "campoQueNaoExiste")).toThrow();
  });
});
