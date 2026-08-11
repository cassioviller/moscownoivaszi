# 02 — vendedora — o gate recusa a venda por uma reserva que a tela não mostra, não nomeia e, no segundo item de acervo, não sabe criar

**Revisão ótica dos papéis**, base `980fce5` · ângulo 02

**Arquivos lidos:**
- `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx` (1516 linhas, inteiro)
- `artifacts/moscow-noivas/src/pages/orcamentos/index.tsx` (369 linhas, inteiro)
- `artifacts/moscow-noivas/src/pages/reservas/index.tsx` (175 linhas, inteiro)
- `artifacts/moscow-noivas/src/pages/reservas/helpers.ts` (inteiro)
- `artifacts/moscow-noivas/src/pages/reservas/[bloqueioId].tsx` (varredura por `grep -n`, linhas citadas conferidas)
- `artifacts/moscow-noivas/src/lib/erro-api.ts` (142 linhas, inteiro)
- `artifacts/api-server/src/routes/contratos.ts:330-500`, `:700-748`, `:792-880` e o mapa de rotas
- `artifacts/api-server/src/routes/reservas.ts:389-396`
- `artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:195-285`
- `artifacts/moscow-noivas/src/pages/vestidos/[id].tsx:110-170`
- `artifacts/moscow-noivas/src/components/ui/toast.tsx:17`, `components/ui/dialog.tsx:22,39`
- `e2e/07-orcamentos.spec.ts`, `e2e/08-contratos.spec.ts`, `e2e/52-orcamento-vira-contrato.spec.ts` (inteiro)

---

## A02.1 — a tela não tem NENHUM caminho para criar a SEGUNDA reserva que o gate exige 🔴

**Âncora:** `artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:240` (lido),
`artifacts/moscow-noivas/src/pages/vestidos/[id].tsx:131-139` (lido),
`artifacts/moscow-noivas/src/pages/reservas/index.tsx` (inteiro, lido),
`artifacts/api-server/src/routes/contratos.ts:470-486` (lido).

**O que a linha diz:** `git grep -n "useCreateBloqueio" -- artifacts/moscow-noivas/src`
devolve **dois** sítios no aplicativo inteiro. O primeiro,
`atendimentos/novo.tsx:252`, só é oferecido sob esta guarda (`:240`):

```
const semReserva = tipo === "PROVA" && !!leadId && !bloqueios.isLoading && reservasDaNoiva.length === 0;
```

O segundo, `vestidos/[id].tsx:131-139`, **não cria reserva** — cria manutenção:

```
data: { vestidoId: id!, tipo: "MANUTENCAO", inicio: `${manutInicio}T12:00:00-03:00`, ... }
```

E `reservas/index.tsx` é livro de leitura: não importa `useCreateBloqueio`, não
tem botão de criar; o vazio dela diz "Quando um vestido for reservado para o
casamento de uma noiva, ele aparece aqui" (`:88-91`) sem oferecer o gesto.

**O defeito:** a única porta de entrada de uma `RESERVA_CASAMENTO` no sistema é
o formulário de **agendar uma prova**, e ela **fecha assim que a noiva passa a
ter uma reserva** — `reservasDaNoiva.length === 0` é condição de aparecer. Mas o
E150 exige uma reserva **por peça do acervo vendida**
(`contratos.ts:470-473`):

```
const pecasVendidas = itensSnapshot.filter(
  (it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId,
);
```

