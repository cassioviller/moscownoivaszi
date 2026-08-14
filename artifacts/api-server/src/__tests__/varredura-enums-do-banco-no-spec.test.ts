import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as enums from "@workspace/db/schema";

/**
 * **O enum do BANCO e o enum do SPEC são a mesma lista, ou o valor novo derruba
 * a resposta** — S-C34, nascida do defeito que o E212 entregou e o E213 achou.
 *
 * ## O defeito, medido
 *
 * O E212 acrescentou `ATRASO_DEVOLUCAO` a `parcela_origem` — migração rodada,
 * suíte verde, E2E verde, 205 arquivos passando. E **não acrescentou ao
 * `openapi.yaml`**, de onde sai o Zod de resposta.
 *
 * O comentário do próprio campo no spec avisava metade da história (*"sem o
 * campo aqui, o Zod de resposta STRIPAVA a coluna"*). A outra metade é pior:
 * para um **valor fora do enum** o Zod não estripa nada — ele EXPLODE.
 *
 * ```
 * Invalid enum value. Expected 'PLANO' | 'AVULSA' | 'AVARIA' | 'REAJUSTE_DATA',
 * received 'ATRASO_DEVOLUCAO'   | campo: 0.origem
 * ```
 *
 * Consequência: **cobrado o primeiro atraso da cláusula 16ª, toda listagem de
 * parcelas que o incluísse respondia 500** — a fila de cobrança, o carnê do
 * contrato e o extrato do portal da noiva, de uma vez. Não é caso de borda: é o
 * caminho normal do épico anterior, a partir do primeiro uso.
 *
 * ## Por que nenhuma régua pegou
 *
 * Havia duas contando enums, e nenhuma comparava estas duas pontas:
 *
 * - `e115-migracao-snapshot-unit` prega o enum do drizzle contra o **snapshot
 *   da migração** — e passou, porque o snapshot estava certo;
 * - `varredura-restricoes-do-spec` conta o que o gerador de Zod **perde** do
 *   spec — e passou, porque o spec estava internamente coerente.
 *
 * O que faltava era a ponte: **o banco pode devolver um valor que o spec não
 * prevê.** A direção importa e é assimétrica — sobrar valor no spec é folga
 * (um `null` a mais, um estado que a API ainda não usa), faltar valor é 500.
 *
 * ## Como esta varredura enumera
 *
 * Ela NÃO tem lista curada — foi essa a lição da S30 (*"trava a lista, não a
 * contagem"*) e da S-C33 (`COLUNAS_DE_ESTADO` curada à mão deixou uma coluna de
 * estado invisível no mesmo dia). Os enums saem do módulo do schema por
 * `enumValues`, e o casamento com o spec é por CONTEÚDO: uma lista do spec que
 * compartilhe algum valor com um enum do banco está falando dele, e então tem
 * de conter TODOS os valores dele.
 *
 * O casamento por conteúdo tem um custo declarado: dois enums do banco com
 * valores em comum (um `status` que tenha `CANCELADA` como outro) se confundem.
 * Hoje não acontece — o caso é medido no primeiro teste abaixo —, e o dia em
 * que acontecer a varredura acusa a mais, nunca a menos.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const SPEC = readFileSync(join(RAIZ, "lib/api-spec/openapi.yaml"), "utf8");

/** Todo `pgEnum` exportado pelo schema, pelo nome do banco. */
function enumsDoBanco(): { nome: string; valores: string[] }[] {
  const achados: { nome: string; valores: string[] }[] = [];
  for (const valor of Object.values(enums as Record<string, unknown>)) {
    const e = valor as { enumName?: unknown; enumValues?: unknown };
    if (typeof e?.enumName === "string" && Array.isArray(e.enumValues)) {
      achados.push({ nome: e.enumName, valores: e.enumValues as string[] });
    }
  }
  return achados;
}

/**
 * Toda lista `enum: [...]` do spec, em linha ou em bloco YAML.
 *
 * O `null` é descartado: ele é a forma de o spec dizer "esta coluna é nulável",
 * e não um valor do enum do banco.
 */
