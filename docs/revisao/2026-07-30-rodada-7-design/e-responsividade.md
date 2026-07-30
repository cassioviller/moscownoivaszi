# Trilha E — o miolo aguenta os 390px; o que estoura é a moldura, e ela esconde exatamente o botão do dia

O corpo das telas se comporta no celular: os cards empilham, as 6 tabelas rolam
por dentro da própria moldura, o toque arrasta nos dois kanbans e o dinheiro
não dobra linha (o espaço rígido do E92 segurou nas 27 capturas). O que quebra
é a **fileira de flex sem quebra**: cabeçalhos e linhas de ação que somam mais
que os 358px úteis e dão à página uma rolagem lateral que nada sinaliza — e o
que ela esconde é sempre o alvo principal ("Novo Vestido" 100% fora da tela, o
WhatsApp da cobrança invisível, os centavos do total recebido cortados). Ao
lado disso, a metade adiada de duas réguas do próprio repo: os 44px que não
chegaram ao botão `default` e o contraste que não chegou ao rosa usado como
texto.

**Método e ambiente.** Li as **27 capturas `*--390.png`** de
`docs/revisao/2026-07-30-rodada-7-design/capturas/` (viewport 390×844; algumas
página inteira 390×1025) e comparei `contratos`, `equipe` e
`financeiro-receber` com as irmãs `--claro` (1280×800) para confirmar que o
defeito é só do celular. Banco de dev da loja `84e539bd`: nomes `E2E *` e
contagens infladas são artefato de fixture, não defeito. No código
(`artifacts/moscow-noivas/src/`): `app-layout.tsx`, `ui/button.tsx`,
`ui/table.tsx`, `ui/card.tsx`, `agenda/grade.tsx`, `noivas/funil.tsx`,
`hooks/use-mobile.tsx`, `dialogo-receber-parcela.tsx`, `sino-notificacoes.tsx`,
as telas citadas linha a linha e as varreduras (`aparencia.test.ts`,
`escala-dinheiro.test.ts`). A conta dos 358px: 390 de viewport menos o `p-4`
do container (`app-layout.tsx:175`). **Locale:** as capturas agora têm
evidência interna — o input de mês desenha "July 2026"
(`financeiro-folha--390.png`) e os de data mostram `mm/dd/yyyy`
(`financeiro-auditoria--390.png`), então a interface do navegador era
**en-US**. Isso é o comportamento de plataforma que o E92 já mediu (o campo
nativo segue a locale da interface, não o `lang`), NÃO vira achado (regra 6) —
mas atualiza a sobra S-D2. Pistas herdadas assumidas: o contraste do
`text-primary` (trilha A) → E4, o dinheiro em `type="number"` (trilha B) →
E11, os filtros de /vestidos em 390px (trilha D) → E13.

---

## E1 🟠 — Fileiras sem quebra dão rolagem lateral à página, e o que sai da tela é o botão de criar

**Capturas:** `vestidos--390.png` (o header termina em "Novo vesti" cortado na
borda; o botão primário "Novo Vestido" está 100% fora da tela),
`contratos--390.png` (o botão "Novo contrato (via orçament" cobre o "s" do
título E é cortado; em cada card o badge "Cancelado" sai pela borda),
`financeiro-pagar--390.png` ("Exportar CSV" cortado no meio).
**Código:** `src/pages/vestidos/index.tsx:288-314` (header
`flex items-center justify-between` sem quebra; o grupo de 3 botões —
"Utilização" + "Novo vestido (completo)" + "Novo Vestido" — soma ~470px para
358 úteis) · `src/pages/contratos/index.tsx:39-46` (mesmo padrão; botão de
~250px + h1 de ~150px) e `:113-116` (a linha `flex items-center gap-4` do
card: dinheiro + badge sem `min-w-0`/quebra) ·
`src/pages/financeiro/pagar.tsx:401-423` (o wrapper de :390 até quebra, mas o
grupo interno `flex gap-2` com 3 botões ≈ 390px não) ·
`src/pages/reservas/index.tsx:154` (badge do vestido sem `truncate` — o último
card de `reservas--390.png` estoura; o gatilho é nome de fixture, o mecanismo
é real). O `<main>` só declara `overflow-y-auto`
(`components/layout/app-layout.tsx:174`), o que computa `overflow-x` para
`auto`: a página INTEIRA ganha rolagem lateral, sem barra visível no toque e
sem nada que a anuncie.

