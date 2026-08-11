# 2026-08-11 — a sessão que fechou a ótica dos papéis (Faixas C e D)

**Seis épicos, E166–E171, em seis commits de código.** A trilha da ótica dos
papéis — 149 achados em 14 épicos — está **EXECUTADA de ponta a ponta**: as
Faixas A e B tinham fechado mais cedo no mesmo dia; esta sessão fechou a C e a
D.

Régua no fim: **API 1238 · frontend 589 · E2E 171 · typecheck verde em 5
projetos**, mais a régua do banco virgem. No começo da sessão eram **API 1196 ·
frontend 536 · E2E 165**.

| Épico | Commit | Tese |
|---|---|---|
| E166 | `3af3064` | o link público cumpre o que promete |
| E167 | `8b12b0d` | a avaria fecha |
| E168 | `4db042d` | a agenda diz a mesma coisa em todas as telas |
| E169 | `fe8afdd` | o dinheiro miúdo das duas telas ganha régua |
| E170 | `50a4043` | o teste que prega o defeito é achado, não cobertura |
| E171 | `30a8377` | a varredura conta as portas |
| S-O31 | `7763ee3` | a porta do link entra na tranca — **achada pelo E171 dentro do E166**, horas depois de escrita |

## O que esta sessão descobriu sobre EXECUTAR com agentes em paralelo

O E166 foi feito à mão. Os cinco seguintes foram **um agente por épico, em
worktree próprio** — E167/E168/E169 numa leva, E170/E171 noutra. Funcionou, e o
que ela ensinou vale mais que os épicos:

**1. O paralelo é barato no código e caro na CONTABILIDADE.** Os cinco
`cherry-pick` entraram sem **um único conflito** — inclusive no `openapi.yaml`,
que três épicos editaram em blocos diferentes (o codegen re-rodado sobre o spec
fundido deu zero drift). O que colidiu foi a **numeração de sobras**: cada
agente reservou uma faixa de `S-O` e as faixas se atropelaram. A reconciliação é
do integrador, e não dá para delegá-la — quem está dentro de um worktree não
sabe o que o vizinho reclamou.

**2. Vermelho de worktree não é vermelho, e três agentes juraram que era.** Os
três da Faixa C relataram `backup-download-api.test.ts` reprovando com
`expected 200 "OK", got 500`, e um o classificou **🟠** pedindo conserto pela
regra 18. No `main` o arquivo passa. A causa é ambiente:
**`res.download` recusa caminho com componente OCULTO**, e todo worktree de
agente vive sob `.claude/worktrees/`. Medido com uma sonda de duas linhas:

```
limpo    → 200
oculto   → 404   NotFoundError (send@1.2.1)
```

Se o integrador aceita o relato, "conserta" um teste que já passa — e o custo
real é que a próxima rodada lê o conserto como evidência de que ali havia
defeito. A caçada rendeu **um achado verdadeiro** que ninguém tinha pedido: a
rota faz `res.download` **sem tratar erro**, então o cliente recebe 500 com
stack em vez de mensagem (S-O26).

**3. As suítes precisam ser serializadas, o código não.** A suíte de API de um
agente da Faixa D **deadlockou contra a do outro** no banco compartilhado: 13 s
de CPU em 8 min de relógio, morta e refeita. Na Faixa C isso não apareceu por
sorte de escalonamento. Escrever em paralelo, medir em série.

**4. O relatório do agente e o relatório da integração são documentos
diferentes.** Cada `execucao/E16X.md` da Faixa C terminou ganhando uma **nota de
integração** dizendo o que o agente não podia saber: o hash real no `main` (o
worktree nasceu três commits atrás) e a régua dos épicos juntos. O agente
registra o que ELE mediu; isso é honesto e deve ficar.

## O que os agentes acharam de errado NO PLANO

Cinco correções, e nenhuma é cosmética:

- **E167 · o V14 pedia um conserto impossível.** "A tela busca o contrato pelo
  lead da RESERVA" não dá: **não existe `GET /reservas/:id`** no repositório. A
  régua já morava no servidor desde o E163; o que faltava era ela sair pelo
  payload.
- **E168 · o G8 são TRÊS cópias, não quatro.** A quarta que o plano contava é o
  `EXPEDIENTE_PADRAO`, que não é cópia da tradução: é o espelho dos defaults do
  schema, já pregado pelo teste do E147.
