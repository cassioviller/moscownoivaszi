# Rodada 7 (design) — As réguas chegam à superfície (E120–E142)

Plano pós-diagnóstico de design/UX, ancorado no código como está em `286f658`
(branch `rodada-7-design`). As seis trilhas + passada adversarial
(`docs/revisao/2026-07-30-rodada-7-design/`) levantaram **58 achados** — 0 🔴,
21 🟠, 30 🟡, 7 🔵 — e a consolidação G os fechou em **23 épicos**. A conclusão
que atravessa tudo: **o defeito dominante é adoção, não desenho** — `mensagemApi`
chegou a 23 arquivos e faltaram 27; os 44px chegaram a `sm`/`icon` e não ao
`default`; a escala do dinheiro existe e o degrau de topo está fora dela em 11
de 15 pontos; a paridade de rastro de cobrança foi desenhada e só existe de um
lado. Por isso 19 dos 23 épicos têm o molde pronto no próprio repo, citado no
escopo de cada um.

Regra da casa mantida: nenhuma API externa, contrato OpenAPI como fonte da
verdade, cada épico com teste no commit. Caminhos de tela são relativos a
`artifacts/moscow-noivas/src/`; caminhos de rota, a `artifacts/api-server/src/`.

**A lição da rodada 6, repetida de propósito:** o backlog daquela rodada errou
5 vezes por ler sem executar. Toda "Primeira ação" abaixo é **mapear
executando** — um grep, um teste que falha, uma medição — antes da primeira
linha de conserto.

---

## Perguntas ao dono — com o default que a execução segue

A rodada roda em modo autônomo (regra 5 do METODO): cada escolha de produto
abaixo tem um **default conservador escrito**, o épico segue o default se não
houver resposta, e a pergunta fica registrada para o dono reverter depois.
**Nenhum épico fica bloqueado por pergunta.**

| # | Pergunta | Default (o que a execução faz) | Épico |
|---|---|---|---|
| P1 | Quando o contrato nasce de um orçamento, o servidor deve **recusar** uma vendedora diferente da do orçamento, ou aceitar e **rastrear**? | **Aceita e rastreia.** A venda pode legitimamente ser de outra pessoa (é o miolo do B1); travar quebraria o caso real. O escopo de loja já é validado; a divergência do `orcamento.vendedoraId` passa a ficar gravada na auditoria do contrato. Reverter para recusa é trocar o registro por um 422. | E120 |
| P2 | Contratos, orçamentos e a lista de noivas passam a abrir **recentes-primeiro**? | **Sim.** A adversarial derrubou a única prosa que defendia antigos-primeiro (`lib/api-spec/openapi.yaml:1243-1247`, sem medida), e o funil e o combobox já pedem `recentes` de propósito. O parâmetro `ordem` continua existindo para quem quiser o inverso. | E124 |
| P3 | O botão `default` sobe para 44px de altura no mobile (hoje 36px)? | **Sim.** O comentário do próprio componente enuncia a régua como universal (`components/ui/button.tsx:30-34`) e o E92 registrou **adiamento, não recusa com medida** (60 alvos abaixo de 44px medidos em Atendimentos). Reverter é 1 linha. Desktop não muda. | E137 |
| P4 | A grafia oficial da casa é "ateliê" ou "atelier"? | **"Ateliê"** — a grafia do menu (a posição mais oficial) e a do português padrão; as 8 frases em "atelier" migram, incluindo as 2 ditas à noiva no portal. | E138 |
| P5 | Vestidos mantém as **duas portas** de criação (página completa + diálogo rápido)? | **Mantém as duas.** Remover porta que gente usa sem pedido é risco por nada; o conserto é a rápida **declarar o que fica faltando** (foto e características — as que casam vestido com noiva) com o caminho "completar agora". | E134 |
| P6 | Qual a gramática de cor do status? (hoje: 6 combinações contraditórias em 7 telas) | **A tabela do E130:** em dia/agendado = `default` (rosa) · em andamento = `default` · terminou bem = `secondary` · terminou mal (cancelado, recusado) = `destructive` (a versão clareada do escuro já existe) · inativo = `outline` · **precisa de reação (Faltou) = o token `--aviso`** que o E127 cria. É proposta de design, reversível por tabela — ela mora num lugar só. | E130 |

---

## Ordem recomendada: E120 → E142, na ordem numérica

A consolidação G já ordenou por valor e a numeração satisfaz as dependências
explícitas. O porquê da cabeça da fila:

- **E120 primeiro** porque é o único épico que mexe em dinheiro trocando de
  bolso: R$ 210,00 de comissão num contrato de R$ 4.200,00 a 5%, na única porta
  que paga comissão.
- **E121 em seguida** porque contém o C2, o 🟠 "mais perto de 🔴" da rodada
  (veredito da adversarial): a conciliação que ensina a relançar dinheiro que
  existe.
- **E122 antes do E138** (o título canônico da falha nasce no E122; a passada
  de voz não toca toast de erro).
- **E124 cedo apesar de G** porque destrava o acervo de 3 anos e multiplica
  E125 e E141.
- **E121 antes do E132** (mesmo `dashboard.tsx`, e cartão clicável pressupõe
  zero honesto). **E134 e E135 adjacentes** (mesmo `vestidos/index.tsx`),
  qualquer ordem entre si. **E141 depois do E124** (a busca global rende mais
  quando contratos e orçamentos também se acham).
- Todo o resto é independente e pode ser reordenado por prioridade de negócio
  sem quebrar nada.

**Esforço somado: 4 P · 17 M · 2 G** (E124, E136).

---

## E120 — O contrato nasce de quem vendeu, e o diálogo para de perguntar o que o orçamento já sabe

**Esforço: M** · **Fecha: B1 🟠, B5 🟠, B6 🟡** · **Decide: P1 (default: rastrear, não travar) e a sobra S-D4**

**A dor.** `pages/orcamentos/[id].tsx:595` envia `vendedoraId: user!.id`, fixo —
o diálogo "Gerar contrato" (`:1058-1196`) tem CPF, forma, data e plano, e nenhum
campo diz de quem é a venda, embora `Orcamento.vendedoraId` seja obrigatório no
contrato da API (`lib/api-spec/openapi.yaml:5324-5330`) e já desça no GET. A
comissão é somada por `contratos.vendedora_id`
(`api-server/src/lib/comissao.ts:238-279`): a Ana monta o orçamento de
R$ 4.200,00, a noiva aceita à noite, a dona clica "Gerar contrato" de manhã — e
**R$ 210,00 de comissão trocam de bolso em silêncio**, numa escada de 5%. É a
mesma classe que o E98/F12 fechou na porta da agenda; a porta que PAGA comissão
ficou com o defeito. Na mesma tela: o único botão colorido do rascunho é
"Aprovar" (`:688-692`) — o passo que o próprio diálogo desaconselha em vermelho
(`:742-748`, "você fica sem a prova digital") — enquanto enviar à noiva mora
atrás do "…" (`:694-711`); e o diálogo pergunta a `dataCasamento` (`:300`,
`:1128-1140`) que `leadCompleto` já tem em memória (`:212-217`). E a sobra S-D4:
o servidor aceita `vendedoraId` do corpo validando só "é da loja"
(`api-server/src/routes/contratos.ts:149`), então um curl atribui a venda a
qualquer colega, sem tela.

**Feito significa.** O contrato nasce da vendedora do orçamento por default e
trocá-la é um gesto explícito e visível; a divergência deixa rastro na
auditoria; a ação primária do orçamento segue o estado (sem aceite, a primária
é chegar à noiva); e nenhum campo do diálogo pergunta o que o orçamento sabe.

**Escopo técnico.**
1. Select de vendedora no diálogo, nascendo de `orcamento.vendedoraId`,
   listando a equipe ativa da loja (a query de vendedoras que
   `atendimentos/novo.tsx` já usa). **(B1)**
2. `acaoPrimaria` por estado: em RASCUNHO/ENVIADO sem `aceitoEm`, a primária é
   "Link para a noiva"/"Marcar como enviado"; "Aprovar" sobe a primária quando
   o aceite existe — o mesmo padrão que a tela já usa para APROVADO
   (`:674-687`). **(B5)**
3. `defaultValues` do diálogo lê `lead?.casamentoData` — o molde é
   `atendimentos/novo.tsx:227-229`. **(B6)**
4. **P1, default:** `POST /contratos` com orçamento grava na auditoria, dentro
   da transação, quando o `vendedoraId` do corpo diverge de
   `orcamento.vendedoraId` (quem clicou continua vindo da sessão — a régua de
   autoria do `replit.md` não muda: vendedora da VENDA não é autoria). **(S-D4)**

**Cuidados.** (a) NÃO travar no servidor sem resposta do dono — o caso legítimo
existe e é o próprio B1; (b) a régua "autoria vem da SESSÃO" fica intacta: o
select escolhe a dona da venda, não o autor do registro; (c) **regra 11**: o
item 4 muda o que a trilha grava → E2E completo antes do commit; (d) não
aproveitar para refatorar o arquivo (o cuidado (d) do E95 vale de novo).

**Testes.** Front: o diálogo abre com a vendedora do orçamento selecionada; a
primária de um RASCUNHO sem aceite não é "Aprovar". API: contrato com
vendedora divergente grava o detalhe na auditoria; com a mesma, não. E2E:
jornada orçamento → contrato completa.

