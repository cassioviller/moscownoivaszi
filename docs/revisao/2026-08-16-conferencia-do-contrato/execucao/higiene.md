# O lote de higiene 🔵 da conferência
**Conferência do contrato, o lote final** · branch `main` · base `4c0f4f9c` (E248 registrado)
Fecha: A6, A7, B7, C8, C9, C11, C12, E2, E3, E4, G9, G14, G15 (dois títulos) — **13 dos 17** 🔵 da linha do consolidado
Ficam declarados (S-CF3 no rastreador): G11, G12, G13 e os menores restantes de G15
Suíte: API 1865 (267 arquivos) · frontend 1017 (108 arquivos) · E2E 186 em 7,4 min, 0 skipped (seis telas mudaram) · typecheck verde em 5 projetos

## O que mudou, item por item

- **A6 · `/receber`** — um pedaço NOVO numa parcela já conferida não está
  conferido: o `UPDATE` do recebimento limpa `conciliadoEm` (a conciliação
  herdava o carimbo velho para o pedaço novo, `?? d.conciliadoEm`); os atos já
  conferidos continuam com o seu em `conciliacao_de_recebimentos`.
- **A7 · `reservas.ts`** — o comentário do reajuste da 17ª dizia "aparece na
  comissão como qualquer dinheiro"; a base da comissão é `contratos.valorTotal`
  e `comissao.ts` não lê `parcelas`. Agora diz que **não** entra, e por quê.
- **B7 · `fila-de-atrasos-cache.ts`** — geração por loja: `derrubar` sobe a
  geração; `guardar` só grava se a geração lida ANTES de ir ao banco ainda é a
  atual — um GET em voo não regrava um corpo derrubado por até 5 min.
- **C8 · `admin/index.tsx`** — `LOJA_COM_HISTORICO`/`USUARIO_COM_HISTORICO`
  saem do dicionário da tela: o `detalhe` do servidor traz a CONTAGEM ("3
  parcela(s), 2 contrato(s)…") e o dicionário a vencia. O `e2e/64` passa a
  esperar a frase do servidor.
- **C9 · `atendimentos/config.tsx`** — `630/1140/1080/[2..6]` à mão viram
  `EXPEDIENTE_DE_RETIRADA_PADRAO` do `agenda-core` (S-C180).
- **C11 · UF** — `LeadUpdate.enderecoEstado` ganha `minLength/maxLength 2`
  (a criação já tinha; a edição aceitava 1 letra) e a tela recusa antes do
  clique ("UF são duas letras"). Codegen.
- **C12 · três leituras** — erro deixa de virar silêncio: a fila de atrasos
  em `/contratos` mostra `<Erro>` com "tentar de novo"; o sino põe "Não
  consegui ler a fila de atrasos"; a ficha da noiva diz que não leu a
  retirada/devolução em vez de sumir a linha.
- **E2 · `docs/migracoes/2026-08-13-e217-rescisao-do-contrato.sql`** — o
  único épico da trilha com DDL sem script; idempotente, **rodado duas vezes num
  banco descartável** (0 erros nas duas).
- **E3 · `contratos.ts`** — a `DEVOLUCAO` vence em `ancoraDeNegocio` (meio-dia
  SP), a mesma âncora das contas irmãs (regra 26); era `inicioDoDia` (03:00Z).
- **E4 · `openapi.yaml`** — o ponteiro de `ACOES_AUDITORIA` aponta para
  `lib/financeiro-core/src/auditoria.ts` (desde a S-O52).
- **G9 · `varredura-datas-nao-aceitam-nulo`** — a régua DESCE nos aninhados
  (objeto dentro de objeto, itens de array, o miolo de optional/nullable) e
  prega que acha `CreateContratoBody.parcelas[].vencimento`; 0 culpados.
- **G14 · `varredura-enums-do-banco-no-spec`** — o plantado passa pela MESMA
  `donoDaLista` que o `it` real usa, em vez de reencenar o `.filter`.
- **G15 · dois títulos** — `e221` dizia 404 e media 403 (o 403 é o certo: a
  sessão não tem a loja); `e237` prometia o portal e confere fila e carnê.

## O que fica declarado, e por quê (S-CF3)

- **G11** — o `escrito()` da `varredura-campo-escalar-do-spec` é `\bcampo\b`
  no servidor inteiro, comentários inclusos: forma grossa DECLARADA no
  próprio arquivo; apertar é reescrever o leitor.
- **G12** — os DIAS VEDADOS da 17ª (`[5, 6]`) estão em prosa nos manuais sem
  `data-regua`: a régua de prazos é NUMÉRICA (`eval` de aritmética literal), e
  ensinar-lhe "dias da semana" (array + `NOME_DO_DIA`) é uma régua nova, não
  uma anotação.
- **G13** — a heurística da `varredura-das-varreduras` (qualquer `toContain(`
  conta como "diz o tamanho"): régua sobre réguas, de propósito grossa.
- **G15 (o resto)** — `sc140:251-252` prega alias de SQL; `dataFutura(-n)`
  como "há n dias" em 8 sítios (inertes); `so18:61` e
  `revisao-reserva-avaria:23` medem `moscow_base`; o `const r` reutilizado
  do `postEsperaRecusa`; `varredura-expurgo-lgpd:194` aceita `coluna:` em
  comentário. Nenhum tem defeito vivo atrás.

## Verificação

Réguas tocadas: `varredura-datas-nao-aceitam-nulo` 3/3, `enums-do-banco` 5/5,
e235 + e103 + e217 + s-c89 + s-c32 40/40 (A6/E3/B7), frontend **1017**;
typecheck verde em 5 projetos; codegen em dia (UF). API e E2E completos no
fecho (números na tabela do rastreador).
