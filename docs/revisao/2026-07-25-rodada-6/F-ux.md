# Trilha F — UX: jornadas, atrito e produto

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

**Método: percorri jornadas, não arquivos.** Para cada uma das 9 jornadas do
briefing li as telas envolvidas em `artifacts/moscow-noivas/src/pages/`, as
rotas de `App.tsx`, os componentes compartilhados (`sino-notificacoes`,
`alerta-caixa`, `combobox-noiva`, `historico-contato`, `sidebar`) e as rotas de
API correspondentes quando a tela dependia do que o servidor aceita. Contei os
passos REAIS: cliques, telas, campos obrigatórios, decisões e — o que mais
aparece aqui — os momentos em que a pessoa precisa saber algo que a tela não
conta. Nenhum arquivo de código foi alterado.

Não repito achado de FORMA (trilha E) nem de código (D). Onde a trilha E viu um
botão com contraste ruim, eu vejo se o botão certo está na tela certa. Onde a
trilha C viu um 422, eu vejo o que a vendedora faz com a noiva do lado quando ele
aparece.

## Resumo executivo

O sistema tem uma qualidade de produto acima da média para software interno:
"Mensagens de hoje" (E69), o sino (E68), a grade de slots que OFERECE em vez de
recusar depois (E64), a reserva criada dentro do fluxo da prova (E65), o motivo
de perda estruturado, o portal único da noiva (E78). São decisões de produto de
quem entendeu o trabalho. O problema não é falta de funcionalidade — é que as
funcionalidades **não se alcançam umas às outras**.

O padrão que se repete em oito das nove jornadas é o mesmo: **a tela onde a
pessoa descobre o problema não é a tela onde ela pode resolvê-lo, e não há link
entre as duas.** A ficha da noiva não agenda; a fila de cobrança não registra o
contato; a tela de contas a receber não sabe o nome de quem deve; a lista de
provas não abre o ajuste; o dashboard não linka para "Mensagens de hoje". Em
todos esses casos a informação existe, a ação existe, e o que falta é um `<Link>`
de 3 linhas — mas o custo para quem usa é abrir uma segunda aba, decorar um nome
ou anotar num papel.

Os dois danos críticos:

1. **O carimbo de "confirmado" mente (F6).** Abrir o wa.me em "Mensagens de hoje"
   carimba `confirmadoEm` na hora (`mensagens/index.tsx:184-190`), antes de a
   noiva responder qualquer coisa — e é o MESMO campo que o portal usa quando a
   noiva confirma de verdade (E85). A loja acha que 8 presenças estão
   confirmadas quando 8 mensagens foram abertas. Não há como desconfirmar.
2. **A jornada comercial trava num beco de 422 (F17).** O "Gerar contrato" é uma
   tela inteira dentro de um modal (`orcamentos/[id].tsx`), e quando o servidor
   recusa por divergência de centavos (C1) a vendedora recebe um toast em
   linguagem de servidor, com o diálogo ainda aberto e nenhuma saída que
   funcione. É o clique mais caro do funil no lugar menos protegido do app — o
   arquivo irmão (`contratos/[id].tsx:65-83`) tem o dicionário de erros que
   faltou aqui.

E o terceiro, que não é um achado só e por isso não é 🔴: **a noiva, no portal,
não tem nenhuma ação além de "confirmo que vou".** Ela não consegue dizer "não
vou poder ir" (F37), não vê quanto ainda deve (F36), não tem como falar com a
loja da página que três vezes lhe pede para falar com a loja (F35), e o link
morre em 30 dias sem ninguém do lado de dentro saber (F38). Cada uma dessas
lacunas volta como mensagem de WhatsApp para a vendedora — o custo exato que o
E78 existia para reduzir.

**Contagem:** 44 achados — 🔴 2 · 🟠 24 · 🟡 16 · 🔵 2.

---

## Jornada 1 — Lead novo até o primeiro atendimento

**Cenário:** chega uma DM no Instagram. "Oi, queria conhecer os vestidos, meu
casamento é em novembro." A vendedora quer: cadastrar, marcar a origem, agendar
e confirmar a presença.

**Como é hoje:**

1. Sidebar → **Noivas** (`/loja/:lojaId/noivas`, `pages/noivas/index.tsx`).
2. Botão "Adicionar noiva" → `/noivas/nova` (`pages/noivas/nova.tsx`).
3. Formulário (`pages/noivas/noiva-form.tsx`): 1 campo obrigatório (nome), 1
   select de origem que **nasce em "Loja"** e 6 campos opcionais. Ela troca
   origem para Instagram, digita o WhatsApp, a data do casamento (num campo que
   pede `mm/dd/yyyy`, ver E1).
4. Salvar → navega para a ficha (`noivas/[leadId]/index.tsx:127`… na verdade
   `nova.tsx:40`, `navigate(.../noivas/${criada.id})`).
5. **Na ficha não há botão de agendar.** Ela lê os 8 cards (casamento, contato,
   histórico, orçamentos, contratos, portal, lookbook, interesses), todos vazios,
   e sai para a sidebar.
6. Sidebar → **Atendimentos** → botão "Agendar" → `/atendimentos/novo`.
7. No formulário (`atendimentos/novo.tsx:440-460`) ela **procura a noiva de
   novo** num combobox, digitando o nome que acabou de cadastrar.
8. Escolhe cabine, vendedora, data; espera a grade de slots carregar; clica na
   hora; "Agendar".
9. O toast oferece "WhatsApp" para confirmar (`novo.tsx:341-346`).

**Passos reais:** 3 telas, 2 buscas pela mesma noiva, ~9 cliques + digitação.
Dois dos passos (o 5→6 e o 7) existem só porque o sistema pede.

**Onde dói:** a ficha da noiva é o destino do cadastro e é a única tela do fluxo
que não faz nada. Ela sabe o `leadId`; a rota de agendar aceita `?noiva=` como
deep-link (`reservas/[bloqueioId].tsx:662` usa exatamente isso) — e a ficha não
usa. E a origem "Instagram", que é o dado que a gerente vai querer no relatório
de conversão, depende de a vendedora lembrar de trocar um select que já vem
preenchido com outra coisa.

### F1 — A ficha da noiva não agenda: o deep-link existe e ninguém o usa

- **Onde:** `pages/noivas/[leadId]/index.tsx:243-278` (a barra de ações da ficha)
  × `pages/atendimentos/novo.tsx:116-123` (o prefill `?noiva=&tipo=&reserva=`,
  hoje consumido só por `pages/reservas/[bloqueioId].tsx:662`).
- **O atrito:** a tela que sabe QUEM não oferece o QUANDO. Sair da ficha para o
  formulário de agendar e reencontrar a mesma noiva num combobox é o passo mais
  repetido do sistema — acontece no cadastro, acontece depois de todo atendimento
  ("vamos marcar a prova?"), acontece quando a noiva liga.
- **Por que importa:** é o caminho de maior frequência do app inteiro e custa uma
  navegação de sidebar + uma busca por nome. Com a noiva do lado, "só um minuto
  que eu acho você aqui" é constrangimento. E há risco real de erro: dois nomes
  parecidos no combobox e o atendimento vai para a noiva errada, sem nenhum aviso.
- **Sugestão:** um botão "Agendar atendimento" na ficha, linkando
  `/atendimentos/novo?noiva={leadId}`. O mesmo vale para "Agendar prova"
  (`&tipo=PROVA`) quando a noiva já tem reserva. Zero código novo do lado do
  formulário — ele já lê os parâmetros.
- **Severidade:** 🟠

### F2 — Origem nasce "Loja" e é imutável depois: o dado de marketing nasce errado por padrão

- **Onde:** `pages/noivas/noiva-form.tsx:45` (`origem: "LOJA"` no `VAZIO`) e
  `noiva-form.tsx:63-64` (`origemDisabled` na edição, "a origem não é alterável").
- **O atrito:** o valor mais comum de um cadastro feito às pressas é o default. A
  noiva que veio do Instagram entra como "Loja" se a vendedora não trocar, e a
  edição **não deixa corrigir** — o campo fica desabilitado.
- **Por que importa:** `/noivas/conversao` (`pages/noivas/conversao.tsx`) existe
  para responder "de onde vêm as noivas que fecham". Um default silencioso que
  não pode ser corrigido envenena exatamente esse relatório, de forma
  irreversível e invisível. Ninguém descobre porque não há erro.
- **Sugestão:** duas saídas, ambas baratas. (a) `origem` sem valor inicial, com
  placeholder "De onde ela veio?" — obriga uma escolha consciente e o `z.enum`
  já é obrigatório; (b) permitir corrigir a origem enquanto o lead não tem
  contrato, com rastro na auditoria. O comentário da linha 63 diz que a
  restrição vem do `LeadUpdate` da API, não de uma regra de negócio — vale
  perguntar se ela ainda é intencional.
- **Severidade:** 🟠

### F3 — WhatsApp é opcional no cadastro e toda a máquina de mensagens depende dele

- **Onde:** `pages/noivas/noiva-form.tsx:25` (`whatsapp: z.string().optional()`)
  → efeito em `pages/mensagens/index.tsx:196,258,316` (três `Badge "Sem
  WhatsApp"`), `pages/atendimentos/novo.tsx:302-316` (o toast de confirmação
  simplesmente não aparece), `lib/whatsapp.ts` (`linkWhatsApp` devolve null).
- **O atrito:** o cadastro deixa passar; o custo aparece semanas depois, em três
  telas diferentes, como uma linha que não tem botão. E em nenhuma delas há como
  preencher o telefone dali: o badge "Sem WhatsApp" é texto morto, não um link
  para `/noivas/:leadId/editar`.
- **Por que importa:** a fila de mensagens é o produto E69 inteiro. Uma noiva sem
  telefone é uma linha permanentemente encalhada na fila do dia — e o jeito de
  destravar (ir à ficha, clicar Editar, preencher, voltar) nunca é oferecido no
  momento em que a pessoa descobre o problema. A trilha E já registrou "Sem dados
  de contato" na ficha; o meu ângulo é que a falta se manifesta longe de onde se
  conserta.
- **Sugestão:** duas camadas. (1) Tornar o badge "Sem WhatsApp" um link para a
  edição da noiva (ou, melhor, um popover com um único campo de telefone e
  salvar) — a correção no lugar onde a falta aparece. (2) Decidir de produto se
  "noiva sem telefone" deve existir: se a origem for LOJA (ela está na frente da
  vendedora) faz sentido; se for WHATSAPP ou INSTAGRAM, o telefone É o contato e
  deveria ser exigido. Um `superRefine` no schema resolve.
- **Severidade:** 🟠

### F4 — Não dá para cadastrar uma noiva de dentro do fluxo de agendar

- **Onde:** `pages/atendimentos/novo.tsx:447-455` (`<ComboboxNoiva>`) e
  `components/combobox-noiva.tsx` (`CommandEmpty` → "Nenhuma noiva encontrada.",
  sem ação).
