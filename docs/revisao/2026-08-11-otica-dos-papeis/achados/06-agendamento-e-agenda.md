# 06 — agenda — a agenda marca CABINE e VENDEDORA; ela nunca marcou o VESTIDO, e é por isso que nada segura a peça antes do contrato

**Revisão ótica dos papéis**, base `980fce5` · ângulo 06

**Arquivos lidos:**
`artifacts/api-server/src/routes/agenda.ts` (1080 linhas, inteiro) ·
`lib/agenda-core/src/mover.ts` · `lib/agenda-core/src/slots.ts` ·
`lib/db/src/schema/atendimentos.ts` ·
`artifacts/api-server/src/lib/escopo-loja.ts:189-193` ·
`artifacts/moscow-noivas/src/lib/agenda.ts` ·
`artifacts/moscow-noivas/src/pages/agenda/index.tsx` ·
`artifacts/moscow-noivas/src/pages/agenda/grade.tsx` ·
`artifacts/moscow-noivas/src/pages/agenda/semana.tsx` ·
`artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx` ·
`lib/api-zod/src/generated/api.ts:2315-2327, 2608-2620` ·
`lib/api-client-react/src/generated/api.schemas.ts:1303-1319` ·
`artifacts/api-server/src/__tests__/lote17-agenda-concorrencia-api.test.ts` ·
`.../lote33-agenda-mover-api.test.ts` · `.../lote33-agenda-core-unit.test.ts` ·
`.../e115-portal-agenda-api.test.ts` · `e2e/06-agenda.spec.ts` ·
`e2e/18-agenda-grade.spec.ts`

**A tese, em uma frase.** O `recusaDeMover` conhece exatamente dois recursos —
a cabine e a vendedora — e a `Marcacao` que ele recebe **não tem campo de
vestido nenhum**. Some a isso que a API aceita `tipo: "PROVA"` sem
`bloqueioId` (o invariante mora só no `superRefine` do navegador) e a resposta
à pergunta do gate fica escrita no código: **agendar prova não reserva nada, em
lugar nenhum, nunca** — nem a peça naquele horário, nem a peça naquele dia. O
único lugar do sistema que segura vestido é o `POST /bloqueios`, que é do
módulo `vestidos`, e nenhuma linha da agenda o chama.

---

## A06.1 — a grade do dia perde `provaDuracao`, e passa a oferecer o slot que o servidor recusa 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/agenda/index.tsx:108-115` (lido)

**O que a linha diz:**

```tsx
  const expediente = disponibilidade.data
    ? {
        aberturaHora: disponibilidade.data.atendimentoAberturaHora,
        fechamentoHora: disponibilidade.data.atendimentoFechamentoHora,
        // E38: a grade também recusa o drop num dia fechado (LOJA_FECHADA).
        dias: disponibilidade.data.diasFuncionamento,
      }
    : EXPEDIENTE_PADRAO;
```

**O defeito:** três campos copiados, o quarto esquecido. `provaDuracao` **está
na resposta** — `lib/api-client-react/src/generated/api.schemas.ts:1307` o
declara obrigatório em `RegraDisponibilidade` (`provaDuracao: number`) — e a
tela irmã sabe copiá-lo: `artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:306`
escreve `provaDuracao: regra.provaDuracao` no mesmo formato de objeto. A grade,
não.

E os dois consumidores desse objeto na grade dependem dele:

- `grade.tsx:180` — `const dur = Math.max(1, expediente.provaDuracao ?? 1);`
  seguido de `if (dur <= 1) return mapa;` (`grade.tsx:181`): o mapa de
  `coberturas` sai **sempre vazio** para qualquer loja configurada.
- `grade.tsx:415-421` — a `Celula` chama `recusaDeMover(arrastando, …,
  expediente, …)`, e `mover.ts:80` faz `m.tipo === "PROVA" ? Math.max(1,
  provaDuracao ?? 1) : 1` → **toda prova vira 1 slot na tela**, enquanto o
  servidor a trata com `regra.provaDuracao` (`agenda.ts:87`, `agenda.ts:113`).

O paradoxo fecha o argumento: a loja **sem** regra cai em `EXPEDIENTE_PADRAO`,
que tem `provaDuracao: 2` (`mover.ts:105-110`). Ou seja, a única configuração em
que a grade acerta é a que ninguém tem — `configuracao-inicial.ts:150` semeia
`provaDuracao: 2` em toda loja nova.

