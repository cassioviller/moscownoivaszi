# 05 — costureira — a fila dela nasce da RESERVA e nunca sabe do CONTRATO: ela costura, cobra e entrega sem que o sistema diga se a peça foi vendida, se a reserva ainda existe, ou quanto o trabalho custou

**Revisão ótica dos papéis**, base `980fce5` · ângulo 05

**Arquivos lidos:**
`artifacts/moscow-noivas/src/pages/provas/index.tsx` ·
`artifacts/moscow-noivas/src/pages/ajustes/index.tsx` ·
`artifacts/moscow-noivas/src/pages/ajustes/[ajusteId].tsx` ·
`artifacts/moscow-noivas/src/lib/ajustes-da-semana.ts` (+ `.test.ts`) ·
`artifacts/moscow-noivas/src/lib/duracao-da-prova.ts` ·
`artifacts/moscow-noivas/src/lib/janela-de-prova.ts` (+ `.test.ts`) ·
`artifacts/moscow-noivas/src/pages/reservas/[bloqueioId].tsx` ·
`artifacts/moscow-noivas/src/components/layout/sidebar.tsx` ·
`artifacts/api-server/src/routes/agenda.ts` ·
`artifacts/api-server/src/routes/reservas.ts` ·
`artifacts/api-server/src/routes/orcamentos.ts` ·
`artifacts/api-server/src/routes/contratos.ts` ·
`artifacts/api-server/src/lib/permissoes.ts` ·
`artifacts/api-server/src/lib/escopo-loja.ts` ·
`lib/db/src/schema/atendimentos.ts` · `lib/db/src/schema/vestidos.ts` ·
`lib/api-zod/src/generated/types/ajuste.ts` · `.../ajusteAtendimento.ts` · `.../lead.ts` ·
`artifacts/api-server/src/__tests__/e107-prova-e-rastro-api.test.ts` ·
`.../lote23-ajustes-fila-api.test.ts` · `.../e155-confeccao-api.test.ts`

**Enumeração:** `git ls-files | grep -icE 'prova|ajuste|medida|costur'` → **35**
arquivos versionados. Conteúdo por `git grep`.

---

## O mapa, antes dos achados

A costureira tem **duas telas**, e as duas chegam pelo módulo `agenda`
(`sidebar.tsx:67`: `{ icon: Scissors, label: "Ajustes", href: "/ajustes", modulo: "agenda" }`;
`agenda.ts:195`: `router.use("/lojas/:lojaId/ajustes", requireModulo("agenda"))`).
**Não existe módulo `costura`** — `permissoes.ts:21` lista
`["leads", "agenda", "vestidos", "financeiro", "comissao", "admin"]`, e é só.

O trabalho dela nasce assim: **reserva (bloqueio) → prova (atendimento
tipo=PROVA) → ajuste**. `ajustes.atendimentoId` é `notNull`
(`schema/atendimentos.ts:162`), e o único lugar do frontend que cria um ajuste
é `reservas/[bloqueioId].tsx:377` (`createAjuste.mutateAsync`), dentro do loop
de provas daquela reserva (`[bloqueioId].tsx:834-855`). **`useCreateAjuste` não
aparece em nenhum outro arquivo** — conferido com
`git grep -ln "useCreateAjuste" -- artifacts/moscow-noivas/src`, um resultado só.

**Logo: a resposta à pergunta do gate é que a prova e o ajuste NÃO esperam o
contrato — eles pendem da reserva.** O gate do E150 (`contratos.ts:448`) trava o
contrato; não trava nada do que a costureira faz. Isso é o que gera A05.1.

---

## A05.1 — A fila da costureira não sabe se a peça foi vendida: o gate trava o contrato e ela costura assim mesmo 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/ajustes/index.tsx:157-241` (lido)
e `artifacts/api-server/src/routes/agenda.ts:783-787` (lido).

**O que a linha diz** — `agenda.ts:783-787`, o contexto INTEIRO que a fila carrega:

