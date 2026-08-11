# Ângulo 8 — passivo
**Rodada 2, base 89b38c8** · localizador + cético por achado

Cinco achados sobreviveram ao cético; nenhum foi refutado. Quatro são 🟡 da
mesma família — o criar×editar da S-M9, cada um com a âncora que faltava à
varredura — e um é 🔵 de limpeza pura. Nenhum toca dinheiro.

## Sobreviventes

### 1. 🟡 O comentário da conciliação afirma guarda `financeiro/criar` que não existe — o servidor exige `editar` desde o E115, e a tela nasceu errada uma semana DEPOIS

**Âncora:** `artifacts/moscow-noivas/src/pages/financeiro/conciliacao.tsx:58` · enumera **S-M9**

**Evidência.** `conciliacao.tsx:54-58`: «o que ESCREVE é só o "Marcar como
conferidas" (POST /financeiro/conciliacao/marcar, guardado por
financeiro/criar via o prefixo de financeiro.ts:111)», seguido de
`const podeMarcar = podeNoModulo(acessosModulos, "financeiro", "criar")`. Mas
`permissoes.ts:103` tem `marcar` em `POST_QUE_MUTA` («E115: `marcar` e
`enviar` entraram na lista — `conciliacao/marcar` [...] carimba linhas
EXISTENTES», `permissoes.ts:124-127`), o prefixo `financeiro.ts:112` é
`requireModulo("financeiro")` sem ação, e `auth.ts:143` deriva via
`acaoDoRequest` → POST + `/marcar$` = **editar**. Cronologia conferida no
git: o E115 mudou o servidor em `9a2f4ca` (2026-07-30); o gate da tela e o
comentário nasceram em `05cf366` (S42, 2026-08-07) — o comentário já mentia
no dia em que foi escrito.

**Mecanismo.** O S42 leu só o prefixo de `financeiro.ts` e concluiu que POST
deriva `criar` — mas o guard de prefixo passa por `acaoDoRequest`, que desde
o E115 casa o caminho `conciliacao/marcar` em `POST_QUE_MUTA` e exige
`editar`. A tela então mostra o botão exatamente para o conjunto errado: quem
tem `criar` (e não `editar`) vê e leva 403; quem tem `editar` (e não `criar`)
— a única pessoa que o servidor aceita — nem vê o botão. É o cenário literal
que o próprio comentário do E115 descreve (`permissoes.ts:127-128`) reaberto
pela tela.

**Consequência.** A estagiária com financeiro {ver, criar} sobe o extrato do
mês, casa as linhas, clica "Marcar como conferidas" e leva 403 depois do
trabalho feito; a gerente com {ver, editar} abre a mesma tela e o botão não
existe — as casadas do extrato (num mês típico da loja do seed, ~30
movimentos) ficam sem carimbo `conciliadoEm` e reaparecem como pendência na
conferência seguinte. Nenhum perfil consegue, pela tela, o gesto que o
servidor permite.

**Veredito do cético (🟡 confirmada).** Confirmado linha a linha neste run:
`conciliacao.tsx:58` gateia o botão (linha 326) com `financeiro/criar` e o
comentário (54-57) afirma essa guarda, mas o servidor exige `editar` —
`financeiro.ts:111` é `requireModulo("financeiro")` sem ação,
`middlewares/auth.ts:143` deriva via `acaoDoRequest`, e `permissoes.ts:103`
casa o `/marcar$` de `financeiro.ts:570` em `POST_QUE_MUTA` → "editar".
Nenhuma outra camada neutraliza: o `podeNoModulo` do frontend
(`lib/permissoes.ts:31-40`) não tem equivalência criar↔editar, o teste do
E115 prega só a API, e nenhum dos 15 fechos de hoje toca esse gate. {ver,
criar} vê o botão e leva 403; {ver, editar} — o único perfil que o servidor
aceita — não vê o botão. 🟡 correto: defeito real, sem perda de dinheiro,
gatilho condicionado a perfis com criar/editar separados (superadmin e acesso
pleno ao módulo não são afetados). Enumera um sítio legítimo da S-M9.

### 2. 🟡 O comentário S36 das comissões afirma que as três ações são guardadas só por `requireModulo("comissao")` — a baixa de estorno exige `admin.editar` na própria rota, e o botão "Dar baixa" ignora isso

**Âncora:** `artifacts/moscow-noivas/src/pages/comissoes/index.tsx:167` · enumera **S-M9**