**Como se manifesta:** loja com `provaDuracao: 2` (60 min, o padrão de
fábrica). Prova da noiva A às 15:00 na Cabine 1 — o servidor a considera
ocupando 15:00–16:00. Na grade do dia: a célula `celula-agenda-<cab1>-15:30`
**não** desenha a barra de continuação (`coberturas` está vazio) e **aceita** o
drop (`aceita = !recusa`, `grade.tsx:423`). A vendedora arrasta a noiva B para
lá, a animação completa, e o PATCH devolve **422 CABINE_OCUPADA** — que vira o
toast "Não deu para reagendar" (`grade.tsx:224-228`). É exatamente o que a
doutrina do E27, escrita duas linhas acima da chamada, existe para impedir:

> `grade.tsx:412-413` — *"A MESMA função que o PATCH consulta: a célula que o
> servidor recusaria não aceita o card, em vez de aceitar e devolver 422 depois
> da animação."*

Não é a mesma função com a mesma entrada.

**A régua atual:** nenhuma pega isto.
`e2e/18-agenda-grade.spec.ts:73-81` cria e arrasta um `tipo: "ATENDIMENTO"`,
nunca uma PROVA. `lote33-agenda-core-unit.test.ts:21` fixa
`const EXPEDIENTE = { aberturaHora: 9, fechamentoHora: 19 };` — **sem
`provaDuracao`** —, então a unidade prega justamente o comportamento truncado.
E `artifacts/moscow-noivas/src/lib/duracao-da-prova.ts:13` cita
`grade.tsx:180` por nome como consumidor de `provaDuracao`: o repositório
acredita que o dado chega ali. Ele não chega.

---

## A06.2 — a tranca do agendamento é da CABINE; a corrida da VENDEDORA em cabines diferentes escapa quando os instantes são sobrepostos e não idênticos 🟠

**Âncoras:** `artifacts/api-server/src/routes/agenda.ts:393-396` e
`agenda.ts:508-510`; `lib/db/src/schema/atendimentos.ts:136-137` (lidos)

**O que a linha diz** (POST, `agenda.ts:393-396`):

```ts
  const criado = await db.transaction(async (tx) => {
    await tx.select({ id: cabinesTable.id }).from(cabinesTable)
      .where(eq(cabinesTable.id, parsed.data.cabineId))
      .for("update");
```

e o que o banco garante (`schema/atendimentos.ts:136-137`):

```ts
  cabineUnq: unique().on(t.cabineId, t.inicio),
  vendedoraUnq: unique().on(t.lojaId, t.vendedoraId, t.inicio),
```

**O defeito:** a S-M22 serializou os criadores trancando **a linha da cabine**.
Isso fecha o eixo da cabine e só ele: dois POSTs para cabines **diferentes**
trancam linhas diferentes, não se bloqueiam, e cada transação relê os
concorrentes (`agenda.ts:115-128`) sem enxergar o INSERT ainda não commitado da
outra. A rede de baixo — as duas UNIQUE — é do **instante exato**, e o próprio
docbloco de `recusaDeMoverAtendimento` já diagnosticou por que isso não basta:

> `agenda.ts:74-76` — *"a UNIQUE é do instante EXATO, e o conflito virou de
> INTERVALO — sob concorrência a pré-checagem era a única guarda, e rodava no
> pool."*

A frase está certa. O conserto cobriu um dos dois eixos.

**Como se manifesta:** mesma vendedora, cabines diferentes, horários
**sobrepostos mas não iguais**, com `provaDuracao: 2`:

- `POST` A: `tipo: "PROVA"`, Cabine 1, vendedora V, `inicio` 17:30 → ocupa
  17:30–18:30.
- `POST` B: `tipo: "ATENDIMENTO"`, Cabine 2, vendedora V, `inicio` 18:00.

Disparados no mesmo instante: a tranca de A é a linha da Cabine 1, a de B é a da
Cabine 2 — não conflitam. A pré-checagem de A não vê B e a de B não vê A. A
UNIQUE `(loja_id, vendedora_id, inicio)` não casa, porque 17:30 ≠ 18:00. **Os
dois respondem 201**, e a vendedora V está em duas cabines às 18:00 — o mesmo
estado que o teste sequencial `lote33-agenda-mover-api.test.ts:152-160` prova
ser recusado quando não há corrida (422 `VENDEDORA_OCUPADA`).

