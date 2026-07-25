# Trilha D — Frontend: qualidade de código e performance

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

## Resumo executivo

15 achados (1 🔴, 7 🟠, 6 🟡, 1 🔵). Nenhum arquivo de código alterado.

O frontend é disciplinado onde normalmente não é: **8 `useEffect` no app
inteiro**, quase nenhum estado derivado guardado em `useState`, 100% dos botões
de submit protegidos por `isPending`, listagem de noivas com paginação e busca
no servidor. Os problemas não estão na composição de componentes — estão em
três lugares só, e são estruturais:

1. **A camada de cache é 100% default.** Nenhum `staleTime`, nenhum `gcTime`,
   nenhum `refetchOnWindowFocus: false` em nenhum lugar (D3). Isso não é só
   requests a mais: é o gatilho de um bug de perda de digitação (D13) e do
   loop infinito do D1.
2. **O E79 (agregar no banco) parou no meio.** As telas de conciliação,
   contas a pagar, projeção e detalhe de orçamento continuam baixando a tabela
   inteira da loja — 3 delas para recortar no cliente o que o servidor já sabe
   recortar (D2, D4).
3. **O contrato para na borda.** O `api-zod` gerado do OpenAPI tem **zero**
   consumidores no frontend: os 12 formulários reescrevem o schema à mão (D5),
   e nenhum deles devolve o erro do servidor para o campo que o causou (D6).
   É a causa estrutural, no lado do cliente, do C1 e do C3.

O achado crítico (D1) é um loop de render entre dois `useEffect` que
sincronizam a mesma variável (a loja ativa) em direções opostas.

## Achados

### D1 — Dois `useEffect` sincronizam a loja ativa em direções opostas: um bookmark para outra loja trava a página num loop de render

- **Onde:** `artifacts/moscow-noivas/src/hooks/use-auth.tsx:23-27`
  (sessão → store) e `artifacts/moscow-noivas/src/components/layout/app-layout.tsx:24-28`
  (URL → store). O store é `lib/store.ts:9-19` (zustand + `persist`).
- **O quê:** os dois efeitos escrevem o MESMO valor (`activeLojaId` do store) a
  partir de fontes diferentes, e ambos têm `activeLojaId` na lista de
  dependências. Quando a loja da URL diverge da loja da sessão, cada `set` de um
  reativa o outro:

  ```
  store=A, session.lojaAtivaId=A, url=/loja/B/…
  render 1 → app-layout: B !== A → setActiveLojaId(B)
  render 2 → use-auth:   A !== B → setActiveLojaId(A)
  render 3 → app-layout: B !== A → setActiveLojaId(B)
  … React aborta com "Maximum update depth exceeded"
  ```

  E `AppLayout` chama `useAuth()` na linha 20, então os dois efeitos vivem na
  mesma árvore, sempre montados juntos.
- **Por que importa:** dois caminhos de usuária normal chegam lá.
  (a) **Bookmark/deep-link:** quem tem duas lojas salva `/loja/B/dashboard`,
  volta no dia seguinte com a sessão em A → a tela trava antes de pintar.
  (b) **Duas abas:** a aba 1 está em `/loja/A`, na aba 2 a pessoa troca para B
  (`selecionar-loja.tsx:48` grava `lojaAtivaId=B` no servidor). O `persist` do
  zustand não escuta o evento `storage`, então a aba 1 não sabe — até o próximo
  foco de janela, quando o `getMe` refaz (consequência direta do D3) e passa a
  responder `lojaAtivaId: B` com a URL ainda em A. Loop.
  Nos dois casos o desfecho é uma aba a 100% de CPU e a tela em branco, sem
  nada dizendo à usuária o que fazer.
- **Nota:** confirmado por leitura das duas listas de dependência; não
  reproduzido em runtime. Vale um teste de render antes do conserto.
- **Sugestão:** UMA fonte de verdade. A URL já é a que o `useAuth` declara como
  prioritária (`use-auth.tsx:43`) — então o efeito do `use-auth` deveria sumir e
  a divergência URL≠sessão virar uma AÇÃO explícita (chamar `selecionarLoja`
  para a loja da URL, ou redirecionar para a loja da sessão), não uma corrida
  entre dois efeitos. Enquanto isso, o `persist` do zustand deveria ao menos ter
  a sincronização entre abas.
- **Severidade:** 🔴

### D2 — Quatro telas baixam a tabela inteira da loja para mostrar uma janela; a conciliação é a pior, e o parâmetro que resolveria já existe no contrato