**Primeira ação.** Rodar o teste de API existente do `POST /contratos` com um
`vendedoraId` de outra colega da mesma loja e imprimir o que a auditoria grava
hoje — mapear o rastro atual antes de escrever o novo.

---

## E121 — A tela para de afirmar zero enquanto não sabe: carregando e erro na fila do dia, na conciliação e nos painéis

**Esforço: M** · **Fecha: C1 🟠, C2 🟠, C3 🟠**

**A dor.** Três telas afirmam "vazio" ou "R$ 0,00" com todas as letras enquanto
a API não respondeu — e a mais cara ensina a errar. **C2 primeiro** (o 🟠 mais
perto de 🔴, veredito da adversarial): a conciliação computa o veredito de
`parcelas.data ?? []` e `pagamentos.data ?? []`
(`pages/financeiro/conciliacao.tsx:113-142`) e o desenha sempre que há extrato
(`:262`), sem ler `isLoading`/`isError` de nenhuma das duas queries (`:83-94`).
Um extrato de 45 transações mostra **"Bateu 0 · Só no banco 45"** até as queries
chegarem — e se uma falhar, mostra isso para sempre, com a instrução ao lado:
*"lance em receber ou pagar"* (`:323-333`). A dona obedece e o caixa conta o
mesmo dinheiro duas vezes. **C1**: a fila do dia dispara 4 queries
(`pages/mensagens/index.tsx:68,87,94,104`) e lê zero vezes
`isLoading`/`isError`; o cabeçalho afirma "Fila vazia — ninguém esperando
mensagem" (`:200-202`) e cada seção crava o próprio "ninguém" (`:275`, `:388`,
`:453`) — a recepcionista fecha a tela numa oscilação de rede e as confirmações
das 48h não saem. **C3**: o dashboard desenha a falha como medição — "Noivas
ativas 0" (`pages/dashboard.tsx:247`), "A receber R$ 0,00" (`:316`), "A pagar
R$ 0,00" (`:331`) — enquanto no MESMO arquivo `atendimentosQuery` e
`paradosQuery` têm o ramo de erro com frase própria (`:372-376`, `:456-460`);
o funil desenha "Vazia" em cada coluna (`pages/noivas/funil.tsx:264,303-307`) e
Permissões fica em branco (`pages/permissoes/index.tsx:35-40,113-121`).

**Feito significa.** Nenhuma dessas telas afirma um número ou um vazio sem a
query ter respondido; a falha tem frase e "Tentar novamente"; e o veredito da
conciliação só existe quando os dois lados existem.

**Escopo técnico.**
1. **C2 primeiro.** `conciliacao.tsx`: esqueleto enquanto
   `parcelas.isLoading || pagamentos.isLoading`; `<Erro>` com refetch em
   `isError`; o `useMemo` do veredito gateado pelas duas respostas.
2. **C1.** `mensagens/index.tsx` lê os estados das 4 queries: `<Carregando>` no
   lugar da afirmação, `<Erro>` por seção falhada. Os componentes são os de
   `components/estado/index.tsx`; o precedente é o D7/E99 em
   `pages/comissoes/index.tsx:577-598`, que distingue "carregando" de "zero".
3. **C3.** Dashboard: os cards de dinheiro e os 4 contadores ganham o mesmo
   ramo `isError` que os vizinhos do próprio arquivo já têm; "Minha comissão"
   distingue falha de "sem regra" (`:340`). Funil e Permissões ganham
   `<Carregando>`/`<Erro>`.

**Cuidados.** (a) Não inventar um terceiro desenho de erro — `<Erro>` canônico
e o `Alert destructive` + refetch que 20+ telas já usam são os dois vivos, e a
coexistência com `ErroListagem` é decisão registrada do E99; (b) o portal da
noiva trata 404/410 como veredito de propósito (`noiva-portal.tsx:36-38`) —
não "consertar"; (c) esqueleto ≠ spinner de página inteira: por seção, para a
tela não piscar inteira a cada refetch.

**Testes.** Front (render, queries mockadas): a conciliação com uma query
pendente não desenha veredito; com uma falhada mostra `<Erro>`; a fila com
query falhada não diz "Fila vazia"; o dashboard com falha não diz "R$ 0,00".

**Primeira ação.** Reproduzir o C2 num teste de render: montar a conciliação
com extrato carregado e queries pendentes e ver "Bateu 0 · Só no banco 45" —
o vermelho-antes literal do épico.

---

## E122 — O erro mostra a frase que o servidor escreveu: `detalhe` no builder, `mensagemApi` nos 27 arquivos, um título só para a falha

**Esforço: M** · **Fecha: C4 🟠, F1 🟡**

**A dor.** O servidor escreve a explicação e o cliente a joga fora, em duas
camadas. O builder: `lib/api-client-react/src/custom-fetch.ts:150-171` monta
`HTTP <status> <statusText>` + o campo `error`, e procura `detail`/`message` —
**não lê `detalhe`**, a grafia da casa. O toast mostra "HTTP 409 Conflict:
CONVITE_PENDENTE" e descarta *"Use reenviar ou cancele o convite existente"*
(`api-server/src/routes/equipe.ts:245`); a vendedora que agenda num slot tomado
lê o código enquanto `agenda.ts:263` explica a recusa em português. A adoção:
**47 toasts em 27 arquivos** (número final da adversarial) ainda usam
`err instanceof Error ? err.message` em vez de `mensagemApi`
(`lib/erro-api.ts:47-77`, a régua do E92, adotada em 23 arquivos e parada na
metade — os piores: `pages/equipe/index.tsx` com 6, `pages/vestidos/[id]/editar.tsx`
e `pages/admin/index.tsx` com 4). E o título: **76 toasts "Erro ao X"** contra
14 na voz que o METODO celebra ("Não consegui entrar", `pages/login.tsx:40`;
"Não deu para X" em 8) — cinco formulações para o mesmo evento (F1).

**Feito significa.** Nenhum toast do app mostra `err.message`; o corpo segue a
ordem da régua (código → `detalhe` → faixa → fallback da tela); a falha tem UM
título canônico; e uma varredura impede a reincidência.

**Escopo técnico.**
1. `custom-fetch.ts` passa a ler `detalhe` (mantendo `detail`/`message` como
   fallback de compatibilidade) — com teste unitário do builder.
2. Os 47 call-sites trocam a expressão por `mensagemApi(err, <fallback da
   tela>)` — a assinatura já aceita o fallback que está lá.
