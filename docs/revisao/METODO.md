# O método — como este sistema é revisado, criticado e ampliado

Este arquivo não fala do aplicativo. Fala de **como olhamos para ele**.

A cada rodada de melhoria, o que muda não é só o código: muda o que
conseguimos ENXERGAR. Uma rodada que usa as mesmas lentes da anterior acha as
mesmas coisas e fica cega para o mesmo resto. Então aqui ficam registrados os
movimentos usados, a crítica honesta de onde eles falharam — com a evidência
que provou a falha — e as lentes novas que a próxima rodada estreia.

**Regra deste arquivo:** nenhuma crítica ao método entra sem a evidência
concreta que a motivou. Método corrigido por opinião é moda; método corrigido
por erro medido é aprendizado.

---

## Os movimentos — o vocabulário do método

Nomear cada movimento permite criticá-lo, reusá-lo e medir se ele valeu.

| Movimento | O que é | Estreou em |
|---|---|---|
| **Trilha (lente independente)** | Decompor a revisão por ÂNGULO, não por diretório. Seis revisores olham o mesmo sistema perguntando coisas diferentes. Um recorte por pasta acha os defeitos daquela pasta; um recorte por pergunta acha os defeitos que atravessam pastas. | R6 |
| **Âncora obrigatória** | Todo achado traz `arquivo:linha` que o revisor LEU. Sem âncora, vira impressão. É o antídoto contra revisão que soa boa e não existe. | R6 |
| **Cenário concreto** | Achado de segurança sem "quem, com qual request, obtém o quê" não é achado. Achado de dinheiro sem exemplo numérico não é achado. | R6 |
| **Quantificar o erro** | Não "pode divergir": *1,77% de 20,9 milhões de planos de parcela divergem*. O número decide a prioridade sozinho. | R6 |
| **"O que está BEM"** | Cada trilha declara o que NÃO deve ser mexido. Sem isso, a rodada seguinte "melhora" o que já estava certo, e o review vira geração de trabalho. | R6 |
| **Pistas laterais** | Cada trilha termina apontando o que viu de relance e é de outra. Handoff barato entre lentes que não se falam. | R6 |
| **Agrupamento** | Na consolidação, N achados de M trilhas que são o MESMO problema viram UM épico. Foi assim que 13 achados de 5 trilhas viraram o E95. | R6 |
| **Rastreabilidade total** | Os 121 achados aparecem numa tabela, cada um apontando o épico que o resolve OU o motivo de ficar fora. Nada some em silêncio. | R6 |
| **Ver a tela de verdade** | Subir o app e navegar, não só ler o JSX. | R6 |
| **Visto de passagem** | Quem executa um épico anota o que achou fora do escopo em vez de consertar. Preserva a disciplina do commit sem perder o achado. | R6 |
| **Decisão antes de código** | O que é escolha de produto (e não bug) vira pergunta ao dono ANTES da implementação. O E102 inteiro foi desbloqueado por três perguntas. | R6 |

---

## Rodada 6 — o método como foi executado

**Forma:** 6 trilhas de diagnóstico (A arquitetura · B backend/segurança ·
C domínio financeiro · D frontend · E UI · F UX/jornadas) + 1 de consolidação
(G), em SEQUÊNCIA, cada uma lendo as pistas das anteriores. Depois, execução
épico a épico, um commit cada.

**Por que sequência e não paralelo:** cada trilha entrega antes da seguinte
começar, e escreve o próprio arquivo enquanto trabalha. O contexto de quem
coordena não incha, e uma sessão interrompida perde no máximo uma trilha.

**Resultado:** 121 achados (9 🔴, 55 🟠, 47 🟡, 10 🔵) → 14 épicos.

**A frase que a rodada produziu:** *o miolo está certo e as bordas não o usam.*
Uma rodada que não produz uma frase assim provavelmente só listou defeitos.

---

## Crítica da rodada 6 — onde o método falhou, com a prova

### 1. Mediu num ambiente e concluiu sobre outro 🔴

A trilha E navegou com Chromium em **inglês** e atribuiu ao `<html lang="en">`
o fato de as datas saírem `07/31/2026`. Virou achado 🔴 e a primeira ação do
E92. Ao executar, a medição controlada mostrou outra coisa: o Chromium desenha
`<input type=date>` pela locale da **interface do navegador**, não pelo `lang`
do documento — quatro `<div lang=en|pt-BR|ja|de>` na mesma página renderizam
idênticos. **A vendedora com Chrome em português já via a data certa.**

O conserto continua válido (WCAG 3.1.1 nível A), mas não era o 🔴 que se
prometeu. O erro não foi de leitura: foi de **não declarar o ambiente da
medição** e tratar uma observação como causa.

→ **Regra nova (R7):** toda medição declara o ambiente (navegador, locale,
viewport, dados). Achado sobre COMPORTAMENTO DE PLATAFORMA exige contraprova
variando o ambiente antes de virar 🔴.

### 2. O ponto cego do recorte por módulo 🔴

Seis lentes varreram o backend por camada e o produto por jornada. Nenhuma
varreu o sistema por **verbo destrutivo**. O resultado: as trilhas acharam o
`DELETE /admin/usuarios/:id` que cascateava contratos, mas ninguém achou o
`DELETE /admin/lojas/:lojaId`, que **não tem guarda nenhuma e cascateia a loja
inteira** — mais grave que o B2, encontrado só de passagem por quem executava
o E91.

Recorte é escolha, e toda escolha tem sombra. A sombra do recorte por camada é
a operação que atravessa todas elas.

→ **Lente nova (R7):** varredura por IRREVERSIBILIDADE (abaixo).

