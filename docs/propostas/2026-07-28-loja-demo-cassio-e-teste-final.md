# A loja do Cássio — o estado de hoje, o seed que falta e o teste final

**2026-07-28**, base `48bd59a`, branch `rodada-6/execucao`.

Este documento responde três coisas na ordem em que elas se decidem: **como o app
está hoje** (medido, não estimado), **o que falta para existir uma loja de
verdade para olhar**, e **o plano** para que essa loja vire o teste final com
Playwright.

---

# 1. O estado do app hoje

## As suítes estão verdes, e isso é o piso

Rodadas hoje, na base `faa30c9`:

| Suíte | Resultado |
|---|---|
| `typecheck` | verde, 3 projetos |
| API (`vitest`) | **756 testes**, 107 arquivos |
| Frontend (`vitest`) | **313 testes**, 33 arquivos |
| **E2E (Playwright)** | **137 testes**, 5,0 min, 52 specs |

**E verde não é a régua.** Uma revisão do branch inteiro contra `main`, hoje,
achou **treze defeitos** — entre eles um **🔴 confirmado por leitura** (a cobrança
de avaria colide com a entrada do contrato, `reservas.ts:576`) e **uma regressão
que eu mesmo introduzi** há uma hora (o E104 parte 3 quebrou o Canvas). Estão em
`2026-07-28-revisao-do-branch-rodada-6.md`, com cinco épicos ordenados.

Isso importa aqui por um motivo direto: **o 🔴 atinge o seed**. Um contrato com
entrada que também cobra o reparo de uma avaria dá `23505` e a cobrança não
acontece. Uma loja "toda populada" tem os dois. **O E110 vem antes do seed, ou o
seed nasce mentindo sobre o que consegue representar.**

## O banco não é um sistema — é um aterro de teste

`5.969 linhas em 45 tabelas`, e a leitura por loja explica tudo:

| | |
|---|---|
| **8 lojas** | 1 de verdade (`Moscow Noivas SP`, de 2026-07-06) + 4 "Loja Teste" + 2 "Loja Vazia" + `E2E Segunda Loja` |
| **762 usuários** | e a loja de verdade tem **2** vínculos. São ~760 órfãos — a sobra **S18**, que mediu 613 de 714 há três dias |
| **1.298 sessões** | idem |

E os números da loja de verdade **não fecham como negócio**:

```
817 leads · 533 vestidos · 434 contratos · 192 parcelas · 69 pagamentos
```

**434 contratos e 192 parcelas.** Não existe ateliê assim: é resíduo de fixture
de API acumulado desde 06/07, não uma loja. Ninguém consegue olhar essa tela e
dizer se o sistema está certo.

## Dez tabelas nunca receberam uma linha — e eu contei de verdade

**`pg_stat_user_tables` mente**, e mentiu feio: disse `recorrencias: 1` (são
**64**), `avarias: 1` (são **62**), `atributos: 2` (são **121**),
`registros_cobranca: 3` (são **144**). É estimativa de autovacuum. Contei com
`count(*)`:

| Tabela em ZERO | O que isso significa |
|---|---|
| `comissao_fechamentos` | **nenhum mês de comissão jamais fechou neste banco** |
| `portal_tokens` | o portal da noiva — um épico inteiro da rodada 6 — nunca teve token em repouso |
| `ajustes` + `ajuste_checklist_itens` | o módulo de ajustes está virgem, e tem tela (`ajustes/index.tsx`) |
| `vestido_fotos` | **o acervo inteiro não tem uma foto** |
| `contrato_itens` | contrato sem itens |
| `orcamento_versoes` | nenhum orçamento foi versionado |
| `lead_interesse_atributos` | o casamento noiva ↔ atributo de vestido nunca rodou |
| `convites` | ninguém foi convidado para uma loja |
| `reservas` | zero |

Alguns desses specs do E2E **passam** — eles criam e limpam. O que está a zero é
o **repouso**: não existe nada persistente para olhar, e não existe demonstração
possível do sistema no estado em que ele está.

## O que existe hoje de semeadura

| Arquivo | O que faz |
|---|---|
| `api-server/src/lib/seed.ts` (60 l.) | roda na subida se o banco estiver **vazio**: 1 loja, 2 perfis, 1 superadmin. É o mínimo para logar |
| `api-server/src/scripts/seed.ts` (208 l.) | seed de demonstração fininho: ~2 vestidos, alguns leads, **1** atendimento, **1** contrato, **1** parcela, **1** conta a pagar |
| `e2e/global-setup.ts` (262 l.) | fixtures `e2e-*`, idempotente, e **elege a loja MAIS ANTIGA do banco** |

