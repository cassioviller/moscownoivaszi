# Rodada 5 — O acabamento da escala (E87–E90)

Plano pós-rodada 4, ancorado no código como está em `29789f8`. As rodadas 3–4
tiraram do "baixa a loja inteira" tudo que era POLL ou tela de chegada
(financeiro, funil, agenda do dia, portal). O que sobrou são as LISTAGENS DE
GESTÃO — telas de arquivo que ainda carregam a história completa para filtrar
no navegador — e duas dívidas silenciosas: código client-side que o servidor
aposentou e segue no bundle, e um backup que ninguém jamais provou que
RESTAURA. Regra da casa mantida: nenhuma API externa, contrato OpenAPI como
fonte da verdade, cada épico com teste no commit.

Ordem recomendada: **E87 → E88 → E89 → E90**. O E87 fecha o ciclo aberto no
E79; o E88 poda o que ele deixou obsoleto; o E89 é independente mas fica
depois porque mexe em infra de teste; E90 fecha o placar.

---

## E87 — As listagens de arquivo pedem o recorte (fim do "baixa tudo", final)

**A dor.** `atendimentos/index` baixa a agenda INTEIRA da história e filtra
busca/vendedora/situação no navegador; `reservas/index` baixa todos os
bloqueios para separar futuras de passadas no cliente; `provas/index` baixa
todas as provas para o mesmo toggle. Em loja com 2–3 anos, são as três telas
de arquivo mais pesadas que restam — e duas delas nem precisam de contrato
novo: a janela `de`/`ate` do E83 já recorta.

**Feito significa.** Nenhuma tela de listagem pede a história completa por
padrão; "ver o passado" é uma escolha explícita que pede só o recorte pedido.

**Escopo técnico.**
1. `provas/index`: o toggle usa a janela do E83 — futuras = `de=hoje`,
   passadas = `ate=ontem` (querys separadas, cache por chave). Zero backend.
2. `atendimentos/index`: janela padrão dos últimos 90 dias (`de=`) com
   "carregar mais antigo" dobrando a janela; filtros de situação/vendedora
   podem seguir no cliente — sobre o recorte, não sobre o acervo.
3. `reservas/index`: `GET /bloqueios` ganha `futuras=true|false` (recorte por
   `casamentoData` contra hoje, dia local; passadas ordenadas desc no
   servidor). O toggle troca o param.
4. De carona: conferir que nenhuma listagem restante (ajustes, contratos,
   orçamentos de gestão) tenha custo comparável — se tiver, entra; se não,
   registra no placar por quê ficou.

**Cuidados.** (a) `keepPreviousData` nos toggles para não piscar; (b) a
janela padrão NÃO pode esconder atendimento futuro — `de=hoje-90d` sem
`ate`; (c) contagens/KPIs que dependiam da lista completa (se houver) têm de
vir do servidor, não do recorte.

**Testes.** API: `futuras=` recorta por dia local nas duas direções. E2E: o
toggle de provas continua contando a verdade com o recorte.

**Primeira ação.** Migrar `provas/index` para a janela do E83 — o épico
inteiro sem tocar backend prova o desenho.

---

## E88 — A poda: o que o servidor aposentou sai do bundle

**A dor.** O E79 moveu os motores para o servidor, mas `tendenciaCaixa` e
`horizonteAberto` seguem exportados na lib do front com ZERO usos fora dos
próprios testes; `resumoCaixa` sobrevive só por um uso em `exportar.ts` a
conferir; e `round2` vive duplicado (rotas de orçamento e lib visao-noiva).
Código morto não é neutro: é o lugar onde a próxima pessoa "conserta" algo
que ninguém executa.

**Feito significa.** Zero exports sem consumidor real na lib do front; a
duplicação de `round2` vira função única; o que FICA (motores que a
conciliação e o CSV usam de verdade) ganha um comentário dizendo por quê.