### 3. Confiança indevida no compilador 🟠

Durante o E92, `somaCentavos(linhas, l => centavos(l.valorTotal))` passou pelo
typecheck e a tela mostrou **R$ 617.106,00 onde eram R$ 6.171,06** —
`somaCentavos` já convertia por dentro. Dois `number` são o mesmo tipo; reais e
centavos não são a mesma coisa. O sistema inteiro protege a soma de dinheiro e
**não protege a unidade** dela.

Também é a prova a favor de "ver a tela de verdade": nenhum teste e nenhum tipo
pegou; a tela pegou em segundos.

→ **Achado de método que virou achado de produto:** proposta de tipo nominal
(`Centavos`) na rodada 7.

### 4. Severidade sem calibração cruzada 🟠

Cada trilha atribuiu 🔴/🟠/🟡/🔵 sozinha, com a própria régua. Efeito medido: um
🔴 inflado (o E1 acima) e um 🔴 real que não foi visto (o `DELETE /admin/lojas`).
Ninguém tentou REFUTAR os 🔴 antes de eles virarem prioridade.

→ **Passo novo (R7):** antes da consolidação, uma passada adversarial que tenta
derrubar cada 🔴 e cada 🟠 mais caro. Sobreviveu, é prioridade; caiu, vira 🟡
com a nota de por que parecia pior.

### 5. Descoberta de ambiente sem lugar para morar 🟡

A trilha E gastou tempo descobrindo que o `E2E_API_PROXY` do Vite devolve 404
em POST e que era preciso subir um proxy próprio para logar. Isso quase se
perdeu; o E92 só reaproveitou porque leu as notas dela por acaso.

→ **Regra nova:** descoberta sobre COMO RODAR/OBSERVAR o sistema vai para o
`replit.md`, não para o relatório da trilha. Relatório é achado; `replit.md` é
capacidade.

### 6. Nenhuma lente olhou para o passado 🟡

Seis trilhas leram o código como ele está. Nenhuma leu `git log`, nenhuma
procurou teste que BLINDA um bug — e existia um: `lote9-comissao-api.test.ts`
afirmava como correto o estorno que cobra a vendedora três vezes. Foi achado
pela trilha C por sorte, ao investigar o cálculo, não por método.

→ **Lente nova (R7):** arqueologia do repositório.

### 7. A execução ensina, e o método não tinha onde guardar 🟡

Os dois primeiros épicos produziram três correções ao DIAGNÓSTICO (itens 1, 2 e
3 acima). Não havia passo previsto para isso: o fluxo ia review → plano →
execução, sem seta de volta.

→ **Passo novo:** todo relatório de execução (`execucao/E9X.md`) termina em **"o
que isto ensinou sobre o diagnóstico"**, e o que for método sobe para este
arquivo na hora. Foi o que gerou esta seção.

### 8. A régua de verificação do épico era mais estreita que o dano 🟠

Duas vezes na mesma rodada a suíte E2E completa pegou o que nada mais pegava, e
das duas o épico já se considerava verificado:

- **E92** verificou "vendo as telas" — 9 rotas em claro, escuro e 390px, com o
  app de pé. Régua forte para cor e alvo de toque, e ela achou o único bug real
  do épico. Mas o E93, ao rodar a suíte inteira, encontrou **três regressões**
  que o E92 deixou: `brl()` passou a usar espaço RÍGIDO (U+00A0) e o Playwright
  normaliza espaço em seletor de **string** mas não em **regex**; o toast de
  login mudou de texto; `rotuloCompetencia()` foi para minúscula contra um
  `toContainText` case-sensitive.
- **E94** verificou com **625 testes de API verdes e typecheck limpo**. O E2E
  acusou uma **regressão de utilidade**, não de expectativa: unificadas as duas
  portas de pagar, a trilha ficou uniforme e menos legível — *"R$ 500,00 ·
  Aluguel"* virou *"R$ 500,00 · 1 conta"*, porque `resumoDetalhe` lia
  `detalhe.descricao` e do formato novo só sabia CONTAR. Nenhum teste de unidade
  olhava para isso e nenhum teste de API poderia: o dado estava certo no banco,
  o resumo é da tela.

A primeira formulação da regra (escrita no diário do E93) dizia "épico que mexe
em **cópia ou formatação compartilhada**". O E94 a derrubou: ali não houve
mudança de cópia nenhuma, foi mudança de **forma do dado que a tela lia**.

→ **Regra nova (regra 11):** mudou o que a trilha grava, ou o formato do que
alguma tela lê, roda o E2E completo antes do commit. Verde em unidade + API +
typecheck **não** é a régua; é o piso.

### 9. O "visto de passagem" preservava o achado e não o entregava a ninguém 🟠

O movimento existe para não perder o que se vê fora do escopo sem quebrar a
disciplina do commit — e ele preserva. O que faltava era o **trilho de saída**.

A prova é o achado mais grave da rodada. `DELETE /admin/lojas/:lojaId`
(`admin.ts:100`) não tem guarda nenhuma e cascateia a loja inteira. Ele foi
achado por quem executava o E91, está escrito em **três** lugares — a nota do
E91, a crítica 2 acima e a justificativa da lente "Irreversibilidade" da R7 — e
em nenhum deles ele é **trabalho**: não está no backlog E91–E104 nem em lista
alguma que o próximo executor abra. Enquanto isso, a rastreabilidade dos 121
achados do diagnóstico é de 100%.

Ou seja: o achado que o método encontrou por acidente tinha menos garantia de
sobreviver que o achado que ele encontrou de propósito. E a assimetria é
justamente ao contrário do valor — o de propósito já tem épico; o de acidente é
o que ninguém mais vai procurar.

