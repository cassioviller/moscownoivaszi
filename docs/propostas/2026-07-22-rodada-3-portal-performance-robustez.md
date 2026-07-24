# Rodada 3 — Portal, performance e robustez (E78–E82)

> **Placar final (2026-07-22).** Executada na ordem planejada (E79 → E80 →
> E78 → E81 → E82), tudo entregue com teste no commit:
>
> - **E79 ✅** — cinco recortes no banco: `/leads/parados` (E79.1),
>   `GET /financeiro/fluxo`, `GET /financeiro/dre` (com o teste de igualdade
>   fluxo×DRE contra os dois endpoints), `GET /parcelas?status=abertas` +
>   `?recebidasDe=` (cobrança e projeção, dois recortes para não contar a
>   PARCIAL em dobro), `bloqueios?leadId=` + `GET /bloqueios/{id}` +
>   `atendimentos?bloqueioId=&tipo=`. O motor do DRE e o por-meio subiram
>   para o `financeiro-core`; endpoints antigos preservados.
> - **E80 ✅** — `perfis.sistema` (migração versionada + Admin marcado);
>   servidor recusa PATCH/DELETE de perfil do sistema; `ehPerfilAdmin`
>   mudou-se para a lib e lê a flag. Caça ao flake: 3 rodadas
>   `--sequence.shuffle.files` sem flake de concorrência (a única falha era
>   o fiscal spec↔rotas cego a rota multilinha — corrigido; o flake original
>   de 1/552 não reproduziu).
> - **E78 ✅** — `portal_tokens` (um token por noiva), `GET /portal` com as
>   quatro seções, aceite delegando à rotina do E74 extraída para lib,
>   `/portal/foto` escopada, gestão por lead com gate `leads`, página
>   `/noiva/:token` e card na ficha. Pendência consciente: mensagens do
>   wa.me (E69) ainda não linkam o portal — exigiria token em lote nas
>   listas; fica para a próxima rodada.
> - **E81 ✅** — specs novos: sino+mensagens (seed compartilhado), portal
>   (aceite refletindo na gestão + revogação), conciliação por CSV, avaria
>   vira parcela, restaurar padrão + consolidado. De quebra a suíte velha
>   voltou a contar a verdade: dashboard pós-E66, menu sem "Leads" (E31),
>   membro novo cai em /trocar-senha (E57), coletor de erros sabe que o 404
>   do card do portal é estado, seeds acumulados pedem `.first()`, o E40
>   ganhou cabine própria e limpeza (o lixo do próprio dia flakeava o
>   "depois passa"), e o rate limit de login derrubava os ÚLTIMOS specs da
>   ordem alfabética com 429 — `E2E_SUITE=1` pula os limiters como o vitest
>   já pulava. Placar final: 127/127 na suíte completa.
> - **E82 ✅** — títulos: menu "Financeiro" ↔ H1 "Financeiro" (fluxo é a
>   lente), menu "Seu dia" ↔ H1 "Seu dia, X", h1 "Vestidos" (Catálogo é a
>   outra tela) — e2e no mesmo commit; `replit.md` atualizado (Product +
>   Gotchas: poda, versões, portal); este placar.

Plano pós-E77, ancorado no código como está em `598e04e`. As duas rodadas
anteriores (E1–E30, E31–E57) e a sequência E58–E77 fecharam o funcional; o que
sobrou tem três naturezas: **um salto de produto** (o portal da noiva), **uma
dívida de performance** que cresce com a base (telas que ainda baixam a loja
inteira) e **duas fragilidades anotadas** durante a execução (perfil admin por
nome, flake de concorrência na suíte). Regra da casa mantida: nenhuma API
externa, dinheiro em centavos, contrato OpenAPI como fonte da verdade, cada
épico com teste no commit.

Ordem recomendada: **E79 → E80 → E78 → E81 → E82**. O E79 primeiro porque o
portal (E78) vai criar *mais* superfície pública sobre os mesmos dados — melhor
assentar os agregados server-side antes de multiplicar consumidores. O E78 é o
maior e mais visível; E80–E82 são curtos e podem intercalar.

---

## E79 — O financeiro agrega no banco (fim do "baixa a loja inteira", parte 2)

**A dor.** O E62 curou o perfil da noiva, mas o padrão sobrevive onde mais
pesa: `/financeiro` (fluxo), `/financeiro/dre`, `/financeiro/projecao` e
`/financeiro/cobranca` baixam **todas as parcelas e pagamentos** da história da
loja para agregar no navegador; `/reservas`, `/provas` e `/reservas/:id`
filtram **todos os bloqueios e atendimentos**; e o sino (E68) + dashboard (E66)
baixam **todos os leads** só para achar os parados. Em loja com 2–3 anos de
história, cada abertura de tela paga o acervo inteiro.