```ts
const AJUSTE_WITH = {
  checklist: { orderBy: (t: any, { asc }: any) => [asc(t.ordem)] },
  atendimento: { with: { lead: true, bloqueio: { with: { vestido: true } } } },
} as const;
```

Não há `contrato`. Não há `orcamento`. E o cartão da fila
(`ajustes/index.tsx:170-241`) desenha exatamente: badge `Confecção`, descrição,
`custo`, peça do acervo, nome da noiva, `codigo · nome` do vestido, prazo e
checklist. Nenhuma dessas linhas cita contrato.

**O defeito:** o ateliê tem um gate deliberado entre o aceite e o contrato — o
E150 (`contratos.ts:448`, lido) recusa contrato cujo item aponta peça sem
reserva. Mas o trabalho de agulha **não passa por esse gate**: ele pende do
bloqueio, que existe desde a reserva. A cadeia real é

> reserva criada → prova marcada → ajuste/confecção na fila → **(gate)** → contrato

e a costureira está **antes** do gate, não depois. Se o orçamento aceito nunca
virar contrato — que é exatamente o vão que esta revisão investiga —, a fila
dela não muda em nada: o trabalho continua PENDENTE, com prazo, com custo, com
checklist, e ela o executa.

Pior: `contratos.ts:461-464` diz na letra que o item de agulha nem entra na
regra do gate — *"Só VESTIDO e ACESSORIO entram na regra: SERVICO e AJUSTE não
são peça física e não têm `vestidoId`"*. Uma confecção sob medida atravessa o
gate sem tocá-lo; a peça de acervo da mesma noiva pode estar travada. As duas
metades do mesmo vestido têm regras opostas, e a costureira não vê nenhuma.

**O que a costureira vive:** segunda de manhã ela abre `/ajustes`, lê *"Manga
renda c/ saia lisa · custo R$ 450,00 · Kauany · VE-014 · Siam · prova em 5
dias"* e corta o tecido. Não há na tela um único pixel dizendo que o contrato
da Kauany não fechou. Quando fechar — ou não fechar — ela já cortou.

**A régua atual:** nenhuma. Nenhum teste de `__tests__/` cruza ajuste com
contrato; `git grep -n "ajuste" -- artifacts/api-server/src/routes/contratos.ts`
devolve **uma linha só**, e é um comentário (`contratos.ts:1335`).

---

## A05.2 — Cancelar a reserva libera o vestido e deixa a fila da costureira intacta: ela costura para uma reserva que não existe mais 🟠

**Âncoras:** `artifacts/api-server/src/routes/reservas.ts:182-187` (lido),
`artifacts/api-server/src/routes/agenda.ts:791-793` (lido),
`artifacts/api-server/src/routes/agenda.ts:343-354` (lido).

**O que a linha diz** — `reservas.ts:182-187`, o cancelamento inteiro:

```ts
await tx.update(bloqueioVestidosTable)
  .set({ canceladoEm: new Date(), updatedAt: new Date() })
  .where(and(
    eq(bloqueioVestidosTable.reservaId, reserva.id),
    isNull(bloqueioVestidosTable.canceladoEm),
  ));
```

E `agenda.ts:791-793`, a fila que a costureira lê:

```ts
const ajustes = await db.query.ajustesTable.findMany({
  where: eq(ajustesTable.lojaId, lojaId),
  with: AJUSTE_WITH,
});
```

**O defeito:** o `where` é a loja e nada mais. Não há `isNull(bloqueio.canceladoEm)`,
não há filtro de situação do atendimento. O mesmo vale para `GET /atendimentos`
(`agenda.ts:343-354`, os cinco filtros opcionais são `leadId`, `bloqueioId`,
`tipo`, `de`, `ate` — nenhum toca `canceladoEm`), que é a fonte de
`/provas`. A transação de cancelamento (`reservas.ts:130-188`, lida inteira)
mexe em `reservasTable`, em `bloqueioVestidosTable` e no `audit_log`; **não
encosta em `atendimentosTable` nem em `ajustesTable`.**

