# Plano — os 149 achados da revisão pela ótica dos papéis

**Escrito em 2026-08-11**, base `84b8b03` (12 commits à frente de `origin/main`,
todos de documentação). Cobre os **149 achados** das três lentes
(`docs/revisao/2026-08-11-otica-dos-papeis/` — 59 dos ângulos, 30 dos `high`,
60 das fatias `max`) **mais as 2 sobras da revisão max** (S-M10, S-M17).
Suíte de partida: **API 1134 · frontend 536 · E2E 165 · typecheck verde em 5
projetos**.

149 achados não são 149 consertos. Eles colapsam em **14 épicos** (E158–E171)
porque a maioria compartilha raiz — e consertar a raiz fecha a família inteira.
A ordem é por faixa: primeiro o que **perde dinheiro ou promete a peça duas
vezes**, depois **o gate** (o pedido que abriu a revisão), depois as fronteiras
de tela, e por último as réguas que impedem a recaída.

## As regras que valem para TODOS os épicos

1. **Regra 20 embutida:** cada épico REABRE as âncoras dos achados que fecha
   antes de escrever código. Os 90 achados dos reviews passaram por verificador
   independente; os 59 dos ângulos não passaram por ninguém. A conferência é a
   primeira seção do relatório de execução, não uma fase separada — foi assim
   que a rodada 2 não travou.
2. **Vermelho antes do verde:** cada conserto cita o teste que falhava ANTES,
   literal. Corrida se prova com o molde determinístico do
   `sm7-corrida-reserva-exclusiva-api.test.ts:64-91` (conexão paralela segurando
   vínculo não commitado) — sem `sleep`.
3. **Um épico, um commit de código**, mais o `docs(...)` que registra o hash.
   Sobra vista de passagem entra na tabela de Sobras no mesmo commit (regra 12).
4. **E2E completo antes do commit** em todo épico que muda o que a trilha grava
   ou o formato que alguma tela lê (regra 11) — o que aqui é quase todos.
5. **`scripts/banco-virgem.ts` (~40 s) antes de qualquer épico com migração**
   (E158, E159, E163) — mexem em schema.
6. Migração de banco existente vai para `docs/migracoes/2026-08-XX-e1XX-*.sql`.

## Fase 0 — o que precisa da dona ANTES do código

Quatro decisões e duas contagens. Nada disso é código; tudo desbloqueia código.

**D1 · O desenho do gate** (decide o E162). O aceite não cria reserva e o
contrato exige reserva. Três desenhos possíveis:

| Opção | O que muda | Custo | Risco |
|---|---|---|---|
| **(a) Reserva no ENVIO** — gerar o link de um orçamento com peça de acervo cria (ou exige) o bloqueio ANTES de a noiva ver | O vão fecha na origem: todo aceite já nasce com a peça segura | Médio | Peça presa por proposta que pode morrer; precisa de expiração casada com a validade |
| **(b) Reserva no ACEITE** — o aceite público cria o bloqueio na mesma transação | O momento do compromisso e o da trava coincidem | Alto | O aceite roda sem sessão; criar bloqueio ali abre a porta pública para escrita no acervo, e a corrida das duas noivas se move para dentro do aceite |
| **(c) Fila + reserva inline** — o aceite não reserva; nasce a fila "aceitos sem contrato", e o diálogo de contrato cria a reserva na hora, com um clique | Menor mudança de modelo; a vendedora decide com a peça na mão | Baixo | A janela sexta-21h→segunda continua existindo — só que agora VISÍVEL e com caminho |
| **Recomendação: (c) agora, (a) depois se a janela doer.** A (c) fecha o beco sem mexer no modelo de dados e é reversível; a (a) é decisão de negócio (peça presa por proposta) que merece número antes: a fila da (c) vai medir quantos aceites esperam e por quanto tempo. |

