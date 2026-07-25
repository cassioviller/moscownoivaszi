# Trilha E — UI: design, consistência e acessibilidade

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

**Método: vi as telas rodando.** Subi o `api-server` (`PORT=5000`) e o Vite
(`PORT=5173 BASE_PATH=/`), pus um proxy próprio na 5174 na frente dos dois (o
`E2E_API_PROXY` do Vite devolve 404 em POST, então o login não passava) e
naveguei com Playwright + o Chromium do Nix, logada como
`admin@moscownoivas.com` no banco que já existia. **Nada foi escrito no banco**
— só navegação e leitura; nenhum seed rodado, nenhum formulário submetido,
nenhum arquivo de código alterado. Capturei **28 telas em 1280px, 18 em 390px e
7 em dark mode**, medi contraste com os tokens computados pelo próprio
navegador e rodei uma varredura de alvo de toque / rótulo / nome acessível em
16 rotas. Os achados abaixo citam a captura que os prova. O que não consegui
ver de fato está marcado "⚠️ não confirmado".

## Resumo executivo

O sistema visual está **muito melhor do que o normal**: `index.css` define
tokens de verdade e as telas os respeitam — em `pages/` inteiro há **1** uso de
cor crua da família cinza e **29** de paleta com escala (quase todos
`emerald`/`amber` de status). Não existe `text-gray-500` espalhado, não existe
`p-[13px]`, o dark mode funciona de ponta a ponta, e todos os botões só-de-ícone
têm `aria-label` e todas as fotos de vestido têm `alt`. Isso é raro e não deve
ser mexido.

O problema não é falta de tokens — é **falta de uma camada de UI entre os
tokens e as telas**. Os 27 primitivos shadcn não adotados (A5) não são código
morto por acaso: `<Table>` é usado em **um** arquivo, e cinco telas escrevem
`<table>` à mão; `<Pagination>` é usado em zero, e uma única tela pagina (à mão);
`<Empty>` é usado em zero, e os estados vazios são 30 frases soltas. O resultado
é que cada tela reinventa dinheiro, carregamento, erro, vazio e capitalização — e
as decisões divergiram.

Os três piores danos são de outra ordem:

1. **A página se declara em inglês** (`<html lang="en">`), então o navegador
   desenha toda data como `mm/dd/yyyy`, todo horário com AM/PM e o seletor de
   competência como "July 2026". Numa tela de dinheiro, `07/01` × `01/07` é o
   par que não denuncia a inversão. Conserto: uma palavra.
2. **O texto de todo botão primário tem 2,79:1 de contraste** — branco sobre o
   rosa da marca. "Entrar", "Agendar", "Fechar competência", "Gerar link": todos
   falham WCAG AA. O rosa é a marca e deve ficar; o que precisa mudar é o texto
   em cima dele.
3. **Contas a receber não diz de quem é a parcela.** A tela de cobrar mostra
   quatro linhas idênticas ("Entrada · 16/07 · R$ 1.000,00") e o nome da noiva
   só existe no CSV — o próprio comentário do arquivo o diz.

**Contagem:** 23 achados — 🔴 3 · 🟠 10 · 🟡 8 · 🔵 2.

---

## Achados

### E1 — A página se declara em inglês: datas em `mm/dd/yyyy`, horário com AM/PM, "July 2026"

- **Onde:** `artifacts/moscow-noivas/index.html:2` (`<html lang="en">`). Efeito
  visível nas **25** ocorrências de `type="date"`, na de `type="month"`
  (`financeiro/folha.tsx`) e na de `type="time"` (`noivas/noiva-form.tsx:173`),
  espalhadas por 14 telas: agenda, novo atendimento, contrato, auditoria, fluxo,
  folha, pagar, projeção, receber, ficha da noiva, orçamento, reserva, vestido.
- **O que a pessoa vê** (três capturas independentes):
  - **Contas a receber** — o filtro diz `De 07/01/2026` `Até 07/31/2026`. Em
    português isso lê-se "de 7 de janeiro a 31 de julho". É julho inteiro
    (`09-receber.png`).
  - **Adicionar noiva** — o campo "Data do casamento" mostra o placeholder
    `mm/dd/yyyy` e o campo "Horário" mostra `--:-- --`, com o slot de **AM/PM**
    (`36-noiva-nova.png`).
  - **Recorrências do mês** — o seletor de competência diz literalmente
    **"July 2026"**, em inglês (`11-folha.png`).
- **Por que atrapalha:** a vendedora agenda um casamento às 17h, digita "05:00"
  e o navegador grava 5 da manhã se ela não reparar no AM/PM que não deveria
  estar ali. A gerente filtra o mês de cobrança e lê a janela ao contrário — e
  uma data invertida num filtro de dinheiro não dá erro, dá um número errado com
  cara de certo. É também violação de **WCAG 3.1.1 (Language of Page, nível A)**:
  o leitor de tela pronuncia "noiva", "orçamento", "vestido" com fonemas
  ingleses, e o Chrome oferece "traduzir esta página" para quem já lê no idioma.
- **Sugestão:** `<html lang="pt-BR">`. Uma palavra. Depois disso os mesmos
  `<input>` passam a desenhar DD/MM/AAAA, relógio de 24h e "julho de 2026", sem
  tocar em componente nenhum. Toda formatação de LEITURA já passa por `Intl` com
  `pt-BR` explícito, então nada depende do formato americano — confirmei
  varrendo `Intl.DateTimeFormat` em `pages/` e `lib/`.
- **Severidade:** 🔴

### E2 — O texto de todo botão primário tem 2,79:1 de contraste (WCAG AA exige 4,5:1)

- **Onde:** `src/index.css:135-136` — `--primary: 350 25% 65%` com
  `--primary-foreground: 0 0% 100%`. Atinge todo `<Button>` sem `variant`.
- **O que a pessoa vê:** medido no navegador com os tokens computados:

  | par | claro | escuro |
  |---|---|---|
  | `primary-foreground` sobre `bg-primary` (**texto de todo botão de ação**) | **2,79:1** ❌ | 3,30:1 ⚠️ |
  | `text-primary` sobre `bg-card` | **2,79:1** ❌ | 4,60:1 ✅ |
  | `destructive-foreground` sobre `bg-destructive` (badge "Atrasada", toast de erro) | 3,71:1 ⚠️ | 5,14:1 ✅ |
  | `text-destructive` sobre `bg-card` (valores em atraso) | 3,71:1 ⚠️ | **2,96:1** ❌ |
  | `text-muted-foreground` sobre `bg-background` | 4,45:1 ⚠️ | 6,94:1 ✅ |
  | `text-muted-foreground` sobre `bg-muted` | 4,15:1 ⚠️ | 5,32:1 ✅ |

  Nas capturas dá para ver a olho: "Entrar" (`00-pos-login.png`), "Fechar
  competência" (`05-comissoes.png`), "Agendar" (`25-novo-atendimento.png`),
  "Gerar link" (`30-ficha-noiva.png`) — branco pálido sobre rosa pálido.
