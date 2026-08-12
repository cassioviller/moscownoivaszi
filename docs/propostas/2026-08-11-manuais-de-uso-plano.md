# Plano — os manuais de uso, por papel

**Aberto em 2026-08-11**, depois de a trilha da ótica dos papéis fechar os 14
épicos. Decisões do Renato já tomadas: **cobre o sistema inteiro** (não só o que
mudou), **vive como página web navegável com a fonte versionada no repo**, e é
**um manual por papel**.

## O ponto de partida, medido

**Não existe manual nenhum.** `git ls-files docs/` devolve **229 arquivos**, e
todos são de revisão, proposta, migração ou auditoria — documentação de quem
DESENVOLVE. O único `README` do repositório é o de `scripts/`. Não há uma linha
escrita para quem USA.

O que existe e serve de matéria-prima:

- **`replit.md`** — o inventário de capacidades do sistema, escrito com o número
  medido junto. É a fonte mais confiável do que o sistema faz, e foi mantida
  atualizada épico a épico (regra 8).
- **Os 8 ângulos da ótica dos papéis** (`docs/revisao/2026-08-11-otica-dos-papeis/achados/`)
  — 59 achados escritos olhando a tela como a pessoa que a usa. Descrevem
  jornadas reais, com o que confunde e o que trava.
- **Os 171 testes E2E** — cada um é uma jornada executável e VERDADEIRA. Um
  spec E2E é a única descrição do sistema que não pode mentir, porque roda.

## A tensão que o plano precisa resolver ANTES de escrever

**Os papéis da revisão não são os perfis do sistema.** A trilha inteira foi
escrita pela ótica de *dona, vendedora, costureira, noiva* — e já ali o "dona" estava errado: **o proprietário é o Renato, homem**. Os perfis que o
sistema semeia (`configuracao-inicial.ts:85-110`) são outros quatro:

| Perfil semeado | leads | agenda | vestidos | financeiro | comissao | admin |
|---|---|---|---|---|---|---|
| **Admin** (sistema) | tudo | tudo | tudo | tudo | tudo | tudo |
| **Proprietária** | tudo | tudo | tudo | tudo | tudo | tudo |
| **Vendedora** | tudo | tudo | tudo | — | — | — |
| **Recepção** | ver+criar | tudo | só ver | — | — | — |

Três consequências para o manual, e nenhuma é cosmética:

1. **Não existe perfil "Costureira".** A fila de ajustes é protegida por
   `requireModulo("agenda")` (`agenda.ts:248`), e o único perfil que dá agenda
   sem dar mais nada é a **Recepção** — que também abre a lista de noivas. Hoje,
   dar acesso à costureira significa dar-lhe a carteira de leads da loja. **Isto
   é achado, não detalhe de redação** (ver "O que este plano descobriu", abaixo).
2. **Contrato e orçamento moram em `leads`.** `contratos.ts` e `orcamentos.ts`
   pedem `requireModulo("leads")` — então a **Vendedora fecha contrato**, e o
   manual dela precisa cobrir o contrato inteiro. Quem separa dinheiro de venda
   é o módulo `financeiro`, que ela não tem: ela fecha o contrato mas não vê o
   caixa.
3. **A noiva não tem perfil nenhum** — ela não faz login. O que ela usa são duas
   páginas públicas por token: o **link do orçamento** e o **portal**. O
   material dela não é um manual de sistema; é outra coisa (abaixo).

**Proposta:** os manuais são escritos por **papel humano** (é como a pessoa
pensa: *"o que EU faço"*), e cada um abre declarando **qual perfil ele
pressupõe**. Onde papel e perfil não batem — a costureira —, o manual diz a
verdade em vez de fingir.

## Os cinco documentos

### 1. Manual do Proprietário (Renato) — *"a loja inteira, e o dinheiro"*
**Perfil:** Proprietária no sistema — ver a nota de nome abaixo. **Telas:** ~30 das 59.
O único que cobre `financeiro`, `comissao` e `admin`: contas a receber e a
pagar, conciliação, DRE, fluxo de caixa, projeção, folha, comissões, auditoria,
equipe e perfis, backup, dados da loja, privacidade. Cobre também tudo o que a
vendedora faz, porque ela precisa saber conferir.

### 2. Manual da Vendedora — *"do primeiro contato ao contrato assinado"*
**Perfil:** Vendedora. **Telas:** ~20.
O documento mais importante dos cinco, porque é o caminho que a trilha inteira
mirou: noiva nova → interesses → lookbook → prova marcada → orçamento → link
para a noiva → aceite → reserva do vestido → **contrato**. Inclui o que mudou
nesta trilha e que ela vai notar no primeiro dia: a proposta não vai vazia, a
proposta vencida não se aceita (e como reabrir), o desfazer-aceite, a fila de
"aceitos sem contrato".

