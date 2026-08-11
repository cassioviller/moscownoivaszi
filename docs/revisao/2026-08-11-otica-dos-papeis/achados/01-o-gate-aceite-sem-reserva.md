# 01 — o gate — o aceite congela a venda e não segura a peça: quem promete não é quem reserva, e entre os dois não há ninguém

**Revisão ótica dos papéis**, base `980fce5` · ângulo 01

**Arquivos lidos:**
- `artifacts/api-server/src/lib/aceite-orcamento.ts` (inteiro, 71 linhas)
- `artifacts/api-server/src/routes/reservas.ts` (inteiro, 1083 linhas)
- `artifacts/api-server/src/routes/orcamentos-publico.ts` (inteiro, 101 linhas)
- `artifacts/api-server/src/routes/orcamentos.ts` (`:40-140`, `:305-400`, `:480-590`)
- `artifacts/api-server/src/routes/contratos.ts` (`:1-280`, `:280-746`)
- `artifacts/api-server/src/lib/estados.ts` (`:43-69`)
- `artifacts/api-server/src/lib/erro-api.ts` → `artifacts/moscow-noivas/src/lib/erro-api.ts` (inteiro)
- `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx` (`:85-185`, `:230-410`, `:660-900`, `:960-1020`, `:1290-1410`)
- `artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx` (`:220-290`)
- `artifacts/moscow-noivas/src/lib/proximo-passo.ts` (inteiro)
- `artifacts/api-server/src/__tests__/e150-item-sem-reserva-api.test.ts` (inteiro)
- `artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts` (inteiro)
- `artifacts/api-server/src/__tests__/helpers.ts` (`:273-301`)
- `e2e/52-orcamento-vira-contrato.spec.ts` (cabeçalho e fixture)

**A tese, em uma frase:** o sistema tem UM criador de reserva — o `POST
/lojas/:lojaId/bloqueios`, com sessão e módulo `vestidos` —, e nenhum dos três
caminhos que fecham a venda (montar item de acervo, aceitar pelo link, aprovar)
o chama; o `POST /contratos` então cobra a reserva que ninguém criou, e como o
aceite congelou o orçamento em APROVADO terminal, o vão vira beco.

---

## A01.1 — **o aceite não encosta em reserva, e o único criador de reserva exige sessão** 🟠

**Âncora:** `artifacts/api-server/src/lib/aceite-orcamento.ts:28-58` (lido, arquivo
inteiro) e `artifacts/api-server/src/routes/reservas.ts:507` (lido, arquivo inteiro).

**O que a linha diz:** o aceite é UM update e UM insert de auditoria — nada mais:

```
      .update(orcamentosTable)
      .set({
        aceitoEm: agora,
        aceiteVersao: versao?.numero ?? null,
        aceiteHash: versao?.hash ?? null,
        status: "APROVADO",
        aprovadoEm: agora,
        updatedAt: agora,
      })
```

E a única linha do repositório que cria um bloqueio é `reservas.ts:507`:

```
    const [bloqueio] = await tx.insert(bloqueioVestidosTable).values({
```

**O defeito:** enumerei os criadores com `git grep -n "insert(bloqueioVestidosTable"
-- 'artifacts/**' 'lib/**' 'scripts/**' | grep -v __tests__` e o resultado é
**uma linha só** — `reservas.ts:507`, dentro do `POST /lojas/:lojaId/bloqueios`
(`reservas.ts:428`). Esse router é montado atrás de duas paredes:
`router.use(requireSessaoComLoja)` (`reservas.ts:44`) e
`router.use("/lojas/:lojaId/bloqueios", requireModulo("vestidos"))`
(`reservas.ts:46`). Os dois caminhos de aceite — `orcamentos-publico.ts:97` e
`portal.ts:355` — chamam a MESMA `aceitarOrcamentoEnviado`, que não importa
`bloqueioVestidosTable`, `vestidosTable` nem `disponibilidade`: o `import` da
linha 1 do arquivo é `{ db, orcamentosTable, orcamentoVersoesTable, auditLogTable }`
e mais nada.

