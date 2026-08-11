# 03 — cliente/noiva — o link promete um acordo fechado e um aviso que não existe; o que o sistema cumpre é uma coluna `aceito_em`

**Revisão ótica dos papéis**, base `980fce5` · ângulo 03
**Ótica:** a noiva abre o link do WhatsApp às 23h40, sozinha, de casa. Ela não
sabe o que é bloqueio nem reserva. Ela sabe ler o que está escrito na tela.

**Arquivos lidos (inteiros, salvo onde a faixa está dita):**

- `artifacts/moscow-noivas/src/pages/orcamento-publico.tsx` (1–173)
- `artifacts/api-server/src/routes/orcamentos-publico.ts` (1–101)
- `artifacts/api-server/src/lib/aceite-orcamento.ts` (1–71)
- `artifacts/api-server/src/lib/conteudo-orcamento.ts` (1–47)
- `artifacts/api-server/src/lib/visao-noiva.ts` (1–96 do orçamento; 98–276 lidos)
- `artifacts/api-server/src/routes/orcamentos.ts` (1–200, 240–410, 640–753)
- `artifacts/api-server/src/routes/contratos.ts` (200–269, 415–474)
- `artifacts/api-server/src/routes/portal.ts` (310–357)
- `artifacts/api-server/src/lib/auth.ts` (1–25)
- `artifacts/api-server/src/lib/estados.ts` (45–68)
- `artifacts/api-server/src/app.ts` (55–134)
- `lib/db/src/schema/orcamentos.ts` (1–116)
- `artifacts/moscow-noivas/src/lib/mensagens-do-dia.ts` (108–131)
- `artifacts/moscow-noivas/src/pages/dashboard.tsx` (168–183)
- `artifacts/moscow-noivas/src/pages/mensagens/index.tsx` (250–265)
- `artifacts/moscow-noivas/src/lib/formatos.ts` (218–238)
- `artifacts/api-server/src/__tests__/lote22-orcamento-publico-api.test.ts` (1–147)
- `artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts` (1–109)
- `artifacts/api-server/src/__tests__/aceite-orcamento-api.test.ts` (1–144)

---

## A03.1 — "A sua vendedora já foi avisada" — não há aviso nenhum, e o aceite REMOVE o orçamento da única fila proativa da loja 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:139-143` (lido)

**O que a linha diz:**

```tsx
                  <span>
                    Você aceitou esta proposta em{" "}
                    <span className="font-medium">{instanteLongo(dados!.aceitoEm)}</span>.
                    A sua vendedora já foi avisada.
                  </span>
```

**O defeito.** A frase é uma afirmação de fato sobre o mundo, e o mundo não a
cumpre. O aceite grava três coisas e só três —
`artifacts/api-server/src/lib/aceite-orcamento.ts:32-56` (lido): o `UPDATE` do
orçamento (`aceitoEm`, `aceiteVersao`, `aceiteHash`, `status: "APROVADO"`,
`aprovadoEm`) e um `INSERT` na `auditLogTable` com
`acao: "ORCAMENTO_ACEITO"`. **Não existe subsistema de notificação neste
servidor**: `git grep -n "notificac\|notifica" -- artifacts/api-server/src
lib/db/src` devolve ZERO linhas. Não há e-mail, não há push, não há fila, não
há tabela.

Pior: o aceite **piora** a chance de a loja perceber. A única fila proativa que
olha orçamentos filtra por `ENVIADO`, e o aceite acabou de tirar o orçamento
desse status —
`artifacts/moscow-noivas/src/lib/mensagens-do-dia.ts:126` (lido):

```ts
      if (o.status !== "ENVIADO" || !o.validade) return false;
```

Os dois consumidores dessa régua confirmam que o recorte é de status, e não de
"precisa de atenção": `artifacts/moscow-noivas/src/pages/dashboard.tsx:176`
(lido) — `const paramsEnviados = { status: "ENVIADO" as const };` — e
`artifacts/moscow-noivas/src/pages/mensagens/index.tsx:256` (lido) —
`// Orçamentos ENVIADOS com validade nas próximas 72h (ainda não vencidos).`