**Escopo técnico.**
1. Remover `tendenciaCaixa`/`horizonteAberto` (e seus testes) da lib client —
   o core (`@workspace/financeiro-core`) segue sendo a casa deles.
2. Auditar `resumoCaixa` em `exportar.ts`: se o CSV já nasce dos números do
   servidor, cai junto; se não, documenta-se o porquê.
3. `round2` único (lib do server), importado pelas rotas de orçamento e pela
   visao-noiva.
4. Varredura final de exports órfãos nas libs do front (grep por consumidor,
   não ferramenta nova).

**Cuidados.** As rotas planas legadas (`LegacyRedirect`) NÃO entram: bookmark
de usuária real ainda cai nelas; aposentá-las é decisão de produto com prazo,
não poda técnica.

**Testes.** O typecheck é o fiscal (remoção quebra quem usava); suites front
seguem verdes.

**Primeira ação.** `grep` de consumidores de cada export da lib financeira
do front, com o veredito anotado no commit.

---

## E89 — O drill do restore: backup que nunca voltou não é backup

**A dor.** O E30/E59 criou dump agendado, download e poda — mas nenhum
processo jamais RESTAUROU um dump e conferiu que o banco volta inteiro. A
primeira restauração de verdade não pode ser durante um incêndio.

**Feito significa.** Um comando (`pnpm --filter api-server run restore-drill`)
que pega o dump mais recente, restaura num banco EFÊMERO (schema/database
temporário na mesma instância, via psql — sem serviço novo) e confere
invariantes: contagem por tabela bate com a origem, FKs válidas, uma amostra
de agregado (soma de parcelas) idêntica. Sai um relatório de uma linha por
tabela e código de saída honesto.

**Escopo técnico.**
1. `scripts/restore-drill.ts`: cria database `drill_<timestamp>`, aplica o
   dump, roda as conferências, DROPa no finally (sucesso ou falha).
