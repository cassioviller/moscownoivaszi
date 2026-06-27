# Motor de Disponibilidade — Manutenção em aberto + fail-safe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a manutenção em aberto representável (`[retirada, FUTURO_DISTANTE)`) e blindar `vestidoDisponivel` para que um bloqueio existente malformado nunca derrube a consulta nem libere o vestido.

**Architecture:** Mudanças contidas no módulo puro `src/lib/disponibilidade/` (sem banco, sem tela). Dois pontos: (1) o branch `manutencao` de `calcularJanelas` ganha o caso "sem devolução = em aberto", simétrico ao Grill 2 das reservas; (2) `vestidoDisponivel` envolve cada `calcularJanelas(bloqueioExistente)` em `try/catch` que reporta o erro em `errosBloqueio` e força `disponivel: false` — fail-safe conservador (decisão #6 do Plano B: janela "sumida" jamais pode liberar o vestido). O `calcularJanelas` do candidato fica **fora** do try (input do chamador continua lançando).

**Tech Stack:** TypeScript, Vitest 4. Testes: `npm test` (`vitest run`). Tipos: `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-05-27-motor-manutencao-aberta-design.md`

---

## File Structure

- **Modify** `src/lib/disponibilidade/tipos.ts` — adicionar `interface ErroBloqueio`; adicionar campo `errosBloqueio: ErroBloqueio[]` em `Veredito`.
- **Modify** `src/lib/disponibilidade/motor.ts` — reescrever o branch `manutencao` de `calcularJanelas` (linhas ~35-51); envolver o laço de `vestidoDisponivel` em `try/catch` e incluir `errosBloqueio` no retorno (linhas ~118-147); importar `ErroBloqueio` de `./tipos`.
- **Modify** `src/lib/disponibilidade/index.ts` — reexportar o tipo `ErroBloqueio`.
- **Modify** `src/lib/disponibilidade/__tests__/motor.test.ts` — trocar o teste m2; adicionar testes de manutenção aberta, fail-safe e candidato inválido.
- **Modify** `docs/superpowers/plans/2026-05-27-base-plano-b-motor-disponibilidade.md` — decisões #2 e #5.
- **Modify** `docs/workflow-skills.md` — snapshot, após o verde.

---

## Task 1: Manutenção em aberto (achado #1)

**Files:**
- Modify: `src/lib/disponibilidade/motor.ts:35-51`
- Test: `src/lib/disponibilidade/__tests__/motor.test.ts:91-98` (substitui) + dois testes novos

- [ ] **Step 1: Trocar o teste m2 (RED) e adicionar os testes novos de manutenção**

Em `src/lib/disponibilidade/__tests__/motor.test.ts`, **substituir** o `it` atual (linhas 91-98):

```ts
  it("lança se faltar uma das datas reais da manutenção", () => {
    const manut: Bloqueio = {
      id: "m2", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    expect(() => calcularJanelas(manut, REGRAS)).toThrow(/manuten/i);
  });
```

por estes três `it` (manutenção em aberto não lança mais; lançar agora exige falta de retirada):

```ts
  it("manutenção SEM devolução fica em aberto: [retirada, FUTURO_DISTANTE)", () => {
    const manut: Bloqueio = {
      id: "m2", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    expect(calcularJanelas(manut, REGRAS)).toEqual([
      { tipo: "manutencao", inicio: dia(2026, 6, 19), fim: FUTURO_DISTANTE },
    ]);
  });
  it("manutenção SEM retirada continua lançando (sem âncora de início)", () => {
    const manut: Bloqueio = {
      id: "m3", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: null, devolucaoDataReal: ds(2026, 6, 21),
    };
    expect(() => calcularJanelas(manut, REGRAS)).toThrow(/retirada/i);
  });
  it("manutenção em aberto BLOQUEIA uma data candidata futura", () => {
    const manutAberta: Bloqueio = {
      id: "ma1", vestidoId: "v1", tipo: "manutencao",
      casamentoData: null, provaDataReal: null,
      retiradaDataReal: ds(2026, 6, 19), devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 12, 25),
      regras: REGRAS,
      bloqueiosExistentes: [manutAberta],
    });
    expect(r.disponivel).toBe(false);
    expect(r.conflitos[0].bloqueioId).toBe("ma1");
  });
```

(`FUTURO_DISTANTE`, `vestidoDisponivel`, `dia`, `ds`, `REGRAS` já estão importados/definidos no topo do arquivo — linhas 2-16.)

- [ ] **Step 2: Rodar os testes para ver o RED**

Run: `npm test -- motor.test.ts`
Expected: FAIL. O teste "manutenção SEM devolução fica em aberto" falha porque o código atual **lança** (`exige retiradaDataReal e devolucaoDataReal`); "BLOQUEIA uma data candidata futura" também falha pelo mesmo throw.

- [ ] **Step 3: Reescrever o branch `manutencao` em `calcularJanelas`**

Em `src/lib/disponibilidade/motor.ts`, **substituir** o bloco atual (linhas 35-51):

```ts
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
```

por:

```ts
  if (bloqueio.tipo === "manutencao") {
    if (!bloqueio.retiradaDataReal) {
      throw new Error(`Bloqueio de manutenção ${bloqueio.id} exige retiradaDataReal.`);
    }
    // Manutenção em aberto (sem devolução registrada): vestido fora por tempo
    // indeterminado → bloqueia até a volta ser registrada, simétrico ao Grill 2.
    const inicio = parseDiaUTC(bloqueio.retiradaDataReal);
    const fim = bloqueio.devolucaoDataReal
      ? parseDiaUTC(bloqueio.devolucaoDataReal)
      : FUTURO_DISTANTE;
    return [validarJanela({ tipo: "manutencao", inicio, fim }, bloqueio.id)];
  }
```

Também atualizar o JSDoc de `calcularJanelas` (linha ~31): trocar
`* - manutencao        → [manutencao], entre retiradaDataReal e devolucaoDataReal.`
por
`* - manutencao        → [manutencao], de retiradaDataReal até devolucaoDataReal (ou FUTURO_DISTANTE se em aberto).`

- [ ] **Step 4: Rodar os testes para ver o GREEN**

Run: `npm test -- motor.test.ts`
Expected: PASS. Todos os testes de manutenção passam; nenhuma regressão nos demais.

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/disponibilidade/motor.ts src/lib/disponibilidade/__tests__/motor.test.ts
git commit -m "fix(disponibilidade): manutencao em aberto bloqueia ate FUTURO_DISTANTE (achado #1)"
```

---

## Task 2: Fail-safe em `vestidoDisponivel` + `errosBloqueio` (achado #2)

**Files:**
- Modify: `src/lib/disponibilidade/tipos.ts`
- Modify: `src/lib/disponibilidade/motor.ts:1` (import) e `:118-147` (função)
- Modify: `src/lib/disponibilidade/index.ts`
- Test: `src/lib/disponibilidade/__tests__/motor.test.ts` (dois testes novos no final do `describe("vestidoDisponivel — cenários do spec §10")`)

- [ ] **Step 1: Escrever os testes do fail-safe (RED)**

Em `src/lib/disponibilidade/__tests__/motor.test.ts`, adicionar dentro do `describe("vestidoDisponivel — cenários do spec §10", ...)` (antes do `});` que fecha esse describe) os dois `it`:

```ts
  it("FAIL-SAFE: bloqueioExistente malformado deixa indisponível e reporta erro, sem crash", () => {
    // reserva sem casamentoData → calcularJanelas lança "exige casamentoData"
    const malformado: Bloqueio = {
      id: "x1", vestidoId: "v1", tipo: "reserva_casamento",
      casamentoData: null,
      provaDataReal: null, retiradaDataReal: null, devolucaoDataReal: null,
    };
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: ds(2026, 6, 20),
      regras: REGRAS,
      bloqueiosExistentes: [malformado],
    });
    expect(r.disponivel).toBe(false);          // fail-safe: nunca libera por erro
    expect(r.conflitos).toEqual([]);           // não houve conflito de janela...
    expect(r.errosBloqueio).toHaveLength(1);   // ...mas o erro foi reportado
    expect(r.errosBloqueio[0].bloqueioId).toBe("x1");
    expect(r.errosBloqueio[0].motivo).toMatch(/casamento/i);
  });

  it("CANDIDATO inválido continua lançando (não vira errosBloqueio)", () => {
    expect(() =>
      vestidoDisponivel({
        vestidoId: "v1",
        casamentoDataCandidata: "data-invalida",
        regras: REGRAS,
        bloqueiosExistentes: [],
      }),
    ).toThrow(/inválida/i);
  });