- **Por que atrapalha:** é **todo botão de ação do sistema**, no modo que a loja
  usa por padrão. Uma vendedora de 50 anos, num ateliê com vitrine e sol
  entrando, num celular com brilho automático baixo: o rótulo do botão some
  antes do botão. E `text-muted-foreground` — que carrega praticamente toda a
  informação secundária do app, quase sempre em 12px — passa raspando dentro do
  card (4,63:1) e **falha fora dele** (4,45:1 e 4,15:1).
- **Sugestão:** a marca é o rosa e deve ficar. O que muda é o que vai em cima:
  `--primary-foreground` passa a ser o `--foreground` escuro (20 20% 20%) em vez
  de branco — contraste sobe para ~7:1 e o botão fica *mais* elegante, não
  menos. Alternativa: escurecer `--primary` para ~`350 30% 45%` nos usos de
  texto/fundo-de-botão, mantendo o tom claro nos preenchimentos decorativos.
  `--muted-foreground` de `30 10% 45%` para `30 10% 40%` resolve as três linhas
  de aviso de uma vez. No escuro, `--destructive: 0 40% 50%` precisa clarear
  (o mesmo tratamento que `--positivo` já recebeu, com comentário e tudo, na
  linha 232).
- **Severidade:** 🔴

### E3 — Em "Contas a receber" a parcela não diz de quem é

- **Onde:** `pages/financeiro/receber.tsx:331-341`.
- **O que a pessoa vê:** cada linha é `Entrada` / `Vence 16/07/2026 · contrato` /
  `R$ 1.000,00`. Na captura `09-receber.png` há **quatro linhas seguidas
  visualmente idênticas** — mesmo rótulo, mesma data, mesmo valor, mesmo badge
  "Atrasada". Nenhuma diz o nome da noiva. O único caminho até a identidade é o
  link **"contrato"**, em minúscula, do tamanho do texto de apoio, com cara de
  nota de rodapé (a varredura o pegou como "link com texto vago").
- **Por que atrapalha:** esta é a tela do trabalho de cobrar. A pergunta é "para
  quem eu ligo agora?" e a tela responde "uma Entrada de mil reais". Para
  descobrir, a vendedora abre o contrato, volta, abre o próximo — e o contrato
  não tem link de volta (E9). O detalhe que fecha o diagnóstico: o comentário na
  linha 253 do próprio arquivo diz que o CSV sai *"com a noiva na linha"*. **O
  nome existe, está no export, e não está na tela.**
- **Sugestão:** o nome da noiva vira a linha 1 (`font-medium`) e `Entrada ·
  vence 16/07 · parcela 3 de 6` desce para a linha de apoio; o link vira o nome.
  Enquanto isso, colapsar a linha: hoje cada parcela ocupa ~114px porque o botão
  "Receber" mora numa segunda faixa com borda — cinco parcelas enchem a tela, e
  a loja tem dezenas em aberto.
- **Severidade:** 🔴

### E4 — Erro da API chega à tela como código HTTP: "Erro ao fazer login / HTTP 404 Not Found"

- **Onde:** `pages/login.tsx:40` (`error?.message`),
  `pages/financeiro/helpers.tsx:89` (terceira perna do `mensagemApi`, usada por
  ~20 telas) e `pages/noivas/[leadId]/index.tsx:197`. A string nasce em
  `lib/api-client-react/src/custom-fetch.ts`, `buildErrorMessage()`:
  `` `HTTP ${status} ${statusText}` ``.
- **O que a pessoa vê:** confirmado na captura `00-pos-login.png` — o toast
  vermelho diz, com todas as letras, **"Erro ao fazer login / HTTP 404 Not
  Found"**. Pelo mesmo caminho saem "HTTP 422 Unprocessable Entity" na hora de
  gerar o contrato e "HTTP 500 Internal Server Error" em qualquer tela de
  financeiro.
- **Por que atrapalha:** a vendedora com a noiva ao lado lê "404" e não tem o
  que fazer com isso — não sabe se errou a senha, se a internet caiu ou se o
  sistema quebrou. A mensagem assusta e não orienta. (D6 apontou o repasse de
  `err.message` como defeito de código; aqui fica o registro do que a pessoa
  efetivamente lê.)
- **Sugestão:** a última perna do `mensagemApi` devolve o `fallback` da tela,
  nunca `err.message`. E uma régua por faixa de status: 401 → "Sua sessão
  expirou. Entre de novo."; 403 → "Seu acesso não permite isso — peça à
  gerente."; 5xx/rede → "Não consegui falar com o sistema. Tente de novo em um
  instante." No login, credencial inválida vira "E-mail ou senha não conferem".
- **Severidade:** 🟠

### E5 — `R$` se descola do número no celular

- **Onde:** `pages/financeiro/helpers.tsx:52-54` (`ResumoCard`, usada em
  receber/pagar/folha/cobrança) e as **98** ocorrências do padrão
  `R$ {brl(valor)}` escritas à mão em `pages/` e `components/`.
- **O que a pessoa vê:** em 390px o card "A receber" quebra em `R$` numa linha e
  `13.500,00` na de baixo; o mesmo em "Recebido" (`09-receber-390.png`). O
  espaço entre `R$` e o número é um espaço normal, e o navegador quebra ali.
- **Por que atrapalha:** é o número que a vendedora confere de pé, no celular, e
  ele aparece partido — o card dobra de altura e o valor perde a leitura de
  bloco. Como o padrão está escrito 98 vezes à mão, reaparece em toda tela nova.
- **Sugestão:** o `R$` sai do JSX e entra no `brl()` de `lib/formatos.ts` (ou num
  `<Dinheiro valor={} tom="..."/>`), com espaço rígido e `tabular-nums`
  embutidos — uma régua em vez de 98 cópias. Fecha junto com E6 e E7.
- **Severidade:** 🟠

### E6 — Dinheiro é desenhado em quatro tipografias diferentes conforme a tela

- **Onde:** `financeiro/helpers.tsx:52` (`text-2xl font-serif`),
  `financeiro/fluxo.tsx:246` (`text-2xl font-semibold`, sans),
  `dashboard.tsx:236` (`text-2xl font-bold`, sans, **sem `tabular-nums`**),
  `comissoes/index.tsx:624` (`font-serif text-xl`),
  `contratos/[id].tsx:402` (`text-2xl font-semibold text-primary`, **sem
  `tabular-nums`**).
