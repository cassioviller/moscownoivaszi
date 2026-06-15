# Vestidos V-c + V-d — refino das sugestões (design)

> Data: 2026-06-15. Últimos itens (opcionais) do backlog de Atendimento, sobre as
> sugestões de vestido na noiva (`VestidosSugeridos`). Sem schema.

## Contexto

`src/components/indicacao/vestidos-sugeridos.tsx` mostra os top-6 vestidos por
afinidade. Hoje:
- indisponível para a data da noiva = só a frase "Indisponível para a data dela."
  no rodapé do card (fácil de não ver);
- `naoQuerUsar` (texto livre) aparece **só** como lembrete global no topo — nada
  no card que pode bater na recusa.

V-b ("Outros do acervo" recolhido) **fica fora**: já há o link "Ver acervo
completo" (V-a) que dá a saída para o acervo inteiro; um grupo inline
duplicaria.

## V-c — Indisponível: card esmaecido + tag

Quando o componente recebe `reserva` ligada e o vestido **não** está em
`livresIds` nem em `reservadosIds`, ele está indisponível para a data dela.
Em vez de só a frase no rodapé:
- **esmaecer** o card inteiro (`opacity-60`) — sinal visual imediato de "essa
  não dá";
- **tag** discreta perto do preço: "Indisponível na data" (cinza/rose-dust, sem
  bordô — não é alarme);
- remover a frase redundante do rodapé (a tag + o esmaecido já comunicam); os
  estados "Reservado para esta noiva" e o botão "Reservar" continuam iguais.

`reservadosIds` **não** esmaece (é um bom estado). Sem `reserva` (tela de
interesses, read-only) → nada muda.

## V-d — `naoQuerUsar` como alerta no card

Heurística **só de exibição** (nunca entra no score nem na ordem — respeita o
LIMITE documentado em `indicacao.ts`): se algum token relevante de `naoQuerUsar`
aparece no nome do vestido ou num valor de atributo que combinou, marca o card
com um alerta gentil.

### Helper puro (testável) — em `indicacao.ts`

```ts
/**
 * Heurística SÓ de exibição (não pontua, não ordena): true se algum token de
 * `naoQuerUsar` (palavras ≥ 4 letras) aparece no nome ou nos atributos que
 * combinaram. Pra a vendedora olhar com atenção — o julgamento é humano.
 */
export function conflitaComRecusa(
  naoQuerUsar: string | null | undefined,
  alvo: { nome: string; combinam: { valor: string }[] },
): boolean;
```

Regras:
- `naoQuerUsar` vazio/só espaço → `false`.
- tokeniza por espaço/pontuação; mantém tokens com **≥ 4 letras** (corta
  stopwords curtas "com/sem/não/que"); sem tokens → `false`.
- `haystack` = `nome` + valores de `combinam`, tudo minúsculo; `true` se algum
  token é substring do haystack.

### No card

Quando `conflitaComRecusa(naoQuerUsar, v)` → uma linha/tag suave em rose-dust:
"Pode bater no que ela não quer" (não vermelho/bordô — é cuidado, não erro).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/indicacao/indicacao.ts` | + `conflitaComRecusa` (pura) |
| `src/lib/indicacao/__tests__/indicacao.test.ts` | + testes da pura (sem DB) |
| `src/components/indicacao/vestidos-sugeridos.tsx` | card: esmaecido+tag (V-c), alerta de recusa (V-d) |

## Testes (pura, sem Postgres)

1. `conflitaComRecusa("renda e brilho", {nome:"Vestido com renda", combinam:[]})` → true.
2. `conflitaComRecusa("decote", {nome:"Sereia", combinam:[{valor:"Decote V"}]})` → true (atributo).
3. `conflitaComRecusa("cauda longa", {nome:"Tomara que caia", combinam:[{valor:"Tomara que caia"}]})` → false (nenhum token bate).
4. `conflitaComRecusa("", {...})` e `conflitaComRecusa(null, {...})` → false.
5. `conflitaComRecusa("ok", {nome:"ok vestido", combinam:[]})` → false (token < 4 letras é descartado).

V-c (esmaecido/tag) e o render do alerta V-d são verificados por `tsc` + revisão
`atelier-design-review` (presentacional, sem teste de DOM).

## Fora de escopo

- V-b "Outros do acervo" (coberto por V-a).
- Casar `naoQuerUsar` contra o catálogo estruturado / pontuar por recusa (o LIMITE
  consciente de `indicacao.ts` permanece: texto livre não pontua).

## Gates

`tsc --noEmit` limpo + `vitest run` verde antes de cada commit na `main`.