**A régua atual:** existe e passa ao lado.
`lote17-agenda-concorrencia-api.test.ts:114-141` é o único caso concorrente do
eixo vendedora, e ele usa **um `inicio` só nas duas requisições**:

```ts
    const inicio = dia("2027-03-11").toISOString();
    …
      agent.post(…).send({ leadId: leadA.id, cabineId: cabine1, vendedoraId: f.vendedoraId, inicio }),
      agent.post(…).send({ leadId: leadB.id, cabineId: cabine2, vendedoraId: f.vendedoraId, inicio }),
```

— que é exatamente o caso que a UNIQUE cobre. Nenhum teste de nenhuma suíte
dispara **instantes sobrepostos e diferentes** sob `Promise.all`.

---

## A06.3 — a API deixa nascer PROVA sem vestido: o invariante mora só no navegador 🟠

**Âncoras:** `lib/api-zod/src/generated/api.ts:2319-2327`,
`artifacts/api-server/src/routes/agenda.ts:370-379`,
`artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:92-100` (lidos)

**O que a linha diz** (o contrato da criação, `api.ts:2319-2327`):

```ts
export const CreateAtendimentoBody = zod.object({
  "leadId": zod.string(),
  "cabineId": zod.string(),
  "vendedoraId": zod.string(),
  "tipo": zod.enum(['ATENDIMENTO', 'PROVA']).optional(),
  "bloqueioId": zod.string().optional(),
  "inicio": zod.coerce.date(),
  "observacao": zod.string().optional()
})
```

Nenhuma amarra entre `tipo` e `bloqueioId`. E a rota, `agenda.ts:374`, só
pergunta pelo bloqueio **se ele vier**:

```ts
    parsed.data.bloqueioId ? bloqueioNaLoja(parsed.data.bloqueioId, lojaId) : true,
```

A exigência existe — em `novo.tsx:92-100`:

```ts
  .superRefine((values, ctx) => {
    if (values.tipo === "PROVA" && !values.bloqueioId) {
      ctx.addIssue({ …, message: "Escolha o vestido reservado para a prova." });
```

**O defeito:** é uma regra de negócio ("prova é de um vestido reservado") que
vive num `zodResolver` de formulário. O servidor não a conhece. E o repositório
já pagou por isso uma vez — `agenda/index.tsx:154-159` explica por que o
diálogo antigo foi removido: *"aceitava tipo=PROVA sem reserva — a prova órfã
que o E97 teve de consertar depois"*. O conserto foi de **tela**; a porta ficou
aberta.

**Como se manifesta:** `POST /api/lojas/:lojaId/atendimentos` com
`{leadId, cabineId, vendedoraId, tipo: "PROVA", inicio}` responde **201**. A
prova nasce, aparece na grade com o selo "Prova" (`grade.tsx:520`), entra na
fila do dia, dispara a confirmação por WhatsApp (`index.tsx:87-101`) — e não há
peça nenhuma atrás dela. É a prova que a noiva vem fazer de um vestido que
ninguém separou.

**A régua atual: a suíte prega o comportamento.**
`e115-portal-agenda-api.test.ts:108-119` define `criar(inicio, tipo)` enviando
só `leadId, cabineId, vendedoraId, tipo, inicio` e faz
`await criar(as(17, 30), "PROVA").expect(201);` — **uma PROVA sem `bloqueioId`,
esperada como sucesso.** Fechar este achado exige reescrever essa fixture.

---

## A06.4 — a agenda não conhece a PEÇA: duas provas do MESMO vestido no mesmo horário passam 🟠

**Âncoras:** `lib/agenda-core/src/mover.ts:57-66`, `mover.ts:201-208`,
`artifacts/api-server/src/routes/agenda.ts:115-128`,
`lib/db/src/schema/atendimentos.ts:136-137` (lidos)

**O que a linha diz.** O tipo que a régua inteira manipula (`mover.ts:57-66`):

```ts
/** O mínimo que a regra precisa saber — a linha do drizzle e o objeto da API entram igual. */
export type Marcacao = {
  id: string;
  cabineId: string;
  vendedoraId: string;
  inicio: Date | string;
  tipo?: "ATENDIMENTO" | "PROVA";
};
```

E o laço que decide o conflito (`mover.ts:201-208`):