- **Onde:**
  - `pages/financeiro/conciliacao.tsx:57-62` — `useListParcelas(lojaId, undefined)`
    + `useListPagamentos(lojaId, undefined)`, **no mount**, antes de o arquivo ser
    escolhido.
  - `pages/financeiro/pagar.tsx:137-142` — `useListContasPagar` (sem params) +
    `useListPagamentos(lojaId, undefined)`, recortados no cliente em
    `pagar.tsx:192-195`.
  - `pages/financeiro/projecao.tsx:74-76` — `useListContasPagar` sem recorte.
  - `pages/financeiro/folha.tsx` — mesma lista completa de contas a pagar.
- **O quê:** o E79 passou a filtrar no banco, e `receber.tsx:112-118` mostra o
  padrão certo (manda `{de, ate}`). As telas acima ficaram para trás:
  `ListPagamentosParams` (`api.schemas.ts:2811`) **já tem `de`/`ate`** e as três
  telas passam `undefined`; `listContasPagar` não tem parâmetro nenhum no
  contrato (`openapi.yaml:3010-3025`) — é o único caso em que a correção precisa
  de mudança de spec.
- **Por que importa:** custo concreto na conciliação — uma loja com 200
  contratos × 12 parcelas são ~2.400 parcelas + todos os pagamentos já feitos,
  baixados para comparar contra um extrato de 30 dias. E o recorte que a tela
  usa é conhecido: `conciliacao.tsx:83-85` deriva `inicio`/`fim` das próprias
  transações do arquivo (±2 dias). Ou seja, a tela sabe a janela — só a pede
  depois de já ter baixado tudo. Em `/financeiro/pagar` o payload cresce
  monotonicamente com a idade da loja (aluguel + salários + fornecedores +
  comissões ≈ 30–50 linhas/mês, ~1.800 em 3 anos), para mostrar 30 dias.
- **Sugestão:** conciliação passa a buscar com `enabled: !!transacoes` e
  `{de: inicio, ate: fim}` (deixa de haver request no mount); `pagar.tsx`
  passa a janela ao `listPagamentos`; e `listContasPagar` ganha `de`/`ate` no
  `openapi.yaml`, seguindo a mesma forma que `listParcelas` já tem.
- **Severidade:** 🟠

### D3 — Nenhum `staleTime`/`gcTime` em lugar nenhum: cada volta de foco à janela refaz todas as queries da tela

- **Onde:** `App.tsx:84-87` — `new QueryClient({ queryCache, mutationCache })`,
  sem `defaultOptions`.
  `grep -rn "staleTime\|gcTime\|refetchOnWindowFocus" artifacts/moscow-noivas/src`
  → **nenhum resultado**.
- **O quê:** `staleTime: 0` para tudo, incluindo dados que não mudam durante a
  sessão: `listCabines`, `listAtributos`, `listPerfis`, `listEquipe`, `getMe`.
  Com stale 0, o default `refetchOnWindowFocus: true` e `refetchOnMount` viram
  "refaz sempre".
- **Por que importa:** custo concreto — o dashboard tem 4 queries e o sino
  (montado em TODA tela, `app-layout.tsx:81` e na sidebar) tem mais 4. Cada
  alt-tab de volta ao navegador dispara **8 requests** de dados que não mudaram;
  a vendedora que alterna WhatsApp Web ↔ sistema faz isso dezenas de vezes por
  hora. Em `/comissoes` são **7 queries** por foco (D10). Pior que o tráfego: é
  este comportamento que dispara o D13 (perda de digitação) e a perna (b) do D1.
- **Sugestão:** `defaultOptions.queries.staleTime` de 30–60 s como piso global
  — o sino já força o próprio `refetchInterval: 5min`
  (`sino-notificacoes.tsx:79`), então continua fresco —, e `staleTime: Infinity`
  explícito nas listas de configuração (cabines, atributos, perfis, equipe).
- **Severidade:** 🟠

### D4 — A tela de orçamento baixa a lista INTEIRA de leads da loja para descobrir um nome que a query ao lado já trouxe

- **Onde:** `pages/orcamentos/[id].tsx:118-120` (`useListLeads(activeLojaId!, undefined, …)`),
  consumida uma única vez em `pages/orcamentos/[id].tsx:175-178`
  (`leads.data?.itens.find((l) => l.id === orcamento?.leadId)`).
  A query redundante é a das linhas 123-129: `useGetLead(activeLojaId!, orcamento.leadId)`.
- **O quê:** `listLeads` sem `pagina`/`porPagina` **não pagina** —
  `api-server/src/routes/leads.ts:135-136`: `const paginado = pagina !== undefined || porPagina !== undefined`.
  Sem os dois, a resposta é a loja inteira.
