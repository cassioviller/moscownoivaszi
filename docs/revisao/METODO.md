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

---

## Histórico

- **2026-07-25** — arquivo criado durante a execução da R6, motivado por três
  correções que a execução fez ao próprio diagnóstico. Movimentos da R6
  nomeados; 7 falhas de método registradas com evidência; 7 lentes novas
  desenhadas para a R7.