- **O atrito:** o telefone toca, a noiva quer marcar para sábado, a vendedora
  abre "Agendar" e digita o nome — não existe. Ela precisa **abandonar o
  formulário** (perdendo cabine, vendedora, data e a hora que já tinha escolhido —
  não há aviso de formulário sujo, ver D14), ir a `/noivas/nova`, cadastrar,
  voltar e recomeçar.
- **Por que importa:** é o caminho de um lead novo por telefone, que é comum, e o
  sistema o pune com perda de trabalho. Note o contraste com `novo.tsx:476-525`:
  a mesma tela já resolve exatamente esse problema para a RESERVA ("Esta noiva
  ainda não tem reserva — crie agora, sem sair daqui", E65). A solução existe,
  está no mesmo arquivo, e não foi aplicada ao caso mais frequente.
- **Sugestão:** no `CommandEmpty` do combobox, oferecer "Cadastrar «{o que foi
  digitado}»" — cria o lead com nome + origem e devolve o id selecionado, no
  mesmo padrão do `criarReservaInline`. Nome e origem bastam; o resto se
  completa na ficha depois.
- **Severidade:** 🟠

### F5 — A ficha de uma noiva nova é oito cards vazios; a de uma noiva em provas é a mesma tela

- **Onde:** `pages/noivas/[leadId]/index.tsx:347-524` — os cards Casamento,
  Contato, Histórico, Orçamentos, Contratos, Portal, Lookbook e Interesses são
  renderizados incondicionalmente, cada um com a própria frase de vazio
  ("Nenhum orçamento ainda.", "Nenhum contrato ainda.", …).
- **O atrito:** o momento em que a ficha é MAIS visitada (a noiva acabou de
  entrar) é o momento em que ela tem menos a dizer. A tela usa a área nobre para
  informar oito ausências e não sugere um próximo passo.
- **Por que importa:** a vendedora aprende que a ficha "não serve para nada" e
  passa a navegar sempre pela sidebar — o que reforça F1. Uma tela de detalhe que
  não orienta vira uma tela de leitura.
- **Sugestão:** a ficha ganha uma faixa de **próximo passo** no topo, derivada da
  etapa do lead (o dado já está em `lead.etapa`): NOVO → "Agendar o primeiro
  atendimento"; EM_ATENDIMENTO → "Registrar interesses" / "Montar orçamento";
  com contrato ativo → "Ver parcelas". É uma regra pura de ~15 linhas em
  `lib/`, testável, e substitui a leitura dos oito vazios por uma decisão. Estende
  a lógica de etapa que `funil.tsx` já tem.
- **Severidade:** 🟡

---

## Jornada 2 — O dia da vendedora: ela abre o app às 9h

**Cenário:** 9h, loja abrindo. A pergunta é "o que eu faço agora?".

**Como é hoje:**

1. Login → `/loja/:lojaId/dashboard` (`pages/dashboard.tsx`). O H1 diz "Seu dia,
   {nome}" e o subtítulo "O que precisa da sua atenção agora" — a promessa está
   certa.
2. Ela vê: o alerta de caixa (se houver e se ela tiver `financeiro:ver`), quatro
   contadores (`dashboard.tsx:135-187`), dois cartões de dinheiro, o cartão da
   própria comissão, "Hoje na loja" e "Precisam de contato".
3. Para trabalhar, ela sai do dashboard: sidebar → **Atendimentos** para iniciar
   quem chegou; sidebar → **Mensagens de hoje** para a fila de WhatsApp; o sino
   para os quatro avisos.