**Evidência.** `comissoes/index.tsx:155-160`: «As três ações desta tela
(baixar estorno, reabrir fechamento, criar regra) vivem em
`/lojas/:lojaId/comissao`, que o servidor guarda por
`requireModulo("comissao")`» → linha 167:
`const podeMexerNaComissao = podeNoModulo(acessosModulos, "comissao", "editar")`
→ linha 663: `{soEstorno && podeMexerNaComissao && (` gateia o botão "Dar
baixa". Mas `comissao.ts:1338-1339`:
`router.post("/lojas/:lojaId/comissao/estornos/baixa", requireModulo("admin", "editar"), ...)`
— e o comentário da rota (`comissao.ts:1333`) diz «uma decisão humana,
gateada por admin». A linha 152 da própria tela ainda guarda a versão antiga
e CONTRADIZ o bloco S36: «Baixar estorno é ação de admin — a mesma régua do
gate do backend».

**Mecanismo.** O S36 trocou o gate da tela de `admin.editar` para
`comissao.editar` e escreveu que as três ações compartilham a mesma guarda —
mas a rota da baixa de estorno declara `requireModulo("admin", "editar")`
EXPLÍCITO além do prefixo comissao. A guarda real da baixa é
`comissao.editar` E `admin.editar`; a tela pergunta só a primeira. Os dois
comentários da tela (linha 152 e linhas 155-160) afirmam guardas diferentes
entre si, e o código segue a errada.

**Consequência.** A gerente com comissao {ver, editar} e sem admin vê o
estorno pendente de uma venda cancelada — ex.: R$ 500,00 carregando há três
competências — com o botão "Dar baixa" oferecido, preenche o motivo no
diálogo e leva 403 ACESSO_NEGADO_MODULO no envio. Nos quatro perfis padrão
ninguém tropeça (só a Proprietária tem os dois módulos), que é exatamente o
gatilho-raro que o próprio comentário da tela documenta para a família.

**Veredito do cético (🟡 confirmada).** Confirmado com âncoras lidas neste
run: `comissoes/index.tsx:167` gateia por `comissao.editar` e a linha 663
mostra "Dar baixa" só com isso, enquanto `routes/comissao.ts:1338-1339` exige
`requireModulo("admin","editar")` ALÉM do prefixo comissao (linha 60) — única
rota mutante do arquivo com guarda extra; o middleware (`auth.ts:145-146`)
devolve 403 ACESSO_NEGADO_MODULO. Nenhuma outra camada guarda o caso (sem
checagem admin na tela, client gerado não filtra permissão, nenhum teste
prega o gate do botão), os comentários das linhas 153 e 155-160
contradizem-se entre si e o código segue o errado. Não é duplicata dos 15
fechos de hoje. Gatilho raro (só perfil customizado com `comissao.editar` sem
admin) e custo baixo — 🟡 correta.

### 3. 🟡 O TODO do catálogo mente que «o gate é flat por módulo» — o servidor deriva `criar` do POST desde o E101, e o botão "Novo atributo" pergunta `editar`

**Âncora:** `artifacts/moscow-noivas/src/pages/catalogo/index.tsx:18` · enumera **S-M9**

**Evidência.** `catalogo/index.tsx:17-20`: «No main o backend gateia
/atributos pelo módulo "vestidos" (catalogo.ts). // TODO Onda 4: o orcamentos
distinguia ver/criar/editar dentro de "config"; hoje o gate é flat por
módulo.» seguido de
`const podeGerir = podeNoModulo(acessosModulos, "vestidos", "editar")`, que
gateia o botão "Novo atributo" (linha 40). Mas o gate NÃO é flat:
`catalogo.ts:27` é `requireModulo("vestidos")` sem ação, `auth.ts:143` deriva
via `acaoDoRequest`, e `permissoes.ts:82-87` mapeia POST→criar (`/atributos`
não termina em verbo de `POST_QUE_MUTA`). O modelo módulo×ação que o TODO
pede já existe (`permissoes.ts:2`: «Permissões por MÓDULO × AÇÃO»).

**Mecanismo.** O comentário descreve o mundo de antes do E101: hoje cada
requisição a /atributos exige a ação derivada do método (GET→ver, POST→criar,
PATCH/DELETE→editar). Guiada pelo comentário errado, a tela usa `editar` como
proxy de "pode gerir" — mas o POST de criação exige `criar`. Quem tem
vestidos {ver, editar} sem criar vê o botão e leva 403; quem tem {ver, criar}
sem editar pode criar atributo pela API mas o botão não aparece. O TODO ainda
aponta para trabalho ("distinguir ações") que o backend já fez — é TODO de
coisa já feita, segurando um gate errado.

**Consequência.** No perfil customizado que separa criar de editar em
vestidos, o Catálogo trava num dos dois sentidos: ou a pessoa monta o
atributo no formulário e o POST volta 403 depois do preenchimento, ou a única
pessoa autorizada a criar não encontra o caminho na tela. Sem dinheiro
envolvido — o custo é o gesto negado depois de oferecido.