```ts
  for (const outra of outras) {
    if (outra.id === movida.id) continue;
    …
    if (!sobrepoe(iniMovida, fimMovida, iniOutra, fimOutra)) continue;
    if (outra.cabineId === destino.cabineId) return "CABINE_OCUPADA";
    if (outra.vendedoraId === movida.vendedoraId) return "VENDEDORA_OCUPADA";
  }
```

**Dois `if`. Cabine e vendedora.** Não há terceiro. O `SELECT` dos concorrentes
que alimenta esse laço (`agenda.ts:116-122`) sequer traz a coluna:
`{ id, cabineId, vendedoraId, inicio, tipo }` — `bloqueioId` fica de fora. E o
banco não cobre o vão: as duas únicas UNIQUE da tabela
(`schema/atendimentos.ts:136-137`) são de `(cabine, inicio)` e
`(loja, vendedora, inicio)`. **Nenhuma constraint, nenhum índice, nenhuma
checagem menciona `bloqueio_id` junto de `inicio`.**

**Como se manifesta:** o mesmo bloqueio (logo, o mesmo vestido físico) marcado
às 15:00 na Cabine 1 com a vendedora V1 e às 15:00 na Cabine 2 com a vendedora
V2 → **dois 201**. O vestido é um só e está em duas cabines. É a mesma classe de
corrida que o `EXCLUDE` gist de `(vestido_id, daterange)` impede no eixo do
**dia** (provado em `lote17-agenda-concorrencia-api.test.ts:143-181`) e que
ninguém impede no eixo da **hora**.

**A ligação direta com o gate.** Junte A06.3 e A06.4 e a resposta à pergunta da
revisão fica sem rodeio:

1. a agenda não exige peça para marcar prova (A06.3);
2. quando há peça, a agenda não a trata como recurso disputável (A06.4);
3. quem segura peça é `POST /lojas/:lojaId/bloqueios`, do módulo **`vestidos`**
   — e a tela de agendar só o chama por um botão explícito de
   *"Criar reserva"* (`novo.tsx:257-284`), gateado por
   `podeNoModulo(acessosModulos, "vestidos", "criar")` (`novo.tsx:164`), que **a
   recepção não tem** (o próprio comentário S36 em `novo.tsx:152-163` registra
   que o perfil padrão da recepção é `agenda: TUDO` e `vestidos: SO_VER`).

Logo: a recepcionista pode agendar quantas provas quiser, do começo ao fim do
funil, sem que uma única peça fique reservada — e o `contratos.ts:448` cobra
justamente a reserva que ninguém do caminho dela tinha permissão de criar.

**A régua atual:** nenhuma. Não existe teste, em nenhuma das quatro suítes de
agenda, que cite `bloqueioId` num cenário de conflito de horário.

---

## A06.5 — a prova casa com o bloqueio de OUTRA noiva, e concluí-la encurta a disponibilidade do vestido dela 🟡

**Âncoras:** `artifacts/api-server/src/routes/agenda.ts:374`,
`artifacts/api-server/src/lib/escopo-loja.ts:189-193`,
`agenda.ts:529-535` (lidos)

**O que a linha diz** (`escopo-loja.ts:189-193`, o único cheque que o bloqueio
recebe):

```ts
export async function bloqueioNaLoja(bloqueioId: string, lojaId: string): Promise<boolean> {
  const [b] = await db.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId))).limit(1);
  return !!b;
}
```

**O defeito:** confere **loja**, e mais nada. Não confere que
`bloqueio.leadId === parsed.data.leadId` — a noiva do atendimento e a noiva da
reserva podem ser pessoas diferentes. Não confere `canceladoEm` — uma reserva
cancelada (o vestido já voltou ao acervo, e pode estar reservado para outra
noiva) aceita prova nova.

**Como se manifesta.** Duas consequências, e a segunda é a que suja dado:

1. A ficha e o portal da noiva A mostram o vestido da noiva B — o `GET`
   enriquece por `bloqueio: { with: { vestido: true } }` (`agenda.ts:181`).
2. Quando essa prova é concluída, `agenda.ts:529-535` carimba
   `provaDataReal` **no bloqueio de B**:

   ```ts
   if (parsed.data.situacao === "CONCLUIDO" && existente.tipo === "PROVA" && existente.bloqueioId) {
     await tx.update(bloqueioVestidosTable)
       .set({ provaDataReal: atendimento.atendidoEm ?? atendimento.inicio, updatedAt: new Date() })
   ```

   O comentário logo acima (`agenda.ts:522-528`) diz que isso "colapsa a janela
   de prova para o dia em que a prova de fato aconteceu". A prova de **A**
   colapsa a janela de **B**: o vestido de B fica livre em datas em que ele
   deveria estar preso, e o `verificarDisponibilidade` passa a mentir para o
   próximo que pedir a peça.