E não há a fila simétrica: `git grep -n "APROVADO" -- artifacts/moscow-noivas/src`
devolve 15 linhas, **nenhuma delas uma fila de trabalho** — são rótulos
(`formatos.ts:36`), cor de badge (`status-badge.ts:63`), um chip de filtro que
alguém precisa clicar (`orcamentos/index.tsx:49`) e badges de detalhe. O único
lugar onde a loja vê o aceite é abrindo AQUELE orçamento:
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:757-758` (lido) —
`{orcamento.aceitoEm ? "Aceito pela noiva" : "Sem aceite da noiva"}`.

Também não existe mensagem de volta para ela: os quatro construtores de
WhatsApp do sistema são `msgCobranca`, `msgOrcamentoVencendo`,
`msgDaNoivaParaAtelier` e `msgConfirmacaoAtendimento`
(`artifacts/moscow-noivas/src/lib/whatsapp.ts:79,104,125,133`) — nenhum é
"recebemos o seu aceite".

**O que a noiva vive.** Sábado, 23h40. Ela lê "A sua vendedora já foi avisada",
fecha o telefone e considera o vestido resolvido. Do outro lado, o orçamento
saiu da fila de "vencendo em 72h" (que era o único empurrão que faria alguém
abrir aquela ficha) e entrou num estado que **nenhuma tela vigia**. Se a
vendedora não abrir por acaso a ficha daquela noiva, o aceite fica parado — e a
noiva não tem como saber, porque a tela dela já disse que estava avisada.

**A régua atual.** `aceite-orcamento-api.test.ts:95-106` (lido) prova que a
linha de auditoria nasce. **Nenhum teste afirma que alguém é avisado** — nem
poderia, porque não há o que testar. É o texto da tela que está sozinho.

---

## A03.2 — ela aceita um item chamado "Vestido Aurora" e o vestido continua livre; a tela nunca diz isso, e o gate só aparece do lado de lá 🟠

**Âncora:** `artifacts/api-server/src/lib/aceite-orcamento.ts:16-71` (lido,
arquivo inteiro)

**O que a linha diz:** as 71 linhas do arquivo. Nenhuma cita `vestido`,
`bloqueio`, `reserva` ou `disponibilidade`. O `set` do aceite, na íntegra
(`:32-39`):

```ts
      .set({
        aceitoEm: agora,
        aceiteVersao: versao?.numero ?? null,
        aceiteHash: versao?.hash ?? null,
        status: "APROVADO",
        aprovadoEm: agora,
        updatedAt: agora,
      })