Logo, **a reserva é fisicamente impossível de nascer do aceite**: quem aceita é
a noiva, sem sessão (o token é a capability — `orcamentos-publico.ts:15-18`), e o
criador de reserva exige sessão com módulo `vestidos`. Não é uma linha que
faltou — é uma ponte que não existe.

**Como se manifesta:** a noiva abre o link no domingo às 22h e clica em
"Aceitar". O sistema responde 200, o portal escreve "Aceito em 10/08 22h14"
(`orcamento-publico.tsx:136-141`) e o orçamento vira APROVADO. **O vestido
continua livre no acervo até alguém da loja abrir o sistema na segunda-feira e
criar a reserva à mão.** Nesse intervalo, qualquer outra vendedora reserva a
mesma peça para o mesmo sábado, com prioridade sobre quem já disse sim.

**Número medido:** o caso do próprio `e150-item-sem-reserva-api.test.ts:52-54` é
um item de R$ 4.000,00 apontando uma peça do acervo (`Vestido Arnalda` /
`Bolero Ricca Sposa`). Um aceite de sexta às 21h sobre R$ 4.000,00 fica **63
horas sem nenhuma linha no banco segurando a peça** até a abertura da loja na
segunda às 12h — e essa janela é a mesma janela em que o E150 diz que a peça
"pode sair para outra noiva no mesmo fim de semana" (`contratos.ts:479`).

**A régua atual:** `artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts`
cobre o aceite (hash, congelamento, contrato pelo valor certo) e **não tem uma
única linha sobre reserva ou bloqueio** — conferido lendo o arquivo inteiro
(109 linhas, nenhuma ocorrência de `bloqueio`/`reserva`). Nenhum teste do
repositório afirma o que deveria acontecer com a peça no instante do aceite.

---

## A01.2 — **o beco: aceito, congelado, sem peça e sem saída** 🔴

**Âncora:** `artifacts/api-server/src/lib/estados.ts:45-50` +
`artifacts/api-server/src/routes/orcamentos.ts:71-85` +
`artifacts/api-server/src/routes/contratos.ts:470-487` +
`artifacts/api-server/src/routes/reservas.ts:496-503` (os quatro lidos).

**O que as linhas dizem:**

```
export const TRANSICOES_ORCAMENTO: Record<OrcamentoStatus, OrcamentoStatus[]> = {
  RASCUNHO: ["ENVIADO", "APROVADO", "RECUSADO"],
  ENVIADO: ["APROVADO", "RECUSADO"],
  APROVADO: [],
  RECUSADO: [],
};
```

```
function recusaConteudoCongelado(status: string): { error: string; detalhe: string } | null {
  if (status === "APROVADO") {
    return {
      error: "ORCAMENTO_APROVADO",
      detalhe: "Orçamento aprovado não muda mais — crie um novo orçamento para renegociar",
    };
```

```
      res.status(422).json({
        error: "ITEM_SEM_RESERVA",
        detalhe:
          "O contrato vende uma peça que não está reservada — ela pode sair para outra noiva no mesmo fim de semana.",
```

```
    if (!resultado.disponivel) return { conflitos: resultado.conflitos };
```
(→ `409 VESTIDO_INDISPONIVEL`, `reservas.ts:523-526`)

**O defeito:** as quatro guardas são individualmente corretas e **coletivamente
fecham as quatro saídas** de um orçamento aceito cuja peça ficou indisponível
entre o envio e o aceite:

1. **Reservar agora** → `POST /bloqueios` roda `verificarDisponibilidade` e
   devolve `409 VESTIDO_INDISPONIVEL` (`reservas.ts:496-503`, `:523-526`).
2. **Trocar o item para outra peça** → `POST/PATCH/DELETE` de item respondem
   `422 ORCAMENTO_APROVADO` (`orcamentos.ts:498-504`, e o E115 prega isso em
   `e115-orcamento-aceite-api.test.ts:76-98`).
