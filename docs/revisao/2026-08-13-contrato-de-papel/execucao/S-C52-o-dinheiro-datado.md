# S-C52/S-C53/S-C72 — quem soma dinheiro pelo último pedaço, e o que fecha dentro de um ato

**Trilha do contrato de papel, sessão de 2026-08-15 (segunda metade)** ·
base `5baadfd1`
Fecha: S-C52 🔵 · S-C53 🔵 · S-C72 🔵
Suíte: API 1743 → **1750** (248 → 250 arquivos) · frontend 988 · typecheck verde

## A medição que ordenou o bloco: a população é ZERO

`parcelas.recebido_em` guarda **o instante do último recebimento**, não de cada
um. Quem soma por essa coluna data o pedaço antigo no dia do último.

Medido no `heliumdb`, sobre a trilha:

```sql
SELECT count(*) FROM (
  SELECT entidade_id FROM audit_log WHERE acao = 'PARCELA_RECEBIDA'
  GROUP BY entidade_id HAVING count(*) > 1
) t
→ 0
```

**1193 atos para 1193 parcelas distintas.** Nenhuma parcela foi recebida em mais
de um pedaço, nunca. Todo o bloco é sobre mecanismo armado e não disparado — o
mesmo formato da S-C150, da S-C220 e do E185 —, e é isso que justifica pregar em
vez de refatorar motor de dinheiro.

## S-C53 — das três leituras, uma não é dívida e outra era constraint

A sobra nomeava três e pedia que fossem contadas. Medidas, elas não são a mesma
coisa:

| leitura | veredito |
|---|---|
| `GET /financeiro/parcelas/exportar` | **não é dívida** — o CSV é uma linha por PARCELA, e a coluna "Recebido Em" diz o que promete. Dividir ali mudaria o que o arquivo É |
| `GET /financeiro/alerta-caixa` | **dívida, e o conserto não é aplicar a divisão** |
| consolidado da rede (`admin.ts`) | **dívida**, e o conserto é caro pelo eixo errado |

### O alerta-caixa era CONSTRAINT, não omissão

A sobra dizia que as três *"ficaram fora do escopo de propósito"*, sugerindo que
o propósito era só de escopo. Não era.

A consulta do alerta serve **dois motores com uma lista só**: o saldo olha para
trás pelo recebimento, a curva olha para frente pelo vencimento, e cada motor
recorta. E `PARCIAL` conta como ABERTO
(`STATUS_ABERTO = ["PREVISTA", "PARCIAL"]`) — uma parcela meio recebida está
**nas duas pernas ao mesmo tempo**, e o `or` a traz uma vez de propósito.

Aplicar `porRecebimento` a essa lista dividiria a PARCIAL em N linhas, e a curva
somaria o previsto dela **N vezes**. Uma projeção de entrada dobrada é erro
maior que um saldo datando um pedaço no dia errado. **O conserto de verdade é
partir a consulta em duas listas, uma por motor**, e isso muda a assinatura de
`alertaDeCaixa` — decisão de motor de dinheiro, com população zero do outro
lado da balança.

### O consolidado da rede: o eixo é a LOJA

`admin.ts` faz `sum(valor_recebido) GROUP BY loja_id WHERE recebido_em >=
inicioMes` — uma agregação no SQL para todas as lojas. A divisão por ato é **por
loja** (`realizadoPorRecebimento` recebe `lojaId`): usá-la trocaria uma consulta
agregada por N consultas mais N leituras de trilha, numa tela de visão geral da
rede.

### O que entrou no lugar do conserto

`varredura-dinheiro-datado-pela-parcela.test.ts`: enumera quem soma dinheiro
filtrando por `recebido_em` e exige que cada um esteja **na lista de quem usa a
divisão** ou **na dívida, com o motivo escrito**. Leitura nova reprova, e o
vermelho é onde se decide de que lado ela fica.

