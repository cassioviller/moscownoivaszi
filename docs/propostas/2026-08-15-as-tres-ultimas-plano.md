# As três últimas — o plano para fechar o que restou da trilha do contrato

**Escrito em 2026-08-15, terceira sessão**, sobre `72353bf0` (o E220 primeira fatia,
`880b9a5a`, mais os dois commits de docs). Fonte: a tabela de Sobras do
`docs/revisao/2026-08-13-contrato-de-papel/EXECUCAO.md`, **contada** — restam
**três linhas**: S-C301 🟡, S-C300 🔵, S-C51 🟡. Este plano diz o que cada uma
custa, **medido**, em que ordem, e o que só a dona ou a contadora podem dizer.

Cabem em **três épicos, E233–E235**, e a ordem é a de **quem depende de
quem**: o primeiro não depende de ninguém; o segundo depende de uma decisão da
dona que o manual já recomenda; o terceiro depende da contadora — e a medição
mostra que ele pode esperar sem custar nada.

| # | Sobra | Épico | Depende de | Tamanho medido |
|---|---|---|---|---|
| 1 | **S-C301** — validação de CNPJ | **E233** | nada | 3 portas de escrita, 1 seed, 1 tela; **1 documento inválido no banco inteiro**, e é o da loja |
| 2 | **S-C300** — cidade, representante e PIX no cadastro da loja | **E234** | **D7** (dona) | 1 migração (7 colunas), 4 schemas do spec, 2 telas, 2 papéis, 1 seed |
| 3 | **S-C51** — conciliação por ATO | **E235** | **contadora** | 303 parcelas recebidas · **0 em pedaços** · 2 sem ato · **0 conciliadas, nunca** |

E um **passo 0 que não é código**: o `origin/main` está **3 commits atrás**
(`git rev-list --count origin/main..main` = 3). Publicar pede a autorização da
dona, como sempre.

---

## As decisões, tomadas em 15/08/2026 (terceira sessão), todas na recomendação

| Pergunta | Resposta da dona | O que muda no plano |
|---|---|---|
| **D7** — representante (nome, RG, CPF), PIX (chave + titular) e cidade/UF entram no cadastro da loja? | **Sim, os sete campos** | O **E234 está destravado** — é código, não decisão. Fecha a S-C300 e o E220 inteiro |
| O E233 valida também o **CPF** (locatária e representante), no mesmo módulo? | **Sim, CNPJ e CPF juntos** | O E233 tem **5 portas**, não 3: as duas do CPF (`POST /contratos`, `PATCH /leads`) entram |
| **S-C51** — conciliação por ato? | **Perguntar à contadora antes** | O **E235 fica pronto e não executa**. A pergunta, com o número, está abaixo; a resposta entra na tabela de decisões do rastreador |
| Publicar o `main`? | **Sim, agora** | Feito: `origin/main` = `c3e53ace`, fast-forward de 5 commits (E220 primeira fatia, rastreador, manual, plano, decisões) |

**Consequência para a fila:** o que resta de código sem depender de ninguém é
**E233 → E234**, nesta ordem (o E234 usa a régua de CPF do E233 no representante
e na chave PIX). O E235 espera; enquanto 0 de 303 parcelas estiver em pedaços,
esperar não custa.

**A pergunta para a contadora, pronta para copiar:**

> A conciliação bancária do sistema hoje monta **um movimento por parcela**,
> datado pelo dia do recebimento. Se uma parcela de R$ 1.000,00 for paga em duas
> vezes (R$ 300,00 em 01/03 e R$ 700,00 em 15/03), o extrato traz duas linhas e
> o sistema uma — a tela acusa três divergências de um pagamento certo. Até hoje
> **nenhuma** parcela foi paga em pedaços (0 de 303) e a conciliação nunca foi
> marcada como conferida. **Você prefere que a conciliação enxergue cada
> pagamento (por ato — o que o extrato traz), ou basta a parcela?** Por ato, o
> sistema passa a listar um movimento por recebimento e a marca de "conferido"
> fica por recebimento; por parcela, fica como está.

---

## O que a medição mudou antes de o plano ser escrito

A regra desta trilha é *contar quem passa pela porta antes de estimar*, e as
três sobras estavam **descritas de dentro de dois arquivos**. Medidas contra o
repositório e o `heliumdb` (`SELECT current_database()` conferido):

- **S-C301 dizia "não existe validação de CNPJ em lugar nenhum"** — verdade, e
  **também não existe validação de CPF**, embora a qualificação da 1ª página
  seja **obrigatória desde o E215** e o CPF saia impresso duas vezes no
  instrumento (identificação e assinatura). Medido com o algoritmo dos dígitos
  verificadores sobre o banco: **47 de 47** CPFs em `contratos` e **50 de 50**
  em `leads` são válidos — as fixtures e as vendedoras acertaram sem régua. O
  **único documento inválido do banco inteiro é o CNPJ da loja semeada**
  (`12.345.678/0001-99`, `configuracao-inicial.ts:438`), que desde `880b9a5a`
  **sai impresso no cabeçalho de todo contrato** desta instalação. A régua de
  CPF entra no mesmo módulo por custar uma função a mais e proteger a mesma
  página; a de CNPJ é a que tem defeito vivo.