- **O que a pessoa vê:** o mesmo valor muda de família e de peso ao trocar de
  tela: "R$ 13.500,00" em Playfair serif no card de receber
  (`09-receber.png`), "R$ 13.500,00" em DM Sans semibold no card de fluxo
  (`03-financeiro.png`), "6.171,06" em DM Sans bold no dashboard
  (`01-dashboard.png`), "R$ 6.171,06" em Playfair na comissão
  (`05-comissoes.png`).
- **Por que atrapalha:** o cérebro usa a forma do número para saber que é o
  mesmo tipo de coisa. Quando o total do mês muda de fonte entre a tela de
  comissão e a do dashboard, a pessoa relê para conferir que está comparando a
  mesma grandeza. E onde falta `tabular-nums`, os dígitos dançam de largura
  quando o valor muda — no dashboard, que atualiza sozinho, isso é visível.
- **Sugestão:** UMA escala de dinheiro, três degraus — `money-lg` (o número
  herói da tela), `money-md` (cards de resumo), `money-sm` (linhas de lista) —
  sempre `tabular-nums`, sempre a mesma família. Decidir de uma vez se dinheiro
  é serif (combina com a marca, bonito em 24px+) ou sans (mais legível em 12px)
  e valer para todas.
- **Severidade:** 🟠

### E7 — O dashboard mostra dinheiro sem `R$`, ao lado de números que não são dinheiro

- **Onde:** `pages/dashboard.tsx:202, 217, 236, 238, 241` (tela **Seu dia**).
- **O que a pessoa vê:** os cards do topo mostram `143` (noivas), `0`
  (atendimentos), `0` (orçamentos), `34` (contratos) e, logo abaixo, `700,00`,
  `0,00`, `6.171,06`, `77.138,24 em vendas` — **sem o `R$`**
  (`01-dashboard.png`). É a única tela do app que solta `{brl(...)}` cru; as
  outras 98 ocorrências escrevem `R$ {brl(...)}`.
- **Por que atrapalha:** na primeira tela do dia, "A pagar — próximos 30 dias:
  0,00" e "Atendimentos Hoje: 0" ficam com a mesma cara, e "700,00" ao lado de
  "143" obriga a ler o rótulo para saber a unidade — exatamente o trabalho que
  o símbolo da moeda evita. É também a tela mais lida do sistema.
- **Sugestão:** entra no conserto do E5 — se `brl()` devolvesse `R$ 700,00` com
  espaço rígido, esta tela ficaria certa sozinha.
- **Severidade:** 🟠

### E8 — No contrato, o valor da venda tem a mesma cor do valor em atraso

- **Onde:** `pages/contratos/[id].tsx:402` (`text-primary`) contra
  `financeiro/helpers.tsx` e `contratos/[id].tsx:488` (`destructive`);
  tokens em `index.css:135` (`--primary: 350 25% 65%`) e `:148`
  (`--destructive: 0 50% 60%`).
- **O que a pessoa vê:** na captura `32-contrato.png` (e na `D4-contrato-dark.png`,
  onde é ainda mais evidente), o card da esquerda mostra
  **"Valor Total — R$ 5.000,00"** num rosa-avermelhado, e o card da direita
  mostra **"R$ 5.000,00" + badge "Atrasada"** num vermelho-arrosado. São dois
  hues diferentes com a mesma temperatura e quase a mesma luminância; lado a
  lado no mesmo campo de visão, lidos como a mesma cor.