- **Por que importa:** abrir UM orçamento numa loja com 2.000 noivas baixa as
  2.000 para achar um nome — e o `useGetLead` logo abaixo já devolve a mesma
  noiva completa. Junto com `useListVestidos` (catálogo inteiro) e
  `useListContratos` (todos os contratos, para achar um por `orcamentoId`), a
  tela mais importante do funil abre com **5 requests, 3 deles listas completas**,
  em 2 rodadas sequenciais (`leadCompleto`, `bloqueiosQ` e `contratos` só
  disparam depois que o `getOrcamento` responde).
- **Sugestão:** apagar a query `leads` e ler o nome de `leadCompleto.data`
  (uma linha). Para o contrato, ou o `GetOrcamento` passa a expor `contratoId`
  no contrato, ou a lista é pedida filtrada por orçamento.
- **Severidade:** 🟠

### D5 — Os 12 formulários escrevem o próprio schema Zod à mão; o `api-zod` gerado do contrato tem ZERO consumidores no frontend

- **Onde:** `pages/login.tsx:3`, `pages/agenda/index.tsx:23`,
  `pages/orcamentos/index.tsx:11`, `pages/orcamentos/[id].tsx:31`,
  `pages/admin/index.tsx:6`, `pages/equipe/index.tsx:6`,
  `pages/noivas/noiva-form.tsx:3`, `pages/vestidos/vestido-form.tsx:4`,
  `pages/vestidos/index.tsx:18`, `pages/catalogo/novo.tsx:11`,
  `pages/catalogo/[atributoId]/editar.tsx:14`, `pages/atendimentos/novo.tsx:5` —
  todos `import { z } from "zod"` + um `z.object({…})` local.
  `grep -rn "api-zod" artifacts/moscow-noivas/src` → **nenhum resultado**
  (o servidor o usa em 19 rotas).
- **O quê:** o `replit.md` diz que o contrato é a fonte da verdade e que os
  schemas Zod são GERADOS dele. O cliente não usa nenhum: cada tela reescreve à
  mão a regra que já existe compilada em `lib/api-zod/src/generated/`.
- **Por que importa:** a validação do cliente e a do servidor divergem sem que
  o typecheck reclame — e já divergiram: **o C1 e o C3 são exatamente isto**
  (a tela aceita o que o `POST /contratos` recusa, e lê "5.800" como R$ 5,80).
  Mudar um `min`/`max`/enum no `openapi.yaml` regenera o Zod do servidor e não
  toca as 12 cópias; o compilador, que segundo a arquitetura deveria apontar
  cada call-site quebrado, fica calado porque não há call-site.
- **Sugestão:** o resolver passa a derivar do schema gerado (`XInput` do
  `api-zod`), estendido só onde o formulário precisa de campo de UI (strings de
  máscara de moeda). Onde a divergência for proposital, que seja um `.extend()`
  explícito e não uma reescrita.
- **Severidade:** 🟠

### D6 — Nenhum erro do servidor chega a um campo: `setError` não aparece uma única vez no app

- **Onde:** `grep -rn "setError" artifacts/moscow-noivas/src` → **zero
  ocorrências**. O funil de erro único é `pages/financeiro/helpers.tsx`
  (`mensagemApi`), usado por 11 telas; o resto faz
  `err instanceof Error ? err.message : "Tente novamente."` inline
  (`atendimentos/config.tsx:107,121,138`, `noivas/funil.tsx:130`,
  `vestidos/[id]/editar.tsx`, …).
- **O quê:** todo 400/422 vira um toast destrutivo genérico, longe do campo que
  o causou. `mensagemApi` (helpers.tsx) tem a cadeia
  `código conhecido → data.detalhe → err.message → fallback` — as duas últimas
  pernas repassam texto cru do servidor direto para a tela.
- **Por que importa:** é a face de usuário do B13 (o 400 devolve
  `parsed.error.message` cru do Zod). O cenário concreto está no C1: a vendedora
  clica "Gerar contrato" — o momento mais crítico do funil — e recebe um toast
  com _"Itens menos desconto (950.48) difere do valor total (950.47)"_. Ela não
  sabe qual campo mexer, o diálogo continua aberto com os dados dela, e o toast
  some em segundos. Como não há nem `setError` nem um mapa de `campo → mensagem`,
  não há caminho de conserto pela tela.
- **Sugestão:** o 422 do contrato deveria carregar o caminho do campo
  (`{ campo: "entrada", erro: "…" }`); o cliente vira uma função única
  `aplicarErroDoServidor(form, err)` que faz `form.setError` quando há campo e
  cai no toast só quando não há. É uma função no lugar de 12.
- **Severidade:** 🟠

### D7 — Telas de dinheiro mostram `R$ 0,00` enquanto carregam, e o diálogo de fechar comissão afirma "nenhuma comissão a lançar" antes de saber

