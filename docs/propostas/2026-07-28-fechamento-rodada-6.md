# Fechamento da rodada 6 — o que falta e em que ordem

**Escrito em 2026-07-28**, com onze épicos fechados (E91–E98, E100–E102, E106) e
nenhum 🔴 aberto. Base: `14bf76a`. Suíte: API 733 · frontend 310 · E2E 136.

Este documento é o plano para **zerar** a rodada: os três épicos 🟨 e as
**18 sobras** que a tabela do rastreador acumulou. Ele segue a mesma regra do
backlog original — um épico por commit, escopo fechado — e a mesma ordem de
raciocínio: primeiro o que corrompe dado, depois o que a loja usa, por último
higiene.

---

## O que está em aberto, sem rodeio

### Três épicos 🟨

| Épico | O que falta | Peso |
|---|---|---|
| **E99** | **E10** (a régua da ação destrutiva) e o `<Table>` do E19 (5 telas escrevem `<table>` cru) | M |
| **E103** | **F34** (fechar o mês num lugar só) e **F32** (conciliação com memória) | M |
| **E104** | **A6** (decisão sobre `mockup-sandbox`), **A8** (rota morta), o flake do E2E | P |

### Dezoito sobras

Cinco famílias, e é assim que elas viram épico:

- **Escrita sem prova ou sem rastro:** S2, S4, S6, S12
- **A régua do dinheiro pela metade:** S8, S9, S10, S11
- **A loja não se administra:** S17, S16
- **Infra de teste e higiene:** S7, S15, S18, S19
- **Esperam DECISÃO, não código:** S3, S5, S13, S14

---

## Quatro perguntas que valem ser respondidas antes

A regra 5 do método diz que o que é decisão de produto vira pergunta antes de
virar código. Estas quatro destravam trabalho e **nenhuma delas se resolve
lendo o repositório**:

1. **S3 — ato global de superadmin não deixa trilha.** `audit_log.loja_id` é
   `notNull` + CASCADE, então nem `DELETE /admin/usuarios/:id` nem a exclusão de
   loja podem ser registrados. As saídas são: (a) tornar `loja_id` nullable e
   aceitar linhas de trilha "sem loja"; (b) manter o `req.log.warn` e assumir que
   ato global vive no log da aplicação, não na trilha do produto. **(a) é uma
   migração pequena; (b) é grátis e já é o que vale hoje.**
2. **S5 — a parcela PARCIAL sob `destinoPago: "manter"`.** Ela vira CANCELADA, o
   que tira do horizonte o saldo que falta (certo) mas também tira do caixa
   realizado o que já entrou — e sob "manter" a loja está dizendo que ficou com o
   dinheiro. Representar "cancelada, mas o recebido permanece" exige decidir se o
   motor passa a olhar `valorRecebido` em vez do status. **Mudança de régua com
   alcance grande; sob "estornar" não há ambiguidade.**
3. **A6 — `mockup-sandbox` é ferramenta viva?** É um workspace inteiro sem
   nenhum import de `@workspace/*`, com a pasta de mockups vazia e ~40
   devDependencies próprias. **Se não é, poda; se é, sai do workspace de
   produção.**
4. **S13 — migrar o roteador para data router?** Sem `useBlocker`, o D14 protege
   só o fechar/recarregar a aba: clicar na sidebar com um formulário sujo continua
   descartando em silêncio. Migrar toca todas as rotas do app. **É épico próprio,
   e a pergunta é se o silêncio incomoda o bastante.**

O plano abaixo **não fica parado** esperando nenhuma delas — as quatro estão
isoladas no fim.

---

## O plano, em seis épicos

### E107 — Nenhuma escrita sem prova, nenhum dinheiro sem rastro (S2, S4, S6, S12)

**Peso M · primeiro, porque é o que sobrou de integridade.**

É o rabo do E91/E94/E96: quatro escritas que não terminaram de aprender o que
esses três épicos ensinaram.

1. **S2 🟠** — `POST /contratos` valida `bloqueioVestidoIds` contra a LOJA e não
   contra o LEAD: um contrato pode prender a reserva física de outra noiva da
   mesma loja. Não é vazamento entre lojas, por isso ficou fora do E91 — é a
   mesma família, um degrau abaixo. O padrão já existe (`lib/escopo-loja.ts`);
   falta a função irmã que prova o vínculo com o lead.
2. **S4 🟡** — `DELETE /contas-pagar/:id` não grava auditoria. Apagar uma conta
   prevista é sumir com uma obrigação sem rastro. Mesma classe do B3.
3. **S6 🔵** — o estorno avulso de parcela lê fora da transação, como o B6. O
   `SET` é absoluto (sempre PREVISTA/null), então dois estornos convergem e o
   pior caso é auditar duas vezes — mas é a última leitura-fora-da-transação do
   módulo, e fechá-la encerra o assunto.