**Feito significa.** Nenhuma tela de linha-do-tempo pede lista completa sem
recorte; os agregados que o `financeiro-core` calcula ganham endpoints que
devolvem o resultado, não a matéria-prima.

**Escopo técnico.**
1. `GET /lojas/{id}/financeiro/fluxo?ini&fim` — entradas/saídas/saldo +
   por-meio + movimentos DO PERÍODO (o motor `caixa.ts` roda no servidor sobre
   linhas já filtradas por data no SQL). A tela de fluxo passa a pedir só a
   janela visível.
2. `GET /lojas/{id}/financeiro/dre?competencia` — mesmo movimento.
3. `GET /lojas/{id}/parcelas?status=abertas` e `?vencidasAte=` — recortes que
   cobrança e projeção usam (a projeção precisa dos previstos futuros, não dos
   pagos de 2024).
4. `GET /lojas/{id}/bloqueios?leadId=` e `GET /lojas/{id}/atendimentos?bloqueioId=`
   — os recortes que `/reservas/:id` e `/provas` precisam (padrão E45/E62).
5. `GET /lojas/{id}/leads/parados` — o funil-core `leadParado` roda no servidor
   (dias de contato via `max(contatoData)` que a rota de lista já calcula) e
   devolve só as críticas/atenção com contagem. Sino e dashboard trocam a lista
   completa por este endpoint.

**Cuidados.** (a) O invariante "DRE fecha com o fluxo" hoje é garantido por os
dois usarem o MESMO dado no cliente — ao mover para o servidor, os dois têm de
sair do MESMO motor (`financeiro-core` importado pelo api-server, como o E25
fez) e um teste de API deve provar a igualdade período a período. (b) Não
remover os endpoints antigos: as telas migram uma a uma, typecheck aponta o
resto. (c) `keepPreviousData` nas janelas para a navegação de período não
piscar.

**Testes.** Igualdade fluxo×DRE por competência; janela vazia devolve zeros
(não null); paridade de um período contra o cálculo client-side atual (fixture
com parcial + estorno).

**Primeira ação.** Escrever o contrato de `GET /financeiro/fluxo` no
`openapi.yaml` espelhando exatamente o shape que `fluxo.tsx` monta hoje no
`useMemo` — o shape já existe, só muda de lado.

---

## E80 — Robustez anotada: perfil admin por flag e a suíte sem flakes

**A dor.** Duas anotações da execução: (1) `ehPerfilAdmin` identifica o perfil
de acesso total **pelo nome** ("admin"/"administrador…") — renomeou, perdeu o
readonly da matriz e o tratamento especial; (2) a verificação final teve 1
flake em 552 testes sob paralelismo de suítes (não reproduzido em reexecução) —
suspeitos: fixtures que tocam estado global (poda de backup, rotação de token
de captação da loja de outra suíte, contadores globais do consolidado).

**Feito significa.** O perfil do sistema é uma **flag no banco**; a suíte roda
3× seguidas sem falha.

**Escopo técnico.**
1. `perfis.sistema boolean not null default false` (migração aditiva +
   `docs/migracoes/`), marcado via SQL no perfil Admin existente. `Perfil` no
   contrato ganha `sistema`; `ehPerfilAdmin` passa a ler a flag (mantendo o
   nome como fallback por uma versão); servidor **recusa** PATCH/DELETE de
   perfil com `sistema=true` (hoje só a UI protege — um curl derruba o perfil
   Admin).
2. Caça ao flake: rodar a suíte com `--sequence.shuffle` algumas vezes; o que
   piscar ganha isolamento (asserts do consolidado só sobre a loja da fixture —
   já feito; poda de backup movida para teste serial se for ela; token de
   captação sempre da própria fixture — já é).

**Testes.** PATCH em perfil sistema → 403/422; renomear o Admin não perde o
readonly (e2e da matriz já cobre a tela).

**Primeira ação.** `ALTER TABLE perfis ADD COLUMN sistema` + marcar o Admin
via psql guardado, como manda o gotcha do push.

---

## E78 — O portal da noiva: um link para tudo dela

**A dor.** A noiva hoje recebe até TRÊS links soltos (orçamento E13, lookbook
E21, e nada para provas/parcelas). Cada um com token e validade próprios; a
vendedora gerencia três expirações e a noiva não tem "o meu lugar" — o aceite
(E74) mostrou que ela age quando o link dá o poder de agir.

**Feito significa.** Um link só (`/noiva/:token`) onde ela vê: a proposta (com
aceite E74), o lookbook dos vestidos provados, as próximas provas com data e
hora, e — depois do contrato — o extrato de parcelas dela (pagas/abertas, sem
dados de outras noivas). A vendedora gera/revoga na ficha da noiva.