- **Onde:**
  - `pages/financeiro/receber.tsx:290-294` — os três `ResumoCard`
    ("A receber", "Recebido", "Em atraso") ficam FORA do gate de carregamento,
    que só cobre a lista (`receber.tsx:320`).
  - `pages/financeiro/pagar.tsx:462-464` — idêntico.
  - `pages/comissoes/index.tsx:530-533` — a descrição do `AlertDialog` de
    fechar competência lê `resumoFechamento`, derivado de `preview.data ?? []`
    (`comissoes/index.tsx:189-192`).
  - `pages/comissoes/index.tsx:458,522` — `jaFechada` é `false` enquanto
    `fechamentos` carrega, então o botão "Fechar competência" nasce habilitado.
- **O quê:** `resumo` e `resumoFechamento` degradam para 0 sobre `?? []`, e o 0
  é renderizado com a mesma tipografia do número verdadeiro.
- **Por que importa:** "A receber R$ 0,00" por 300 ms numa tela de carteira é
  pior que um esqueleto — quem bate o olho e sai leva o número errado. No caso
  das comissões é mais grave: o texto do diálogo é
  _"Nenhuma comissão a lançar nesta competência — o fechamento apenas trava o
  mês"_, e é exatamente o número que a dona da loja lê antes de confirmar uma
  ação que a própria tela chama de irreversível. Se ela abre o diálogo antes do
  `preview` responder (o botão está habilitado, `jaFechada` ainda é `false`), o
  sistema afirma "nada a lançar" e lança N comissões.
- **Contraste:** `fluxo.tsx:142` e `dre.tsx:112` fazem certo — `isPending`
  cobre a tela inteira, incluindo os cartões de resumo.
- **Sugestão:** o `ResumoCard` aceita `carregando` e mostra o `Skeleton` no
  lugar do número; o `AlertDialogAction` de fechar competência fica desabilitado
  enquanto `preview.isPending || fechamentos.isPending`, e a descrição diz
  "calculando…" em vez de zero.
- **Severidade:** 🟠

### D8 — Zero code splitting: o bundle é UM arquivo de 1,1 MB e toda tela do sistema carrega antes do login

- **Onde:** `artifacts/moscow-noivas/src/App.tsx:12-65` (66 imports estáticos de
  página); `artifacts/moscow-noivas/vite.config.ts:44-47` (`build` sem
  `rollupOptions`/`manualChunks`). Saída medida:
  `artifacts/moscow-noivas/dist/public/assets/index-BBRdH5sv.js` = **1,1 MB**
  num único chunk, + 108 KB de CSS.
- **O quê:** nenhuma rota é `lazy()`. Todas as 50+ páginas — inclusive o console
  superadmin, o parser OFX da conciliação, o editor de foto com `<canvas>`
  (`vestidos/[id]/editar.tsx:30`) — entram no mesmo chunk que a tela de login.
- **Por que importa:** a recepcionista que só abre a agenda baixa o app inteiro,
  e o custo maior não é a rede: é o parse/execute em celular modesto, ANTES de a
  tela de login pintar. Como é um chunk só, qualquer deploy invalida o cache de
  tudo. Um split por rota tiraria do caminho crítico ao menos `admin/*` (742
  linhas, só superadmin), `financeiro/conciliacao` (parser OFX),
  `comissoes` (1.137 linhas) e `contratos/[id]` (709) — nenhuma delas aberta no
  primeiro minuto de sessão de ninguém.
- **Nota de verificação:** **`recharts` NÃO está no bundle.** O único importador
  é `components/ui/chart.tsx`, sem consumidor (A5), e o tree-shaking o eliminou
  — `grep -c recharts` no bundle = 0. A dependência segue em `package.json:71`
  sem uso, e a poda do A5 deve levá-la junto. O PDF do contrato é gerado no
  servidor, não no cliente.
- **Sugestão:** `React.lazy` + `Suspense` por rota no `App.tsx`, começando pelas
  quatro acima, e um `manualChunks` separando o cliente gerado e o `date-fns` do
  código de aplicação, para que o deploy de uma tela não invalide o vendor.
- **Severidade:** 🟠 — é o único achado desta trilha sem cenário de erro: custo
  puro, e o mais caro de todos em máquina fraca.

### D9 — Receber e estornar invalidam só as parcelas: o fluxo, o DRE e o alerta de caixa ficam com o número anterior

- **Onde:** `pages/financeiro/receber.tsx:162-163` (`invalidarParcelas`), usado
  em `receber.tsx:202` (receber) e `receber.tsx:218` (estornar).
- **O quê:** um recebimento muda `GET /financeiro/fluxo`, `GET /financeiro/dre`,
  `GET /financeiro/alerta-caixa` e `GET /financeiro/pagamentos` — nenhum deles é
  invalidado. Compare com `pagar.tsx:237-241`, que ao menos invalida os dois
  lados da sua própria operação, e com `comissoes/index.tsx:340-348`, que
  invalida as cinco chaves afetadas e comenta o porquê.