A régua acusou na primeira rodada o próprio `recebimentos-do-caixa.ts` — o
motor da divisão. É o falso positivo esperado de medir por grafia: ele cita
`recebidoEm` e os nomes dos motores de dinheiro justamente porque é quem os
alimenta. Entrou em `USAM_A_DIVISAO`, com a razão dita: deixá-lo fora seria
pedir que o conserto se conserte.

## S-C52 — o enunciado supunha um leitor que não existe

Ele dizia: *"O carimbo é operacional — é o `isNull` dele que decide o próximo
envio"*. Verdade para `pagamentos`; a sobra **generalizou para a parcela**.

Medido: **`parcelas.enviado_contabilidade_em` não tem NENHUM leitor** além do
`isNull` do próprio carimbo, que o torna idempotente. O `pendentesEnvio` da tela
da folha (`folha.tsx:376`) lê `pagamentos.data`, não parcelas.

Então o descompasso existe — o carimbo seleciona por `recebido_em` e fica meio
passo atrás do CSV do fluxo, que já divide — e **não tem consequência**, porque
ninguém pergunta à parcela se ela já foi declarada. População: **318 parcelas,
0 carimbadas**.

A dívida é o dia em que alguém perguntar: um "pendentes de envio" construído
sobre esse carimbo diria que fevereiro está fechado quando não está. A segunda
garantia da varredura reprova nesse dia, com a frase mandando **consertar o
carimbo antes de construir leitura em cima dele** — e consertá-lo pede o carimbo
por ATO, que é a casa que a S-C51 espera da contadora.

Vermelho encenado com um leitor sintético plantado em
`api-server/src/lib/`: as duas garantias mordem, cada uma nomeando o arquivo.

## S-C72 — a conta de dentro do ato

A S-C50 conferiu a soma dos ATOS contra o `valorRecebido` da parcela — um andar
acima. **Dentro de um ato ninguém conferia nada.**

A porta divide o que entrou em `aoPrincipal` (o que fica na parcela) e `aMora`
(o que vira linha própria da 9ª), e a igualdade é garantida **por construção**:

```ts
const aoPrincipalC = Math.min(entrandoC, Math.max(0, saldoPrincipalC));
const aMoraC = entrandoC - aoPrincipalC;          // contratos.ts:2550-2551
```

Construção é de um lado; leitura é do outro, e nada as amarrava. Um terceiro
destino do mesmo pagamento — uma taxa, um arredondamento, uma fatia que fosse
para outro lugar — entraria **calado**: o recibo mostraria o pago inteiro, a
parcela receberia só a sua parte, e a diferença não apareceria em lugar nenhum.

A guarda entrou onde a leitura mora (`recibo-do-papel.ts`), **falha FECHADA**
como a irmã da S-C50: sem conta que feche, a parcela entra no caixa como uma
linha só — o comportamento de antes da S-C31 — em vez de espalhar o erro por
várias datas.

E ela só vale para o ato que TEM a divisão: antes do E213 o `detalhe` não trazia
`aoPrincipal`, e o pagamento foi inteiro para a parcela. Exigir a soma de campos
que não existem reprovaria todo recibo anterior a ele — há cena dizendo isso por
nome.

### O vermelho teve de ser FABRICADO

Nenhuma porta de hoje produz um terceiro destino, então a cena escreve na trilha
(`jsonb_set` do `aoPrincipal` para 490 num ato de 515, com 15 de mora — R$ 10,00
que a trilha não sabe dizer para onde foram). **É a única forma de medir uma
guarda contra o que ainda não existe**, e é o que a torna régua em vez de
opinião. Sem a guarda: `expected [ { …(12) } ] to deeply equal []` — o papel
saía com a conta furada.

## S-C51 continua aberta, e agora com a medição ao lado

Ela é 🟡 e diz de si mesma que *"é decisão de modelagem, não linha de código"*:
carimbo por ATO pede a tabela `recebimentos` que o E221 recusou por escrito. Ela
espera a contadora, e o que este bloco acrescenta é o número que dimensiona a
urgência: **zero parcelas recebidas em pedaços em 1193 atos**. Enquanto isso for
verdade, a conciliação por parcela e a conciliação por ato dão a mesma resposta.
