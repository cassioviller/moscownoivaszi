# Ângulo 10 — reguas-e-testes
**Rodada 2, base 89b38c8** · localizador + cético por achado

Cinco achados localizados, três sobreviveram ao cético — um 🟡 e dois 🔵. Dois
foram refutados com âncora: em ambos a guarda que o achado dizia não existir
mora noutra camada, e o que sobra é higiene 🔵, não o defeito titulado.

## Sobreviventes

### 1. 🟡 A régua S-D44 é cega para o `e2e/` — apagar o `typecheck:e2e` do `package.json` da raiz fica verde na sonda que existe para pegar exatamente isso

**Âncora:** `artifacts/api-server/src/__tests__/sd44-typecheck-cobre-pacotes-unit.test.ts:30`

**Evidência:** `const arquivos = arquivosVersionados(RAIZ, ["artifacts", "lib", "scripts"]); … .filter((f) => f.endsWith("/package.json"))` — e o próprio docbloco (linha 9) admite: *"A fresta nasceu três vezes com a mesma cara: e2e/ (63 arquivos, S-D23)…"*. No `package.json` da raiz (linha 11): `"typecheck": "pnpm run typecheck:libs && pnpm run typecheck:e2e && pnpm -r --filter …"`.

**Mecanismo:** `pacotes()` só enxerga diretório com `package.json` sob `artifacts/`, `lib/` e `scripts/` — e o `e2e/` não tem `package.json` (`git ls-files`: só `tsconfig.json`, specs e helpers). O `e2e/` é alcançado exclusivamente pela linha `typecheck:e2e` encadeada no script `typecheck` da raiz, e NENHUM assert defende essa linha: `filtrosDaRaiz()` só extrai os `--filter`, `referenciasDaRaiz()` só lê o `tsconfig.json` (que referencia as 6 libs, não o `e2e`). Quem editar o script da raiz e derrubar o `&& pnpm run typecheck:e2e` — o gesto exato que criou a fresta da S-D23 — deixa a sonda S-D44 verde, os 3 casos dela passando, e os 63 arquivos de `e2e/` sem typecheck de novo.

**Consequência:** O ateliê não vê nada — que é o defeito: a régua "typecheck verde em 5 projetos, incluindo os 63 arquivos de `e2e/`" do CLAUDE.md volta a ser promessa sem fiscal, e um erro de tipo num spec só aparece no dia em que o Playwright transpila e estoura em runtime (a S-D25 mediu 7 specs vermelhos por um caso desses). Conserto barato: um assert que confere que o script `typecheck` da raiz contém `typecheck:e2e`, no mesmo molde do `expect(excluiNome).toEqual([…])` da linha 91.

**Cético (confirmou 🟡):** confirmado com âncoras lidas neste run — `pacotes()` (linhas 30-33) só enumera diretórios com `package.json` sob os três prefixos, e o `e2e/` não tem `package.json` (66 `.ts`, nenhum `package.json`); o `tsconfig.json:5-24` da raiz referencia só as 6 libs; a única rota é o `&& pnpm run typecheck:e2e` em `package.json:11`, e nenhum dos quatro asserts do teste (linhas 91, 104, 116, 121-125) falha se essa linha for apagada. Não há CI workflow nem segundo teste que pregue o conteúdo do script da raiz. Não é duplicata dos 15 fechados nem sítio das 4 sobras abertas.

**Sobra que enumera:** nenhuma.

### 2. 🔵 Na sonda S28, o caso "duas noivas seguem legítimas" tem assert que não pode falhar — e o comentário afirma o contrário do que o código faz com o `.not`

**Âncora:** `artifacts/api-server/src/__tests__/s28-assert-tautologico-unit.test.ts:421`

**Evidência:** `// Elas SÃO comparadas — e é o caso em que a comparação é o ponto (provar que são diferentes). O '.not' é o que separa: por isso ele não entra.` seguido de `expect(gemeasCompararadasEm(legitimo).length).toBeLessThanOrEqual(1);`

**Mecanismo:** `gemeasCompararadasEm` sobre UM par de declarações só pode devolver 0 ou 1 achados — `toBeLessThanOrEqual(1)` passa com qualquer comportamento, é um assert que não afirma nada. E o comentário está errado sobre o mecanismo: a regex `juntas` (linhas 302-304) tem `[^;]*` entre o `expect(…)` e o matcher, então `.not.toBe` CASA — o exemplo das duas noivas adjacentes comparadas com `.not.toBe(leadB.id)` é flagrado hoje (`length === 1`), não perdoado. O `.not` separa na PRIMEIRA forma (`tautologiasEm` exige os dois lados iguais, e `a.id ≠ b.id`), não na segunda, que é a testada aqui.

**Consequência:** O dia em que alguém escrever o molde legítimo — dois `criarLead` colados e `expect(a.id).not.toBe(b.id)` — a varredura principal fica vermelha acusando um teste correto, e o docbloco jura que esse caso não entra: quem depurar vai desconfiar do teste novo em vez da sonda. O assert honesto é `toBe(1)` (documentando que a forma É flagrada e o ajuste fica a cargo de quem esbarrar) ou excluir o `.not` da regex `juntas` e afirmar `toBe(0)`, fazendo o comentário virar verdade.

**Cético (confirmou 🔵, com execução real):** rodou a função copiada do arquivo sobre o espécime `legitimo` e ela devolve `length = 1` — a regex casa o `.not.toBe`, e o comentário das linhas 419-420 afirma o contrário do medido. Não é duplicata de nenhum dos 15 fechados nem das 4 sobras da fila, e não existe guarda noutra camada (é meta-teste). Severidade 🔵 confirmada: a varredura erra para o lado conservador (falso positivo futuro num molde legítimo + docbloco que despista o depurador), nenhum defeito real escapa por causa dela.