- **Por que importa:** o `AlertaCaixa` está montado no dashboard
  (`dashboard.tsx:133`) e o sino busca a mesma chave em toda tela
  (`sino-notificacoes.tsx:75-82`). Depois de receber R$ 5.000, o cache do
  `alerta-caixa` continua dizendo que o caixa fura na data antiga até o
  `refetchInterval` de 5 minutos passar. Hoje o dano é limitado porque o
  `staleTime: 0` do D3 refaz tudo na navegação — o que significa que **corrigir
  o D3 sem corrigir o D9 transforma um incômodo em dado velho persistente**. Os
  dois precisam andar juntos.
- **Sugestão:** uma função `invalidarCaixa(queryClient, lojaId)` em
  `pages/financeiro/helpers.tsx` listando as chaves que qualquer movimento de
  caixa afeta, chamada por receber, estornar, pagar e estornar-pagamento.
- **Severidade:** 🟡

### D10 — `/comissoes` abre com 7 queries, e duas delas são o mesmo endpoint (uma é subconjunto da outra)

- **Onde:** `pages/comissoes/index.tsx:134-175` — `regras`, `equipe`,
  `preview`, `fechamentos` (linha 148, com `{competencia}`), `historico`
  (linha 156, **sem params**), `pendencias`, `baixas`.
- **O quê:** `fechamentos` e `historico` chamam `listComissaoFechamentos` na
  mesma loja; `historico` traz TODOS os fechamentos e `fechamentos` traz os de
  uma competência — um recorte estrito do que a outra já tem em mãos. O único
  consumidor de `fechamentos` é `jaFechada` (`comissoes/index.tsx:458`), um
  booleano.
- **Por que importa:** 7 requests no mount, refeitos a cada foco de janela
  (D3). Um deles é gratuito: `jaFechada` sai de
  `historico.data?.some(f => f.competencia === competencia)` sem nenhuma ida à
  rede — e ainda deixa de piscar a cada troca de competência no seletor, porque
  o `historico` não muda quando a competência muda.
- **Sugestão:** apagar a query `fechamentos` e derivar `jaFechada` do
  `historico`. As invalidações de `paramsFech` em `comissoes/index.tsx:228,341`
  somem junto.
- **Severidade:** 🟡

### D11 — As faixas da escada de comissão são uma lista EDITÁVEL com `key={i}`

- **Onde:** `pages/comissoes/index.tsx:924-925` — `{faixas.map((f, i) => (<div key={i} …>`,
  com quatro `<Input>` controlados por `atualizarFaixa(i, campo, valor)`
  (`comissoes/index.tsx:265-266`). O estado é `useState<FaixaForm[]>`
  (`comissoes/index.tsx:252`).
- **O quê:** o índice como key numa lista que o usuário insere e remove faz o
  React reaproveitar o DOM da posição, não da faixa. Compare com
  `pages/catalogo/[atributoId]/editar.tsx:229` (`key={f.id}` do `useFieldArray`),
  que faz certo.
- **Por que importa:** ao remover a faixa do meio de uma escada de 4, os
  `<Input>` são controlados e recebem o valor certo, mas foco, seleção de texto
  e posição de cursor migram para a linha de baixo — e como cada faixa tem 4
  campos, é fácil continuar digitando na faixa errada sem perceber. A escada de
  comissão é o número que define o salário variável de cada vendedora.
- **Sugestão:** dar um id local a cada faixa ao criá-la (`crypto.randomUUID()`)
  e usá-lo como key. Mesma correção vale para
  `pages/financeiro/conciliacao.tsx:214-215` (transações do extrato — reordenar
  ou refiltrar embaralha as linhas).
- **Severidade:** 🟡

### D12 — Custos de reparo de avaria são formatados à mão e perdem o separador de milhar

- **Onde:** `pages/reservas/[bloqueioId].tsx:557` —
  `R$ {a.custoReparo.toFixed(2).replace(".", ",")}`.
  A régua do app é `lib/formatos.ts:92-95` (`brl`), usada em 40+ lugares.
- **O quê:** `toFixed` não agrupa milhar. `brl(1200)` → `"1.200,00"`;
  `(1200).toFixed(2).replace(".", ",")` → `"1200,00"`.
- **Por que importa:** um vestido danificado com reparo de R$ 1.200 aparece
  como "R$ 1200,00" nesta tela e "R$ 1.200,00" na parcela cobrável que ela gera
  (E71) — o mesmo número escrito de dois jeitos no mesmo fluxo. É pequeno e é
  exatamente o tipo de coisa que faz a usuária conferir duas vezes.