4. **S12 🟡** — `classificarErro` põe **frase** no campo `error`, que o E96
   estabeleceu como contrato de CÓDIGO. Os 409 de Postgres saem como
   `"Registro duplicado ou conflito de dados"`: nenhuma tela consegue traduzir
   aquilo, e foi exatamente o que apareceu vestido de erro de dinheiro no flake
   do E2E. É a última fonte de texto livre em `error`.

**Cuidado:** o item 4 muda o corpo de erro de rotas que já estão em produção —
as telas que hoje mostram a frase precisam do dicionário antes, não depois.

**Testes:** contrato com `bloqueioVestidoId` de outra noiva da mesma loja → 422;
`DELETE /contas-pagar` aparece na trilha; o 409 do Postgres sai como código.

---

### E99 — fecha: a régua da destrutiva, e a tabela (E10, E19/`<Table>`)

**Peso M · segundo, porque E10 é uma REGRA — e regra escrita cedo é barata.**

1. **E10** — uma regra escrita uma vez: **ação destrutiva mora no menu `…`**,
   nunca na fileira principal; exposta só com `variant="destructive"`; e toda
   confirmação **nomeia o objeto e o valor**. A confirmação de reabrir
   fechamento já faz; o estorno de parcela não. O E99 parte 4 já aplicou o
   padrão no cabeçalho de detalhe — falta escrever a regra e varrer o resto.
2. **`<Table>` do E19** — cinco telas ainda escrevem `<table>` cru. É a metade do
   E19 que sobrou: a outra (paginação) foi **recusada com medida** na parte 7.

**Cuidado:** o E99 é o épico mais fácil de inchar. O `<Table>` é adoção dirigida
em cinco arquivos, não reescrita de tela.

**Testes:** o teste de varredura que reprova destrutiva fora do `…` — no formato
que o D15 ensinou, **declarando a grafia que cobre**.

---

### E103 — fecha: o mês fecha num lugar só (F34, F32)

**Peso M · terceiro, porque é o que a loja opera todo mês.**

1. **F34 🟡** — "Fechar o mês" único, como seção da folha (que já tem o conceito
   de envio): escolhe a competência, mostra os dois lados com os totais, baixa UM
   pacote e carimba os dois. **As duas ações separadas — baixar e declarar —
   continuam existindo:** são a decisão certa, e o épico diz isso.
2. **F32 🟡** — conciliação com memória, primeira etapa: `conciliadoEm` no
   movimento do sistema quando ele casa (uma coluna, um PATCH em lote). Destrava
   o filtro "só o não conciliado" e faz a segunda passada custar quase nada.

**Migração:** sim — `conciliadoEm`. Vai para `docs/migracoes/`.

---

### E108 — A régua do dinheiro vale até o último call-site (S8, S9, S10, S11)

**Peso M.**

1. **S8 🟡** — `contratos.ts` mantém `cent`/`reais` locais, idênticos aos do
   `financeiro-core`, com **dezenas de call-sites**. Mesma classe do `parseValor`
   quadruplicado que o E95 fechou, em volume maior.
2. **S9 🔵** — o teto de orçamento (E33) compara em **reais**: `acimaDoTeto` faz
   `totais.liquido > teto` em float enquanto o excedente já saiu para centavos.
   Um centavo no limiar, sem consequência — mas é régua pela metade.
3. **S10 🟡** — a tela de contrato gera o carnê **às cegas**. O `gerar-plano` de
   lá não tem prévia, e desde o E95 a função existe. É o F16 aplicado à tela irmã.
4. **S11 🟠** — o D5 tem **veredito medido** e continua aberto: derivar os 12
   resolvers do `api-zod` não se faz (o schema descreve o PAYLOAD, o formulário
   valida a SUPERFÍCIE, e o barril de 261 KB entraria no bundle). O caminho
   barato — **teste de paridade dos dois enums** — cabe aqui, e o code splitting
   do E104/D8 já aconteceu, então a reavaliação que ele pedia pode ser feita com
   número.

---

### E109 — A loja se administra, e o lead não mente sobre quando fechou (S17, S16)

**Peso P.**

1. **S17 🟠** — `lojas.endereco` e `lojas.telefone` só têm formulário no console
   de **superadmin** (`pages/admin/index.tsx:560`), rota top-level fora do
   `/loja/:lojaId`. Três coisas dependem deles e degradam caladas: o rodapé do
   portal (E100/F35), a linha "Endereço:" da confirmação e o cabeçalho do PDF.
   Trocar de telefone vira chamado. **A tela é uma seção em `/configuracoes`.**