Nenhum dos três produz uma loja com vida. O segundo é o mais perto, e ele cria
**um** contrato.

---

# 2. O que "uma loja toda populada" precisa ter

O sistema acompanha a noiva do primeiro contato ao casamento e fecha caixa,
comissão e folha em cima disso. A loja do Cássio só é teste final se **as três
pontas fecharem entre si**. São 64 telas; a loja tem de dar conteúdo a todas.

| Módulo | O que a loja precisa ter para a tela não estar vazia |
|---|---|
| **Equipe** | Cássio (dona da loja) + 3 vendedoras com perfis diferentes, uma delas inativa |
| **Acervo** | ~40 vestidos com **foto e thumb**, atributos preenchidos, status variados (disponível, em manutenção, vendido) |
| **Noivas** | ~60 leads espalhados por TODAS as etapas do funil, com origem, interesses e histórico de contato |
| **Agenda** | `regra_disponibilidade` da loja, 4 cabines, atendimentos e provas em **6 meses passados e 2 futuros** |
| **Orçamento** | orçamentos em rascunho, enviado, aprovado e recusado — com **versões** |
| **Contrato** | contratos com entrada + carnê, alguns quitados, um cancelado com estorno, um com avaria cobrada |
| **Financeiro** | parcelas pagas, parciais, atrasadas e previstas; pagamentos por forma; contas a pagar com **recorrência**; conciliação com casadas e divergentes |
| **Comissão** | regra com faixas, e **fechamentos de meses passados** — hoje são zero |
| **Portal** | tokens vivos para algumas noivas, e um revogado |
| **Ajustes** | ajustes com checklist em andamento e concluídos |
| **Auditoria** | a trilha nasce sozinha, se o seed escrever pelas rotas |

**A régua que faz isso ser teste e não enfeite:** ao final, **o DRE de caixa, o
fluxo e a folha de comissão da loja do Cássio têm de fechar entre si**, e o
número tem de ser conferível à mão. Um seed com dinheiro aleatório é pior que
nenhum seed — ele ensina a confiar numa tela que ninguém verificou.

---

# 3. O plano

## Fase 0 — tirar do caminho o que contamina o seed

1. **E104 parte 4** — desfazer a regressão do Canvas. Uma linha, é minha, não
   depende de ninguém.
2. **E110** — a cobrança de avaria para de colidir com a entrada (`max(numero)+1`)
   e passa a amarrar a avaria ao contrato da noiva certa.

**Por que antes:** sem o E110 o seed não consegue criar um contrato com entrada
**e** avaria cobrada, que é um caso normal do ateliê. Ele daria 500 e alguém
concluiria que o seed está errado.

## Fase 1 — o gerador da loja demo

Um script novo, `artifacts/api-server/src/scripts/seed-demo.ts`, separado dos
dois que já existem e sem tocá-los.

**As cinco regras que ele obedece, e cada uma tem motivo medido:**

1. **Loja PRÓPRIA, nunca a `Moscow Noivas SP`.** O `global-setup.ts` elege a loja
   **mais antiga** para toda a suíte E2E. Uma loja nova nasce depois e é segura —
   **mas o acoplamento fica escrito**: no dia em que alguém apagar a loja de
   2026-07-06, a suíte inteira muda de alvo sozinha.
2. **Idempotente, com ids fixos `demo-*`.** Roda quantas vezes for preciso sem
   duplicar. É a forma que o `global-setup` já provou.
3. **Datas ancoradas em dia de negócio**, com `hojeLocal`/`ancoraDeNegocio` — não
   `new Date()`. A rodada 6 tem três defeitos dessa família (C6, o `vencimento`
   da avaria, o `vigenciaInicio` do achado 9).
4. **Escreve pelas ROTAS onde houver rota**, não por `INSERT` direto. É o que faz
   a trilha de auditoria nascer sozinha e o que prova que o gate de permissão do
   Cássio funciona. Onde não houver rota, `INSERT` com o motivo escrito.
5. **Dinheiro conferível.** Cada valor sai de uma tabela de constantes no topo do
   arquivo, e o total esperado do DRE, do fluxo e da comissão é **escrito como
   comentário e como teste** — não descoberto depois rodando a tela.

**As fotos são o único item com dificuldade técnica real.** `vestido_fotos.bytes`
é `bytea`, e a thumb é normalmente gerada **no navegador, por canvas**
(`schema/vestidos.ts:69`). O seed será o primeiro escritor não-navegador dessa
tabela: precisa gerar PNGs válidos e a thumb junto, com `largura`/`altura`
corretas — senão os cards do acervo mentem sobre o que mostram. Sem rede: PNG
gerado em código.

## Fase 2 — o Cássio, e a decisão que decide o teste