Efeito medido: quatro épicos produziram **catorze** itens de "visto de passagem"
(seis sem épico nenhum, oito sugeridos a um épico com uma seta e um ponto de
interrogação, dentro de um arquivo que o dono daquele épico não tem motivo para
abrir).

→ **Regra nova (regra 12):** sobra vista de passagem entra na tabela de Sobras
do rastreador no mesmo commit. A nota do épico continua sendo onde o raciocínio
mora; o rastreador é onde o trabalho é reclamado.

---

## Rodada 7 — as lentes novas

As seis lentes da R6 continuam (elas achavam coisa), mas nenhuma volta sozinha:
cada uma ganha a pergunta que a R6 não fez. E entram sete ângulos novos,
escolhidos exatamente por olharem para onde o recorte anterior fazia sombra.

| # | Lente | A pergunta que ela faz | Por que ela existe |
|---|---|---|---|
| 1 | **Irreversibilidade** | O que este sistema faz que não tem volta? Todo `DELETE`, todo UPDATE em massa, todo cascade, todo expurgo, todo fechamento. Quem pode, com que confirmação, e com qual rastro? | O `DELETE /admin/lojas` sem guarda passou por seis lentes |
| 2 | **Silêncio** | O que o sistema faz sem contar a ninguém? Erro engolido, número que muda sozinho, ação que não deixa rastro, alerta que não dispara. | Dinheiro errado silencioso é a classe mais cara da R6 (C1, C2, C4) |
| 3 | **Escala e tempo** | O sistema com 3 anos de loja: qual tela morre, qual lista fica ilegível, qual soma estoura, qual índice falta. E o inverso — o sistema no **primeiro dia**, sem dado nenhum. | A R6 mediu código, não volume. As duas pontas do eixo tempo são invisíveis lendo JSX |
| 4 | **O usuário desastrado** | Não o atacante: a vendedora com pressa. Clicou duas vezes, voltou o navegador, deixou a aba aberta 8h, perdeu a internet no meio do POST, abriu duas abas na mesma noiva. | A R6 olhou permissão (má-fé) e fluxo (bom uso). Ninguém olhou o meio, que é o dia real |
| 5 | **O traçador** | Seguir UM valor de ponta a ponta: R$ 1.000 digitado no orçamento → contrato → parcela → recebimento → caixa → DRE → comissão → folha → PDF → portal. Onde ele muda de unidade, de fuso, de nome, de dono. | Cada trilha viu um trecho. Ninguém percorreu o caminho inteiro — e é no trecho ENTRE as camadas que o erro mora |
| 6 | **Arqueologia** | `git log`, TODO/FIXME, código comentado, teste que blinda bug, o que já foi tentado e revertido, o que dois commits discordam. | O teste que blindava o estorno errado foi achado por sorte |
| 7 | **Continuidade** | O dia em que o banco cai, o dump não presta, a pessoa que sabia saiu. O que o ateliê faz sem o sistema, e como volta. | O E89 provou que o dump restaura; ninguém perguntou o que acontece DEPOIS |
| A' | Arquitetura + **custo de mudança** | Se o ateliê abrir a segunda unidade, mudar a regra de comissão ou trocar a forma de pagamento, quantos arquivos mudam? | A R6 mediu a estrutura parada, não a estrutura sob pressão |
| E' | UI + **ambiente adverso** | Celular antigo, internet ruim, tela de 360px, navegador em outra locale, fonte grande, modo de alto contraste. | O item 1 desta crítica |
| F' | UX + **a voz do sistema** | O microcopy como personagem: o sistema culpa a pessoa? explica? some? Ele é o mesmo em todas as telas? | A R6 achou erro em inglês; não perguntou que voz sobra depois de traduzir |

**Regra de crescimento:** a rodada 8 herda estas lentes e acrescenta as suas.
Uma lente só se aposenta quando duas rodadas seguidas não acharem nada por ela
— e a aposentadoria fica registrada aqui, com os números.

---

## Regras que passam a valer (acumuladas)

1. Todo achado: âncora `arquivo:linha` + cenário concreto. *(R6)*
2. Achado de dinheiro traz exemplo numérico; se der, a proporção de casos. *(R6)*
3. Toda trilha declara "o que está BEM". *(R6)*
4. Nada some: rastreabilidade de 100% dos achados. *(R6)*
5. O que é decisão de produto vira pergunta antes de virar código. *(R6)*
6. Toda medição declara o ambiente; achado de plataforma exige contraprova. *(R7)*
7. Antes de consolidar, passada adversarial tentando refutar os 🔴. *(R7)*
8. Descoberta sobre rodar/observar o sistema vai para o `replit.md`. *(R7)*
9. Todo relatório de execução termina em "o que isto ensinou sobre o
   diagnóstico", e o que for método sobe para este arquivo. *(R7)*
10. Um épico por commit, escopo fechado, "visto de passagem" para o resto. *(R6)*
11. Mudou o que a trilha grava, ou o formato do que alguma tela lê, roda o E2E
    completo antes do commit. *(R6, descoberta na execução — crítica 8)*
12. Todo "visto de passagem" sai das notas do épico e entra na tabela de
    **Sobras** do rastreador da rodada, no MESMO commit que o viu. Achado
    preservado só na nota do épico não vira trabalho: ninguém lê a nota de um
    épico fechado. *(R6, descoberta na execução — crítica 9)*