**Escopo técnico.**
1. **Schema:** `portal_tokens` (id, lojaId, leadId unique, token unique 256
   bits, expiraEm, criadoEm, revogadoEm, ultimoAcessoEm). Token por NOIVA, não
   por documento — os tokens antigos de orçamento/lookbook continuam válidos
   (compat), mas a UI passa a oferecer o portal.
2. **API pública** (montada como `orcamentos-publico`, token em query):
   `GET /portal?token=` → `{ noivaNome, lojaNome, orcamento (o shape do E13 +
   aceite), lookbook (itens com fotos), provas (futuras: data/hora/tipo),
   parcelas (numero, descricao, valorPrevisto, valorRecebido, vencimento,
   status) }`. Carimba `ultimoAcessoEm`. O aceite continua no endpoint E74 —
   o portal o chama com o token do orçamento embutido na resposta? **Não**:
   o portal resolve o leadId e reusa a MESMA mecânica servindo o aceite por
   `POST /portal/aceite?token=` que delega à rotina do E74 (uma transação, um
   invariante). Parcelas são SÓ leitura — pagar continua com a loja.
3. **API autenticada:** `POST /lojas/{id}/leads/{leadId}/portal` (gera/regenera,
   30 dias), `DELETE` (revoga). Gate `leads.editar`.
4. **Frontend público:** página `/noiva/:token` — seções condicionais (sem
   contrato → sem extrato; sem lookbook → sem galeria), tom concierge, mesmo
   tratamento de LINK_EXPIRADO/INVALIDO das irmãs.
5. **Frontend loja:** card "Portal da noiva" na ficha (gerar/copiar/revogar,
   "último acesso há X"), substituindo gradualmente os dois cards de link.

**Cuidados.** (a) O portal expõe parcelas — dados financeiros num link: TTL
curto (30d), revogação a um clique, e NUNCA valores de outras noivas ou da
loja; (b) o GET agrega 4 domínios — nasce já server-side (motivo da ordem
E79→E78); (c) mensagens do wa.me (E69) passam a linkar o portal quando existir.

**Testes.** Token válido devolve as 4 seções coerentes com a fixture; revogado
→ 410; parcelas de OUTRA noiva jamais aparecem (teste com 2 leads); aceite via
portal grava o mesmo rastro do E74; regenerar mata o link antigo.

**Primeira ação.** Escrever o contrato `GET /portal` no `openapi.yaml` — o
shape da resposta é a decisão de produto inteira; o resto é execução.

---

## E81 — E2E da nova safra

**A dor.** E58–E77 nasceram com testes de API e unitários, mas a suíte
Playwright (68 specs) não conhece: o sino, mensagens de hoje, conciliação,
grade de slots, aceite público, avarias, consolidado. O padrão do projeto
(E12: "a régua espelhada ganha fiscal") pede o mesmo aqui.

**Feito significa.** Um spec por fluxo novo, no estilo dos existentes
(`e2e/*.spec.ts`, seed do global-setup): sino mostra e dispensa aviso; fila de
mensagens carimba confirmação; upload de extrato concilia fixture; agendar
pela grade de slots recusa ocupado; noiva aceita e a ficha da vendedora
reflete; avaria vira parcela; matriz de permissões cobre `restaurar padrão`.

**Primeira ação.** `e2e/40-sino-e-mensagens.spec.ts` — os dois fluxos dividem
seed (atendimento de amanhã sem confirmação).

---

## E82 — Higiene final: títulos, propostas e memória do projeto

**A dor.** Sobras conscientes: títulos de tela divergem do menu ("Financeiro"
abre "Fluxo de caixa") — adiado no E67 porque os e2e tratam títulos como
contrato; o `replit.md` não menciona sino/portal/conciliação; e as rodadas de
propostas não registram o que a 3ª rodada decidiu.

**Feito significa.** Menu e H1 contam a mesma história (mudança + e2e no MESMO
commit); `replit.md` atualizado (Product + Gotchas: poda de backup, versões de
orçamento, portal); este documento marcado com o placar final.

**Primeira ação.** Grep dos títulos assertados nos e2e para dimensionar o
impacto real antes de decidir renomear ou dar subtítulo.

---

## Resumo executivo

| Épico | Natureza | Tamanho | Depende de |
|---|---|---|---|
| E79 | Performance server-side (financeiro, reservas, parados) | M | — |
| E80 | Robustez (perfil por flag, flake) | P | — |
| E78 | Produto: portal da noiva | G | E79 (agregados) |
| E81 | E2E da nova safra | M | nada (paralelizável) |
| E82 | Higiene e docs | P | E78 (para documentar) |

Critério de corte mantido: sem API externa. O portal é o último grande salto
possível dentro dessa restrição — depois dele, o que muda a categoria do
produto (WhatsApp API, PIX com conciliação automática, NF-e) exige sair dela,
e é uma decisão de negócio, não de engenharia.