**Veredito do cético (🟡 confirmada).** Confirmado em código lido neste run:
`catalogo/index.tsx:17-20` traz o TODO «hoje o gate é flat por módulo» e
gateia o botão "Novo atributo" (linha 40) e o hint "Crie o primeiro" (linhas
62-64) com `podeNoModulo("vestidos","editar")` — mas o gate não é flat:
`catalogo.ts:27` é `requireModulo("vestidos")` sem ação,
`middlewares/auth.ts:143` deriva via `acaoDoRequest`, e
`permissoes.ts:132-140` dá POST /atributos → criar (não casa
`POST_QUE_MUTA:102-103`). O estado {ver, editar, criar:false} é «válido e
comum» pelo próprio backend (api-server `permissoes.ts:97-100`, caso do
receber), o espelho do cliente trata criar e editar como independentes
(moscow-noivas `lib/permissoes.ts:31-40`), e nenhum E2E prega o gate atual.
As telas irmãs usam "criar" para botão de criar (`vestidos/index.tsx:134`,
`ajustes/index.tsx:65`) — o Catálogo é o destoante. Não duplica nenhum dos 15
fechados; é sítio novo da família S-M9 (o rastreador só lista `pagar.tsx:621`
e diz que a varredura «fica de guarda para o nono» — catalogo não aparece em
doc nenhum da trilha), na direção espelhada do exemplar: tela pede editar,
servidor exige criar.

### 4. 🟡 O estoque esconde o formulário de criação atrás de `vestidos.editar` enquanto o POST /itens-estoque exige `criar` — mais um sítio do criar×editar, sem comentário nenhum desta vez

**Âncora:** `artifacts/moscow-noivas/src/pages/vestidos/estoque.tsx:78` · enumera **S-M9**

**Evidência.** `estoque.tsx:78`:
`const podeGerir = podeNoModulo(acessosModulos, "vestidos", "editar")`; linha
181: `{podeGerir && (` envolve o `<form onSubmit={form.handleSubmit(onCriar)}>`
que cadastra a peça ("Saiote 2 aros"). No servidor, `vestidos.ts:72`:
`router.use("/lojas/:lojaId/itens-estoque", requireModulo("vestidos"))` sem
ação, e `vestidos.ts:745`: `router.post("/lojas/:lojaId/itens-estoque", ...)`
— caminho termina em substantivo, `acaoDoRequest` deriva **criar**
(`permissoes.ts:85`).

**Mecanismo.** Um único booleano `podeGerir` (editar) governa três gestos de
ações distintas no servidor: criar item (POST→criar), mudar quantidade
(PATCH→editar) e apagar (DELETE→editar). Para os dois últimos o gate está
certo; para o formulário de criação está trocado — a mesma forma da S-M9
(`pagar.tsx:621`), no módulo vestidos. Quem tem {ver, criar} sem editar não
vê formulário nenhum (e a tela ainda lhe diz «Peça à administração para
cadastrar o estoque», linha 266, embora o servidor a autorize); quem tem
{ver, editar} sem criar vê o formulário e o POST devolve 403.

**Consequência.** No perfil que separa as ações, o cadastro dos saiotes e
crinóis — a razão de ser da tela, segundo o próprio empty-state — ou é negado
depois de preenchido (403 no submit) ou é oferecido a ninguém. Gatilho raro
(exige perfil customizado), custo por ocorrência baixo: 🟡.

**Veredito do cético (🟡 confirmada).** Achado confirmado com todas as
âncoras lidas neste run: `estoque.tsx:78` gate por "editar" e :181 envolve o
form de criação, enquanto o servidor deriva "criar" para POST /itens-estoque
(`vestidos.ts:72` monta requireModulo sem ação; `auth.ts:143` cai em
`acaoDoRequest`; o caminho termina em substantivo e não casa com
`POST_QUE_MUTA`, logo `acaoDoMetodo` devolve "criar" em `permissoes.ts:85`).
Nenhuma guarda noutra camada: sem ação explícita na rota, nenhum teste de
permissão cobre itens-estoque, e as semânticas de frontend e servidor
concordam que criar e editar são independentes — os dois perfis quebrados
({ver,criar} sem formulário; {ver,editar} com 403 no submit) são estados
válidos. Não é duplicata: S-M11 (`aa206ce`) fechou outro defeito no mesmo
arquivo, e os "7 sítios" da S-M9 nunca foram nomeados (transcrição perdida,
`RELATORIO.md:91-94`) — esta enumeração ancorada é exatamente o que a
varredura S-M9 precisa.

### 5. 🔵 `ui/tabs.tsx` não tem nenhum importador vivo desde o E130 — e `@radix-ui/react-tabs` continua declarado no package.json

**Âncora:** `artifacts/moscow-noivas/src/components/ui/tabs.tsx:1` · não enumera sobra

