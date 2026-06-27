# Vestidos V-c + V-d — refino das sugestões: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar os cards de sugestão de vestido — indisponível esmaecido + tag (V-c) e alerta gentil quando bate no `naoQuerUsar` (V-d) — sem mudar score nem ordem.

**Architecture:** V-d adiciona uma função pura `conflitaComRecusa` em `indicacao.ts` (heurística só de exibição) com testes. O componente `VestidosSugeridos` ganha o esmaecido+tag (V-c) e o alerta de recusa (V-d). Nenhuma mudança de data layer/score/ordem.

**Tech Stack:** Next 16 RSC, Tailwind v4 (tokens warm), Vitest.

**Comandos do ambiente (`.bin` dá permission denied):**
- tsc: `node node_modules/typescript/bin/tsc --noEmit`
- vitest: `node node_modules/vitest/vitest.mjs run`

---

### Task 1: `conflitaComRecusa` (pura, TDD)

**Files:**
- Modify: `src/lib/indicacao/indicacao.ts`
- Test: `src/lib/indicacao/__tests__/indicacao.test.ts`

- [ ] **Step 1: Escrever os testes (falham — função não existe)**

Adicionar ao import do topo do teste `conflitaComRecusa`:

```ts
import { indicarVestidos, conflitaComRecusa } from "@/lib/indicacao/indicacao";
```

E adicionar um `describe` (não precisa de DB — é puro; pode ficar no fim do arquivo):

```ts
describe("conflitaComRecusa (V-d — heurística só de exibição)", () => {
  it("bate no nome do vestido", () => {
    expect(conflitaComRecusa("renda e brilho", { nome: "Vestido com renda", combinam: [] })).toBe(true);
  });
  it("bate num atributo que combinou", () => {
    expect(conflitaComRecusa("decote", { nome: "Sereia", combinam: [{ valor: "Decote V" }] })).toBe(true);
  });
  it("não bate quando nenhum token aparece", () => {
    expect(conflitaComRecusa("cauda longa", { nome: "Tomara que caia", combinam: [{ valor: "Tomara que caia" }] })).toBe(false);
  });
  it("vazio/null → false", () => {
    expect(conflitaComRecusa("", { nome: "Vestido", combinam: [] })).toBe(false);
    expect(conflitaComRecusa(null, { nome: "Vestido", combinam: [] })).toBe(false);
  });
  it("token curto (< 4 letras) é descartado", () => {
    expect(conflitaComRecusa("ok", { nome: "ok vestido", combinam: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/indicacao/__tests__/indicacao.test.ts`
Expected: FAIL — `conflitaComRecusa` não existe.

- [ ] **Step 3: Implementar a função pura**

Em `src/lib/indicacao/indicacao.ts`, adicionar (pode ser logo após os `export type`, antes de `indicarVestidos`):

```ts
/**
 * Heurística SÓ de exibição (não pontua, não ordena — respeita o LIMITE deste
 * módulo): true se algum token de `naoQuerUsar` (palavras com ≥ 4 letras)
 * aparece no nome ou nos atributos que combinaram. É um sinal para a vendedora
 * olhar com atenção; o julgamento continua humano.
 */
export function conflitaComRecusa(
  naoQuerUsar: string | null | undefined,
  alvo: { nome: string; combinam: { valor: string }[] },
): boolean {
  const txt = (naoQuerUsar ?? "").toLowerCase();
  if (!txt.trim()) return false;
  const tokens = txt.split(/[^a-zà-ú0-9]+/i).filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const haystack = [alvo.nome, ...alvo.combinam.map((c) => c.valor)].join(" ").toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}
```

- [ ] **Step 4: Rodar — passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/indicacao/__tests__/indicacao.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add src/lib/indicacao/indicacao.ts src/lib/indicacao/__tests__/indicacao.test.ts
git commit -m "feat(indicacao): conflitaComRecusa (heurística de exibição do naoQuerUsar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: V-c (esmaecido + tag) + V-d (alerta) no card

**Files:**
- Modify: `src/components/indicacao/vestidos-sugeridos.tsx`

- [ ] **Step 1: Importar a pura**

Trocar o import de tipo do topo por type+função:

```ts
import type { VestidoIndicado } from "@/lib/indicacao/indicacao";
import { conflitaComRecusa } from "@/lib/indicacao/indicacao";
```

- [ ] **Step 2: Calcular `indisponivel` e `conflito` por card + esmaecer**