3. **Voltar o orçamento para ENVIADO/RASCUNHO** → `TRANSICOES_ORCAMENTO.APROVADO`
   é **lista vazia** (`estados.ts:48`), e o PATCH devolve `422 TRANSICAO_INVALIDA`
   (`orcamentos.ts:322-328`).
4. **Fechar o contrato assim mesmo** → `422 ITEM_SEM_RESERVA`
   (`contratos.ts:476-486`).

E apagar o orçamento também não sai: `orcamentos.ts:416-424` devolve `409
ORCAMENTO_APROVADO` para APROVADO. **O acordo aceito pela noiva é um registro
imutável que o sistema se recusa a converter, e a única saída escrita é a do
`detalhe` do item 2 — "crie um novo orçamento" — que exige pedir um SEGUNDO
aceite à mesma noiva pela mesma venda.**

Nada nesse caminho previne o beco: `POST /orcamentos/:id/itens` (`orcamentos.ts:480-586`)
valida que a peça existe, que é desta loja (S-M12, `:549-556`), que não aponta
duas peças — e **não chama `verificarDisponibilidade` nem uma vez**. O comentário
da S-M12 em `orcamentos.ts:543-548` descreve exatamente este beco para o caso
entre lojas ("a venda virava beco sem saída: a reserva do E150 responde 422
apontando uma peça que ESTA loja nunca poderá reservar") e fecha só a metade
entre lojas — o beco DENTRO da loja, por data ocupada, continua aberto pela
mesma porta.

**Como se manifesta:** a vendedora abre o orçamento APROVADO com o crachá verde
"Aceito pela noiva" (`orcamentos/[id].tsx:757-759`), clica em "Gerar contrato",
preenche vendedora, CPF, forma de pagamento e o carnê inteiro, clica em Gerar —
e lê um toast vermelho dizendo que a peça não está reservada. Vai reservar, e a
reserva é recusada porque a peça já é de outra noiva naquele sábado. Volta ao
orçamento para trocar o vestido, e é recusada porque orçamento aprovado não
muda. Não há nenhum botão, em nenhuma tela, que a tire desse estado.

**Número medido:** o orçamento do `e115-orcamento-aceite-api.test.ts:56` vale
**R$ 5.000,00** e seu aceite é o único documento digital da concordância da
noiva. Nesse beco, os R$ 5.000,00 **não viram contrato nenhum** — o sistema
grava 100% do compromisso (aceite, hash, versão, auditoria `ORCAMENTO_ACEITO`) e
0% da venda. A recuperação custa: novo orçamento + novo envio + novo aceite da
noiva, e o aceite antigo fica no banco apontando uma proposta que nunca vai
existir como contrato.

**A régua atual:** **nenhuma.** Não há teste que leve um orçamento a APROVADO com
item de acervo indisponível. `e150-item-sem-reserva-api.test.ts` cria orçamentos
já `status: "APROVADO"` pela fixture (`:47`) sem passar pelo aceite, e
`e115-orcamento-aceite-api.test.ts` passa pelo aceite com item **sem
`vestidoId`** (ver A01.6). As duas réguas existem e **nenhuma cruza a
fronteira** — é a classe da regra 22 do METODO, o defeito que mora entre dois
arquivos que estão certos.

---

## A01.3 — **o aceite não pergunta se a peça ainda existe para ela** 🟠

**Âncora:** `artifacts/api-server/src/routes/orcamentos-publico.ts:70-98` (lido,
arquivo inteiro) e `artifacts/api-server/src/lib/aceite-orcamento.ts:1-2` (lido).

**O que a linha diz:** as únicas guardas antes do aceite são token, expiração,
idempotência e status:

```
  if (!orcamento.publicoExpiraEm || orcamento.publicoExpiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
```
```
  if (orcamento.status !== "ENVIADO") {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${orcamento.status}` });