Um orçamento com **vestido + acessório do catálogo** — que é exatamente o caso
que o comentário do próprio E150 usa como motivo ("O caderno do ateliê mostra o
caso real: `Bolero Ricca Sposa` sai em duas semanas distintas, para noivas
diferentes") — precisa de **duas** reservas. A tela sabe criar **uma**. Depois
da primeira, `semReserva` é `false` para sempre, o bloco inline some, e não
existe outra porta em lugar nenhum do aplicativo.

Não há conserto depois, tampouco: as rotas de contrato são
`POST /contratos` (`contratos.ts:151`), `GET`, `GET /pdf`,
`PATCH /contratos/:contratoId` (`:792`) e `POST /cancelar` (`:879`) — e o PATCH
**não aceita `bloqueioVestidoIds`**: ele apenas relê os vínculos existentes para
conferir a data (`:792-880`). **A reserva só entra no contrato no instante da
criação.** Errou ali, errou para sempre.

**Número medido:** orçamento de R$ 5.000,00 — vestido R$ 4.200,00 + bolero de
catálogo R$ 800,00. São 2 peças de acervo; a tela cria no máximo 1 reserva. O
`semReserva` do bolero derruba o POST inteiro com 422 — **R$ 5.000,00 que não
viram contrato, não viram carnê e não viram comissão**, com a noiva na loja.

**O que a vendedora vive:** ela sai do orçamento e vai em Reservas — só lê. Vai
na ficha do vestido — só "Marcar em manutenção". Vai em Atendimentos → Novo,
escolhe a noiva, escolhe PROVA — e o bloco de reserva **não aparece**, porque a
noiva já tem a reserva do vestido. Sobram dois gestos, os dois errados: agendar
uma prova falsa, ou cancelar a reserva boa para poder criar a outra (e aí perde
a boa). Pela interface, este contrato não fecha.

**A régua atual:** ausente. Nenhum spec E2E cria duas reservas para a mesma
noiva; `e2e/31-bloqueios-por-vestido.spec.ts` olha a ficha do vestido, não este
caminho.

---

## A02.2 — o diálogo não avisa ANTES do clique: sem reserva, ele não mostra nada 🔴

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:1325-1348` (lido).

**O que a linha diz:**

```
{reservasDaNoiva.length > 0 && (
  <div className="space-y-2 rounded-md border p-3">
    <p className="text-sm font-medium">Peças reservadas que este contrato prende</p>
```

**O defeito:** o bloco de reservas é condicional a `> 0`. Zero reservas =
**nenhuma linha na tela sobre o assunto**, nem no diálogo nem fora dele. A
vendedora não tem como saber, antes de digitar o carnê inteiro, que o contrato
vai ser recusado — e a tela TEM tudo para saber: `orcamento.itens` está
carregado desde o `useGetOrcamento` (`:180`), `ehPecaDoAcervo` já existe neste
arquivo (`:134`) e `reservasDaNoiva` está a quarenta linhas dali (`:281-285`).
O cruzamento que o servidor faz em `contratos.ts:470-486` é reproduzível aqui em
três linhas.

O comentário do E150 (`contratos.ts:462-464`) declara que "a tela não é
afetada: `orcamentos/[id].tsx:638-641` já manda todas as reservas da noiva não
desmarcadas". A afirmação vale só enquanto a noiva TEM todas as reservas — que
é a hipótese que o A02.1 mostra ser impossível de garantir pela interface.

Pior: **desmarcar é livre**. A caixa de cada reserva (`:1330-1341`) pode ser
desmarcada e o botão "Gerar contrato" continua ativo; o 422 vem depois, sem que
nada tenha dito que aquela caixa não era opcional para a peça vendida.

**O que a vendedora vive:** dois minutos digitando CPF, forma de pagamento,
entrada, nº de parcelas e vencimento; confere a prévia do carnê com a noiva;
clica; toma um erro. A informação que teria evitado tudo estava na tela desde
que ela abriu o orçamento.

**A régua atual:** ausente, e a ausência é conspícua — o padrão "avisar antes"
está implantado **três vezes neste mesmo arquivo**: `aviso-acima-teto` (`:973`),
`aviso-estoque` (`:986`) e `aviso-vendedora-divergente` (`:1375`). O único aviso
que falta é o da coisa que **trava** a venda; os três que existem só informam.
O comentário do E154 (`:980-984`) chega a escrever a distinção — "o bolero que a
noiva escolheu pela foto não é substituível — e por isso ele é peça do acervo, e
a reserva dele o contrato exige (E150)" — e mesmo assim o aviso de estoque
existe e o de reserva não.

---

## A02.3 — o recado do E150 chega sem o nome da peça e sem o que fazer 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:98-110` e
`:720-730` (lidos), `artifacts/moscow-noivas/src/lib/erro-api.ts:126-141`
(lido), `artifacts/api-server/src/routes/contratos.ts:475-486` (lido).

**O que a linha diz:** o servidor recusa **nomeando cada peça**:

```
res.status(422).json({
  error: "ITEM_SEM_RESERVA",
  detalhe:
    "O contrato vende uma peça que não está reservada — ela pode sair para outra noiva no mesmo fim de semana.",
  campos: semReserva.map((it) => ({
    campo: "itens",
    motivo: `«${it.descricao}» não tem reserva neste contrato`,
  })),
});
```

O `catch` da tela (`[id].tsx:720-730`):

```
if (aplicarErroDoServidor(contratoForm, err)) return;
toast({
  title: "Não deu para gerar contrato",
  description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
  variant: "destructive",
});
```

E `aplicarErroDoServidor` (`erro-api.ts:129-140`) só marca campo que existe no
formulário:

```
const conhecidos = Object.keys(form.getValues());
...
if (campo && conhecidos.includes(raiz)) { form.setError(campo, ...); marcou = true; }
```

**O defeito:** o `gerarContratoSchema` (`[id].tsx:144-156`) tem sete campos —
`vendedoraId`, `cpf`, `formaPagamento`, `dataCasamento`, `entrada`,
`numParcelas`, `primeiroVencimento`. **`itens` não é um deles**, e
`bloqueioVestidoIds` — o campo que os outros quatro erros de reserva apontam
(`RESERVA_NAO_ENCONTRADA` `:352`, `RESERVA_DE_OUTRA_NOIVA` `:379`,
`RESERVA_JA_CONTRATADA` `:406` e `:733`) — **também não**. Logo
`aplicarErroDoServidor` devolve `false` em **todos os cinco erros do gate**, e o
`motivo`, que é a única parte da resposta que diz **QUAL peça**, é descartado.

O que sobra é o toast. `MENSAGENS_ERRO` (`:98-110`) tem nove chaves e nenhuma
delas é do gate — as nove são `VALOR_TOTAL_NAO_BATE`, `PARCELAS_NAO_BATEM`,
`CORPO_INVALIDO`, `REFERENCIA_INVALIDA`, `ORCAMENTO_NAO_APROVADO`,
`ORCAMENTO_RECUSADO`, `TRANSICAO_INVALIDA`, `JA_TEM_CONTRATO`,
`CONTRATO_NAO_ATIVO`. `mensagemApi` cai na segunda perna (`erro-api.ts:62`) e
mostra o `detalhe` genérico do servidor.

**O que a vendedora lê, literalmente:**

> **Não deu para gerar contrato**
> O contrato vende uma peça que não está reservada — ela pode sair para outra
> noiva no mesmo fim de semana.

Num orçamento de vestido + bolero + véu, **qual** delas? A frase não diz, e o
servidor sabia. **O que fazer?** A frase não diz — e depois do A02.1 a resposta
honesta é "não dá". Nenhum campo do diálogo fica vermelho; o diálogo não fecha
(`setContratoOpen(false)` só existe no caminho de sucesso, `:718`); ela clica de
novo, dá o mesmo, e a conversa com a noiva vira "o sistema não está deixando".

**A régua atual:** `artifacts/api-server/src/__tests__/e150-item-sem-reserva-api.test.ts`
prova os três casos **no servidor** (`:74`, `:94`, `:146`, todos
`expect(r.body.error).toBe("ITEM_SEM_RESERVA")`). Nenhum teste de frontend e
nenhum spec E2E exercita o 422 do E150 na tela — ver A02.6. A régua mede o gate;
ninguém mede o que a vendedora lê dele.

---

## A02.4 — a lista do diálogo filtra por lead, e a reserva "sem dona" que o servidor aceita fica invisível 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:274-285` (lido),
`artifacts/api-server/src/routes/reservas.ts:389-396` (lido),
`artifacts/api-server/src/routes/contratos.ts:365-383` (lido).

**O que a linha diz:** a tela pergunta ao servidor só as reservas daquele lead:

```
const paramsBloqueios = { leadId: orcamento?.leadId ?? "" };
const bloqueiosQ = useListBloqueios(activeLojaId!, paramsBloqueios, { ... });
const reservasDaNoiva = useMemo(
  () => (bloqueiosQ.data ?? []).filter((b) => b.tipo === "RESERVA_CASAMENTO" && !b.canceladoEm),
  [bloqueiosQ.data],
);
```

e o recorte roda em SQL (`reservas.ts:396`):

```
...(leadId ? [eq(bloqueioVestidosTable.leadId, leadId)] : []),
```

O servidor de contratos, por sua vez, **aceita explicitamente reserva sem dona**
(`contratos.ts:365-370`):

> "`bloqueio.leadId` NULO é o caso legítimo e comum: a reserva nasceu sem dona
> (a loja segurou a peça antes de saber de quem seria) e este contrato é
> justamente quem lhe dá dono. Só o vínculo com OUTRA noiva é recusado."

**O defeito:** o contrato aceitaria a reserva de `leadId` nulo; a tela **nunca a
oferece**, porque o filtro `leadId=` a exclui na consulta. O caso que o servidor
chama de "legítimo e comum" — e que o próprio E107 mede como **61 das 63 avarias
do banco de desenvolvimento** vivendo em bloqueio sem noiva — é justamente o que
o único formulário do sistema não consegue amarrar a um contrato.

E se a reserva foi feita no lead **errado**, a saída também não existe: a ficha
da reserva usa `useUpdateBloqueio` em `reservas/[bloqueioId].tsx:284` e `:311`
apenas para movimentação (retirada/devolução); o `leadId` aparece ali só como
leitura (`:472-473` na trilha, `:838-841` como link para agendar prova). Não há
campo para trocar a dona da reserva.

**O que a vendedora vive:** a colega segurou o vestido no sábado antes de saber
o nome da noiva. Hoje a noiva aceitou o orçamento. O diálogo de gerar contrato
**nem desenha a caixa** "Peças reservadas que este contrato prende" (`:1325`,
condicional a `> 0`). Ela gera, toma o 422 do A02.3, e não tem como apontar a
reserva que existe, está livre e o servidor aceitaria.

---

## A02.5 — nenhuma lista mostra o orçamento aceito parado esperando reserva 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/index.tsx:45-51` e
`:308-337` (lidos).

**O que a linha diz:** os filtros são exatamente cinco, e nenhum é sobre aceite,
validade ou contrato:

```
const FILTROS: { chave: string; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "RASCUNHO", rotulo: "Rascunhos" },
  { chave: "ENVIADO", rotulo: "Enviados" },
  { chave: "APROVADO", rotulo: "Aprovados" },
  { chave: "RECUSADO", rotulo: "Recusados" },
];
```

O card mostra nome da noiva, "Criado em …", valor e badge de status
(`:317-332`). Só isso.

**Prova da ausência:** `git grep -n "aceitoEm\|semContrato\|validade" --
artifacts/moscow-noivas/src/pages/orcamentos/index.tsx` devolve **quatro**
linhas, todas do formulário de criar orçamento (`:55`, `:128`, `:137`, `:226`).
Nenhuma na lista. `aceitoEm` **não aparece uma única vez** na lista, embora a
tela de detalhe o destaque em dois lugares (`[id].tsx:757-759` e `:774-779`).

**O defeito:** a lista não distingue (a) aprovado que já virou contrato de
aprovado que **não** virou; (b) aceito pela noiva de não aceito; (c) vigente de
vencido. A pergunta "quais vendas estão prontas e paradas?" não tem resposta em
tela nenhuma — a existência do contrato só é conhecida na tela de detalhe, pela
query `useListContratos(..., { orcamentoId: id })` (`[id].tsx:243-252`), que
roda **uma vez por orçamento aberto**.

**Número medido:** com `POR_PAGINA = 24` (`index.tsx:61`), varrer uma página de
aprovados para achar os que não fecharam custa **24 aberturas de tela**, cada
uma disparando as oito queries do detalhe (`useGetOrcamento`, `useGetLead`,
`useListVestidos`, `useGetUtilizacaoVestidos`, `useListItensEstoque`,
`useListAjustes`, `useListContratos`, `useListEquipe`).

**O que a vendedora vive:** ela filtra "Aprovados", vê doze cards idênticos, e
não sabe quais já fecharam. A venda travada pelo gate **não aparece em lugar
nenhum como travada** — ela some no meio dos aprovados.

---

## A02.6 — o único E2E que percorre orçamento → contrato passa POR FORA do gate 🟠

**Âncora:** `e2e/52-orcamento-vira-contrato.spec.ts:63-71` (lido),
`e2e/07-orcamentos.spec.ts:9-43` (lido), `e2e/08-contratos.spec.ts:10-57` (lido).

**O que a linha diz:** o item que o spec 52 semeia é do tipo `VESTIDO` e **sem
`vestidoId`**:

```
await db.insert(orcamentoItensTable).values({
  id: randomUUID(),
  lojaId: estado.lojaId,
  orcamentoId,
  tipo: "VESTIDO",
  descricao: `Vestido E2E ${stamp}`,
  valorUnitario: 4200,
  quantidade: 1,
});
```

**O defeito:** o E150 só morde item que **aponta peça** (`contratos.ts:470-471`:
`&& it.vestidoId`). Sem `vestidoId`, `pecasVendidas` é vazio, a guarda não roda
e o spec fecha o contrato sem uma única reserva no banco — é o que a asserção
final prova ao encontrar o contrato criado (`:129-133`). **O caminho feliz
testado é o caminho que o gate não vê.** O spec cobre B1 (vendedora da venda),
B5 (primária sem aceite) e B6 (data do casamento) e nada da reserva.

Os outros dois specs são fumaça: `07-orcamentos.spec.ts` tem quatro testes —
lista, nome da noiva no card, o diálogo de novo orçamento abre, e o detalhe
carrega os itens; `08-contratos.spec.ts` tem lista, "Novo Contrato leva a um
fluxo", detalhe com valor e parcelas, e uma sonda de URL de API. `git grep -n
"reserva\|bloqueio"` em ambos devolve **zero linhas**.

**O que fica sem régua:** o 422 do gate na tela, a caixa "Peças reservadas que
este contrato prende", o desmarcar de uma reserva, a reserva de outra noiva, a
reserva já contratada e a criação da segunda reserva. Todo o assunto deste
ângulo.

---

## A02.7 — orçamento vencido não é estado que alguma tela saiba dizer 🟡

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:996` e
`:1226-1247` (lidos), `artifacts/moscow-noivas/src/lib/mensagens-do-dia.ts:126`
(lido), `artifacts/api-server/src/routes/orcamentos-publico.ts:44,81` (lido).

**O que a linha diz:** o campo "Proposta vale até" mora **dentro** do bloco
`{editavel && (` que abre em `:996` e fecha em `:1247`:

```
<label className="text-xs text-muted-foreground" htmlFor="orcamento-validade">
  Proposta vale até
</label>
```

e `editavel` é `(status === "RASCUNHO" || status === "ENVIADO") && podeEditar`
(`:441-442`).

**O defeito:** num orçamento **APROVADO** a validade **não é exibida em lugar
nenhum** da tela de detalhe — nem como campo, nem como texto. E "vencido" não é
badge, cor ou aviso em tela nenhuma: `git grep -n "vencid" --
artifacts/moscow-noivas/src/pages/orcamentos` devolve zero. A única atenção que
o sistema dá à validade é a fila de lembrete, e ela recorta só `ENVIADO` e só
**antes** do vencimento (`mensagens-do-dia.ts:126`: `if (o.status !== "ENVIADO"
|| !o.validade) return false;`, e `mensagens/index.tsx:256`: "Orçamentos
ENVIADOS com validade nas próximas 72h (ainda não vencidos)"). **No dia
seguinte ao vencimento o orçamento sai da fila em silêncio** e não reaparece em
lugar nenhum.

**O que a vendedora vive:** ela abre um orçamento aprovado de março e não tem
como saber que a proposta valia até 20/03. O preço que ela vai levar ao contrato
é o de uma proposta vencida, e nada na tela discorda.

---

## Visto de passagem

1. **O comentário do D6 diz que o toast fica atrás do diálogo, e a folha de
   estilo diz o contrário.** `[id].tsx:721-723` afirma "o diálogo continua
   aberto por cima do toast, e um toast atrás dele é um recado que a pessoa não
   lê" — mas `components/ui/toast.tsx:17` põe o viewport em `z-[100]` e
   `components/ui/dialog.tsx:22,39` põe overlay e conteúdo em `z-50`. O toast
   **pinta por cima**. O comentário é a justificativa escrita de um mecanismo
   (mandar o erro ao campo) que continua certo por outro motivo — o campo marca
   ONDE —, mas a razão que ele dá está desatualizada e vai enganar quem ler.

2. **A tela do contrato não diz uma palavra sobre as peças que ele prende.**
   `git grep -n "bloqueio\|reserva\|Reserva" --
   artifacts/moscow-noivas/src/pages/contratos/[id].tsx` devolve **zero linhas**.
   O contrato é o dono da reserva (E72: cancelar libera a peça) e a tela dele não
   mostra qual peça está presa. Quem quiser conferir precisa ir a Reservas e
   cruzar a olho.

3. **O aceite público não olha a validade.** `orcamentos-publico.ts` só recusa
   por `LINK_EXPIRADO` (`:44`, `:81`), que é a expiração do **token**, não a
   `validade` da proposta. Uma proposta vencida em 20/03 continua aceitável em
   15/04 se o link ainda estiver vivo — e vira base de contrato sem que nada na
   tela da vendedora (A02.7) informe isso. Território dos ângulos 03 e 07;
   registrado aqui porque é a vendedora que leva a diferença de preço para a
   conversa.

4. **`REFERENCIA_INVALIDA` traduzido como "Essa noiva não é desta loja."**
   (`[id].tsx:104`) é a mensagem de um código que o servidor usa para mais de uma
   coisa; o comentário do S-D12/E145 em `contratos.ts:373-377` registra que essa
   tradução genérica já sombreou o `detalhe` certo uma vez e por isso o erro de
   reserva ganhou código próprio. Vale conferir se as outras rotas que ainda
   emitem `REFERENCIA_INVALIDA` estão todas falando de loja.

5. **O `useListBloqueios` do diálogo só carrega com o diálogo aberto**
   (`[id].tsx:278`: `enabled: ... && contratoOpen && ...`). Qualquer aviso de
   "falta reserva" que se queira dar **antes** do clique precisa soltar esse
   `contratoOpen` — hoje a tela nem tem os dados para saber.