```

**O defeito.** O único caminho de produção que cria reserva física é
`artifacts/api-server/src/routes/reservas.ts:507` —
`const [bloqueio] = await tx.insert(bloqueioVestidosTable).values({` — uma rota
**autenticada**, que só a loja alcança (`git grep -n
"insert(bloqueioVestidosTable)" -- artifacts/api-server/src` devolve três
linhas: essa, `__tests__/helpers.ts:389` e um teste). O aceite da noiva não
passa por lá, e o link público não tem por onde.

Do outro lado do vão, o contrato **exige** a reserva —
`artifacts/api-server/src/routes/contratos.ts:470-474` (lido):

```ts
  const pecasVendidas = itensSnapshot.filter(
    (it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId,
  );
  if (pecasVendidas.length > 0) {
    const semReserva = pecasVendidas.filter((it) => !vestidosReservados.has(it.vestidoId!));
```

com o comentário do E150 em `:448` dizendo a tese na letra: *"o contrato não
vende peça que não reservou"* … *"deixava a peça livre para a próxima noiva do
mesmo sábado"*.

A tela pública, enquanto isso, dá à noiva as duas marcas de negócio fechado e
nenhuma ressalva. O badge —
`artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:82-84` (lido):

```tsx
                {dados!.status === "APROVADO" && (
                  <Badge variant="secondary">Aprovado</Badge>
                )}
```

E o rodapé do botão, que é o ÚNICO lugar onde o sistema explica o que o aceite
significa — `:155-157` (lido):

```tsx
                  <p className="text-xs text-muted-foreground text-center">
                    Ao aceitar, registramos a data e o conteúdo desta versão da proposta.
                  </p>
```

Essa frase é tecnicamente honesta e **funcionalmente muda**: ela diz o que o
sistema faz, não o que o sistema NÃO faz. Nenhuma linha das 173 do arquivo
contém a palavra "reserva", "reservado", "disponível" ou "vestido" — a peça
desce como texto livre em `it.descricao` (`:91`), sem `vestidoId` (a visão
pública o descarta: `lib/visao-noiva.ts:89-94` mapeia só
`tipo, descricao, valorUnitario, quantidade`).

**O que a noiva vive.** A proposta lista "Vestido Aurora — R$ 8.000,00" (é
literalmente a fixture do teste do link público,
`lote22-orcamento-publico-api.test.ts:66`). Ela aceita às 23h40 e lê "Aprovado"
+ "Você aceitou esta proposta". Na segunda-feira outra noiva reserva o mesmo
Aurora pela rota `/reservas` — nada no sistema sabe que o Aurora está prometido,
porque o aceite não deixou marca no acervo. Quando a vendedora da primeira
finalmente monta o contrato, o E150 recusa por falta de reserva ou o
`verificarDisponibilidade` recusa por conflito
(`contratos.ts:440-442`, `VESTIDO_INDISPONIVEL`). **O erro aparece para a
vendedora; a promessa apareceu para a noiva.**

**Número medido.** Com a fixture do link público: itens de R$ 8.000,00 (vestido)
+ 2 × R$ 150,00 (barra) = bruto R$ 8.300,00, desconto 10% → **líquido
R$ 7.470,00** (`lote22-orcamento-publico-api.test.ts:80-81` afirma exatamente
`totalBruto: 8300` e `totalLiquido: 7470`). É esse número que a tela mostra
sobre o botão "Aceitar esta proposta" — e ele não segura uma cabide.

**A régua atual.** `e115-orcamento-aceite-api.test.ts` (109 linhas, lido) cobre
preço × aceite × contrato em três casos e **não menciona reserva uma vez**. O
`aceite-orcamento-api.test.ts` idem. Não existe teste que pergunte "o aceite
reservou?" — porque a resposta combinada é "não, e está certo assim"; o que
falta é a tela dizer isso à noiva.

---

## A03.3 — o aceite falha em SILÊNCIO: a tela tem o mapa de erros pronto e nunca o usa no botão 🟠

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:46-51`
(lido)

**O que a linha diz:**

```tsx
  const aceitar = useAceitarOrcamentoPublico({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetOrcamentoPublicoQueryKey(params) }),
    },
  });
```

**O defeito.** A mutation tem `onSuccess` e **nada mais**. Não há `onError`, e o
JSX nunca lê `aceitar.isError` nem `aceitar.error` — o único ramo de erro da
página inteira é o da CONSULTA, em `:71-74` (lido):

```tsx
          ) : orcamento.isError ? (
            <p className="text-sm text-center">
              {ERROS[erro?.data?.error ?? ""] ?? ERROS.LINK_INVALIDO}
            </p>
```

O mapa `ERROS` (`:26-30`) existe, traduz `LINK_EXPIRADO`, `LINK_INVALIDO` e
`MUITAS_TENTATIVAS` em português de gente — e o botão de aceite não o consulta.
O bloco do botão (`:145-159`) só alterna o rótulo por `aceitar.isPending`:

```tsx
                    {aceitar.isPending ? "Registrando…" : "Aceitar esta proposta"}
```

E o servidor tem quatro respostas de recusa para esse POST, todas alcançáveis
com a página já aberta — `artifacts/api-server/src/routes/orcamentos-publico.ts`
(lido): `400` validação (`:65-68`), `404 LINK_INVALIDO` (`:75-78`),
`410 LINK_EXPIRADO` (`:80-83`) e `422 NAO_ENVIADO` (`:90-93`):

```ts
  if (orcamento.status !== "ENVIADO") {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${orcamento.status}` });
```

A página **não refaz a consulta sozinha** (não há `refetchInterval`; o
`invalidateQueries` só roda no sucesso), então uma aba aberta desde as 22h
continua mostrando o botão mesmo depois de a loja recusar o orçamento ou de o
link expirar às 23h59.

**O que a noiva vive.** Ela toca "Aceitar esta proposta". O botão escreve
"Registrando…", volta a "Aceitar esta proposta", e **nada acontece**. Nenhuma
mensagem, nenhum toast, nenhuma cor. Ela toca de novo. E de novo. Às 23h40, sem
ninguém do ateliê por perto, a leitura natural é "o site está quebrado" ou "eu
já aceitei?" — e as duas estão erradas. Se ela insistir o bastante, o
rate-limit de 30 requisições/5 min do prefixo `/api/orcamentos/publico`
(`artifacts/api-server/src/app.ts:89-102`, lido) responde `MUITAS_TENTATIVAS` —
uma chave que a página **tem traduzida** e continua sem mostrar.

**A régua atual.** **Nenhuma.** `git grep -n "publico\|/orcamento/" -- e2e`
devolve ZERO linhas: nenhum spec do E2E abre a rota
`/orcamento/:token` (`artifacts/moscow-noivas/src/App.tsx:260`). O
`data-testid="aceitar-orcamento"` (`orcamento-publico.tsx:151`) **não tem um
único leitor no repositório** — `git grep -n "aceitar-orcamento"` devolve só a
própria linha. E não há teste de unidade da página: dos 59 arquivos
`*.test.*` de `artifacts/moscow-noivas/src`, nenhum é de `pages/`.

---

## A03.4 — "Proposta válida até 10 de setembro" e o servidor aceita no dia 15: a validade nunca é conferida no POST 🟡

**Âncora:** `artifacts/api-server/src/routes/orcamentos-publico.ts:80-93` (lido)

**O que as linhas dizem** — as ÚNICAS guardas do aceite:

```ts
  if (!orcamento.publicoExpiraEm || orcamento.publicoExpiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // Idempotente: o clique duplo devolve o aceite que já existe.
  if (orcamento.aceitoEm) {
    res.json(AceitarOrcamentoPublicoResponse.parse({ aceitoEm: orcamento.aceitoEm }));
    return;
  }
  if (orcamento.status !== "ENVIADO") {
```

`orcamento.validade` **não aparece em nenhuma delas**. E não aparece no aceite
do portal tampouco: `artifacts/api-server/src/routes/portal.ts:335-353` (lido)
repete a mesma tríade — `expiraEm` do portal, `aceitoEm`, `status` — e ignora
`validade`. `git grep -n "validade"` sobre `artifacts/api-server/src` devolve
cinco linhas úteis: duas em `lib/visao-noiva.ts:49,81` (que só a **exibem**),
uma em `routes/orcamentos.ts:274` (que a **cria**) e duas de comentário. **A
validade é decoração: nada no servidor a faz valer.**

Do lado da noiva ela é apresentada como regra —
`artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:161-166` (lido):

```tsx
              <p className="text-xs text-muted-foreground border-t pt-3">
                {dados!.validade
                  ? `Proposta válida até ${instanteLongo(dados!.validade)}. `
                  : ""}
                Dúvidas ou quer fechar? É só responder à sua vendedora no WhatsApp.
              </p>
```

**Número medido.** Orçamento criado hoje, 2026-08-11. O servidor carimba a
validade por construção — `routes/orcamentos.ts:274` com
`VALIDADE_PADRAO_DIAS = 30` (`:107`) — então **validade = 2026-09-10**, e é essa
data que a tela mostra. A vendedora regenera o link em **2026-09-09** (rota
`/link`, `:682-683`), e o token vale `CONVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000`
(`artifacts/api-server/src/lib/auth.ts:11`) → **`publicoExpiraEm` =
2026-09-16**. A noiva aceita em **2026-09-15**: `publicoExpiraEm` está no
futuro, `status` é `ENVIADO`, `aceitoEm` é nulo → **HTTP 200, orçamento
`APROVADO`**, cinco dias depois do prazo que a própria tela lhe mostrou. O preço
congelado na versão 1 — digamos **R$ 7.470,00** — vira acordo em setembro com
tabela de agosto, e o único freio é alguém do ateliê reparar.

**A régua atual.** Zero. `lote22-orcamento-publico-api.test.ts:117-132` testa
`publicoExpiraEm` vencido (410) e token desconhecido (404); nenhum dos três
arquivos de teste do aceite (`lote22`, `aceite-orcamento`, `e115`) menciona
`validade`.

---

## A03.5 — a validade padrão é 30 dias e o link vive 7: 23 dias de proposta que ela não consegue abrir sozinha 🟡

**Âncora:** `artifacts/api-server/src/lib/auth.ts:9-11` (lido)

**O que as linhas dizem:**

```ts
// Convite por link vale 7 dias — tempo de a colega ver o WhatsApp, sem o link
// virar porta permanente.
export const CONVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

O comentário é sobre o **convite de equipe** — uma colega que precisa clicar uma
vez. `routes/orcamentos.ts:683` reusa a mesma constante para o link da noiva:
`const expiraEm = new Date(Date.now() + CONVITE_TTL_MS);` Enquanto isso
`routes/orcamentos.ts:107` decide, com o dono, que a proposta vale **trinta**:

```ts
const VALIDADE_PADRAO_DIAS = 30;
```

**O defeito.** São duas relógios contando prazos diferentes para o mesmo papel,
e o mais curto é o que a noiva encontra. A partir do 8º dia o GET público
responde 410 (`orcamentos-publico.ts:43-46`), e a página traduz para
`orcamento-publico.tsx:27` (lido):

```tsx
  LINK_EXPIRADO: "Este link expirou. Peça um novo para a sua vendedora.",
```

**O que a noiva vive.** Ela recebe o link em 11/08 e lê "Proposta válida até 10
de setembro de 2026". Guarda para conversar com a mãe. Volta em **19/08** — dia
8, **23 dias antes da validade que a própria tela afirmou** — e a proposta
inteira sumiu: sem itens, sem total, sem botão, só "Este link expirou". Ela não
tem nem como reler o preço que estava pensando. À noite, sem ninguém do ateliê
por perto, "peça um novo para a sua vendedora" é esperar até segunda.

**Número medido.** 30 − 7 = **23 dias** de validade prometida e inacessível, em
todo orçamento que use o padrão. E a assimetria é do mesmo par de constantes que
produz o A03.4 pelo outro lado: regenerado tarde, o link sobrevive **6 dias
depois** da validade.

---

## A03.6 — o aceite recompõe a versão pelo `desc(numero)`, não pela versão que a tela dela mostrou 🟡

**Âncora:** `artifacts/api-server/src/lib/aceite-orcamento.ts:20-25` (lido)

**O que as linhas dizem:**

```ts
  const [versao] = await db
    .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);
```

**O defeito.** O POST do aceite **não recebe nada do cliente além do token**:
`AceitarOrcamentoPublicoQueryParams` é só `{ token }`
(`orcamentos-publico.ts:64`). Não há `versao`, não há `hash`, não há `If-Match`.
O servidor decide sozinho, no instante do clique, qual versão a noiva "viu" —
relendo a mais recente. É a mesma consulta de `lib/visao-noiva.ts:37-42`, o que
salva o caso comum, mas o casamento é por **coincidência temporal**, não por
contrato: entre o GET que desenhou a tela e o POST que ela toca podem passar
horas.

Hoje o buraco está **fechado por sorte**, e vale registrar por quê, porque a
sorte é fina: a criação de versão só dispara em TRANSIÇÃO para `ENVIADO` —
`routes/orcamentos.ts:378` (`if (virandoEnviado)`) e `:699` (`if
(orcamento.status === "RASCUNHO")`) — e a máquina de estados proíbe voltar
(`lib/estados.ts:47`: `ENVIADO: ["APROVADO", "RECUSADO"]`). Logo um ENVIADO
nunca ganha uma versão 2. **A proteção do aceite depende de uma propriedade de
outro arquivo que ninguém declarou como invariante do aceite** — e o comentário
do próprio E75 (`schema/orcamentos.ts:88-95`) descreve versões numeradas como
se várias fossem esperadas.

**O que a noiva vive.** No mundo de hoje, nada: ela aceita a versão 1 e o hash
bate. Mas o desenho não a protege — protege-a a ausência de um caminho que o
schema anuncia como existente.

**A régua atual.** `aceite-orcamento-api.test.ts:51-68` afirma que reenviar não
duplica versão ("PATCH ENVIADO→ENVIADO é no-op de versão: só a TRANSIÇÃO
congela"). **Nenhum teste prende o aceite à versão que a noiva viu** — não há
como, porque o POST não a informa.

---

## A03.7 — o vão que ela não vê: aceitar preenche `aceito_em` e o contrato ainda pode nascer diferente do que ela aceitou 🟡

**Âncora:** `artifacts/api-server/src/routes/contratos.ts:236-247` (lido)

**O que as linhas dizem:**

```ts
    if (orcamento.aceiteHash) {
      const vivo = conteudoEnviado(itens, orcamento.descontoTipo, orcamento.descontoValor);
      if (vivo.hash !== orcamento.aceiteHash) {
        res.status(422).json({
          error: "ORCAMENTO_DIVERGE_DO_ACEITE",
```

**O defeito.** A guarda é boa e está no lugar — mas é um `if` sobre
`aceiteHash`, e `aceiteHash` **pode ser nulo com aceite válido**:
`lib/aceite-orcamento.ts:34-35` grava `versao?.numero ?? null` e
`versao?.hash ?? null`. Quando não há versão congelada, o portal cai no ramo de
conteúdo VIVO (`lib/visao-noiva.ts:61-95`), a noiva aceita o que estiver vivo
naquele segundo, o aceite grava `null/null` — e a partir daí a proteção do E115
**não morde**: `if (orcamento.aceiteHash)` é falso e o contrato nasce dos itens
vivos, quaisquer que sejam.

Que esse estado existe está provado dentro da própria suíte:
`lote22-orcamento-publico-api.test.ts:58-86` (lido) monta um orçamento
`status: "ENVIADO"` direto e gera o link — como a rota só congela quando o
status é `RASCUNHO` (`orcamentos.ts:699`), esse orçamento serve a noiva **sem
versão nenhuma**, e o teste passa afirmando os totais vivos
(`totalBruto: 8300`, `totalLiquido: 7470`).

Pela API de hoje um orçamento não nasce `ENVIADO` — `CreateOrcamentoBody`
(`lib/api-zod/src/generated/api.ts:5052-5059`, lido) **não tem campo `status`**,
e as duas portas para `ENVIADO` congelam versão. Então em produção o alcance é
**linha anterior ao E75** ou escrita fora da API. Por isso 🟡 e não 🟠 — mas o
`if` continua sendo uma guarda que se desliga sozinha em silêncio, e quem a
desliga é justamente o orçamento mais antigo, que é o mais provável de ter sido
editado.

**Número medido.** É o número que o E115 já pagou uma vez e que este ramo
reabre, na letra de `lib/conteudo-orcamento.ts:19-22` (lido): *"Editado o item
de R$ 5.000 para R$ 5.500 com o link na mão da noiva, ela aceitava R$ 5.000 e o
único contrato que o servidor criava era de R$ 5.500."* Com `aceiteHash` nulo,
o `if` da linha 236 não roda e o contrato de **R$ 5.500,00** volta a nascer
sobre um aceite de **R$ 5.000,00** — R$ 500,00 que ela nunca viu.

**A régua atual.** `e115-orcamento-aceite-api.test.ts:55-74` cobre o caso COM
hash (422 `ORCAMENTO_DIVERGE_DO_ACEITE`). **Nenhum teste exercita o aceite de um
orçamento sem versão congelada** — nem para afirmar que é impossível.

---

## A03.8 — depois do aceite, o caminho dela termina em silêncio 🔵

**Âncora:** `artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:136-166`
(lido) — o arquivo inteiro depois do aceite.

**O que a tela diz, na íntegra, como próximo passo:**

```tsx
                    Você aceitou esta proposta em … A sua vendedora já foi avisada.
```
```tsx
                Dúvidas ou quer fechar? É só responder à sua vendedora no WhatsApp.
```

**O defeito.** Não há link para o portal dela, não há agendamento de prova, não
há "o que acontece agora". A página tem **zero** elementos de navegação — nenhum
`<a>`, nenhum `<Link>` nas 173 linhas. O portal da noiva existe
(`artifacts/moscow-noivas/src/pages/noiva-portal.tsx`, rota `/api/portal` com
seu próprio token) e sabe mostrar provas, contrato, parcelas e "O seu vestido"
(`lib/visao-noiva.ts:180-276`) — e o link público **não sabe que ele existe**.
O único construtor de WhatsApp que carrega `portalUrl` é o de orçamento
vencendo (`whatsapp.ts:104`), que só dispara ANTES do aceite e só se alguém
clicar.

**O que a noiva vive.** Ela aceitou. A tela agradece e a manda de volta ao
WhatsApp. Não sabe quando prova, não sabe se paga alguma coisa agora, não sabe
se o vestido é dela — e o sistema, que tem todas essas respostas guardadas atrás
do token do portal, não lhe entrega nenhuma.

---

## Visto de passagem

- **A segurança do link não é achado — está boa, e é bom dizê-lo.** Token de 256
  bits base64url (`lib/auth.ts:14-16`, `randomBytes(32).toString("base64url")`,
  43 chars afirmados em `lote22:48`), coluna com índice único
  (`schema/orcamentos.ts:42`), token em QUERY e nunca no path para não cair em
  log (`orcamentos-publico.ts:15-19`), regenerar mata o anterior
  (`lote22:106-115`, 404 no antigo), 404 para token desconhecido, e o prefixo
  `/api/orcamentos/publico` tem rate-limit de 30 req/5 min
  (`app.ts:101-102`). A visão pública não desce id nenhum — `lote22:82-85`
  afirma `res.body.id`, `res.body.leadId` e `res.body.itens[0].id`
  todos `undefined`. **Não dá para enumerar orçamento de outra noiva.**
- **Idempotência do aceite: correta, nos dois caminhos.** `orcamentos-publico.ts:86-89`
  e `portal.ts:346-349` devolvem o aceite existente; o `UPDATE` é condicional em
  `isNull(aceitoEm)` (`aceite-orcamento.ts:40`) e quem perde a corrida **relê a
  linha** em vez de devolver o próprio instante (`:65-70`) — defeito que já foi
  pago e está com teste em `revisao-lote3-api.test.ts:124-154`.
- **`aceitoEm` é um instante e a tela mostra só o dia.** `instanteLongo` é
  `dateStyle: "long"` sem hora (`lib/formatos.ts:218-226`). O comprovante de um
  aceite feito às 23h40 lê "Você aceitou esta proposta em 11 de agosto de 2026".
  O E74 grava o instante de propósito; a tela dela devolve menos do que o
  registro tem. 🔵
- **Aceite de orçamento RECUSADO responde 422 e some da tela — se ela recarregar.**
  O botão só aparece com `dados!.status === "ENVIADO"`
  (`orcamento-publico.tsx:145`), então numa carga nova ele não existe. Numa aba
  aberta desde antes, existe e falha em silêncio — é o A03.3.
- **O aceite não mexe na etapa do lead**, por decisão escrita
  (`routes/orcamentos.ts:722-723`: *"Aprovar NÃO mexe na etapa do lead — o funil
  só avança para CONTRATO_FECHADO quando um contrato é efetivamente
  fechado"*). Coerente; anotado para o ângulo 04 não o ler como defeito.
- **`publicoAbertoEm` funciona e é o contraexemplo útil.** A primeira abertura
  carimba (`orcamentos-publico.ts:50-52`, `UPDATE` condicional em vez de
  check-then-set) e a loja vê em `orcamentos/[id].tsx:767-768`. Quer dizer: o
  sistema sabe avisar que ela VIU, e não sabe avisar que ela ACEITOU — o evento
  mais caro dos dois.