2. **S16 🟡** — `leads.contrato_fechado_em` fica `null` em quem tem contrato: o
   carimbo só é gravado dentro do `if (etapaNova !== lead.etapa)` de
   `contratos.ts:335`, e `transicaoLeadValida` aceita pular no funil. Um lead
   levado de `NOVO` direto a `EM_PROVAS` fecha contrato sem que a etapa mude. O
   `comContrato` de `/leads/sazonalidade` filtra por essa coluna: **aquela noiva
   não é contada na curva que diz quando falta vestido.** Conserto: gravar o
   carimbo mesmo sem avanço de etapa; **o backfill pergunta à tabela de
   contratos, que é a fonte.**

**Migração:** o backfill do S16.

---

### E104 — fecha: higiene, infra de teste e o CSS morto (A6, A8, S7, S15, S18, S19 + roteadas)

**Peso M · por último, porque nenhuma dor de usuário depende — com UMA exceção.**

**A exceção é o S19, e ela sobe de prioridade.** O F13 mediu: `max-h-[--var]` é
sintaxe do Tailwind **v3**, este repo está na **4.1.14**, e a forma antiga emite
CSS inválido que o navegador descarta. O `select` foi consertado porque a barra
do F13 o quebrou; **continuam mortos** `origin-[--radix-*]` em `select`,
`popover`, `dropdown-menu` e `tooltip`, e `h-/w-/min-w-[--cell-size]` em
`calendar.tsx` — este último **afeta tamanho**, não animação. Vale varrer `-\[--`
no `ui/` inteiro; é uma varredura e um `sed`, e o risco é o calendário estar
visivelmente errado sem ninguém ter olhado.

O resto:

1. **A6** — decisão sobre `mockup-sandbox` (pergunta 3 acima).
2. **A8** — `GET /contratos/{id}/parcelas`: confirmar morto e remover. Fecha a
   única brecha no invariante spec = servidor.
3. **S7 🟠** — o flake: `e2e/25-confirmar-presenca` colide consigo mesma entre
   execuções (cabine fixa, horário de hoje, banco que persiste). **Um vermelho
   desses se lê como regressão de dinheiro e não é.** Mesma classe do que o F13
   acabou de consertar no spec 22 — recurso próprio por execução.
4. **S15 🟡** — o `vitest` do frontend **só coleta `src/lib`**: teste de
   componente nem chega a ser executado. Ampliar o `include` é o que destrava
   testar `<Erro>`, `<BarraAtendimento>` e o resto da camada de UI que a rodada
   inteira construiu sem poder testar.
5. **S18 🟡** — as "Loja Teste" das fixtures de API vivem no banco de dev.
   Deixaram de ser higiene quando elegeram a loja do E2E e derrubaram o seed.
6. **As roteadas** que já esperavam aqui: `index.html` com a boilerplate do
   Replit em inglês nas três metas (é o que aparece ao compartilhar o link);
   `.migration-backup/` ainda no DISCO (o A4 tirou do repo, não do `find`);
   `listPagamentos` pedido sem janela em telas que mostram um mês.
7. **A roteada ao E96**: `selecionar-loja.tsx` faz `catch (error: any)`.

---

## A ordem, e por quê

```
E107  →  E99  →  E103  →  E108  →  E109  →  E104
```

- **E107 primeiro** porque é o único que ainda deixa escrita sem prova e dinheiro
  sem rastro. Nada disso espera.
- **E99 antes de E103 e E108** porque o E10 é uma **regra**: toda tela construída
  depois dela nasce certa, e toda tela construída antes precisa ser revisitada.
- **E103 antes de E108** porque é o que a loja usa todo mês; o E108 é
  consolidação de régua, que não muda nenhum número na tela.
- **E109 é pequeno e independente** — pode ser antecipado a qualquer momento se
  a dona da loja reclamar do telefone.
- **E104 por último**, com o **S19 antecipado** para o dia 1 pelo mesmo motivo que
  o `.migration-backup` foi na rodada passada: é barato e o resto se apoia nele.

**Antecipado, fora de ordem:** o **S19** (varredura do CSS morto) e o **S15**
(o `include` do vitest). Os dois são de infraestrutura e pagam todo o resto —
o S15 em especial: sem ele, nenhum componente desta rodada tem teste possível.

---

## O que este plano NÃO faz

- **S13** (migrar o roteador para data router) — é épico próprio e depende da
  pergunta 4.
- **S14** (avarias antigas sem `parcela_id`) — **fechada por veredito:** não há
  backfill possível; casar por texto adivinharia, e duas avarias com a mesma
  descrição no mesmo contrato são indistinguíveis. A guarda vale para o que
  nasce daqui.
- **S3** e **S5** — decisões (perguntas 1 e 2).
- O **E105** (DRE por competência) continua sendo o épico separado que a decisão
  de produto de 2026-07-25 criou. Não é sobra: é escopo novo.