3. O título canônico da falha é decidido e escrito no commit (**default: "Não
   deu para <verbo>"** — a formulação mais frequente entre as da voz, 8 usos) e
   os 76 "Erro ao X" migram. O E138 depende desta decisão e não toca toast.
4. A pista da trilha F: os 14 fallbacks "Falha inesperada ao…" duplicados
   migram para o do `<Erro>` canônico (`components/estado/index.tsx:88`).
5. **Varredura nova**: um teste que reprova `err instanceof Error ?
   err.message` em `pages/` e `components/` — varrendo o **arquivo inteiro**,
   não linha a linha (a fresta do prettier da sobra S-D7 não pode nascer aqui).

**Cuidados.** (a) `custom-fetch.ts` é atravessado por TODO request do app —
o item 1 é pequeno e testado, mas sai como primeiro commit lógico do diff para
o blast radius ficar legível; (b) não reescrever `mensagemApi` nem a ordem da
régua (E92) — este épico é adoção; (c) o fallback continua sendo da TELA,
específico ("Não deu para reenviar o convite"), nunca genérico.

**Testes.** Unitário do builder com corpo `{error, detalhe}`; a varredura do
item 5 verde só depois das 47 trocas (rodá-la antes e ver as 47 falharem é a
prova de cobertura); front: um toast de 409 com `detalhe` mostra a frase.

**Primeira ação.** Rodar o grep da adversarial e reconferir os 47/27 — a lista
de arquivos que sai é o mapa de execução do épico, e o diagnóstico tem dias.

---

## E123 — Cobrar deixa rastro pelas duas portas, e a fila marca o que já saiu

**Esforço: M** · **Fecha: B2 🟠, B3 🟠**

**A dor.** O mesmo ato — cobrar pelo WhatsApp — deixa rastros diferentes
conforme a porta. Em `/mensagens`, o clique carimba um `registro-cobranca`
sozinho (`pages/mensagens/index.tsx:416-426`, F26/E97). Em
`/financeiro/cobranca` — o destino do link "Ver a cobrança completa"
(`mensagens/index.tsx:377-383`), a tela de quem tem volume — o botão só abre o
wa.me (`pages/financeiro/cobranca.tsx:151-160`) e registrar custa **+3 gestos
por noiva** no formulário manual (`components/historico-contato.tsx:127-160`):
numa sexta com 10 inadimplentes, 30 gestos que a porta irmã faz de graça — e
quem os pula deixa a noiva cobrada constando como parada, porque é o registro
que zera o relógio do "parado há N dias" (`historico-contato.tsx:27-28`). O
comentário `mensagens/index.tsx:149-153` afirma uma paridade que não existe.
E a própria fila de `/mensagens` não marca o que já saiu (B3): a lista de
inadimplentes (`:390-434`) fica idêntica antes e depois do clique — a
recepcionista que a tela manda descer (*"Desça a fila clicando"*, `:202`) é
interrompida e perde o lugar — enquanto 20 linhas acima "Procurar para
confirmar" remove a linha e oferece "Não procurei" (`:302-317`, `:332-363`).

**Feito significa.** Cobrar por qualquer porta grava o mesmo rastro; a fila
mostra o que já saiu hoje, com desfazer; e a prosa do F26 volta a ser verdade.

**Escopo técnico.**
1. O botão WhatsApp de `/cobranca` ganha `onClick` que dispara o mesmo
   `POST /registros-cobranca` (canal `WHATSAPP`, observação "mensagem de
   cobrança enviada pela fila") — o molde é `mensagens/index.tsx:416-426`. A
   prosa de `:149-153` é corrigida **no mesmo commit**.
2. A fila de inadimplentes de `/mensagens` adota o desenho da seção irmã: a
   linha sai (ou ganha o selo "cobrada há N min") ao clicar, com desfazer — o
   dedup `enviadas` (`:159-179`) já existe e passa a alimentar a marca visual.

**Cuidados.** (a) A autoria do registro vem da SESSÃO —
`RegistroCobrancaInput` não aceita `vendedorId` de propósito (régua do
`replit.md`); (b) registrar no clique, não no retorno do wa.me (nova aba não
volta); duplo clique não pode gerar duas linhas — conferir o dedup na porta
nova; (c) **regra 11**: muda o que a trilha grava → E2E completo antes do
commit; (d) o desenho da linha marcada é o da seção irmã, não um terceiro.

**Testes.** Front: o clique em `/cobranca` chama o POST e a linha de
`/mensagens` muda de estado ao cobrar; o desfazer devolve. E2E: fluxo de
cobrança pelas duas portas com o rastro conferido.

**Primeira ação.** Ler o contrato do `POST /registros-cobranca` no
`openapi.yaml` e rodar o teste de API existente dele — confirmar payload
mínimo e o comportamento de duplicata antes de escrever a segunda porta.

---

## E124 — O que se procura se acha: busca, página e recentes-primeiro onde mora o volume de 3 anos

**Esforço: G** · **Fecha: D1 🟠, D2 🟠, B4 🟠, C6 🟡** · **Decide: P2 (default: recentes-primeiro) · Coordena: sobra S-D5**

**A dor.** O acervo comercial não se acha. Contratos: sem busca, sem página, e
`api-server/src/routes/contratos.ts:117` ordena ASCENDENTE — com ~290 contratos
em 3 anos, o da semana passada é o ÚLTIMO de ~29.000px de rolagem
(`pages/contratos/index.tsx:29`, o único filtro é status em memória,
`:17-21,:33`). Orçamentos: idem (`routes/orcamentos.ts:130`;
`pages/orcamentos/index.tsx:64,80-83`) e o card nem mostra o valor
(`:231-249`) — "o orçamento de R$ 8 mil" só se acha abrindo um por um, sendo
que desde o E115 renegociar É criar orçamento novo. Noivas: a lista fica com o
default `antigos` que só ela não escolheu (`pages/noivas/index.tsx:68-76` não
passa `ordem`; `openapi.yaml:1251`; funil e combobox pedem `recentes`
explícito) — a noiva de ontem mora na página 34, atrás de 33 cliques. Receber
(B4): a noiva no balcão querendo adiantar a parcela do mês que vem não se acha
pelo nome — não há busca (`pages/financeiro/receber.tsx:236-276`) e a janela
padrão é o mês corrente (`:96`), então a linha nem está na tela; e o vazio diz
só "Nada por aqui neste filtro." (`:302`; C6) sem nomear a janela nem oferecer
alargá-la. E a sobra S-D5: `GET /lojas/:id/orcamentos` embute `itens: true` da
história inteira (`routes/orcamentos.ts:126-131`) para uma lista que não
desenha valor nenhum.

**Feito significa.** Contratos e orçamentos têm busca por noiva, página e
recentes-primeiro no servidor; o card de orçamento mostra o valor; a lista de
noivas abre nos recentes; Receber acha a parcela pelo nome da noiva mesmo fora
da janela; e o vazio de filtro nomeia a janela e oferece a saída.

**Escopo técnico.**
1. `openapi.yaml`: `q`/`pagina`/`porPagina`/`ordem` (default `recentes` — P2)
   em `GET /contratos` e `GET /orcamentos`; as rotas buscam por nome da noiva
   via join com lead, no molde da régua `routes/leads.ts:120-133` (a busca que
   acha por dígitos do telefone). Codegen + `npx tsc --build`.
2. **S-D5 junto**: a listagem geral de orçamentos para de embutir `itens` e
   passa a mandar um `valorTotal` agregado — que o card exibe (fecha a metade
   do D1). O recorte `?leadId=` do perfil continua com itens (é quem os usa).
3. As telas de contratos e orçamentos ganham campo de busca + paginação (o
   molde de UI é `noivas/index.tsx:57-87`, debounce 300ms +
   `keepPreviousData`).
4. Noivas: `ordem: "recentes"` nos params — 1 linha (D2). O comentário sem
   medida de `openapi.yaml:1243-1247` atualiza junto (nota da adversarial).
5. Receber: campo de busca por noiva; com `q` preenchido, a query pede
   `status: "abertas"` **sem janela** — a régua que `/cobranca` já usa e que o
   F29/E98 escreveu ("atraso não tem janela"; aqui, "a pessoa na sua frente não
   tem janela"). (B4)
6. Os vazios de receber/pagar nomeiam a janela ativa e oferecem
   "ver os próximos meses"/"limpar filtros" no `<Vazio>` canônico com `acao`;
   `noivas/index.tsx:208` ganha o botão de limpar (a palavra "lente" é do
   E138). (C6)

**Cuidados.** (a) **Regra 11 duas vezes**: muda o formato do que a tela lê
(payload sem `itens`, ordem invertida) → E2E completo obrigatório; (b) a
decisão E99 parte 7 fica de pé — NADA de paginar `/vestidos`; (c) codegen +
`tsc --build` na raiz, senão as rotas veem o contrato antigo (gotcha do
`replit.md`); (d) `ordem` com default novo muda TODO consumidor do endpoint —
conferir por grep quem mais chama `useListContratos`/`useListOrcamentos` antes
de virar a chave; (e) não estender a busca para campos que o índice não cobre
sem olhar o plano (os índices compostos do E91 existem — conferir se cobrem o
join por nome).

**Testes.** API: busca acha por nome da noiva; página recorta; `ordem` default
devolve o mais novo primeiro; o payload da listagem geral não traz `itens` e
traz `valorTotal`. Front: o card de orçamento mostra o valor; a busca de
Receber acha a parcela fora da janela. E2E completo.

**Primeira ação.** Medir o payload atual: `curl` no `GET /orcamentos` de uma
fixture com histórico e `wc -c` — o número do antes que o S-D5 vai derrubar, e
a prova de que os `itens` desciam para ninguém.

---

## E125 — A ficha responde o telefone: próxima prova e saldo devedor na tela de "quem ela é"

**Esforço: M** · **Fecha: D3 🟠, D4 🟠**

**A dor.** A ligação mais comum tem duas perguntas e a ficha não responde
nenhuma. "Que dia é a minha prova?": as queries da ficha são lead, orçamentos e
contratos (`pages/noivas/[leadId]/index.tsx:89-110`) — nenhuma de agenda; os 8
cards (`:379-556`) não têm a resposta, e o caminho real é `/atendimentos` → aba
Provas → buscar o nome. O banner de próximo passo sabe a ETAPA e não a agenda
(`lib/proximo-passo.ts:55-64`) — sugere agendar o que pode já estar agendado.
"Quanto falta pagar?": contrato de R$ 8.400,00 em 10×, entrada e 3 recebidas —
faltam R$ 5.880,00, e a soma só existe DENTRO do diálogo de cancelar
(`pages/contratos/[id].tsx:639-691`; a conta está pronta em `:155-164`); o
destaque da tela é o Valor Total (`:427-434`) e o rodapé soma o PREVISTO
(`:558-563`). A vendedora soma 7 parcelas de cabeça por ligação — enquanto o
portal já responde as duas perguntas à noiva (E78/E85, E100/F36).

**Feito significa.** A ficha mostra a próxima prova/atendimento; o contrato
mostra "falta receber R$ X" fora do diálogo de cancelar; e o banner de próximo
passo não sugere agendar o que já existe.

**Escopo técnico.**
1. A ficha pede `GET /atendimentos?leadId=&de=hoje` (a query recortada por
   `leadId` já existe em outras telas — conferir os params no openapi) e
   desenha "Próxima prova: 12/08, 14h" no card do casamento, com link para a
   linha. O banner passa a receber esse dado e cala a sugestão redundante. (D3)
2. `contratos/[id].tsx`: extrair a derivação de `oQueSeraDesfeito` (recebido/
   aberto, `:155-164`) para função pura reutilizada, e exibir
   "Falta receber R$ 5.880,00" no bloco de valores (`:427-434`) e no card
   Contratos da ficha (`noivas/[leadId]/index.tsx:524`, ao lado do
   `valorTotal`). (D4)

**Cuidados.** (a) Uma derivação só — não escrever uma segunda conta do aberto
(a divergência entre dois números da mesma tela é a classe mais cara do repo);
soma em centavos (`somaCentavos`), `brl()` na borda; (b) a ficha já dispara
várias queries — a de agenda entra com janela (`de=` hoje), nunca o histórico;
(c) não mexer no diálogo de cancelar — ele está certo e é o molde.

**Testes.** Unitário da derivação do aberto (o caso 8.400/10× com 3 pagas +
entrada = 5.880,00); render: ficha com fixture mostra a próxima prova; o banner
não sugere agendar quando há atendimento futuro.

**Primeira ação.** Ler no `openapi.yaml` os params reais de
`GET /atendimentos` e rodar a chamada com `leadId` numa fixture — confirmar que
o recorte existe do jeito que a ficha precisa antes de desenhar o card.

---

## E126 — A moldura cabe nos 390px: a fileira quebra e o botão do dia volta para a tela

**Esforço: M** · **Fecha: E1 🟠, E2 🟠, E3 🟠, E5 🟡**

**A dor.** Fileiras de flex sem quebra somam mais que os 358px úteis (390 − o
`p-4` de `components/layout/app-layout.tsx:175`) e o que sai da tela é sempre o
alvo principal. `vestidos--390.png`: "Novo Vestido" **100% fora da tela**
(`pages/vestidos/index.tsx:288-314`, grupo de 3 botões ≈ 470px);
`contratos--390.png`: o botão desenha por cima do título
(`pages/contratos/index.tsx:39-46`) e o badge estoura o card (`:113-116`);
`financeiro-receber--390.png`: "Recebido R$ 90.100,00" **sem o último dígito**
— `ResumoCard` é `min-w-[9rem]` (144px, `pages/financeiro/helpers.tsx:42`) mas
o conteúdo `money-lg` real mede ~250px, e o flex não encolhe abaixo do
conteúdo: R$ 90.100,00 e R$ 90.100,09 viram a mesma imagem;
`financeiro-cobranca--390.png`: a linha de ações soma ~560px num card de ~326px
e o **WhatsApp — a ação que só faz sentido no celular — fica invisível**
(`pages/financeiro/cobranca.tsx:121-160`); `equipe--390.png`: sobram ~136px
para nome + e-mail + acessos, e as duas "Vendedora…" ficam idênticas até nos 6
caracteres visíveis (`pages/equipe/index.tsx:424,447,428`). O `<main>` só
declara `overflow-y-auto` (`app-layout.tsx:174`), então a página INTEIRA ganha
rolagem lateral silenciosa; e `whitespace-nowrap` em todo `Button`
(`components/ui/button.tsx:8`) tira do flex qualquer lugar de ceder.

**Feito significa.** Nenhuma rota tem rolagem lateral de página em 390px;
nenhum botão primário nem dígito de dinheiro fica fora da tela nas 6 telas com
captura; e o conserto é do PADRÃO (a classe de fileira), não das 4 instâncias.

**Escopo técnico.**
1. Headers de listagem: `flex-wrap` + `min-w-0` no padrão — cobre vestidos,
   contratos, pagar (`pages/financeiro/pagar.tsx:401-423`) e os que cabem por
   pouco hoje (`orcamentos/index.tsx:116`). (E1)
2. `ResumoCard`: em telas estreitas o card ocupa a linha inteira
   (`basis-full` abaixo de `sm`, ou `min-w` que comporte `money-lg`) — um
   componente, fecha receber, pagar e folha. (E2)
3. Cobrança: `flex-wrap` no grupo interno de ações (`cobranca.tsx:121`) — as
   ações caem para a linha de baixo, como o card irmão de receber já faz. (E3)
4. Equipe: a identidade ganha a própria linha (`flex-wrap`), o molde é o `<li>`
   dos convites no mesmo arquivo (`:351`). (E5) O badge que estoura em
   `reservas/index.tsx:154` leva `truncate` + `min-w-0` no pai.
5. Por último: `overflow-x-hidden` no `<main>` — mata a classe inteira de
   rolagem lateral de página.

**Cuidados.** (a) **Ordem obrigatória: fileiras primeiro, `overflow-x-hidden`
por último** — cortar antes esconde o defeito em vez de consertá-lo; (b) o
desktop não muda: conferir as capturas `--claro` das mesmas telas; (c) a régua
é do E92: o corte do dinheiro é da moldura, não do `brl()` — não mexer no
espaço rígido; (d) verificação é visual: recapturar as 6 rotas em 390px (se o
script da sobra S-D1 ainda não existir, um ad hoc serve — versioná-lo continua
sendo a S-D1, não este épico).

**Testes.** Sem régua de CI para layout: a prova são as capturas antes/depois
das 6 telas em 390px, citadas no relatório de execução, mais as três suítes
verdes.

**Primeira ação.** Reproduzir a conta do E2 num navegador a 390px (medir o
`ResumoCard` renderizado com R$ 90.100,00) — confirmar os ~250px antes de
escolher entre `basis-full` e `min-w`.

---

## E127 — As cores semânticas ganham token e entram na varredura: `--primary-texto`, `--aviso`, e a fresta da linha fecha

**Esforço: M** · **Fecha: E4 🟠, E7 🟡, A5 🟡** · **Gera insumo para: E130 (P6)**

**A dor.** O rosa da marca como TEXTO pequeno dá **2,68:1** (conta refeita pela
adversarial; a régua do repo é 4,5:1 com teste em CI, `lib/aparencia.test.ts:86`)
em **11 pontos** — 10 links `text-primary underline` (`pages/mensagens/index.tsx:379`,
`pages/dashboard.tsx:383`, `pages/financeiro/conciliacao.tsx:326,330`,
`pages/configuracoes/backup.tsx:218`, `pages/equipe/index.tsx:516,644`,
`pages/admin/index.tsx:520`, `pages/reservas/[bloqueioId].tsx:604,723`) mais o
**preço que a noiva lê no portal, no celular, ao sol**
(`pages/noiva-portal.tsx:404-406`). Este último vive com CI verde porque a
varredura procura `brl(` e `text-primary` **na mesma linha**
(`lib/escala-dinheiro.test.ts:57-68`) e o prettier os separou em 404/405 — o
gêmeo `lookbook-publico.tsx:81` foi pego pelo E99, este escapou. O contador do
sino é `text-white` cru sobre `bg-primary` — 2,79:1 num numeral de 10px, em
todas as 27 capturas (`components/sino-notificacoes.tsx:209-211`) — quando
`--primary-foreground` existe testado para exatamente esse par. E o terceiro
estado semântico não tem token: **5 tons de aviso em 3 telas**
(`pages/financeiro/cobranca.tsx:54-57`, `pages/orcamentos/[id].tsx:826`,
`pages/configuracoes/backup.tsx:58-63,191` — que reinventa até `bg-red-500` e
`bg-emerald-500` onde `--destructive` e `--positivo` existem), nenhum coberto
pelo teste de contraste.

**Feito significa.** Existe `--primary-texto` (≥4,5:1, par claro/escuro) e os
11 pontos o usam; o sino usa o token testado; existe `--aviso` na varredura e
as 3 telas migram; e a varredura de dinheiro não tem mais a fresta da linha.

**Escopo técnico.**
1. `--primary-texto: 350 30% 42%` (6,48:1 — o desenho que o E92 deixou pronto)
   + par escuro, com a razão WCAG escrita ao lado como o `index.css` faz;
   entra em `aparencia.test.ts`; os 11 pontos migram.
2. `sino-notificacoes.tsx:209-211`: `text-white` → `text-primary-foreground`.
3. `--aviso` (par claro/escuro, ≥4,5:1 como texto) na varredura; cobrança,
   orçamento e backup migram — backup leva verde/vermelho para
   `--positivo`/`--destructive` junto.
4. `escala-dinheiro.test.ts` passa a varrer por **arquivo/vizinhança**, não por
   linha — e o caso novo pega `noiva-portal.tsx:404-405` antes da migração.

**Cuidados.** (a) **`--primary` NÃO muda** — a régua do `replit.md` é
explícita: quem muda é o que vai em cima; (b) os títulos públicos `text-4xl
text-primary` (login, portal) são texto grande/logotipo — isentos, não migrar;
(c) todo token novo nasce nos DOIS modos com a conta ao lado, senão
`aparencia.test.ts` não tem o que ler; (d) a auditoria das OUTRAS varreduras de
grep contra a mesma fresta é a sobra S-D7 — não puxar para cá.

**Testes.** `aparencia.test.ts` ganha os pares novos; a varredura reformulada
de dinheiro reprova o par separado por quebra de linha — **rodar antes da
migração e ver o ofensor atual falhar** é a prova de que a fresta fechou.

**Primeira ação.** Rodar `aparencia.test.ts` e `escala-dinheiro.test.ts` hoje e
guardar a saída; escrever o caso que pega `noiva-portal.tsx:404-405` e vê-lo
vermelho.

---

## E128 — A confirmação de dinheiro diz o número certo: o RECEBIDO no estorno, o valor na remoção, a contagem na LGPD

**Esforço: M** · **Fecha: C5 🟠, C7 🟡**

**A dor.** A régua E10 manda a confirmação nomear o objeto e o que se perde —
"o valor em dinheiro quando houver" — e avisa que a cláusula do TEXTO mora na
revisão (a varredura só cobre a ausência de confirmação). A revisão achou três
fora, todas de dinheiro: o estorno de pagamento não cita valor nem descrição
(`pages/financeiro/pagar.tsx:806-811`; o estado só carrega `{pagamentoId,
contas}`, `:146,591-594`, mas a linha clicada tem tudo); o estorno de parcela
do contrato cita o PREVISTO onde o caixa perde o RECEBIDO
(`pages/contratos/[id].tsx:769`) — parcela de R$ 1.000,00 com R$ 300,00
recebidos: o diálogo diz que desfaz R$ 1.000,00, o caixa perde R$ 300,00 — e o
comentário de `receber.tsx:406-409` chama isso pelo nome ("a tela mentindo
sobre dinheiro num clique sem volta"); e "Remover esta conta?" cala o valor
(`pagar.tsx:785-789`). Na mesma classe, a LGPD: o diálogo de anonimização diz o
QUE se perde mas não QUANTAS noivas
(`pages/configuracoes/privacidade.tsx:83-88`) — a contagem só chega no toast,
DEPOIS (`:41-49`). A dona confirma às cegas se são 3 ou 300.

**Feito significa.** As três confirmações nomeiam o valor certo; a LGPD mostra
a contagem ANTES do clique; e o exemplo R$ 1.000/R$ 300 vira teste.

**Escopo técnico.**
1. Estorno de pagamento: o estado do diálogo carrega `valorPago` + descrição da
   linha; o texto nomeia os dois — molde `receber.tsx:398-425`, que enuncia a
   regra com o mesmo exemplo numérico.
2. Estorno de parcela: `brl(valorRecebido)`, nunca `valorPrevisto`.
3. Remoção de conta: o valor entra na frase.
4. LGPD: o endpoint ganha a contagem antes — um `GET` de prévia (dry-run
   read-only) ou o próprio recurso respondendo a contagem para o diálogo
   exibir "Isto vai anonimizar N noivas" (openapi + codegen).
5. De carona, mesma tela do item 2: o asterisco órfão de "Motivo do
   cancelamento *" (`contratos/[id].tsx:693`) sai — é o único
   asterisco-de-obrigatório do app (pista B/F).

**Cuidados.** (a) A prévia da LGPD não escreve NADA — read-only de verdade, e a
contagem dela tem de bater com a do expurgo real na mesma fixture; (b)
`destrutivas-varredura.test.ts` continua cobrindo só a ausência — o texto é
prosa: os exemplos numéricos moram nos testes de front deste épico; (c)
openapi mudou → codegen + `tsc --build`; **regra 11** se o formato de resposta
mudar → E2E completo.

**Testes.** API: a prévia conta o mesmo que o expurgo executa; front: o diálogo
do estorno PARCIAL mostra R$ 300,00 (o caso literal da trilha C); o de
pagamento mostra valor + descrição.

**Primeira ação.** Reproduzir o caso PARCIAL numa fixture e fotografar o
diálogo dizendo R$ 1.000,00 — o vermelho-antes literal, no molde do que o E94
fez com o `alerta-caixa`.

---

## E129 — O filtro sobrevive à navegação: as 6 telas de `useState` passam para a URL

**Esforço: M** · **Fecha: D5 🟠**

**A dor.** Filtro em `useState` não morre só no F5 — morre no unmount. A
vendedora filtra a fila por ela mesma, aba Provas, clica numa noiva e volta:
zerado, 3 gestos de novo, a cada ida-e-volta do dia. As 6 no lado errado:
`pages/atendimentos/index.tsx:112-118` (busca, vendedora, situação, janela e
aba; só `?quando=historico` vai à URL, `:110`), `pages/noivas/index.tsx:47-50`
(busca, etapa e a PÁGINA — conferiu a ficha na página 3, voltou na 1),
`pages/orcamentos/index.tsx:62`, `pages/contratos/index.tsx:28`,
`pages/vestidos/index.tsx:145-152` (busca + 5 filtros; só a data na URL),
`pages/financeiro/conciliacao.tsx:169`. E o link não viaja: a dona filtra e
manda a URL, a colega abre a fila padrão. A convenção certa já é da casa em
**13 telas** (`pages/financeiro/receber.tsx:94-96`, pagar, fluxo, cobrança,
DRE, auditoria, comissões, `ajustes/index.tsx:67-69`…).

**Feito significa.** As 6 telas guardam filtro/página em `useSearchParams`;
ida-e-volta preserva; o link filtrado abre filtrado.

**Escopo técnico.** Migração tela a tela para `useSearchParams`, com: busca
debounced escrevendo com `replace` (não poluir o histórico), valores default
FORA da URL (URL limpa quando tudo é padrão), e o `?quando=historico` de
atendimentos preservado. Na conciliação, só os filtros — o extrato em memória
não vai à URL.

**Cuidados.** (a) Vem DEPOIS do E124 de propósito: os params novos de busca/
página de contratos e orçamentos já nascem na URL — migrar antes seria migrar
duas vezes; (b) nomes de params seguem os das 13 telas certas (`q`, `filtro`,
`ini`/`fim`…) — inventariar antes, não inventar; (c) page reset ao mudar a
busca (buscar da página 3 devolve vazio falso).

**Testes.** Front (MemoryRouter): setar filtro → navegar → voltar preserva;
URL com params abre filtrado; mudar `q` reseta `pagina`.

**Primeira ação.** `grep -l useSearchParams src/pages` e montar a tabela
param×tela das 13 certas — a convenção de nomes sai do que existe, e o
inventário §4 confere.

---

## E130 — O status ganha gramática: uma tabela semântica para o badge, e um primitivo por gesto de navegação

**Esforço: M** · **Fecha: A1 🟠, A3 🟡** · **Decide: P6 (a tabela default)**

**A dor.** O mesmo estado muda de cor entre telas e estados opostos dividem a
mesma cor: "Agendado" é rosa no dashboard (`pages/dashboard.tsx:424-431`) e
cinza na fila (`pages/atendimentos/index.tsx:315-320`) — onde **"Faltou" é o
mesmo cinza de "Agendado"**: o estado que pede reação não se distingue do que
está em dia. Cabine ativa é `default`/inativa `secondary`
(`pages/agenda/index.tsx:274`), vestido ativo é `secondary`/inativo `outline`
(`pages/vestidos/[id].tsx:287-289`); Cancelado = `destructive`
(`pages/contratos/index.tsx:115`), Recusado = `outline`
(`pages/orcamentos/index.tsx:244`). Medido: **6 combinações contraditórias em
7 telas**. E o gesto de navegação (A3, grau final 🟡): alternar visão tem aba
sublinhada em Atendimentos (`atendimentos/index.tsx:497-514`) e pílula em
Configurações (`configuracoes/index.tsx:82-88` — o único uso de `ui/tabs`);
navegar no domínio tem link-seta no Financeiro (`fluxo.tsx:153-174`) e botões
ghost na Agenda (`agenda/index.tsx:126-131`).

**Feito significa.** Existe UMA tabela semântica → variante, num lugar só, e as
7 telas a usam; "Faltou" se distingue de "Agendado" sem ler o texto; e cada
gesto de navegação tem um desenho, escrito.

**Escopo técnico.**
1. `lib/status-badge.ts`: a tabela do P6 (em dia = `default` · em andamento =
   `default` · terminou bem = `secondary` · terminou mal = `destructive` ·
   inativo = `outline` · precisa de reação = `--aviso`), com teste unitário que
   a trava; as 7 telas migram — o mesmo movimento que o E99 fez com a escala de
   dinheiro.
2. A3: duas línguas declaradas — **alternar a visão desta tela** = a aba
   sublinhada (o desenho de Atendimentos, o mais usado), **ir a outra tela do
   domínio** = o link-seta (o do Financeiro, que carrega bem seis destinos).
   Configurações e Agenda migram para a língua do seu gesto.

**Cuidados.** (a) Depois do E127 — a variante "precisa de reação" usa
`--aviso`; (b) variante nova de `Badge` nasce sobre token testado, nunca cor
crua; (c) as pílulas de FILTRO de Orçamentos/Contratos estão BEM (trilha A,
item 6) — filtro não é navegação, não tocar; (d) a decisão das duas línguas
fica escrita no próprio `status-badge.ts`/componente, para a rodada seguinte
não "melhorar".

**Testes.** Unitário da tabela (cada semântica → variante); grep-varredura
leve: nenhum mapeamento status→variant inline nas 7 telas migradas.

**Primeira ação.** Montar por grep a matriz real status × tela × variante — as
6 contradições enumeradas antes de escrever a tabela que as mata.

---

## E131 — O degrau maior do dinheiro entra na escala do dono nos 11 pontos que ficaram fora

**Esforço: M** · **Fecha: A2 🟠**

**A dor.** A escala é decisão do dono (2026-07-28, `index.css:307-334`: serif
no degrau maior, `tabular-nums` sempre) e o degrau de TOPO está fora dela em
**11 de 15 pontos**: `pages/dashboard.tsx:315,330,350` (`text-2xl font-bold`,
sem serif e sem `tabular-nums`); `pages/financeiro/cobranca.tsx:318` (via
`CardTitle`, que é `<div font-semibold>` sans — os 3 cards de faixa saem sans
enquanto receber/pagar/folha, o mesmo desenho, saem `money-lg` serif via
`ResumoCard`); `pages/financeiro/fluxo.tsx:295,302`;
`pages/minha-comissao/index.tsx:99,112,127,165` (serif à mão num degrau que não
existe). E onde foi adotada, é sobrescrita: `pages/comissoes/index.tsx:698`
(`money-lg text-2xl`) e `pages/financeiro/dre.tsx:197` (`money-lg text-4xl`).
O mesmo R$ 39.688,00 é sans-bold no dashboard e serif em Minha comissão, a um
clique — e os "três degraus" são hoje seis tamanhos efetivos.

**Feito significa.** Os 11 pontos usam `money-lg`/`money-md`; os 2 overrides de
tamanho caem; o mesmo número tem a mesma cara em qualquer tela.

**Escopo técnico.** Adoção ponto a ponto (a cobrança pode migrar direto para
`ResumoCard`, `pages/financeiro/helpers.tsx:32-55` — fecha o E126 item 2 de
carona na mesma moldura); remoção dos overrides de `comissoes:698` e `dre:197`.

**Cuidados.** (a) O cuidado (a) do E99 continua mandando: adoção onde a
divergência foi MEDIDA, não reescrita dos 92 call-sites de `brl()`; (b)
`escala-dinheiro.test.ts` defende as classes e de propósito não persegue
call-sites — não transformá-lo em varredura de call-site aqui; (c) verificação
visual nas 5 telas (dashboard, cobrança, fluxo, minha-comissao, dre), claro e
escuro.

**Testes.** Suítes verdes + capturas antes/depois das 5 telas.

**Primeira ação.** Reconferir os 11 pontos por grep (`text-2xl font-bold`,
`font-serif text-2xl`, `money-lg text-`) — o diagnóstico tem dias e o número de
pontos é a régua do "feito".

---

## E132 — O painel responde: todo cartão navega, e a costureira ganha o dela

**Esforço: M** · **Fecha: B8 🟡, D9 🟡, D10 🟡** · **Depois do E121 (mesmo arquivo)**

**A dor.** Metade dos cartões do painel navega e metade é morta com a mesma
cara: os 4 contadores (`pages/dashboard.tsx:250-300`) têm `hover-elevate` — que
promete clique — e nenhum `Link`; os dois de dinheiro logo abaixo (`:306,321`)
e o de comissão (`:341`) navegam. "Hoje na loja" lista os atendimentos sem
caminho para a fila (`:363-370`; o único link do card, no estado VAZIO, vai
para a agenda, `:380-386`) — a recepcionista inicia o primeiro e, para concluir
com desfecho, paga sidebar + busca, todo dia. E a 4ª persona do E66 ficou sem
cartão: `grep -i ajuste` devolve zero no dashboard (`:60-142`) — a costureira
loga e nada diz dos 5 ajustes que vencem na semana, enquanto a fila dela existe
com recorte na URL (`pages/ajustes/index.tsx:67-76`).

**Feito significa.** Os 4 contadores navegam para o seu destino óbvio; "Hoje na
loja" tem a porta para a fila; e a costureira abre o dia vendo os ajustes da
semana — num cartão que some quando vazio.

**Escopo técnico.**
1. `Link` nos 4 contadores (noivas, atendimentos, orçamentos, contratos).
2. Título/porta de "Hoje na loja" → `/atendimentos`.
3. Cartão "Ajustes da semana": a MESMA query do recorte `semana` de
   `/ajustes`, gateado pelo módulo, no padrão some-quando-vazio que o cartão de
   mensagens já usa (`dashboard.tsx:232-247`).

**Cuidados.** (a) DEPOIS do E121 — mesmo arquivo, e cartão clicável pressupõe
que o zero de falha não se disfarça de dado; (b) links com escopo de loja
(`useCaminhoDaLoja` — rotas planas são compatibilidade transitória, régua do
`replit.md`); (c) o gate do cartão espelha o servidor via `lib/permissoes` —
não inventar condição própria; (d) não criar agregado novo no servidor: a
query da fila serve.

**Testes.** Render: os cartões navegam (href certo com loja); o cartão de
ajustes aparece com fixture da semana e some sem nada.

**Primeira ação.** Conferir no `openapi.yaml` o recorte que `GET` de ajustes
aceita e rodar a chamada `semana` — o cartão nasce do contrato real, não da
suposição.

---

## E133 — O formulário avisa antes de perder: o hook existente nas 6 telas nuas

**Esforço: P** · **Fecha: B7 🟡**

**A dor.** 8 telas de formulário perdem tudo no clique da sidebar; 6 não têm
nem o `beforeunload` que já existe pronto
(`hooks/use-confirmar-saida.ts:31-42`): `vestido-form.tsx` (novo + editar),
`noivas/[leadId]/interesses.tsx:118-125` — **o formulário preenchido durante o
atendimento, com a noiva falando**: uma seleção por atributo + teto +
observações, zerado por um clique de conferência —, `catalogo/novo.tsx` (12
campos), `catalogo/[atributoId]/editar.tsx` (10) e `atendimentos/config.tsx`.
As meio-protegidas (`noiva-form.tsx:101`, `atendimentos/novo.tsx:165`) já usam
o hook.

**Feito significa.** As 6 telas avisam ao fechar/recarregar com trabalho sujo —
a metade do dano coberta por uma linha por tela.

**Escopo técnico.** `useConfirmarSaida(estaSujo)` nas 6, com o boolean honesto
de cada uma (RHF `formState.isDirty` onde há form; derivação explícita onde o
estado é `useState`).

**Cuidados.** (a) Não disparar pós-sucesso — `reset` antes de navegar (o
cuidado (c) que o E97 registrou); (b) a migração do roteador (`useBlocker`, que
cobriria o clique da sidebar de verdade) segue sendo a sobra S13 da rodada 6 —
este épico NÃO mexe no roteador; (c) o aviso nativo do `beforeunload` não é
customizável — não prometer texto.

**Testes.** Front: formulário sujo registra o listener; limpo/resetado, não.

**Primeira ação.** Mapear como cada uma das 6 telas guarda estado (RHF ou
`useState` — `interesses.tsx` e `config.tsx` são as suspeitas de estado solto):
o hook precisa de um "sujo" verdadeiro, e é aqui que um plano de gabinete
erraria.

---

## E134 — O módulo vestidos entra nas réguas de 2026: voz, dinheiro e uma porta de criação honesta

**Esforço: M** · **Fecha: B11 🟡, E11 🟡, F9 🔵** · **Decide: P5 (default: duas portas, a rápida declara)** · **Em sequência com E135 (mesmo arquivo)**

**A dor.** Três trilhas apontaram o mesmo bolsão pré-E92. Dinheiro:
`vestido-form.tsx:98`, `vestidos/index.tsx:343` e
`noivas/[leadId]/interesses.tsx:214` são `type="number" step="0.01"` — contra a
regra escrita no próprio repo (*"Nunca type=number para dinheiro: vira roleta e
muda o valor quando o dedo rola a página"*,
`components/dialogo-receber-parcela.tsx:147-149`): a vendedora cadastra o
vestido de R$ 4.200,00, rola a página e o scroll muda o preço sem ela ver. Voz:
os únicos 3 "com sucesso" do app (`vestidos/novo.tsx:51`,
`vestidos/index.tsx:273`, `vestidos/[id]/editar.tsx:229`) e 4 dos 6 "..."
datilografados (`vestidos/index.tsx:419`, `vestido-form.tsx:201`,
`[id]/editar.tsx:165,177`) moram aqui. Portas: "Novo vestido (completo)" e
"Novo Vestido" dividem o cabeçalho sem nada que diga quando usar qual
(`vestidos/index.tsx:301-313`) — e a rápida não tem foto nem características
(`:318` em diante), **as que casam vestido com noiva**
(`vestido-form.tsx:119-141`): quem usa sempre a porta primária povoa o acervo
com peças invisíveis para a curadoria.

**Feito significa.** Zero `type="number"` de dinheiro no app; zero "com
sucesso"/"..." no módulo; e a porta rápida declara o que fica faltando, com o
caminho "completar agora".

**Escopo técnico.**
1. Os 3 campos viram texto com `inputMode="decimal"` + `parseValor`
   (distinguindo `null` de `NaN` — o molde do E95); o de interesses vai junto
   (fora do módulo, mesma classe, 1 linha).
2. Toasts para "objeto + particípio" e "…" tipográfico.
3. **P5 default**: o diálogo rápido lista o que não cria (foto,
   características) e o toast de sucesso oferece "Completar agora →" para a
   edição da peça recém-criada.

**Cuidados.** (a) Capitalização e placeholders do módulo (F5/A4/F8) são do
E138 — não duplicar strings entre épicos; (b) `parseValor` já tem teste
(`lib/financeiro/dinheiro.test.ts:37-49`) — usar, não reescrever; (c) em
sequência com o E135 (mesmo `vestidos/index.tsx`), qualquer ordem, nunca em
paralelo.

**Testes.** Front: o campo aceita "4.200,50" e recusa sujo com mensagem; o
diálogo rápido mostra a declaração; grep: zero `type="number"` com `step` de
centavos em `pages/`.

**Primeira ação.** `grep -rn 'type="number"' src/pages src/components` —
confirmar que os vivos são exatamente os 3 (+ o de interesses) antes de trocar.

---

## E135 — A parede de filtros ganha teto: os mais usados à mostra, o resto atrás de "mais filtros" — e colapsada no celular

**Esforço: M** · **Fecha: D8 🟡, E13 🟡** · **Em sequência com E134 (mesmo arquivo)**

**A dor.** `pages/vestidos/index.tsx:470-488` desenha **um `<Select>` por
atributo ativo do catálogo, sem teto**, na fileira de busca + 3 selects fixos +
data. Num catálogo real de 8 atributos são 13 controles antes do primeiro
vestido (o volume da captura é fixture; o mecanismo sem teto é real). Em 390px
(`vestidos--390.png`) a fileira vira COLUNA: ~700px de formulário num viewport
de 844 — a primeira dobra é 100% filtro, e a vendedora com a noiva na cabine
rola filtros para chegar ao acervo.

**Feito significa.** Busca + selects fixos à mostra; os atributos atrás de
"Mais filtros" recolhido; abaixo de `md`, o bloco inteiro colapsa atrás de
"Filtrar (N)" com a contagem dos ATIVOS; e nenhum filtro aplicado se perde ao
colapsar.

**Escopo técnico.** O `atributosAtivos.map` entra num colapsável ("Mais
filtros", contador de ativos); abaixo de `md`, o bloco completo colapsa;
badges/resumo dos filtros ativos visíveis mesmo colapsado.

**Cuidados.** (a) A decisão E99 parte 7 fica DE PÉ: o conserto é de layout, não
paginação — o filtro dos 533 em memória continua instantâneo; (b) o E129 pôs
esses filtros na URL — o colapso lê e escreve o mesmo estado, não um paralelo;
(c) o contador é de filtros APLICADOS, não de disponíveis; (d) mesmo arquivo do
E134 — sequenciar.

**Testes.** Front: filtro aplicado dentro do colapsado continua filtrando e
aparece no contador; captura 390px antes/depois (a primeira dobra tem acervo).

**Primeira ação.** Contar os controles renderizados com o catálogo da fixture E
com um catálogo realista de 4–6 atributos, nas duas viewports — os dois números
do antes que o relatório de execução vai citar.

---

## E136 — Teclado e leitor de tela alcançam o que o dedo alcança: `<form>` no dinheiro, "Reagendar…" sem arrasto, headings nos cards

**Esforço: G** · **Fecha: E6 🟡, E10 🟡, E12 🟡**

**A dor.** Três lacunas da mesma família. **Enter**: o financeiro inteiro não
tem um `<form>` (grep confirmado em receber, pagar, `contratos/[id]`, folha) —
no diálogo de dinheiro mais usado (`components/dialogo-receber-parcela.tsx:136-196`),
depois de digitar o valor, registrar custa Tab→Tab→Tab→Tab→Enter: **5 teclas
onde a convenção universal é 1**; no celular, a tecla "ir" do teclado numérico
morre no vazio. **Arrasto**: reagendar e mover etapa só existem por arrasto —
os dois kanbans ligam Pointer/Touch e não o `KeyboardSensor` que o dnd-kit tem
(`pages/agenda/grade.tsx:83-88`, `pages/noivas/funil.tsx:96-101`), e não há
porta alternativa (`useUpdateAtendimento` tem 2 call-sites de horário; nenhum
formulário edita horário de atendimento marcado): quem navega por teclado não
reagenda NUNCA, e no toque arrastar meia tela em 390px é pontaria. **Headings**:
`CardTitle` é `<div>` (`components/ui/card.tsx:32-41`) em 52 arquivos — para
quem navega por cabeçalhos, gesto nº 1 de leitor de tela, a página tem o `h1` e
depois nada.

**Feito significa.** Enter conclui os fluxos de dinheiro; reagendar/mover etapa
existe por diálogo (teclado E toque de pontaria difícil); e as seções-card
entram na árvore de headings.

**Escopo técnico.**
1. `<form onSubmit>` nos diálogos/fluxos de dinheiro: receber, lançar despesa,
   pagamento rateado (`pagar.tsx`), gerar plano (`contratos/[id].tsx`), folha.
2. "Reagendar…" no cartão da grade (diálogo com data/hora/cabine sobre o
   `PATCH` existente) e "Mover para…" no cartão do funil — fallback que SOMA ao
   arrasto, não o substitui.
3. `CardTitle` vira `h3` por padrão (com `as`/`asChild` para exceções); conferir
   a hierarquia nas telas densas.

**Cuidados.** (a) Enter dentro de `textarea` não submete; o submit respeita o
`isPending` que já desabilita o botão; (b) o arrasto está BEM (delay 200ms,
trilha E item 1) — não tocar nos sensores existentes, só somar a porta; (c) o
item 3 muda a árvore de headings de 52 arquivos — verificação com a mesma
varredura de cabeçalhos que o E92 usou nas 6 rotas, e `h3` sob `h1` sem `h2` é
aceitável para Radix/axe, mas conferir onde já existe `h2` de seção; (d) épico
G: os itens 1–2 são o núcleo; o 3 é cortável para sobra se estourar — registrar
o veredito se cortar.

**Testes.** Front: Enter no diálogo de receber dispara o submit (jsdom);
o cartão da grade reagenda por diálogo sem `dnd`; snapshot da árvore de
headings de 2 telas densas antes/depois.

**Primeira ação.** `grep -rn "onSubmit\|<form" src/pages/financeiro
src/components/dialogo-receber-parcela.tsx` — confirmar o zero e listar os
diálogos de dinheiro: o inventário do item 1 é o escopo real do épico.

---

## E137 — A régua dos 44px fecha: os dois overrides de 24px caem e o `default` mobile é decidido de uma vez

**Esforço: P** · **Fecha: E8 🟡, E9 🟡** · **Decide: P3 (default: sim, 44px)**

**A dor.** Dois alvos derrotam a régua por `className`: o X "Dispensar" do sino
(`components/sino-notificacoes.tsx:244`) e o do checklist de devolução
(`pages/reservas/[bloqueioId].tsx:858-866`) passam `h-6 w-6` a um
`Button size="icon"`, anulando o `h-11 w-11` mobile do próprio componente —
**24×24px**, e o do sino fica colado no `<Link>` do aviso (`:231-240`): errar o
X por 10px NAVEGA em vez de dispensar, no header, de polegar. E a metade adiada:
`default: "min-h-9"` = 36px em qualquer viewport (`components/ui/button.tsx:37`),
enquanto o comentário do próprio arquivo (`:30-34`) enuncia a régua como
universal — o E92 mediu 60 alvos abaixo de 44px em Atendimentos e 23 em
Vestidos e **adiou, não recusou**.

**Feito significa.** Nenhum alvo tocável abaixo de 44px no mobile por override;
o `default` cumpre a régua que o componente enuncia (P3).

**Escopo técnico.** 1. Os dois overrides ganham alvo tocável (área de toque via
padding, ou o override só vale de `md` para cima). 2. `default` ganha
`min-h-11` abaixo de `md` — desktop intacto.

**Cuidados.** (a) O item 2 muda a altura de todo botão mobile — verificação
visual nas duas telas que o E92 mediu (Atendimentos, Vestidos), e reverter é 1
linha se o dono discordar do default P3; (b) não mexer em `sm`/`icon` — já
cumprem; (c) o X do sino continua PERTO do link por design — o conserto é
tamanho, não posição.

**Testes.** Suítes verdes; conferência em 390px das duas telas densas e do
popover do sino.

**Primeira ação.** Reconferir com DevTools os alvos de Atendimentos em 390px
antes e depois do `min-h-11` — o número do E92, remedido, é o parágrafo de
verificação do relatório.

---

## E138 — Uma passada de voz: uma grafia, uma capitalização, uma gramática de validação e a linha de propósito nas 5 telas mudas

**Esforço: M** · **Fecha: A4 🟡+F5 🔵 (mesmo achado), A7 🔵+F10 🔵 (mesmo achado), A6 🟡, F2 🟡, F3 🟡, F4 🟡, F6 🔵, F7 🔵, F8 🔵** · **Depois do E122** · **Decide: P4 (default: "ateliê")**

**A dor.** Onze achados de duas trilhas, todos strings. Title Case em 9 rótulos
("Novo Vestido" encostado em "Novo vestido (completo)" no mesmo cabeçalho,
`pages/vestidos/index.tsx:305,313`; "Loja Atual", "Duração Prova", "Valor
Total", "Forma de Pagamento Base" e **"CPF Cliente"** — o único "cliente" num
sistema que fala "noiva", `pages/contratos/[id].tsx:428,436,443`). Duas
gramáticas de validação — 20 "é obrigatório" contra 10 imperativas que dizem o
conserto, as duas na MESMA função (`pages/financeiro/folha.tsx:154,159`).
"Ateliê" no menu contra "atelier" em 8 frases, 2 ditas à noiva
(`components/layout/sidebar.tsx:63` vs `pages/noiva-portal.tsx:323,360`…).
"Lente" dos documentos de revisão no vazio de /noivas
(`pages/noivas/index.tsx:208`). A volta que chama `/financeiro` de dois nomes
("← Financeiro" ×3, "← Fluxo de caixa" em `pages/financeiro/projecao.tsx:219`)
e "Auditoria" na porta vs "Trilha de auditoria" na tela. Os 3 "(s)" — um do
SERVIDOR (`api-server/src/routes/agenda.ts:420`). "anteriores"/"passadas" nas
gêmeas + o único `AlertDialogTitle` sem pergunta
(`pages/reservas/[bloqueioId].tsx:949`). "Escolha"×"Selecione" no mesmo
formulário + o placeholder "5000" no campo de dinheiro mais digitado
(`pages/orcamentos/[id].tsx:923`). E as 5 telas do menu sem a linha de
propósito (Agenda, Vestidos, Orçamentos, Contratos, Configurações — as âncoras
em A7/F10) + "Acesso ao sistema" no login (`pages/login.tsx:58`), a frase mais
fria do app na porta de entrada.

**Feito significa.** Uma grafia (P4), sentence case nos 9, uma gramática de
validação (a imperativa, que ensina), zero "(s)", a mesma palavra para a mesma
volta, a linha de propósito nas 5 telas e um login que fala como o resto da
casa.

**Escopo técnico.** Uma passada de strings, um commit — com `agenda.ts:420`
como a única linha de servidor (pluralizar à mão no `detalhe`, como
`pages/equipe/atividade.tsx:92` faz na tela). Validações migram para o
imperativo-que-ensina ("Informe o valor — ex.: 2.500,00"). O título de
`reservas/[bloqueioId].tsx:949` vira a pergunta que a descrição já tem.

**Cuidados.** (a) DEPOIS do E122 — o título canônico da falha é de lá; esta
passada **não toca toast de erro**; (b) o que é do módulo vestidos em
voz-de-toast (F9) já foi no E134 — conferir antes para não colidir no mesmo
arquivo; (c) `agenda.ts:420` muda uma frase que um toast lê — o formato não
muda, mas rodar o E2E completo é barato e a regra 11 é conservadora: rodar;
(d) as linhas de propósito seguem o tom das 17 existentes (uma frase, ponto
final), não marketing.

**Testes.** Greps de regressão citados no relatório: zero Title Case nos
rótulos listados, zero "atelier" visível, zero "(s)", zero "lente" em
`pages/`; suítes + E2E verdes.

**Primeira ação.** Regrep de cada contagem (9 Title Case, 20/10 validação,
8 "atelier", 3 "(s)") — os números do diagnóstico têm dias e a lista literal é
o checklist do commit.

---

## E139 — Fechar o mês vira roteiro: três passos numerados com estado na Folha

**Esforço: M** · **Fecha: B10 🟡**

**A dor.** Fechar o mês são 5 visitas a 4 telas (Comissões → Folha → Pagar →
Folha → DRE) com a ordem escrita em lugar nenhum — o próprio repo admite
(`components/layout/sidebar.tsx:79-83`: *"oito telas sem ordem declarada"*,
F31/E103, que consertou só a porta). Quem fecha é a dona, uma vez por mês —
frequência baixa demais para decorar, alta demais para redescobrir. O
`isNull(enviadoContabilidadeEm)` segura o dano de dinheiro (por isso 🟡); o
custo é confusão e retrabalho mensais.

**Feito significa.** A Folha mostra "Fechar o mês" em três passos numerados —
comissões fechadas? contas pagas? enviado? — cada um com o estado real e o link
para a tela do passo.

**Escopo técnico.** Um bloco na Folha (a tela onde o F31/E103 já pôs a porta)
derivando os três estados das rotas que as telas de destino já consomem
(fechamento da competência em Comissões, contas em aberto da competência em
Pagar, `enviadoContabilidadeEm` na própria Folha); competência nomeada por
`rotuloCompetencia()`.

**Cuidados.** (a) Estado honesto — "carregando" não vira "pendente" (a lição do
E121 vale no nascimento); (b) preferir derivar das rotas existentes; um
agregado novo só se a conta provar que precisa (e aí: openapi + codegen +
regra 11); (c) links com escopo de loja; (d) `rotuloCompetencia()` e
`capitalizar()` — nunca `className="capitalize"` (régua do `replit.md`).

**Testes.** Render com fixtures nos três estados (nada feito / metade / tudo);
os links apontam a tela certa da competência certa.

**Primeira ação.** Mapear de quais respostas saem os três estados HOJE (rodar
as três queries numa fixture fechada e numa aberta) — antes de decidir se
algum agregado falta de verdade.

---

## E140 — O WhatsApp entra no cadastro inline, no único momento em que é grátis

**Esforço: P** · **Fecha: B9 🟡**

**A dor.** O cadastro no clique do combobox manda só `noivaNome` + `origem`
(`components/combobox-noiva.tsx:126-131`) — e a jornada é literalmente "a noiva
está NO TELEFONE": o número está na mão da recepcionista naquele segundo. Sem
ele, o toast pós-agendamento nem oferece a confirmação
(`pages/atendimentos/novo.tsx:341-356`), a fila do dia degrada para o lápis
"Sem WhatsApp" (`pages/mensagens/index.tsx:320`), e completar depois custa +5
gestos que competem com a loja cheia.

**Feito significa.** O popover do cadastro inline tem um campo opcional de
WhatsApp; preenchido, a confirmação das 48h sai; vazio, nada trava.

**Escopo técnico.** Um `Input type="tel"` opcional no popover, enviado no POST
do lead (conferir no `openapi.yaml` que o input do lead já aceita o campo — a
edição da ficha o salva, então o shape deve existir).

**Cuidados.** (a) A decisão F4 fica: origem continua obrigatória e sem default
silencioso; (b) opcional DE VERDADE — o fluxo rápido de 2 campos não pode virar
3 obrigatórios; (c) `type="tel"` (a régua do E92 para teclado certo), sem
máscara nova — o formato que a ficha aceita.

**Testes.** Front: cadastro com e sem número; com número, o lead nasce com
WhatsApp e a fila o mostra sem o lápis.

**Primeira ação.** Ler o schema do POST de lead que o combobox usa no
`openapi.yaml` e conferir o nome/formato do campo de WhatsApp que a ficha
salva — o contrato antes do campo.

---

## E141 — ⌘K: a busca de noivas a um atalho de qualquer tela

**Esforço: M** · **Fecha: D6 🟡** · **Melhor depois do E124**

**A dor.** A noiva no telefone, a vendedora em qualquer tela: o caminho é
sidebar → Noivas → campo → digitar → Detalhes — 3 cliques + digitação + 300ms,
toda vez, e de um formulário a escada ainda descarta o que estava digitado. O
primitivo está pago: cmdk é dependência viva
(`components/combobox-noiva.tsx:91,174` busca noivas server-side dentro de
formulários), e a busca certa existe (`routes/leads.ts:120-133`, acha por nome,
noivo e dígitos de telefone). A sidebar não tem um campo de busca
(`components/layout/sidebar.tsx:121-179`).

**Feito significa.** ⌘K/Ctrl+K (e um gatilho visível no header) abre a busca de
noivas de qualquer tela logada; Enter navega para a ficha; quem não vê o módulo
de noivas não vê a busca.

**Escopo técnico.** Um `CommandDialog` global no `app-layout` com a MESMA busca
server-side (`?q=`, `ordem: "recentes"`, debounce), resultado → ficha; entradas
de navegação (telas do menu) de carona só se couber — cortável sem culpa.

**Cuidados.** (a) `app-layout` é módulo ANSIOSO (gotcha do `replit.md`: o
import morto do dashboard prendeu 103 kB no caminho crítico de todo mundo) —
o diálogo entra por `lazy` e o épico MEDE o chunk antes/depois
(`PORT=5173 BASE_PATH=/ pnpm --filter @workspace/moscow-noivas run build`);
(b) o atalho não dispara dentro de input/textarea nem briga com o navegador;
(c) gate espelha `lib/permissoes` — a autoridade é o servidor; (d) o sino de
notificações no PORTAL foi recusado no E100 parte 3 — nada aqui toca o portal.

**Testes.** Front: o atalho abre, a busca chama o endpoint com `q`, Enter
navega com escopo de loja; o gate esconde para quem não pode.

**Primeira ação.** Rodar o build com relatório e anotar o tamanho atual da
entrada + `modulepreload` — o número que o cuidado (a) proíbe piorar.

---

## E142 — O relatório de conversão aprende a pergunta "e neste período?"

**Esforço: P** · **Fecha: D7 🟡**

**A dor.** `routes/leads.ts:197-225` agrega por origem e motivo sobre TODOS os
leads da história — o `WHERE` é só `lojaId` — e a tela não tem o que passar
(`pages/noivas/conversao.tsx:50-63`). A dona que trocou o investimento de canal
quer saber se funcionou três meses depois: os ~120 leads do trimestre pesam
~15% do número que a tela mostra, e a campanha nova fica invisível na média de
3 anos — enquanto DRE, fluxo, auditoria e utilização, os vizinhos, todos
recortam por janela na URL.

**Feito significa.** A rota aceita `de`/`ate`; a tela oferece o recorte com o
estado na URL; sem parâmetro, o comportamento é o de hoje (história inteira).

**Escopo técnico.** `openapi.yaml`: `de`/`ate` opcionais no GET de conversão;
o `WHERE` ganha o recorte por `createdAt` do lead; a tela ganha o seletor de
período no padrão dos relatórios vizinhos, com `useSearchParams`.

**Cuidados.** (a) Codegen + `tsc --build`; (b) recorte por dia local — a régua
de datas do `replit.md` (`hojeLocal()`/`inicioDoDia()`, nunca `new Date()` +
`setHours` cru); (c) shape da resposta NÃO muda (mesmos campos, linhas
recortadas) — se mudar, regra 11 e E2E; (d) taxa com numerador E denominador do
mesmo período — o teste de fixture prova.

**Testes.** API: fixture com leads de duas épocas — o recorte conta só a época
pedida e a taxa fecha; sem params, o total histórico de hoje. Front: a URL
carrega o período.

**Primeira ação.** Escrever o teste de API com a fixture de duas épocas e vê-lo
falhar contra a rota atual — a prova de que o relatório soma a vida inteira,
em número.

---

## Rastreabilidade

A tabela achado → épico é a da consolidação
(`docs/revisao/2026-07-30-rodada-7-design/g-consolidado.md`), 58/58. As sobras
S-D1–S-D7 seguem na tabela do rastreador
(`docs/revisao/2026-07-30-rodada-7-design/EXECUCAO.md`) — são trabalho fora do
escopo de UX, não achados perdidos; S-D4 é decidida pelo E120 (P1), S-D5 é
executada pelo E124, S-D7 tem a instância de dinheiro fechada pelo E127 e a
auditoria das demais varreduras continua sobra.