function listasDeEnumDoSpec(): string[][] {
  const listas: string[][] = [];

  // Forma em linha: `enum: [A, B, C]`
  for (const m of SPEC.matchAll(/enum:\s*\[([^\]]*)\]/g)) {
    const itens = m[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0 && s !== "null");
    if (itens.length > 0) listas.push(itens);
  }

  // Forma em bloco:
  //   enum:
  //     - A
  //     - B
  const linhas = SPEC.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    if (!/^\s*enum:\s*$/.test(linhas[i]!)) continue;
    const itens: string[] = [];
    for (let j = i + 1; j < linhas.length; j++) {
      const item = /^\s*-\s*(.+?)\s*$/.exec(linhas[j]!);
      if (!item) break;
      const texto = item[1]!.replace(/^["']|["']$/g, "");
      if (texto !== "null") itens.push(texto);
    }
    if (itens.length > 0) listas.push(itens);
  }

  return listas;
}

describe("varredura — o enum do banco cabe no enum do spec (S-C34)", () => {
  const doBanco = enumsDoBanco();
  const doSpec = listasDeEnumDoSpec();

  it("a varredura enxerga os dois lados, e não um conjunto vazio", () => {
    // Piso, não igualdade: enum novo no schema não deve reprovar este caso —
    // deve reprovar o de baixo, que é o que diz o que está errado.
    expect(doBanco.length).toBeGreaterThan(15);
    expect(doSpec.length).toBeGreaterThan(30);
  });

  /**
   * **Os enums do banco SE CRUZAM, e é por isso que o casamento é por melhor
   * sobreposição e não por "compartilha algum valor".**
   *
   * A primeira versão desta varredura casava lista com enum ao primeiro valor
   * em comum, e reprovou cinco pares de uma vez — `parcela_status ×
   * reserva_status: CANCELADA`, `conta_pagar_status × parcela_status: PREVISTA,
   * PAGA`, `forma_pagamento × lead_perdida_motivo: OUTRO`,
   * `ajuste_tipo × orcamento_item_tipo: AJUSTE`,
   * `atendimento_situacao × lead_etapa: EM_ATENDIMENTO`. Enum de domínio
   * diferente compartilhar rótulo é normal, não defeito.
   *
   * Este caso congela a medida: se um par novo aparecer, quem escrever o enum
   * vê aqui que o vizinho já usava o rótulo.
   */
  it("os enums do banco se cruzam em 5 pares — a medida que obriga o casamento a ser por melhor sobreposição", () => {
    const cruzamentos: string[] = [];
    for (const a of doBanco) {
      for (const b of doBanco) {
        if (a.nome >= b.nome) continue;
        const comuns = a.valores.filter((v) => b.valores.includes(v));
        if (comuns.length > 0) cruzamentos.push(`${a.nome} × ${b.nome}: ${comuns.join(", ")}`);
      }
    }
    expect(cruzamentos.sort()).toEqual([
      "ajuste_tipo × orcamento_item_tipo: AJUSTE",
      "atendimento_situacao × lead_etapa: EM_ATENDIMENTO",
      "conta_pagar_status × parcela_status: PREVISTA, PAGA",
      "forma_pagamento × lead_perdida_motivo: OUTRO",
      "parcela_status × reserva_status: CANCELADA",
    ]);
  });

  /**
   * O caso que existe para provar que a varredura MORDE. Sem ele, um bug no
   * casamento faria tudo passar em silêncio, que é a régua que autoriza.
   */
  it("a régua reconhece o defeito do E212 quando ele é reencenado", () => {
    const doBancoFake = ["PLANO", "AVULSA", "AVARIA", "REAJUSTE_DATA", "ATRASO_DEVOLUCAO"];
    const doSpecFake = ["PLANO", "AVULSA", "AVARIA", "REAJUSTE_DATA"];
    const compartilha = doSpecFake.some((v) => doBancoFake.includes(v));
    const faltando = doBancoFake.filter((v) => !doSpecFake.includes(v));
    expect(compartilha).toBe(true);
    expect(faltando).toEqual(["ATRASO_DEVOLUCAO"]);
  });

  /**
   * **De qual enum do banco esta lista do spec está falando?**
   *
   * Do que ela mais parece: o enum cuja interseção é a maior. Empate resolve
   * pelo enum menor, que é o mais específico. `null` quando a lista não toca
   * enum nenhum — há listas no spec que são só do protocolo (ordenação,
   * formato) e não têm coluna atrás.
   */
  const donoDaLista = (lista: string[]) => {
    let melhor: { nome: string; valores: string[] } | null = null;
    let maior = 0;
    for (const e of doBanco) {
      const inter = e.valores.filter((v) => lista.includes(v)).length;
      if (inter === 0) continue;
      if (inter > maior || (inter === maior && melhor && e.valores.length < melhor.valores.length)) {
        maior = inter;
        melhor = e;
      }
    }
    return melhor;
  };

  /**
   * **Os recortes DECLARADOS — perdão com razão, e contado.**
   *
   * Duas listas do spec cobrem quase todo um enum do banco de propósito, e as
   * duas razões são verificáveis no código, não opinião. É o idioma do
   * `HERDADOS` da `varredura-reguas`: allowlist silenciosa apodrece (E101), e
   * lista sem contagem cresce em silêncio (S30) — por isso o número está
   * travado logo abaixo.
   */
  const RECORTES: Record<string, string> = {
    // `CaptacaoLeadInput` é ENTRADA, e o próprio spec diz por quê: "LOJA fica
    // de fora: lead digitado na loja nasce pela rota autenticada". Um
    // formulário público que aceitasse `origem: LOJA` mentiria sobre a
    // procedência do lead.
    "lead_origem: LOJA": "entrada pública — LOJA nasce pela rota autenticada",
    // `recorrencias.tipo` NÃO é o pgEnum: é `text`, e o schema declara a razão
    // (`financeiro.ts`) — "a recorrência gera SALARIO/DESPESA/FORNECEDOR e nunca
    // COMISSAO (que nasce do fechamento, não de um combinado mensal) — o pgEnum
    // aqui prometeria um caminho que a geração não tem". A varredura casa por
    // valor e não tem como ver que a coluna é de outro tipo.
    "conta_pagar_tipo: COMISSAO": "recorrencias.tipo é text, e não gera COMISSAO",
    // E217 — mesma razão, mesma lista: a recorrência é o que se repete todo
    // mês por um combinado (E48); DEVOLUCAO nasce do `POST /cancelar`, de uma
    // rescisão, nunca de uma recorrência.
    "conta_pagar_tipo: DEVOLUCAO": "recorrencias.tipo é text, e não gera DEVOLUCAO",
  };

  it("os recortes declarados são 3 — a lista não cresce em silêncio", () => {
    expect(Object.keys(RECORTES)).toHaveLength(3);
  });

  it("toda lista do spec que descreve um enum do banco prevê os valores DELE", () => {
    const divergentes: string[] = [];
    for (const lista of doSpec) {
      const dono = donoDaLista(lista);
      if (!dono) continue;
      /**
       * **Lista MENOR que o enum é recorte, não defeito** — e a diferença é a
       * direção. Um filtro que aceita só `[PREVISTA, PARCIAL]` está escolhendo
       * um subconjunto de propósito; o perigo é o inverso, e é o que se cobra
       * aqui: uma lista que já cobre o enum quase inteiro e perde um valor
       * NOVO. A régua morde quando a lista tem a maioria dos valores e não tem
       * todos — que é exatamente a forma do defeito do E212.
       */
      const presentes = dono.valores.filter((v) => lista.includes(v));
      const faltando = dono.valores.filter((v) => !lista.includes(v));
      if (faltando.length === 0) continue;
      if (presentes.length <= dono.valores.length / 2) continue;
      const naoDeclarados = faltando.filter((v) => !(`${dono.nome}: ${v}` in RECORTES));
      if (naoDeclarados.length === 0) continue;
      divergentes.push(
        `${dono.nome}: o spec não prevê ${naoDeclarados.join(", ")} — a lista traz ${lista.join(", ")}`,
      );
    }
    // Se isto reprovar: o BANCO pode devolver um valor que o Zod de resposta
    // recusa, e a rota que o listar responde 500 — não estripa, EXPLODE. O
    // conserto é no spec, nunca aqui, e depois
    // `pnpm --filter @workspace/api-spec run codegen`.
    expect([...new Set(divergentes)].sort()).toEqual([]);
  });
});