O cenário: a vendedora, de pé com a noiva ao lado, abre Vestidos no celular
para cadastrar a peça que acabou de chegar — **o botão que cria não está na
tela**, e nada indica que exista; a porta rápida (o dialog do E2E) é
literalmente invisível. Em Contratos o botão desenha por cima do título. São
**4 telas com corte confirmado por captura** (vestidos, contratos, pagar,
cobrança — esta no E3). O mesmo padrão em `orcamentos/index.tsx:116` cabe hoje
por ~10px ("Novo Orçamento" é curto) — o conserto deve cobrir o padrão, não as
quatro instâncias. Shadcn agrava: todo `Button` é `whitespace-nowrap`
(`ui/button.tsx:8`), então o flex não tem onde ceder.

## E2 🟠 — Os totais de Contas a receber saem cortados na borda: R$ 90.100,00 vira "R$ 90.100,0"

**Captura:** `financeiro-receber--390.png` — "A receber R$ 52.700,00" e
"Recebido R$ 90.100,00" lado a lado, os dois cards atravessando a borda
direita, com os últimos dígitos fora da tela. A irmã
`financeiro-receber--claro.png` mostra os três cards íntegros.
**Código:** `src/pages/financeiro/helpers.tsx:42` (`ResumoCard` é
`min-w-[9rem] flex-1`) dentro do `flex flex-wrap gap-3` de
`src/pages/financeiro/receber.tsx:259-263`.

A conta: `min-w-[9rem]` = 144px permite DOIS cards por linha em 358px
(2×144+12 = 300, cabe) — mas o conteúdo real é `money-lg` (`text-3xl` serif,
`index.css:324-326`): "R$ 52.700,00" em 30px ≈ 200px, mais 48px de padding do
CardContent ≈ **250px por card**, e o flex não encolhe abaixo do conteúdo. A
dupla ocupa ~512px, 154px além da tela. A dona confere o mês no celular e lê
um total de dinheiro **sem os centavos e sem o último dígito** — no limite,
R$ 90.100,00 e R$ 90.100,09 são a mesma imagem. `financeiro-pagar--390.png`
escapa por um dígito (R$ 8.391,15 cabe raspando); o mesmo `ResumoCard` serve
receber, pagar e folha, então o conserto num lugar fecha os três. O `brl()`
está inocente: o espaço rígido impede a quebra DENTRO do número, como o E92
desenhou — o que falta é a moldura caber no número.

## E3 🟠 — Na fila de Cobrança, o WhatsApp — a ação que só faz sentido no celular — está fora da tela

**Captura:** `financeiro-cobranca--390.png` — a linha da Ana Silva termina em
"R$ 5.000,00 · Histórico ⌄ · [Receber] [C" — o botão "Contrato" cortado no
meio e o **"WhatsApp" 100% invisível**. **Código:**
`src/pages/financeiro/cobranca.tsx:121-160` — o wrapper de :105 tem
`flex-wrap`, mas o grupo interno `flex items-center gap-3` (:121) enfileira
dinheiro (~110px) + "Histórico" (~100px) + "Receber" (~90px) + "Contrato"
(~95px) + "WhatsApp" (~120px) + 4 gaps = **~560px num card de ~326px** — mais
de 200px escondidos.

O cenário é o miolo da tela: a vendedora desce a fila de inadimplentes PARA
mandar mensagem — e o wa.me, que abre o app que está no MESMO aparelho, é o
único botão que ela não vê. O F28 (rodada 6) pôs o "Receber" nesta linha
exatamente para não trocar de tela; em 390px a linha devolve a troca de tela
por outra via. Basta `flex-wrap` no grupo interno (ou promover o grupo ao
wrapper de :105, que já quebra) — as ações caem para a linha de baixo, como o
card da noiva em `financeiro-receber--390.png` já faz com o seu "Receber".

## E4 🟠 — O rosa da marca como texto pequeno: 2,71:1 em 11 pontos, incluindo o preço que a noiva lê no portal — e um deles escapa da varredura por uma quebra de linha