**Passos reais:** o dashboard é uma tela de LEITURA. Das ~10 informações que ele
mostra, exatamente duas são clicáveis para um lugar onde se AGE ("Precisam de
contato" → ficha; os dois cards de dinheiro → receber/pagar). "Hoje na loja",
que é a lista mais operacional da tela, não tem uma única ação por linha.

**Onde dói:** o app tem uma tela que já responde "o que eu faço agora" melhor
que o dashboard — "Mensagens de hoje" (`pages/mensagens/index.tsx`), uma fila
pronta que se desce clicando. O dashboard não a menciona em lugar nenhum. E o
sino, que existe justamente para avisar quem não perguntou, aponta para a tela
errada quando o assunto é confirmar presença.

### F6 — O carimbo de "confirmado" é dado ao ABRIR o WhatsApp, não ao receber resposta — e não tem desfazer

- **Onde:** `pages/mensagens/index.tsx:184-190` e `pages/agenda/index.tsx:398-409`
  — o `onClick` do `<a href={wa}>` dispara `confirmarAtendimento.mutate(...)`.
  O mesmo campo é o que a noiva carimba pelo portal (E85, `replit.md:95-97`).
  Contraste com `pages/atendimentos/index.tsx:302-309`, onde o botão
  "Confirmar por WhatsApp" **não** carimba nada.
- **O atrito:** o sistema registra "presença confirmada" no instante em que a
  vendedora abre a janela do WhatsApp — antes de escrever, antes de enviar,
  antes de a noiva ler. Se ela abrir e fechar, a linha sai da fila do dia, sai da
  contagem do sino ("presenças por confirmar nas próximas 24h") e passa a contar
  como confirmada na agenda ("N já confirmadas"). **Não há nenhuma tela que
  desfaça** — varri o app inteiro por um "desconfirmar" e não existe.
- **Por que importa:** é o único número do sistema sobre o qual a loja toma uma
  decisão física (segurar a cabine, escalar a vendedora) e ele mede a coisa
  errada. Pior: como o portal usa o MESMO campo com o significado correto ("a
  noiva clicou em confirmo"), os dois sentidos ficam indistinguíveis depois de
  gravados — a gerente não consegue responder "quantas noivas de fato
  confirmaram?". E três botões com o rótulo "Confirmar" em três telas fazem
  coisas diferentes: um carimba (mensagens), outro carimba (agenda), o terceiro
  não (atendimentos).
- **Sugestão:** separar os dois fatos. `contatadoEm` (a loja mandou a mensagem,
  carimbado no clique — é isso que tira a linha da fila do dia) × `confirmadoEm`
  (a noiva respondeu/clicou no portal — é isso que a agenda deve mostrar como
  "confirmada"). Enquanto isso não vier, o mínimo é: (a) um "desfazer" na linha
  recém-confirmada, e (b) alinhar o terceiro botão para não haver duas semânticas
  com o mesmo rótulo. O rastro de ORIGEM já existe do lado do portal ("link
  público" na trilha) — falta o lado de cá.
- **Severidade:** 🔴

### F7 — O dashboard não linka para "Mensagens de hoje", que é a tela que responde a pergunta dele

- **Onde:** `pages/dashboard.tsx` inteiro (nenhuma ocorrência de `/mensagens`) ×
  `pages/mensagens/index.tsx:128-138` (a fila com a contagem total pronta).
- **O atrito:** o dashboard promete "o que precisa da sua atenção agora" e
  entrega contadores. A fila de trabalho real está a um item de sidebar de
  distância, e quem não a conhece nunca a encontra — o nome "Mensagens de hoje"
  no menu não sugere "confirmar presenças + cobrar + lembrar orçamento".
- **Por que importa:** é o recurso de maior valor por clique do produto (E69) e o
  mais escondido. A adoção dele depende de alguém ter contado à vendedora que ele
  existe.
- **Sugestão:** um cartão no topo do dashboard, acima dos contadores: "N
  mensagens prontas para enviar" com link para `/mensagens` — o número já é
  calculável com as mesmas três queries que a tela usa (e o cache do react-query
  as deduplica, como o sino já faz). Some a isso: quando `totalFila === 0`, não
  mostrar o cartão (mesma regra do `AlertaCaixa`, que fica calado quando não há
  o que dizer — `components/alerta-caixa.tsx:11-16`).
- **Severidade:** 🟠

### F8 — O sino manda para a agenda quando a fila pronta é "Mensagens de hoje"

- **Onde:** `components/sino-notificacoes.tsx:171-178` — o aviso "N presenças por
  confirmar nas próximas 24h" tem `href: ${base}/agenda` e o detalhe diz "A fila
  da agenda tem o WhatsApp pronto".
- **O atrito:** a agenda mostra o dia; a fila de confirmação dela é um bloco
  secundário abaixo da grade (`pages/agenda/index.tsx:367-422`) e só cobre o dia
  visível — enquanto o aviso fala de 24h (que atravessa dois dias) e
  `/mensagens` cobre 48h já ordenadas. O clique leva ao lugar onde a informação
  está incompleta.
- **Por que importa:** um aviso que leva ao lugar errado ensina a ignorar o
  aviso. É a diferença entre o sino ser um assistente e ser um enfeite.
- **Sugestão:** `href: ${base}/mensagens`. Uma linha. E, na mesma varredura,
  avaliar se o aviso de comissão (`sino:135-142`) não deveria apontar para a
  seção de fechamento em vez do topo de `/comissoes` (ver F27).
- **Severidade:** 🟡

### F9 — "Mensagens de hoje" está no menu sob o módulo `agenda`: quem cuida só do financeiro não a alcança

- **Onde:** `components/layout/sidebar.tsx:44` (`{ label: "Mensagens de hoje",
  href: "/mensagens", modulo: "agenda" }`) × `pages/mensagens/index.tsx:53-55`,
  onde os três blocos são gateados separadamente por `agenda`, `financeiro` e
  `leads`.
- **O atrito:** a tela foi construída para funcionar por partes — quem só tem
  `financeiro` veria só o bloco de cobrança, que é exatamente o trabalho dessa
  pessoa. Mas o item de menu exige `agenda`, então ela nunca chega lá. A tela é
  alcançável só digitando a URL.
- **Por que importa:** é uma funcionalidade inteira invisível para um perfil
  inteiro, e o próprio código da tela mostra que não era essa a intenção.
- **Sugestão:** o gate do item de menu passa a ser "tem pelo menos um dos três
  módulos". Como o `NavItem` só aceita um `modulo`, a mudança mais limpa é
  aceitar `modulos?: string[]` com semântica de OU — cabe em ~5 linhas do
  `podeVer`.
- **Severidade:** 🟠

### F10 — "Hoje na loja" é uma lista sem ações: ela vê a noiva chegar e não pode fazer nada dali

- **Onde:** `pages/dashboard.tsx:274-303` — cada `<li>` é hora + nome + badge de
  situação, sem link e sem botão.
- **O atrito:** a noiva das 10h chegou. A vendedora está no dashboard, vê a linha
  "10:00 Marina — Atendimento · Agendado", e precisa navegar até
  `/atendimentos` e reencontrar a linha lá para clicar "Iniciar atendimento".
- **Por que importa:** é a ação mais frequente do dia e a tela que a anuncia não
  a oferece. Nem sequer o nome é clicável para a ficha — o que a lista logo
  abaixo ("Precisam de contato") faz corretamente.
- **Sugestão:** linkar o nome para a ficha da noiva e, para quem tem
  `agenda:editar`, um botão "Iniciar" na linha de hoje ainda AGENDADO. A mutation
  é a mesma de `atendimentos/index.tsx:317`.
- **Severidade:** 🟡

### F11 — Uma PROVA não pode ser concluída nem marcada como falta em nenhuma tela do sistema

- **Onde:** `pages/atendimentos/index.tsx:112-115` filtra `tipo: "ATENDIMENTO"`
  na origem — provas nunca entram na fila de trabalho. `pages/provas/index.tsx`
  é só leitura (o único botão de linha é "Abrir reserva", linha 172-179).
  `pages/reservas/[bloqueioId].tsx:689` mostra a situação da prova como
  `<Badge>`, sem ação. `pages/agenda/grade.tsx:151-154` só muda cabine e horário.
  Varri o app: as únicas mutações de `situacao` estão em
  `atendimentos/index.tsx:317,329,367,379,391`, todas fora do alcance de uma
  prova.
- **O atrito:** toda prova do sistema fica em `AGENDADO` para sempre. A noiva veio
  ou não veio, provou ou não provou — o dado nunca muda.
- **Por que importa:** três consequências em cascata. (1) A fila de "Atrasados"
  de `/atendimentos` nunca mostra provas, então uma prova esquecida não aparece
  em lugar nenhum. (2) O sino conta "presenças por confirmar" sobre
  `situacao === "AGENDADO"` (`sino:161-166`) e provas antigas nunca saem desse
  estado — o contador degrada com o tempo. (3) O `atendidoEm` (E36, "quanto a
  noiva esperou") nunca é preenchido para provas, e a prova é o atendimento mais
  demorado do ateliê. A API aceita a mudança (é o mesmo `PATCH /atendimentos/:id`);
  é a tela que não a oferece.
- **Sugestão:** ou `/provas` ganha as mesmas ações de linha da fila de
  atendimentos (iniciar / concluir / faltou), ou `/atendimentos` deixa de filtrar
  por tipo e passa a ter uma aba "Provas" — a segunda é menos código e reaproveita
  o agrupamento Atrasados/Hoje/Próximos, que é bom.
- **Severidade:** 🟠

### F12 — Existem dois "agendar", com regras diferentes, e o mais acessível é o pior

- **Onde:** `pages/agenda/index.tsx:222-329` (diálogo "Novo Agendamento") ×
  `pages/atendimentos/novo.tsx` (a tela completa).
- **O atrito:** o diálogo da agenda **oferece tipo PROVA** (linha 284) mas não tem
  campo de reserva/vestido — a prova nasce sem `bloqueioId`, órfã: não aparece
  na reserva, não tem vestido em `/provas`, e não pode receber ajuste (o ajuste
  pendura no atendimento cuja reserva a tela de reserva lista). O formulário
  completo trata isso como **erro de validação obrigatório**
  (`novo.tsx:85-93`: "Escolha o vestido reservado para a prova"). O diálogo
  também fixa `vendedoraId: user!.id` (linha 163) sem perguntar, e usa
  `new Date(values.inicio)` (fuso do NAVEGADOR, linha 165) enquanto o formulário
  completo usa `instanteDoSlot` (fuso da LOJA, `novo.tsx:329`). E não tem a grade
  de slots do E64: o conflito volta como erro de API depois do clique.
- **Por que importa:** a mesma ação, dois caminhos, resultados diferentes — e o
  caminho ruim é o que está no botão primário da tela de agenda, que é o item de
  menu mais óbvio. Prova sem reserva é dado corrompido que só se descobre semanas
  depois, quando a costureira não acha o ajuste.
- **Sugestão:** o botão "Novo Agendamento" da agenda vira link para
  `/atendimentos/novo` (com `?dia=` pré-preenchido, se quiser preservar o
  contexto do dia visível). Mata ~110 linhas de formulário duplicado e uma classe
  inteira de dado inconsistente. Se o diálogo tiver de ficar, no mínimo remover a
  opção PROVA dele.
- **Severidade:** 🟠

---

## Jornada 3 — Atendimento com a noiva presente

**Cenário:** a noiva chegou às 10h. A vendedora quer: iniciar, anotar o que ela
gosta, separar os vestidos que ela provou, montar o lookbook, marcar a próxima
prova. Tudo isso com a noiva sentada esperando.

**Como é hoje:**

1. `/atendimentos` → "Iniciar atendimento" na linha dela
   (`atendimentos/index.tsx:311-320`). ✔ um clique, bom.
2. Registrar o que ela quer: sai de `/atendimentos`, vai à ficha
   (`/noivas/:leadId`), clica em "Preencher interesses" → terceira tela
   (`/noivas/:leadId/interesses`), preenche, volta.
3. Os vestidos provados: **outra** tela (`/vestidos`, 114 cards com foto, sem
   paginação — E19 da trilha E), ou o lookbook pela ficha
   (`noivas/[leadId]/lookbook.tsx`).
4. Registrar o desfecho: volta a `/atendimentos`, escolhe no select "Como
   terminou?" e "Concluir" — que abre um `AlertDialog` de confirmação.
5. Marcar a próxima prova: quarta/quinta tela (`/atendimentos/novo`), rebuscando
   a noiva (F1).

**Passos reais:** 4 a 5 telas distintas, com a noiva esperando, e o retorno a
`/atendimentos` entre cada uma. O único caminho que o sistema encurtou é o de
"Reservou → orçamento" (E61, `atendimentos/index.tsx:196-231`), que é excelente e
mostra exatamente o padrão que falta nos outros.

**Onde dói:** o atendimento é o único momento em que a noiva está presente, e é
justamente o momento em que o sistema mais faz a vendedora navegar. Tudo o que
ela registra durante o atendimento (interesses, vestidos provados, ajustes) mora
em telas que não sabem que há um atendimento em curso.

### F13 — Nada no sistema sabe que há um atendimento EM_ATENDIMENTO acontecendo agora

- **Onde:** `pages/atendimentos/index.tsx:338-384` é o único lugar que conhece o
  estado `EM_ATENDIMENTO`. `pages/noivas/[leadId]/index.tsx`,
  `pages/noivas/[leadId]/interesses.tsx`, `pages/vestidos/index.tsx` e
  `pages/noivas/[leadId]/lookbook.tsx` não consultam atendimento nenhum.
- **O atrito:** ao sair da fila para preencher interesses, a vendedora perde o
  fio: nenhuma tela mostra "você está atendendo Marina", nenhuma oferece o
  caminho de volta, e a conclusão do atendimento depende de ela lembrar de
  voltar. Um atendimento iniciado e nunca concluído fica em `EM_ATENDIMENTO`
  indefinidamente (e a fila o mostra em "Hoje" mesmo dias depois, porque o corte
  é por `inicio`, não por situação).
- **Por que importa:** é a diferença entre um app que acompanha o trabalho e um
  app onde se digita depois. Com a noiva do lado, "deixa eu voltar ali" é o
  momento em que a vendedora decide anotar num papel e lançar no fim do dia — e
  aí o `atendidoEm`, o desfecho e os interesses ou não entram, ou entram errados.
- **Sugestão (NOVO):** uma **barra de atendimento em curso** no `AppLayout`,
  visível em toda tela enquanto existir um atendimento `EM_ATENDIMENTO` da
  vendedora logada: "Atendendo Marina desde 10:07 · Interesses · Lookbook ·
  Concluir". O dado já existe (a query de atendimentos do dia já roda no
  dashboard e no sino, e o cache do react-query a deduplica); o que não existe é
  um componente que a leia fora da fila. Nenhum épico E68–E90 cobre isso: o E61
  encurtou o caminho DEPOIS do atendimento (o orçamento), e o E36 mediu o início,
  mas ninguém tratou o DURANTE.
- **Severidade:** 🟠

### F14 — Interesses e lookbook não são alcançáveis de dentro do atendimento

- **Onde:** `pages/atendimentos/index.tsx:277-282` — a linha do atendimento linka
  só para a ficha da noiva. `pages/noivas/[leadId]/interesses.tsx` e
  `pages/noivas/[leadId]/lookbook.tsx` só são alcançáveis pela ficha.
- **O atrito:** três cliques (linha → ficha → card de interesses → tela) para
  chegar ao formulário que se preenche COM a noiva falando, e mais três para
  voltar. O lookbook, que é o entregável do atendimento ("te mando as fotos dos
  que você provou"), está no mesmo lugar.
- **Por que importa:** o interesse registrado é a base das sugestões de vestido
  (`[leadId]/index.tsx:513`) e o lookbook é o que faz a noiva voltar. Os dois
  ficam a seis cliques do único momento em que a informação existe.
- **Sugestão:** na linha do atendimento `EM_ATENDIMENTO`, dois links diretos
  (Interesses / Lookbook), ao lado do select de desfecho — ou, melhor, dentro da
  barra do F13. É o mesmo movimento que o E61 já fez para o orçamento.
- **Severidade:** 🟡

### F15 — "Concluir atendimento?" pede confirmação; "Iniciar" e "Voltar para agendado" não — e o desfecho não tem correção óbvia

- **Onde:** `pages/atendimentos/index.tsx:357-374` (Concluir → `AlertDialog`),
  `:311-320` (Iniciar → direto), `:375-382` (Voltar para agendado → direto),
  `:386-395` (Reabrir → direto).
- **O atrito:** a confirmação está no lugar de menor risco. "Concluir" é
  reversível (existe "Reabrir" na linha 386-395). "Voltar para agendado", que
  **apaga o desfecho e o `atendidoEm` já medidos**, não pede nada. O padrão
  ensina a clicar "Confirmar" sem ler.
- **Por que importa:** com a noiva presente e o celular na mão (alvos de toque
  abaixo de 44px, E11 da trilha E), o diálogo extra na ação segura e a ausência
  dele na ação destrutiva é o pior arranjo possível.
- **Sugestão:** inverter. "Concluir" (reversível, e com o desfecho já escolhido
  no select ao lado) vira ação direta com toast de desfazer; "Voltar para
  agendado" e "Reabrir", que descartam medição, ganham a confirmação — dizendo o
  que se perde ("o desfecho «Reservou» e o horário de início serão apagados").
  ⚠️ não confirmado se o PATCH de fato limpa `atendidoEm`/`desfecho` ao voltar
  para AGENDADO — vale a trilha B confirmar; se não limpa, o problema inverte-se
  (dados fantasmas de um atendimento que "não aconteceu").
- **Severidade:** 🟡

---

## Jornada 4 — Orçamento → contrato → parcelas → PDF

**Cenário:** a noiva reservou. A vendedora monta o orçamento, envia, ela aceita,
vira contrato com entrada e 6 parcelas, e sai o PDF.

**Como é hoje:**

1. Orçamento nasce de um de três lugares: o toast pós-"Reservou"
   (`atendimentos/index.tsx:196-211`), o card da ficha
   (`noivas/[leadId]/index.tsx:119-135`) ou o diálogo de `/orcamentos`
   (`orcamentos/index.tsx:86-95`) — **só o terceiro pede validade**.
2. `/orcamentos/:id`: adiciona itens (do catálogo ou avulsos), aplica desconto.
3. "Link para a noiva" (`[id].tsx:501`) gera o token e copia; a API marca
   ENVIADO se estava em RASCUNHO (`api-server/src/routes/orcamentos.ts:309`).
4. A noiva abre o portal, clica "Aceitar esta proposta"
   (`noiva-portal.tsx:200-209`) → `aceitoEm` carimbado.
5. A vendedora clica "Aprovar" (com `AlertDialog`), depois "Gerar contrato".
6. **Diálogo "Gerar contrato"**: reservas a prender, CPF, forma, data do
   casamento, entrada, nº de parcelas, 1º vencimento. Submeter cria o contrato E
   as parcelas de uma vez (`[id].tsx:407-473`) e navega para `/contratos/:id`.
7. `/contratos/:id`: "Baixar PDF" (`contratos/[id].tsx:365-369`).

**Passos reais:** 2 telas + 1 modal, ~15 campos. O caminho está bem desenhado no
papel; o que dói é o que acontece quando algo sai do trilho.

**Onde dói:** o momento em que mais dinheiro está em jogo é o menos protegido —
sem preview do que vai ser criado, sem tradução de erro, sem volta.

### F16 — O diálogo "Gerar contrato" não mostra as parcelas que vai criar

- **Onde:** `pages/orcamentos/[id].tsx:936-980` (os três campos: entrada, nº de
  parcelas, 1º vencimento) — o `parcelas[]` é montado em
  `[id].tsx:426-442` e só existe depois do submit.
- **O atrito:** a noiva pergunta "e quanto fica por mês?". A vendedora digitou
  entrada 2.000 e 6 parcelas sobre um líquido de 9.480,50 — e a tela não diz
  1.246,75. Ela calcula de cabeça, ou gera o contrato para descobrir.
- **Por que importa:** o número que a noiva ouve nessa frase é o que fecha ou não
  a venda, e o sistema tem todos os dados para dizê-lo antes de gravar nada. Pior:
  o valor da última parcela é DIFERENTE das outras (o ajuste de centavos,
  `[id].tsx:438`) e ninguém vê isso até o contrato existir. A vendedora só
  descobre o carnê real na tela seguinte, quando já não há como voltar atrás sem
  cancelar o contrato.
- **Sugestão:** uma prévia ao vivo dentro do diálogo — "Entrada R$ 2.000,00 hoje ·
  6× de R$ 1.246,75 (a última de R$ 1.246,80), de 10/08 a 10/01". É a mesma
  função que já monta o array, chamada num `useMemo` e desenhada. Some-se a isso a
  correção de C1/C3 (a aritmética sobe para `financeiro-core`) e a prévia passa a
  ser a mesma conta que o servidor vai validar — o que MATA o 422 antes do clique.
- **Severidade:** 🟠

### F17 — Quando o contrato é recusado (422), a vendedora recebe a frase do servidor e o diálogo continua aberto sem saída

- **Onde:** `pages/orcamentos/[id].tsx:467-473` — o `catch` faz
  `description: err instanceof Error ? err.message : "Tente novamente."`. Não há
  dicionário de erros nessa tela. Compare com o arquivo irmão,
  `pages/contratos/[id].tsx:65-83`, que tem `MENSAGENS_ERRO` com oito códigos
  traduzidos e a função `mensagemApi`.
- **O atrito:** no caso do C1 (divergência de centavos no desconto percentual) o
  toast diz literalmente algo como "Itens menos desconto (950.48) difere do valor
  total (950.47)". A vendedora não sabe o que é isso, o diálogo continua aberto
  com tudo preenchido, e **não há nenhum ajuste na tela que resolva** — mudar
  entrada ou nº de parcelas não muda a divergência, porque ela está no líquido.
  Ela vai tentar de novo, tentar de novo, e ligar para alguém.
- **Por que importa:** é o clique que fecha a venda, com a noiva presente. Um erro
  que a pessoa não entende e não pode contornar é indistinguível de um sistema
  quebrado — e a saída real (mudar o desconto de percentual para valor fixo)
  nunca é sugerida.
- **Sugestão:** duas camadas. (1) Curto prazo: `orcamentos/[id].tsx` importa o
  `mensagemApi` que já existe em `pages/financeiro/helpers.tsx` e ganha o seu
  dicionário — com uma entrada específica para a divergência de total dizendo o
  que fazer ("o desconto percentual não fecha em centavos; troque para desconto
  em R$ ou ajuste um item em 1 centavo"). (2) Definitivo: o C1 corrigido faz o
  erro deixar de existir. As duas juntas: a tradução vale para todos os outros
  422 dessa rota que ninguém mapeou.
- **Severidade:** 🔴

### F18 — Orçamento criado pelos dois atalhos nunca tem validade — e o lembrete do E69 nunca dispara para ele

- **Onde:** `pages/atendimentos/index.tsx:198-201` e
  `pages/noivas/[leadId]/index.tsx:121-124` criam com `{ leadId }` /
  `{ leadId, atendimentoId }`, sem `validade`. Só
  `pages/orcamentos/index.tsx:95` a envia. E `pages/orcamentos/[id].tsx` **não
  tem campo de validade** — varri o arquivo, a palavra não aparece.
- **O atrito:** os dois caminhos naturais (o do momento quente do atendimento e o
  da ficha) produzem um orçamento sem prazo, e não há onde consertar depois.
- **Por que importa:** o bloco "Orçamentos vencendo — próximas 72h" de
  `pages/mensagens/index.tsx:117-126` filtra por `o.validade` — orçamento sem
  validade **nunca** aparece na fila. O lembrete que existe para impedir que a
  proposta morra em silêncio está desligado justamente para as propostas
  criadas no calor da venda. E o portal também deixa de mostrar "Proposta válida
  até…" (`noiva-portal.tsx:217`), tirando a urgência do lado dela.
- **Sugestão:** duas linhas de produto. (a) Validade **padrão** (ex.: hoje + 15
  dias, configurável) aplicada no servidor quando o cliente não a manda — assim
  todo orçamento entra na fila do E69 por construção; e (b) um campo de validade
  editável em `/orcamentos/:id`, ao lado do desconto, para a vendedora esticar o
  prazo quando a noiva pede. Estende o E69 (a fila existe e está subalimentada) e
  o E75 (a validade recomeça no envio, segundo `orcamentos.ts:285`).
- **Severidade:** 🟠

### F19 — "Aprovar" internamente antes de a noiva aceitar apaga o botão de aceite dela

- **Onde:** `pages/noiva-portal.tsx:198` — o bloco de aceite só existe quando
  `orc.status === "ENVIADO"`. `pages/orcamentos/[id].tsx:539-557` oferece
  "Aprovar" a qualquer momento em que o orçamento esteja RASCUNHO/ENVIADO, e
  "Gerar contrato" só aparece depois de APROVADO (`[id].tsx:560`).
- **O atrito:** o fluxo que o app empurra (Aprovar → Gerar contrato) fecha a porta
  do aceite digital. A noiva que abre o link depois disso vê a proposta com um
  badge "Aprovada" e nenhum botão — e o `aceitoEm`, que é a prova jurídica do
  E74 (instante + versão + hash), nunca é gravado.
- **Por que importa:** o E74 inteiro depende de a noiva clicar antes de a
  vendedora aprovar, e nada na tela da vendedora conta isso. O botão "Aprovar"
  não avisa "ela ainda não aceitou pelo link — aprovar agora dispensa o aceite
  digital". É um recurso caro que se perde por ordem de cliques.
- **Sugestão:** o `AlertDialog` de "Aprovar" já existe (linha 545-551): o texto
  dele passa a dizer o que se perde quando `!orcamento.aceitoEm` — e a tela ganha,
  ao lado do status, o estado do aceite ("aguardando o aceite da noiva" ×
  "aceito em DD/MM"). O dado já é exibido no cabeçalho (`[id].tsx:487-494`), só
  não participa da decisão.
- **Severidade:** 🟡

### F20 — Dois geradores de plano de parcelas, com capacidades diferentes, e o mais completo é o menos alcançável

- **Onde:** `pages/orcamentos/[id].tsx:426-442` (no diálogo de gerar contrato:
  entrada + nº de parcelas + 1º vencimento, sempre **mensal**, via `addMonths`)
  × `pages/contratos/[id].tsx:225-265` (`Gerar plano`: os mesmos três campos
  **mais `periodicidadeDias`**, calculado no servidor por
  `useGerarPlanoParcelas`).
- **O atrito:** quem precisa de parcelas quinzenais tem de saber que precisa
  gerar o contrato **sem parcelas** (deixando entrada e nº em branco… o que o
  diálogo não permite: `numParcelas` nasce "1" e `primeiroVencimento` é
  obrigatório) e só depois usar o gerador do contrato. Nada na tela explica isso.
  Além disso, o formulário do contrato só aparece quando `parcelas.length === 0`
  (`contratos/[id].tsx:463`) — ou seja, depois que o diálogo criou o plano, o
  gerador bom fica inacessível para sempre.
- **Por que importa:** duas implementações da mesma regra, uma no cliente (a que
  o C1 mostra estar errada em centavos) e uma no servidor (a certa). O caminho
  padrão usa a errada.
- **Sugestão:** o diálogo de gerar contrato para de montar `parcelas[]` e passa a
  chamar o mesmo `gerarPlanoParcelas` do servidor logo após criar o contrato (ou
  o servidor aceita os parâmetros do plano no POST de contrato e monta ele
  mesmo). Uma implementação, e `periodicidadeDias` fica disponível nos dois
  lugares. Fecha junto com o épico "a tela de orçamento para de calcular
  dinheiro" (C1/C3/A1).
- **Severidade:** 🟡

### F21 — Não há como mandar o contrato para a noiva: o PDF só desce no computador da loja

- **Onde:** `pages/contratos/[id].tsx:365-369` — "Baixar PDF" é um `<a download>`.
  A tela de contrato não tem link de WhatsApp, não tem link do portal, e o portal
  (`pages/noiva-portal.tsx`) mostra a **proposta**, nunca o contrato.
- **O atrito:** a noiva pede "me manda o contrato". A vendedora baixa o PDF,
  troca para o WhatsApp Web ou o celular, procura a conversa, anexa o arquivo.
  Depois, quando a noiva perde o arquivo (e ela perde), tudo de novo.
- **Por que importa:** o contrato assinado é o documento que a noiva mais vai
  querer rever, e é o único artefato do sistema que não tem caminho até ela. O
  portal foi construído exatamente para isso e não o inclui.
- **Sugestão (NOVO, estende E78):** a seção "Seu contrato" no portal — os itens
  contratados (o snapshot já existe em `contrato.itens`), o valor, e o link do
  PDF servido pelo mesmo token do portal. Enquanto isso não vier, o barato: o
  botão "Enviar por WhatsApp" na tela do contrato, com uma mensagem que já leva o
  link do portal (a régua `lib/portal.ts` e `linkWhatsApp` já existem e são usadas
  em quatro telas).
- **Severidade:** 🟡

---

## Jornada 5 — A prova e o ajuste

**Cenário:** a prova de sábado. Confirmar, receber a noiva, anotar "bainha 3cm",
a costureira executar, o vestido sair e voltar, e a mancha virar cobrança.

**Como é hoje:**

1. Agendar: `/atendimentos/novo` com tipo PROVA + reserva (ou o atalho "Agendar
   prova" do detalhe da reserva, `reservas/[bloqueioId].tsx:660-667`).
2. Confirmar: `/mensagens` ou a agenda (ver F6).
3. No dia: **nenhuma tela move a prova de AGENDADO** (F11).
4. Registrar o ajuste: `/reservas/:bloqueioId`, campo "Novo ajuste" dentro do
   card da prova (`[bloqueioId].tsx:816-840`), e o checklist item a item.
5. A costureira: `/ajustes`, recorte "Esta semana", marca as peças e "Marcar
   feito" (`ajustes/index.tsx:301-310`).
6. Retirada e devolução: `/reservas/:bloqueioId`, seção Movimentação — **com
   desfazer** (`[bloqueioId].tsx:240-256`), que é o padrão certo.
7. Avaria: descrição + custo + foto; "Cobrar reparo" vira parcela avulsa do
   contrato ativo, vencendo em 7 dias (`[bloqueioId].tsx:159-177`).

**Onde dói:** o ciclo físico do vestido é a parte mais bem resolvida do sistema —
movimentação com desfazer, avaria com foto, checklist interativo na fila da
costureira. Os buracos são de reversibilidade e de rastro no dinheiro.

### F22 — "Cobrar reparo" pode ser clicado duas vezes e cria duas parcelas, sem confirmação e sem marca

- **Onde:** `pages/reservas/[bloqueioId].tsx:577-587` — o botão continua visível
  depois do sucesso; `cobrarReparo` (linha 159-177) chama
  `createParcelaAvulsa` sem checar se já existe cobrança para aquela avaria, e a
  avaria não guarda referência à parcela criada.
- **O atrito:** dois cliques (ou um clique e uma dúvida "será que salvou?") viram
  duas parcelas de "Reparo de avaria — mancha na barra" no carnê da noiva. A tela
  não muda de estado, então nada indica que a primeira funcionou.
- **Por que importa:** é cobrança em cima de uma noiva, gerada em duplicidade,
  descoberta por ela. E a única forma de desfazer é ir ao contrato e "Remover
  parcela" — que a tela avisa que **não pode ser desfeito**
  (`contratos/[id].tsx:693`). Um clique acidental de um lado, uma ação
  irreversível do outro.
- **Sugestão:** a avaria guarda `parcelaId` (ou a rota recusa a segunda com
  409 idempotente). Na tela: depois de cobrar, o botão vira o texto "Cobrado —
  ver parcela" com link para o contrato. E uma confirmação antes, dizendo o
  valor e o vencimento que vão nascer ("R$ 180,00 vencendo em 01/08").
- **Severidade:** 🟠

### F23 — A avaria é apagada sem confirmação — e a cobrança que ela gerou fica órfã

- **Onde:** `pages/reservas/[bloqueioId].tsx:588-608` — o `X` chama
  `deleteAvaria` direto, sem `AlertDialog`. Note o contraste: **na mesma tela**,
  remover um ajuste tem confirmação (`[bloqueioId].tsx:851-868`), e remover um
  item de checklist não tem.
- **O atrito:** um toque errado no ícone de 28px (E11 da trilha E mediu os alvos)
  apaga a descrição, o custo e a **foto-evidência** da avaria. Não há desfazer.
- **Por que importa:** a foto da avaria é a prova que sustenta a cobrança em uma
  discussão com a noiva. Apagá-la é perder a justificativa e manter a dívida — a
  parcela criada continua no carnê. É a assimetria mais perigosa da tela: a
  evidência é frágil e a cobrança é dura.
- **Sugestão:** confirmação com o texto do que se perde ("a foto também sai") e,
  se já houver parcela vinculada (F22), recusar a remoção ou oferecer cancelar a
  parcela junto. Um "desfazer" de 10s no toast resolveria os dois casos com menos
  código do que um diálogo.
- **Severidade:** 🟠

### F24 — Na fila da costureira, "Marcar feito" faz o ajuste sumir e não há como reabrir dali

- **Onde:** `pages/ajustes/index.tsx:72` (`filter(a => a.status === "PENDENTE")`,
  sem alternativa na tela) e `:301-310` ("Marcar feito", sem confirmação e sem
  desfazer). O "Reabrir" existe — mas só em
  `pages/reservas/[bloqueioId].tsx:719-726`, que a costureira alcança pelo botão
  "Abrir" da linha (`ajustes/index.tsx:294-300`), sem saber que é lá.
- **O atrito:** clicou errado (as linhas são densas e os botões vizinhos), o
  ajuste desaparece da tela e não há "ver concluídos" para achá-lo. A pessoa
  precisa saber que o caminho de volta é "Abrir" → a reserva → o card da prova →
  "Reabrir".
- **Por que importa:** é a única fila do sistema sem lente para o estado oposto —
  `/atendimentos` tem "Ver atendimentos anteriores", `/provas` tem "Ver provas
  anteriores", `/orcamentos` e `/receber` têm filtros. A fila da costureira, que
  é operada às pressas e no celular, é a que perde a informação.
- **Sugestão:** um terceiro botão no seletor de recorte que já existe (`Esta
  semana` / `Todos` → + `Concluídos`), com "Reabrir" na linha. É o mesmo padrão
  das telas irmãs, e o dado já vem na mesma query (o filtro é client-side).
- **Severidade:** 🟡

### F25 — Registrar a devolução não pergunta pelas avarias, que é o único momento em que alguém olha o vestido

- **Onde:** `pages/reservas/[bloqueioId].tsx:490-495` ("Registrar devolução") e a
  seção de avarias logo abaixo (`:542-653`) — duas seções independentes na mesma
  página, sem nenhuma ligação.
- **O atrito:** a devolução é o instante em que a peça está na mão de alguém.
  Depois que a data é registrada, a tela só diz "A jornada desta noiva está
  encerrada" (linha 449-451) e nada convida a conferir o vestido.
- **Por que importa:** a avaria não registrada na devolução nunca mais é
  registrada — e o E71 (avaria vira parcela cobrável) depende inteiramente de
  alguém lembrar. A régua do produto está certa; falta o gatilho.
- **Sugestão:** ao registrar a devolução, o toast ou um passo seguinte pergunta
  "O vestido voltou como saiu?" com duas saídas: "Sim, tudo certo" (fecha) e
  "Registrar avaria" (rola até o formulário, já aberto). Custa um estado local; é
  o mesmo movimento do toast "Reservou → abrir orçamento" do E61, que funciona.
- **Severidade:** 🟡

---

## Jornada 6 — Cobrança: a parcela venceu

**Cenário:** a parcela de 15/07 não entrou. Como a loja descobre, o que faz, e o
que fica registrado.

**Como é hoje — três caminhos, e eles não se conhecem:**

- **A.** `/mensagens` → bloco "Lembrar de um valor em aberto" → clique no
  WhatsApp. **Nenhum rastro é gravado.**
- **B.** `/financeiro/cobranca` → faixas de atraso → a linha da noiva → WhatsApp
  + o collapsible "Histórico" com "Registrar contato"
  (`cobranca.tsx:141-143` + `components/historico-contato.tsx`). Rastro **se** a
  pessoa abrir o collapsible e preencher.
- **C.** `/financeiro/receber` → filtro "Atrasadas" → a linha diz "Entrada ·
  vence 16/07 · R$ 1.000,00 · contrato" — **sem o nome da noiva** (E3 da trilha
  E) e sem WhatsApp. Dali só se chega ao contrato, e do contrato não há volta
  para a ficha nem para o WhatsApp.

**Onde dói:** o rastro depende de qual das três telas a pessoa abriu, e a mais
rápida (a fila do dia) é a que não registra nada.

### F26 — A cobrança pelo caminho rápido não deixa rastro; a mesma cobrança pelo caminho lento deixa

- **Onde:** `pages/mensagens/index.tsx:250-256` (o `<a>` do WhatsApp, sem
  mutation) × `pages/financeiro/cobranca.tsx:116-143` (o mesmo WhatsApp, com o
  `HistoricoContato` ao lado). O `POST /registros-cobranca` só é chamado pelo
  componente, e o componente só existe em duas telas
  (`cobranca.tsx` e `noivas/[leadId]/index.tsx:416`).
- **O atrito:** a vendedora desce a fila de "Mensagens de hoje" clicando — que é
  exatamente o comportamento que a tela pede ("Desça a fila clicando") — e o
  sistema não guarda que ela cobrou ninguém. Amanhã a mesma noiva reaparece na
  fila igual, e a gerente que abrir a ficha vê "Nenhum contato registrado ainda".
- **Por que importa:** três efeitos. (1) A gerente não consegue responder "essa
  noiva foi cobrada?" — o que é a pergunta da conversa difícil. (2) O relógio do
  "parado há N dias" do funil (E27) não zera, então a noiva também vira alerta de
  lead frio no sino, indevidamente. (3) A vendedora não tem como provar o
  trabalho que fez. Note que a arquitetura já tomou o cuidado certo do outro lado
  — a autoria vem da SESSÃO (`replit.md:74-78`) —; o que falta é o registro
  acontecer.
- **Sugestão:** o clique no WhatsApp de `/mensagens` grava um registro
  automático `canal: "WHATSAPP"`, observação "mensagem de cobrança enviada pela
  fila do dia" — o mesmo padrão do carimbo de confirmação (que já existe na
  linha 184), mas aqui o carimbo é honesto, porque registra o ATO da loja e não
  uma resposta da noiva. Complemento barato: uma marca na própria linha ("cobrada
  há 2 dias") para a fila não repetir cegamente.
- **Severidade:** 🟠

### F27 — Da cobrança não se chega à noiva, e do contrato não se volta

- **Onde:** `pages/financeiro/cobranca.tsx:124-126` — o único link da linha é
  `/contratos/{contratoId}`. `pages/financeiro/receber.tsx:337-339` — idem, e
  sem nome. `pages/contratos/[id].tsx:347-355` — o H1 linka para a ficha da
  noiva **quando `noivaNome` existe**, e não há nenhum breadcrumb ou "voltar".
- **O atrito:** a jornada "vi uma parcela atrasada → quero saber quem é e falar
  com ela" tem quatro paradas, e em `/receber` a primeira parada já é cega. Para
  descobrir de quem é a parcela, é preciso abrir o contrato (perdendo a lista e o
  filtro de janela) e voltar pelo botão do navegador.
- **Por que importa:** é a operação diária de quem cobra. A trilha E mediu a face
  visual disto (E3, E9); o custo de fluxo é ter de manter duas abas para
  atravessar quatro telas.
- **Sugestão:** (1) `/receber` mostra o nome da noiva na linha — o CSV já o tem
  (`receber.tsx:253`) e o GET de parcelas embute o lead
  (`cobranca.tsx:161-163` documenta isso). (2) A linha da cobrança ganha o link
  para a ficha ao lado do link do contrato. (3) O melhor de todos, e o mais
  barato: `/receber` e `/cobranca` apontam para `/mensagens` quando o assunto é
  falar com a noiva, em vez de cada uma tentar ser a fila.
- **Severidade:** 🟠

### F28 — Só três telas cobram, e nenhuma delas dá para receber o dinheiro que a noiva acabou de mandar

- **Onde:** `pages/financeiro/cobranca.tsx` não importa `useReceberParcela` —
  a tela de cobrar não recebe. O recebimento existe em
  `pages/financeiro/receber.tsx:389-443` e em `pages/contratos/[id].tsx:634-681`.
- **O atrito:** a sequência real é: cobro pelo WhatsApp → a noiva manda o
  comprovante do Pix na hora → preciso baixar a parcela. Da tela de cobrança,
  isso é: sair, abrir `/financeiro/receber`, ajustar a janela de datas (que
  começa no mês corrente, e a parcela vencida pode estar fora dela), achar a
  linha sem nome, clicar receber.
- **Por que importa:** o intervalo entre cobrar e receber é de segundos, e o
  sistema o transforma em quatro telas. O resultado previsível é a baixa lançada
  "depois", o que é a origem de metade dos problemas de caixa do dia (o
  `recebidoEm` grava o instante do lançamento — `receber.tsx:190-191` — e um
  lançamento das 21h30 cai no dia seguinte no UTC, exatamente o gotcha do
  `replit.md:69-72`).
- **Sugestão:** um botão "Receber" na linha da cobrança, abrindo o mesmo diálogo
  de `receber.tsx` (ele já é autocontido: valor sugerido = saldo, data, forma).
  Se a noiva tem várias parcelas vencidas, o diálogo lista as parcelas dela — que
  é informação que o `agingDeParcelas` já calcula e a tela hoje resume em
  "N parcelas".
- **Severidade:** 🟡

### F29 — A janela padrão de "Contas a receber" esconde o atraso antigo, e o filtro "Atrasadas" mente dentro dela

- **Onde:** `pages/financeiro/receber.tsx:98` (`resolverIntervalo` sem params →
  mês corrente) + `:112-118` (a query manda `de`/`ate` ao servidor) + `:155`
  (o filtro "Atrasadas" roda **sobre a janela**).
- **O atrito:** a tela abre em julho. Uma parcela vencida em março não está na
  janela, então clicar "Atrasadas" mostra só os atrasos de julho — e o cartão
  "Em atraso" soma só esses. Nada na tela diz que existe atraso fora da janela.
- **Por que importa:** "Atrasadas" é uma pergunta sobre o passado inteiro, não
  sobre um mês. Quem confia nesse número subestima a inadimplência, e o número
  não denuncia a omissão (é a mesma classe de erro do E1: um valor errado com
  cara de certo). A tela de cobrança acerta — ela pede `status: "abertas"` sem
  janela (`cobranca.tsx:167-173`) — o que confirma que a régua certa já existe no
  produto.
- **Sugestão:** quando o filtro for "Atrasadas", ignorar a janela (ou estendê-la
  para trás automaticamente) — e, no mínimo, mostrar "há R$ X em atraso fora
  desta janela · ver tudo". ⚠️ não confirmado se `listParcelas` aceita `status` e
  janela ao mesmo tempo; se não, é uma linha de `openapi.yaml`.
- **Severidade:** 🟠

---

## Jornada 7 — Fechar o dia / o mês (a gerente)

**Cenário A (o dia):** 19h, loja fechando. "Bateu o caixa?"
**Cenário B (o mês):** dia 1º. DRE, projeção, comissão, folha, recorrências,
export contábil.

**Como é hoje:**

- **O dia:** não existe. `/financeiro` é o fluxo realizado, e a própria tela diz
  "Leitura pura: nenhuma ação daqui muda dado" (`fluxo.tsx:24-33`). O que mais
  se parece com conferir o caixa é o diálogo "Conferir saldo" — que mora dentro
  de `/financeiro/projecao` (`projecao.tsx:229-238`), uma tela cujo nome não
  sugere isso.
- **O mês:** `/financeiro` → `/financeiro/dre` (competência) → `/financeiro/
  projecao` → `/comissoes` (preview → "Fechar competência") → `/financeiro/pagar`
  → link "Folha do mês" (`pagar.tsx:417`) → `/financeiro/folha` (gerar
  recorrências, baixar CSV, marcar enviado) → `/financeiro/conciliacao` (subir o
  OFX) → `/financeiro/auditoria` se algo não bater.

**Passos reais:** oito telas, sem ordem declarada, e a mais crítica delas
(Folha/Recorrências, onde nasce a folha inteira e o fechamento contábil) **não
está na sidebar nem na barra de links do hub financeiro** — chega-se a ela só
por um link dentro de "Contas a pagar".

**Onde dói:** o financeiro é um conjunto de lentes muito bem construídas, sem um
roteiro. Quem sabe o roteiro trabalha bem; quem não sabe nunca descobre que
metade das telas existe.

### F30 — Não existe "fechar o caixa do dia", e a ação mais parecida está escondida numa tela chamada Projeção

- **Onde:** `pages/financeiro/fluxo.tsx:24-33` (hub, só leitura),
  `pages/financeiro/projecao.tsx:60,229-238` ("Conferir saldo", gate
  `financeiro:criar`), `lib/financeiro/saldo.ts` (`ancoraAtiva`,
  `validarConferencia`). O sino e o `AlertaCaixa` dependem de haver âncora
  (`components/alerta-caixa.tsx:35`: `if (!data?.ancorado ...) return null`).
- **O atrito:** a conferência de saldo é o gesto que ancora TODA a projeção — e
  sem ela o alerta de caixa (o aviso mais grave do sistema, o primeiro item do
  sino) simplesmente não aparece, em silêncio. Quem não sabe que precisa conferir
  nunca é avisado de que o caixa vai furar, e nada na tela explica a relação.
- **Por que importa:** um sistema de alarme que se desliga sozinho quando a
  rotina diária não é feita, sem dizer que está desligado. E a rotina diária não
  tem tela: ela é um botão dentro de uma lente de previsão.
- **Sugestão (NOVO, estende E46):** duas coisas. (1) Quando não há âncora, o
  `AlertaCaixa` **fala** em vez de calar — um aviso neutro no hub: "A projeção
  está sem nível: confira o saldo do caixa para o alerta voltar a valer" com o
  link. Hoje a decisão de "nada a dizer é nada na tela" é a certa para o alarme,
  mas errada para a ausência de dado. (2) "Fechar o dia" como uma rotina curta no
  hub financeiro: as entradas de hoje por meio (o `porMeio` já existe,
  `fluxo.tsx:99-110`), as saídas de hoje e o campo de saldo conferido — três
  números e um botão, uma vez por dia.
- **Severidade:** 🟠

### F31 — Recorrências/Folha, a tela onde nasce a folha e o fechamento contábil, não está em nenhum menu

- **Onde:** `components/layout/sidebar.tsx:56-71` (o grupo Comercial tem
  Orçamentos, Contratos, Financeiro, Comissões, Minha comissão — não há Folha) e
  `pages/financeiro/fluxo.tsx:160-176` (a barra de links do hub tem projeção,
  DRE, cobrança, auditoria, conciliação — não tem folha). A única porta é
  `pages/financeiro/pagar.tsx:417`.
- **O atrito:** para chegar em "gerar a competência" e "marcar como enviado à
  contabilidade" é preciso passar por "Contas a pagar" e reparar num botão
  secundário. Ninguém adivinha isso.
- **Por que importa:** é a tela do mês inteiro: os salários, as despesas fixas e
  o fechamento com o contador. Uma competência não gerada é silêncio — as contas
  simplesmente não existem, e nada avisa (compare com o sino, que avisa a
  comissão esquecida: `sino-notificacoes.tsx:135-142`; a folha esquecida não tem
  aviso equivalente).
- **Sugestão:** duas linhas — a folha entra na barra de links do hub financeiro
  e o sino ganha o aviso "competência N sem recorrências geradas" com a mesma
  régua da pendência de comissão. E o nome: o H1 diz "Recorrências do mês" e o
  link que leva a ela diz "Folha do mês" — quem procura "folha" no menu não acha,
  e quem acha lê outro nome.
- **Severidade:** 🟠

### F32 — A conciliação não guarda nada: todo mês se refaz o mesmo trabalho, e "o que já bateu" não existe

- **Onde:** `pages/financeiro/conciliacao.tsx` — varri o arquivo: **nenhuma
  mutation, nenhum `localStorage`**. O extrato é lido no navegador
  (`parseExtrato`/`conciliarExtrato` do `financeiro-core`) e o resultado vive só
  enquanto a aba estiver aberta.
- **O atrito:** a dona sobe o OFX, vê "3 no banco e não no sistema" e vai
  lançá-los. Volta para conciliar de novo — precisa subir o arquivo outra vez. No
  mês seguinte, sobe o extrato inteiro e reencontra as mesmas divergências
  antigas, que já foram resolvidas ou perdoadas, sem nenhuma marca.
- **Por que importa:** conciliação é um processo com memória por natureza ("essa
  diferença de R$ 12 é a tarifa, já resolvi"). Sem memória, ela vira uma
  fotografia bonita que ninguém usa duas vezes — e o E70 tirou o trabalho da
  planilha sem lhe dar a coisa que a planilha tinha: persistência.
- **Sugestão:** o mínimo viável é marcar o movimento do sistema como
  `conciliadoEm` quando ele casa (uma coluna, um PATCH em lote) — o que já
  permite o filtro "só o não conciliado" e faz a segunda passada custar quase
  nada. O passo seguinte, se valer, é registrar as divergências perdoadas com
  motivo. **NOVO** — nenhum épico E68–E90 fala em persistir a conciliação.
- **Severidade:** 🟡

### F33 — Cancelar um contrato com "estornar" reescreve um mês já enviado à contabilidade, e nada avisa

- **Onde:** `pages/contratos/[id].tsx:593-631` — o diálogo oferece "Devolvi o
  valor — estorna do caixa" sem nenhuma checagem de período. O fechamento
  contábil existe e é explícito (`pages/financeiro/folha.tsx:338-364`,
  `enviadoContabilidadeEm` por pagamento).
- **O atrito:** a gerente cancela em agosto um contrato cujo sinal entrou em
  junho, escolhe "estornar", e o caixa realizado de junho muda — depois de junho
  ter sido fechado e mandado ao contador. Ela não é avisada e provavelmente não
  percebe.
- **Por que importa:** é a única ação da interface que altera um número de um
  período fechado. O sistema tem a informação para avisar (a data do recebimento
  e o carimbo de envio) e não a usa. O ângulo de dados é do B3/B-backend; o meu é
  que a tela apresenta a escolha como se as duas opções fossem simétricas — e
  uma delas reescreve o passado.
- **Sugestão:** o diálogo lista o que vai ser estornado com as datas ("R$ 2.000
  recebidos em 12/06 — junho já foi enviado à contabilidade em 03/07") e pede
  uma confirmação a mais nesse caso. A mesma informação torna a decisão
  consciente sem travar nada.
- **Severidade:** 🟠

### F34 — O export contábil é dois arquivos, em duas telas, com semânticas diferentes — e só um deles carimba

- **Onde:** saídas: `pages/financeiro/folha.tsx:754` (CSV de pagamentos do
  período) + `onEnviarContabilidade` (`folha.tsx:338-364`) que marca
  `enviadoContabilidadeEm`. Entradas: `pages/financeiro/receber.tsx:254-264`
  (`getExportarParcelasUrl`, CSV das parcelas da janela) — **sem carimbo
  nenhum**. E ainda um terceiro, `fluxo.tsx:210-223`, que exporta a linha do
  tempo do período (entradas E saídas).
- **O atrito:** "mandar o mês para o contador" é: ir à folha, escolher o
  intervalo, baixar, marcar enviado; depois ir a receber, escolher o intervalo
  DE NOVO (os dois usam `resolverIntervalo` mas em telas com estado separado),
  baixar; e torcer para que as duas janelas sejam a mesma. Nada reconcilia os
  dois arquivos, e não há como saber se as entradas de junho já foram mandadas.
- **Por que importa:** é o fechamento do mês, feito por uma pessoa, com uma data
  limite. Três exports parciais em três telas é o desenho que produz o erro de
  "mandei o mesmo mês duas vezes" ou "esqueci as entradas".
- **Sugestão:** um "Fechar o mês" único (pode ser uma seção da folha, que já tem
  o conceito de envio): escolhe a competência, mostra os dois lados com os
  totais, baixa UM pacote e carimba os dois. Estende o que a folha já faz certo
  (as duas ações separadas — baixar e declarar — são a decisão correta e devem
  ficar).
- **Severidade:** 🟡

---

## Jornada 8 — A noiva no portal

**Cenário:** ela recebe `moscownoivas.../noiva/<token>` no WhatsApp, abre no
celular, provavelmente à noite.

**Como é hoje:** `pages/noiva-portal.tsx` mostra, condicionalmente: a proposta
(com "Aceitar", se `status === "ENVIADO"`), as próximas provas (com "Confirmar
presença"), o lookbook e o extrato de parcelas. Duas ações no total, e o rodapé
diz duas vezes "fale com a sua vendedora no WhatsApp"
(`noiva-portal.tsx:258-261, 358-361, 365-367`).

**Onde dói:** o portal é bonito e correto, e responde menos perguntas do que
poderia com o dado que já tem na mão. Cada pergunta que ele não responde volta
como mensagem no WhatsApp da vendedora — que é exatamente o custo que o E78
existia para reduzir.

### F35 — O portal manda falar com a vendedora e não tem um link para falar com a vendedora

- **Onde:** `pages/noiva-portal.tsx:258-261, 358-361, 365-367` (três frases
  "fale/responda à sua vendedora"). O payload traz só `lojaNome`
  (`api-server/src/routes/portal.ts:53,148-149`) — **sem telefone, sem endereço**.
- **O atrito:** a noiva está no navegador, à noite, com uma dúvida sobre a
  parcela. Precisa sair, abrir o WhatsApp, e achar a conversa — que pode ser de
  três meses atrás, ou de uma vendedora que saiu.
- **Por que importa:** é a fricção que decide se ela pergunta agora (e a loja
  responde amanhã cedo) ou se ela desiste e liga no meio do atendimento de
  outra noiva. Um `wa.me` no rodapé custa um campo no payload — e o endereço da
  loja já está na sessão do lado de dentro (`session.lojas[].endereco`, usado em
  `msgConfirmacaoAtendimento`), então o dado existe.
- **Sugestão:** um rodapé com o nome da loja, o endereço e um botão "Falar no
  WhatsApp" (`wa.me` do telefone da loja, com um texto inicial que já identifica
  a noiva: "Oi, aqui é a Marina"). Se a loja não tem telefone cadastrado, o
  rodapé some — mesma regra do `AlertaCaixa`.
- **Severidade:** 🟠

### F36 — O extrato mostra as parcelas e não responde "quanto eu ainda devo" nem "quando é a próxima"

- **Onde:** `pages/noiva-portal.tsx:321-363` — uma lista de linhas
  (`descrição · vence em … · status · valor`), sem nenhum total.
- **O atrito:** para saber o saldo, a noiva soma de cabeça as linhas não pagas de
  um carnê de 8 parcelas, no celular. É a pergunta número 1 dela, e a resposta
  está a uma soma de distância.
- **Por que importa:** "quanto falta?" e "quando vence a próxima?" são as duas
  mensagens de WhatsApp mais previsíveis do ateliê. O portal tem os dados e não
  as responde — e a mensagem de cobrança do E84 já leva o link do portal, ou
  seja, a noiva é mandada para uma página que não fecha a conta.
- **Sugestão:** duas linhas acima da lista: "Falta pagar R$ X" e "Próxima: R$ Y
  em DD/MM". Uma soma e um `find`, com os mesmos utilitários de centavos do
  `financeiro-core`. Estende o E78 e desarma parte do E84.
- **Severidade:** 🟠

### F37 — Confirmar a presença é a única ação da noiva; remarcar, que é o que ela realmente faz, não existe

- **Onde:** `pages/noiva-portal.tsx:242-253` (o único botão) e `:258-261`
  ("Precisa remarcar? É só avisar a sua vendedora no WhatsApp").
- **O atrito:** ninguém abre um link para dizer "vou". Abre-se para dizer "não
  vou poder" ou "dá para mudar?". A ação que existe é a que a loja quer; a que a
  noiva quer não está lá — e é justamente a que economizaria a cabine.
- **Por que importa:** a prova é o recurso mais caro do ateliê (cabine +
  vendedora + vestido reservado). Uma noiva que avisa às 20h da véspera devolve
  um horário inteiro para a loja; uma que não consegue avisar vira "Faltou". E
  o sistema já sabe o que está livre — `agenda-core/slotsOferecidos`, o mesmo
  motor do E64 que desenha a grade em `atendimentos/novo.tsx:280-290`.
- **Sugestão (NOVO, estende E85):** "Não vou poder ir" como segundo botão, que
  cria um pedido de remarcação (não remarca sozinho): a prova é marcada como
  "a remarcar" e a vendedora recebe a linha na fila do dia. Um passo além, se
  valer: oferecer 3 horários livres na mesma semana para ela escolher, e a
  vendedora só confirma. Nenhum épico cobre isso — o E85 deu à noiva o "sim" e
  não o "não".
- **Severidade:** 🟠

### F38 — O portal expira em 30 dias e ninguém do lado de dentro fica sabendo

- **Onde:** `pages/noivas/[leadId]/portal.tsx:66-67` (`vivo`/`expirado`, visível
  só quem abre a ficha), `lib/portal.ts` (`portalVivo` filtra os mortos) e
  `pages/mensagens/index.tsx:94` — quando o portal morre, `portalUrls.get()`
  devolve `undefined` e a mensagem sai **sem o link, em silêncio**.
- **O atrito:** o noivado dura um ano; o link dura 30 dias. A noiva volta ao
  favorito em setembro e lê "Este link expirou. Peça um novo para a sua
  vendedora" (`noiva-portal.tsx:27`) — que é mais uma mensagem de WhatsApp. Do
  lado de dentro, nada avisa: o sino não tem esse aviso, a fila de mensagens
  degrada sem reclamar, e o "Expirado" só aparece para quem abrir aquela ficha.
- **Por que importa:** o E78 e o E84 dependem do portal estar vivo, e o sistema
  não tem nenhum mecanismo para mantê-lo vivo. O TTL de 30 dias é a decisão de
  segurança certa (`replit.md:154-157`); o que falta é a renovação ser
  automática do lado de quem opera.
- **Sugestão:** renovar o TTL a cada acesso da noiva (o `ultimoAcessoEm` já é
  gravado — `portal.tsx:137`), o que mantém vivo o link de quem usa e deixa
  morrer o de quem parou; e/ou regenerar sozinho quando uma mensagem do E84 vai
  sair e o portal está morto. No mínimo, um aviso no sino: "N noivas ativas com
  portal expirado".
- **Severidade:** 🟡

### F39 — O contrato e as datas da noiva não estão no portal

- **Onde:** `pages/noiva-portal.tsx` — não há seção de contrato (ver F21), não
  há a data do casamento dela, não há o endereço da loja, não há "o que falta
  fazer" (medidas, ajustes pendentes, data de retirada do vestido — todos dados
  que o sistema tem em `bloqueios` e `ajustes`).
- **O atrito:** "que dia eu pego o vestido?" e "quando é a próxima prova depois
  dessa?" são perguntas que a noiva faz repetidamente, e o sistema sabe as
  respostas (`reserva.retiradaDataReal`/`ocupacaoInicio`,
  `ajuste.proximaProva`).
- **Por que importa:** o valor do portal cresce com o número de perguntas que
  ele responde sozinho; hoje ele cobre a fase comercial e para. As duas fases
  mais ansiosas da noiva (os ajustes e a retirada) não aparecem.
- **Sugestão:** uma seção "O seu vestido" com o vestido reservado, os ajustes em
  andamento (só descrição e "pronto/em andamento" — não o checklist interno) e a
  data prevista de retirada. Estende o E78 sem tocar em nada de dinheiro.
- **Severidade:** 🔵

---

## Jornada 9 — Administração e a loja nova

**Cenário A:** convidar uma vendedora e dar permissão.
**Cenário B:** uma loja nova é criada. Ninguém abriu o sistema ainda.

**Como é hoje (A):**

1. `/equipe` → dois caminhos concorrentes no mesmo lugar: "cadastrar membro" com
   senha escolhida pelo admin (`equipe/index.tsx:147`) **ou** criar convite com
   link (`:150-152`, `:166-181`).
2. O convite gera um token; o admin **copia e cola no WhatsApp** (o toast diz
   isso, `:158`). Não há e-mail.
3. Permissão: `/permissoes` → matriz módulo × ação por PERFIL (não por pessoa),
   com override por loja.

**Como é hoje (B):** loja nova = tudo zero. O tour (`components/tour-acesso.tsx`)
dispara uma vez por usuário × loja e lista os módulos liberados — mas ele
responde "o que você pode fazer", não "o que falta configurar".

**Onde dói:** a administração é competente e a configuração é um labirinto — a
tela chamada "Configurações" é a única do sistema que não configura nada.

### F40 — "Configurações" só mostra: cabines, horário e atributos se editam em outras telas, e ela não linka para nenhuma

- **Onde:** `pages/configuracoes/index.tsx:94-165` — os cards "Atributos de
  Vestido", "Disponibilidade e Regras" e "Cabines" são **listas somente-leitura**
  (`Badge` de ativo/inativo e nada mais). A edição vive em `/catalogo` e em
  `/atendimentos/config`. Confirmei por varredura: o arquivo **não contém
  nenhum link** para `/catalogo` nem para `/atendimentos/config`.
- **O atrito:** o admin vai a Configurações (o nome certo, o lugar óbvio), lê
  "Nenhuma cabine configurada" e não tem para onde clicar. O caminho real é
  Atendimentos → Agendar → botão "Cabines & horário" — três telas adiante, num
  módulo que não parece ter a ver com configurar.
- **Por que importa:** é o primeiro obstáculo de uma loja nova e ele é um beco
  com o nome certo. Sem cabine não se agenda nada — `/atendimentos/novo:399-406`
  bloqueia o formulário inteiro (e, para o seu crédito, com um link; é a única
  tela que ajuda).
- **Sugestão:** cada card de Configurações ganha um "Editar →" para a tela que de
  fato edita. Barato, e transforma um beco na porta que o nome promete. A médio
  prazo, mover as edições para cá e deixar `/atendimentos/config` como redirect.
- **Severidade:** 🟠

### F41 — Uma loja nova não tem roteiro: nada diz o que precisa existir para o sistema funcionar

- **Onde:** `pages/dashboard.tsx:135-187` numa loja vazia mostra quatro zeros;
  `components/tour-acesso.tsx:108-125` dispara uma vez e fala de permissões, não
  de configuração; os estados vazios são bons **por tela**
  (`noivas/index.tsx:193-206` é o melhor do app: título, explicação e o botão do
  próximo passo) mas nenhum deles sabe da ordem entre eles.
- **O atrito:** a ordem real é: cabines + horário → atributos de vestido →
  vestidos → escada de comissão → recorrências (salários) → primeira noiva.
  Pular a escada de comissão faz `minhaComissao.temRegra` voltar `false` e o
  cartão do dashboard simplesmente não aparecer (`dashboard.tsx:226`) — sem erro,
  sem explicação. Pular as recorrências faz a folha não existir. Nada disso é
  descobrível.
- **Por que importa:** o dono de uma loja nova (ou a rede abrindo a segunda
  unidade, que é o caso do E76) passa o primeiro dia caçando telas, e o que ele
  não configurar vira funcionalidade que "não funciona" em silêncio meses depois.
- **Sugestão (NOVO):** um cartão "Primeiros passos" no dashboard, visível
  enquanto houver item pendente, com 5 linhas derivadas de contagens que o
  sistema já tem (`cabines`, `atributos`, `vestidos`, escadas de comissão,
  recorrências) e o link de cada uma. Some quando tudo estiver feito — a mesma
  disciplina do `AlertaCaixa`. Nenhum épico E68–E90 trata de onboarding de loja.
- **Severidade:** 🟠

### F42 — Duas formas de trazer alguém para a equipe, lado a lado, sem dizer qual usar

- **Onde:** `pages/equipe/index.tsx:146-148` (form de membro: nome, e-mail,
  **senha** escolhida pelo admin, perfil) e `:150-152` (form de convite: nome,
  e-mail, perfil → link copiável). Os dois vivem na mesma tela.
- **O atrito:** o admin escolhe no escuro. O caminho da senha obriga a
  colaboradora a trocá-la no primeiro acesso (E57, `App.tsx:107-111`) — ou seja,
  o admin digita uma senha que vai ser jogada fora, e ainda precisa transmiti-la
  por algum canal. O caminho do convite é melhor em tudo, e não é o padrão.
- **Por que importa:** o caminho pior é o que expõe uma senha em conversa de
  WhatsApp. É uma decisão de segurança tomada por acaso, por quem não tem
  contexto para decidir.
- **Sugestão:** o convite vira a ação primária ("Convidar por link") e o cadastro
  com senha vira uma opção secundária, com uma frase que diga quando serve
  ("para quem não tem WhatsApp/e-mail — a senha é provisória e será trocada no
  primeiro acesso").
- **Severidade:** 🟡

### F43 — "O que essa pessoa pode fazer?" exige cruzar duas telas de cabeça

- **Onde:** `pages/equipe/index.tsx` mostra membro → **nome do perfil**;
  `pages/permissoes/index.tsx` mostra perfil → matriz de módulos. Não há link
  entre as duas, e a lista de equipe não mostra os acessos do perfil — apesar de
  `lib/permissoes.ts:59-73` já ter a função `resumoAcessos()`, que produz
  exatamente essa frase e é usada só na lista de perfis do superadmin.
- **O atrito:** a pergunta operacional real ("a Bia consegue ver o financeiro?")
  obriga a abrir Equipe, ler o perfil, abrir Permissões, achar a linha do perfil,
  ler a matriz — lembrando que pode haver override desta loja.
- **Por que importa:** permissão que ninguém consegue auditar rapidamente é
  permissão que ninguém revisa. O sistema já tem a peça pronta e não a usa onde
  a pergunta nasce.
- **Sugestão:** a linha do membro em `/equipe` mostra `resumoAcessos()` do perfil
  dele (com o override da loja aplicado) e linka para `/permissoes`. Uma função
  que já existe, num lugar novo.
- **Severidade:** 🟡

### F44 — "Trocar de Loja" ocupa o lugar mais nobre da sidebar mesmo para quem tem uma loja só

- **Onde:** `components/layout/sidebar.tsx:110-119` — o link é renderizado
  incondicionalmente, acima de toda a navegação, com destaque de cor e borda.
  `pages/selecionar-loja.tsx:141` já sabe contar as lojas (`temLojas`), e a
  sessão traz `session.lojas`.
- **O atrito:** a maioria das lojas é uma loja. O item leva a uma tela com um
  card único e um botão "Continuar na loja atual" — uma viagem de ida e volta
  sem função.
- **Por que importa:** é o elemento mais visível da navegação e não faz nada para
  a maioria; e ocupa o espaço onde caberia o que a vendedora realmente usa (a
  fila do dia, F7).
- **Sugestão:** renderizar só quando `session.lojas.length > 1`. Uma condição.
- **Severidade:** 🔵

---

## As 10 melhorias de experiência que eu faria primeiro

Ordenadas por impacto ÷ esforço. As cinco primeiras cabem, somadas, num dia de
trabalho.

1. **F8 + F31 + F44 — os três `<Link>` de uma linha cada.** O sino aponta para
   `/mensagens`, a folha entra na barra do hub financeiro, "Trocar de Loja" só
   aparece com mais de uma loja. Custo: minutos. Efeito: três becos a menos.
2. **F1 — "Agendar atendimento" na ficha da noiva.** O deep-link já existe e já é
   usado por outra tela; falta o botão no caminho mais percorrido do sistema.
3. **F7 — o cartão "N mensagens prontas" no dashboard.** Liga a tela que promete
   responder "o que eu faço agora" à tela que de fato responde, e é o que faz o
   E69 inteiro ser adotado.
4. **F27 — o nome da noiva em "Contas a receber".** O dado já vem na resposta e
   já está no CSV; sem ele a tela de cobrar é ilegível. Uma linha de JSX.
5. **F36 — "Falta pagar R$ X · próxima em DD/MM" no portal.** Uma soma que
   apaga a pergunta de WhatsApp mais frequente do ateliê.
6. **F17 — traduzir os erros do "Gerar contrato".** O `mensagemApi` e o padrão de
   dicionário já existem no arquivo irmão; hoje o clique mais caro do funil
   falha em linguagem de servidor, sem saída. Vale mesmo antes de o C1 ser
   corrigido.
7. **F16 — a prévia das parcelas dentro do diálogo de gerar contrato.** Dá à
   vendedora a frase que fecha a venda e, junto com o C1, elimina o 422.
8. **F6 — separar "mandei mensagem" de "ela confirmou".** É o único número
   operacional do sistema que hoje mede a coisa errada, e não tem desfazer.
   Custa uma coluna e um rótulo, e devolve a confiança na agenda.
9. **F26 — o clique de cobrança na fila do dia deixa rastro.** Transforma a tela
   mais usada num histórico automático e zera de quebra o falso alerta de "lead
   parado". Mesmo padrão do carimbo que já existe na linha ao lado.
10. **F41 — "Primeiros passos" no dashboard de uma loja vazia.** Cinco contagens
    que o sistema já faz, com o link de cada uma; some quando estiver tudo
    pronto. É o que evita que metade dos módulos nunca seja descoberta.

Fora do top 10 mas com o melhor retorno de médio prazo: **F11** (uma prova nunca
pode ser concluída — dado que degrada em silêncio), **F13** (a barra de
atendimento em curso, que muda o app de "digito depois" para "acompanha o
trabalho") e **F37** (a noiva poder dizer "não vou poder ir", que devolve
horários caros para a loja).

## O que está BEM (não mexer)

- **"Mensagens de hoje" (E69)** é o melhor produto do sistema: uma fila que se
  desce clicando, com a mensagem pronta e o link do portal embutido. Todos os
  meus achados sobre ela são de *alcance* (F7, F9, F26) — o desenho está certo.
- **A grade de slots que OFERECE (E64,** `atendimentos/novo.tsx:280-298`**)** é o
  padrão que o resto do app deveria seguir: em vez de deixar o conflito estourar
  como erro depois do clique, a tela só mostra o que é possível, com o motivo da
  recusa no `title` de cada botão desabilitado.
- **A reserva criada dentro do fluxo da prova (E65,** `novo.tsx:476-525`**)** e o
  **toast "Reservou → abrir orçamento" (E61,** `atendimentos/index.tsx:221-231`**)**
  são exatamente o movimento que falta nas outras jornadas: a tela onde o
  problema aparece resolve o problema.
- **A movimentação do vestido com desfazer** (`reservas/[bloqueioId].tsx:240-256`)
  é o tratamento certo de um dado que se erra digitando: reversível, explícito,
  e com o efeito colateral (a disponibilidade) documentado no comentário.
- **A folha separa "baixar o CSV" de "marcar como enviado"**
  (`financeiro/folha.tsx:8-12`) — e o comentário conta por quê. É a decisão certa
  sobre uma ação que escreve, tomada por quem já se queimou com a errada.
- **"Pagar juntas"** (`financeiro/pagar.tsx:494-495`) é a única ação em lote do
  sistema, e é justamente onde o lote faz sentido (várias contas, um pagamento).
- **O motivo de perda estruturado** (`noivas/[leadId]/index.tsx:281-345`): motivo
  obrigatório de uma lista fechada, detalhe livre opcional, e o texto do diálogo
  explica que dá para reativar. Confirmação bem escrita, com a consequência dita.
- **Os estados vazios que orientam** — `noivas/index.tsx:193-206` e
  `ajustes/index.tsx:182-202` (que ainda oferece "ver todos" quando o recorte
  esconde trabalho) são o padrão a copiar nos outros 28.
- **O tour de acesso (E24)** responde "o que eu posso fazer aqui" uma vez, é
  reabrível em Configurações e não vira modal chato. A ideia certa; falta a
  irmã dela (F41: "o que falta configurar").
- **O `AlertaCaixa` fica calado quando não há o que dizer** — a disciplina que
  faz um aviso continuar sendo lido. O único ajuste que proponho (F30) é
  distinguir "está tudo bem" de "não sei dizer".