**D2 · MANUTENCAO satisfaz o E150?** (decide parte do E163). Hoje satisfaz
(K4), e é o dobro-prometido por outra porta. A recomendação é **não**: o gate
passa a exigir `tipo = RESERVA_CASAMENTO`. Se existir caso legítimo de vender
peça segurada por manutenção, ele vira um campo explícito, não um furo.

**D3 · Validade vencida barra o aceite?** (decide parte do E166). Hoje não
barra em porta nenhuma (C6, A03.4, A07.4 — três lentes). Recomendação: **barra
com mensagem que diz o caminho** ("proposta venceu em DD/MM — peça uma
atualização à sua vendedora"), e o link regenerado re-abre a validade
explicitamente em vez de por acidente.

**D4 · A régua de tranca vira varredura no CI?** (decide o E171). As varreduras
S-M7/S-M18/S-M22/S-M24 acertaram o padrão e erraram o alcance — 14 portas
apareceram abertas hoje. A proposta: toda porta que escreve em
`bloqueio_vestidos`, `reservas`, `contratos` ou `orcamentos` toma `FOR UPDATE`
e relê o que prova DENTRO da transação, e um script conta as portas no CI.
Custo: manter a enumeração. Alternativa: fechar os 14 e aceitar a quinta rodada
quando vier.

**C1 · Contagem no `moscow_base`:** ENVIADOs sem linha em `orcamento_versoes`.
Mata ou confirma o C7/A03.7 (hash nulo legado). Se zero, o ramo legado do E163
encolhe.

**C2 · A S-M17** (espera dados de banco real) roda na mesma sentada.

---

## Faixa A — o dinheiro e a peça (E158–E161)

A família check-then-write: 4 portas em `contratos.ts`, 6 em `reservas.ts`,
2 eixos em `agenda.ts`, e o CAS do aceite que não participa de tranca nenhuma.
Todas com o mesmo desfecho medido — contrato ATIVO cobrando com o vestido de
volta ao mercado, ou dinheiro que fica no caixa depois de declarado devolvido.

### E158 — contratos.ts: toda guarda relê sob a tranca, e o duplicado morre no banco

**Fecha:** K1/P1 (cancelamento lê parcelas no pool — R$ 700,00/R$ 2.000,00
presos no caixa com trilha zerada), K2 (a reconferência da S-M7 não relê
`canceladoEm`), K3/A08.1 (dois contratos ATIVOS, comissão sobre R$ 10.000,00 de
uma venda de R$ 5.000,00), K7 (estorno não reconfere o contrato), K8 (PATCH
grava por cima de cancelado), P2 (renumeração obsoleta o `numero` da trilha —
a trilha passa a gravar `parcelaId`, que é estável), P3 (cancelar não desfaz
`contratoFechadoEm` nem a etapa — a sazonalidade mente), P4 e P5 (os dois 500
que deveriam ser 422), K9 (número da parcela avulsa sob tranca).

**Como:** o cancelamento move a leitura das parcelas para DENTRO da transação
com `FOR UPDATE`; o `FOR UPDATE` da S-M7 passa a devolver e reconferir
`canceladoEm` e roda MESMO com `bloqueioIds` vazio (trancando a linha do lead);
**migração**: UNIQUE parcial `contratos(lead_id) WHERE status = 'ATIVO'` — a
guarda de código continua, o banco vira a rede. PATCH e estorno repetem a
condição de status no UPDATE (o idioma do DELETE de parcela, `:1300-1304`).

**Régua:** 3 corridas determinísticas novas (cancelar×receber,
cancelar×criar-contrato, dois-cliques-criar) + `banco-virgem` pela migração.

### E159 — reservas.ts: as quatro portas sem tranca, e o estado terminal em todas

**Fecha:** R1 (cancelar × criar contrato), R2/V8 (DELETE reconta lista do
pool), R3 (propagar data sem trancar o vestido), R4/V10 (PATCH não tranca —
CANCELADA vira CONCLUIDA), R7/V-517 (bloqueio nasce em reserva CANCELADA —
invisível à disponibilidade, visível ao EXCLUDE), V13 (DELETE ignora a coluna
legada que o irmão conta de propósito), V12 (`casamentoData: null` → 1970,
zod `.nullish()` com recusa explícita), V11 (duas cobranças colidem — tranca no
contrato + mensagem que diz qual avaria), R9 (cobrar lê contrato no pool),
V15-delete (DELETE de avaria sem `FOR UPDATE` — o único do arquivo).

**Como:** o PATCH de reserva toma a forma do DELETE irmão (`FOR UPDATE` +
reconferência da transição); a propagação de data tranca a linha do vestido
como o POST já faz; o DELETE reconta DENTRO da transação com lista relida; o
POST de bloqueio confere o status da reserva-mãe (S-M24: terminal é terminal em
TODA porta).

**Régua:** 4 corridas novas no molde sm7 + teste de estado terminal por porta.

### E160 — orçamento e aceite: o CAS entra na tranca, e o que a noiva viu é o que se grava

**Fecha:** O2 (a reconferência sob `FOR UPDATE` passa a cobrir STATUS, não só
desconto — mata o A08.3 inteiro), C1/A08.3 (`/recusar` e `/aprovar` ganham
transação + condição de status), C4 (as três portas de item releem o pai sob
tranca), C2 (a versão do aceite é lida DENTRO da transação — e o POST público
passa a receber `versao`+`hash` da tela da noiva, conferindo contra o que ela
VIU, não contra o mais novo), C3/O4 (o `?? agora` morre: perder a corrida
devolve o aceite real, linha sumida devolve 404 — nunca um carimbo inventado),
C8 (o retorno vira `{aceitoEm, gravadoAgora}` e as duas rotas param de duplicar
a pré-condição), C9 (as 3–4 idas ao banco viram 2, dentro da tx), C10
(`updatedAt` manual sai), O3 (`atendimentoNaLoja` na sexta FK — a função já
existe).

**Régua:** as corridas aceite×recusar, aceite×item e aceite×delete no molde
sm7; o teste do E115 que hoje prova as duas metades do beco **em separado passa
a encadeá-las**.

### E161 — agenda: o eixo da vendedora, e o PATCH que pula a recusa

**Fecha:** G5 (o `FOR UPDATE` tranca a cabine; o conflito de vendedora
atravessa — a tranca passa a cobrir os dois eixos), G3 (`mudouMovimento` passa a
incluir `vendedoraId`: trocar responsável consulta ausência e ocupação), G4 (a
janela de concorrentes lê a MESMA duração que a régua — uma fonte), G1
(concluir prova revalida disponibilidade quando `provaDataReal` cai fora da
janela derivada, com a tranca do vestido que a porta irmã já toma), G2
(`bloqueioId` provado contra a noiva — ver E164), G7/A06.3 (a API amarra
`tipo: PROVA` a `bloqueioId`; o spec e115-portal-agenda:119, que prega o
defeito, muda junto).

**Régua:** corrida vendedora-em-duas-cabines; teste do carimbo fora da janela.

---

## Faixa B — o gate (E162–E163): o pedido que abriu a revisão

### E162 — o aceite ganha um caminho até o contrato

O épico-bandeira, condicionado à **D1**. Assumindo (c):

**Fecha:** A01.2 🔴 (o beco: com fila + reserva inline + desfazer aceite
gerencial, todas as quatro paredes ganham porta), A01.5/A04.1/A04.2/A04.3
(nasce a fila "aceitos sem contrato" — endpoint + cartão no dashboard com
valor parado e idade; `aprovadoEm` passa a ser LIDO), A04.6 (aceite avança o
funil do lead), A03.1 (a fila de mensagens ganha o espelho de aprovados — e o
texto "a sua vendedora já foi avisada" passa a ser verdade OU muda), K6/A02.2
(o diálogo de contrato mostra o bloco de reservas SEMPRE — inclusive vazio —
lista também as de `lead_id` nulo com adoção explícita, e cria reserva inline
no padrão do E65), A02.3 (`gerarContratoSchema` ganha os campos `itens` e
`bloqueioVestidoIds`; o `motivo` com o nome da peça chega à tela), A01.4/K10/P9
(o 422 do E150 e o 409 VESTIDO_INDISPONIVEL dizem a AÇÃO; `conflitos` ganha o
primeiro leitor), R10 (a permissão: criar reserva DE DENTRO do fluxo de venda
exige `leads.criar`, não `vestidos.criar` — ou o perfil Recepção muda; decisão
registrada no épico), A02.4 (reserva de lead nulo/lead errado ganha caminho de
adoção), O15 (`reservasDesmarcadas` zera ao reabrir o diálogo).

**Régua:** o E2E 52 refeito com `vestidoId` REAL — passando por dentro do gate
(hoje ele passa por fora; é a régua que a S-M4 exigiria) — mais o caminho novo:
aceite → fila → reserva inline → contrato, de ponta a ponta.

### E163 — as guardas que se desligam no nulo

**Fecha:** K4 (o E150 exige `RESERVA_CASAMENTO` — decisão D2), K5 (a guarda de
data do PATCH não se desliga no nulo: sem data no bloqueio, chama
`verificarDisponibilidade` como o POST), C7/O5 (o gate do E115 deixa de
depender de `aceiteHash` truthy: orçamento COM versão congelada confere SEMPRE —
`/aprovar` manual grava o hash da versão vigente; o ramo legado segue o que a
contagem C1 disser), P15 (`descontoValor 0` tem UMA leitura: as três telas
perguntam à mesma régua), V3 (a guarda de avaria cai para
`reservaId → reservas.lead_id` quando `leadId` é nulo — o dono existe e passa a
ser perguntado).

**Migração:** possível backfill de `aceiteHash` para APROVADOs com versão e
hash nulo (conforme C1).

---

## Faixa C — as fronteiras (E164–E169)

### E164 — o escopo da noiva: loja E dona, em toda porta

**Fecha:** R5/V4 (`reservaId`×`leadId` conferidos um contra o outro no POST de
bloqueio), G2 (idem no POST de atendimento), A05.3 (a fila da costureira para
de mostrar o vestido de uma com o nome de outra). **Como:** nascem
`bloqueioDaNoiva`/`reservaDaNoiva` em `escopo-loja.ts`, irmãs do
`ajusteDaNoiva` que o E155 já escreveu para exatamente esta pergunta.

### E165 — o PDF fala a verdade e cabe na página

**Fecha:** P11 (paginação: nova página a cada N linhas — as assinaturas SEMPRE
existem), P10 (contrato cancelado imprime tarja "CANCELADO EM DD/MM" e o plano
com as parcelas canceladas marcadas — ou recusa com 409, decisão no épico;
recomendação: tarja), P12 (o plano separa "carnê do contrato" de "cobranças
avulsas", e a soma reconcilia com o total), P13 (observação quebra linha e
respeita margem; `\n` escapado), P14 (U+2212 vira hífen-menos ASCII no
montador). **Régua:** o teste de PDF passa a afirmar posição das assinaturas
com 18 e 36 parcelas, e um golden test do texto extraído.

### E166 — o link público cumpre o que promete

**Fecha:** O1 (o `POST /link` e o "marcar como enviado" exigem ≥1 item — a
versão nunca congela vazia), C6/A03.4/D3 (a validade barra o aceite), O7/C5
(`observacoes` e `validade` entram no snapshot congelado — a página da noiva lê
do snapshot, não da linha viva), O8 (RECUSADO ganha ramo na página: "esta
proposta foi encerrada" — e recusar revoga o token), O9 (a página mostra a
conta que fecha: desconto exibido = bruto − líquido do snapshot), O12 (500/rede
deixam de ser "link inválido" — a página passa pelo `mensagemApi` como todas),
A03.3 (o botão de aceite ganha `onError` com o mapa que já existe), A03.8 (o
pós-aceite diz o próximo passo). **Régua:** nasce o primeiro E2E do caminho
público — hoje são ZERO.

### E167 — a avaria fecha

**Fecha:** V1 (o limite de 6mb cobre a rota de foto de avaria — ou a rota
ganha limite próprio de 2 MiB; o teste manda uma foto de tamanho REAL, não 70
bytes), V14 (a tela busca o contrato pelo lead da RESERVA quando o bloqueio não
tem noiva — os 61 de 63 passam a ter botão), V2 (o payload da avaria carrega o
status da parcela; "Cobrado" só com cobrança VIVA; recobrar e remover voltam a
aparecer quando o contrato morre), V15-botão (quem tem `editar` sem `criar` vê
o motivo, não um botão que não faz nada).

### E168 — a agenda diz a mesma coisa em todas as telas

**Fecha:** G8 (o `expediente` da grade carrega `provaDuracao` — a quarta
cópia morre: nasce UM montador compartilhado), G9 (tela e servidor concordam
sobre quem segura a cabine — a régua de `situacao` mora no núcleo), G11 (a
semana nasce de `diaLocal`, como a tela do dia — a fronteira que sobrou do
S-M25), G6 (cabine desativada continua DESENHADA com os atendimentos dela,
marcada como inativa — desativar avisa quantos atendimentos ficam), G10 (mover
zera `confirmadoEm`/`remarcacaoPedidaEm` e a noiva volta à fila de contato),
G14 (a fila "Falta procurar" usa a régua de `mensagens-do-dia` — a re-derivação
morre), G15 (o diálogo de reagendar consulta `recusaDeMover` e marca as opções
livres), G12 (o PUT de regras valida ordem/faixa — 422, não silêncio), G13 (o
botão WhatsApp respeita `podeEditar` e trata erro).

### E169 — a tela do contrato e o dinheiro miúdo

**Fecha:** O6 (quantidade passa por `parseValor` como o valor unitário —
"3un" vira erro, não 1), O14 (nasce "Remover desconto" — o servidor já aceita
0), A07.3 (o teto do S-M23 cobre o tipo VALOR: desconto > bruto é 422 nas duas
portas), O13 (as quatro escritas chamam `invalidarLista()` — o helper já
existe), O10 (vendedora desativada aparece marcada "(desativada)" no select em
vez de campo em branco), O11 (o gate da tela distingue `criar` de `editar` como
o servidor), P6 (o "Remover" some em PARCIAL — no lugar, "estorne antes"), P7
(remover parcela de carnê avisa a consequência E o gerar-plano aceita
completar), P8 (o alerta de divergência compara só `origem: PLANO`), **S-M10**
(campo vazio = apague — a sobra 🟡 que esperava, toca contrato e tela).

---

## Faixa D — as réguas (E170–E171): para não haver quinta rodada

### E170 — os testes que pregavam o defeito passam a pegá-lo

**Fecha:** os cinco casos medidos hoje — E2E 52 sem `vestidoId` (vai no E162),
`e115-portal-agenda:119` PROVA sem bloqueio (vai no E161),
`ajustes-da-semana.test` afirmando o ponto cego, `avarias-api.test:60` com PNG
de 70 bytes, `e115-orcamento-aceite` com as metades desencadeadas (vai no
E160) — os que não foram junto dos épicos fecham aqui, mais **a regra nova no
METODO**: *teste que fixa um comportamento descoberto defeituoso é achado, não
cobertura — a suíte verde sobre o caminho torto é pior que a suíte vermelha,
porque autoriza.* Com a evidência das quatro ocorrências de hoje.

### E171 — a varredura que conta as portas (condicionada à D4)

O script que enumera (via `git ls-files` + AST, não grep cru) toda porta de
escrita nas quatro tabelas quentes e afirma: transação presente, `FOR UPDATE`
na linha certa, releitura da guarda dentro. Roda no CI ao lado do typecheck.
As 14 portas fechadas nas faixas A são a população inicial — o script nasce
verde e **trava a porta 15**.

---

## Ordem, dependências e tamanho

```
Fase 0 (dona) ──> E158 ──> E159 ──> E160 ──> E161      [Faixa A, serial: mesmos arquivos]
                                    │
                     D1 ────────────┴──> E162 ──> E163  [Faixa B]
                                              │
              E164 ─ E165 ─ E166 ─ E167 ─ E168 ─ E169   [Faixa C: independentes entre si,
                                              │          paralelizáveis por agente/worktree]
                                    E170 ─ E171          [Faixa D, por último]
```

- **Faixa A é serial** (E158→E161): os quatro mexem nas mesmas transações e um
  rebase de tranca sobre tranca é onde nasce deadlock. Um agente por vez, cada
  worktree nascendo em `origin/main` atualizado (regra 29 — **publicar o main
  antes de abrir a faixa**).
- **Faixa C paraleliza**: seis épicos sem interseção de arquivo relevante.
- **E162 é o maior épico do plano** e o único com decisão de produto dentro;
  se a D1 demorar, a Faixa C não espera por ele.
- Estimativa honesta: **Faixa A + E163 numa sessão** (o molde sm7 já existe),
  **E162 numa sessão própria**, **Faixa C em 1–2 sessões com paralelismo**,
  **Faixa D meia sessão**. Quatro a cinco sessões ao todo.

## O que fica de fora, dito explicitamente

- **S-M17** continua esperando dados (roda na Fase 0, contagem C2).
- **S-A2 e S-A27** continuam esperando gente (fotos do caderno; classificação
  das 132 peças com a dona) — nenhum épico daqui as toca.
- Os cleanups que os reviews cortaram do teto de 15 por fatia (réguas
  duplicadas, `reais()` em mensagem, round-trips seriais) **não entram** — se
  reaparecerem no caminho de um épico, viram "visto de passagem" na tabela de
  Sobras, como manda a regra 12.
- O `/code-review ultra` roda **sobre a branch de cada faixa antes do merge** —
  é onde ele tem diff de tranca e máquina de estados para morder, e a Faixa A é
  exatamente a classe de código onde uma segunda cabeça independente paga.

## O placar esperado no fim

Suíte: API 1134 → ~1190 (as corridas novas e as guardas), frontend 536 → ~560,
E2E 165 → ~172 (o caminho público que hoje tem zero, o gate por dentro, o
fluxo aceite→fila→contrato). Typecheck verde nos 5 projetos. `banco-virgem`
verde após cada migração. E a tabela de rastreamento desta trilha
(`CODE-REVIEW.md` + `PROGRESSO.md`) com os 149 riscados um a um — **contados,
não deduzidos**.

---

## Fase 0 — DECIDIDO em 2026-08-11

As quatro decisões foram tomadas pela dona no mesmo dia, todas na recomendação:

| # | Decisão | Resposta |
|---|---|---|
| D1 | Desenho do gate | **(c) Fila + reserva inline.** O aceite não reserva; nasce a fila "aceitos sem contrato" e o diálogo de contrato cria a reserva na hora (padrão E65). A fila medirá se a janela justifica evoluir para reserva no envio. |
| D2 | MANUTENCAO no E150 | **Não.** O gate passa a exigir `tipo = RESERVA_CASAMENTO`. |
| D3 | Validade barra aceite | **Sim, com caminho.** Erro diz o próximo passo; regenerar link re-abre a validade explicitamente. |
| D4 | Varredura no CI | **Sim.** O E171 entra no plano como está. |

O E162 está desbloqueado. Restam as contagens C1/C2 e o push do main (regra 29)
antes de abrir a Faixa A.