**Evidência.** `git grep` de `ui/tabs` e de `Tabs` em
artifacts/moscow-noivas/src devolve, fora do próprio arquivo, apenas dois
comentários no pretérito — `configuracoes/index.tsx:97`: «Esta era a única
pílula de `ui/tabs` do app — a terceira cara para o mesmo gesto» (a tela hoje
desenha as abas com `<div role="tablist">` cru, linha 99). O scanner de
módulos órfãos confirmou: zero imports estáticos e zero `import()` dinâmicos
(o único lazy do app é busca-global, `app-layout.tsx:17`). A dependência
sobrevive: `artifacts/moscow-noivas/package.json:26`:
`"@radix-ui/react-tabs": "^1.1.4"`.

**Mecanismo.** O E130/A3 eliminou o último uso da pílula de tabs ao unificar
as duas línguas de navegação, mas removeu só o import da tela — o componente
shadcn inteiro (Tabs, TabsList, TabsTrigger, TabsContent) e o pacote radix
que ele embrulha ficaram para trás. O Vite tree-shaka o bundle, então o custo
é de repositório, não de runtime: um componente que parece disponível, uma
dependência que o pnpm instala a cada CI, e a chance de alguém reintroduzir a
«terceira cara para o mesmo gesto» que o E130 matou por decisão registrada.

**Consequência.** Nenhum dinheiro e nenhum comportamento — limpeza: apagar o
arquivo e a linha 26 do package.json fecha. O risco real é de design: o
componente órfão é um convite a ressuscitar o padrão que a rodada 7 decidiu
extinguir.

**Veredito do cético (🔵 confirmada).** Confirmado com âncoras lidas neste
run: `tabs.tsx` (linhas 1-53) é o único importador de `@radix-ui/react-tabs`
(`tabs.tsx:2`) e não tem nenhum importador vivo — git grep por `ui/tabs`,
`<Tabs`, TabsList/Trigger/Content e `import()` dinâmico devolve só os dois
comentários no pretérito (`configuracoes/index.tsx:48` e :97), e a tela
desenha as abas com `<div role="tablist">` cru na linha 99. `package.json:26`
mantém `"@radix-ui/react-tabs": "^1.1.4"`. Não é duplicata de nenhum dos 15
fechos de hoje nem sítio das quatro sobras abertas; não há guarda noutra
camada (nenhum knip/depcheck/lint de dead-code no CI). Sem dinheiro nem
comportamento em jogo (Vite tree-shaka), é limpeza pura.

## Refutados

O cético confirmou os cinco achados — nenhum refutado neste ângulo.

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | — |

## Cobertura

**Teto atingido: não.**

Notas do localizador — varreduras que voltaram limpas, para o consolidador
saber o que JÁ foi olhado:

1. **Exports sem importador** — scanner sobre todos os .ts/.tsx do escopo
   achou 219 candidatos, e a leitura um a um mostrou que são tipos exportados
   por documentação ou símbolos usados dentro do próprio arquivo
   (`TRANSICOES_ORCAMENTO`/`RESERVA` alimentam as funções de transição ao
   lado; `parseExtratoOFX` é chamado por `parseExtrato` na linha 162;
   `lojaIdDaUrl` é usado em `auth.ts:66/97`; os `insertXSchema` do drizzle-zod
   são boilerplate padrão do schema) — o único módulo genuinamente morto é o
   `ui/tabs.tsx` do achado 5.
2. **Colunas de schema sem leitor** — as 38 flags do scanner eram todas nomes
   de índice/unique/pk, que só existem mesmo dentro do `pgTable`; nenhuma
   coluna real órfã.
3. **TODO/FIXME** — só 2 no escopo: o do catálogo (achado 3) e o de
   `artifacts/api-server/.replit-artifact/artifact.toml:2`
   (`previewPath = "/api" # TODO - should be excluded from preview`), que
   afirma comportamento da plataforma Replit que não dá para provar por
   leitura de código — não virou achado.
4. **Comentários com hora de expediente** (a forma da S-M13): todas as
   menções a 19h restantes são históricas e corretas.
5. **Miudezas que não valem linha na tabela:**
   `artifacts/api-server/src/lib/.gitkeep` é vestigial (o diretório tem 27
   arquivos); o comentário de `conciliacao.tsx:57` cita «financeiro.ts:111» e
   o prefixo está na 112 — off-by-one absorvido no achado 1.

Os quatro achados 🟡 são todos sítios da família S-M9 com a mesma correção de
forma (cruzar a declaração da tela com a ação que `acaoDoRequest` deriva);
não sei se estão entre os «mais 7 sítios» que o localizador da rodada 1
contou e não listou — a enumeração com âncora é exatamente o que faltava
registrar.