2. Registro do drill no mesmo lugar do backup (a tela de Configurações já
   mostra o status do backup — o drill entra como linha ao lado, "restaurado
   e conferido em X").
3. Teste de API do registro; o drill em si roda como script (tocar dump real
   no CI de teste é aceitável: o banco é o de `DATABASE_URL`).

**Cuidados.** (a) NUNCA tocar o database de origem — o drill trabalha só no
efêmero e aborta se o nome não começar com `drill_`; (b) dump com dados LGPD:
o efêmero morre no finally, sem sobreviver ao processo.

**Primeira ação.** O script com criação/drop do efêmero e a primeira
conferência (contagem por tabela) — o resto é acréscimo de invariantes.

---

## E90 — Placar e memória

**Feito significa.** Este documento com o placar; `replit.md` conta o drill
(gotcha novo: como rodá-lo e o que ele NÃO faz); suítes completas verdes.

---

## Resumo executivo

| Épico | Natureza | Tamanho | Depende de |
|---|---|---|---|
| E87 | Performance (listagens de arquivo) | M | E83 (janela) |
| E88 | Higiene (poda do aposentado) | P | E79 (motores no server) |
| E89 | Robustez (drill do restore) | M | — |
| E90 | Placar e docs | P | E87–E89 |

Depois desta rodada, o "sem API externa" está exaurido de trabalho grande:
o que muda a categoria do produto (WhatsApp API, PIX automático, NF-e) é
decisão de negócio. A rodada 6, se houver, nasce de dor nova de uso real —
não de plano.

<!-- E87, item 4: ajustes/contratos/orçamentos ficaram de fora — uma ordem de grandeza abaixo da agenda (contrato/orçamento ≈ um por noiva; a fila de ajustes mostra só PENDENTE, que se autolimita), e o recorte útil deles seria por status, não por janela de tempo — não vale contrato novo hoje. -->

---

## Placar final (2026-07-22)

Executada na ordem planejada (E87 → E88 → E89 → E90), tudo com teste no
commit:

- **E87 ✅** (`83d7eb2`) — as três telas de arquivo pedem o recorte: provas
  usa a janela do E83 (futuras = `de=hoje`, passadas = `ate=ontem` — zero
  backend); atendimentos nasce com os últimos 90 dias (`de=` sem `ate`, para
  nunca esconder um futuro) e "carregar mais antigo" dobra a janela;
  reservas ganhou `futuras=true|false` no contrato de `GET /bloqueios`
  (corte de `casamentoData` contra hoje em dia LOCAL, passadas desc no
  servidor; o param é string enum de propósito — `coerce.boolean` engoliria
  `false`). `keepPreviousData` nos três toggles. Ficaram de fora, pelo
  motivo do item 4: ajustes/contratos/orçamentos são ≈ um por noiva ou se
  autolimitam por status (a fila de ajustes só mostra PENDENTE) — o recorte
  útil deles seria por status, não por janela; não vale contrato novo hoje.
  Constatação de carona para a rodada 6: `atendimentos/novo.tsx` AINDA baixa
  a agenda inteira (`useListAtendimentos` sem janela) para montar os slots
  do agendamento — é o último consumidor do acervo completo.
- **E88 ✅** (`0170159`) — a poda, com veredito de grep export a export:
  `tendenciaCaixa`, `horizonteAberto`, `resumoCaixa`, `movimentos` e
  `recebimentosPorForma` saíram da lib financeira do front — o CSV já nasce
  dos números do servidor (`useGetDre`/`useGetFluxoCaixa`), e o
  `financeiro-core` segue sendo a casa dos motores. `round2` virou função
  única na lib do server (`api-server/src/lib/dinheiro.ts`), importada pelas
  rotas de orçamento e pela visao-noiva — os dois lugares que têm de fechar
  no mesmo centavo. O que ficou, ficou com o porquê anotado (espelho do CSV,
  tipos que são assinatura). `LegacyRedirect` intocado, como manda a spec:
  bookmark de usuária real ainda cai nas rotas planas.
- **E89 ✅** (`ad7f1e3`) — o drill do restore rodou DE VERDADE:
  `pnpm --filter api-server run restore-drill` restaurou o dump mais recente
  num database efêmero `drill_<timestamp>` e conferiu contra a origem —
  44 tabelas com contagem batida, 91 FKs sem órfãs, soma de parcelas
  idêntica; o efêmero morre no `finally`, sucesso ou falha (dump com dado
  real não sobrevive ao processo). O registro persiste em
  `restore_drill_log`, sai por `GET /admin/backup`
  (`BackupStatus.ultimoDrill`) e vira a linha "restaurado e conferido em X"
  na tela de Configurações — âmbar quando nunca rodou ou falhou.
- **E90 ✅** — este placar; `replit.md` conta o drill como gotcha (como
  rodá-lo e o que ele NÃO faz). Suítes completas: typecheck verde,
  API 583/583, front 160/160, e2e 127/128. A única falha é a já conhecida
  `26-prova-ocupa-intervalo` ("para depois dela passa" levou 422
  `VENDEDORA_OCUPADA`) — estado ACUMULADO do banco e2e, não regressão:
  o spec isola a cabine (E80) mas compartilha a vendedora do seed, e runs
  anteriores do próprio dia deixaram uma PROVA às 11:15 na `e2e-cabine-1`
  cujo intervalo de 1h cobre o slot das 11:30 do teste (rows conferidas no
  banco). Re-rodado INDIVIDUALMENTE, falha do mesmo jeito — é o dado, não a
  ordem — e o PATCH de atendimentos/motor do E40 não foram tocados nesta
  rodada (a rodada anterior viu a mesma família em `23-prova-data-real` e
  neste mesmo spec). Conserto anotado para a rodada 6: vendedora própria
  por execução (ou limpeza por janela), como a cabine já é.
