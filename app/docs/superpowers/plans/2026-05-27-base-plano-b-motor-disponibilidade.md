# Plano B — Motor de Disponibilidade (Moscow Noivas / Base) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Motor de Disponibilidade como uma camada isolada de funções puras (`calcularJanelas`, `vestidoDisponivel`) que, dadas as regras da loja e os bloqueios existentes, projeta as janelas prova/uso/lavagem e decide se um vestido está livre para uma data de casamento candidata — com cobertura alta de testes Vitest.

**Architecture:** Módulo puro em `src/lib/disponibilidade/` que **não conhece banco nem tela** (spec §5). Define seus próprios tipos de domínio (independentes do Prisma) para permanecer 100% testável; o consumidor (telas/queries de planos futuros) mapeia as entidades Prisma (`RegraDisponibilidade`, `BloqueioVestido`) para esses tipos. **A fronteira de entrada usa datas como `string` no formato `"YYYY-MM-DD"`** (Grill 4): uma data-só não carrega horário nem fuso, então não há como cair no dia UTC errado — o off-by-one é eliminado por construção, não por documentação. O motor parseia a string para uma `Date` em UTC (`parseDiaUTC`) e faz toda a aritmética de calendário em UTC; as janelas de saída (`Janela`) carregam `Date` em UTC-meia-noite (não ambíguas). O consumidor converte as `Date` do Prisma com `prismaDate.toISOString().slice(0, 10)`.

**Tech Stack:** TypeScript · Vitest · (sem Prisma, sem React — funções puras)

---

## Status: IMPLEMENTADO (2026-05-28) — com ciclo de correções pós-REVIEW

Depende do Plano A (fundação) — já implementado: schema Prisma com `RegraDisponibilidade` e `BloqueioVestido`, seed e Vitest configurado (alias `@` → `./src`, `src/**/*.test.ts`). Este plano **não toca no banco**: são funções puras + testes unitários.

BUILD original concluído em `9de1ef6` (40 testes verdes, `tsc` limpo). REVIEW (`/code-review high b60f1a3..HEAD`) gerou 3 achados; #1 (manutenção em aberto) e #2 (fail-safe em `vestidoDisponivel`) corrigidos via plano `2026-05-28-motor-manutencao-aberta.md`; #3 dispensado por design. Estado atual: 44 testes verdes, `tsc` limpo, REVIEW fechado.

---

## Decisões de design (a serem honradas na implementação)

Mapeamento das janelas a partir de um bloqueio (spec §7.2), já resolvendo as ambiguidades:

| Janela | início | fim |
|---|---|---|
| **prova** | `provaDataReal` ?? (`casamento − provaDiasAntes`) | `provaInicio + provaDuracao` |
| **uso** | `retiradaDataReal` ?? (`casamento − usoDiasAntes`) | ver **Regra de devolução** abaixo |
| **lavagem** | `devolucao` | `devolucao + lavagemDiasDepois` |

**Regra de devolução (define `uso.fim` e a existência da lavagem):**
- `devolucaoDataReal` informada → `uso.fim = devolucaoDataReal`; emite **lavagem** `[devolucao, devolucao + lavagemDiasDepois]`.
- **`retiradaDataReal` informada e `devolucaoDataReal` ainda `null` (retirou, não devolveu)** → vestido fora da loja por tempo indeterminado: `uso = [retiradaDataReal, FUTURO_DISTANTE)` — janela **aberta**, **sem** projeção de devolução e **sem** lavagem (a lavagem só existe após devolução real).
- nenhuma data real (projeção pura) → `devolucao = casamento + usoDiasDepois`; lavagem normal.

