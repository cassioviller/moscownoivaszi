# Trilha F — a voz que o E92 criou é boa e é UMA; o que sobrou são cinco jeitos de dizer "falhou", duas gramáticas de validação e um módulo (vestidos) que a régua não alcançou

**Rodada 7 (design), sessão 1 — 2026-07-30.** Método: grep sistemático por
strings visíveis em `artifacts/moscow-noivas/src/` — títulos de toast
(`title:`), `AlertDialogTitle`/`Description`/`Action`, mensagens zod
(`.min()`/`.email()`), placeholders, `<Vazio>`, h1 e subtítulos das 19 telas do
menu, mais o `detalhe` que o servidor manda em `api-server/src/routes/` —
amostrando as 54 telas do inventário. Em contexto: 10 capturas `--claro`
(login, dashboard, mensagens, cobranca, portal-noiva, configuracoes, equipe,
folha, conciliacao, noivas-ficha) mais provas (viewport 1280×800; locale da
interface **en-US**, provada pela trilha E — nenhum achado aqui depende dela).
Pistas herdadas assumidas: "anteriores vs passadas" (A) → F7, o "(s)" e o
"Remover ajuste" sem pergunta (C) → F6 e F7, "lente" (D) → F4. A pista da B
(53 toasts com `err.message` cru) **já é o C4** — o mecanismo é de lá; o que a
F acrescenta é a camada de cima do mesmo toast, o TÍTULO (F1). Decisões
registradas conferidas: nenhuma das listadas toca microcopy.

## F1 🟡 — O título da falha tem cinco formulações: "Erro ao X" em 76 toasts, e a voz que o METODO celebra ("Não consegui entrar") ficou em 14

**Âncoras:** grep `title: "Erro` → **76** toasts em 24 arquivos (ex.:
`pages/financeiro/pagar.tsx:295` "Erro ao pagar", `pages/contratos/[id].tsx:321`
"Erro ao receber", `pages/orcamentos/[id].tsx:420-566` — 8 na mesma tela);
contra **1** "Não consegui entrar" (`pages/login.tsx:40`), **5** "Não foi
possível X" (`pages/trocar-senha.tsx:63`, `pages/agenda/grade.tsx:166`,
`pages/convite.tsx:72`, `pages/noivas/funil.tsx:129`,
`components/historico-contato.tsx:75`), **8** "Não deu para X"
(`pages/equipe/index.tsx:173`, `pages/configuracoes/backup.tsx:122`,
`components/combobox-noiva.tsx:146`, …) e **2** "Essa mudança não é possível
agora" (`pages/dashboard.tsx:169`, `pages/atendimentos/index.tsx:262`). A
pessoa gramatical também oscila: o login fala em primeira do singular ("Não
consegui"), o 404 em primeira do plural ("Não encontramos esta página",
`pages/not-found.tsx:13`).

**Cenário:** a vendedora que erra a senha lê "Não consegui entrar" — o sistema
assume. Dez minutos depois, ao receber uma parcela com a sessão vencida, lê
"Erro ao receber" — o rótulo técnico. São o MESMO evento (a ação não
aconteceu, ninguém tem culpa), em cinco vozes. O corpo do toast já convergiu
(o C4 fecha o que falta de `mensagemApi`); o título é a única camada em que a
régua do E92 nunca foi escrita. Não custa tempo — custa a unidade do
personagem, que é exatamente o que esta trilha mede: 76 contra 16, o padrão
minoritário é o que o METODO cita como conquista.

## F2 🟡 — A validação fala duas gramáticas: 20 mensagens declaram a regra ("Nome é obrigatório") e 10 dizem o conserto ("Escolha a noiva") — a mesma função usa as duas