13. Varredura de par atributo×expressão lê VIZINHANÇA (janela de linhas),
    nunca linha a linha — o prettier separa o par e o ofensor vive com CI
    verde. *(R7-design: a fresta escondeu o preço do portal a 2,68:1 por
    meses — E127; e a varredura nova do E130 quase nasceu com a mesma fresta.)*
14. O resultado da suíte se lê INTEIRO antes de qualquer commit — e saída de
    suíte nunca se trunca (`tail -n` em cima de resultado é auto-sabotagem).
    *(R7-design: o E138 foi commitado com 144/147 porque o `tail -4` cortou
    a lista de vermelhos; o conserto foi emendar antes de registrar o hash.)*
15. Edição mecânica que INSERE texto arbitrário usa replacer em FUNÇÃO
    (`s.replace(de, () => para)`), nunca string — `$'`, `$&` e vizinhos
    são padrões especiais do replacement. *(R7-design: um `$'` num YAML de
    replacement duplicou 40.893 linhas do openapi em silêncio, e o codegen
    apagou `generated/` ao falhar — E142.)*
16. Dado COMPARTILHADO (banco de dev/E2E) só muda com o valor original
    anotado antes — e semeadura de prova visual sai no mesmo gesto que entrou.
    *(R7-design: um `casamento_data` movido sem anotar pôs o bloqueio no
    topo da lista de reservas e derrubou o spec posicional 13 — E132; a
    mesma classe do 05-leads/E124.)*
17. Evidência NÃO-TEXTUAL (foto, captura, gravação) se lê uma vez por
    PERGUNTA, nunca uma vez por ARQUIVO. A leitura corrida produz a narrativa;
    a leitura por pergunta produz a CONTAGEM — e é a contagem que corrige a
    narrativa. *(Arqueologia do legado: a sessão 1 leu 29 fotos em ordem e
    escreveu 6 achados; a sessão 2 leu as mesmas 29 sete vezes, uma por
    pergunta, e achou um número errado por fator 4 (páginas com férias: 8 → 2),
    dois subestimados pela metade (compromissos de cor 20 → 38), um par de
    nomes fundido por engano que teria juntado duas peças de acervo na
    importação (Arnalda ≠ Arnica), uma afirmação ilegível que teve de ser
    retirada, e 4 achados novos — dois deles com defeito de código
    demonstrável.)*
18. Um vermelho que vira paisagem apaga a régua 11: **teste que reprova por
    defeito da FIXTURE conserta-se antes do próximo épico**, não depois. Enquanto
    ele vive, a suíte deixa de responder "quebrei alguma coisa?" e passa a
    responder "quebrei mais alguma coisa?". *(Arqueologia do legado: os dois
    vermelhos de `09-financeiro` viveram do E148 ao E156 — nove épicos —, e a
    justificativa de cada um era a mesma frase copiada, "são conhecidos e não são
    regressão". Os dois consertos custaram, juntos, uma linha de fixture e um
    `beforeAll`: a S-A21 escrevia a faixa de comissão em centavos numa coluna de
    reais e a S-A11 esperava dados que o E147 tornou opcionais. Nenhum era código
    de produção, e nenhum precisava dos nove épicos.)*
19. **A suíte lida inteira inclui os `skipped`.** Teste condicionado a
    calendário, fuso ou ambiente não está verde: está AUSENTE, e a diferença não
    aparece na linha de resumo que a regra 14 manda ler. Antes de declarar uma
    suíte verde, olhe o que ela não rodou e diga por quê. *(Arqueologia do
    legado: `MIN_DIAS_PROJECAO = 5` fez três testes de API e dois E2E ficarem
    `skipped` na sessão do dia 4 e rodarem na do dia 5, sem uma linha de código
    mudar entre as duas. Um deles reprovou na PRIMEIRA vez que rodou, sobre
    código certo — S-A21. O relatório do E157 dizia "980 passed · 3 skipped" e
    estava correto; o que ele não podia dizer é que aqueles 3 escondiam um
    vermelho.)*
20. **A sobra é uma PISTA, não um achado — e se confere antes de virar
    trabalho.** Ela nasce de passagem, no meio de outro épico, sem a passada
    adversarial que a regra 7 exige dos 🔴 e 🟠 do diagnóstico. Quem a executa
    relê a âncora e remede o número ANTES de consertar; o que ela descreve pode
    ter mudado, encolhido, crescido ou simplesmente não existir. *(Arqueologia
    do legado, sessão 5: das quatro sobras executadas num dia, **três estavam
    erradas em algum ponto**. A S-A19 trazia a janela `[D−6, D+4]` quando é
    `[D−7, D+3]` — um dia em cada ponta. A S-A20 dizia "o `push` está travado" e
    era só o ponto barulhento de quatro divergências; os outros três eram índices
    ausentes de todo banco novo, e foi a varredura que os achou, não a leitura.
    E a **S-A22 não existia**: eu a registrei afirmando que `"0010" < "0006"`, o
    que é falso — o drizzle zera à esquerda em quatro dígitos, e com largura fixa
    a ordem de string É a numérica. Ela foi RETIRADA, e fica na tabela riscada em
    vez de apagada, porque sobra que some não ensina que a apuração desmentiu
    quem a escreveu.)*