O caminho não é só de API forjada: o deep-link de agendar
(`novo.tsx:117-131`) preenche `leadId` e `bloqueioId` **direto da URL**
(`searchParams.get("noiva")`, `searchParams.get("reserva")`) sem nenhum
cruzamento entre os dois — um link copiado e editado entra assim.

**A régua atual:** nenhuma. Nenhum teste manda `bloqueioId` de um lead
diferente do `leadId`, nem `bloqueioId` de bloqueio cancelado.

---

## A06.6 — o formulário e o servidor discordam sobre quem ocupa a cabine: FALTOU e CONCLUÍDO 🟡

**Âncoras:** `artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:316-319`,
`artifacts/api-server/src/routes/agenda.ts:115-128`,
`artifacts/moscow-noivas/src/pages/agenda/grade.tsx:285` (lidos)

**O que a linha diz** (`novo.tsx:316-319`):

```tsx
    // Concluído e falta não seguram a cabine — só o que ainda vai acontecer.
    const ocupadas: Marcacao[] = atendimentosDia.data.filter(
      (a) => a.situacao === "AGENDADO" || a.situacao === "EM_ATENDIMENTO",
    );
```

**O defeito:** o servidor não faz esse filtro. O `SELECT` de concorrentes
(`agenda.ts:124-128`) recorta por `lojaId` e pela janela de tempo, **sem uma
única condição sobre `situacao`**. E a grade também não: `grade.tsx:285` passa
`atendimentosDoDia={atendimentos}`, a lista inteira do dia. São **três
consumidores da mesma função com três entradas diferentes**:

| Consumidor | Ocupantes que ele considera | `provaDuracao` |
|---|---|---|
| Servidor (`agenda.ts:115-128`) | todos | sim |
| Grade (`grade.tsx:415-421`) | todos | **não** (A06.1) |
| Formulário (`novo.tsx:316-329`) | só AGENDADO/EM_ATENDIMENTO | sim |

**Como se manifesta:** a noiva A **FALTOU** às 15:00 na Cabine 1. A vendedora
abre *Agendar*, escolhe Cabine 1 e o dia: o botão `slot-15:00` vem **habilitado**
(`disabled={recusa !== null}`, `novo.tsx:735`), porque a faltosa foi filtrada.
Ela clica, clica em Agendar, e a API devolve **422 CABINE_OCUPADA** →
"Não deu para agendar" (`novo.tsx:410-415`). A tela ofereceu, o servidor
recusou — a doutrina do E27 pelo avesso, e o comentário em `novo.tsx:320-322`
diz literalmente que a razão de as ausências entrarem ali é *"evitar o 422, que
é o defeito que a doutrina do E27 existe para evitar"*.

Qual dos dois lados está certo é decisão de produto (a linha 316 tem o argumento
mais forte: uma noiva que faltou não segura cabine nenhuma). O defeito é os dois
existirem ao mesmo tempo.

**A régua atual:** nenhuma. Nenhum teste cruza os três consumidores; nenhum
cenário de agenda usa `situacao: "FALTOU"`.

---

## A06.7 — não existe passado: agenda-se para ontem, e arrasta-se para trás 🟡

**Âncoras:** `lib/agenda-core/src/mover.ts:141-211`,
`artifacts/api-server/src/routes/agenda.ts:393-416`,
`artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx:691` (lidos)

**O que a linha diz:** `recusaDeMover` tem cinco motivos, e a lista está fechada
em `mover.ts:25-30`:

```ts
export type MotivoRecusa =
  | "LOJA_FECHADA"
  | "FORA_DO_HORARIO"
  | "VENDEDORA_AUSENTE"
  | "CABINE_OCUPADA"
  | "VENDEDORA_OCUPADA";
```

Nenhum deles é "esse horário já passou", e o corpo da função (`mover.ts:151-211`)
nunca lê o relógio. O POST (`agenda.ts:393-416`) também não. E o campo da tela é
um `date` sem piso:

```tsx
                          <Input type="date" aria-label="Data" {...field} />
```

(`novo.tsx:691` — sem `min`).

