# E99 parte 9 — o `<Table>` nas cinco telas (o épico fecha)

**Rodada 6, sessão 7** · branch `rodada-6/execucao` · base `b7c448c`
Fecha: a metade do **E19** que restava. **Com isto o E99 fecha inteiro.**

Suíte: API **742** · frontend **313** · E2E **136** · typecheck verde.

---

## O ganho é o wrapper, não a marcação

`components/ui/table.tsx` existia e tinha **um** consumidor em todo o repo: a
matriz de permissões. As cinco telas que escreviam `<table>` cru somavam 243
linhas de JSX.

Trocar `<table>` por `<Table>` não muda pixel em quatro delas — **e é honesto
dizer isso**: as quatro já tinham `overflow-x-auto` no `CardContent`, que é
exatamente o que o primitivo traz (`<div className="relative w-full
overflow-auto">`). O que elas ganham é uniformidade de padding e a chance de o
próximo ajuste valer para todas.

**A quinta é diferente, e é a única com dor medida.** A simulação de comissão
(`comissoes/index.tsx`) vive num `DialogContent max-w-lg` e **não tinha
contêiner de rolagem nenhum** entre o diálogo e a tabela: cinco colunas de
dinheiro num diálogo estreito eram cortadas sem saída. O E19 marcou esse caso
como "⚠️ não confirmado"; a fase A confirmou por leitura, e é o único dos cinco
onde a troca conserta alguma coisa.

## Três cuidados que a fase A levantou, e o que fiz com cada um

**1. O `min-w` tem de ir no `<Table>`, não no wrapper.** Em `agenda/semana.tsx`
o `min-w-[56rem]` é o que faz a grade da semana ter largura para rolar. O
`className` do `<Table>` cai no `<table>` (`table.tsx:12`); no wrapper, a
rolagem **nunca dispararia**.

**2. Scroll dentro de scroll não rola.** O `overflow-x-auto` do `Card` de
`agenda/semana.tsx` e dos `CardContent` das outras três saiu — o primitivo já
traz o seu. Verificado depois: **zero** telas com `<Table>` e `overflow-x-auto`
no contêiner.

**3. `TableRow` traz `hover:bg-muted/50`, e nem toda linha é clicável.** Medido:
`vestidos/utilizacao.tsx` tem link dentro da linha; `noivas/conversao.tsx` e
`admin/index.tsx` **não têm nada** — são dados puros. Dar hover a elas é sugerir
interação que não existe, que é literalmente a crítica que a parte 4 fez ao
`Badge` rosa do contrato. As duas ganharam `hover:bg-transparent`, e a decisão
está escrita aqui em vez de acontecer por omissão. As linhas de **cabeçalho**
das cinco também: cabeçalho nunca é clicável.

## Verificação

- `pnpm run typecheck` — quatro projetos verdes.
- `vitest` frontend: **313** — sem mudança, e é honesto: não há régua nova, é
  marcação. O `include` do vitest não coleta componente (sobra S15), então não há
  teste de unidade possível aqui.
- Playwright: **136**, suíte completa — a régua real deste item, porque cinco
  telas mudaram o que desenham. Nenhum spec dependia da marcação de tabela
  (`grep` por `getByRole("row"|"cell"|"table")` em `e2e/` não devolve nada), e o
  E2E confirmou.
- **Duas varreduras depois do fato:** `<table` cru em `src/pages/` → só o meu
  próprio comentário; `<Table>` com `overflow-x-auto` no contêiner → nenhum.

Não há vermelho a citar, e vale dizer por quê em vez de inventar um: o item não
conserta comportamento errado em quatro das cinco telas — **troca marcação
equivalente por marcação compartilhada**. Na quinta, o que se conserta é a
ausência de um contêiner de rolagem, e isso se vê abrindo o diálogo, não num
assert. O E19 já tinha registrado que não conseguiu abri-lo (exige uma simulação
submetida ao servidor); **eu também não abri**, e digo isso em vez de afirmar que
verifiquei.

## O que o E99 fecha, e o que ele recusou

Nove partes. O que vale registrar é o que ele **não** fez, cada uma com medida:

- **A paginação do E19** — recusada na parte 7: `/vestidos` já usa `thumb` +
  `loading="lazy"`, e paginar mudaria o contrato de `listVestidos` para quatro
  consumidores, três dos quais precisam da lista inteira.
- **O assert da segunda cláusula do E10** — recusado na parte 8: acusava cinco
  descrições inocentes para pegar um culpado.
- **Os 10 gatilhos que nomeiam o objeto e não o valor** — viraram sobra, com o
  inventário pronto.

Três recusas com número em nove partes. É o que a rodada aprendeu a fazer.