21. **A sobra também SAI do rastreador no commit que a fecha** — riscada, com o
    hash e uma linha do que se fez. A regra 12 cobria só a entrada, e uma tabela
    que só cresce deixa de dizer o que falta: quem a lê passa a conferir cada
    linha contra o código para saber se ainda é verdade, que é exatamente o
    trabalho que ela existia para poupar. Sobra fechada por DECISÃO se risca
    igual, com a resposta escrita — decisão não registrada volta como pergunta.
    *(Arqueologia do legado, sessão 5: a S-A4 e a S-A6 foram fechadas pelo E155,
    a linha do épico dizia "Fecha: S-A4 · S-A6", e as duas continuaram abertas na
    tabela por cinco commits — até alguém varrer a tabela inteira por outro
    motivo. **E o tamanho real apareceu no mesmo dia, na rodada 6:** das oito 🟠
    que a tabela apresentava como perigo, **três já não existiam** — a S7 e a S22
    consertadas pelo E115/E146, a S20 pelo E143, que até achou a causa raiz (o
    deadlock 40P01 fora do mapa de erros). **37% do backlog mais pesado do
    repositório era defeito morto**, e a próxima sessão teria ido investigá-lo.)*
22. **Defeito que mora ENTRE dois arquivos não se pega lendo nenhum dos dois** —
    pega-se cruzando o que cada um DECLARA. Quando as duas pontas já estão
    escritas em algum lugar (um roteador, um schema, um cliente gerado), a
    varredura que as casa custa uma tarde e vale para sempre; procurar a
    divergência a olho custa a mesma tarde e vale uma vez. *(Rodada 6, sobras:
    a S36 nasceu de eu constatar, ao fechar a S15, que teste de componente não
    pega "a tela pede um módulo e o servidor pede outro" — ele prega o que a
    tela faz, não se ela pede o certo. A varredura cruzou três declarações que
    já existiam e ninguém tinha juntado (o `requireModulo` de cada prefixo, a
    URL de cada operação no cliente gerado, o `podeNoModulo` de cada tela) e
    **achou dois defeitos na primeira execução** — um deles vivo num perfil
    PADRÃO: a Recepção via "Criar reserva" e levava 403. A mesma forma fechou a
    S20 (nomes de constraint × snapshot), a S28 (assert × assert) e a S11 (enum
    da tela × enum do contrato).)*
