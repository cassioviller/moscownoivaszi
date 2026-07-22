# Rodada 4 — A agenda no banco, o portal no bolso, a noiva no comando (E83–E86)

Plano pós-rodada 3, ancorado no código como está em `49362fb`. O E79 tirou o
financeiro, as reservas e o funil do "baixa a loja inteira" — mas a AGENDA
ficou: sino, mensagens de hoje, dashboard e as duas telas de agenda pedem
TODOS os atendimentos da história para olhar 24–48h. E o portal (E78) nasceu
somente-leitura com uma pendência registrada: as mensagens de wa.me ainda não
o oferecem, e a noiva ainda não AGE por ele além do aceite. Regra da casa
mantida: nenhuma API externa, dinheiro em centavos, contrato OpenAPI como
fonte da verdade, cada épico com teste no commit.

Ordem recomendada: **E83 → E84 → E85 → E86**. O E83 primeiro porque sino e
mensagens são exatamente as telas que o E84 toca — melhor assentar as janelas
antes de mexer no conteúdo das mensagens. O E85 é o salto de produto; E86
fecha o placar.

---

## E83 — A agenda pede a janela, não a história (fim do "baixa tudo", parte 3)

**A dor.** `listAtendimentos` só filtra por `bloqueioId`/`tipo` (E79). O sino
(E68) baixa a agenda INTEIRA para achar presenças das próximas 24h — e faz
isso a cada 5 minutos, em toda tela aberta. Mensagens de hoje (E69) baixa
tudo para 48h, e ainda TODAS as parcelas (o aging só olha abertas — o recorte
`status=abertas` do E79 já existe e a tela não o usa) e TODOS os orçamentos
(para achar os enviados vencendo em 72h). Dashboard e agenda (dia/semana)
idem. Em loja com 2–3 anos de agenda, o poll do sino paga o acervo inteiro,
de novo e de novo.

**Feito significa.** Nenhum consumidor de atendimentos pede a lista completa;
o poll do sino viaja quilobytes, não a história.

**Escopo técnico.**
1. `GET /atendimentos?de=&ate=` — janela sobre `inicio` (dia local SP,
   inclusivo nas pontas), mesmo padrão de `GET /pagamentos`. Compõe com
   `bloqueioId`/`tipo`.
2. `GET /orcamentos?status=` — o recorte que mensagens usa (`ENVIADO`).
3. Migram: sino (de=hoje, ate=+1d), mensagens (de=hoje, ate=+2d; parcelas →
   `status=abertas`; orçamentos → `status=ENVIADO`), dashboard (de=hoje,
   ate=hoje), agenda dia (o dia da URL), agenda semana (a semana visível).
   `atendimentos/index` (listagem geral com busca) e `atendimentos/novo`
   ficam para depois — são telas de gestão, não de poll.

**Cuidados.** (a) O recorte fino continua no CLIENTE (o sino corta por
timestamp [agora, +24h]; a janela SQL entrega o superconjunto do dia — mesma
divisão do E79); (b) queryKey com os params, senão o cache mistura janelas;
(c) não remover o comportamento sem params (as telas de gestão seguem nele).

**Testes.** Janela inclusiva nas duas pontas por dia local; composição
janela+tipo; sem params devolve tudo (compat).

**Primeira ação.** O contrato de `de`/`ate` no `listAtendimentos` espelhando
o texto do `listPagamentos`.

---

## E84 — O wa.me fala o portal (a pendência do E78)

**A dor.** A vendedora gera o portal na ficha, mas as mensagens prontas
(cobrança E29, confirmação E39, orçamento vencendo E69) não o mencionam — a
noiva recebe o lembrete sem o link que responde "cadê os detalhes?". A
pendência ficou registrada no placar da rodada 3: exigia token em lote.

**Feito significa.** Toda mensagem de wa.me para noiva com portal VIVO
termina com o link dele; sem portal, a mensagem fica como é.

**Escopo técnico.**
1. `GET /lojas/{id}/portais` — a tabela `portal_tokens` da loja inteira numa
   query (ela tem no máximo uma linha por noiva): `[{leadId, token, expiraEm,
   revogadoEm, ultimoAcessoEm}]`. Gate `leads.ver`.
2. `lib/whatsapp.ts`: `msgCobranca`/`msgConfirmacaoAtendimento`/
   `msgOrcamentoVencendo` ganham `portalUrl?: string | null` — presente,
   entra a linha "Tudo sobre o seu vestido está aqui: <url>".
3. Telas de mensagens e cobrança cruzam por `leadId` e passam a URL só quando
   o portal está vivo (não expirado, não revogado) — link morto na mensagem é
   pior que nenhum.

**Cuidados.** O helper de "portal vivo" mora num lugar só (a régua do card da
ficha é a mesma); a URL nasce de `window.location.origin` como nos cards.

**Testes.** Unit: mensagem com e sem portal; API: o lote devolve só as linhas
da loja (2 lojas na fixture).

**Primeira ação.** O contrato de `GET /portais` no `openapi.yaml`.

---

## E85 — A noiva confirma a presença pelo portal

**A dor.** O aceite (E74) provou: a noiva age quando o link dá o poder de
agir. Mas a prova de amanhã ainda depende da recepcionista mandar wa.me e da
noiva responder — sendo que o portal dela JÁ mostra a prova. Confirmar ali é
um clique, e a fila de mensagens (E69) esvazia sozinha.

**Feito significa.** A prova não confirmada aparece no portal com o botão
"Confirmar presença"; o clique carimba o MESMO `confirmadoEm` do E39, com
rastro "(link público)" na auditoria; sino e fila refletem sem mudança — já
derivam do carimbo.

**Escopo técnico.**
1. O GET /portal passa a expor `id` nas provas (o cliente precisa endereçar).
2. `POST /portal/provas/{atendimentoId}/confirmar?token=` — valida que o
   atendimento é DO lead do token, tipo PROVA, futuro e AGENDADO; carimba
   `confirmadoEm` (idempotente: já confirmada devolve o carimbo existente);
   linha na auditoria com a noiva como autora, como no aceite.
3. Portal UI: botão na prova não confirmada; confirmada vira o badge que já
   existe.

**Cuidados.** (a) NÃO reusar a rota autenticada de confirmar (autoria de
sessão) — a pública tem a própria, como o aceite tem a dele; (b) atendimento
de outro lead é 404 mesmo existindo (o token escopa, como na foto).

**Testes.** API: confirma e carimba com rastro; idempotência; prova de outra
noiva → 404; ATENDIMENTO comum → 422. E2E: o spec 45 ganha o passo (a noiva
confirma; a fila da vendedora esvazia).

**Primeira ação.** O contrato do POST no `openapi.yaml`.

---

## E86 — Placar e memória

**Feito significa.** Este documento com o placar final; `replit.md` conta o
portal que age (confirmação) e as mensagens que o oferecem; suítes inteiras
verdes (API, front, e2e).

---

## Resumo executivo

| Épico | Natureza | Tamanho | Depende de |
|---|---|---|---|
| E83 | Performance (agenda por janela) | M | — |
| E84 | Produto: wa.me oferece o portal | P | E78 |
| E85 | Produto: a noiva confirma pelo portal | M | E78 |
| E86 | Placar e docs | P | E83–E85 |

Critério de corte mantido: sem API externa. Depois desta rodada, o que resta
de grande dentro da restrição é pouco — paginação das listagens de gestão e
aposentar as rotas planas legadas são candidatos naturais de uma rodada 5 de
polimento.