- **E168 · o gatilho do G10 estava errado.** `mudouMovimento` também é verdadeiro
  ao trocar cabine ou vendedora, e nenhum dos dois aparece na mensagem que a
  noiva recebeu. E `contatadoEm` cai junto, o que o plano não citava — zerar dois
  de três deixaria a linha invisível para sempre na fila.
- **E169 · o A07.3 cobraria o teto onde não há o que comparar.** O `POST` não
  aceita itens: exigir "desconto ≤ bruto" ali proibiria *"crio com o desconto
  combinado, lanço as peças depois"*.
- **E171 · a população não é 14, é 26.** As 14 do plano eram as portas
  **abertas**, não a população. E a varredura **não nascia verde** sobre o
  predicado escrito: cobrar só tranca reprovaria 4 portas corretas que usam CAS.
  Régua que reprova o certo é desligada — o CAS entrou como disciplina de
  primeira classe.

## O que o E170 mediu, e por que importa

Dos cinco testes que "pregavam o defeito", **três já tinham fechado** junto do
épico que passou pela área, e **dois sobraram**. A assimetria é o achado: *as
duas que sobraram são as duas que ninguém tinha motivo de abrir*. E o defeito
atrás de uma delas — a **A05.5** — **não está em épico nenhum do plano**: o
teste que o pregava era a única pista de que ele existia.

Disso nasceu a **regra 34** do METODO:

> Teste que fixa um comportamento descoberto defeituoso é **ACHADO, não
> cobertura** — a suíte verde sobre o caminho torto é pior que a suíte vermelha,
> porque **autoriza**.

## O que o E171 deixou apontado

A varredura enumera **26 portas** (16 tranca · 4 CAS · 6 dívida declarada) sobre
266 arquivos versionados, com `git ls-files` + AST, piso de população, e a
dívida travada por **contagem**, não por lista de nomes — que foi o defeito que
a conferência de 2026-08-05 achou na S30.

Ela achou **4 portas abertas**, e a mais grave era da fatia desta própria
sessão: o `POST /link` do E166 decidia congelar a versão pelo `status` lido no
POOL, e dois cliques congelavam **duas versões da mesma proposta** (S-O31 🟠).

**Ela fechou no mesmo dia** (`7763ee3`), e o fecho é a melhor prova de que a
régua nova não é decoração — ela cobrou duas vezes. Primeiro acusando a porta.
Depois ficando **vermelha quando a porta foi fechada**: a contagem de
`orcamentos.ts` caiu de 2 para 1, o total da dívida de 6 para 5, e os dois casos
reprovaram com `expected 5 to be 6` até a baixa ser escrita. É exatamente o
defeito que a conferência de 2026-08-05 achou na S30 — *"trava a lista de
arquivos, não a contagem"* — resolvido pelo outro lado: aqui a contagem é o
número, então **nem crescer nem encolher passa em silêncio**.

As outras três portas abertas estão em `comissao.ts` (S-O32 🟡) — **a única
tabela quente que as Faixas A e B não abriram**.

O relatório nomeia **seis pontos cegos** da enumeração. O maior: ela é léxica,
não sensível a caminho — um `FOR UPDATE` dentro de um `if` conta como presente
no ramo que não passa por ele.

## O estado ao fim da sessão

**30 sobras abertas** na tabela da trilha — eram 13 quando a sessão começou, e
os seis épicos acrescentaram 21 (S-O15 a S-O35), das quais duas já fecharam
dentro da própria sessão (a S-O30 e a S-O31 🟠). **Fora da trilha são 3 abertas, e nenhuma é código**: S-M17 espera um
dump de instalação real; S-A2 e S-A27 esperam gente.

Sobra mais do que entrou, e isso é o resultado esperado de uma trilha que
termina com uma **varredura**: o E171 existe para tornar contável o que ninguém
tinha contado, e ele achou 4 portas abertas onde o plano supunha zero. A régua
nova é que a porta 15 não passa mais em silêncio.

A **S-M10** — herdada da revisão max — fechou dentro do E169, e o rastreador
**que a reclamava** continuava listando-a como aberta. Foi achada contando as
tabelas de todos os rastreadores, que é a régua que o `CLAUDE.md` manda usar e
que já achou sete fechadas sem risco em 2026-08-07. **Conte, não deduza**
continua sendo a instrução mais rentável deste repositório.