### 3. Manual da Recepção — *"a agenda e a porta da loja"*
**Perfil:** Recepção. **Telas:** ~10.
Marcar, remarcar e confirmar provas; a grade do dia e a semana; cabines e
horário; cadastrar a noiva que ligou; as mensagens do dia e a fila "falta
procurar". Não vê dinheiro, não edita acervo.

### 4. Manual da Costureira — *"a fila do que tem que ficar pronto"*
**Perfil:** hoje, Recepção (ver a tensão acima). **Telas:** 3.
A fila de ajustes e confecções, a ficha do trabalho, marcar feito, o prazo que
vem do casamento da noiva. É o manual mais curto e o de leitura mais provável
no celular, em pé, ao lado da máquina.

### 5. Guia da Noiva — *"o que ela recebe, e o que responder quando ela
perguntar"*
**Não é manual de sistema.** São duas páginas públicas (o link da proposta e o
portal) e um roteiro para a vendedora: o que a noiva vê, o que ela consegue
fazer sozinha (aceitar, confirmar prova, pedir remarcação, baixar o contrato),
e as frases que o sistema mostra quando algo dá errado — *"esta proposta venceu
em 10/07"*, *"esta proposta foi encerrada"* — para que a vendedora saiba
responder ao WhatsApp que vem depois.

## A régua: um manual que mente é pior que nenhum

Esta é a parte do plano que vem da casa, e é o que separa isto de um texto
bonito que apodrece em três semanas.

**a) Toda tela citada tem que existir.** Uma varredura no estilo das 16 do
repositório: enumera com `git ls-files` as rotas de
`artifacts/moscow-noivas/src/pages/`, extrai dos manuais toda referência de tela
e reprova a que não existir. Piso de população declarado. **Custo: baixo, e é o
que impede o manual de descrever a tela que foi renomeada.**

**b) Todo número citado sai de uma fonte, não da cabeça.** Os prazos e limites
que o manual promete — 30 dias de validade da proposta, 7 dias do link público,
30 dias de inatividade do portal, 2 MiB da foto de avaria — são constantes no
código. O manual cita o valor **e** o plano lista de onde ele veio, para a
próxima mudança saber o que reescrever.

**c) Toda jornada descrita tem um E2E que a executa, ou é declarada como não
coberta.** São 171 specs. Onde o manual descreve um caminho que nenhum spec
cruza, isso é dito — e vira candidato a spec novo, exatamente como o E166 fez
com o caminho público (que tinha ZERO).

**d) Nenhuma captura de tela na primeira versão.** `scripts/capturar-telas.ts`
existe e faz 27 rotas × claro/escuro/390px, mas imagem é a parte que apodrece
mais rápido e mais silenciosamente. Texto primeiro; imagem depois, se o Renato
pedir, e gerada por script para poder ser refeita em lote.

## A ordem, em quatro entregas

Cada uma fecha em um commit e publica uma página. A ordem é por dor, não por
tamanho.

| # | Entrega | Por que primeiro | Estado |
|---|---|---|---|
| **1** | **Vendedora** | É o caminho que a trilha mirou, o que mais gente percorre e o que mais mudou. Se só uma entrega acontecer, tem que ser esta. | ✅ `3f3ec02` — `docs/manuais/vendedora.html`; achou a S-O38 e a S-O39 |
| **2** | **Costureira** + **Guia da Noiva** | Os dois mais curtos, e os dois que hoje não têm NADA. Juntos são menos trabalho que o da vendedora. | ✅ 2026-08-12 — `costureira.html` e `noiva.html`; achou a **S-O40** e corrigiu a moldura da S-O27 |
| **3** | **Recepção** | Muito se apoia no que a vendedora já explicou; é sobretudo agenda. | aberta |
| **4** | **Proprietário** | O maior, e o único que pode se apoiar nos quatro anteriores em vez de repeti-los. O financeiro inteiro é dele. | aberta |

As três páginas publicadas, para quem precisar do endereço:

| Manual | Fonte no repo | Página |
|---|---|---|
| Vendedora | `docs/manuais/vendedora.html` | <https://claude.ai/code/artifact/d0357a33-b02a-4247-9d98-9e16f23373ce> |
| Costureira | `docs/manuais/costureira.html` | <https://claude.ai/code/artifact/a9ce3b64-5d5d-4537-b653-6a41bd17f780> |
| Guia da Noiva | `docs/manuais/noiva.html` | <https://claude.ai/code/artifact/e8af06df-a41b-4428-8ca1-05315c64940a> |