**Como se manifesta:** `POST` com `inicio` em 2025 responde **201** desde que o
dia da semana esteja em `diasFuncionamento` e a hora caiba no expediente. Na
loja isso é o erro de digitação de ano: a recepcionista marca a prova para
`2026-09-04` em vez de `2027-09-04`, o sistema aceita sem um pio, o atendimento
não aparece na grade de nenhum dia que alguém vá abrir, e a noiva não é
procurada — a fila "Falta procurar" (`index.tsx:216`) só existe dentro do dia
visível. O mesmo vale para o arraste e para o diálogo de reagendar
(`grade.tsx:137-153`), que aceitam qualquer slot do dia da URL, e o `?dia=` é
livre.

**A régua atual:** nenhuma, e a ausência é sistemática:
`lote33-agenda-mover-api.test.ts:35` fixa `const DIA = "2027-04-12";` e os oito
casos do arquivo movem dentro desse dia futuro. Nenhum move para trás no tempo.
Também não há caso de mover prova de contrato cancelado — o arquivo não menciona
contrato, bloqueio nem reserva em lugar nenhum.

---

## A06.8 — a visão da semana escolhe a semana pelo relógio do NAVEGADOR 🟡

**Âncoras:** `artifacts/moscow-noivas/src/pages/agenda/semana.tsx:46-50`,
`semana.tsx:103`, `semana.tsx:173` e `semana.tsx:191` (lidos)

**O que a linha diz** (`semana.tsx:46-50`):

```tsx
  const segunda = useMemo(() => {
    const base = ancoraParam ? new Date(`${ancoraParam}T12:00:00`) : new Date();
    return startOfWeek(Number.isNaN(base.getTime()) ? new Date() : base, { weekStartsOn: 1 });
  }, [ancoraParam]);
```

e `semana.tsx:103`: `const hoje = new Date();`, consumido por
`isSameDay(dia, hoje)` em `semana.tsx:173` e `semana.tsx:191`.

**O defeito:** o próprio arquivo já diz que essa fronteira ficou pela metade.
`semana.tsx:64-69` registra que o E115 consertou o lado do **atendimento**
(passou a usar `diaLocal`, o dia da loja) e deixou as colunas como *"dias-
calendário sintéticos"*. Esses dias sintéticos nascem de `new Date()` **no fuso
do navegador**, e é deles que sai a janela pedida à API (`semana.tsx:53`:
`{ de: diaISO(dias[0]), ate: diaISO(dias[6]) }`). É a mesma classe que o S-M25
(`b8556aa`) fechou em quatro fronteiras — inclusive em dez specs E2E que
"computavam 'hoje' no calendário UTC contra um app que vive em `hojeLocal`".

**Número medido:** domingo **09/08/2026 às 23h30 em São Paulo** =
**10/08/2026 02h30 UTC**. Num navegador em UTC, `new Date()` cai em segunda
10/08; `startOfWeek(…, { weekStartsOn: 1 })` devolve 10/08; a janela pedida é
`de=2026-08-10 · ate=2026-08-16`. A semana corrente inteira (03–09/08) — **sete
dias, incluindo os atendimentos daquele mesmo domingo à noite** — não é sequer
buscada. A recepcionista clica em "Semana" e vê a semana que vem, sem nenhum
indício de que pulou uma.

**A régua atual:** nenhuma. Não há spec de `agenda/semana` em `e2e/` (as duas
specs de agenda são `06-agenda.spec.ts`, da tela do dia, e
`18-agenda-grade.spec.ts`, da grade), e nenhum teste de unidade toca este
arquivo.

---

## A06.9 — feriado e almoço não existem; o expediente é um par de horas e um conjunto de dias da semana 🔵

**Âncoras:** `lib/agenda-core/src/mover.ts:68-74`,
`lib/agenda-core/src/slots.ts:53-62`,
`artifacts/api-server/src/routes/agenda.ts:713-768` (lidos)

**O que a linha diz** (`mover.ts:68-74`) — o expediente inteiro do domínio:

```ts
export type Expediente = {
  aberturaHora: number;
  fechamentoHora: number;
  dias?: number[];
  /** Duração da PROVA em slots de 30 min (E40). Ausente = 1 slot. */
  provaDuracao?: number;
};
```

**O que existe e o que não existe:**

- **3h da manhã: recusado, e isso está certo.** `slots.ts:79` faz
  `hora >= aberturaHora && hora < fechamentoHora`; com abertura 9, as 3h caem em
  `FORA_DO_HORARIO`. `e115-portal-agenda-api.test.ts:128-129` prega o caso das
  22h. Esta parte da pergunta tem resposta boa.