```

E, no teste já existente que checa um Veredito sem conflitos, confirmar que `errosBloqueio` vem `[]` — adicionar uma linha ao teste *"LIBERA quando o casamento existente está distante"* (logo após `expect(r.conflitos).toEqual([]);`):

```ts
    expect(r.errosBloqueio).toEqual([]);
```

- [ ] **Step 2: Rodar os testes para ver o RED**

Run: `npm test -- motor.test.ts`
Expected: FAIL de compilação/tipo — `errosBloqueio` não existe em `Veredito`; e o teste do malformado quebra porque hoje `calcularJanelas` lançado dentro de `vestidoDisponivel` **propaga** (a chamada `vestidoDisponivel` joga em vez de retornar).

- [ ] **Step 3: Adicionar `ErroBloqueio` e o campo em `Veredito`**

Em `src/lib/disponibilidade/tipos.ts`, **adicionar** após a `interface Conflito`:

```ts
export interface ErroBloqueio {
  bloqueioId: string;
  motivo: string;
}
```

e **substituir** a `interface Veredito` por:

```ts
export interface Veredito {
  disponivel: boolean;
  conflitos: Conflito[];
  // Bloqueios existentes que não puderam ser projetados (dados malformados).
  // Sempre presente ([] quando não há). Qualquer erro força disponivel: false.
  errosBloqueio: ErroBloqueio[];
}
```

- [ ] **Step 4: Reexportar `ErroBloqueio` no barrel**

Em `src/lib/disponibilidade/index.ts`, no bloco `export type { ... } from "./tipos";`, adicionar `ErroBloqueio` à lista (ex.: junto de `Conflito`):

```ts
export type {
  Regras,
  Bloqueio,
  Janela,
  Conflito,
  ErroBloqueio,
  Veredito,
  TipoJanela,
  TipoBloqueio,
} from "./tipos";
```

- [ ] **Step 5: Envolver o laço de `vestidoDisponivel` em try/catch**

Em `src/lib/disponibilidade/motor.ts`, **linha 1**, adicionar `ErroBloqueio` ao import de tipos:

```ts
import type { Bloqueio, Conflito, ErroBloqueio, Janela, Regras, Veredito } from "./tipos";
```

Depois **substituir** o corpo do laço + return (linhas 132-146) por:

```ts
  const conflitos: Conflito[] = [];
  const errosBloqueio: ErroBloqueio[] = [];
  for (const bloqueio of bloqueiosExistentes) {
    if (bloqueio.vestidoId !== vestidoId) continue;
    if (excluirBloqueioId && bloqueio.id === excluirBloqueioId) continue; // edição: não colide consigo mesma
    let janelasExistente: Janela[];
    try {
      janelasExistente = calcularJanelas(bloqueio, regras);
    } catch (e) {
      // Fail-safe (decisão #6): um bloqueio que não projeta NÃO é pulado em
      // silêncio (isso liberaria o vestido) nem derruba a consulta. Ele bloqueia
      // o vestido e o erro é reportado para a UI corrigir o dado.
      errosBloqueio.push({
        bloqueioId: bloqueio.id,
        motivo: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    for (const janelaCandidata of janelasCandidata) {
      for (const janelaExistente of janelasExistente) {
        if (janelasSobrepoem(janelaCandidata, janelaExistente)) {
          conflitos.push({ bloqueioId: bloqueio.id, janelaCandidata, janelaExistente });
        }
      }
    }
  }

  return {
    disponivel: conflitos.length === 0 && errosBloqueio.length === 0,
    conflitos,
    errosBloqueio,
  };
```

Observação: `const janelasCandidata = calcularJanelas(candidato, regras);` (linha 130) permanece **fora** do try — uma `casamentoDataCandidata` inválida deve continuar lançando.

- [ ] **Step 6: Rodar os testes para ver o GREEN**

Run: `npm test -- motor.test.ts`
Expected: PASS. Fail-safe reporta o erro e mantém `disponivel: false`; candidato inválido ainda lança; nenhuma regressão.

- [ ] **Step 7: Rodar a suíte completa + tipos**

Run: `npm test`
Expected: todos os arquivos verdes (inclui `datas.test.ts`, `api.test.ts`, `seed.test.ts`).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/lib/disponibilidade/tipos.ts src/lib/disponibilidade/motor.ts src/lib/disponibilidade/index.ts src/lib/disponibilidade/__tests__/motor.test.ts
git commit -m "fix(disponibilidade): vestidoDisponivel fail-safe com errosBloqueio (achado #2)"
```

---

## Task 3: Atualizar a documentação de decisões (Plano B)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-27-base-plano-b-motor-disponibilidade.md`

- [ ] **Step 1: Atualizar a decisão #2 (manutenção)**

Localizar a decisão que começa com `2. **Manutenção = `[retiradaDataReal, devolucaoDataReal)`.**` e que termina com `**⚠️ Decisão a confirmar com o cliente** (registrar no spec se confirmada).`

Substituir o trecho final `**⚠️ Decisão a confirmar com o cliente** (registrar no spec se confirmada).` por:

```
**Manutenção em aberto** (`retiradaDataReal` presente, `devolucaoDataReal` `null`): janela `[retiradaDataReal, FUTURO_DISTANTE)`, simétrico ao Grill 2 — o vestido está fora por tempo indeterminado e fica indisponível até a devolução ser registrada. Se a manutenção sempre terá data de volta é decisão da borda/CRUD (plano futuro); o motor não fecha essa porta. Ver spec `docs/superpowers/specs/2026-05-27-motor-manutencao-aberta-design.md`.
```

- [ ] **Step 2: Atualizar a decisão #5 (datas obrigatórias)**

Localizar a decisão `5. **Datas inválidas = erro explícito.**` e substituir `ou `retiradaDataReal`/`devolucaoDataReal` numa manutenção` por `ou `retiradaDataReal` numa manutenção (a `devolucaoDataReal` é opcional: ausente = em aberto)`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-27-base-plano-b-motor-disponibilidade.md
git commit -m "docs: Plano B reflete manutencao em aberto (decisoes #2 e #5)"
```

---

## Task 4: Verificação final + snapshot do workflow

**Files:**
- Modify: `docs/workflow-skills.md`

- [ ] **Step 1: Revalidar verde + tipos**

Run: `npm test`
Expected: todos verdes.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 2: Atualizar o snapshot de `docs/workflow-skills.md`**

Na seção `## Snapshot — 2026-05-27 (envelhece)`, substituir o bloco `**Próximo passo:** REVIEW de qualidade do motor.` e o que vem abaixo dele por:

```
**REVIEW concluído (2026-05-28):** `/code-review high b60f1a3..HEAD` rodado. Achado #1 (manutenção em aberto) e #2 (fail-safe em `vestidoDisponivel`) corrigidos com testes; #3 dispensado (estado válido por design — ver spec de manutenção em aberto). Critério "code-review sem achados de correção abertos" atendido.

**Próximo passo:** próxima fatia → PLAN (provavelmente a primeira com UI, onde `impeccable` entra).
```

- [ ] **Step 3: Commit**

```bash
git add docs/workflow-skills.md
git commit -m "docs: snapshot do workflow apos REVIEW do motor (achados #1/#2)"
```

---

## Critério de sucesso (revalidar ao fim)

1. `npm test` verde (todos os arquivos) e `npx tsc --noEmit` limpo.
2. Manutenção em aberto (`retirada` ✓, `devolução` `null`) gera `[retirada, FUTURO_DISTANTE)` e bloqueia datas candidatas futuras.
3. Um `bloqueioExistente` malformado não derruba `vestidoDisponivel` nem libera o vestido — `disponivel: false` e `errosBloqueio` populado.
4. Candidato inválido ainda lança (não vira `errosBloqueio`).
5. `Veredito.errosBloqueio` sempre presente (`[]` quando vazio); `ErroBloqueio` reexportado pelo barrel.
6. Sem regressão nos cenários já cobertos do motor.