1. **Retirou e não devolveu = bloqueio aberto, nunca projeção (Grill 2 — decisão de negócio da Moscow Noivas).** Se `retiradaDataReal` existe e `devolucaoDataReal` é `null`, o vestido está fisicamente fora da loja e permanece **indisponível** até a devolução real ser registrada — `uso` vira `[retiradaDataReal, FUTURO_DISTANTE)`. O motor **não** projeta uma devolução esperada para reliberar o vestido: o custo de liberar um vestido único que não voltou supera em muito o de segurá-lo um dia a mais. Só no caso de **projeção pura** (sem nenhuma data real) `uso.fim` e `lavagem.inicio` compartilham `devolucao = casamento + usoDiasDepois`.
2. **Manutenção = `[retiradaDataReal, devolucaoDataReal)`.** O spec não define quais campos delimitam um bloqueio de manutenção; reutilizamos os dois campos de data reais já existentes em `BloqueioVestido` como o período fora de serviço. Meio-aberto como as demais janelas (Grill 1): `devolucaoDataReal` é o primeiro dia de volta ao serviço. Gera **uma** janela do tipo `manutencao`. **Manutenção em aberto** (`retiradaDataReal` presente, `devolucaoDataReal` `null`): janela `[retiradaDataReal, FUTURO_DISTANTE)`, simétrico ao Grill 2 — o vestido está fora por tempo indeterminado e fica indisponível até a devolução ser registrada. Se a manutenção sempre terá data de volta é decisão da borda/CRUD (plano futuro); o motor não fecha essa porta. Ver spec `docs/superpowers/specs/2026-05-27-motor-manutencao-aberta-design.md`.
3. **Intervalos meio-abertos `[inicio, fim)`, sobreposição estrita (Grill 1).** `fim` é o "primeiro dia livre": `fim = inicio + duração`, então a duração configurada bate exatamente com os dias bloqueados (sem dia-fantasma). Encostar na borda (`devolveu dia X → nova retirada dia X`) **não** é conflito — locações back-to-back são permitidas, o que para um vestido único é venda sem risco. Teste: `a.inicio < b.fim && b.inicio < a.fim`. A guarda de invariante (decisão 6) usa `inicio > fim` (estritamente maior), pois janela de comprimento zero `[X, X)` é legítima (bloqueio vazio) e simplesmente nunca sobrepõe. Se a loja quiser um respiro entre noivas, isso vira um `bufferDias` explícito num plano futuro — nunca um `<=` escondido.
4. **Tipos de domínio próprios.** O motor não importa nada do Prisma; usa `tipo: "reserva_casamento" | "manutencao"` (minúsculo). As datas de **entrada** (`Bloqueio`, `casamentoDataCandidata`) são `string "YYYY-MM-DD"`; as de **saída** (`Janela`) são `Date` UTC. O mapeamento dos enums Prisma (`RESERVA_CASAMENTO`/`MANUTENCAO`) e a conversão `Date → "YYYY-MM-DD"` ficam a cargo do consumidor, em plano futuro.
5. **Datas inválidas = erro explícito.** `calcularJanelas` lança se faltar `casamentoData` numa reserva, ou `retiradaDataReal` numa manutenção (a `devolucaoDataReal` é opcional: ausente = em aberto) — são invariantes de integridade que o CRUD (plano futuro) garante.
6. **Guarda de invariante `inicio <= fim` (Grill 2).** Toda janela projetada é validada antes de sair de `calcularJanelas`. Se `inicio > fim` (ex.: devolução real anterior à retirada — erro de digitação no CRUD), a função **lança**. Janela invertida nunca passa em silêncio: sob sobreposição ela "sumiria" e liberaria o vestido indevidamente — exatamente o erro mais caro.
7. **Predicado operacional `pendenteDevolucao(bloqueio)` (Grill 2).** Expõe `retiradaDataReal != null && devolucaoDataReal == null` para a loja sinalizar "pendente de devolução" e cobrar a baixa. Mantém a regra num lugar só, sem espalhar o `&&` pela UI (consumido por planos futuros: agenda/alertas).
8. **Datas de entrada como `string "YYYY-MM-DD"` (Grill 4).** A fronteira pública recebe datas-só, não `Date`. `parseDiaUTC` valida o formato e rejeita datas impossíveis (ex.: `"2026-02-30"`, `"2026-13-01"`) que `Date.UTC` normalizaria em silêncio. Elimina por construção o off-by-one de fuso (uma `Date` com horário local poderia cair no dia UTC vizinho); a corretude vira garantia de tipo, não convenção que o chamador precisa lembrar.

---

## File Structure

- `src/lib/disponibilidade/tipos.ts` — tipos de domínio (`Regras`, `Bloqueio`, `Janela`, `Conflito`, `Veredito`, `TipoJanela`, `TipoBloqueio`). Sem lógica.
- `src/lib/disponibilidade/datas.ts` — helpers puros de data: `parseDiaUTC` (string `"YYYY-MM-DD"` → `Date` UTC), `addDias`, `janelasSobrepoem`.
- `src/lib/disponibilidade/motor.ts` — núcleo: `calcularJanelas(bloqueio, regras)` e `vestidoDisponivel(params)`.
- `src/lib/disponibilidade/index.ts` — barrel: superfície pública do módulo.
- `src/lib/disponibilidade/__tests__/datas.test.ts` — testes dos helpers de data.
- `src/lib/disponibilidade/__tests__/motor.test.ts` — testes de janelas, sobreposições e cenários do spec §10.

Decisão de decomposição: `datas.ts` isola a aritmética de calendário (a parte com mais armadilhas — viradas de mês/ano); `motor.ts` contém só a regra de negócio e fica legível ao depender de helpers nomeados; `tipos.ts` separado mantém o contrato do domínio num lugar só.

---

## Task 1: Tipos de domínio + helpers de data (UTC)

**Files:**
- Create: `src/lib/disponibilidade/tipos.ts`
- Create: `src/lib/disponibilidade/datas.ts`
- Test: `src/lib/disponibilidade/__tests__/datas.test.ts`

- [x] **Step 1: Criar os tipos de domínio em `tipos.ts`**