**Âncoras:** grep por `obrigatóri` em strings → **20** (ex.:
`pages/equipe/index.tsx:71` "Nome é obrigatório",
`pages/orcamentos/[id].tsx:103-104` "Descrição obrigatória"/"Valor
obrigatório", `pages/login.tsx:14` "Senha é obrigatória"); imperativas → **10**
(`pages/atendimentos/novo.tsx:80-85` "Escolha a noiva"/"Escolha a
cabine"/"Informe a data"/"Informe a hora", `pages/orcamentos/index.tsx:49`
"Escolha a noiva"); mais **3** "deve ter" (`pages/equipe/index.tsx:73`). O
contraste mora dentro de um mesmo arquivo e até de uma mesma função:
`pages/orcamentos/[id].tsx` diz "Descrição obrigatória" na linha 103 e
"Informe o primeiro vencimento" na 122; `lerValorEDia` em
`pages/financeiro/folha.tsx` responde "Valor inválido" na linha 154 (culpa,
sem conserto) e "O dia de vencimento vai de 1 a 31" na 159 (a regra inteira,
com o conserto dentro).

**Cenário:** a dona definindo o salário-base erra o valor e o dia no mesmo
envio: para o valor o sistema a culpa sem dizer o formato; para o dia, ensina.
A gramática imperativa ("Escolha…", "Informe…") é a que diz o que fazer — e é
a minoritária, 10 contra 23.

## F3 🟡 — A palavra da casa tem duas grafias na mesma tela: "ATELIÊ" no menu e "atelier" em 8 frases — duas delas ditas à noiva no portal

**Âncoras (dupla):** captura `capturas/provas--claro.png` — a sidebar mostra o
grupo "ATELIÊ" e o subtítulo da mesma tela diz "As próximas provas do
atelier". Código: `components/layout/sidebar.tsx:63` (`titulo: "Ateliê"`)
contra **8 ocorrências visíveis** de "atelier": `pages/provas/index.tsx:84` e
`:115`, `pages/noivas/index.tsx:195` ("O atelier aguarda a primeira noiva."),
`pages/financeiro/fluxo.tsx:150`, `pages/financeiro/pagar.tsx:398`,
`pages/reservas/[bloqueioId].tsx:549`, e — ditas à noiva —
`pages/noiva-portal.tsx:323` ("Avisamos o atelier") e `:360` ("Confirmar avisa
o atelier que você vem"). O placeholder da ficha usa a terceira via:
"fechou com ateliê X" (`pages/noivas/[leadId]/index.tsx:359`).

**Cenário:** quem olha a tela de Provas vê as duas grafias a 300px de
distância uma da outra, toda vez. As duas formas existem em português, mas um
sistema escolhe UMA — e a que está no menu (a mais oficial das posições)
perde de 8 a 1 para a prosa. Fricção zero por clique; é a marca da colagem na
palavra que dá nome ao negócio.

## F4 🟡 — "Nenhuma noiva nesta lente": o vocabulário dos documentos de revisão vazou para o vazio que a vendedora mais encontra

**Âncoras:** `pages/noivas/index.tsx:208` — o vazio da lista filtrada de
noivas diz "Nenhuma noiva nesta lente no momento." "Lente" é o termo com que
ESTA revisão nomeia as trilhas (`docs/revisao/METODO.md`); na tela da
vendedora não significa nada. No mesmo raio: "Nenhuma competência sua foi
fechada ainda" (`pages/minha-comissao/index.tsx:210`) usa o termo contábil
seco com a pessoa menos contábil da equipe — enquanto a Folha, para a
persona certa, explica a palavra na frase ("O que se repete todo mês … vira
conta a pagar", `pages/financeiro/folha.tsx:421-423`; o veredito do C sobre a
FORMA desse vazio segue valendo — aqui o ponto é a palavra).

**Cenário:** a vendedora busca "Mariana" com a etapa "Perdida" ligada, acha
zero e lê uma frase com uma palavra que não é dela. O vazio da tela irmã
(vestidos) mostra a régua certa: "O acervo tem vestidos — nenhum deles bate
com esta combinação" (`pages/vestidos/index.tsx:573`). É trocar uma palavra:
"nesta busca", "com estes filtros".

## F5 🔵 — Nove rótulos em Title Case contra o sentence case de todo o resto — e "CPF Cliente" é o único "cliente" num sistema que fala "noiva"

**Âncoras (dupla):** capturas `vestidos--claro.png` (botão "Novo Vestido") e
`configuracoes--claro.png` ("Loja Atual", "Duração Prova"). Código — os nove:
`pages/vestidos/index.tsx:318` ("Novo Vestido"; a página irmã grafa "Novo
vestido", `pages/vestidos/novo.tsx:72`), `pages/orcamentos/index.tsx:143`
("Novo Orçamento"), `pages/configuracoes/index.tsx:83` ("Loja Atual") e `:154`
("Duração Prova"), `pages/contratos/[id].tsx:428` ("Valor Total"), `:436`
("Forma de Pagamento Base") e `:443` ("CPF Cliente"),
`pages/vestidos/[id].tsx:335` e `pages/vestidos/index.tsx:341` ("Preço
Base"). A norma do app é sentence case — todos os 19 h1 do menu, "Novo
atributo" (`pages/catalogo/novo.tsx:93`), "Nova senha"
(`pages/trocar-senha.tsx:97`).

**Cenário:** o mesmo gesto (criar um registro) tem botão "Novo Vestido" numa
tela e "Novo atributo" na outra; e o contrato — o documento mais formal do
sistema — é a tela com mais rótulos fora da norma (3), um deles chamando a
noiva de "Cliente", palavra que não existe em nenhuma outra tela.

## F6 🔵 — O "(s)" sobrevive em 3 frases num app que pluraliza à mão com capricho em 12+ — uma delas vem do servidor

**Âncoras:** `pages/financeiro/conciliacao.tsx:202` ("N movimento(s)
conferido(s)" no toast de sucesso da conferência),
`pages/noivas/[leadId]/lookbook.tsx:278` ("vestido(s)" no diálogo de
revogação) e `api-server/src/routes/agenda.ts:420` ("N ajuste(s) de costura
que sumiriam junto" — o `detalhe` que o servidor escreve e o toast mostra).
Contra a norma da casa: `pages/mensagens/index.tsx:202` ("mensagens prontas"
flexionado por contagem), `pages/agenda/index.tsx:253` ("procurada(s)" feito à
mão certo), `pages/equipe/atividade.tsx:92` (até "ação sensível/ações
sensíveis" com dupla flexão), `pages/configuracoes/privacidade.tsx:44` — 12+
pontos medidos pelo grep de `=== 1 ?`.

**Cenário:** a dona concilia o extrato do mês e o toast de vitória — a frase
que fecha uma hora de trabalho — é a única da tela escrita em burocratês de
formulário. Herdada da trilha C, assumida aqui; a do servidor exige mexer na
rota, não só na tela.

## F7 🔵 — As três gêmeas de "ver o passado" usam duas palavras ("anteriores"/"passadas"), e 1 dos 16 diálogos de confirmação é o único que não pergunta

**Âncoras:** "Ver provas anteriores" (`pages/provas/index.tsx:88`, h1
"Provas anteriores" em `:80`) e "Ver atendimentos anteriores"
(`pages/atendimentos/index.tsx:644`) contra "Ver reservas passadas"
(`pages/reservas/index.tsx:74`, h1 "Reservas passadas" em `:66`) — mesmo
mecanismo (toggle do corte futuro/passado do E87), 2 palavras. E dos 16
`AlertDialogTitle` do app, 15 perguntam nomeando o objeto ("Remover a escada
de {nome}?", `pages/comissoes/index.tsx:1199`; "Estornar este recebimento?",
`pages/financeiro/receber.tsx:398`); "Remover ajuste"
(`pages/reservas/[bloqueioId].tsx:949`) é o único título afirmativo — e a
pergunta que faltou no título está duplicada na descrição (`:951-952`,
"Remover o ajuste \"{descricao}\"?").

**Cenário:** ambos herdados (A e C), assumidos aqui por serem a mesma classe:
o padrão existe e está a um substantivo de fechar — nos dois casos o desvio é
em `reservas/`.

## F8 🔵 — O formulário de atendimento pede escolha com dois verbos, e o único placeholder de dinheiro que não ensina o formato é o do orçamento

**Âncoras:** em `pages/atendimentos/novo.tsx`, o MESMO formulário:
placeholder "Selecione a noiva…" (`:473`), "Escolha o vestido…" (`:505`),
"Selecione o vestido reservado…" (`:549`), "Selecione…" (`:580`, `:604`) — e o
zod do campo da noiva diz "Escolha a noiva" (`:80`): a dica e o erro do mesmo
campo usam verbos diferentes. No app: "Escolha"/"Escolher" em 7 placeholders,
"Selecione" em 6. E o placeholder do valor do item do orçamento — o campo de
dinheiro mais digitado da casa — é "5000" (`pages/orcamentos/[id].tsx:923`),
contra "0,00" das 7 irmãs (`components/dialogo-receber-parcela.tsx:155`,
`pages/financeiro/pagar.tsx:644`, …) e "2.500,00" da folha
(`pages/financeiro/folha.tsx:587`). O `parseValor` aceita os dois formatos
(`lib/financeiro/dinheiro.test.ts:37-49`), então não há perda — há só o único
exemplo que ensina a digitar sem vírgula. De passagem, a mesma classe:
"Motivo do cancelamento *" (`pages/contratos/[id].tsx:693`) é o único
asterisco-de-obrigatório do app inteiro — convenção que aparece uma vez não é
convenção.

**Cenário:** quem preenche o atendimento novo lê dois verbos para o mesmo
gesto em campos vizinhos. Zero custo por clique; é a costura aparente.

## F9 🔵 — "com sucesso" só existe no módulo de vestidos (3×), o mesmo módulo que ficou com "..." — o cadastro do acervo é o bolsão que a passada de voz do E92 não alcançou

**Âncoras:** os toasts de sucesso do app convergiram em "objeto + particípio"
seco — "Recebimento registrado", "Portal revogado", "Senha trocada", "Salário
definido" (40+ títulos no grep de `title:` sem uma palavra a mais). As únicas
exceções: "Vestido cadastrado com sucesso" (`pages/vestidos/novo.tsx:51` e
`pages/vestidos/index.tsx:273`) e "Vestido atualizado com sucesso"
(`pages/vestidos/[id]/editar.tsx:229`). O mesmo módulo concentra o "..."
datilografado onde o app usa o caractere "…" (62 rótulos de espera): "Salvando..."
(`pages/vestidos/index.tsx:419`, `pages/vestidos/vestido-form.tsx:201`),
"Enviando..."/"Removendo..." (`pages/vestidos/[id]/editar.tsx:165`, `:177`) —
fora dele só login (`pages/login.tsx:104`) e selecionar-loja (`:134`). Somado
ao "Novo Vestido"/"Preço Base" do F5 e ao `type=number` que a trilha B achou
(`vestido-form.tsx:98`), o mapa é um só: **as telas de cadastro de vestido são
o bolsão pré-E92** — um épico que passe a régua ali fecha metade dos achados
🔵 desta trilha de uma vez.

## F10 🔵 — Cinco telas do menu abrem sem a linha que explica; catorze explicam — e a porta de entrada tem a frase mais fria do app

**Âncoras:** o padrão da casa é h1 + uma linha de propósito: "Acompanhe com
delicadeza as parcelas em aberto. A mais atrasada vem primeiro."
(`pages/financeiro/cobranca.tsx:276`), "O que precisa da sua atenção agora."
(`pages/dashboard.tsx:221`), e mais 12. Abrem mudas: Agenda
(`pages/agenda/index.tsx:121`), Vestidos (`pages/vestidos/index.tsx:289`),
Orçamentos (`pages/orcamentos/index.tsx:117`), Contratos
(`pages/contratos/index.tsx:40`) e Configurações
(`pages/configuracoes/index.tsx:79`). E o login — a única tela que TODA
pessoa vê todo dia — tem como subtítulo "Acesso ao sistema"
(`pages/login.tsx:58`, captura `login--claro.png`): a única frase do app que
soa a crachá, na porta de um produto que diz "Seu dia, Maria" na sala.

**Cenário:** polimento puro — mas é o polimento que define o personagem: a
tela que explica a que veio é a marca registrada desta casa, e falta
exatamente nas quatro listas que a vendedora mais abre.

## O que está BEM — a voz conquistada, com nome, para ninguém desfazer

1. **O sucesso fala numa língua só:** "objeto + particípio", sem "com sucesso",
   em 40+ toasts ("Recebimento registrado", "Portal revogado", "Orçamento
   aprovado") — não acrescentar palavras.
2. **`lib/erro-api.ts` e o `<Erro>` canônico** (E92): a ordem código → `detalhe`
   → faixa → fallback da tela, e o componente compartilhado que nasceu matando
   a perna `err.message` (`components/estado/index.tsx:64-97`). O C4 completa a
   adoção; a régua em si está certa.
3. **A copy da régua destrutiva E10:** 15 de 16 `AlertDialogTitle` perguntam
   nomeando o objeto, a ação nomeia o verbo ("Estornar", "Remover", "Cancelar
   atendimento") — **não existe UM "Confirmar"/"OK"/"Sim" no app inteiro**
   (grep por `>(Confirmar|OK|Enviar)<`: zero). E a cláusula do que-se-perde em
   dinheiro está viva: "Isto vai lançar N comissões em contas a pagar, somando
   R$ X" (`pages/comissoes/index.tsx:588`).
4. **Os vazios que ensinam** (E96): "O acervo ainda está vazio — cada vestido
   cadastrado passa a aparecer no orçamento, na reserva e na prova"
   (`pages/vestidos/index.tsx:560-561`), e o vazio de filtro que afirma o que
   EXISTE ("O acervo tem vestidos — nenhum deles bate com esta combinação",
   `:573`).
5. **O microcopy que carrega o modelo mental:** "Abrir o WhatsApp registra que
   **você procurou** e tira a linha da fila" (`pages/mensagens/index.tsx:269`,
   captura `mensagens--claro.png`) com o desfazer honesto "Não procurei"; e
   "Cada recorrência ativa vira uma conta a pagar desta competência. Gerar de
   novo não duplica nada — o que já foi lançado é pulado"
   (`pages/financeiro/folha.tsx:446-447`) — idempotência explicada sem a
   palavra.
6. **O jargão desarmado onde mora:** "Suba o extrato que o seu banco exporta
   (OFX ou CSV) … O arquivo é lido aqui mesmo — nada sai do seu computador"
   (`pages/financeiro/conciliacao.tsx:220-221`).
7. **Menu e h1 contam a mesma história** (E82): 18 de 19 itens da sidebar
   (`components/layout/sidebar.tsx:50-98`) batem literalmente com o h1 da tela
   — a exceção consciente é "Atendimentos" → "Atendimentos e provas"
   (`pages/atendimentos/index.tsx:467`).
8. **A voz com a noiva é quente e em "você":** "O lugar de {nome}", "A mensagem
   já vai com o seu nome — é só enviar" (`pages/noiva-portal.tsx:120`, captura
   `portal-noiva--claro.png`) — o único "a gente" do app (`:360`) está aqui, e
   aqui ele cabe.
9. **O motor do próximo passo fala a tese do negócio em uma frase:** "Orçamento
   aberto que não chega à noiva não vira contrato."
   (`lib/proximo-passo.ts:91`, captura `noivas-ficha--claro.png`) — copy como
   régua de trabalho, não decoração.
10. **Nenhum inglês, nenhum código cru, nenhum placeholder gringo** nas strings
    visíveis (varrido por grep): os códigos de erro viram frase nos dicionários
    `MENSAGENS_ERRO` de 7 telas, e todos os 60+ placeholders são pt-BR com
    exemplo real ("Ex.: bainha 3cm", "vai pagar dia 15").

## Pistas laterais — de outras trilhas

- **(G/consolidação — o bolsão vestidos)** F5 + F8 + F9 + o `type=number` da
  trilha B (`vestido-form.tsx:98`) apontam o mesmo lugar: as telas de cadastro
  de vestido são pré-E92. Um único épico "passar a régua da voz no módulo
  vestidos" fecha 6 desvios de uma vez — mais barato que 6 consertos avulsos.
- **(C — o fallback duplicado)** O `<Erro>` canônico tem fallback "Falha
  inesperada. Tente de novo em um instante."
  (`components/estado/index.tsx:88`), e 14 telas ainda escrevem o próprio
  "Falha inesperada ao …" à mão no `mensagemApi` inline — quando o épico do C4
  migrar os toasts, vale puxar esses 14 para o componente e apagar a frase
  local.
- **(A — hierarquia de título)** "Atendimentos e provas"
  (`pages/atendimentos/index.tsx:467`) é o único h1 que reivindica DUAS
  entidades enquanto a sidebar oferece "Atendimentos" e "Provas" como itens
  separados — quem procura prova tem dois caminhos com nomes que se
  sobrepõem; é matéria da consolidação de navegação que a trilha A mapeou (A
  das 4 caras).
- **(B — o asterisco órfão)** "Motivo do cancelamento *"
  (`pages/contratos/[id].tsx:693`) marca obrigatório no placeholder, único no
  app — o fluxo de cancelamento do contrato (que o C5 já vai abrir para
  consertar o valor do diálogo) pode levar essa linha junto.