```

E o import do módulo que executa o aceite, na linha 1 de `aceite-orcamento.ts`:

```
import { db, orcamentosTable, orcamentoVersoesTable, auditLogTable } from "@workspace/db";
```

**O defeito:** o aceite responde 200 sem consultar `vestidos`,
`bloqueio_vestidos` nem `verificarDisponibilidade`. **O sistema deixa a noiva
dizer "sim" a uma peça que ele já sabe que ela não pode ter.** A prova de que o
sistema sabe está no mesmo repositório: `contratos.ts:433-439` chama
`verificarDisponibilidade` por bloqueio no fechamento, e `reservas.ts:496-502`
chama na criação — a pergunta existe, é barata e é feita nos dois lugares
vizinhos. Só não é feita no momento em que a noiva se compromete.

O E115 fecha a divergência de **conteúdo** entre o que ela viu e o que se vende
(`contratos.ts:236-247`, `ORCAMENTO_DIVERGE_DO_ACEITE`). Não existe o par disso
para a **peça**: nada compara a disponibilidade do envio com a do aceite.

**Como se manifesta:** a noiva vê no portal a proposta com o vestido, aceita, e
lê "Aceito em ...". A loja lê "Aceito pela noiva" no crachá verde. As duas leem
uma promessa que o sistema não pode cumprir, e o desmentido só chega dias
depois, no clique de gerar contrato — pela boca da vendedora, não pela do
sistema.

**Número medido:** o aceite grava `aceiteHash` e `aceiteVersao` da versão
congelada de R$ 5.000,00 (`aceite-orcamento.ts:33-35`, valor do fixture
`e115:56`) e uma linha de auditoria `ORCAMENTO_ACEITO`
(`aceite-orcamento.ts:52`) — **quatro campos de prova de um compromisso de
R$ 5.000,00, e zero linha segurando a peça de R$ 4.000,00 que o compõe.**

**A régua atual:** nenhuma. `git grep -n "disponib" -- artifacts/api-server/src/lib/aceite-orcamento.ts
artifacts/api-server/src/routes/orcamentos-publico.ts` não devolve nada, e
nenhum teste de aceite menciona vestido.

---

## A01.4 — **o 422 do gate diz o risco e não diz a saída, e a tela esconde o bloco justamente quando ele precisaria falar** 🟠

**Âncora:** `artifacts/api-server/src/routes/contratos.ts:476-486` (lido) +
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:1325` (lido) +
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:98-110` (lido).

**O que as linhas dizem:**

```
        detalhe:
          "O contrato vende uma peça que não está reservada — ela pode sair para outra noiva no mesmo fim de semana.",
        campos: semReserva.map((it) => ({
          campo: "itens",
          motivo: `«${it.descricao}» não tem reserva neste contrato`,
        })),