```typescript
// Camada de domínio do Motor de Disponibilidade.
// Tipos próprios (independentes do Prisma) para manter o motor 100% puro:
// não conhece banco nem tela. O consumidor mapeia as entidades Prisma para estes tipos.

export type TipoJanela = "prova" | "uso" | "lavagem" | "manutencao";

export type TipoBloqueio = "reserva_casamento" | "manutencao";

export interface Regras {
  provaDiasAntes: number;
  provaDuracao: number;
  usoDiasAntes: number;
  usoDiasDepois: number;
  lavagemDiasDepois: number;
}

export interface Bloqueio {
  id: string;
  vestidoId: string;
  tipo: TipoBloqueio;
  // Datas de ENTRADA como "YYYY-MM-DD" (Grill 4): sem horário/fuso, sem off-by-one.
  casamentoData: string | null;
  provaDataReal: string | null;
  retiradaDataReal: string | null;
  devolucaoDataReal: string | null;
}

export interface Janela {
  tipo: TipoJanela;
  // Datas de SAÍDA já parseadas: Date em UTC-meia-noite (não ambíguas).
  inicio: Date;
  fim: Date;
}

export interface Conflito {
  bloqueioId: string;
  janelaCandidata: Janela;
  janelaExistente: Janela;
}

export interface Veredito {
  disponivel: boolean;
  conflitos: Conflito[];
}
```

- [x] **Step 2: Escrever o teste que falha para os helpers de data**

```typescript
import { describe, it, expect } from "vitest";
import { addDias, parseDiaUTC, janelasSobrepoem } from "../datas";
import type { Janela } from "../tipos";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

describe("parseDiaUTC", () => {
  it('parseia "YYYY-MM-DD" para a meia-noite em UTC', () => {
    expect(parseDiaUTC("2026-06-20")).toEqual(dia(2026, 6, 20));
  });
  it("rejeita formato inválido", () => {
    expect(() => parseDiaUTC("20/06/2026")).toThrow(/YYYY-MM-DD/);
  });
  it("rejeita data fora do calendário (não normaliza em silêncio)", () => {
    expect(() => parseDiaUTC("2026-02-30")).toThrow(/inválida/i);
    expect(() => parseDiaUTC("2026-13-01")).toThrow(/inválida/i);
  });
});

describe("addDias", () => {
  it("subtrai dias dentro do mês", () => {
    expect(addDias(dia(2026, 6, 20), -14)).toEqual(dia(2026, 6, 6));
  });
  it("vira o ano para frente", () => {
    expect(addDias(dia(2026, 12, 31), 1)).toEqual(dia(2027, 1, 1));
  });
  it("vira o mês para trás (fevereiro)", () => {
    expect(addDias(dia(2026, 3, 1), -1)).toEqual(dia(2026, 2, 28));
  });
});

describe("janelasSobrepoem", () => {
  const j = (ini: Date, fim: Date): Janela => ({ tipo: "uso", inicio: ini, fim });
  it("detecta sobreposição parcial", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 18), dia(2026, 6, 23))),
    ).toBe(true);
  });
  it("NÃO sobrepõe quando uma janela começa exatamente onde a outra termina (meio-aberto)", () => {
    // devolveu 22/6 → nova retirada 22/6 é permitida (back-to-back)
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 22), dia(2026, 6, 25))),
    ).toBe(false);
  });
  it("sobrepõe quando o início cai um dia antes do fim da outra", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 21), dia(2026, 6, 25))),
    ).toBe(true);
  });
  it("não sobrepõe quando há um dia de folga", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 23), dia(2026, 6, 25))),
    ).toBe(false);
  });
});
```

- [x] **Step 3: Rodar o teste e ver falhar**

Run: `npm test -- src/lib/disponibilidade/__tests__/datas.test.ts`
Expected: FAIL — `Failed to resolve import "../datas"` (arquivo ainda não existe).

- [x] **Step 4: Implementar `datas.ts`**

```typescript
import type { Janela } from "./tipos";

/**
 * Parseia uma data-só "YYYY-MM-DD" para a meia-noite em UTC (Grill 4).
 * Sem horário/fuso na entrada → sem off-by-one. Rejeita formato inválido e
 * datas impossíveis ("2026-02-30", "2026-13-01") que Date.UTC normalizaria.
 */
export function parseDiaUTC(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    throw new Error(`Data inválida "${s}": esperado o formato "YYYY-MM-DD".`);
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Data inválida "${s}": dia ou mês fora do calendário.`);
  }
  return d;
}

/**
 * Soma (ou subtrai, com n negativo) dias a uma data em UTC.
 * Recebe sempre uma Date em UTC-meia-noite (de parseDiaUTC ou de outro addDias);
 * setUTCDate trata viradas de mês e ano corretamente.
 */
export function addDias(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/**
 * Duas janelas se sobrepõem se compartilham ao menos um dia.
 * Intervalos meio-abertos `[inicio, fim)`: `fim` é o primeiro dia livre, então
 * encostar na borda (`a.fim == b.inicio`) NÃO é conflito — back-to-back é permitido.
 */
export function janelasSobrepoem(a: Janela, b: Janela): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}
```

- [x] **Step 5: Rodar o teste e ver passar**

Run: `npm test -- src/lib/disponibilidade/__tests__/datas.test.ts`
Expected: PASS — 10 testes verdes.

- [x] **Step 6: Commit**

```bash
git add src/lib/disponibilidade/tipos.ts src/lib/disponibilidade/datas.ts src/lib/disponibilidade/__tests__/datas.test.ts
git commit -m "feat: tipos de dominio e helpers de data (UTC) do motor de disponibilidade"
```

---

## Task 2: `calcularJanelas` — projeção e ancoragem das janelas

**Files:**
- Create: `src/lib/disponibilidade/motor.ts`
- Test: `src/lib/disponibilidade/__tests__/motor.test.ts`

- [x] **Step 1: Escrever os testes que falham para `calcularJanelas`**

```typescript
import { describe, it, expect } from "vitest";
import { calcularJanelas, pendenteDevolucao, FUTURO_DISTANTE } from "../motor";
import type { Bloqueio, Regras } from "../tipos";