**Capturas:** `mensagens--390.png`/`mensagens--claro.png` (link "Ver a
cobrança completa"), `portal-noiva--390.png` (o preço "R$ 4.200,00" em rosa
sob cada vestido). **Código:** a conta é dos tokens (`--primary: 350 25% 65%`
sobre `--background: 40 33% 98%`, `src/index.css`) = **2,71:1**, feita pela
trilha A e batendo com os 2,78:1 que o E92 mediu sobre o card; a régua do repo
é 4,5:1 com teste em CI (`lib/aparencia.test.ts:86`) — que só compara pares de
TOKEN e nunca testa `primary` como texto (`aparencia.test.ts:93-102` testa
`primary-foreground` SOBRE `primary`, não o inverso). Os pontos, todos texto
pequeno: 10 links `text-primary underline` (`mensagens/index.tsx:379`,
`dashboard.tsx:383`, `financeiro/conciliacao.tsx:326,330`,
`configuracoes/backup.tsx:218`, `equipe/index.tsx:516,644`,
`admin/index.tsx:520`, `reservas/[bloqueioId].tsx:604,723`) mais o preço do
portal (`noiva-portal.tsx:404-406`, `text-sm font-medium text-primary` em
volta de `brl(v.precoBase)`).

O preço do portal é o caso que dói dobrado: o E8/E99 decidiu "o rosa não é cor
de dinheiro" e criou a varredura `escala-dinheiro.test.ts:57-68` — que procura
`brl(` e `text-primary` **na mesma linha**. Em `noiva-portal.tsx` o prettier
pôs o `className` na linha 404 e o `brl(` na 405, e o ofensor vive verde no CI
desde então (o gêmeo `lookbook-publico.tsx:81` foi corrigido pelo E99; este
escapou). Quem sofre: a noiva, no celular dela, ao sol, lendo o preço do
vestido na cor de menor contraste do sistema — e qualquer pessoa de baixa
visão nos 10 links, um deles na fila diária de mensagens. O E92 deixou o
conserto desenhado (`--primary-texto: 350 30% 42%`, 6,48:1, entrando na mesma
varredura); o E99 tomou a decisão de reservar o rosa ao interativo mas não
criou o token — não há decisão registrada CONTRA ele, só a entrega que ficou
no meio.

## E5 🟡 — Equipe em 390px mostra 4–6 caracteres de quem é a pessoa

**Captura:** `equipe--390.png` — os dois membros viram "Vend…"/"maria…" e
"Super Ad…"/"admin@m…"; a irmã `equipe--claro.png` mostra
"Vendedora Maria / maria@moscownoivas.com" inteiros. **Código:**
`src/pages/equipe/index.tsx:424` — o `<li>` é
`flex justify-between items-center` SEM quebra; a direita é `shrink-0` (:447)
com badge do perfil (~90px) + lápis + lixeira de 44px (:464,472) ≈ 190px, e
sobram ~136px para nome (:428), e-mail (:433) e resumo de acessos (:442), os
três `truncate`.

O cenário: a dona, no celular, vai inativar uma vendedora que saiu — com duas
"Vendedora …" na lista, as linhas são idênticas até nos 6 caracteres visíveis,
e a lixeira certa vira adivinhação (o diálogo de confirmação nomeia a pessoa,
que é a rede do E10 — mas o caminho até ele é às cegas). O conserto é o mesmo
padrão do card da cobrança: deixar a identidade ter a linha dela
(`flex-wrap`), como o próprio arquivo já faz no `<li>` dos convites (:351).

## E6 🟡 — Enter não conclui nenhum fluxo de dinheiro: o financeiro inteiro não tem um `<form>`

**Código:** `src/components/dialogo-receber-parcela.tsx:136-196` — o diálogo
de dinheiro mais usado do sistema é `<div>`s + `Button onClick`; digitar o
valor e apertar Enter **não faz nada**. O app tem 15 arquivos com `<form>`
(login, noiva-form, orçamento, vestido…) e **zero** deles no financeiro:
`receber.tsx`, `pagar.tsx` (lançar despesa e pagamento rateado),
`contratos/[id].tsx` (gerar plano) e `folha.tsx` não têm um `onSubmit` sequer
(grep confirmado).