**A varredura (a) continua devendo.** Ela ia nascer junto da entrega 1 e não
nasceu; o que nasceu foi outra, e por outro motivo: a **varredura de links
internos** (`lib/varredura-links-internos.test.ts`, `710b254`), que confere os
113 destinos do frontend contra as 63 rotas declaradas — ela pega a classe da
S-O38, não a do manual que cita tela renomeada. Com três manuais escritos, a
varredura das telas citadas tem população para valer a pena; antes da entrega 3.

Junto da entrega 1 nasce a **varredura (a)** e o esqueleto compartilhado da
página — o resto é conteúdo.

## O que este plano descobriu, e que não é documentação

Levantar o mapa de papéis × perfis produziu dois achados. **Eles não se
consertam neste plano** — vão para a tabela de Sobras, na regra 12:

- **Não há perfil para a costureira, e dar-lhe acesso hoje custa a carteira de
  leads.** A fila de ajustes pede `agenda` (`agenda.ts:248`); o perfil mais
  fechado que a concede é a Recepção, que traz `leads` ver+criar junto. Um
  perfil "Costureira" com `agenda` e nada mais é uma linha em `PERFIS_PADRAO`
  (`configuracao-inicial.ts:85`) — mas mexe em seed, então pede a régua do banco
  virgem e uma decisão do Renato sobre o que ela pode enxergar da agenda.
- **A Vendedora fecha contrato porque `contratos.ts` pede `leads`.** Pode estar
  certo (é ela quem vende), mas é uma decisão que nunca foi escrita: quem lê os
  quatro perfis não descobre que "leads" inclui assinar contrato de
  R$ 5.000,00. O manual vai ter que declarar isso — e a declaração é o momento
  de confirmar com o Renato se é mesmo o que ele quer.

## O que fica de fora, e por quê

- **Vídeo e treinamento presencial** — outro ofício, outro esforço.
- **Manual do desenvolvedor** — já existe, espalhado em `CLAUDE.md`, `METODO.md`
  e `replit.md`, e é para outro público.
- **Tradução** — o sistema é pt-BR e a loja também.
- **Documentar a API** — o `openapi.yaml` já é isso, e ninguém neste público a
  consome.

## As decisões do Renato

**1. Os nomes dos perfis ficam** (2026-08-11) — "Vendedora", "Recepção",
"Admin" seguem como estão, e o manual os grava assim.

**Com uma correção que o próprio pedido trouxe: o perfil "Proprietária" está no
gênero errado.** O proprietário do ateliê é o **Renato, homem**. O nome está
gravado em **`configuracao-inicial.ts:94`** e ecoa em quatro outros arquivos
versionados (dois testes, o texto de ajuda de `perfis-do-sistema.ts` e o teste
dele). Renomear é pequeno, e **não é cosmético para este trabalho**: a régua (a)
deste plano diz que o manual não pode mentir, e um manual que escreve
"Proprietário" enquanto a tela mostra "Proprietária" mente na primeira linha.

Como mexe em **seed**, o conserto tem três partes e não cabe dentro da entrega
1: a linha do `PERFIS_PADRAO`, os quatro ecos, e um **SQL em `docs/migracoes/`**
para as instalações que já gravaram o nome antigo (o seed é idempotente — ele
não renomeia o que já existe). Pede a régua do banco virgem. **Fica como
pendência declarada, e o manual da vendedora não depende dela** — ele cita o
perfil dela, não o do Renato.

**2. O manual da costureira nasce dizendo a verdade de hoje; o perfil vem
depois** (2026-08-12) — ela entra como **Recepção**, e o manual abre declarando
isso, com as quatorze linhas de menu que o perfil abre e as três que são dela.
O perfil próprio mexe em **seed** — pede a régua do banco virgem, um SQL para
quem já instalou e uma decisão sobre o que ela enxerga da agenda —, e isso é
épico de código, não commit de documentação. Quando ele fechar, o manual muda em
um parágrafo.

**E escrever esse manual mostrou que a S-O36 era o lado pequeno do problema.**
Não é só a carteira de leads: a Recepção **fecha contrato**. `POST /contratos`
não declara ação, o guard deriva `criar` do método, e o perfil tem
`leads: VER_E_CRIAR` — o botão "Gerar contrato" da tela do orçamento aparece
para ela e funciona. Hoje, dar à costureira acesso à fila de ajustes dá-lhe o
poder de assinar um contrato de R$ 5.000,00. É a **S-O40**, e ela é o argumento
mais forte a favor do perfil próprio.