**Cássio NÃO deve ser superadmin.** Se ele for, o teste final não prova nada
sobre permissão: superadmin passa por todo gate. A rodada 6 tem um épico inteiro
(E101) cuja tese é "a permissão diz o que a rota faz", e ele ficaria sem
verificação exatamente na hora de verificar.

O desenho recomendado: **um perfil novo, "Proprietária", com os seis módulos
ligados e `sistema: false`**, e o Cássio vinculado à loja demo por ele. É a
persona real (a dona do ateliê), e é a que exercita o gate.

As três vendedoras entram com perfis diferentes de propósito — uma delas **sem**
`financeiro.editar` —, porque é assim que se descobre o achado 12 da revisão (o
`POST /conciliacao/marcar` que não vira `editar`).

## Fase 3 — o Playwright do Cássio

Hoje a config tem **um** projeto e **um** `storageState` (`admin.json`, do
superadmin), `workers: 1` e `retries: 0`.

O teste final acrescenta:

1. **`e2e/auth-cassio.setup.ts`** — autentica o Cássio, seleciona a loja demo e
   grava `.auth/cassio.json`.
2. **Um projeto `demo`** na `playwright.config.ts`, dependente desse setup, com
   `testMatch` só dos specs novos. Os 52 specs de hoje **não mudam** — eles
   continuam no `admin.json` e na loja mais antiga.
3. **Uma trilha de specs `60-*` que percorre a loja como a dona percorreria**, e
   não tela por tela: *chega uma noiva → agenda a prova → reserva o vestido →
   monta o orçamento → fecha o contrato → recebe a entrada → cobra a parcela →
   concilia o extrato → fecha o mês → confere a comissão*. Uma jornada que
   atravessa oito módulos vale mais que oito specs que abrem oito telas.
4. **Um spec de fechamento de contas**, que é o teste final de verdade: lê o DRE,
   o fluxo e a folha **pela API** e afirma que os três batem com a constante
   escrita na Fase 1.

## Fase 4 — o relatório

Um `docs/revisao/.../execucao/` com o de sempre: o que o plano errou, o vermelho
literal de cada conserto, e **o que a loja demo revelou que 137 specs não
revelavam**. Essa última seção é a razão de todo o trabalho.

---

# 4. As decisões, respondidas pelo dono em 2026-07-28

As três seguiram a recomendação medida, e viram regra deste trabalho:

1. **O Cássio é DONO DA LOJA, não superadmin.** Perfil novo "Proprietária", seis
   módulos ligados, `sistema: false`, vinculado só à loja demo. É a persona real
   e é a única que exercita o gate — superadmin passa por tudo, e o teste final
   não provaria nada sobre permissão.
2. **Loja NOVA, separada.** Não toca a `Moscow Noivas SP` nem move a eleição do
   E2E: os 137 specs de hoje continuam rodando sobre o que sempre rodaram.
3. **O lixo do banco FICA.** Os ~760 usuários órfãos, as 1.298 sessões e as 6
   lojas de teste não bloqueiam a loja demo, que é independente. **O custo
   continua medido e nomeado:** `GET /admin/usuarios` (`admin.ts:263`) segue
   devolvendo as 762 linhas sem paginação, e a tela de equipe do console segue
   impossível de avaliar. A **S18** continua aberta, e é ela quem cobra isso.

**O que a decisão 3 obriga o teste final a fazer:** como o console de superadmin
não é avaliável neste banco, o teste do Cássio **não** tenta avaliá-lo. Ele para
na fronteira da loja — que é, aliás, exatamente o que o perfil dele alcança.

## O tamanho, se ninguém disser outra coisa

~40 vestidos, ~60 noivas, 4 vendedoras, **8 meses de história** (6 para trás, 2
para a frente), ~25 contratos, ~120 parcelas. É grande o bastante para as telas
de lista, o funil e os gráficos terem forma, e pequeno o bastante para o dinheiro
ser conferido à mão — que é a condição de tudo isto valer.

---

# 5. Os riscos, ditos antes

- **O seed vai achar defeito, e isso é o ponto.** Popular 45 tabelas de forma
  coerente é o exercício mais duro que este sistema já sofreu. Cada 500 que
  aparecer é um achado — e ele entra como sobra, não vira contorno no seed.
- **O `global-setup` elege a loja mais antiga.** A loja demo é segura hoje e
  frágil por construção. Vale considerar fixar a eleição por id em vez de por
  data, mas isso é épico separado e mexe nos 137 specs.
- **Três flakes conhecidos continuam abertos** (S7, S20, `24-dias-funcionamento`).
  Eles vão aparecer no meio deste trabalho e vão se parecer com regressão do
  seed. Estão nomeados para não custarem uma investigação cada.