A conta do teclado: depois de digitar o valor, registrar custa
Tab (data) → Tab (forma) → Tab (Cancelar) → Tab (Registrar) → Enter — **5
teclas onde a convenção universal é 1**. No celular a tecla "ir" do teclado
numérico (o `inputMode="decimal"` que o E92 acertou) também morre no vazio. O
resto do fluxo por teclado está são: os botões alcançam por Tab, o Radix
devolve o foco ao gatilho ao fechar e Escape cancela — falta só a semântica de
formulário no miolo.

## E7 🟡 — O contador do sino é branco sobre o rosa: 2,79:1 no aviso mais persistente do header

**Capturas:** todas as 27 `*--390.png` — o header mobile traz o sino com o
"1" branco no círculo rosa em cada uma delas. **Código:**
`src/components/sino-notificacoes.tsx:209-211` — `text-white` cru sobre
`bg-primary`; a conta de hsl(350 25% 65%) ≈ rgb(188,143,151) sob branco dá
**2,79:1**, num numeral de **10px** (`text-[10px]`). O token
`--primary-foreground` existe exatamente para este par (é o que o botão usa,
com 4,5:1 testado em `aparencia.test.ts:93`), e `text-white` fora do token é
invisível para a varredura. A trilha A registrou a família âmbar sem token
(A5); este é o caso da mesma classe que **já reprova hoje** — a dona olha o
sino para saber QUANTOS avisos há (caixa furando, comissão esquecida) e o
número é ilegível de relance. Quando `urgentes` pinta `bg-destructive` o
branco passa; é o estado calmo, o de todo dia, que falha.

## E8 🟡 — Dois alvos de 24px derrotam a régua dos 44px por `className`

**Código:** `src/components/sino-notificacoes.tsx:244` e
`src/pages/reservas/[bloqueioId].tsx:858-866` — os dois passam
`className="h-6 w-6"` a um `Button size="icon"`, e o override anula o
`h-11 w-11` mobile que o E92 pôs no próprio componente
(`ui/button.tsx:30-40`). Resultado: um X de **24×24px** onde a régua do repo
(WCAG 2.5.5, comentada no botão) manda 44.

O do sino é o pior: "Dispensar" fica colado no `<Link>` do aviso
(`sino-notificacoes.tsx:231-240`), então errar o X por 10px **navega** para a
tela do aviso em vez de dispensá-lo — no header mobile, de polegar. O da
reserva remove item do checklist de devolução ao lado do checkbox que o marca.
Ambos têm `aria-label` correto; o problema é só o tamanho. O conserto barato é
`h-6 w-6 md:h-6 md:w-6` virar padding tocável (ou remover o override abaixo de
`md`).

## E9 🟡 — A metade adiada da régua dos 44px: o botão `default` segue com 36px no celular