E a tela reforça o engano: `provas/index.tsx:120` faz
`const vestido = p.bloqueio?.vestido;` e as linhas 153-157 desenham
`{vestido.codigo} · {vestido.nome}` sem consultar `p.bloqueio.canceladoEm`,
que está no payload (`BloqueioVestido` do openapi) e é ignorado.

**O que a costureira vive:** a noiva desiste na quinta; a vendedora cancela a
reserva e o vestido volta para a arara e para o acervo disponível — a peça é
reservada por outra noiva no mesmo sábado. Na segunda, a fila da costureira
ainda diz *"Barra 3cm · Kauany · VE-014 Siam · prova em 3 dias"*, e `/provas`
ainda lista a prova como AGENDADA com o vestido junto. Ela busca a VE-014, que
agora está separada para outra noiva, e solta a barra dela.

**A régua atual:** ausente e provada ausente. `git grep -n "canceladoEm" --
artifacts/api-server/src/routes/agenda.ts` devolve **zero linhas** — o arquivo
que serve as duas telas da costureira nunca escreveu essa palavra.

---

## A05.3 — A prova pode apontar a reserva de OUTRA noiva: a guarda `RESERVA_DE_OUTRA_NOIVA` existe só no contrato 🟠

**Âncoras:** `artifacts/api-server/src/routes/agenda.ts:370-379` (lido),
`artifacts/api-server/src/lib/escopo-loja.ts:189-193` (lido),
`artifacts/api-server/src/routes/contratos.ts:379` (lido).

**O que a linha diz** — `agenda.ts:370-379`, a validação inteira do `POST /atendimentos`:

```ts
const [okLead, okCabine, okVend, okBloqueio] = await Promise.all([
  leadNaLoja(parsed.data.leadId, lojaId),
  cabineNaLoja(parsed.data.cabineId, lojaId),
  vendedoraNaLoja(parsed.data.vendedoraId, lojaId),
  parsed.data.bloqueioId ? bloqueioNaLoja(parsed.data.bloqueioId, lojaId) : true,
]);
```

E `escopo-loja.ts:189-193`, o que `bloqueioNaLoja` de fato prova:

```ts
export async function bloqueioNaLoja(bloqueioId: string, lojaId: string): Promise<boolean> {
  const [b] = await db.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId))).limit(1);
  return !!b;
}
```