- **Feriado: não existe.** Não há tabela, coluna nem enum de feriado. O único
  jeito de fechar 07/09 é criar uma ausência **por pessoa** —
  `POST /ausencias` é `{usuarioId, inicio, fim, motivo}` (`agenda.ts:713-768`) —
  e mesmo com a equipe inteira coberta a recusa que a tela mostra é
  `VENDEDORA_AUSENTE` ("a vendedora está ausente nesse dia"), não
  `LOJA_FECHADA`. Quem contratar uma vendedora nova depois reabre o feriado sem
  saber.
- **Almoço: não existe.** `slotsDoDia` (`slots.ts:53-62`) gera a malha contínua
  da abertura ao fechamento; 12:00 e 12:30 são slots como quaisquer outros.
  Numa loja 9h–20h isso são 22 slots oferecidos por cabine, todos como se
  houvesse gente.

Isto é 🔵 porque é ausência de capacidade, não defeito de código — mas é a
ausência que a arqueologia do caderno já apontou no vizinho (a ausência de
pessoa virou a `ausenciasTable` no E151) e que ninguém ainda apontou na loja.

---

## A06.10 — a prova não troca de vestido: `UpdateAtendimentoBody` não tem `bloqueioId` 🔵

**Âncora:** `lib/api-zod/src/generated/api.ts:2613-2620` (lido)

**O que a linha diz:**

```ts
export const UpdateAtendimentoBody = zod.object({
  "cabineId": zod.string().optional(),
  "vendedoraId": zod.string().optional(),
  "inicio": zod.coerce.date().optional(),
  "situacao": zod.enum(['AGENDADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU']).optional(),
  "desfecho": zod.enum(['RESERVOU', 'VAI_PENSAR', 'NAO_SERVIU']).optional(),
  "observacao": zod.string().optional()
})
```

**O defeito:** a prova pode mudar de cabine, de vendedora, de horário e de
situação — nunca de vestido. Quando a noiva troca a peça (que é a coisa mais
comum do ateliê entre a primeira e a segunda prova), a única saída é apagar o
atendimento e recriar. E apagar tem duas portas fechadas: `agenda.ts:571-577`
recusa 409 se ele já estiver `CONCLUIDO` ("a história da ficha da noiva — ele
não se apaga") e `agenda.ts:582-588` recusa 409 se houver ajuste de costura
pendurado. Numa segunda prova com ajuste aberto, **não há caminho nenhum**: a
prova fica presa ao vestido antigo para sempre.

O lado bom é que a omissão fecha um vazamento: como o PATCH não aceita
`bloqueioId`, o cheque de tenant que falta ali (`agenda.ts:454-457` confere só
cabine e vendedora) não é explorável.

---

## Visto de passagem

Fora do escopo deste ângulo, achados de passagem — cada um com âncora lida:

- **`DELETE /ausencias` é um delete cru** (`agenda.ts:770-778`): responde 204
  mesmo sem apagar nada, sem 404, sem auditoria e sem transação. É a mesma
  forma que a S-M1 (cabine) e a S-M16 (ajuste) consertaram nas rotas vizinhas
  **deste mesmo arquivo**; a régua não chegou à ausência que o E151 criou
  depois.
- **A ausência não avisa o que ela atropela** (`agenda.ts:755-762`): o POST não
  confere sobreposição com outra ausência do mesmo usuário nem conta os
  atendimentos já marcados no período. A decisão de só impedir o novo está
  escrita e é legítima (`mover.ts:165-169`), mas ninguém **lista** o que ficou
  marcado — a vendedora sai de férias e as provas dela seguem na grade, sem
  dono, em silêncio.
- **`POST /atendimentos/:id/contato` é check-then-write no pool**
  (`agenda.ts:634-638`): lê `existente.contatadoEm` fora de transação e depois
  escreve. Sob dois cliques simultâneos, dois UPDATEs. O dano é nulo (o valor é
  o mesmo relógio), então é registro, não trabalho.
- **A grade não tem `tipo` no `Marcacao` que arrasta**: `grade.tsx:415` passa
  `arrastando` (um `Atendimento` completo, que tem `tipo`) — este está certo, e
  é justamente o que torna A06.1 visível: o `tipo` chega, a duração não.