// dia → Date UTC (para as janelas de SAÍDA, que são Date)
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
// ds → "YYYY-MM-DD" (para as datas de ENTRADA do Bloqueio, que são string — Grill 4)
const ds = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const REGRAS: Regras = {
  provaDiasAntes: 14,
  provaDuracao: 2,
  usoDiasAntes: 3,
  usoDiasDepois: 2,
  lavagemDiasDepois: 7,
};

describe("calcularJanelas — reserva de casamento (projeção)", () => {
  const reserva: Bloqueio = {
    id: "b1",
    vestidoId: "v1",
    tipo: "reserva_casamento",
    casamentoData: ds(2026, 6, 20),
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  };
  const janelas = calcularJanelas(reserva, REGRAS);

  it("projeta 3 janelas: prova, uso e lavagem, nessa ordem", () => {
    expect(janelas.map((x) => x.tipo)).toEqual(["prova", "uso", "lavagem"]);
  });
  it("ancora a PROVA em casamento − provaDiasAntes, com provaDuracao", () => {
    const prova = janelas.find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 6, 6));
    expect(prova.fim).toEqual(dia(2026, 6, 8));
  });
  it("ancora o USO de casamento − usoDiasAntes até casamento + usoDiasDepois", () => {
    const uso = janelas.find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 17));
    expect(uso.fim).toEqual(dia(2026, 6, 22));
  });
  it("ancora a LAVAGEM no fim do uso (devolução) + lavagemDiasDepois", () => {
    const lavagem = janelas.find((x) => x.tipo === "lavagem")!;
    expect(lavagem.inicio).toEqual(dia(2026, 6, 22));
    expect(lavagem.fim).toEqual(dia(2026, 6, 29));
  });
});

describe("calcularJanelas — datas reais recalculam as janelas", () => {
  it("usa provaDataReal no lugar da projeção quando informada", () => {
    const reserva: Bloqueio = {
      id: "b2", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: ds(2026, 6, 1),
      retiradaDataReal: null, devolucaoDataReal: null,
    };
    const prova = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 6, 1));
    expect(prova.fim).toEqual(dia(2026, 6, 3));
  });
  it("ancora uso.fim e lavagem em devolucaoDataReal quando informada", () => {
    const reserva: Bloqueio = {
      id: "b3", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null, retiradaDataReal: null,
      devolucaoDataReal: ds(2026, 6, 25),
    };
    const janelas = calcularJanelas(reserva, REGRAS);
    const uso = janelas.find((x) => x.tipo === "uso")!;
    const lavagem = janelas.find((x) => x.tipo === "lavagem")!;
    expect(uso.fim).toEqual(dia(2026, 6, 25));
    expect(lavagem.inicio).toEqual(dia(2026, 6, 25));
    expect(lavagem.fim).toEqual(dia(2026, 7, 2));
  });
});

describe("calcularJanelas — manutenção", () => {
  it("gera uma única janela entre retirada e devolução reais", () => {
    const manut: Bloqueio = {
      id: "m1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19),
      devolucaoDataReal: ds(2026, 6, 21),
    };
    expect(calcularJanelas(manut, REGRAS)).toEqual([
      { tipo: "manutencao", inicio: dia(2026, 6, 19), fim: dia(2026, 6, 21) },
    ]);
  });
  it("lança se faltar uma das datas reais da manutenção", () => {
    const manut: Bloqueio = {
      id: "m2", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    expect(() => calcularJanelas(manut, REGRAS)).toThrow(/manuten/i);
  });
});

describe("calcularJanelas — virada de ano nas contas de dias", () => {
  it("projeta a prova no ano anterior quando o casamento é em janeiro", () => {
    const reserva: Bloqueio = {
      id: "b4", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2027, 1, 2),
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    const prova = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "prova")!;
    expect(prova.inicio).toEqual(dia(2026, 12, 19));
    expect(prova.fim).toEqual(dia(2026, 12, 21));
  });
  it("lança se faltar casamentoData numa reserva", () => {
    const reserva: Bloqueio = {
      id: "b5", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: null,
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    expect(() => calcularJanelas(reserva, REGRAS)).toThrow(/casamento/i);
  });
});

describe("calcularJanelas — retirou e NÃO devolveu (bloqueio aberto, Grill 2)", () => {
  const base = {
    id: "b6", vestidoId: "v1", tipo: "reserva_casamento" as const,
    casamentoData: ds(2026, 6, 20),
    provaDataReal: null, devolucaoDataReal: null,
  };

  it("abre o uso de retiradaDataReal até FUTURO_DISTANTE e NÃO emite lavagem", () => {
    const reserva: Bloqueio = { ...base, retiradaDataReal: ds(2026, 6, 17) };
    const janelas = calcularJanelas(reserva, REGRAS);
    expect(janelas.map((x) => x.tipo)).toEqual(["prova", "uso"]); // sem lavagem
    const uso = janelas.find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 17));
    expect(uso.fim).toEqual(FUTURO_DISTANTE);
  });

  it("NÃO projeta devolução: retirada depois do casamento continua bloqueando", () => {
    // sem este comportamento, casamento + usoDiasDepois (22/6) reliberaria o vestido
    const reserva: Bloqueio = { ...base, retiradaDataReal: ds(2026, 6, 22) };
    const uso = calcularJanelas(reserva, REGRAS).find((x) => x.tipo === "uso")!;
    expect(uso.inicio).toEqual(dia(2026, 6, 22));
    expect(uso.fim).toEqual(FUTURO_DISTANTE);
  });
});

