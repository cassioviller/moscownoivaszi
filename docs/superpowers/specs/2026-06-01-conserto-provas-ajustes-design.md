# Conserto — Provas & Ajustes (acesso da costureira + robustez + edição + smoke)

> Registrado em **2026-06-01**. Fatia de correção sobre a fatia Provas & Ajustes
> (`docs/superpowers/specs/2026-06-01-provas-ajustes-design.md`). Origem: auditoria +
> click-through que não pôde ser HTTP (o ambiente da sessão não roda Next).

## Contexto

A fatia Provas & Ajustes entregou: bloco contínuo no motor, entidades `Prova`/`Ajuste`/
checklist, módulo de permissão `ajustes`, detalhe da reserva e fila global da costureira.
A verificação (camada de dados, 21/21 no banco de dev + 195 testes) revelou itens a
consertar antes de fechar:

- **A (brecha de fluxo):** a costureira (perfil só com módulo `ajustes`) **não consegue
  abrir o detalhe da reserva** — a página exige `leads:ver`. Ela só consegue "marcar feito"
  na fila global; **não registra prova, não cria ajuste, não usa checklist** — o trabalho do
  módulo feito para ela. Decisão do dono: **a costureira deve gerir provas e ajustes.**
- **B (robustez):** `registrarProva` pode dar **500** com data malformada (sem `try/catch`
  no `create`); `editarProva` **falha em silêncio** com valor inválido (o `catch` engole e a
  tela ainda diz "atualizado").
- **C (completude):** a UI só edita `comparecimento`; corrigir data/tipo/responsável/
  observação exige **remover e recriar** a prova.
- **D (cobertura):** os Server Actions nunca foram exercitados por **HTTP** (o ambiente não
  roda Next). Falta um smoke autenticado commitado.
- **E (operacional):** o 500 visto no smoke foi o **client Prisma stale** pós-migração —
  some ao reiniciar o app. Não é bug de código.

## A — Acesso da costureira (página adaptativa)

Abordagem escolhida: **A1**, reusar `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx`
(sem duplicar a UI; o conteúdo — noiva, vestido, casamento, fases, provas, ajustes — já é
adequado à costureira).

- **Portão de visão:** passa de `leads:ver` para **`leads:ver` OU `ajustes:ver`**. Redireciona
  para o dashboard só se o usuário não tiver nenhum dos dois.
- **Links condicionais** (resolvidos no servidor, como em `nav-items`):
  - nome da noiva → link para o perfil **só se `leads:ver`**; senão, **texto puro**.
  - vestido → link para o detalhe **só se `vestidos:ver`**; senão, **texto puro**.
  (A costureira não tem `leads`/`vestidos`, então não cai em redirect ao clicar.)
- **"← voltar":** aponta para `/loja/[id]/ajustes` quando o usuário **não** tem `leads:ver`;
  senão, para `/loja/[id]/reservas` (comportamento atual).
- **Mutações inalteradas:** seguem gateadas por `ajustes:criar`/`ajustes:editar` (a costureira
  tem `ajustes` TODAS no seed). O "Abrir" da fila global passa a funcionar para ela.

Sem mudança de permissão/seed: a costureira já tem `ajustes` TODAS; o conserto é só o portão
de visão + os links condicionais.

## B — Robustez (falha-fechada) — `src/lib/atelier/provas.ts` + action

- Helper de validação de data "YYYY-MM-DD" reusando `parseDiaUTC` (`@/lib/disponibilidade/datas`)
  dentro de `try/catch` (rejeita formato e datas impossíveis, ex.: `2026-13-40`).
- `registrarProva`: novos motivos **`data_invalida`** e **`comparecimento_invalido`**
  (valida o enum contra o conjunto válido; `undefined` → default `AGENDADA`). Some o risco de
  500: validação acontece antes do `create`.
- `editarProva`: valida data/enum do `patch` e retorna motivo explícito (mantém o `try/catch`
  do `update` como rede para `P2025` → `prova_invalida`).
- `editarProvaAction` (ver C): passa a **redirecionar com `?erro=…`** quando `editarProva`
  retorna `ok:false`, em vez de sempre `?ok=prova`.
- Página: `AVISOS` ganha `data_invalida` ("Data inválida.") e `comparecimento_invalido`
  ("Comparecimento inválido.").

## C — Edição completa da prova (UI) — `reservas/[bloqueioId]/{page,actions}.tsx`

- O formulário por prova "atualizar comparecimento" vira **"Editar prova"** com os campos
  pré-preenchidos com o valor atual: **data** (`type=date`), **tipo** (select), **comparecimento**
  (select), **responsável**, **observação**, e um botão **Salvar**. Server component + `<form>`
  nativo (sem JS de cliente), igual ao resto.
- `editarComparecimentoAction` é renomeada para **`editarProvaAction`** e passa todos os campos
  a `editarProva` (que já aceita o patch parcial). Gateada por `ajustes:editar`.

## D — Smoke HTTP commitado — `scripts/smoke-atelier.ts`

No padrão de `scripts/smoke-permissoes.ts` (commitado, não temporário):

- Forja sessão de **gerente** (`leads`+`ajustes`) e de **costureira** (só `ajustes`); cria
  fixture marcada (noiva + vestido + reserva) em `loja-moscow`.
- Com o app no ar (base URL via env `BASE_URL`, default `http://localhost:5000`):
  - **gerente** abre o detalhe da reserva → **200**;
  - **costureira** abre o mesmo detalhe → **200** (prova da correção A) e abre `/ajustes` → 200;
  - dirige o fluxo prova → comparecimento → ajuste → checklist → marcar feito (camada real) e
    confere os reflexos (a fila perde o ajuste feito; bloco contínuo segue barrando; prova real
    não muda disponibilidade).
- **Degrada** para checagens só de dados se o servidor não responder (não falha o smoke por
  ausência de app).
- Limpa fixture e sessões forjadas no fim. Cabeçalho com instruções de uso (subir o app em
  porta alternativa; `BASE_URL=...`).

## E — Operacional (sem código)

Passo de verificação documentado: **após mudar schema, reiniciar o app (Run)** para o runtime
recarregar o client Prisma regenerado; senão páginas que usam os models novos dão 500
(`prisma.<model>` undefined). Já consta no `estado-atual`; reforçar no checklist da fatia.

## Testes & gates

- Estender `src/lib/atelier/__tests__/atelier.test.ts`: `registrarProva` rejeita data inválida
  (`data_invalida`) e comparecimento inválido (`comparecimento_invalido`); `editarProva` idem.
- A mudança de portão da página (A) e a edição na UI (C) são cobertas pelo `smoke-atelier.ts`
  (com app no ar) + verificação manual; não há teste de unidade de Server Action (dependem de
  cookies/redirect).
- Gates: `node node_modules/vitest/vitest.mjs run` verde; `node node_modules/typescript/bin/tsc
  --noEmit` limpo.

## Fora de escopo

- Integração das provas reais com a **Agenda** (segue fast-follow documentado).
- Qualquer mudança no motor de disponibilidade (a regra do bloco contínuo está fechada).