- **S-C300 dizia "cidade, representante e PIX"** — e a 1ª página do molde
  pede do representante **nome, RG e CPF** (*"Renato Nascimento de Brito,
  Carteira de Identidade nº …, CPF nº …"*), e do PIX **a chave e o titular**
  (*"PIX: 23723482805 (CPF) KARINA SHABALINA"*). São **sete colunas** (com a UF), não
  três. E o `endereco` da loja é **string livre** que hoje já carrega a cidade
  nas duas lojas reais (*"…Higienópolis, São Paulo"*), então a cidade nova
  **não pode ser concatenada ao endereço** no papel — ela serve ao foro (21ª)
  e à linha *"Local, data"* do fecho, e a identificação continua imprimindo o
  `endereco` como está.
- **S-C51 dizia "espera a contadora"** — continua esperando, e a medição diz
  **quanto custa esperar: nada**. Em 303 parcelas com dinheiro recebido,
  **nenhuma foi recebida em pedaços** (0 com mais de um `PARCELA_RECEBIDA`),
  **2 não têm ato nenhum** (o legado que gravou direto — a `soma < recebido`
  do E221), e **`parcelas.conciliado_em` está nulo em 100% das linhas**: a
  conciliação **nunca foi carimbada** nesta instalação. A troca de modelo não
  muda a resposta de nenhuma tela hoje. Ela é para o dia em que a primeira
  parcela for paga em duas vezes.

---

## E233 — o documento que sai impresso entra conferido (S-C301)

**Tese:** o CNPJ da locadora e o CPF da locatária são os dois números que o
instrumento imprime como identidade das partes, e hoje os dois entram no
sistema como `string` livre (`openapi.yaml:5240-5270` e `:5799-7517`).

**A régua, num módulo só:** `lib/financeiro-core/src/documentos.ts` (puro,
sem I/O — a API e a tela já dependem do pacote), com `cpfValido(s)`,
`cnpjValido(s)`, os dois pelo algoritmo dos dígitos verificadores, e os
formatadores `cpfFormatado`/`cnpjFormatado` para gravar **numa grafia só**
(o banco tem `12.345.678/0001-99` com pontuação; o telefone já teve a lição
da grafia dupla). Sequências repetidas (`111.111.111-11`) reprovam.

**As portas, contadas com `grep`, não deduzidas:**

| Porta | Arquivo | O que muda |
|---|---|---|
| `PATCH /lojas/:id/dados` (a dona) | `routes/equipe.ts:95-125` | 422 `CNPJ_INVALIDO` com o número e a razão, na frase da tela |
| `POST /admin/lojas` e `PATCH /admin/lojas/:id` (superadmin) | `routes/admin.ts:86-118` | idem — **as duas portas do console também escrevem `cnpj`**, e o E171 ensinou que fechar uma porta sem a do lado é meio conserto |
| `POST /contratos` (a qualificação, E215) | `lib/qualificacao-da-locataria.ts` | `CPF_INVALIDO` junto da recusa de campo vazio que já existe |
| `PATCH /leads/:id` (a ficha) | `routes/leads.ts` | idem, no mesmo helper |
| O seed | `configuracao-inicial.ts:438` | `LOJA_PADRAO.cnpj` vira um CNPJ **válido e claramente de exemplo** (`11.222.333/0001-81` passa nos dígitos e é o exemplo canônico) — porque o `scripts/banco-virgem.ts` semeia pela porta e a régua nova o reprovaria |
| A tela | `pages/configuracoes/dados-da-loja.tsx:43-69` e `pages/admin/index.tsx:203` | valida **antes** de enviar, com a mesma função (regra do repositório: a tela reflete a régua do core, não a copia) |
| O spec | `openapi.yaml` (`LojaInput`, `LojaUpdate`, `DadosDaLojaInput`, e os `cpf` da qualificação) | `pattern` da GRAFIA (`^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$`), que o codegen traduz para zod; o dígito verificador **não cabe em regex** e fica na rota — declarado no spec em `description`, para a `varredura-restricoes-do-spec` não estranhar |

**Réguas:** o teste do módulo (dígito certo/errado/repetido, com e sem
pontuação, os dois CNPJs REAIS do papel passando — `37.771.644/0001-93` e
`31.897.111/0001-76`, que é o que faz a P1 ser grave); um teste de API por
porta (**5 portas, 5 vermelhos**: hoje `12.345.678/0001-99` entra em todas);
o `banco-virgem.ts` rodado (~40 s), porque o seed muda.

**O que NÃO entra:** validar os 780 contratos e 50 fichas já gravados — todos
passam, medido; não há migração. E não entra recusar CNPJ *existente na
Receita*: o sistema confere aritmética, não cadastro público — declarado na
frase da recusa.

**Tamanho:** um commit, meio dia. **Depois dele, a P3 (preencher os dados
reais da loja) passa a ser conferida pela tela** — o que a P1/P3 do manual do
proprietário já promete.

---

## E234 — o que é da loja mora no cadastro da loja (S-C300, D7)

**A D7 foi respondida SIM em 15/08/2026** (os sete campos, na recomendação do manual do proprietário: *"os dois continuam sendo escritos à mão em cada contrato, que é onde nascem as divergências"*). Este épico é código, e vem logo depois do E233.

**A migração — sete colunas em `lojas`, todas nulas por padrão** (a
instalação existente não muda de comportamento até alguém preencher):

```sql
ALTER TABLE lojas
  ADD COLUMN cidade text,
  ADD COLUMN uf text,
  ADD COLUMN representante_nome text,
  ADD COLUMN representante_rg text,
  ADD COLUMN representante_cpf text,
  ADD COLUMN pix_chave text,
  ADD COLUMN pix_titular text;
```

(A `uf` entra porque a linha
*"Local, data"* e o foro se escrevem *"São José dos Campos – SP"*.
`docs/migracoes/2026-08-XX-e234-loja-cadastro-do-instrumento.sql`, e o
`drizzle` no `lib/db/src/schema/loja.ts:6-11`.)

**As portas, contadas:**

| Onde | O que muda |
|---|---|
| Spec: `Loja`, `LojaInput`, `LojaUpdate`, `DadosDaLojaInput` (`openapi.yaml:5232-5275`) + codegen | os sete campos, opcionais; `representante_cpf` e `pix_chave` (quando CPF) passam pela régua do **E233** — é por isso que o E233 vem antes |
| `PATCH /lojas/:id/dados` (`equipe.ts`) e `POST/PATCH /admin/lojas` (`admin.ts`) | recebem os campos; a validação de CPF do representante e da chave |
| Tela *Configurações → Dados da loja* (`dados-da-loja.tsx`, 144 linhas, 4 campos) | vira **três blocos**: *A loja* (nome, CNPJ, endereço, cidade, UF, telefone), *Quem assina pela loja* (nome, RG, CPF), *Como a noiva paga* (chave PIX, titular). O manual do proprietário reescreve a seção 10 |
| Console do superadmin (`admin/index.tsx:203`) | os mesmos campos |
| O instrumento (`contrato-do-papel.ts` → `contrato-pdf.ts`) | `lojaRepresentante` deixa de ser lacuna: *"neste ato representada por {nome}, Carteira de Identidade nº {rg}, CPF nº {cpf}"*; `lojaCidade` faz a 21ª dizer *"deste município de {CIDADE}"* e o fecho *"{Cidade} – {UF}, {data}"*; nasce a linha **`PIX: {chave} ({titular})`** no bloco de assinatura, como no molde |
| O recibo (`recibo-do-papel.ts:356-358`) | ganha a linha do PIX — é o papel de pagamento, e a chave é onde se paga |
| Seed (`LOJA_PADRAO`) | os sete com valores de exemplo, para o `banco-virgem` e o E2E terem o papel inteiro |
| A `varredura-expurgo-lgpd` | `representante_cpf` é dado pessoal de **gente da loja**, não da noiva; a varredura enumera as colunas de PII da noiva e precisa **declarar** que esta fica fora do expurgo, com a razão (o representante é parte do contrato, não titular a esquecer) |

**O que NÃO muda, e por quê:** o `endereco` continua uma string. Quebrá-lo em
logradouro/número/bairro/CEP seria a migração certa e é uma **quarta**
decisão que ninguém pediu; as duas lojas reais têm o endereço legível como
está, e o papel o imprime como está. A `cidade` nova **não é concatenada** ao
endereço no papel — a identificação imprime `endereco`; a cidade vai só ao
foro e ao fecho. Declarado no `contrato-pdf.ts`.

**Réguas:** o `e220-instrumento` ganha o caso *"com representante e PIX, o
papel imprime os três e a 21ª nomeia a cidade"*; o E2E do fluxo de
Configurações (hoje o `12-permissoes` cobre o gate; um spec novo preenche os
três blocos e baixa o PDF); `banco-virgem.ts` (schema e seed mudam); **E2E
completo antes do commit** (regra 11: mudou o que a trilha grava e o formato
do papel).

**Tamanho:** um commit de código, um dia — a maior parte é tela e spec, e
nada dele é conta.

---

## E235 — a conciliação enxerga cada pagamento (S-C51, contadora)

**Depende da contadora**, e a pergunta a ela é a do manual, com o número novo:
*"A conciliação precisa enxergar cada pagamento, ou basta a parcela? Hoje
nenhuma parcela foi paga em pedaços (0 de 303) e a conciliação nunca foi
carimbada nesta instalação — a mudança é para o dia em que a primeira for."*
A recomendação é **por ato**, porque é o que o extrato do banco traz e porque
**o sistema já sabe listar os atos**: o E221 os monta para o recibo.

**O desenho, sem contradizer o E221:**

1. **Os movimentos do sistema passam a ser os ATOS**, lidos pela mesma fonte do
   recibo — `parcelasComRecebimentoNaJanela` + `recibosDoContrato`
   (`lib/recibos-do-banco.ts:89`, `lib/recibo-do-papel.ts:285`). Um
   `MovimentoSistema` por `PARCELA_RECEBIDA` válido, com id `recibo:{atoId}`,
   data do ato, valor do ato. **Não nasce tabela de recebimentos** — a fonte é
   a trilha, e a conferência `soma × valorRecebido` que o E221 já faz protege
   contra o estorno por caminho desconhecido (aqui como lá, o ato só conta se
   a soma bate).
2. **A parcela sem ato continua sendo um movimento** — o legado (**2 de 303**
   hoje) e o seed gravam parcela paga direto; para elas o movimento é a
   parcela, como hoje, com id `parcela:{id}`. É a `soma < recebido` do E221:
   o que existe sai; o resto não é inventado.
3. **O carimbo muda de dono: nasce `conciliacao_de_recebimentos`**
   (`loja_id`, `ato_id` PK — o id da linha da trilha —, `conciliado_em`,
   `conciliado_por`). Isso **não é** a *"terceira verdade sobre o mesmo
   dinheiro"* que o E221 recusou: é um fato sobre a **conferência**, não sobre
   o dinheiro; ela não soma nada e ninguém a concilia. O
   `parcelas.conciliado_em` de hoje **fica** — passa a ser derivado ("todos os
   atos da parcela carimbados") para o filtro *só o não conciliado*
   (`financeiro.ts:85-90`, o índice parcial) continuar barato, e para os 2
   legados sem ato. A trilha **não é apagada em lugar nenhum** (medido: zero
   `delete(auditLogTable)` fora de teste), então o `ato_id` não fica órfão.
4. `POST /financeiro/conciliacao/marcar` aceita os dois ids
   (`recibo:` e `parcela:`); a tela (`conciliacao.tsx:147-158` e o mapa de
   carimbo `:180-190`) troca a origem dos movimentos e nada mais — o motor de
   casamento `conciliarExtrato` não muda, porque ele nunca soube o que é
   parcela.

**O vermelho, que hoje não existe no banco e precisa ser CONSTRUÍDO** (lição da
S-C242): uma parcela de R$ 1.000,00 recebida R$ 300,00 em 01/03 e R$ 700,00 em
15/03 contra um extrato com as duas linhas → hoje **três divergências falsas**
(duas *só no banco*, uma *só no sistema*); depois, **duas casadas, zero
divergências**. E o inverso, para não regredir: parcela legada sem ato, paga
inteira, contra a linha do banco → **uma casada**, nos dois lados do conserto.

**Réguas:** o teste do E103 da conciliação reescrito para o EFEITO (o número
de divergências), o `varredura-dinheiro-datado-pela-parcela` (que já sabe da
classe *"datado pelo último pedaço"*, S-C52) ganha a conciliação como porta
que **saiu** da lista, o E2E do spec de conciliação, `banco-virgem` (schema).

**Tamanho:** um commit, um dia. **E não é urgente**: enquanto 0 de 303 for
verdade, a resposta das telas é idêntica nos dois modelos. Vale fazer com a
resposta da contadora na mão, e não antes — a régua de modelagem que se escreve
sem quem vai usar é a que se reescreve.

---

## A ordem, e o que ela custa em decisão

1. **Passo 0** — publicar `main`, com a autorização da dona — **autorizado e feito em 15/08**.
2. **E233** — hoje, sem perguntar nada. Fecha a S-C301 e dá à P3 uma tela que
   confere.
3. **E234** — a D7 já está respondida (sim); é um dia. Fecha a S-C300 e o E220 inteiro
   (o papel deixa de ter lacuna que não seja da noiva).
4. **Contadora → E235** — a pergunta com o número; respondida *por ato*, é um
   dia; *por parcela*, a S-C51 vira decisão escrita e fecha sem código.

Fechados os três, **a trilha do contrato de papel fica sem sobra aberta** —
restam as cinco pendências P1–P5, que são papel, cadastro e leitura da dona, e
nenhuma é software.