23. **Sobra IMPRECISA custa mais que sobra morta, e nada na tabela as
    distingue.** A morta desperdiça uma sessão; a imprecisa desperdiça o épico
    inteiro, porque o conserto é planejado contra o mecanismo errado — e a
    tabela de sobras é lida justamente para decidir a ORDEM do trabalho.
    Conferir antes de consertar é uma rodada de leitura que não produz commit
    de código nenhum, e é o melhor gasto do backlog. *(Conferência de
    2026-08-05: das 48 sobras conferidas, 4 estavam mortas (8%) e **9 descreviam
    errado o defeito que apontavam**. As três mais caras erravam na estimativa
    de custo, nos dois sentidos: a **S13** dizia "migrar o roteador toca todas as
    rotas" sobre meia dúzia de linhas em um arquivo; a **S-D21** dizia que
    estender a varredura "exige tratar os `parsed.error.message`", e havia ZERO
    deles desde o E96; a **S-D23** prometia `playwright test --list` como régua
    interina, e o Playwright transpila com Babel, que APAGA os tipos — não havia
    régua nenhuma. Duas diziam "é caro" sobre trabalho barato, uma dizia "está
    coberto" sobre o que não estava.)*
24. **Fan-out de leitura acha o que a leitura sequencial não acha — e a divisão
    é pelo RECURSO COMPARTILHADO, não pelo assunto.** Agente lendo em paralelo
    é barato e seguro; agente ESCREVENDO em paralelo colide no que o repositório
    tem de único. Neste repo o recurso único é o banco de dev (`workers: 1` no
    playwright, `fileParallelism: false` no vitest, um só `DATABASE_URL`):
    worktree isola arquivo e **não** isola banco. E há um segundo recurso único
    que se esquece — **as tabelas de Sobras**: toda linha fechada mexe no mesmo
    arquivo, então agente nenhum as toca, e quem risca com o hash é quem
    orquestra. *(2026-08-05: sete agentes de leitura pura sobre 48 sobras acharam
    **três defeitos 🟠 que quatro rodadas de revisão não tinham achado** — a ficha
    da noiva montando link de WhatsApp sem DDI, o contrato sem orçamento
    atribuindo comissão sem auditoria, e o `DELETE /vestidos` sem guarda com R$
    43.400,00 em avarias na cascata. Os três na fronteira entre dois arquivos,
    que é a regra 22. E vale desconfiar do retorno: um agente deu "VIVA E PIOR" a
    uma sobra alegando que um backfill piorou um 409, e o próprio script do
    backfill declarava e justificava aquela aproximação — o orquestrador confere,
    não repassa.)*

25. **Verde na faixa que o AGENTE pode rodar não é verde — a régua é a do
    orquestrador, e ela roda antes do commit, não depois.** O agente de faixa B
    entrega com a suíte que lhe é permitida; se o épico mexe no que alguma tela
    monta, quem tem o banco roda o E2E ANTES de commitar (regra 11), e conta o
    que caiu. *(2026-08-06: a migração do roteador da S13 voltou com **483
    testes de unidade verdes e typecheck verde**, e o E2E completo derrubou dois
    specs — `05-leads` e `59-confeccao-vira-peca`. O `useBlocker` novo bloqueava
    a navegação do PRÓPRIO salvamento: `salvou` e `isSubmitSuccessful` são
    estado do React e a navegação é síncrona, então o bloqueio lia o valor
    velho. No Playwright o `confirm` é auto-dismissado e a navegação morria
    calada; para quem vende, o sistema perguntaria "você tem coisa que não foi
    salva" logo depois de salvar. **Nenhum teste de unidade daquele arquivo
    podia pegar isso** — os quatro que o agente escreveu montam o hook com o
    booleano já decidido, e o defeito mora em QUANDO ele é decidido.)*

26. **Quando o mesmo cuidado aparece escrito de cinco formas diferentes, ele
    não está sendo cumprido — está sendo lembrado.** Cinco grafias é a medida de
    que falta uma régua, e o sítio que esqueceu é o que quebra. *(2026-08-06: os
    8 sítios de `useConfirmarSaida` tinham cinco grafias para a mesma guarda e
    **três não tinham guarda nenhuma**; o docblock do E97 descrevia o cuidado
    corretamente e nenhuma das cinco o implementava por inteiro. Virou uma
    função — `sujoParaConfirmar` — mais uma varredura que cobra que não nasça a
    sexta.)*

27. **O caminho da PRIMEIRA execução não é exercitado por nenhuma suíte — e é o
    único que um cliente novo percorre.** Tudo aqui roda contra o banco que já
    existe: o ramo "banco vazio", o seed que se dispara sozinho, a migração que
    nunca rodou duas vezes. Defeito que mora ali não fica escondido por sorte,
    fica escondido por CONSTRUÇÃO — e a régua custa um banco descartável, não um
    ambiente. *(2026-08-06: a S-D38 dizia que o `global-setup.ts` do E2E não sobe
    num banco virgem, sem confirmação por execução. Um `createdb` mais
    `pnpm --filter @workspace/db run push` bastou para reproduzir em três
    minutos: 23505 `regra_disponibilidade_loja_id_unique`, logo depois de o seed
    que o próprio setup chama criar a linha. **E o mesmo experimento derrubou o
    conserto que a sobra prescrevia:** trocar o alvo do `ON CONFLICT` para
    `lojaId` só troca um 23505 pelo outro, porque a tabela tem duas restrições
    únicas, os dois conflitos são reais e vivem em bancos diferentes, e um
    `ON CONFLICT` aceita um alvo só. Sem o banco descartável, o conserto de uma
    linha teria sido commitado com a suíte verde no banco de dev — que é
    exatamente onde ele não falha.)*

28. **Sobra de FERRAMENTA não fecha com a ferramenta escrita: fecha com ela
    EXECUTADA.** O agente entrega compilando; quem orquestra roda. Fechar a
    sobra de um script que se perdeu com um script que nunca rodou é recriar a
    sobra com outro nome. *(2026-08-07, S-D1: o script das 81 capturas da rodada
    7 morreu num scratchpad, e o diretório de saída dele tinha nascido
    `undefined/` — uma env var interpolada sem conferência. O agente devolveu o
    substituto com typecheck verde e o contrato o proibia de subir o app; o
    orquestrador subiu API e frontend e rodou: **78 capturas em ~90 s**, e a
    execução achou o que a leitura não acharia — o comando documentado no README
    (`pnpm --filter … exec tsx`) imprime um **`undefined` solto** no meio do
    resumo, que é exatamente a matéria de que o defeito original era feito. O
    README passou a mandar chamar o `tsx` direto. As duas falhas-altas de env
    também foram exercitadas de verdade, não afirmadas.)*

29. **Worktree de agente nasce na ponta do REMOTO, não no `main` local — e o
    diagnóstico anterior disto estava errado.** *(2026-08-07: a onda 1 registrou
    que "worktree de agente nasce no commit em que foi criado, 267 commits atrás
    do `main`", tratando como acaso. Não era: os cinco agentes desta sessão
    nasceram todos em `fe47ed5`, que era **exatamente `origin/main`** — o
    repositório estava 322 commits à frente sem publicar. O sintoma é silencioso
    (tudo compila, tudo passa, só diverge na hora de aplicar o patch), e o custo
    é por agente: os cinco gastaram o primeiro gesto em `git reset --hard main`,
    e um deles, com o `reset` bloqueado, teve de sincronizar por
    `git checkout main -- .` + `git read-tree` e ainda apagar do disco 34 fontes
    órfãos que o `main` já tinha deletado — sem isso o typecheck e as varreduras
    por `git ls-files` liam o passado. **O conserto de verdade é publicar**; o
    contorno é o reset no primeiro gesto, e ele tem de estar no prompt.)*

30. **Consolidar régua duplicada exige prova de EQUIVALÊNCIA antes da troca — e
    a prova costuma corrigir uma premissa escrita no repositório.** Duas funções
    com o mesmo nome e o mesmo corpo aparente não são a mesma função até que
    alguém enumere o domínio. *(2026-08-07, S35: a varredura de equivalência dos
    três offsets `-3h` à mão contra o `diaLocal` do core percorreu **30.750
    instantes** (mar/2019–dez/2035 × 5 horários cercando a virada do dia em SP) e
    **reprovou na primeira execução** — os comentários de três módulos afirmam
    "sem DST desde 2019", e o último horário de verão terminou em **17/02/2019**:
    `2019-01-01T02:00Z` é dia 1 para o `Intl` e dia 31 para a conta à mão. No
    domínio real do sistema a equivalência é exata, e a fronteira ficou escrita
    no teste. O mesmo gesto aplicado aos outros itens achou que `isoParaDia` era
    `diaDeNegocio` letra por letra, que `competenciaValida` aceitava o mesmo
    conjunto em 100 meses enumerados, e que `compararSenha` — morta — era
    justamente a variante SEM tempo constante que alguém importaria por engano.)*

31. **A sonda que congela um número paga o prometido no dia em que alguém
    consolida — e o vermelho é o lembrete, não o obstáculo.** *(2026-08-07: a
    onda 1 trocou a lista de arquivos da sonda de formatadores por uma CONTAGEM
    por arquivo mais um total (S30/S-D7), dizendo que "consolidou um, a conta
    cai, o teste fica vermelho, e o vermelho é o lembrete de baixar a dívida
    aqui". Doze dias depois — três dias, no relógio do repositório — a
    consolidação aconteceu e a sonda cobrou exatamente isso: **`expected 5 to be
    17`**. O passivo caiu de 17 para 5 com veredito escrito para cada um dos 17
    (5 apagados, 7 promovidos a função pública, 5 mantidos com o porquê no
    arquivo), e os quatro recortes que a S-D32 tinha nomeado foram atualizados no
    mesmo commit. **O objetivo de uma sonda de passivo nunca é zerar o número: é
    que nenhuma linha dele siga sem julgamento.**)*

32. **Achado de agente só existe depois de estar no `git` — a transcrição é
    volátil e o repositório não.** Relatório que aponta para a própria
    transcrição ("está tudo no `journal.jsonl`, recuperável sem repetir a
    rodada") não está registrando: está adiando o registro para um disco que
    ninguém controla. O que a rodada apurou se escreve no repositório **no dia
    em que ela termina**, inteiro, mesmo o que não coube no relatório.
    *(2026-08-10: a revisão `max` do aplicativo inteiro — 68 agentes, 1.579
    chamadas de ferramenta, 5,58 M tokens, 1h58 — escreveu os 15 achados
    principais num `.md` e deixou **18 de limpeza e 4 de correção menor** só na
    transcrição, com a frase "recuperáveis sem repetir a rodada". A sessão
    seguinte foi buscá-los e **a transcrição inteira já não existia**: nem o
    `journal.jsonl`, nem o script, nem o diretório do run. Os 15 sobreviveram
    porque estavam escritos; os 22 custam a rodada de novo. **A régua de
    sobrevivência é o commit, e a transcrição não é backup de nada.**)*

33. **Achado que nasce com âncora obrigatória e verificador adversarial confere
    quase todo — o que decide a taxa de acerto é COMO ele nasceu, não que ele
    seja uma sobra.** A regra 20 continua valendo (confere antes de consertar),
    e o preço dela agora tem duas medidas para comparar. *(As 48 sobras da
    conferência de 2026-08-05 nasceram de passagem, no meio de outro épico:
    **4 mortas e 9 com o mecanismo errado** — 27%. As 15 da revisão `max` de
    2026-08-10 nasceram de um localizador que exigia `arquivo:linha` lido e
    passaram por um verificador independente cada: **15 de 15 verdadeiras**, e
    a releitura só apertou o mecanismo de duas (o alerta de caixa é mais
    estreito do que o relatório dizia; o `minimum: 0` recusa negativo e o
    buraco é o R$ 0,00). A conferência segue barata e segue obrigatória — o que
    muda é a expectativa com que se entra nela.)*

34. **Teste que fixa um comportamento descoberto defeituoso é ACHADO, não
    cobertura — a suíte verde sobre o caminho torto é pior que a suíte
    vermelha, porque autoriza.** Vermelho é um pedido de conserto; verde sobre
    o defeito é um atestado de que ali não há nada para consertar, e é o que a
    próxima rodada lê antes de decidir onde olhar. Por isso o teste que prega
    entra na tabela de Sobras como qualquer outro achado, e o conserto dele tem
    uma régua própria: **quebre de propósito o código que o teste novo deveria
    proteger e mostre o vermelho literal**. Teste que passa nas duas versões do
    código não prega nada — e é exatamente a classe que esta regra existe para
    matar. *(2026-08-11, ótica dos papéis: **cinco ocorrências medidas com
    âncora**, e as cinco escondiam defeito que outra lente teve de achar,
    porque a suíte já dizia que aquele caminho estava coberto. `e2e/52` era o
    ÚNICO E2E de orçamento→contrato e o item dele não tinha `vestidoId` — a
    guarda "peça vendida exige reserva" do E150 nunca rodava, e a jornada verde
    autorizava o beco que a vendedora encontrava (fechada no E162, `b39d292`).
    `e115-portal-agenda-api.test.ts:119` criava `tipo: "PROVA"` sem
    `bloqueioId` e provava as quatro recusas do reagendar POR CIMA de uma prova
    sem vestido, enquanto um comentário de tela afirmava que o caso estava
    consertado (fechada no E161, `747ae5e`). `avarias-api.test.ts:24` mandava um
    PNG de **70 bytes**: a borda por magic bytes era medida, o tamanho nunca —
    e o teto real do parser era **102.400 bytes de corpo contra os 2 MiB que
    cliente e servidor anunciavam, 19,5× de mentira** com a foto de celular de
    1,5 MB (fechada no E167, `8b12b0d`). `ajustes-da-semana.test.ts:26`
    afirmava, na letra, *"sem referência nenhuma, fica fora do recorte"* — o
    ramo `null` escrito como intenção, quando ele era alcançado por
    CONSTRUÇÃO pela confecção, o trabalho sem peça de acervo, logo sem reserva,
    logo sem `bloqueio.casamentoData`: a peça que leva mais tempo era a única
    fora de "Esta semana". E `e115-orcamento-aceite-api.test.ts:55` e `:76`
    provavam as duas metades de um beco em orçamentos DIFERENTES e paravam nas
    paredes — verde sobre **R$ 5.000,00 aceitos, R$ 5.500,00 pedidos e R$ 0,00
    contratáveis**. **Três das cinco fecharam junto do épico que passou pela
    área; as duas que sobraram são as duas que ninguém tinha motivo de abrir**,
    e é essa a assimetria que a regra descreve: o teste que prega só é revisto
    quando alguém chega ali por outro caminho. As duas fecharam no E170, cada
    uma com o vermelho medido depois de quebrar a produção de propósito —
    `expected null to be 5` na régua da costureira, `expected 200 "OK", got 404
    "Not Found"` na saída do beco, e nos dois casos os testes VELHOS seguiram
    verdes com o defeito de volta no lugar.)*

---

## Histórico

- **2026-07-25** — arquivo criado durante a execução da R6, motivado por três
  correções que a execução fez ao próprio diagnóstico. Movimentos da R6
  nomeados; 7 falhas de método registradas com evidência; 7 lentes novas
  desenhadas para a R7.
- **2026-07-27** — auditoria do próprio sistema de anotação, entre o E94 e o
  E95. Duas falhas novas registradas com prova (8 e 9) e viradas em regra (11 e
  12); a descoberta do `E2E_API_PROXY` finalmente migrada para o `replit.md`,
  como a regra 8 mandava desde que foi escrita — ela nasceu desse caso e o caso
  ficou para trás; tabela de **Sobras** criada no rastreador da R6 com os itens
  que estavam presos nas notas; `CLAUDE.md` criado na raiz para que este arquivo
  seja lido no começo de toda sessão, e não por acaso.
- **2026-08-05** — sessão 5 da arqueologia do legado, e a primeira em que as
  **três suítes fecharam verdes ao mesmo tempo** (API 991, frontend 446, E2E
  156, typecheck). O E156 fechou o último épico da trilha; as duas sobras que
  sobraram do dia foram os dois vermelhos que ninguém consertava, e as duas eram
  defeito de TESTE sobre código certo — a S-A21 escrevia a faixa de comissão em
  centavos numa coluna de reais, a S-A11 esperava dados que o E147 tornou
  opcionais. Duas regras novas (18 e 19), as duas nascidas daí: vermelho de
  fixture se conserta antes do próximo épico, e `skipped` não é verde.
  A sessão fechou pela S-A20, que rendeu a lição mais barata do dia: **a sobra
  estava certa no defeito e errada no tamanho**. Ela dizia "o `push` está
  travado"; o `push` era o único dos quatro pontos de divergência entre os
  scripts à mão e o schema drizzle que fazia barulho — os outros três eram
  índices que existiam em todo banco antigo e em nenhum banco novo. **A sobra
  registra o sintoma; quem a executa procura a classe** — e foi a varredura, não
  a leitura, que achou os outros três. Fechou com as sobras da sonda de
  migração, e aí veio a lição que virou a **regra 20**: das quatro sobras
  executadas no dia, três estavam erradas em algum ponto, e uma delas — a S-A22,
  escrita por mim horas antes — **não era defeito nenhum**. A sobra é pista, não
  achado: ela não passa pela passada adversarial, e quem a executa confere antes
  de consertar. O dia terminou pelas duas sobras do expediente, e com uma
  **pergunta que rendeu mais que o conserto**: ao responder "domingo com hora
  marcada", a dona nomeou uma distinção que o modelo não sabe dizer — e isso
  virou sobra nova (S-A24) em vez de virar uma tradução silenciosa. **Quatro
  regras novas num dia (18–21)**, todas nascidas de execução, nenhuma de
  opinião.
- **2026-08-07** (madrugada, emendada na sessão do dia 06) — o
  `2026-08-06-plano-do-resto-das-sobras.md` foi executado **de ponta a ponta**:
  fases 2 (seis épicos seriais na fila do banco), 3 (quatro agentes de faixa B
  aplicados em série) e 4 (os sete que não cabiam numa onda), em 24 commits —
  doze de código, doze de `docs(...)` com o hash —, **cada um com a régua
  completa verde ANTES do commit** (regra 25 cumprida doze vezes, e ela pegou
  coisa em três delas). O backlog foi de 41 para **17 sobras, nenhuma 🟠**, e a
  composição mudou de natureza: **onze são as perguntas da folha** e as outras
  seis nasceram desta execução, medidas no nascimento — não há mais linha na
  tabela que seja achado velho por conferir. Régua: API 1047 → **1082**,
  frontend 495 → **529**, E2E 161, typecheck em 4 projetos. **E o `main` foi
  publicado**: 322 commits, `fe47ed5` → `d9c9f12`, fast-forward puro.
  Quatro regras novas (28–31), todas de execução: ferramenta se fecha rodando,
  worktree nasce na ponta do remoto (corrigindo o diagnóstico da onda 1),
  consolidação exige prova de equivalência (e a prova corrigiu a premissa "sem
  DST desde 2019" para 17/02/2019), e a sonda de passivo cobra o julgamento —
  `expected 5 to be 17`. Duas armadilhas de teste subiram para o `replit.md`
  pela regra 8: o `Test` do supertest é lazy (a corrida da S33 passava verde
  contra o código errado enquanto a request ficava no papel) e `await import()`
  não sobrevive à transpilação do Playwright — cujo crash, ao matar sete
  `afterAll` no meio, produziu sozinho a demonstração da classe de defeito que o
  épico daquele dia estava fechando.
- **2026-07-30** — a rodada 7 virou RODADA DE DESIGN por decisão do dono
  (as lentes E'/F' rodaram; traçador e arqueologia ficaram para rodada
  futura). Diagnóstico de 58 achados em 6 trilhas + adversarial +
  consolidação; execução dos 23 épicos E120–E142 completa no mesmo dia, com
  E2E completo por épico. Quatro falhas de execução viradas em regra (13–16),
  cada uma com o custo medido no relatório do épico que a pagou. As réguas de
  UI que nasceram com varredura subiram ao `replit.md` (regra 8).