**O defeito:** a loja, e só a loja. O `leadId` do atendimento e o `leadId` do
bloqueio nunca são comparados. É **a mesma classe do S2/E107** — o achado que
deu origem ao código `RESERVA_DE_OUTRA_NOIVA` —, e essa guarda existe em
**um lugar só do repositório**: `contratos.ts:379`
(`git grep -n "RESERVA_DE_OUTRA_NOIVA"` → **1 ocorrência em `routes/`**, 4 em
testes, o resto em docs). O E155 replicou a lição para o orçamento
(`orcamentos.ts:578`, `ajusteDaNoiva`, com o comentário *"a reserva tinha de
ser DESTA noiva"*). A agenda ficou de fora, e ela é justamente a porta que
alimenta a tela da costureira.

**O que a costureira vive:** `/provas` desenha, na mesma linha
(`provas/index.tsx:141-157`), o nome que vem de `p.lead.noivaNome` e o vestido
que vem de `p.bloqueio.vestido`. Com o pareamento errado, a linha lê
*"Kauany — VE-014 · Siam"* enquanto a VE-014 está reservada para a Adelita. Ela
tira a peça da Adelita da arara para a prova da Kauany, e o ajuste que nascer
dessa prova entra na fila apontando o vestido errado (`AJUSTE_WITH` puxa o
vestido pelo bloqueio, `agenda.ts:786`).

**A régua atual:** existe para o contrato
(`e107-prova-e-rastro-api.test.ts:58-78`, lido: *"contrato NÃO prende a reserva
de outra noiva da mesma loja"*, espera 422 `RESERVA_DE_OUTRA_NOIVA`) e **não
existe para o atendimento** — nenhum teste de `__tests__/` posta um atendimento
com `bloqueioId` de outro lead.

---

## A05.4 — O "ajuste extra" nomeado no código não tem porta em tela nenhuma: o dinheiro do trabalho de agulha não entra nem como despesa nem como cobrança 🟡

**Âncoras:** `artifacts/api-server/src/routes/contratos.ts:1334-1336` (lido),
`artifacts/api-server/src/routes/orcamentos.ts:499-503` (lido),
`lib/db/src/schema/atendimentos.ts:165-170` (lido).

**O que a linha diz** — `contratos.ts:1334-1336`, o comentário da rota de parcela avulsa:

```
// E71: cobrança que nasce DEPOIS do plano — multa por devolução atrasada,
// reparo de avaria, ajuste extra. Entra como parcela do contrato e a régua de
// cobrança, o extrato e o caixa a tratam como qualquer outra.
```

E `schema/atendimentos.ts:165-170`, o que `ajustes.custo` é:

```
/**
 * Material + mão de obra da CONFECÇÃO. Nulo é o caso de todo ajuste comum, e
 * também o da confecção cujo custo ainda não se sabe — é o que a costureira
 * cobra, não o que a noiva paga (isso é o item do orçamento).
 */
custo: decimal("custo", { precision: 10, scale: 2, mode: "number" }),
```

**O defeito, em duas metades, as duas medidas por ausência:**

1. **O que a costureira COBRA nunca vira despesa.**
   `git grep -n "ajustesTable\|ajusteId" -- artifacts/api-server/src/routes/financeiro.ts`
   → **zero linhas**. `ajustes.custo` não é lido por nenhuma rota do financeiro,
   não gera `contas_pagar`, não entra em recorrência.
2. **O que a noiva PAGA não tem como ser cobrado depois do aceite.** O item de
   orçamento que cobra a confecção (`orcamentos.ts:569-586`) esbarra em
   `recusaConteudoCongelado` (`orcamentos.ts:499-503`) — orçamento APROVADO não
   recebe item novo. E a saída que o próprio código nomeia — a parcela avulsa —
   **não tem chamador**: `git grep -rn "useCreateParcelaAvulsa" -- artifacts e2e`
   devolve **zero linhas**, e os únicos hooks de parcela usados no frontend são
   `useEstornarParcela`, `useGerarPlanoParcelas`, `useListParcelas`,
   `useReceberParcela` e `useRemoveParcela`
   (`git grep -rhoE "use[A-Z][A-Za-z]*Parcela[A-Za-z]*" -- artifacts/moscow-noivas/src | sort -u`).

A assimetria fica gritante ao lado da avaria, que é o MESMO tipo de fato
(dano/trabalho descoberto depois): a avaria tem `custoReparo`, tem rota
`POST /avarias/:id/cobrar` que grava a parcela (`reservas.ts:981`,
`valorPrevisto: avaria.custoReparo!`) e tem botão na tela
(`reservas/[bloqueioId].tsx:719-723`, `data-testid="cobrar-reparo-${a.id}"`).
O ajuste tem o campo de dinheiro e mais nada.

**Número medido:** com os valores que a própria suíte usa —
`e155-confeccao-api.test.ts:83-88` grava `custo: 450` e afirma
`expect(r.body.custo).toBe(450)`; `e156-confeccao-vira-peca-api.test.ts:118`
comenta *"450 foi o que a costureira cobrou; 1800 é o que a"* noiva paga:

| Fato | Valor | Onde aparece |
|---|---|---|
| Confecção "Manga renda c/ saia lisa" | **R$ 450,00** | `ajustes.custo` |
| Contas a pagar do mês geradas por ela | **R$ 0,00** | nenhuma linha |
| Contrato da noiva | **R$ 5.000,00** | `contratos.valorTotal` |
| Carnê 10× | **R$ 500,00** × 10 = R$ 5.000,00 | `parcelas` |
| Cobrança da confecção nascida na prova | **R$ 0,00** | sem rota chamável |

**R$ 450,00 de mão de obra some da despesa do mês, e a confecção que nasce na
prova (depois do aceite) não tem por onde entrar no carnê — 9% do contrato,
por trabalho.** Dez confecções no ano a esse preço são R$ 4.500,00 fora dos
dois lados do livro.

**A régua atual:** o E94 fixou *"todo movimento de dinheiro deixa rastro, e a
régua é uma só"*. `ajustes.custo` é o campo de dinheiro que ficou fora da régua:
nenhum teste de `__tests__/` liga `ajustes.custo` a `contas_pagar` ou a
`parcelas` — `git grep -n "ajuste" -- artifacts/api-server/src/routes/financeiro.ts`
é vazio.

---

## A05.5 — O prazo só olha o casamento do BLOQUEIO, nunca o da noiva: o trabalho sem peça de acervo cai fora de "Esta semana" 🟡

**Âncora:** `artifacts/moscow-noivas/src/lib/ajustes-da-semana.ts:19-28` (lido).

**O que a linha diz:**

```ts
export function prazoDias(a: AjusteComPrazo): number | null {
  const referencia = a.proximaProva ?? a.atendimento?.bloqueio?.casamentoData;
  return referencia ? diasAteCasamento(referencia) : null;
}

/** Prazo conhecido e dentro de 7 dias — atrasado (< 0) também é "da semana". */
export function naSemana(a: AjusteComPrazo): boolean {
  const dias = prazoDias(a);
  return dias !== null && dias <= 7;
}
```

**O defeito:** a referência é `proximaProva` ou `bloqueio.casamentoData`. **A
data do casamento da NOIVA nunca é consultada**, embora esteja no payload: a
fila carrega `lead: true` (`agenda.ts:786`), o tipo gerado expõe
`lead?: Lead` (`lib/api-zod/src/generated/types/ajusteAtendimento.ts:21`) e
`Lead` traz `casamentoData?: Date | null`
(`lib/api-zod/src/generated/types/lead.ts:26`). O dado viaja pela rede e é
descartado.

Isso importa porque **a confecção é justamente o trabalho que não tem peça de
acervo**. O E155 nasceu do caderno com essa doutrina escrita no schema
(`schema/atendimentos.ts:156-157`): *"a confecção nasce de uma conversa marcada,
exatamente como os dois compromissos de 10:30 do caderno"* — e um compromisso
para conversar sobre a manga não tem vestido reservado, logo não tem bloqueio,
logo não tem `bloqueio.casamentoData`. Sem bloqueio: `prazoDias` → `null` →
`naSemana` → `false` → **o item não aparece no recorte padrão**
(`ajustes/index.tsx:80`, `const semana = lista.filter(naSemana);`), e a ficha
diz *"Sem prazo definido — sem prova nem casamento marcado."*
(`ajustes/[ajusteId].tsx:154`) enquanto a noiva casa em 40 dias.

Há um agravante do lado da tela: **o único formulário que cria ajuste vive
dentro de uma reserva** (`reservas/[bloqueioId].tsx:377`, dentro do bloco de
provas que começa em `:834`). A noiva que só encomenda uma manga sob medida —
sem peça do acervo — não tem onde registrá-la pela interface; pela API ela
entra (`POST /ajustes` só exige `atendimentoId` da loja, `agenda.ts:866`) e cai
direto no ponto cego acima.

**O que a costureira vive:** segunda de manhã, "Esta semana" é o recorte padrão
(`ajustes/index.tsx:50-51`). A peça que leva mais tempo — a que se corta do
zero — é a que não está na lista. Ela só a vê clicando em "Todos", e o rodapé
que avisa (*"N ajustes pendentes mais adiante"*, `ajustes/index.tsx:136-137`)
só aparece quando a semana está **vazia**: com um ajuste na semana, a confecção
invisível não é sequer contada.

**A régua atual:** existe e **afirma o ponto cego como se fosse a intenção** —
`ajustes-da-semana.test.ts:26-34` (lido):

```ts
it("sem prova, vale o casamento; sem referência nenhuma, fica fora do recorte", () => {
  ...
  const semReferencia = { status: "PENDENTE" };
  expect(ajustesDaSemana([peloCasamento, semReferencia])).toEqual([peloCasamento]);
  expect(prazoDias(semReferencia)).toBeNull();
});
```

O caso "tem casamento na noiva, não tem bloqueio" não é testado em lugar
nenhum, e é o caso da confecção. Do lado da API, os dois testes de
`lote23-ajustes-fila-api.test.ts` (linhas 68 e 99) criam provas **sempre** com
bloqueio (`criarProva(lead.id, bloqueio.id, …)`) — a assinatura aceita
`bloqueioId: string | null` (`:42`) e nenhum teste passa `null`.

---

## A05.6 — Ninguém sabe QUEM fez o ajuste nem QUANDO: a fila da costureira é a única escrita do sistema sem autor e sem rastro 🟡

**Âncoras:** `lib/db/src/schema/atendimentos.ts:159-174` (lido),
`artifacts/api-server/src/routes/agenda.ts:884-904` (lido).

**O que a linha diz** — a tabela inteira, `schema/atendimentos.ts:159-174`:
`id`, `lojaId`, `atendimentoId`, `descricao`, `tipo`, `custo`, `status`,
`createdAt`, `updatedAt`. **Não há `usuarioId`, não há `concluidoEm`, não há
`costureiraId`.** O checklist (`:180-186`) é ainda mais raso: `id`, `ajusteId`,
`descricao`, `feito`, `ordem` — nem `updatedAt` tem.

E o PATCH que conclui o trabalho, `agenda.ts:891-894`:

```ts
const [ajuste] = await db.update(ajustesTable)
  .set({ ...parsed.data, updatedAt: new Date() })
  .where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)))
  .returning();
```

**O defeito:** nenhuma chamada a `registrarAuditoria`. O arquivo inteiro tem
três (`git grep -n "registrarAuditoria" -- artifacts/api-server/src/routes/agenda.ts`
→ linhas 301, 590, 943) e as três são **cancelamento/exclusão**. Criar um
ajuste, mudar o custo de R$ 380 para R$ 450, marcar FEITO, reabrir, marcar cada
peça do checklist: nada disso deixa linha na trilha. O único vestígio é
`updatedAt`, que é sobrescrito pela edição seguinte.

**O que a costureira vive:** ela marca "barra feita" na sexta; na segunda o
item está desmarcado. Não há como saber se alguém reabriu, quem foi, nem
quando — e o botão "Reabrir" está a um clique de qualquer pessoa com
`agenda: editar` (`ajustes/index.tsx:289-297`). No sentido inverso, ela também
não tem como provar que entregou: "Concluído" não carrega data nem nome.

**A régua atual:** contraste dentro do MESMO arquivo — o `DELETE /ajustes`
audita com detalhe rico (`agenda.ts:943-950`, grava `descricao`, `tipo`,
`status`, `custo`), e o `PATCH` que muda esses mesmos quatro campos não audita
nada. O E115 alcançou o delete e parou ali.

---

## A05.7 — Não existe medida em lugar nenhum do sistema: a costureira sabe O QUE ajustar em texto livre, e nada mais 🟡

**Âncoras:** `lib/db/src/schema/atendimentos.ts:163` (lido),
`lib/db/src/schema/vestidos.ts:40-84` (lido).

**O que a linha diz** — `schema/atendimentos.ts:163`, o campo onde o trabalho é
descrito:

```ts
descricao: text("descricao").notNull(),
```

Texto livre, e é tudo. `vestidos` (`schema/vestidos.ts:40-84`, lido inteiro)
tem `tamanho: text("tamanho")` (`:78`) — uma etiqueta como "G", não uma medida.

**O defeito, provado por ausência:** `git grep -in "medida" -- artifacts lib`
devolve **20 linhas, e nenhuma é campo de domínio** — são comentários ("peça
sob medida", "recusado com medida") e nomes de teste. Restringindo às camadas
que definem o modelo e as rotas
(`git grep -in "medida" -- lib/db/src artifacts/api-server/src/routes artifacts/moscow-noivas/src/pages`)
sobram **6**, todas prosa.
`git grep -inE "busto|cintura|quadril|manequim"` devolve **três** linhas:
`docs/revisao/2026-08-04-arqueologia-legado/B-releitura-dos-sete-pontos.md:144`,
`.../transcricao-2026-08-10.json:234` e um comentário de enum. As duas primeiras
são o CADERNO DE PAPEL, e dizem literalmente:

> `21–27/09, item 1: **Arnica 2** G (Busto grande) Original`

**O papel registrava a medida da noiva contra a peça. O sistema não tem onde
guardar isso.** É a arqueologia do legado documentando um dado que a migração
não trouxe.

**O que a costureira vive:** a prova acontece, a vendedora digita "Bainha 3cm"
e "Soltar busto". Na próxima prova ninguém sabe quanto era o busto antes, se os
3 cm foram do chão ou do forro, nem quanto ainda há de costura para soltar. O
checklist (`ajuste_checklist_itens`) guarda `descricao` + `feito` — a mesma
prosa, agora com caixinha.

**A régua atual:** não há o que testar; o campo não existe. Registro aqui
porque é a diferença entre "a costureira sabe o que ajustar" (pedido do
ângulo) e o que o sistema entrega: uma frase por linha.

---

## A05.8 — `duracao-da-prova.ts` e `janela-de-prova.ts` decidem coisas só para a DONA: nenhum dos dois chega perto da costureira 🔵

**Âncoras:** `artifacts/moscow-noivas/src/lib/duracao-da-prova.ts:23-30` (lido),
`artifacts/moscow-noivas/src/lib/janela-de-prova.ts:28-42` (lido).

**O que decidem, exatamente:**

- `duracao-da-prova.ts` converte **slots ↔ minutos** e nada mais:
  `minutosDaProva(slots) → Math.max(1, slots) * SLOT_MINUTOS` (`:23-25`),
  `slotsDaProva(minutos) → Math.max(1, Math.round(minutos / SLOT_MINUTOS))`
  (`:28-30`), e `opcoesDeDuracaoDaProva` monta o select garantindo o valor
  vigente (`:37-40`).
- `janela-de-prova.ts` responde **quantos dias de prova a regra reserva**:
  `diasDeProva → Math.max(0, prova - uso)` (`:34`) e
  `temJanelaDeProva → diasDeProva > 0` (`:41`).

**Onde são consumidos** (`git grep -rn` sobre `artifacts/moscow-noivas/src`
excluindo testes): **dois arquivos, os dois de configuração** —
`pages/atendimentos/config.tsx:194, 222, 407, 453` (Cabines & horário) e
`pages/configuracoes/index.tsx:201, 230-233`. Zero ocorrências em
`pages/provas/`, `pages/ajustes/` ou `pages/reservas/`.

**O defeito (leve, e por isso 🔵):** a costureira nunca vê nem "esta prova dura
1h" nem "esta reserva tem 11 dias de prova". A tela de provas
(`provas/index.tsx:116-137`) desenha dia e mês do início e **não desenha o
fim** — o `provaDuracao` da loja não é lido ali. Ela não consegue planejar o
dia pela agenda de provas porque a agenda de provas não diz quanto tempo cada
uma ocupa.

**A régua atual:** as duas libs são bem testadas para o que fazem
(`janela-de-prova.test.ts`, 5 casos com números medidos: 14×3 → 11 dias, 3×3 →
0, 2×3 → 0, 4×3 → 1, vazio → 0). O que falta não é teste — é consumidor.

---

## A05.9 — A fila carrega TODOS os ajustes da loja, para sempre, para desenhar a semana 🔵

**Âncora:** `artifacts/api-server/src/routes/agenda.ts:789-793` (lido) e
`artifacts/moscow-noivas/src/pages/ajustes/index.tsx:67-82` (lido).

**O que a linha diz:** o `GET /ajustes` filtra por `lojaId` e mais nada
(`agenda.ts:792`) — sem `status`, sem janela de data, sem `limit`, sem
paginação —, e ainda dispara duas queries derivadas por cima
(`agenda.ts:802-814` para `proximaProva`, `:822-835` para `pecaDoAcervo`). O
recorte real acontece no navegador: `ajustes/index.tsx:69`
(`lista = (ajustes ?? []).filter((a) => a.status === alvo)`) e `:80`
(`lista.filter(naSemana)`).

**O defeito:** é a classe do E19/E62 ("a tela pedia 3.400 linhas para desenhar
20"), aqui com contexto relacional pesado — cada ajuste vem com checklist +
atendimento + lead + bloqueio + vestido (`AJUSTE_WITH`, `agenda.ts:783-787`).
A ficha de UM trabalho (`ajustes/[ajusteId].tsx:35-40`) usa a **mesma** query,
por escolha declarada no comentário (`:26-29`): abrir um ajuste baixa a fila
histórica inteira da loja.

**Número:** não medi — não tenho banco com volume real, e o repositório não
guarda contagem de `ajustes`. Registro sem número de propósito, por isso 🔵: o
que está provado é a **ausência de recorte**, não o tamanho da dor.

**A régua atual:** nenhuma. Não há teste de volume para `/ajustes`.

---

## Visto de passagem

- **`e107-prova-e-rastro-api.test.ts` não é sobre provas de vestido.** Lido
  inteiro (316 linhas): "prova" ali é *prova de propriedade* — o arquivo trata
  de reserva de outra noiva, delete de conta, estorno concorrente e código de
  erro. Quem procurar cobertura de prova/costura nele não acha, e o nome
  engana. (Foi de lá, `:58-78`, que saiu a âncora da A05.3.)
- **Não existe módulo de permissão para costura.** `permissoes.ts:21` tem seis
  módulos e a costureira entra por `agenda`. Consequência: quem pode marcar
  "barra feita" (`agenda: editar`, `ajustes/index.tsx:62`) também pode
  reagendar a agenda inteira da loja e apagar atendimentos — DELETE é `editar`
  por decisão escrita (`permissoes.ts:79-81`).
- **A peça física não tem localização.** `vestidos` (`schema/vestidos.ts:40-84`)
  não tem arara, prateleira nem sala. "Onde a peça está" só se deduz do ciclo do
  bloqueio (`retiradaDataReal`, `devolucaoDataReal`, `lavagemConcluidaEm`,
  `schema/atendimentos.ts:39-56`), que diz se ela saiu — não onde ela está.
- **A `provaDataReal` é carimbada por quem CONCLUI o atendimento**
  (`agenda.ts:529-535`), dentro da transação do PATCH. Isso está certo e é a
  única escrita do fluxo de prova que fecha o laço com a disponibilidade — vale
  citar como o contraexemplo bom dos achados A05.2 e A05.6.
- **`ajusteChecklistItens` não tem `lojaId`** (`schema/atendimentos.ts:180-186`);
  o escopo vem do pai, com o comentário explícito em `agenda.ts:964-965` e a
  conferência em `carregarItemDaLoja` (`agenda.ts:1001-1008`). Está coberto —
  anotado só para quem for mexer no checklist não achar que é buraco.