```

```
              {reservasDaNoiva.length > 0 && (
```

E o dicionário da tela, `orcamentos/[id].tsx:98-110`, tem dez entradas e
**nenhuma** é `ITEM_SEM_RESERVA` (contei; as chaves são `VALOR_TOTAL_NAO_BATE`,
`PARCELAS_NAO_BATEM`, `CORPO_INVALIDO`, `REFERENCIA_INVALIDA`,
`ORCAMENTO_NAO_APROVADO`, `ORCAMENTO_RECUSADO`, `TRANSICAO_INVALIDA`,
`JA_TEM_CONTRATO`, `CONTRATO_NAO_ATIVO`).

**O defeito:** três coisas, na mesma tela e no mesmo clique.

1. **A frase diz o RISCO, não o gesto.** Comparada com as vizinhas da própria
   casa — `DATA_DIVERGE_DA_RESERVA` termina em "Ajuste a data ou a reserva"
   (`contratos.ts:426`), `RESERVA_DE_OUTRA_NOIVA` em "escolha uma reserva desta
   noiva ou uma sem dona" (`contratos.ts:380`), `LAVAGEM_SEM_DEVOLUCAO` em
   "desfaça a volta da lavanderia primeiro" (`reservas.ts:584`) —, o
   `ITEM_SEM_RESERVA` é o único que descreve a consequência e para. A vendedora
   lê que a peça pode sair para outra noiva e **não lê onde reservar**.

2. **O recado vira toast atrás do diálogo aberto, e o diálogo continua sem
   ação.** `campo: "itens"` não existe no `gerarContratoSchema`
   (`orcamentos/[id].tsx:144-155`: `vendedoraId, cpf, formaPagamento,
   dataCasamento, entrada, numParcelas, primeiroVencimento`), então
   `aplicarErroDoServidor` (`erro-api.ts:126-140`) devolve `false` — de propósito
   e corretamente — e o `catch` de `onGerarContrato` (`:720-730`) abre o toast.
   O diálogo fica aberto por cima, com todos os campos preenchidos e nenhum
   caminho para frente. O comentário da própria tela (`:721-723`) reconhece que
   "um toast atrás dele é um recado que a pessoa não lê".

3. **O bloco de reservas some exatamente no caso em que falta reserva.** A linha
   1325 renderiza "Peças reservadas que este contrato prende" **só quando
   `reservasDaNoiva.length > 0`**. Quando é zero — o único estado que produz o
   422 — o diálogo não diz uma palavra sobre reserva: não avisa antes, não
   oferece reservar, não desabilita o botão. A vendedora só descobre depois de
   montar o carnê inteiro.

O precedente para o conserto está no mesmo repositório e é literal:
`atendimentos/novo.tsx:238-240` — *"E65: noiva sem reserva deixava a vendedora
num beco ('crie a reserva antes') — a reserva agora nasce aqui mesmo, sem sair
do fluxo da prova"* — e `criarReservaInline` (`:257-284`) faz a reserva nascer
dentro do diálogo. O diálogo de gerar contrato, que é onde a venda fecha, não
ganhou o mesmo gesto.

**Como se manifesta:** vendedora com a noiva ao lado, diálogo "Gerar contrato —
R$ 4.000,00" preenchido, clique, toast vermelho "Não deu para gerar contrato /
O contrato vende uma peça que não está reservada — ela pode sair para outra
noiva no mesmo fim de semana." O diálogo continua na tela, idêntico. Não há
botão, link nem campo que resolva.

**Número medido:** o item do E150 é de R$ 4.000,00
(`e150-item-sem-reserva-api.test.ts:53`) — a venda inteira para de andar num
toast que não aponta destino, e o diálogo mantém 7 campos preenchidos que se
perdem se ela fechar para ir reservar em `/reservas` (o estado do
`contratoForm` é local e o `abrirGerarContrato` de `:664-675` faz `reset`).

**A régua atual:** `e150-item-sem-reserva-api.test.ts:76` prega a frase do
servidor (`expect(r.body.detalhe).toMatch(/outra noiva/i)`) — **e o comentário
da linha 75 diz "A frase serve à vendedora: diz o RISCO, não o nome da coluna",
que é justamente a metade que falta**: o risco está lá, a saída não. Do lado da
tela não há teste nenhum: `git grep -rn "ITEM_SEM_RESERVA" -- artifacts/moscow-noivas`
devolve zero linhas.

---

## A01.5 — **não existe fila de "aceito e ainda não virou contrato"** 🟡

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/index.tsx:49` (lido) +
`artifacts/moscow-noivas/src/lib/proximo-passo.ts:109-120` (lido, arquivo
inteiro) + `artifacts/api-server/src/lib/aceite-orcamento.ts` (inteiro).

**O que as linhas dizem:** o filtro da lista de orçamentos é por status cru —

```
  { chave: "APROVADO", rotulo: "Aprovados" },
```

e o próximo passo do funil para de olhar no envio:

```
    case "ORCAMENTO_ABERTO":
      return {
        titulo: "Enviar a proposta para ela",
        detalhe: "Orçamento aberto que não chega à noiva não vira contrato.",
```

**O defeito:** três buscas provam a ausência, e as três estão registradas aqui
para que a próxima sessão não as refaça:

- `git grep -rn -i "aceitos\|aguardando contrato\|sem contrato" -- artifacts/moscow-noivas/src`
  → nenhuma tela, nenhum card, nenhum filtro.
- `git grep -n -i "aceit" -- artifacts/moscow-noivas/src/pages/dashboard.tsx
  artifacts/api-server/src/routes/dashboard.ts` → **zero linhas**. O painel do
  Renato não sabe que existe aceite.
- `git grep -n "APROVADO" -- 'artifacts/moscow-noivas/src/pages/**'` → dez
  ocorrências, todas rótulo/badge/condição de tela; **nenhuma consulta que cruze
  orçamento APROVADO com ausência de contrato.**

E o funil não se mexe: `aceite-orcamento.ts` não importa `leadsTable`, e o PATCH
que aprova (`orcamentos.ts:363-382`) grava `aprovadoEm` e **não chama
`avancarEtapaLead`** — `marcarOrcamentoAberto` (`orcamentos.ts:88-98`) só roda na
CRIAÇÃO do orçamento. Resultado: a noiva que aceitou continua em
`ORCAMENTO_ABERTO`, e a faixa de próximo passo da ficha dela segue dizendo
**"Enviar a proposta para ela"** — para uma proposta que ela já aceitou.

**Como se manifesta:** o orçamento aceito que travou no gate não aparece em
lugar nenhum como pendência. Ele fica na aba "Aprovados" misturado com os que já
viraram contrato (o filtro é o mesmo status), e a ficha da noiva instrui a
vendedora a fazer o passo anterior. Um aceite perdido não tem quem o cobre — só
a noiva, ligando para perguntar por que ninguém chamou.

**Número medido:** não envolve dinheiro diretamente; envolve **o tempo até
alguém notar**, que hoje é ilimitado — não há consulta, tela ou contagem no
repositório que devolva "aceitos sem contrato".

**A régua atual:** nenhuma, e não haveria o que testar — a consulta não existe.
O teste mais próximo é `proximo-passo` em
`artifacts/moscow-noivas/src/lib/proximo-passo.ts` (regra pura, testável), que
simplesmente não tem o ramo.

---

## A01.6 — **as duas réguas do gate nunca se cruzam: o E150 não passa pelo aceite, o E115 não passa pelo gate** 🟡

**Âncora:** `artifacts/api-server/src/__tests__/e150-item-sem-reserva-api.test.ts:47`
(lido, arquivo inteiro) + `artifacts/api-server/src/__tests__/helpers.ts:292,296`
(lido) + `artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts:44`
(lido, arquivo inteiro).

**O que as linhas dizem:**

```
    const orcamento = await criarOrcamento(f, { leadId, status: "APROVADO" });
```
(E150 — nasce APROVADO pela fixture; nenhuma chamada a
`/orcamentos/publico/aceite` no arquivo inteiro)

```
    const item = await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: valor });
```
(E115 — e o helper preenche os defaults:)
```
      tipo: params.tipo ?? "VESTIDO",
      ...
      vestidoId: params.vestidoId ?? null,
```

**O defeito:** o item do E115 é `tipo: "VESTIDO"` com **`vestidoId: null`** — e a
guarda do E150 só morde quando o item **já aponta uma peça**
(`contratos.ts:470-472`: `(it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") &&
it.vestidoId`). Então os três testes do E115 fecham contrato **sem tocar no
gate**, e os seis testes do E150 exercitam o gate **sem tocar no aceite**. O
caminho real e mais comum da loja — *orçamento com peça do CATÁLOGO → link →
aceite da noiva → contrato* — **não é exercitado por nenhum teste do
repositório.**

O E2E repete o buraco: `e2e/52-orcamento-vira-contrato.spec.ts:67-68` insere o
item como

```
      tipo: "VESTIDO",
      descricao: `Vestido E2E ${stamp}`,
```

sem `vestidoId` (grep por `vestidoId` no arquivo: nenhuma ocorrência) — a
jornada E2E "orçamento vira contrato" também passa ao lado do gate.

**Como se manifesta:** o gate mais consequente do fluxo de venda tem 100% de
cobertura em cada metade e 0% na junção. Foi assim que o vão de A01.2 chegou até
aqui verde: cada suíte prova que o seu lado está certo.

**Número medido:** 6 testes de E150 + 3 de E115 + 1 spec E2E = **10 provas do
caminho, nenhuma cobrindo o encontro das duas**. E o item que o E150 usa para
provar o 201 (`:98-120`) recebe a reserva por `criarBloqueio(f, ...)` — helper
de fixture, não rota de produto: **nenhum teste prova que existe um caminho de
produto que crie essa reserva a partir de um orçamento.**

**A régua atual:** o que falta, com endereço: um teste em
`artifacts/api-server/src/__tests__/` que crie orçamento com
`criarOrcamentoItem(f, { tipo: "VESTIDO", vestidoId: vestido.id })`, gere o link,
aceite por `/api/orcamentos/publico/aceite?token=`, e então tente o `POST
/contratos` — hoje esse teste falharia com `422 ITEM_SEM_RESERVA`, e é
exatamente essa falha que precisa estar escrita.

---

## Visto de passagem

Cada item abaixo é achado de outro ângulo ou sobra própria — anotado aqui porque
foi visto lendo o gate, não porque este ângulo o investigou.

- **O aceite não avança o funil, e a aprovação também não.**
  `aceite-orcamento.ts` não importa `leadsTable`; `orcamentos.ts:363-382` grava
  `aprovadoEm` sem tocar em `avancarEtapaLead`. Só o `POST /contratos`
  (`contratos.ts:709-724`) mexe na etapa. A noiva que aceitou fica em
  `ORCAMENTO_ABERTO`. → ângulo 04 (Renato) e ângulo 02 (vendedora).

- **`bloqueio.leadId` só ganha dono no fechamento do contrato**
  (`contratos.ts:636-642`). Antes disso a reserva é anônima, e a guarda
  `RESERVA_DE_OUTRA_NOIVA` (`contratos.ts:377-384`) não tem o que comparar — o
  próprio comentário de `:388-390` mede: "61 das 63 avarias do banco de
  desenvolvimento vivem em bloqueio sem noiva". Uma reserva criada para a noiva
  A pode ser prendida pelo contrato da noiva B enquanto ninguém fechou.
  → ângulo 08 (corridas).

- **`reservasDaNoiva` na tela do orçamento não filtra por peça nem por data**
  (`orcamentos/[id].tsx:281-285`, `:707-709`): manda **todas** as
  `RESERVA_CASAMENTO` vivas da noiva, marcadas por padrão. Uma noiva com reserva
  antiga de outra peça leva a peça velha para dentro do contrato novo — e o
  servidor aceita, porque `vestidosReservados` é um superconjunto
  (`contratos.ts:444`, `:474`). → ângulo 02 / ângulo 07.

- **`ITEM_SEM_RESERVA` não tem entrada no dicionário de nenhuma tela**
  (`git grep -rn "ITEM_SEM_RESERVA" -- artifacts/moscow-noivas` → zero). Cai no
  `detalhe` do servidor por `erro-api.ts:62`, que é o comportamento desenhado —
  mas a régua `erro-cru-varredura.test.ts` existe justamente para caçar
  mensagens que não orientam. → ângulo 02.

- **`POST /orcamentos/:id/itens` não consulta disponibilidade** (`orcamentos.ts:480-586`,
  lido inteiro): dá para montar hoje um orçamento com uma peça que já está
  contratada para o mesmo sábado, sem nenhum aviso na tela nem no servidor. É a
  raiz de A01.2 um passo antes. → ângulo 07.

- **A validade do link e o aceite não conversam.** `orcamentos-publico.ts:80-83`
  recusa o aceite depois de `publicoExpiraEm`, mas nada recusa um aceite de
  orçamento cuja peça foi vendida — a expiração protege o PREÇO e não a PEÇA.
  → ângulo 03 (noiva).