- **Sugestão:** trocar por `brl(a.custoReparo)`. Vale um lint que proíba
  `toFixed` seguido de `replace` fora de `lib/`.
- **Severidade:** 🟡

### D13 — O `useEffect` que copia a regra de disponibilidade para o state sobrescreve o que a pessoa acabou de digitar

- **Onde:** `pages/atendimentos/config.tsx:57-64`.
- **O quê:** o clássico "effect que copia dado do servidor para `useState`". A
  dependência é `[regra]`, que é `disponibilidade.data` — a referência do objeto
  muda a cada refetch bem-sucedido.
- **Por que importa:** com o `staleTime: 0` do D3 e `refetchOnWindowFocus`
  ligado, a sequência é: a pessoa digita a nova hora de fechamento ("20"),
  alt-tab para conferir a escala no WhatsApp, volta → o `getDisponibilidade`
  refaz → `regra` vira um objeto novo → o effect roda → `setFechamento("19")`
  com o valor do servidor. A digitação some sem nenhuma mensagem, e ela salva o
  horário antigo achando que salvou o novo.
- **Sugestão:** trocar por um formulário de verdade (`useForm` +
  `values: regra`, que o react-hook-form já sabe reconciliar sem apagar campo
  sujo), ou ao menos guardar o effect por "o usuário ainda não tocou no campo".
  A tela é a última do app com esse padrão — as outras 11 já usam
  `react-hook-form`.
- **Severidade:** 🟡

### D14 — Formulário sujo não impede a saída: não há `useBlocker` nem `beforeunload` em nenhum lugar

- **Onde:** `grep -rn "useBlocker\|beforeunload\|isDirty" artifacts/moscow-noivas/src`
  → **zero ocorrências**. `react-router` 7 (`package.json:80`) fornece
  `useBlocker`.
- **O quê:** nenhuma das 12 telas com formulário avisa antes de descartar.
- **Por que importa:** os candidatos concretos são os formulários longos que a
  vendedora preenche com a noiva na frente: `atendimentos/novo.tsx` (766 linhas,
  agendamento + reserva de vestido), o diálogo "Gerar contrato" de
  `orcamentos/[id].tsx:987` (6 campos, incluindo CPF e plano de parcelas), e
  `noivas/noiva-form.tsx`. Um clique na sidebar — que está sempre visível —
  descarta tudo sem uma palavra. Vale notar que os diálogos fecham no clique
  fora / `Esc` pelo comportamento padrão do Radix, o que torna o descarte ainda
  mais fácil de acionar sem querer.
- **Sugestão:** um `useConfirmarSaida(form.formState.isDirty)` sobre
  `useBlocker`, aplicado aos três formulários acima primeiro. Nos diálogos,
  `onInteractOutside`/`onEscapeKeyDown` passam a confirmar quando sujo.
- **Severidade:** 🟡

### D15 — Duas menores: leitura do store sem seletor e `Intl.DateTimeFormat` recriado em 25 arquivos

- **Onde:**
  - `hooks/use-auth.tsx:16` — `const { activeLojaId, setActiveLojaId } = useStoreStore()`
    (sem seletor), em **61 componentes** que chamam `useAuth()`. Idem
    `app-layout.tsx:21`. Hoje é inofensivo porque o store tem dois campos; passa
    a não ser no instante em que alguém puser um terceiro.
  - `pages/financeiro/helpers.tsx:33` — `useCaminhoDaLoja` devolve uma closure
    nova a cada render, então nenhum filho que a receba pode ser memoizado.
  - 25 arquivos declaram o próprio `new Intl.DateTimeFormat("pt-BR", …)`
    (`fluxo.tsx:39,46,53`, `comissoes/index.tsx:103,106`, `projecao.tsx:42,43`,
    `noivas/helpers.ts:8,17`, `reservas/helpers.ts:12,19,22,25,28,37`, …), com
    quatro convenções de `timeZone` diferentes: `"UTC"` (dia de negócio),
    `"America/Sao_Paulo"` (instante), ausente (fuso do navegador — em
    `contratos/index.tsx:95`, `contratos/[id].tsx:357,389`,
    `orcamentos/index.tsx:233`, `equipe/index.tsx:343`,
    `noivas/[leadId]/index.tsx:459`), e `agenda/grade.tsx:238`, que instancia o
    formatador **dentro do JSX**, recriando-o a cada render de cada célula.
  - `components/sino-notificacoes.tsx:176` — `void versaoDispensadas;` dentro de
    um `useMemo`, para forçar o recálculo depois de escrever no `localStorage`.
    Funciona, mas é estado de fora do React sendo lido em render.
