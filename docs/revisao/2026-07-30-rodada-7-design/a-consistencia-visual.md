# Trilha A — o esqueleto é UM sistema; a colagem está nos detalhes onde a régua existe e não chega

As 54 telas compartilham tokens, serif nos títulos, cards e a paleta quente —
ninguém confunde este app com outro. A colagem aparece um andar abaixo: o
**status** muda de cor entre telas, o **dinheiro grande** tem quatro
tipografias apesar de a escala ser decisão do dono, e a **navegação entre
visões irmãs** fala quatro gramáticas. Em todos os casos a régua já existe
(escala de dinheiro, `ui/tabs`, `ResumoCard`, `CabecalhoDetalhe`) — o defeito é
adoção, não desenho.

**Método e ambiente.** Li as 27 capturas `*--claro.png` de
`docs/revisao/2026-07-30-rodada-7-design/capturas/` (viewport 1280×800, banco
de dev da loja `84e539bd` — nomes `E2E *`/`Decote 178…` e contagens infladas
são artefato de fixture, não defeito) e 6 `*--escuro.png` (dashboard,
financeiro, noivas-ficha, contratos, portal-noiva, configuracoes). Locale do
navegador desconhecida (`AMBIENTE.md`) — nenhum achado aqui depende dela; datas
`mm/dd/yyyy` visíveis em orcamento-detalhe e folha são o comportamento de
plataforma já medido no E92 e não viram achado. No código
(`artifacts/moscow-noivas/src/`): `index.css` inteiro, `cabecalho-detalhe.tsx`,
`ui/card.tsx`, `escala-dinheiro.test.ts`, `aparencia.test.ts` e as telas
citadas linha a linha. Sem trilha anterior nesta rodada — sou a primeira.

---

## A1 🟠 — O badge de status não tem gramática: o mesmo estado muda de cor entre telas, e estados opostos dividem a mesma cor