**Sobra que enumera:** nenhuma.

### 3. 🔵 Os comentários "FALHA ESPERADA no main" (C2/C4) em 08-contratos afirmam defeitos que já fecharam — com `retries: 0`, se fossem verdade a suíte não estaria verde

**Âncora:** `e2e/08-contratos.spec.ts:17`

**Evidência:** `// FALHA ESPERADA no main (achado C4): botão "Novo Contrato" sem handler (contratos/index.tsx:17-20).` — e na linha 30: `// FALHA ESPERADA no main (achado C2): o detalhe chama GET /api/contratos/{id}; o servidor só tem /api/lojas/{lojaId}/contratos/{id} → 404`

**Mecanismo:** Os dois testes abaixo dos comentários afirmam o comportamento CONSERTADO (o botão abre diálogo ou navega; o detalhe mostra "Detalhes financeiros"), o `playwright.config.ts` roda com `retries: 0` ("cada falha é um achado"), e a suíte está verde em 165 — logo C2 e C4 estão fechados há tempo (`contratos/index.tsx` hoje é a tela do E124, com `navigate` e `Link`; os line-numbers citados apontam para imports). Comentário que declara o main quebrado sobre teste que prova o main são é o inverso da regra da casa: prega no papel o defeito que o código não tem mais.

**Consequência:** Quem abre o arquivo numa sessão nova lê "FALHA ESPERADA" e gasta o primeiro gesto conferindo um defeito que não existe — ou pior, trata um vermelho futuro real desses testes como "a falha esperada documentada" e o descarta. O conserto é reescrever os dois comentários como histórico ("era o C4, fechado em …"), no molde que o resto do repositório já usa.

**Cético (confirmou 🔵):** leitura direta das linhas 17-18 e 30-32 confirma o texto; os testes logo abaixo asseveram o comportamento consertado (linhas 24-27 exigem diálogo/navegação; 37-40 exigem "Detalhes financeiros"; o probe 55-70 exige 200 na URL do cliente gerado), `playwright.config.ts:27` tem `retries: 0`. Não há guarda noutra camada porque o defeito é o próprio texto. Bônus para o conserto: as mensagens de assert das linhas 26 e 39 repetem a afirmação em presente e merecem virar condicional junto.

**Sobra que enumera:** nenhuma.

## Refutados

| Título | Âncora | A refutação do cético em uma frase |
|---|---|---|
| A cobertura E2E das telas de contrato depende de contrato LEGADO no banco — num banco recém-instalado, 4 asserts pulam em silêncio para sempre | `e2e/global-setup.ts:297` | A permanência é falsa: os specs 39 e 40 NÃO apagam seus contratos no `afterAll` (fazem UPDATE para CANCELADO), então toda passada completa deixa ≥2 contratos no banco e na segunda passada de uma instalação nova o `limit(1)` os encontra e os 4 asserts rodam — o que sobra (uma única primeira passada com 4 skips silenciosos e âncora arbitrária em contrato CANCELADO) é higiene de fixture 🔵, não o 🟡 titulado. |
| O probe "anônimo → 401" aceita 403 — e o frontend desloga SÓ com 401, então a distinção que o app depende não está guardada | `e2e/12-permissoes.spec.ts:143` | A guarda existe na camada certa: `lote1-auth.test.ts:48-51` faz GET anônimo na MESMA rota e prega `toBe(401)` estrito atravessando o stack Express inteiro, e em `middlewares/auth.ts:75-99` todo branch 403 exige sessão existente (sem cookie sai em 401 na linha 77) — o que sobra é o assert do probe ser mais frouxo que o título, cosmético 🔵. |

## Cobertura

**Teto não atingido:** 5 achados, nada cortado.

**Notas do localizador:** enumerei pelo `git ls-files` (601 arquivos no escopo). Varri `.skip`/`.only` (5 ocorrências, todas condicionais e com mensagem — as de 08/15 viraram o achado refutado do contrato legado; a de 37-projecao é regra de produto documentada), supertest lazy (zero `Test` guardado em variável sem `Promise.resolve` — s33 e sm7 usam o padrão correto do `replit.md`), asserts permissivos (`expect([...]).toContain`: e107:197 é legítimo com invariante de trilha ao lado; `e2e/12:143` virou o achado refutado do 401/403; lote17 idem e107), `toBeGreaterThanOrEqual(0)` (4 sítios; o de `e2e/15:130` é deliberado por banco persistente e o assert de idempotência ao lado é o que vale), e população zero (as 16 varreduras têm piso — li `arquivos-versionados.ts`, varredura-reguas, s36, s28, sd44, erros-regua, varredura-cabines, varredura-fronteira, destrutivas, lote2). Li por inteiro `helpers.ts` (API), `helpers.ts` e `global-setup.ts` (E2E), e101, e107, lote17, lote30, `App.rotas.test.tsx`, `cache.test.ts`, confirmar-saida-adocao.

Não achei teste que PREGA defeito das quatro sobras abertas nem sítio novo enumerável delas dentro deste ângulo (S-M9/S-M10/S-M18 são código de app/rota, território dos outros ângulos; a S-M17 é dado, não teste). Nota de fronteira: a varredura s36 cruza só o MÓDULO (`requireModulo` de `router.use` × `podeNoModulo`), não a AÇÃO criar/editar — mas isso é literalmente a forma de conserto que a fila da S-M9 já prescreve, então não é achado novo.

**Nota do cético sobre o localizador:** no achado refutado do contrato legado, o localizador afirmou ter conferido que "os 11 specs apagam o seu no afterAll", mas conferiu 2 dos 11 — e dois specs do seu próprio intervalo (39 e 40) o desmentem. A amostra que confirma o padrão não é a varredura do padrão.