**Código:** `src/components/ui/button.tsx:37` — `default: "min-h-9 px-4
py-2"` = **36px** em qualquer viewport, enquanto `sm` e `icon` sobem para 44px
abaixo de `md` (:38-40). O comentário do próprio arquivo (:30-34) enuncia a
régua como universal ("abaixo de `md` o alvo tem 44px"), mas o tamanho mais
usado do sistema não a cumpre — e o E92 mediu o que sobrou ao aplicá-la só em
`sm`/`icon`: **60 alvos abaixo de 44px em Atendimentos e 23 em Vestidos**
(`docs/revisao/2026-07-25-rodada-6/execucao/E92.md`, seções do E11 e "o que
ficou de fora"). O E92 adiou de propósito ("mudar o default altera a altura de
todo botão no mobile — é decisão de layout, não ajuste") — o registro é de
adiamento, não de recusa com medida, então o trabalho segue em aberto: decidir
o `default` mobile de uma vez, com o dono, e fechar a régua que hoje vale para
um terço dos tamanhos.

## E10 🟡 — Arrastar é a única porta: reagendar e mover etapa não existem por teclado nem por formulário

**Código:** `src/pages/agenda/grade.tsx:83-88` e
`src/pages/noivas/funil.tsx:96-101` — os dois `useSensors` ligam
`PointerSensor` e `TouchSensor`, e o `KeyboardSensor` do dnd-kit (que existe
para isso) não está em nenhum. E não há porta alternativa: `useUpdateAtendimento`
tem só 2 call-sites de horário/cabine — o drop da grade (`grade.tsx:80`) e o
"iniciar" do dashboard (`dashboard.tsx:155`) —, nenhum formulário edita o
horário de um atendimento marcado; a etapa do funil só muda por arrasto (fora
os botões de PERDIDO/reativar da ficha, `noivas/[leadId]/index.tsx:159,183`).

Quem navega por teclado (ou usa leitor de tela) não reagenda NUNCA — o
contorno é cancelar e marcar de novo em `/atendimentos/novo`, pagando o
formulário inteiro. No toque o arrasto funciona (o delay de 200ms está certo,
ver "está BEM"), mas arrastar meia tela com o dedo num viewport de 390px que
rola nos dois eixos é pontaria — um "Reagendar…" no cartão (dialog com
data/hora/cabine) serviria de fallback universal e fecharia a lacuna de
teclado junto.

## E11 🟡 — Três campos de dinheiro em `type="number"`, contra a regra escrita no próprio repo

**Código:** `src/pages/vestidos/vestido-form.tsx:98` e
`src/pages/vestidos/index.tsx:343` (preço do vestido, página e dialog) e
`src/pages/noivas/[leadId]/interesses.tsx:214` (teto de orçamento) — os três
`type="number" step="0.01"`. A regra mora num comentário do próprio sistema:
*"Nunca `type=\"number\"` para dinheiro: vira roleta e muda o valor quando o
dedo rola a página"* (`components/dialogo-receber-parcela.tsx:147-149`, E92).
Herdada da trilha B e assumida aqui porque o dano é do celular: a vendedora
cadastra o vestido de R$ 4.200,00, rola a página com o dedo sobre o campo e o
scroll incrementa o preço sem ela ver; e com o navegador en-US (o mesmo
ambiente das capturas) a vírgula de "4200,50" é rejeitada em silêncio. O
conserto é o padrão que o repo já tem: `inputMode="decimal"` como em
`dialogo-receber-parcela.tsx:151` e `orcamentos/[id].tsx:923`.

## E12 🟡 — `CardTitle` é `<div>`: os cards não existem na navegação por cabeçalhos do leitor de tela

**Código:** `src/components/ui/card.tsx:32-41` — o "título" de card é um
`<div>` com cara de título. São **52 arquivos** usando card (inventário), e as
telas densas são feitas de seções-card ("Membros da equipe", "Itens do
orçamento", "Recebimentos por meio"…): para quem navega por headings — o
gesto número 1 de leitor de tela — a página tem o `h1` e depois **nada**.
Herdada da trilha A (que a anotou como semântica) e assumida aqui por ser
a11y: o conserto clássico é `CardTitle` aceitar `as`/`asChild` e as telas
declararem `h2`/`h3`, ou o componente virar `h3` por padrão. O E92 varreu a
árvore de cabeçalhos de 6 rotas mas só mexeu nos `h1`; o miolo ficou plano.

## E13 🟡 — Em 390px a primeira dobra de /vestidos é 100% filtro — o teto do D8 precisa valer também para a coluna

**Captura:** `vestidos--390.png` — busca + 3 selects fixos + um select POR
atributo do catálogo, empilhados; na captura **nenhum vestido aparece** nas
primeiras dobras (o volume de atributos é fixture, o mecanismo sem teto é
real — `src/pages/vestidos/index.tsx:470-488`). Mesmo no cenário realista de
4-6 atributos, são 8-10 controles de ~56px antes do primeiro card: ~700px de
filtro num viewport de 844. **Consolida com o D8** (que já propõe teto para os
selects): a execução dele deve incluir o comportamento mobile — filtros
colapsados atrás de um "Filtrar (N)" abaixo de `md`, como toda listagem móvel
faz — senão o teto resolve o desktop e o celular continua rolando um formulário
para ver o acervo.

---

## O que está BEM — não mexer

1. **O toque arrasta nos dois kanbans, e com o delay certo** —
   `agenda/grade.tsx:85-87` e `noivas/funil.tsx:99-101` ligam `TouchSensor`
   com `delay: 200, tolerance: 8`: o long-press arrasta e a rolagem normal não
   sequestra o card. O E10 pede um fallback, não a troca disto.
2. **As tabelas degradam por rolagem interna, nunca espremidas** —
   `ui/table.tsx:9` traz o `div.overflow-auto` próprio, e
   `agenda/semana.tsx:161-166` documenta por que o `min-w-[56rem]` fica no
   `<table>` e não no wrapper. `agenda-semana--390.png` mostra 2 de 7 dias
   legíveis com rolagem, zero corte de página.
3. **A grade da agenda é o padrão certo de tabela larga** — coluna de horários
   `sticky left-0` (`grade.tsx:196,208`) dentro de `overflow-x-auto` (:189):
   em `agenda--390.png` a hora nunca sai da tela enquanto as cabines rolam.
4. **A régua dos 44px vale em `sm` e `icon`, com o porquê escrito no
   componente** (`ui/button.tsx:30-40`), e todos os `size="icon"` amostrados
   têm `aria-label` de verdade (`financeiro/dre.tsx:130`,
   `comissoes/index.tsx:941`, `equipe/index.tsx:466`, `theme-toggle.tsx:22`,
   `sino-notificacoes.tsx:198` — este até com a contagem no rótulo).
5. **O chrome mobile é enxuto e correto** — hambúrguer de 44px com
   `aria-label="Abrir menu"` (`app-layout.tsx:146-153`), drawer `w-72` com
   `SheetTitle` sr-only (:155-157) que fecha no clique E na troca de rota
   (:88), sino no header (:162-165). O caminho mais comum da vendedora
   (dashboard → fila de mensagens) custa **2 toques**.
6. **`brl()` segurou o dinheiro numa linha nas 27 capturas** — o espaço rígido
   do E92 (`lib/formatos.ts`) fez o serviço; o corte do E2 é da moldura, não
   do número.
7. **O campo de dinheiro mais usado ensina a regra** —
   `dialogo-receber-parcela.tsx:147-151` com `inputMode="decimal"` e o
   comentário-régua; o editor de orçamento segue igual
   (`orcamentos/[id].tsx:923,961`). O E11 é sobre os 3 que não seguiram.
8. **O popover do sino cabe nos 390** — `w-80` = 320px
   (`sino-notificacoes.tsx:219`), com colisão do Radix cuidando da borda.
9. **Login e portal da noiva são mobile-first de fato** — `login--390.png` e
   `portal-noiva--390.png`: uma coluna, alvos generosos, "Falar no WhatsApp"
   em largura total com o rodapé da loja (`noiva-portal.tsx`). É a tela que a
   noiva mais abre no celular, e é a mais sólida em 390px.
10. **Os diálogos devolvem o foco** — Radix `Dialog`/`AlertDialog` sem nenhum
    `onCloseAutoFocus` desligado no app (grep zero): fechar o recebimento
    devolve o foco ao botão "Receber" da linha. O E6 é sobre o Enter, não
    sobre o foco.

## Pistas laterais — de outras trilhas

- **(A — consistência)** "Exportar CSV" tem ícone `Download` em fluxo e DRE
  (`financeiro/fluxo.tsx:219`, `dre.tsx:163`) e sai pelado em receber, pagar e
  auditoria (`receber.tsx:231`, `pagar.tsx:420`, `auditoria.tsx:131`) — cinco
  irmãs, duas gramáticas; casa com o A4.
- **(método/G — varreduras por linha têm uma fresta)** A varredura do E8
  procura `brl(` e `text-primary` **na mesma linha**
  (`lib/escala-dinheiro.test.ts:62-64`) e o prettier separa os dois em
  `noiva-portal.tsx:404-405` — ofensor vivo com CI verde (é o miolo do E4).
  Vale auditar as outras varreduras de grep do repo
  (`destrutivas-varredura`, `datas-varredura`) contra o mesmo padrão de
  quebra de formatação.

## Sobras registradas nesta trilha

- **S-D6** — `useIsMobile` (`hooks/use-mobile.tsx`) tem **0 consumidores**
  (grep no `src/` inteiro): o app decide mobile por breakpoint CSS, que é o
  certo. Mesma classe da S-D3 — podar ou adotar.
- **S-D2 (evidência nova)** — a locale da interface do navegador das capturas
  ficou provada pelos próprios PNGs: **en-US** ("July 2026" em
  `financeiro-folha--390.png`, `mm/dd/yyyy` em
  `financeiro-auditoria--390.png`).
