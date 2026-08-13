# Zerar as sobras — plano

**Aberto em 2026-08-13**, a pedido da dona: *"crie um plano e execute, para
arrumar todas sobras"*. Base `6c853f7` (fecho do E197).

Estado de partida, contado (não deduzido) na tabela de Sobras do
`docs/revisao/2026-08-11-otica-dos-papeis/EXECUCAO.md`:

**27 abertas na trilha — 26 🔵 e 1 🟡. Nenhuma 🔴, nenhuma 🟠.**
Mais 3 fora da trilha, e nenhuma delas é código.

## O que este plano NÃO faz, e por quê

Quatro linhas não se fecham escrevendo código, e enfileirá-las seria fingir
trabalho:

| Linha | Por que fica fora |
|---|---|
| **S-O50** 🔵 | Confecção com prazo próprio **pede coluna nova** — schema, migração e um campo no diálogo da costureira. É mudança de produto: quem decide se a costureira passa a marcar prazo separado do casamento é a dona, não o executor |
| **S-M17** (revisão max) | Espera um dump de instalação real. `moscow_base` tem 0 contratos e 0 parcelas |
| **S-A2** (arqueologia) | Faltam fotos do caderno de papel — trabalho de gente |
| **S-A27** (arqueologia) | Classificar 132 peças do legado com a dona. Não há régua que adivinhe "Tipo de peça" |

**Sobram 26 para executar.**

## A leitura que muda a ordem

As 26 não são 26 problemas. Contadas por natureza:

- **11 são dívida de MEDIÇÃO** — régua que mede menos do que anuncia medir
  (S-O114, S-O115, S-O82, S-O83, S-O103, S-O110, S-O118, S-O84, S-O96, S-O94,
  S-O95). Nasceram quase todas de uma régua acusando outra, e é o grupo maior.
- **4 são concorrência na comissão** (S-O106, S-O107, S-O108, S-O110) — a única
  tabela quente que as Faixas A e B não abriram.
- **2 são contrato da API** (S-O112, S-O109).
- **9 são tela, conta e higiene** (S-O85, S-O87, S-O92, S-O98, S-O99, S-O102,
  S-O104, S-O116, S-O119).

Daí a ordem: **primeiro o que deixa a régua confiável, porque tudo depois é
medido por ela.** Uma régua que mente faz o resto do plano mentir junto — foi
a lição do E186 (a varredura media `trancou=[]` por não entrar no helper) e do
E194 (a régua acusou o próprio conserto).

## Os épicos

Um épico, um commit. Vermelho medido literal antes do verde em cada um.

### Faixa 1 — a régua primeiro

| Épico | Fecha | Tese |
|---|---|---|
| **E198** | S-O119 🟡 | **A régua não pode depender da hora em que roda.** O helper fabrica data como instante, o código a lê como dia, e a suíte reprova entre 00:00 e 03:00 UTC. Dois sítios: `ajustes-prazo.test.ts:143` e `global-setup.ts:326` |
| **E199** | S-O114, S-O82 | **Seguir a chamada para fora do handler.** Os dois motores param na borda da função: o do spec não segue o serializador, o da ordem não segue o helper importado. Mesma técnica, e o E186 já a aplicou uma vez (S-O59) |
| **E200** | S-O115, S-O83 | **O que a varredura não vê, e o que ela vê a mais.** Escalar declarado e nunca preenchido é invisível (a classe de que `donoLeadId` foi exemplo); e a conta dos índices erra para MAIS em 2 dos 23 por não ver o `try/catch` da rota |
| **E201** | S-O110, S-O103, S-O118 | **Régua que reconhece pela FORMA aceita o que não devia.** A releitura é julgada por "recebe o `tx` depois da tranca" e não pelo que pergunta; a régua do banco virgem escolhe 3 de 64 arquivos por PROSA; a da fixture só enxerga `db.insert` |

### Faixa 2 — a comissão, que é a tabela quente que ninguém abriu

| Épico | Fecha | Tese |
|---|---|---|
| **E202** | S-O107, S-O106, S-O108 | **A dona clica em fechar logo depois de reabrir e ouve que já fechou.** `jaFechadas` decide com `select` sem tranca; e o `totalC` protegido pela S-O79 tem uma parcela lida de `comissao_fechamentos` ANTES da tranca. As duas tabelas entram nas quentes da varredura |

### Faixa 3 — o contrato da API

| Épico | Fecha | Tese |
|---|---|---|
| **E203** | S-O112 | **`Parcela.contrato` é prometida em 8 pares e entregue em 2.** Quem recebe uma parcela e lê `parcela.contrato.lead.noivaNome` acha `undefined` |
| **E204** | S-O109 | **93 campos `string` de entrada sem teto, contra 4 com.** 19 são texto livre de verdade, e o teto de cada um é quanto daquele corpo a porta reserva para ele |

### Faixa 4 — tela, conta e higiene

| Épico | Fecha | Tese |
|---|---|---|
| **E205** | S-O98, S-O99 | **A peça está errada e a tela dela é a única que não sabe.** A ficha da reserva não diz que a noiva mudou de data; e duas listagens respondem o mesmo assunto sem nota dizendo qual tela usa qual |
| **E206** | S-O85, S-O87 | **Quem pergunta "posso remover?" paga pelo texto que não vai mostrar** — 862 µs contra 2,0 µs, 430×. E a ida-e-volta de centavos nas telas públicas |
| **E207** | S-O116, S-O84 | **A janela de prova é escrita duas vezes e nada compara as duas** — o que as prende são os mesmos números à mão em dois testes. Mais as 23 asserções julgadas em classe, que a regra 31 pede por linha |
| **E208** | S-O92, S-O96, S-O102, S-O104 | **A higiene que envelheceu**: o resumo do seed diz "a loja" sobre número do sistema; 195 operações sem régua de gesto; a porta WEB sem o irmão do `API_URL`; e um comentário que anuncia *"FALHA ESPERADA"* sobre três defeitos fechados |

### Faixa 5 — a que é medição, não linha

| Épico | Fecha | Tese |
|---|---|---|
| **E209** | S-O93 | **Dois E2E simultâneos, cada um com porta e banco próprios.** As portas por env resolveram metade do *"worktree não isola porta"*; a outra metade — o banco de dev único — nunca foi medida |

## A régua de partida

Medida em `6c853f7`, e é contra ela que cada épico se compara:

**API 1389 (199 arquivos) · frontend 703 de 704 · E2E 171 · typecheck verde em
5 projetos.**

O frontend não está verde, e é o E198 que o conserta — por isso ele é o
primeiro.