- **Por que atrapalha:** o valor do contrato é a boa notícia da tela — é o que a
  loja vai receber — e está pintado com a cor de alarme. O `index.css:43-44` já
  registra exatamente este problema para outro par ("sem ele, entrada rosa e
  saída vermelha eram dois avermelhados quase iguais") e o resolveu criando
  `--positivo`. O par primary × destructive ficou de fora do mesmo raciocínio.
- **Sugestão:** valor de contrato não é "marca" nem "alarme" — é neutro de
  destaque: `text-foreground` com `font-semibold` no tamanho maior da escala do
  E6. Reservar `text-primary` para elementos interativos e `text-destructive`
  exclusivamente para o que está errado.
- **Severidade:** 🟠

### E9 — A tela do contrato não tem volta, e o status parece o botão principal

- **Onde:** `pages/contratos/[id].tsx:355-382` (a linha do cabeçalho).
- **O que a pessoa vê** (`32-contrato.png`): no canto superior direito, três
  elementos do mesmo tamanho e formato: `[Baixar PDF]` (outline),
  `[Ativo]` (Badge `variant="default"` — **preenchido de rosa, o mais
  botão-parecido dos três**) e `[Cancelar contrato]` (outline). E acima do `<h1>`
  não há nada: nenhum "← Contratos", nenhum link para a ficha da noiva, apesar de
  o `<h1>` ser o nome dela ("Ana Silva").
- **Por que atrapalha:** duas coisas.
  (a) O `Badge` com `className="text-sm px-3 py-1"` entre dois `<Button size="sm">`
  fica com a mesma altura e o mesmo raio deles, e é o único preenchido — a
  vendedora clica em "Ativo" esperando trocar o status. Rótulo de estado não pode
  ter a forma de comando.
  (b) A ficha da noiva tem "← Noivas" (`[leadId]/index.tsx:222`) e o DRE tem
  "← Financeiro" (`dre.tsx:120`); o contrato não tem nada. Quem chega de "Contas
  a receber" (que só oferece o link "contrato", E3) fica sem caminho de volta
  para a noiva — o par de telas mais usado da cobrança é um beco.
  E "Cancelar contrato", a ação mais destrutiva da tela, tem exatamente o mesmo
  peso visual de "Baixar PDF".
- **Sugestão:** um padrão de cabeçalho único para as 6 telas de detalhe —
  breadcrumb curto ("Noivas › Ana Silva › Contrato"), `<h1>`, e as ações à
  direita em uma só hierarquia (uma primária, o resto em `…`). O status vira
  chip de leitura (sem preenchimento, altura menor, ao lado do `<h1>`, não na
  fileira de botões). "Cancelar contrato" sai da fileira e vai para o menu `…`.
  O `<Breadcrumb>` já está em `components/ui/` e nunca foi usado (A5).
- **Severidade:** 🟠

### E10 — As ações destrutivas ficam encostadas nas ações comuns, e em texto simples

- **Onde:**
  - `pages/noivas/[leadId]/index.tsx` — **"Marcar como perdida"** (vermelho, sem
    borda) imediatamente à esquerda de "Editar dados" (`30-ficha-noiva.png`).
  - `pages/contratos/[id].tsx:488-500` — **"Remover"** (a parcela) colado em
    "Receber" (`32-contrato.png`).
  - `pages/atendimentos/index.tsx` — **"Marcou falta"** e **"Voltar para
    agendado"** em texto puro, na mesma pilha de "Iniciar atendimento" e
    "Concluir" (`08-atendimentos-390.png`).
  - `pages/financeiro/receber.tsx:365-373` — "Estornar recebimento"
    (`variant="ghost"`) ao lado de "Receber".
- **O que a pessoa vê:** em toda tela de trabalho, a ação que desfaz aparece na
  mesma fileira da ação que faz, e em geral com MENOS chrome — o que é o
  instinto certo, mas levado longe demais: sem borda e sem ícone, ela some para
  o olho e é atingida pelo polegar.
- **Por que atrapalha:** no celular, "Concluir" (36px de altura) e "Voltar para
  agendado" (texto solto) ficam a 12px um do outro. E as confirmações são
  desiguais: comissões nomeia o que se perde ("O fechamento de julho some, e com
  ele a conta a pagar de R$ …" — modelo de excelência, `comissoes/index.tsx:747`),
  enquanto o estorno de parcela só diz "Estornar este recebimento?" sem nome de
  noiva nem valor (`receber.tsx:448-451`).
- **Sugestão:** uma regra só, escrita uma vez: **ação destrutiva mora no menu
  `…` da linha ou do cabeçalho**, nunca na fileira principal; quando precisar
  ficar exposta, usa `variant="destructive"` de verdade (borda + cor), não texto
  solto. E toda confirmação destrutiva nomeia o objeto e o valor, como a de
  comissões já faz.
- **Severidade:** 🟠

### E11 — No celular, quase todo alvo de toque está abaixo de 44px

- **Onde:** medido em 390px com o navegador (contagem de elementos `<button>`
  com altura ou largura < 44px por tela):

  | tela | alvos < 44px | exemplos medidos |
  |---|---|---|
  | Atendimentos | **89** | `136×32 "Iniciar atendimento"`, `97×32 "Marcou falta"` |
  | Recorrências (folha) | 29 | `103×32 "Definir salário"`, `60×32 "Editar"` |
  | Contas a receber | 28 | `71×32 "Abertas"`, `83×32 "Atrasadas"` |
  | Vestidos | 23 | `130×36 "Todos"`, `153×38 "Novo Vestido"` |
  | Novo atendimento | 18 | `100×32 "Atendimento"`, `57×32 "Prova"` |
  | Comissões | 11 | `36×36 "Remover a versão de 01/01/2020"` |
  | Equipe | 8 | `36×36 "Editar Vendedora Maria"`, `36×36 "Remover …"` |
  | (todas) | — | `36×36 "Abrir menu"`, `36×36 "Notificações"` |

- **O que a pessoa vê:** todo botão só-de-ícone tem 36×36 e todo `size="sm"` tem
  32px de altura. O hambúrguer e o sino, que existem **só** no mobile
  (`app-layout.tsx:65-80`), têm 36×36.
- **Por que atrapalha:** o alvo confortável de polegar é 44×44 (WCAG 2.5.5, e a
  régua da Apple e do Google). A vendedora está de pé, com a noiva ao lado, uma
  das mãos ocupada. "Editar" e "Remover" na tela de equipe são dois quadrados de
  36px separados por 4px — errar é questão de tempo, e um deles apaga uma
  colaboradora.
- **Sugestão:** o `size="icon"` do `button.tsx` vai de `h-9 w-9` para `h-11 w-11`
  **nos breakpoints móveis** (`h-9 w-9 md:h-9`, ou uma variante `size="icon-touch"`
  usada no chrome de mobile); e `size="sm"` ganha `min-h-11` abaixo de `md`. O
  visual do desktop não muda. Prioridade para as telas que a vendedora usa de pé:
  atendimentos, provas, mensagens, ficha da noiva.
- **Severidade:** 🟠

### E12 — Uma noiva que não existe fica num esqueleto e depois vira "HTTP 404 Not Found"

- **Onde:** `pages/noivas/[leadId]/index.tsx:191-213`.
- **O que a pessoa vê:** naveguei para um `leadId` inexistente
  (`31-noiva-inexistente.png`): **um retângulo cinza pulsante, sem título, sem
  link de volta, sem nada** — porque o `retry` padrão do TanStack tenta três
  vezes antes de desistir. Passado o backoff, aparece um `<Alert>` vermelho cujo
  corpo é `error.message`, ou seja: **"Erro ao carregar a noiva — HTTP 404 Not
  Found"**.
- **Por que atrapalha:** acontece com link antigo no WhatsApp da equipe, com
  noiva expurgada por LGPD (E77) e com URL digitada errado. Mais grave: a MESMA
  situação já tem resposta certa em três telas irmãs —
  `contratos/[id].tsx:180`: *"Contrato não encontrado — pode ter sido removido,
  ou o link veio errado."*; `orcamentos/[id].tsx:239` e `vestidos/[id].tsx:224`
  dizem o equivalente. A ficha da noiva — a tela de detalhe mais usada do
  sistema — ficou de fora do padrão.
- **Sugestão:** o mesmo card de "não encontrado" das irmãs, com botão "Voltar
  para Noivas"; e o esqueleto de carregamento preserva o `<h1>` e o link de
  volta (hoje `:208-212` os apaga, e a página fica sem identidade nem saída
  durante todo o carregamento).
- **Severidade:** 🟠

### E13 — O total do mês de comissão só existe dentro do diálogo de confirmação

- **Onde:** `pages/comissoes/index.tsx:189-192` (o total é calculado),
  `:532` (o único lugar onde é exibido), `:555-633` (o card que deveria mostrá-lo).
- **O que a pessoa vê:** o card "Como está o mês" lista uma linha por vendedora
  e **termina** — não há linha de total (`05-comissoes.png`). O número
  `resumoFechamento.total`, que responde "quanto vou pagar de comissão este
  mês?", só aparece se a gerente clicar em "Fechar competência" e ler o texto do
  alerta de confirmação — uma ação irreversível.
- **Por que atrapalha:** o total do custo de comissão é a pergunta de gestão da
  tela, e a única forma de vê-lo é encostar o dedo no gatilho da ação que não
  pode ser desfeita. Com 6 ou 8 vendedoras, somar de cabeça linhas em `R$` não é
  opção. (Nota para a trilha C: essa mesma soma está em `float` na linha 191.)
- **Sugestão:** um `<li>` de rodapé no mesmo `<ul>`, com o mesmo tratamento do
  "Total de despesas" que o DRE já usa (`dre.tsx:238-245`) — rótulo em
  micro-caps à esquerda, valor em destaque à direita. E o número herói da tela
  (o total) deveria ser o maior; hoje cada vendedora tem `text-xl` e o total não
  existe.
- **Severidade:** 🟠

### E14 — O DRE esconde o resultado no fim: a resposta está abaixo da dobra

- **Onde:** `pages/financeiro/dre.tsx:193-265` (tela **Resultado do mês**).
- **O que a pessoa vê:** quatro cards empilhados, na ordem: Recebimentos
  (`text-2xl`) → Recebimentos por meio (lista) → Despesas por categoria (lista +
  total) → **Resultado do mês** (`text-3xl`). O número que dá nome à tela é o
  último, depois de rolar, e é apenas 25% maior que o primeiro.
- **Por que atrapalha:** a dona abre a tela para saber uma coisa: "sobrou
  quanto?". A tela responde depois de contar a história inteira. E o título da
  página e o título do último card são a mesma frase ("Resultado do mês"), o que
  faz o card parecer a página e a página parecer um índice.
- **Sugestão:** inverter — o resultado é o herói no topo, grande, com
  `+`/`−` e a competência ao lado; recebimentos e despesas viram as duas metades
  que o explicam, logo abaixo; "por meio" e o detalhe de despesas ficam por
  último. O padrão certo já existe no fluxo (`fluxo.tsx:240-275`, três cards em
  linha com Entradas/Saídas/Saldo) — o DRE só não o herdou.
- **Severidade:** 🟡

### E15 — Uma classe `capitalize` sobre a frase inteira: "Julho De 2026 — O Que Seria Pago Se Fechasse Agora."

- **Onde:** `pages/comissoes/index.tsx:551`. O mesmo `className="capitalize"`
  aparece em `comissoes/index.tsx:513`, `financeiro/dre.tsx:148`,
  `financeiro/fluxo.tsx:338`.
- **O que a pessoa vê:** no card mais importante da tela de comissões, a legenda
  sai **"Julho De 2026 — O Que Seria Pago Se Fechasse Agora."** — confirmado em
  1280px (`05-comissoes.png`) e em 390px (`05-comissoes-390.png`), onde ocupa
  duas linhas inteiras. O `capitalize` foi posto para virar "julho" em "Julho",
  mas o CSS não sabe onde o mês termina.
- **Por que atrapalha:** Title Case é convenção inglesa; em português lê-se como
  texto de máquina. É a primeira coisa que o olho pega no card onde a gerente vai
  confiar num número.
- **Sugestão:** capitalizar só o mês na função que o gera —
  `rotuloCompetencia()` (`comissoes/index.tsx:104`) devolve "Julho de 2026" — e
  remover o `capitalize` da frase. Aproveitar para extrair essa função (que está
  triplicada em `comissoes/index.tsx:104`, `dre.tsx:44` e `fluxo.tsx:56`) para
  `lib/financeiro/datas.ts`, que já é a casa das datas de negócio.
- **Severidade:** 🟡

### E16 — Termo interno vazando: "2026-07", "bloqueios", "Leads", "540 min adiantado"

- **Onde e o que a pessoa vê:**
  - `pages/financeiro/folha.tsx` — **"A competência 2026-07 ainda não foi
    gerada."** (`11-folha.png`). Formato do banco, três centímetros abaixo de um
    seletor que diz "July 2026" e numa tela onde o resto do app diz "julho de
    2026": **três grafias do mesmo mês na mesma dobra**.
  - `lib/permissoes.ts:56` — o módulo se chama **"Leads"** na tela de Permissões
    (`28-permissoes-390.png`), enquanto a sidebar, a ficha, os toasts e os
    títulos dizem **"Noivas"**. Pior: esse módulo governa três itens de menu
    (Noivas, Orçamentos, Contratos) e a tela não diz isso — a gerente que quer
    tirar o acesso a contratos não descobre onde mexer.
  - `pages/vestidos/[id].tsx:402` — **"Erro ao carregar os bloqueios"**, quando
    a sidebar chama a mesma coisa de **"Reservas"**.
  - `pages/atendimentos/index.tsx:77` — **"540 min adiantado"**
    (`08-atendimentos-390.png`). Ninguém pensa em 540 minutos; são 9 horas. E na
    mesma linha vem "começou 01:06", que pode ser lido como hora ou como
    duração.
- **Por que atrapalha:** cada um é pequeno; juntos formam a impressão de sistema
  que fala com o programador e não com a vendedora. O caso de "Leads" é o que
  custa mais caro: é a tela onde se decide quem vê o quê.
- **Sugestão:** `MODULOS_ROTULOS.leads` vira `"Noivas, orçamentos e contratos"`
  (o rótulo descreve o alcance real); a competência sempre passa por
  `rotuloCompetencia`; "bloqueios" vira "reservas"; e a diferença de horário
  ganha uma função de humanização (`> 90 min` → "1h30 adiantado").
- **Severidade:** 🟡

### E17 — Quatro idiomas visuais para "carregando" e quatro para "erro"

- **Onde:**
  - Carregando: `<Skeleton>` em formato de card (`fluxo.tsx:232-236`,
    `dre.tsx:180-184`) · `<div className="h-64 animate-pulse bg-muted"/>` cinza
    chapado (`receber.tsx:321`) · `animate-pulse space-y-4` com dois retângulos
    (`noivas/[leadId]/index.tsx:208-212`) · `<Card className="h-24 animate-pulse"/>`
    (`noivas/funil.tsx:301`) · `<Card className="animate-pulse h-40"/>`
    (`noivas/index.tsx:190`) · o bloco redondo pulsante do layout
    (`app-layout.tsx:35-39`).
  - Erro: `ErroListagem` (`helpers.tsx:60`) · `EstadoErro`
    (`components/estado-erro.tsx`) · `<Alert>` inline copiado
    (`receber.tsx:309-319`, `noivas/[leadId]/index.tsx:193-202`,
    `vestidos/[id].tsx:399-408`) · o card "não encontrado" de contrato/orçamento.
- **O que a pessoa vê:** ao navegar de Financeiro para Contas a receber, o
  carregamento muda de "cartões cinza no formato do conteúdo" para "um bloco
  cinza de 256px de altura" — parece outra aplicação. E o "Nenhum resultado" de
  cada tela tem um recuo, um tamanho e uma cor diferentes.
- **Por que atrapalha:** o esqueleto tem uma função: prometer a forma do que vem.
  Um retângulo genérico não promete nada e, quando a lista chega curta, a tela
  "encolhe" e a pessoa perde o lugar. E `components/ui/skeleton.tsx` existe e é
  importado por 20 arquivos — as exceções são justamente as telas de dinheiro.
- **Sugestão:** três componentes na camada que falta (`@/components/estado/`):
  `<Carregando forma="lista|cards|detalhe" />`, `<Erro …/>`, `<Vazio …/>`.
  Substituir as sete variações. Isso e o E19 são o mesmo trabalho.
- **Severidade:** 🟡

### E18 — Estados vazios mudos: dizem que não há nada e não dizem o que fazer

- **Onde e o que a pessoa vê** (levantei 30; os que mais doem):
  - `financeiro/receber.tsx:323` — **"Nada por aqui neste filtro."** É a tela de
    cobrar. Não diz que talvez o período esteja estreito, nem oferece "ver todas".
  - `financeiro/dre.tsx:188` — **"Nenhum movimento de caixa em julho de 2026."**
    Não oferece ir ao mês anterior, embora as setas ‹ › estejam logo acima.
  - `comissoes/index.tsx:561` — **"Nenhuma venda nesta competência."**
  - `noivas/[leadId]/index.tsx` — na ficha, quatro cards em sequência dizem
    "Nenhum contato registrado ainda.", "Nenhum orçamento ainda.", "Nenhum
    contrato ainda." e **"Sem dados de contato."** (`30-ficha-noiva.png`). Este
    último é o pior: numa ficha de noiva, "sem dados de contato" é o problema
    que a tela deveria resolver, e não há ali um "Adicionar WhatsApp" — só o
    "Editar dados" lá no topo.
  - `fluxo.tsx:369` — "Nenhum movimento neste período."
- **Por que atrapalha:** um vazio é o momento em que a pessoa mais precisa de
  direção, e é justamente onde a tela cala. Vale registrar que **o app já sabe
  fazer isto**: `dashboard.tsx` diz "Nenhum atendimento hoje. **Abrir a agenda**"
  com o link junto, e a ficha diz "Nenhum lookbook ainda — **monte a seleção dos
  vestidos provados e mande o link para a noiva rever em casa**". Os dois bons
  estão na mesma tela dos quatro mudos.
- **Sugestão:** um `<Vazio titulo acao>` com a regra: toda mensagem de vazio diz
  **por que** está vazio e **qual é o próximo passo**, com o botão junto. O
  primitivo `components/ui/empty.tsx` existe e nunca foi usado (A5).
- **Severidade:** 🟡

### E19 — Não há uma camada de UI própria: `<Table>` usada em 1 arquivo, 5 tabelas à mão, 1 tela paginando

- **Onde:** `components/ui/table.tsx` é importado só por
  `components/permissoes/matriz-permissoes.tsx`. Escrevem `<table>` cru:
  `comissoes/index.tsx:1018`, `agenda/semana.tsx`, `noivas/conversao.tsx`,
  `vestidos/utilizacao.tsx`, `admin/index.tsx`. `components/ui/pagination.tsx`,
  `empty.tsx`, `field.tsx`, `avatar.tsx`, `progress.tsx`, `breadcrumb.tsx`,
  `spinner.tsx` têm **zero** consumidores.
- **O que a pessoa vê:**
  - A tabela da matriz de permissões é a única que se comporta bem em 390px
    (`28-permissoes-390.png`) — porque usa o primitivo, que traz o
    `overflow-x`. A tabela de simulação de comissão (`comissoes/index.tsx:1018`)
    tem 5 colunas dentro de um `DialogContent max-w-lg`, sem contêiner de
    rolagem: em 390px ela é espremida ou vaza. ⚠️ **não confirmado** — não
    consegui abrir o diálogo sem submeter uma simulação ao servidor.
  - **Só `/noivas` pagina** (`noivas/index.tsx:277-285`, botões "Anterior"/
    "Próxima" escritos à mão). `/vestidos` renderiza **114 cards com foto de uma
    vez** (contei 115 `<h3>` na varredura); orçamentos, contratos, atendimentos,
    receber, pagar, provas, ajustes e reservas idem.
  - O avatar da usuária na sidebar é uma inicial dentro de um `<div>` redondo
    escrito à mão (`layout/sidebar.tsx:156`); a barra de custo de comissão é uma
    `<div>` com `style={{width: …%}}` (`comissoes/index.tsx:671-676`) — e sem
    `aria-hidden` teria sido lida como conteúdo (está correto ali, mas é o
    `<Progress>` reescrito).
- **Por que atrapalha:** é a causa-raiz do E5, E6, E15, E17 e E18. Enquanto cada
  tela desenhar sua tabela, seu vazio e seu dinheiro, cada tela nova vai divergir
  de novo. E 114 vestidos com foto numa página é dado demais para um celular na
  loja.
- **Sugestão:** duas coisas em sequência, não uma reescrita.
  (1) **Poda:** apagar os primitivos que o produto não usa (`carousel`,
  `menubar`, `resizable`, `input-otp`, `chart` + `recharts` — D confirmou que
  não estão no bundle). Menos ruído, decisão clara.
  (2) **Adoção dirigida:** `<Table>` nas 5 telas que escrevem `<table>`;
  `<Breadcrumb>` no cabeçalho de detalhe (E9); `<Empty>` nos 30 vazios (E18).
  Paginação (ou rolagem infinita) primeiro em `/vestidos`, `/atendimentos` e
  `/financeiro/receber` — as três maiores.
- **Severidade:** 🟡

### E20 — Campos de dinheiro têm três teclados diferentes, e o mais usado não tem nenhum

- **Onde:**
  - Sem nada (teclado alfabético no celular): `financeiro/receber.tsx:399-404`
    ("Valor recebido" — o campo de dinheiro mais usado do sistema),
    `contratos/[id].tsx:544` e `:646`.
  - `inputMode="decimal"`: `comissoes/index.tsx:928-963`, `financeiro/folha.tsx`,
    `financeiro/projecao.tsx:380`, `orcamentos/[id].tsx` (18 ocorrências).
  - `type="number" step="0.01"`: `vestidos/vestido-form.tsx:98`,
    `vestidos/index.tsx:340`.
  - Telefone sem nada: `noivas/noiva-form.tsx:133` — o campo WhatsApp tem
    placeholder `(11) 99999-9999` mas nenhum `type="tel"`, nenhum
    `inputMode="tel"` e nenhuma máscara (`36-noiva-nova.png`).
  - Login: `pages/login.tsx:64` — o campo de e-mail não tem `type="email"` nem
    `autoComplete="email"`; a senha não tem `autoComplete="current-password"`.
- **O que a pessoa vê:** na tela de receber, no celular, ela toca em "Valor
  recebido" e sobe o teclado QWERTY — tem que trocar para o numérico para digitar
  R$ 1.200,00. No cadastro da noiva, o mesmo para o telefone. No login, o
  gerenciador de senhas não oferece preenchimento porque o campo não se declara.
  E `type="number"` (vestidos) vira roleta de rolagem que muda o preço sem
  querer quando ela rola a página com o dedo em cima.
- **Por que atrapalha:** são segundos por campo, dezenas de vezes por dia, com a
  noiva esperando. E o WhatsApp digitado torto quebra silenciosamente os links
  `wa.me` que a fila de "Mensagens de hoje" monta.
- **Sugestão:** um `<CampoDinheiro>` e um `<CampoTelefone>` na camada de UI que
  falta, com `inputMode`, máscara ao digitar e `R$` como prefixo dentro do campo
  (o `input-group.tsx` existe e nunca foi usado). No login, `type="email"` +
  `autoComplete`. Nunca `type="number"` para dinheiro.
- **Severidade:** 🟡

### E21 — Duas convenções de capitalização, às vezes na mesma tela

- **Onde:** Title Case — `contratos/[id].tsx:397` "Detalhes Financeiros", `:460`
  "Plano de Pagamento", `:401` "Valor Total", `:449` "Forma de Pagamento Base";
  `comissoes/index.tsx:799` "Regras de Comissão"; `dashboard.tsx:139-178`
  "Noivas Ativas", "Atendimentos Hoje", "Orçamentos Abertos", "Contratos
  Fechados"; `agenda` "Novo Agendamento"; `vestidos` "Novo Vestido";
  `orcamentos` "Novo Orçamento". Sentence case — `comissoes/index.tsx:550`
  "Como está o mês", `:896` "Definir regra"; `noivas/[leadId]` "O casamento",
  "Histórico de contato", "Portal da noiva"; `fluxo.tsx:321` "O ritmo dos
  últimos meses"; `receber.tsx:250` "Contas a receber".
- **O que a pessoa vê:** na tela de contrato, "Detalhes Financeiros" e "Valor
  Total" (Title Case) convivem com "TOTAL DO PLANO" em micro-caps a 40px de
  distância (`32-contrato.png`) — três sistemas de rótulo num viewport. Em
  comissões, "Como está o mês" e "Regras de Comissão" são cards vizinhos.
- **Por que atrapalha:** Title Case é convenção inglesa e, em português, faz o
  texto parecer traduzido. Mais do que estética: quando o mesmo nível hierárquico
  muda de forma, o olho para de usar a forma como pista de nível.
- **Sugestão:** **sentence case em tudo** (é a norma do português e já é a
  maioria das telas mais novas), exceto nomes próprios. Micro-caps reservado a
  rótulo de total dentro de tabela/lista. Vale um teste automatizado bobo que
  reprove `<CardTitle>` com duas iniciais maiúsculas seguidas.
- **Severidade:** 🟡

### E22 — Um `<Badge>` (que é `<div>`) dentro de um `<p>` quebra o parágrafo em comissões

- **Onde:** `pages/comissoes/index.tsx:838-865` — `<p className="text-xs
  text-muted-foreground">` contendo `<Badge>` nas linhas 841, 846 e 853;
  `components/ui/badge.tsx:39` renderiza um `<div>`.
- **O que a pessoa vê:** o console do navegador reclama em `/comissoes` (e só
  ali, varri 14 rotas): *"In HTML, `<div>` cannot be a descendant of `<p>`"*. O
  navegador fecha o `<p>` antes do badge, e o texto que vinha depois ("desde
  01/01/2020", "entra em vigor em …", "valeu de … a …") sai **fora** do `<p>` e
  perde as classes `text-xs text-muted-foreground` — na captura
  `05-comissoes.png` a data ao lado de "vigente" está visivelmente maior e mais
  escura do que o mesmo tipo de informação nos outros cards.
- **Por que atrapalha:** é HTML inválido que produz um efeito visual real e
  silencioso, na tela onde a gerente lê o histórico de escadas ("por que março
  pagou diferente?"). E, como o React avisa de hidratação, é o tipo de coisa que
  vira bug intermitente se um dia houver SSR.
- **Sugestão:** trocar o `<p>` por `<div>` (o texto já é bloco), ou o `<Badge>`
  por um `<span>` estilizado. Mais na raiz: `Badge` deveria renderizar `<span>`
  por padrão — é conteúdo em linha por natureza, e isso destrava usá-lo dentro
  de texto em qualquer lugar.
- **Severidade:** 🔵

### E23 — O funil não tem `<h1>`, e o `/vestidos` salta de `<h1>` para 114 `<h3>`

- **Onde:** `pages/noivas/funil.tsx` (o componente `FunilNoivas` não emite
  heading próprio; a `<h1>` "Noivas" mora em `noivas/index.tsx:100`);
  `pages/vestidos/index.tsx` — hierarquia medida: `H1 > H3 × 114`, sem nenhum
  `H2`.
- **O que a pessoa vê:** nada, se enxerga. Quem navega por teclado ou leitor de
  tela usa a lista de cabeçalhos como sumário da página; em `/vestidos` ela vira
  115 itens do mesmo nível, sem agrupamento, e a estrutura não ajuda em nada.
- **Por que atrapalha:** é o único ponto de acessibilidade estrutural fora do
  lugar — o resto do app é exemplar (uma `<h1>` por tela em 15 das 16 rotas
  auditadas). Vale corrigir enquanto é barato.
- **Sugestão:** o card de vestido usa `<h3>` porque é um card; se a grade
  ganhasse um `<h2>` de seção ("Acervo", ou o nome do filtro ativo), a árvore
  fecha. Em `/noivas`, garantir que a `<h1>` sobrevive ao alternador
  lista/funil.
- **Severidade:** 🔵

---

## Ganhos rápidos (alto impacto, baixo esforço)

1. **`<html lang="pt-BR">`** — uma palavra em `index.html:2` conserta 27 campos
   de data/hora/mês em 14 telas e fecha uma violação WCAG nível A. **(E1)**
2. **`--primary-foreground` deixa de ser branco** — o texto de todo botão de
   ação sai de 2,79:1 para ~7:1 sem tocar na cor da marca. Uma linha em
   `index.css:136`. **(E2)**
3. **`--muted-foreground` de `45%` para `40%`** — tira três combinações da faixa
   de reprovação de uma vez. Uma linha em `index.css:143`. **(E2)**
4. **`brl()` passa a devolver `R$ 1.200,00` com espaço rígido** — conserta a
   quebra no celular em 98 lugares e o dashboard sem `R$` de graça. **(E5, E7)**
5. **`mensagemApi` para de devolver `err.message`** — uma linha em
   `helpers.tsx:89` tira "HTTP 422" de ~20 telas; mais três em `login.tsx:40`.
   **(E4)**
6. **`rotuloCompetencia()` na frase da folha e `capitalize` fora da legenda de
   comissões** — mata "2026-07", "July 2026" e "Julho De 2026 — O Que Seria
   Pago". **(E15, E16)**
7. **Uma linha de total no card "Como está o mês"** — o número que a gerente
   procura deixa de morar dentro do diálogo da ação irreversível. **(E13)**
8. **`inputMode="decimal"` em `receber.tsx:399` e `contratos/[id].tsx:544,646`;
   `type="email"`/`autoComplete` no login; `type="tel"` no WhatsApp** — cinco
   atributos, o teclado certo nos campos mais tocados do dia. **(E20)**
9. **O `Badge` "Ativo" sai da fileira de botões do contrato** e o cabeçalho
   ganha "← Contratos" (copiar o padrão de `dre.tsx:120`). **(E9)**
10. **`size="icon"` vira 44×44 abaixo de `md`** — uma linha em `button.tsx`
    resolve o hambúrguer, o sino e todos os lápis/lixeiras no celular. **(E11)**

---

## O que está BEM (não mexer)

- **Os tokens são usados de verdade.** Em `pages/` + `components/` (fora de
  `ui/`) há **1** ocorrência de cor crua da família cinza e **29** de paleta com
  escala — quase todas `emerald`/`amber` legítimas de status, e todas com par
  `dark:`. Nenhum `p-[13px]`, nenhum `text-[13px]` solto, nenhum hex cravado.
  Isso é muito acima da média e é o que torna os consertos acima baratos.
- **O dark mode funciona.** Testei 7 telas no escuro; nada some, nada inverte,
  nada fica ilegível por cor fixa. O comentário de `index.css:232` ("mais claro
  no fundo escuro para manter o contraste legível") mostra que alguém pensou no
  problema, e o `--positivo` (`:43-45`, `:151-152`) é uma decisão de design
  registrada e correta.
- **Acessibilidade de nome: sem furos.** A varredura em 16 rotas não achou **um
  único** botão ou link sem nome acessível. Os `aria-label` são descritivos e em
  português de gente: *"Remover a versão de 01/01/2020 de Vendedora Maria"*,
  *"Arrastar Ana Silva para outra etapa"*, *"Notificações — nada pendente"*. E
  todas as 5 `<img>` de vestido têm `alt` significativo — inclusive as do portal
  da noiva (`noiva-portal.tsx:290`, `alt={v.nome}`).
- **Cor nunca é o único portador de informação.** Entrada/saída no fluxo têm
  `+`/`−` além da cor; status de parcela têm badge com TEXTO ("Atrasada",
  "Parcial · atrasada", "Prevista"); "vigente"/"futura"/"inativa" são palavras.
- **A microcópia, quando é boa, é excelente.** A confirmação de reabrir
  fechamento (`comissoes/index.tsx:747-752`) nomeia o valor da conta que some,
  os estornos que voltam e diz que fica na auditoria. O aviso de competência
  esquecida (`:474-499`) leva ao mês com um clique — "avisar sem dar o caminho é
  meio aviso", diz o comentário. O H1 "Seu dia" com "O que precisa da sua atenção
  agora." é a coisa certa para quem abre o sistema às 9h. A página 404
  (`D5-backup-dark.png`) é bonita e diz o que fazer.
- **A sidebar reflete o trabalho, não o banco.** Quatro grupos
  ("Relacionamento", "Ateliê", "Comercial", "Administração") que são as quatro
  jornadas do ateliê; o item da própria comissão fica fora do gate de propósito,
  com o porquê escrito ao lado (`layout/sidebar.tsx:65-67`); o drawer no mobile
  fecha ao navegar e tem `SheetTitle` para leitor de tela.
- **A matriz de permissões é o melhor uso de tabela do app** — cabe em 390px sem
  rolagem horizontal, cabeçalho claro, checkbox com estado de "herdado" visível.
  É o exemplo de que o `<Table>` primitivo resolve; só falta adotá-lo.
- **A tela de atendimentos entende o trabalho.** O horário grande em serif à
  esquerda, a seção "ATRASADOS" no topo, o estado do atendimento como badge
  textual, "Confirmar por WhatsApp" como ação de um toque
  (`08-atendimentos-390.png`). Nenhuma das minhas críticas a ela é sobre o
  desenho — só sobre alvo de toque e "540 min".

---

## Pistas para a trilha F

- **O beco da cobrança é uma jornada, não uma tela.** E3 + E9 juntos: de
  "Contas a receber" a vendedora só chega ao nome da noiva pelo contrato, e do
  contrato não há volta para a ficha nem link para o WhatsApp dela. A jornada
  "vi uma parcela atrasada → quero falar com a noiva" tem quatro paradas e uma
  delas é um beco. Vale medir contra "Mensagens de hoje", que resolve a MESMA
  necessidade em um toque — pode ser que a tela de receber devesse apontar para
  ela em vez de tentar ser ela.
- **A ficha da noiva tem quatro cards vazios em sequência** (E18) na noiva que
  acabou de entrar — que é exatamente o momento em que ela está mais no começo.
  A tela de detalhe mais usada do sistema mostra o pior estado dela para a
  situação mais comum. É pergunta de produto: a ficha de uma noiva NOVA deveria
  ser a mesma tela da ficha de uma noiva em provas?
- **"Sem dados de contato" numa ficha de noiva** (`30-ficha-noiva.png`) é a
  lacuna de jornada mais concreta que achei: o cadastro deixa WhatsApp opcional
  (`noiva-form.tsx:25`, `.optional()`), a ficha não tem como preenchê-lo dali, e
  toda a máquina de mensagens (E69/E84) depende dele. Vale perguntar se
  "adicionar noiva sem telefone" deveria ser possível.
- **A tela de comissões é seis telas** (ranking do mês, série histórica,
  fechamentos, baixas de estorno, escadas versionadas, formulário de nova
  escada) empilhadas num scroll de 1.137 linhas, sem abas nem âncoras — e o
  número que a gerente foi buscar (o total) só existe dentro do diálogo da ação
  irreversível (E13). Vale avaliar se "acompanhar o mês" e "configurar a escada"
  são a mesma tarefa.
- **O contraste do botão primário (E2) é decisão de marca antes de ser de
  código** — pode valer alinhar com quem escolheu a paleta antes de propor o
  épico, porque a correção mais limpa (texto escuro sobre o rosa) muda a
  aparência de todo botão do sistema.
- **`/vestidos` sem paginação** (E19): 114 cards com foto de uma vez. Vale
  entender como a vendedora realmente procura um vestido com a noiva ao lado —
  se é por busca, a paginação não importa; se é folheando, importa muito.