describe("calcularJanelas — guarda de invariante (inicio <= fim)", () => {
  it("lança quando a devolução real é anterior à retirada real (janela invertida)", () => {
    const reserva: Bloqueio = {
      id: "b7", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 22),
      devolucaoDataReal: ds(2026, 6, 18), // antes da retirada → inválido
    };
    expect(() => calcularJanelas(reserva, REGRAS)).toThrow(/invertida/i);
  });
});

describe("pendenteDevolucao", () => {
  const base = {
    id: "b8", vestidoId: "v1", tipo: "reserva_casamento" as const,
    casamentoData: ds(2026, 6, 20), provaDataReal: null,
    retiradaDataReal: ds(2026, 6, 17),
  };
  it("true quando há retirada sem devolução", () => {
    expect(pendenteDevolucao({ ...base, devolucaoDataReal: null })).toBe(true);
  });
  it("false quando a devolução já foi registrada", () => {
    expect(pendenteDevolucao({ ...base, devolucaoDataReal: ds(2026, 6, 22) })).toBe(false);
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/disponibilidade/__tests__/motor.test.ts`
Expected: FAIL — `Failed to resolve import "../motor"`.

- [x] **Step 3: Implementar `calcularJanelas` em `motor.ts`**

```typescript
import type { Bloqueio, Conflito, Janela, Regras, Veredito } from "./tipos";
import { addDias, parseDiaUTC, janelasSobrepoem } from "./datas";

/**
 * Sentinela de "fim em aberto": usada quando o vestido está fora da loja por
 * tempo indeterminado (retirado e ainda não devolvido — Grill 2). Mantém a
 * janela de uso válida (inicio <= fim) e bloqueando qualquer consulta futura
 * até a devolução real ser registrada.
 */
export const FUTURO_DISTANTE = new Date(Date.UTC(9999, 11, 31));

/** true quando o vestido foi retirado mas a devolução ainda não foi registrada. */
export function pendenteDevolucao(bloqueio: Bloqueio): boolean {
  return bloqueio.retiradaDataReal != null && bloqueio.devolucaoDataReal == null;
}

/** Garante a invariante de calendário: toda janela projetada tem inicio <= fim. */
function validarJanela(j: Janela, bloqueioId: string): Janela {
  if (j.inicio.getTime() > j.fim.getTime()) {
    throw new Error(
      `Janela ${j.tipo} invertida no bloqueio ${bloqueioId}: ` +
        `inicio ${j.inicio.toISOString()} > fim ${j.fim.toISOString()}.`,
    );
  }
  return j;
}

/**
 * Projeta as janelas bloqueadas de um bloqueio, segundo as regras da loja.
 * - reserva_casamento → [prova, uso, (lavagem)], ancoradas em datas reais quando houver.
 * - manutencao        → [manutencao], entre retiradaDataReal e devolucaoDataReal.
 * Lança se faltarem datas obrigatórias ou se alguma janela ficar invertida.
 */
export function calcularJanelas(bloqueio: Bloqueio, regras: Regras): Janela[] {
  if (bloqueio.tipo === "manutencao") {
    if (!bloqueio.retiradaDataReal || !bloqueio.devolucaoDataReal) {
      throw new Error(
        `Bloqueio de manutenção ${bloqueio.id} exige retiradaDataReal e devolucaoDataReal.`,
      );
    }
    return [
      validarJanela(
        {
          tipo: "manutencao",
          inicio: parseDiaUTC(bloqueio.retiradaDataReal),
          fim: parseDiaUTC(bloqueio.devolucaoDataReal),
        },
        bloqueio.id,
      ),
    ];
  }

  // reserva_casamento
  if (!bloqueio.casamentoData) {
    throw new Error(`Bloqueio de reserva ${bloqueio.id} exige casamentoData.`);
  }
  const casamento = parseDiaUTC(bloqueio.casamentoData);

  const provaInicio = bloqueio.provaDataReal
    ? parseDiaUTC(bloqueio.provaDataReal)
    : addDias(casamento, -regras.provaDiasAntes);
  const provaFim = addDias(provaInicio, regras.provaDuracao);

  const usoInicio = bloqueio.retiradaDataReal
    ? parseDiaUTC(bloqueio.retiradaDataReal)
    : addDias(casamento, -regras.usoDiasAntes);

  const janelas: Janela[] = [{ tipo: "prova", inicio: provaInicio, fim: provaFim }];

  if (bloqueio.devolucaoDataReal) {
    // Devolução registrada: uso fecha na devolução; lavagem segue a partir dela.
    const devolucao = parseDiaUTC(bloqueio.devolucaoDataReal);
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: devolucao });
    janelas.push({
      tipo: "lavagem",
      inicio: devolucao,
      fim: addDias(devolucao, regras.lavagemDiasDepois),
    });
  } else if (bloqueio.retiradaDataReal) {
    // Grill 2: retirou e NÃO devolveu → vestido fora por tempo indeterminado.
    // Uso aberto até a devolução real ser registrada; sem projeção e sem lavagem.
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: FUTURO_DISTANTE });
  } else {
    // Projeção pura a partir do casamento.
    const devolucao = addDias(casamento, regras.usoDiasDepois);
    janelas.push({ tipo: "uso", inicio: usoInicio, fim: devolucao });
    janelas.push({
      tipo: "lavagem",
      inicio: devolucao,
      fim: addDias(devolucao, regras.lavagemDiasDepois),
    });
  }

  return janelas.map((j) => validarJanela(j, bloqueio.id));
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/disponibilidade/__tests__/motor.test.ts`
Expected: PASS — todos os testes de `calcularJanelas` verdes.

- [x] **Step 5: Commit**

```bash
git add src/lib/disponibilidade/motor.ts src/lib/disponibilidade/__tests__/motor.test.ts
git commit -m "feat: calcularJanelas (prova/uso/lavagem + manutencao) do motor de disponibilidade"
```

---

## Task 3: `vestidoDisponivel` — veredito por sobreposição de janelas

**Files:**
- Modify: `src/lib/disponibilidade/motor.ts` (adicionar `vestidoDisponivel`)
- Modify: `src/lib/disponibilidade/__tests__/motor.test.ts` (adicionar bloco de testes)

- [x] **Step 1: Adicionar os testes que falham para `vestidoDisponivel`**

Acrescente ao final de `src/lib/disponibilidade/__tests__/motor.test.ts` (e inclua `vestidoDisponivel` no import do topo: `import { calcularJanelas, vestidoDisponivel } from "../motor";`):

```typescript
describe("vestidoDisponivel — cenários do spec §10", () => {
  const reservaEm = (id: string, data: string): Bloqueio => ({
    id,
    vestidoId: "v1",
    tipo: "reserva_casamento",
    casamentoData: data,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  });

  it("BLOQUEIA quando há um casamento existente sobreposto", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e1", ds(2026, 6, 21))],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos.length).toBeGreaterThan(0);
    expect(r.conflitos[0].bloqueioId).toBe("e1");
  });

  it("LIBERA quando o casamento existente está distante", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e2", ds(2026, 9, 1))],
    });
    expect(r.disponivel).toBe(true);
    expect(r.conflitos).toEqual([]);
  });

  it("BLOQUEIA quando há manutenção sobreposta", () => {
    const manut: Bloqueio = {
      id: "m1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: ds(2026, 6, 21),
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [manut],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("m1");
  });

  it("IGNORA bloqueios de outro vestido", () => {
    const outro: Bloqueio = { ...reservaEm("e3", ds(2026, 6, 21)), vestidoId: "v2" };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [outro],
    });
    expect(r.disponivel).toBe(true);
  });

  it("LIBERA um casamento próximo quando as datas reais moveram o uso para longe", () => {
    // mesmo casamento 06-21, mas prova/retirada/devolução reais empurram tudo para julho
    const movido: Bloqueio = {
      id: "e4", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 21),
      provaDataReal: ds(2026, 7, 10),
      retiradaDataReal: ds(2026, 7, 18),
      devolucaoDataReal: ds(2026, 7, 24),
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [movido],
    });
    expect(r.disponivel).toBe(true);
  });

  it("acumula conflitos de todas as janelas que se sobrepõem", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [reservaEm("e1", ds(2026, 6, 21))],
    });
    // mesmo vestido, datas coladas: prova×prova e uso×uso colidem
    expect(r.conflitos.length).toBeGreaterThanOrEqual(2);
    expect(r.conflitos.every((c) => c.bloqueioId === "e1")).toBe(true);
  });

  it("LIBERA ao editar a própria reserva (excluirBloqueioId evita a auto-colisão, Grill 3)", () => {
    // e1 já existe em 20/6; movemos para 22/6 — sem excluir, ela colidiria consigo mesma
    const existente = reservaEm("e1", ds(2026, 6, 20));
    const semExcluir = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 22),
      regras: REGRAS,
      bloqueiosExistentes: [existente],
    });
    expect(semExcluir.disponivel).toBe(false); // colide com a própria versão atual

    const comExcluir = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 22),
      regras: REGRAS,
      bloqueiosExistentes: [existente],
      excluirBloqueioId: "e1",
    });
    expect(comExcluir.disponivel).toBe(true);
    expect(comExcluir.conflitos).toEqual([]);
  });

  it("BLOQUEIA qualquer data futura enquanto o bloqueio segue pendente de devolução (Grill 2)", () => {
    // retirou em junho, sem devolução: uso aberto até FUTURO_DISTANTE
    const pendente: Bloqueio = {
      id: "e5", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: ds(2026, 6, 20),
      provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 17),
      devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 12, 25), // bem distante
      regras: REGRAS,
      bloqueiosExistentes: [pendente],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("e5");
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/disponibilidade/__tests__/motor.test.ts`
Expected: FAIL — `vestidoDisponivel is not a function` / não exportada.

- [x] **Step 3: Implementar `vestidoDisponivel` em `motor.ts`**

Acrescente ao final de `src/lib/disponibilidade/motor.ts`:

```typescript
export interface VestidoDisponivelParams {
  /** Vestido sendo avaliado; só bloqueios deste vestido entram na conta. */
  vestidoId: string;
  /** Data de casamento hipotética ("YYYY-MM-DD") para a qual queremos saber se o vestido está livre. */
  casamentoDataCandidata: string;
  regras: Regras;
  /** Bloqueios existentes (idealmente já filtrados por loja+vestido na query). */
  bloqueiosExistentes: Bloqueio[];
  /**
   * Ao revalidar/editar uma reserva já existente, passe seu id aqui para que ela
   * não colida consigo mesma. Sem isso, mover a data de uma reserva sempre daria
   * "indisponível" porque a versão atual ainda está em bloqueiosExistentes.
   */
  excluirBloqueioId?: string;
}

/**
 * Um vestido está LIVRE para a data candidata quando as janelas projetadas dessa
 * data (como se fosse uma nova reserva) não se sobrepõem a nenhuma janela dos
 * bloqueios existentes do mesmo vestido. Filtra por vestidoId por segurança.
 */
export function vestidoDisponivel(params: VestidoDisponivelParams): Veredito {
  const { vestidoId, casamentoDataCandidata, regras, bloqueiosExistentes, excluirBloqueioId } = params;

  const candidato: Bloqueio = {
    id: "__candidato__",
    vestidoId,
    tipo: "reserva_casamento",
    casamentoData: casamentoDataCandidata,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
  };
  const janelasCandidata = calcularJanelas(candidato, regras);

  const conflitos: Conflito[] = [];
  for (const bloqueio of bloqueiosExistentes) {
    if (bloqueio.vestidoId !== vestidoId) continue;
    if (excluirBloqueioId && bloqueio.id === excluirBloqueioId) continue; // edição: não colide consigo mesma
    const janelasExistente = calcularJanelas(bloqueio, regras);
    for (const janelaCandidata of janelasCandidata) {
      for (const janelaExistente of janelasExistente) {
        if (janelasSobrepoem(janelaCandidata, janelaExistente)) {
          conflitos.push({ bloqueioId: bloqueio.id, janelaCandidata, janelaExistente });
        }
      }
    }
  }

  return { disponivel: conflitos.length === 0, conflitos };
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/disponibilidade/__tests__/motor.test.ts`
Expected: PASS — todos os testes do motor verdes (janelas + disponibilidade).

- [x] **Step 5: Commit**

```bash
git add src/lib/disponibilidade/motor.ts src/lib/disponibilidade/__tests__/motor.test.ts
git commit -m "feat: vestidoDisponivel (veredito por sobreposicao de janelas)"
```

---

## Task 4: Superfície pública (barrel) + suíte completa verde

**Files:**
- Create: `src/lib/disponibilidade/index.ts`

- [x] **Step 1: Criar o barrel `index.ts`**

```typescript
export { calcularJanelas, vestidoDisponivel, pendenteDevolucao, FUTURO_DISTANTE } from "./motor";
export type { VestidoDisponivelParams } from "./motor";
export { addDias, parseDiaUTC, janelasSobrepoem } from "./datas";
export type {
  Regras,
  Bloqueio,
  Janela,
  Conflito,
  Veredito,
  TipoJanela,
  TipoBloqueio,
} from "./tipos";
```

- [x] **Step 2: Conferir que o import público resolve via alias `@`**

Crie temporariamente e rode um teste de fumaça do barrel — adicione `src/lib/disponibilidade/__tests__/api.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { vestidoDisponivel, type Regras } from "@/lib/disponibilidade";

const REGRAS: Regras = {
  provaDiasAntes: 14, provaDuracao: 2, usoDiasAntes: 3, usoDiasDepois: 2, lavagemDiasDepois: 7,
};

describe("superfície pública do motor", () => {
  it("expõe vestidoDisponivel pelo barrel (@/lib/disponibilidade)", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: "2026-06-20",
      regras: REGRAS,
      bloqueiosExistentes: [],
    });
    expect(r.disponivel).toBe(true);
  });
});
```

- [x] **Step 3: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — testes do motor (datas + janelas + disponibilidade + api) **e** os 6 testes de seed do Plano A continuam verdes.

- [x] **Step 4: Conferir tipos (sem `any` escondido)**

Run: `npx tsc --noEmit`
Expected: sem erros de tipo no módulo `src/lib/disponibilidade/`.

- [x] **Step 5: Commit**

```bash
git add src/lib/disponibilidade/index.ts src/lib/disponibilidade/__tests__/api.test.ts
git commit -m "feat: barrel publico do motor de disponibilidade + smoke test da API"
```

---

## Self-Review

**1. Spec coverage (contra o spec da Base, §7 e §10):**
- §7.1 Regras por loja (`provaDiasAntes`, `provaDuracao`, `usoDiasAntes`, `usoDiasDepois`, `lavagemDiasDepois`) → tipo `Regras` (Task 1), nomes idênticos aos campos de `RegraDisponibilidade` do schema. ✓
- §7.2 Ancoragem das janelas (datas reais ?? projeção a partir do casamento) → `calcularJanelas` (Task 2), com a tabela de decisão registrada no topo. ✓
- §7.2 estado transitório "retirou e não devolveu" → bloqueio aberto `[retiradaDataReal, FUTURO_DISTANTE)`, sem projeção de devolução nem lavagem (Grill 2). Coberto por testes do estado transitório (Task 2) e pelo cenário "pendente de devolução bloqueia data futura" (Task 3). Predicado `pendenteDevolucao` para o alerta operacional. ✓
- Robustez: guarda de invariante `inicio <= fim` em `calcularJanelas` (lança em janela invertida) — coberto pelo teste da guarda (Task 2). ✓
- Edição de reserva existente: `excluirBloqueioId` opcional em `vestidoDisponivel` evita a auto-colisão ao revalidar/mover uma reserva já gravada (Grill 3) — coberto pelo teste de edição (Task 3). ✓
- Convenção de intervalo: meio-aberto `[inicio, fim)` com sobreposição estrita `<` (Grill 1) — `fim` é o primeiro dia livre, back-to-back permitido; coberto pelos testes de borda em `datas.test.ts`. ✓
- Fronteira de data: entrada como `string "YYYY-MM-DD"` parseada por `parseDiaUTC` (Grill 4) — mata o off-by-one de fuso por construção; rejeita formato inválido e datas impossíveis, coberto pelos testes de `parseDiaUTC` em `datas.test.ts`. ✓
- §7.3 `calcularJanelas(bloqueio, regras)` e `vestidoDisponivel(...)` → Tasks 2 e 3. ✓
- §7.3 regra de decisão (livre = janelas projetadas não se sobrepõem às dos bloqueios existentes do mesmo vestido) → `vestidoDisponivel` + `janelasSobrepoem` (Task 3). ✓
- §5 camada isolada, sem tela nem banco, 100% testável → módulo puro, tipos próprios, zero import de Prisma/React. ✓
- §10 cenários mínimos: sobrepostos (bloqueia) ✓, distantes (libera) ✓, manutenção (bloqueia) ✓, data real que move a janela (recalcula) ✓ (em Task 2 e no cenário "movido" da Task 3), viradas de mês/ano ✓ (datas.test + janela de janeiro). ✓
- **Fora de escopo (planos futuros):** mapeamento Prisma→domínio, query que carrega regras+bloqueios por loja, tela de agenda e a listagem de vestidos indisponíveis no cadastro de lead. Este plano entrega só o núcleo puro + testes.

**2. Placeholder scan:** Nenhum "TBD/TODO". Todo passo de código mostra o código completo; todo passo de comando traz o comando e o resultado esperado. ✓

**3. Type consistency:** `Regras`, `Bloqueio`, `Janela`, `Conflito`, `Veredito`, `TipoJanela`, `TipoBloqueio` definidos na Task 1 e usados sem divergência nas Tasks 2-4. `calcularJanelas(bloqueio, regras)`, `vestidoDisponivel(params)` e `pendenteDevolucao(bloqueio)` têm a mesma assinatura em definição, testes e barrel; `FUTURO_DISTANTE` exportado do motor e reexportado pelo barrel, consumido nos testes do estado transitório. `tipo` de bloqueio (`"reserva_casamento"|"manutencao"`) e de janela (`"prova"|"uso"|"lavagem"|"manutencao"`) consistentes entre tipos, implementação e testes. **Fronteira de data (Grill 4):** entrada `string "YYYY-MM-DD"` em `Bloqueio` e `casamentoDataCandidata`; `parseDiaUTC` (string→`Date`) substitui `inicioDoDiaUTC` em `datas.ts`, motor e barrel; saída `Janela` permanece `Date` UTC. Nos testes, o helper `ds(a,m,d)` produz as strings de entrada e `dia(a,m,d)` as `Date` esperadas — sem `Date` cru nos fixtures de entrada. ✓

---

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-05-27-base-plano-b-motor-disponibilidade.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por tarefa, reviso entre tarefas, iteração rápida. (Requer o sub-skill `superpowers:subagent-driven-development`.)

**2. Execução inline** — executo as tarefas nesta sessão com checkpoints para revisão. (Requer o sub-skill `superpowers:executing-plans`.)

Qual abordagem?
