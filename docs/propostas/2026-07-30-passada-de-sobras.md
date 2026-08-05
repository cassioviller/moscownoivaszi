# Passada de sobras — o que a rodada 7 viu de passagem vira trabalho

**Base:** `5f1fc85` (merge da rodada-7-design em `main`) · branch `rodada-7-sobras`
**Origem:** tabela de Sobras de `docs/revisao/2026-07-30-rodada-7-design/EXECUCAO.md`.
A rodada fechou 23/23 épicos e deixou 19 sobras; o dono escolheu executar as
que mais rendem antes de abrir a próxima rodada de código. A numeração segue
de onde a rodada parou: **E143–E146**.

As regras acumuladas do METODO valem integralmente — em especial a 10 (um
épico por commit), a 11 (mudou contrato ou formato que tela lê → E2E completo
antes do commit), a 12 (sobra nova entra na tabela da rodada 7 no mesmo
commit) e a 14 (o resultado da suíte se lê inteiro).

## E143 — S-D19: a corrida de reservas nunca responde 500

**A dor.** `lote17-agenda-concorrencia` flakou duas vezes na rodada 7 com
`expected [201, 409] got [201, 500]` no teste do EXCLUDE gist de
vestido×janela. Um 500 numa corrida real não é flake de teste: é a rota
dizendo "quebrei" onde devia dizer "outra pessoa chegou primeiro".

**Hipótese a provar (não assumir).** O mapa do handler global
(`api-server/src/lib/erros.ts:190-220`) conhece 23505/23503/23P01 → 409.
Sob corrida em constraint de EXCLUSÃO, o Postgres pode resolver o impasse
de dois inserts especulativos por **deadlock (40P01)** — código que o mapa
não conhece e cai no 500 genérico. Primeira ação: reproduzir com o teste em
loop e ler o `err` que o pino loga no caminho do 500.

**Escopo.** O código real observado entra no mapa de `classificarErro` com
status 409 e código estável; teste unitário do mapa; o comentário do teste
do lote17 passa a contar a história inteira.

## E144 — S-D16: `?orcamentoId=` no GET /contratos

**A dor.** `orcamentos/[id].tsx:235` baixa a lista completa de contratos da
loja — 615.041 bytes medidos no banco de dev (518 contratos) — para um único
`find(c => c.orcamentoId === id)` que alterna "Gerar/Ver contrato".

**Escopo.** Parâmetro `orcamentoId` no `GET /lojas/{lojaId}/contratos`
(openapi + codegen), condição na rota (mesmo molde do `leadId` do E62), e a
tela pede só o contrato daquele orçamento. Mudou o contrato → E2E completo.

## E145 — S-D11 + S-D12 + S-D15: nenhum erro fora da régua da casa

**A dor.** A régua da casa desde o E96/E107 é `error` = CÓDIGO estável,
`detalhe` = frase em português. O mapeamento de abertura encontrou **79
ocorrências de `{ error: "<Entidade> not found" }` em 13 arquivos de rota**
— a classe é maior que a que as sobras S-D11 (reservas, lookbooks, admin) e
S-D15 (leads) anotaram. Nenhum teste, tela ou trecho do openapi prega essas
frases (verificado por grep) — a varredura é segura.

**Escopo.**
1. Toda ocorrência vira `<ENTIDADE>_NAO_ENCONTRADO/A` + `detalhe` em
   português, no molde do que o E122/E123 já fizeram
   (`RESERVA_NAO_ENCONTRADA`, `REGISTRO_DE_COBRANCA_NAO_ENCONTRADO`).
2. S-D12: `contratos.ts:333` para de reutilizar `REFERENCIA_INVALIDA` para
   "reserva é de outra noiva" — código próprio, para o dicionário de
   `orcamentos/[id].tsx:92` não sombrear o `detalhe` com a frase da noiva.
3. Varredura no molde da casa (regra 13: janela de vizinhança, não linha a
   linha): teste que falha se `not found` voltar a aparecer em `routes/`.

Muda o corpo que as telas leem → E2E completo antes do commit.

## E146 — S-D17 (+S-D14): os 14 specs E2E limpam o que criam

**A dor.** 14 specs (16, 17, 18-agenda, 19, 21, 24, 27, 28, 29, 30, 31, 35,
36, 37) criam lead/vestido/cabine/contrato/atributo e não têm `afterAll` — a
fonte do acervo-lixo que a S25 mediu. O spec 49 (E125) é o molde: delete via
`@workspace/db` dos ids que o spec criou, na ordem que os RESTRICT pedem.

**Escopo.** Um `afterAll` por spec, apagando SÓ o que o próprio spec criou
(ids guardados na criação — nunca varrer por nome). De passagem, S-D14: o
seed do 16 lê `id` de `GET /equipe` onde o campo é `usuarioId`; o ramo nunca
rodou no banco cheio — consertar no mesmo gesto. Ao final, E2E completo
DUAS vezes seguidas: a segunda passada prova que a limpeza não quebrou o que
os specs assumem do banco persistente.

## Fora desta passada, por decisão

As demais sobras (S-D1 script de captura, S-D3/S-D6 poda de primitivos,
S-D9/S-D10 vazios, S-D13 marca persistente de cobrança, S-D18 SelectTrigger
36px) ficam na tabela da rodada 7 — nenhuma perde a vez: a tabela é o lugar
onde trabalho espera. A rodada de código (traçador, arqueologia) segue
sendo a próxima decisão do dono.