Trocar o início do `.map((v) => (` (o `<li ...>`) para computar os sinais e aplicar o esmaecido. Substituir:

```tsx
        {vestidos.map((v) => (
          <li
            key={v.id}
            className="flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave
              bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]
              transition-shadow duration-200 ease-out hover:shadow-[var(--mn-shadow-hover)]"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[17px] font-light tracking-tight text-tinta">
                  {v.nome}
                </span>
                <span className="text-[12px] tracking-[0.02em] text-cinza-fumo">{v.codigo}</span>
              </div>
              <span className="shrink-0 text-[14px] text-grafite">
                R$ {v.precoBase}
                {!v.dentroDoOrcamento && (
                  <span className="ml-2 text-[11px] tracking-[0.02em] text-rose-dust">
                    acima do teto
                  </span>
                )}
              </span>
            </div>
```

por:

```tsx
        {vestidos.map((v) => {
          // V-c: indisponível para a data dela = com reserva ligada, fora de livres e de reservados.
          const indisponivel = reserva
            ? !reserva.reservadosIds.includes(v.id) && !reserva.livresIds.includes(v.id)
            : false;
          // V-d: sinal de exibição quando o texto livre da recusa pode bater nesta peça.
          const conflito = conflitaComRecusa(naoQuerUsar, v);
          return (
          <li
            key={v.id}
            className={`flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave
              bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)]
              transition-shadow duration-200 ease-out hover:shadow-[var(--mn-shadow-hover)]
              ${indisponivel ? "opacity-60" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[17px] font-light tracking-tight text-tinta">
                  {v.nome}
                </span>
                <span className="text-[12px] tracking-[0.02em] text-cinza-fumo">{v.codigo}</span>
              </div>
              <span className="shrink-0 text-right text-[14px] text-grafite">
                R$ {v.precoBase}
                {!v.dentroDoOrcamento && (
                  <span className="ml-2 text-[11px] tracking-[0.02em] text-rose-dust">
                    acima do teto
                  </span>
                )}
                {indisponivel && (
                  <span className="ml-2 block text-[11px] tracking-[0.02em] text-cinza-fumo">
                    Indisponível na data
                  </span>
                )}
              </span>
            </div>

            {conflito && (
              <p className="text-[12px] text-rose-dust">Pode bater no que ela não quer.</p>
            )}
```

- [ ] **Step 3: Fechar a arrow function do map**

Como o `.map` virou `=> { ... return ( ... ) }`, fechar o corpo. Trocar o fim do item:

```tsx
            )}
          </li>
        ))}
      </ul>
```

por:

```tsx
            )}
          </li>
          );
        })}
      </ul>
```

- [ ] **Step 4: Remover a frase redundante do rodapé (V-c)**

No bloco `{reserva && (...)}`, o ramo final hoje mostra "Indisponível para a data dela." — a tag + esmaecido já cobrem. Trocar:

```tsx
                ) : (
                  <p className="text-[12px] text-cinza-fumo">Indisponível para a data dela.</p>
                )}
```

por:

```tsx
                ) : null}
```

- [ ] **Step 5: tsc + suíte**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.
Run: `node node_modules/vitest/vitest.mjs run` → tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/indicacao/vestidos-sugeridos.tsx
git commit -m "feat(indicacao): card indisponível esmaecido+tag (V-c) + alerta de recusa (V-d)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Revisão de design + docs

**Files:**
- Modify: `docs/estado-atual.md`

- [ ] **Step 1: `atelier-design-review`**

Invocar a skill `atelier-design-review` nas sugestões de vestido (perfil da noiva): o esmaecido deve parecer curadoria honesta (não "erro"); a tag "Indisponível na data" e o alerta de recusa em rose-dust devem ser cuidado, não alarme; bordô preservado só onde já estava (o número de afinidade). Aplicar correções pequenas.

- [ ] **Step 2: Gate final**

Run: `node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc --noEmit`
Expected: suíte verde; tsc limpo.

- [ ] **Step 3: Anotar V-c/V-d no estado-atual**

Marcar **V-c/V-d** ✅ na seção "Backlog priorizado" (e que **V-b** ficou fora, coberto por V-a): card indisponível esmaecido+tag; `conflitaComRecusa` (pura, só exibição) marcando alerta de recusa no card; sem mudança de score/ordem.

- [ ] **Step 4: Commit**

```bash
git add docs/estado-atual.md src/
git commit -m "docs(estado-atual): V-c/V-d (refino das sugestões) entregue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