**Capturas:** `dashboard--claro.png` (badge "Agendado" ROSA na lista "Hoje na
loja") vs `atendimentos--claro.png` (badge "Agendado" CINZA na fila).
**Código:** `src/pages/dashboard.tsx:424-431` (AGENDADO/EM_ATENDIMENTO →
`default`, CONCLUIDO → `secondary`, FALTOU → `outline`) vs
`src/pages/atendimentos/index.tsx:315-320` (TODAS as situações →
`variant="secondary"`, inclusive Faltou) e `src/pages/provas/index.tsx:163-165`
(idem).

O cenário é a transição mais comum do dia: a vendedora vê "Agendado" rosa no
dashboard, clica "Hoje na loja" e cai na fila — onde o mesmo atendimento, no
mesmo minuto, é cinza. Pior: na fila, **"Faltou" é o mesmo cinza de
"Agendado"** — o estado que pede reação (remarcar, cobrar presença) não se
distingue do estado em dia sem ler o texto de cada linha.

O mesmo par de conceitos com mapeamentos OPOSTOS: cabine ativa é
`default`(rosa)/inativa `secondary` em `src/pages/agenda/index.tsx:274`, mas
vestido ativo é `secondary`/inativo `outline` em
`src/pages/vestidos/[id].tsx:287-289`. E o estado negativo tem três caras no
sistema: Cancelado = `destructive` (`src/pages/contratos/index.tsx:115`),
Recusado = `outline` (`src/pages/orcamentos/index.tsx:244`), Faltou =
`secondary` na fila e `outline` no dashboard. Medido: as 4 variantes do
`Badge` cobrem os estados em **6 combinações contraditórias em 7 telas**.

O conserto é uma tabela de uma linha por semântica (em dia / em andamento /
terminou bem / terminou mal / inativo), morando num lugar só — o mesmo
movimento que o E99 fez com a escala de dinheiro.

## A2 🟠 — O degrau maior do dinheiro tem quatro tipografias, e o mesmo R$ 39.688,00 muda de cara a um clique

A decisão do dono (2026-07-28, `src/index.css:307-334`): dinheiro é **serif no
degrau maior** e os três degraus levam sempre `tabular-nums`. O
`escala-dinheiro.test.ts` defende a definição das classes — de propósito não
persegue os call-sites (cuidado (a) do E99, que recusou a reescrita dos 92).
Este achado não pede a reescrita: mede que **o degrau de TOPO — exatamente o da
decisão — está fora dela em 11 de 15 pontos**.

**Capturas:** `dashboard--claro.png` mostra "Minha comissão neste mês —
R$ 39.688,00" em **sans bold**; `minha-comissao--claro.png` mostra o MESMO
número em **serif tabular** — um clique de distância.
`financeiro--claro.png` tem os dois estilos NA MESMA tela: Entradas/Saídas/
Saldo em serif (`money-md`) e, três cards abaixo, A RECEBER/A PAGAR em sans
semibold. **Código, os 11 pontos fora:**

- `src/pages/dashboard.tsx:315, 330, 350` — `text-2xl font-bold`, sem serif e
  **sem `tabular-nums`** (3 pontos);
- `src/pages/financeiro/cobranca.tsx:318` — `CardTitle` + `text-2xl
  tabular-nums`; `CardTitle` é `<div font-semibold>`
  (`src/components/ui/card.tsx:32-41`), não herda o serif dos headings — os 3
  cards de faixa saem sans enquanto os KPIs de receber/pagar/folha, o mesmo
  desenho, saem `money-lg` serif via `ResumoCard`;
- `src/pages/financeiro/fluxo.tsx:295, 302` — `text-xl font-semibold` sans (2);
- `src/pages/minha-comissao/index.tsx:99, 112, 127, 165` — `font-serif text-2xl
  tabular-nums` à mão: serif, mas um degrau que não existe na escala (4).

E a própria escala é sobrescrita onde foi adotada:
`src/pages/comissoes/index.tsx:698` (`money-lg text-2xl`) e
`src/pages/financeiro/dre.tsx:197` (`money-lg text-4xl`) redefinem o tamanho do
degrau no call-site. Resultado medido: os "três degraus" são hoje **seis
tamanhos efetivos** (xl sans, 2xl sans-bold, 2xl sans-semibold, 2xl serif, 3xl
serif, 4xl serif). A dona que compara o caixa entre telas lê o mesmo tipo de
número em pesos diferentes e o olho atribui hierarquia onde não há.

## A3 🟠 — A navegação entre visões irmãs tem quatro caras

O mesmo gesto — alternar entre recortes do mesmo domínio — sai com quatro
desenhos, um por grupo do menu:

- **Aba sublinhada à mão:** `src/pages/atendimentos/index.tsx:497-514`
  (`role="tablist"`, `border-b-2 border-primary`) — captura
  `atendimentos--claro.png` ("Atendimentos | Provas");
- **Pílula do `ui/tabs`:** `src/pages/configuracoes/index.tsx:82-88`
  (`TabsList` com fundo) — captura `configuracoes--claro.png` ("Loja Atual |
  Administração"); é o ÚNICO uso de `ui/tabs` no app (inventário, linha 91);
- **Links de texto com seta:** `src/pages/financeiro/fluxo.tsx:153-174`
  ("Projeção de caixa → · Resultado do mês → · …") — captura
  `financeiro--claro.png`;
- **Botões ghost no cabeçalho:** `src/pages/agenda/index.tsx:126-131`
  ("Semana", "Fila de atendimentos") — captura `agenda--claro.png`.

A vendedora que aprendeu que "aba sublinhada" muda a visão em Atendimentos não
reconhece a pílula de Configurações nem o link-seta do Financeiro como o mesmo
gesto: **quatro gramáticas para um conceito, em quatro dos cinco grupos do
menu**. Cada desenho isolado é bom (o link-seta do financeiro carrega bem seis
destinos); o custo é a soma. Vale decidir DUAS línguas — "alterna a visão
desta tela" (tabs) e "vai a outra tela do domínio" (links) — e escrever qual é
qual.

## A4 🟡 — O botão primário do cabeçalho fala em duas capitalizações — e em Vestidos as duas aparecem lado a lado

**Captura:** `vestidos--claro.png` — no mesmo cabeçalho, "Novo vestido
(completo)" (sentence case, `src/pages/vestidos/index.tsx:305`) encosta em
"Novo Vestido" (Title Case, `src/pages/vestidos/index.tsx:313`).

No mesmo slot (ação primária do topo da tela), medido: **4 em Title Case** —
"Novo Agendamento" (`src/pages/agenda/index.tsx:144`), "Novo Vestido"
(`vestidos/index.tsx:313`), "Novo Orçamento"
(`src/pages/orcamentos/index.tsx:121`), "Loja Atual"
(`src/pages/configuracoes/index.tsx:83`) — contra **6 em sentence case** —
"Adicionar noiva" (`src/pages/noivas/index.tsx:116`), "Novo contrato (via
orçamento)" (`src/pages/contratos/index.tsx:44`), "Novo vestido (completo)",
"Lançar despesa" (`src/pages/financeiro/pagar.tsx:408`), "Convidar por link"
(`src/pages/equipe/index.tsx:331`), "Agendar atendimento"
(`src/pages/noivas/[leadId]/index.tsx:274`). O português não tem Title Case; a
forma majoritária (e a da voz do repo) é a sentence case — são 4 rótulos a
corrigir, mais os `DialogTitle` gêmeos (`vestidos/index.tsx:318`,
`orcamentos/index.tsx:143`).

## A5 🟡 — A cor de aviso não tem token: três telas inventam o âmbar, e o backup reinventa até o verde e o vermelho

O sistema tem `--destructive` e `--positivo` com a conta WCAG escrita ao lado
(`src/index.css:160-164, 249-253`) e `lib/aparencia.test.ts:86` reprovando
qualquer par de token abaixo de 4,5:1. Mas o TERCEIRO estado semântico — o
aviso, "ainda não é grave" — não tem token, e cada tela o inventa cru:

- `src/pages/financeiro/cobranca.tsx:54-57` — `amber-500`/`amber-700` para
  atraso até 30d, `orange-500`/`orange-700` para 31–60d (captura
  `financeiro-cobranca--claro.png`, badge "vencida há 23 dias");
- `src/pages/orcamentos/[id].tsx:826` — `text-amber-700 dark:text-amber-400`
  no aviso de teto;
- `src/pages/configuracoes/backup.tsx:58-63` — `bg-amber-500` para "ficando
  velho"… e na mesma função **`bg-red-500` e `bg-emerald-500`** onde
  `--destructive` e `--positivo` existem exatamente para isso; mais
  `text-amber-600` em `backup.tsx:191`.

São **5 tons de aviso em 3 telas, nenhum coberto pelo teste de contraste** que
o E92 construiu — o próximo aviso escolherá o sexto. O conserto é um token
`--aviso` (par claro/escuro) entrando na mesma varredura do `aparencia.test.ts`
e as 3 telas migrando; `backup.tsx` migra o verde/vermelho junto.

## A6 🟡 — A volta ao pai tem duas línguas, e o mesmo pai tem dois nomes

As 5 fichas de detalhe voltam por breadcrumb
(`src/components/cabecalho-detalhe.tsx:83-100`; captura
`noivas-ficha--claro.png`, "Noivas › E2E Noiva Playwright"). Os 6 recortes
voltam por link-seta: `src/pages/financeiro/dre.tsx:115`,
`cobranca.tsx:272`, `auditoria.tsx:120`, `projecao.tsx:219`,
`folha.tsx:414`, `agenda/semana.tsx:115` (capturas `financeiro-dre--claro.png`,
`agenda-semana--claro.png`). Duas línguas para "de onde vim" é discutível de
propósito (ficha ≠ recorte); o que não é discutível: **a mesma rota
`/financeiro` se chama "← Financeiro" em três voltas
(`dre.tsx:115`, `cobranca.tsx:272`, `auditoria.tsx:120`) e "← Fluxo de caixa"
na quarta (`projecao.tsx:219`)** — e a tela que a porta chama de "Auditoria"
(`fluxo.tsx:169-170`) se apresenta como "Trilha de auditoria"
(`financeiro-auditoria--claro.png`). Quem navega pelos rótulos conta dois
lugares onde há um.

## A7 🔵 — Cinco telas irmãs perderam a frase de propósito sob o título

Das 22 telas logadas capturadas, **17 têm a frase `text-muted-foreground` sob o
h1** ("O que precisa da sua atenção agora.", "Quem casa com qual vestido…") — é
uma assinatura do sistema. As 5 sem ela são vizinhas de menu: Agenda
(`src/pages/agenda/index.tsx:121`), Orçamentos
(`src/pages/orcamentos/index.tsx:117`), Contratos
(`src/pages/contratos/index.tsx:40`), Vestidos
(`src/pages/vestidos/index.tsx:289`), Configurações
(`src/pages/configuracoes/index.tsx:79`) — capturas correspondentes
`*--claro.png`. O ritmo visual do topo muda de altura ao trocar de item no
menu, e justamente Orçamentos/Contratos — onde a diferença entre os dois
conceitos confunde quem chega — são das que ficaram sem a frase que explica.

---

## O que está BEM — não mexer

1. **Os tokens com a prova ao lado** — `src/index.css:135-160` (claro) e
   `:229-253` (escuro) trazem a razão WCAG de cada escolha, e
   `lib/aparencia.test.ts:86` lê o arquivo de verdade. A marca `350 25% 65%`
   é decisão do E92: quem precisar de contraste muda o que vai em cima.
2. **`ResumoCard` + `money-lg`** (`src/pages/financeiro/helpers.tsx:32-55`) —
   receber, pagar e folha já falam UMA língua no degrau de topo (capturas
   `financeiro-receber/pagar/folha--claro.png`). É o padrão a estender no A2,
   não a substituir.
3. **`CabecalhoDetalhe`** (`src/components/cabecalho-detalhe.tsx:61-135`) — as
   5 fichas têm uma cara só: status como chip de leitura, UMA ação primária,
   destrutivas atrás do "…" com rótulo vermelho. As três decisões estão
   documentadas no próprio arquivo.
4. **A hierarquia do h1 segura** — 40 dos 50 h1 do app são `text-3xl
   font-serif`; as 6 telas públicas usam `text-4xl text-primary` coerentes
   entre si (`login.tsx:57`, `noiva-portal.tsx:183`, `convite.tsx:85`…).
5. **Provas e Reservas são gêmeas de verdade** — mês em versalete, numeral
   serifado à esquerda, mesma linha (`provas--claro.png`,
   `reservas--claro.png`; `src/pages/provas/index.tsx`,
   `src/pages/reservas/index.tsx`). É o melhor par de telas irmãs do app.
6. **As pílulas de filtro de Orçamentos e Contratos são idênticas**
   (`orcamentos--claro.png`, `contratos--claro.png`) — filtro e navegação NÃO
   se confundem nessas duas.
7. **O escuro não quebra nada nos 6 pares vistos** — `contratos--escuro.png`
   mostra o "Cancelado" clareado com texto escuro exatamente como
   `src/index.css:245-250` manda; dashboard, financeiro, ficha, portal e
   configurações mantêm contraste e hierarquia.
8. **`ErroListagem` como porta fina é decisão do E99**
   (`src/pages/financeiro/helpers.tsx`, comentário na função) — a coexistência
   com `<Erro>` não é inconsistência a consertar.
9. **`brl()` como régua única segurou** — nenhum `R$` à mão nas 27 capturas;
   negativos e espaço rígido conforme E92.

## Pistas laterais — de outras trilhas

- **(E — contraste)** `text-primary` como TEXTO dá **2,71:1** sobre o fundo
  claro (conta dos tokens: hsl 350 25% 65% sobre 40 33% 98%). Nos títulos
  públicos grandes (`login.tsx:57` etc.) a WCAG isenta logotipo, mas o link de
  texto NORMAL "Ver a cobrança completa"
  (`src/pages/mensagens/index.tsx:379`, captura `mensagens--claro.png`)
  precisa de 4,5:1 e tem 2,71 — e `aparencia.test.ts` não testa esse par.
- **(E — semântica)** `CardTitle` é `<div>` (`src/components/ui/card.tsx:32-41`):
  nenhum título de card entra na navegação por headings do leitor de tela.
- **(D — escala)** `src/pages/vestidos/index.tsx:470-488` desenha **um
  `<Select>` por atributo ativo do catálogo, sem teto** — na captura
  (`vestidos--claro.png`, banco de dev) a dobra inteira é filtro e NENHUM
  vestido aparece. O volume é artefato de fixture; o mecanismo sem teto é real.
- **(B — fluxo)** Duas portas de criação lado a lado em Vestidos: página
  completa (`vestidos/index.tsx:305`) e dialog rápido (`:313`), sem nada que
  diga quando usar qual.
- **(F — voz)** As gêmeas divergem no vocabulário: "Ver provas **anteriores**"
  (`src/pages/provas/index.tsx:88`) vs "Ver reservas **passadas**"
  (`src/pages/reservas/index.tsx:74`).
- **(C — estados)** O vazio de `src/pages/minha-comissao/index.tsx:210`
  ("Nenhuma competência sua foi fechada ainda.") é frase solta, fora do
  `<Vazio>` canônico de `components/estado` (porquê + próximo passo + ação).