- **Por que importa:** os formatadores sem `timeZone` estão todos sobre
  instantes (`fechadoEm`, `createdAt`, `expiraEm`), então hoje acertam — mas a
  regra de `replit.md` ("data de negócio ≠ instante") só é legível quando o fuso
  é explícito, e a única forma de conferir se um deles errou é abrir os 25
  arquivos. `lib/formatos.ts` já é o lugar certo e só tem dois exportados.
- **Sugestão:** subir os formatadores para `lib/formatos.ts` com nomes que digam
  a semântica (`diaDeNegocio`, `instanteLocal`, `mesAno`), e pôr `timeZone`
  explícito em todos, inclusive nos que hoje omitem. `useCaminhoDaLoja` volta
  memoizado; a leitura do store passa a usar seletor.
- **Severidade:** 🔵

## Padrões repetidos (o que pede um hook/componente compartilhado)

Em ordem de quanto pesam:

1. **`useXQuery(lojaId, params, { query: { queryKey: getXQueryKey(lojaId, params), enabled: !!activeLojaId } })`** —
   escrito **~90 vezes**, quase idêntico. O `queryKey` explícito é redundante
   (o Orval já o gera igual, `api.ts:5975`) e o `enabled: !!activeLojaId` é
   redundante duas vezes (o próprio gerado já traz
   `enabled: lojaId !== null && lojaId !== undefined`, `api.ts:5985`). Um
   `useQueryDaLoja(hook, params, { alem: … })` reduziria ~270 linhas de ruído e
   daria UM lugar para pôr o `staleTime` do D3.
2. **Filtro + intervalo + resumo + lista, na URL** — `receber.tsx:96-160`,
   `pagar.tsx:112-220`, `folha.tsx` e `cobranca.tsx` repetem a mesma máquina:
   ler filtro/`ini`/`fim` do `searchParams`, `atualizarParams` (idêntico caractere
   a caractere em `receber.tsx:125-132` e `pagar.tsx:153-160`), `naJanela`,
   `resumo`, `lista` ordenada, e a fileira de botões de filtro. É um
   `useRecorteFinanceiro(FILTROS)` + um `<BarraDeFiltro>`.
3. **Campo de dinheiro** — cada tela remonta a leitura do teclado
   (`toFixed(2).replace(".", ",")` para preencher em `receber.tsx:171`,
   `pagar.tsx:257`, `contratos/[id].tsx:270`, `folha.tsx:208`, e `parseValor`
   para ler de volta — quando lembram; ver C3). Pede o `<InputMoeda>` que a
   trilha C já apontou, com a conversão nas duas direções num lugar só.
4. **`Map` de id → nome a partir de `listEquipe`** — `pagar.tsx:162-166`,
   `comissoes/index.tsx:421-425`, `atendimentos/index.tsx` e `folha.tsx`
   constroem o mesmo mapa com o mesmo laço. Um `useNomesDaEquipe()` resolve, e
   de quebra centraliza o `staleTime: Infinity` que essa lista merece.
5. **Estado de erro de listagem** — há três desenhos vivos para a mesma coisa:
   `components/estado-erro.tsx` (`EstadoErro`, 7 telas),
   `pages/financeiro/helpers.tsx` (`ErroListagem`, 11 telas) e o `<Alert>`
   copiado inline em `receber.tsx:309-319`, `vestidos/[id].tsx`,
   `orcamentos/[id].tsx:222-232` e `noivas/[leadId]/index.tsx`. Os dois
   componentes são o MESMO layout com props de nomes diferentes (`titulo`/`erro`
   vs `mensagem`) — sintoma do A9 (falta uma camada `@/lib/ui`).
6. **`window.location.origin` + template de link público** — `lib/portal.ts:20`
   (portal), `orcamentos/[id].tsx:254` (orçamento),
   `noivas/[leadId]/lookbook.tsx:34` (lookbook), `equipe/index.tsx:83` (convite),
   `configuracoes/captacao.tsx:33` (captação). Cinco cópias da mesma montagem, e
   `lib/portal.ts` já é a régua única prometida pelo E84 — só não foi adotada
   pelas outras quatro.

## O que está BEM (não mexer)

- **`pages/noivas/index.tsx` é o modelo da casa.** Busca com debounce de 300 ms
  (linhas 58-62), paginação e filtro no SERVIDOR, `keepPreviousData` para não
  piscar ao trocar de página (linha 84), e o efeito que devolve à página 1 ao
  mudar de filtro (linhas 64-66). É o que qualquer listagem do app deveria imitar.
- **`pages/noivas/funil.tsx`** resolveu o kanban do jeito difícil e certo: uma
  query paginada POR COLUNA em vez de baixar a loja e distribuir em memória, e
  `invalidarColunas([origem, destino])` (linhas 105-113) invalidando só as duas
  colunas tocadas em vez do prefixo inteiro. O comentário nas linhas 62-65
  explica a decisão — é o padrão de invalidação cirúrgica que falta no D9.
