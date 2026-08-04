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
- **2026-07-30** — a rodada 7 virou RODADA DE DESIGN por decisão do dono
  (as lentes E'/F' rodaram; traçador e arqueologia ficaram para rodada
  futura). Diagnóstico de 58 achados em 6 trilhas + adversarial +
  consolidação; execução dos 23 épicos E120–E142 completa no mesmo dia, com
  E2E completo por épico. Quatro falhas de execução viradas em regra (13–16),
  cada uma com o custo medido no relatório do épico que a pagou. As réguas de
  UI que nasceram com varredura subiram ao `replit.md` (regra 8).