- **A proteção contra duplo clique é universal.** Todos os 20+ botões de submit
  e todas as `AlertDialogAction` destrutivas verificadas estão presos a
  `isPending`/`isSubmitting` e trocam o rótulo enquanto voa
  (`comissoes/index.tsx:538`, `receber.tsx:438`, `admin/index.tsx:362,501,610,732`,
  `equipe/index.tsx:574,645,702,723`, `atendimentos/novo.tsx:687,758`). Não achei
  uma exceção.
- **Disciplina de `useEffect`.** Oito no app inteiro, e seis são legítimos
  (debounce, fechar drawer na navegação, hidratação do tema, tour de primeira
  entrada). Praticamente não há estado derivado guardado em `useState` — os
  cálculos moram em `useMemo` sobre `query.data`, como devem.
- **`App.tsx:74-87`** — a derrubada de sessão no 401 com a exceção explícita do
  próprio `getMe` (linhas 79-81) é sutil e está certa; o comentário explica por
  que o caso ingênuo quebraria o pós-login.
- **`components/alerta-caixa.tsx:35`** — `if (!data?.ancorado || !data.diaNegativo) return null`
  resolve carregamento, erro e vazio com a mesma linha, e o comentário defende a
  escolha ("nada a dizer é nada na tela"). É a decisão certa para um alerta.
- **`pages/financeiro/fluxo.tsx:142` e `dre.tsx:112`** usam `isPending` (não
  `isLoading`) e cobrem a tela inteira com esqueleto — exatamente o contrário do
  D7, no mesmo diretório.

## Pistas para as outras trilhas

- **E (UI):** o D7 é meio de vocês — o esqueleto de `fluxo.tsx`/`dre.tsx` e o
  `R$ 0,00` de `receber.tsx`/`pagar.tsx` são a mesma tela em dois idiomas
  visuais, e a escolha entre eles é de design antes de ser de código. E o item 5
  dos padrões repetidos (`EstadoErro` × `ErroListagem` × três `<Alert>` inline) é
  um mesmo componente de design system escrito três vezes — junto com os 27
  shadcn não usados do A5, é o diagnóstico de que não há uma camada de UI
  própria. Nota específica: `components/ui/chart.tsx` e a dependência `recharts`
  podem cair juntos na poda (confirmei que não estão no bundle).
- **F (UX):** o D14 (formulário sujo que some sem aviso) e o D6 (o 422 do
  contrato virando toast genérico no clique "Gerar contrato") são a mesma
  jornada vista de dois ângulos: o momento mais caro do funil é o menos
  protegido da tela. E o D1 tem uma pergunta de produto embutida que só vocês
  respondem: quando a URL diz uma loja e a sessão diz outra, quem ganha? Hoje
  ninguém ganha — as duas brigam. Vale também olhar o D13 pelo lado da usuária:
  a configuração de horário da loja apaga o que ela digitou se ela sair da aba.
- **G (consolidação):** **D3 e D9 são um épico só e não podem ser separados** —
  pôr `staleTime` sem consertar a invalidação do caixa converte um incômodo de
  rede em dado financeiro velho na tela. D2 e D4 são o mesmo épico ("terminar o
  E79 no cliente"), e D2 arrasta uma mudança de `openapi.yaml` (`listContasPagar`
  sem parâmetro de janela). D5 e D6 são um épico de contrato-até-a-borda e fecham
  junto com o C1/C3 — o épico "a tela de orçamento para de calcular dinheiro" que
  a trilha C propôs ganha muito se levar a validação gerada junto. D1 é isolado,
  barato e deveria ir sozinho e primeiro: é o único achado desta trilha que deixa
  a página inutilizável. D8 é isolado e não depende de nada.
- **B (backend):** confirmando o que vocês pediram — `GET /lojas/:lojaId/portais`
  é consumido em `pages/mensagens/index.tsx:91-94` e só alimenta
  `urlsDePortalPorLead` (`lib/portal.ts`), um `Map` de `leadId → URL`. **O token
  não é guardado nem logado do lado de cá**, mas ele ENTRA no cache do TanStack
  Query com a resposta inteira e fica em memória enquanto a aba viver — e o gate
  do cliente é `leads.ver` (`mensagens/index.tsx:92`), mais frouxo do que
  "quem pode ver o link financeiro de todas as noivas". Se o contrato passasse a
  devolver a URL montada em vez do token cru, o cliente não precisaria do token
  para nada. Sobre o B13: confirmado que a única barreira do lado de cá é
  `mensagemApi` (`pages/financeiro/helpers.tsx`), cuja terceira perna repassa
  `err.message` cru — ver D6.
