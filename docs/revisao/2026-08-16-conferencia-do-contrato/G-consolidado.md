# Conferência do código do contrato — consolidado

**2026-08-16** · sete agentes de leitura pura, em paralelo, ~1,4 M tokens · base `090cb5d2` · escopo: o que entrou entre `cd990767` (a véspera do E211, 13/08) e `HEAD` — **~10,4 mil linhas em 127 arquivos**, a trilha do contrato de papel inteira (E211–E240) e as sobras de 15–16/08, sem uma passada de revisão por cima desde a revisão `max` de 10/08.

Lentes: **A** dinheiro na fronteira · **B** portas e corridas · **C** a tela e o que ela lê · **D** o E2E que só passa porque o dev acumulou · **E** spec/codegen/schema/migração e datas · **F** o manual diz o que o sistema faz? · **G** as réguas medem o que dizem medir? Cada relatório está no arquivo da letra. Nenhum agente editou, commitou ou tocou no banco.

## O placar

| Sev. | Achados únicos | Onde |
|---|---|---|
| 🔴 | **0** | — |
| 🟠 | **7** | 3 de dinheiro (A1=C1, A2, A3) · 1 da 16ª (E1) · 3 de manual (F1, F2, F3) |
| 🟡 | **17** | A4=C2, A5=B2, B1, C3, C4, D1, D2, D3, F4, F5, G1–G7 |
| 🔵 | ~30 | B3–B8, C5–C12, D4–D11, E2–E4, F6–F8, G8–G15 |

**Duplicatas fundidas pelo integrador** (o mesmo achado com dois números, como na Faixa C): a devolução dupla da rescisão (A1 = C1), a mora "de hoje" contra o fato datado (A4 e C2 são a mesma raiz), a fresta da S-O121 (A5 = B2). Três agentes que não se falaram acharam a devolução dupla e a S-O121 — o formato que o METODO já nomeia como o de maior confiança.

## O que a conferência ensina, antes da fila

1. **O 🟠 mais caro está no cruzamento de dois épicos que passaram nas próprias réguas.** O E217 (rescisão) criou a conta a pagar `DEVOLUCAO`; o E228/`destinoPago: "estornar"` zera o recebido; nenhum dos dois olhou o outro, e o `e2e/63` **encena a cena** (LOJA + "Devolvi o valor") sem contar `contas_pagar`. Regra 22 na letra.
2. **O seed real fez o dito virar cobrado.** O E237 disse "mês sem número fica DITO"; o `bb03a0f7` (o cadastro real da loja) pôs 12 meses de IPCA de exemplo pelo mesmo caminho da instalação nova, e a 9ª cobra R$ 78,96 numa parcela de R$ 5.000,00 com números que ninguém publicou.
3. **A 16ª conta pela janela e o papel diz outra data** — a noiva devolve no dia que o instrumento manda e leva R$ 750,00. É decisão da dona (o papel ou a janela), e a recomendação é o papel.
4. **A S-O121, escrita ontem à noite, tem uma fresta que dois agentes acharam**: `FOR UPDATE` sobre "posteriores" não segura a linha que o fechar concorrente ainda vai inserir. O conserto é trancar a linha-alvo ANTES de ler — a mesma lição de sempre, na minha própria porta.
5. **As réguas novas medem** — 40+ conferidas e certas —, e as sete 🟡 da lente G são todas do mesmo tipo: **retrato que não vê a segunda forma** (o `requestBody` inline, o `db.insert(cabinesTable)`, a tabela declarativa que confere existência e não exercício).
6. **O E2E tem data marcada**: o `13` reprova no `heliumdb` em **15/10/2026** sem que uma linha mude (a fixture da reserva nunca é renovada), e os "4 skipped" da S-O93 são quatro testes que nunca rodaram num cliente novo.
7. **Os manuais envelheceram do jeito que o E184/E196 nomearam**: prosa por cima de célula pregada certa (a correção monetária "que o sistema não faz"), pendência listada depois do épico sair (o prazo próprio), passo a passo de diálogo cuja tela mudou (o "CPF da noiva").

## A fila que nasce — E241 a E248, e a ordem

Ordenada como a trilha do contrato: **dinheiro primeiro, depois a porta ao lado, depois cobertura, depois documentação.** Cada épico começa por contar (a cena que reprova, o `SELECT`), e o custo muda com o número.

| Épico | Tese | Fecha | Custo |
|---|---|---|---|
| ~~**E241**~~ ✅ `e9231ce1` | A rescisão devolve UMA vez: sob `estornar` a conta a pagar não nasce (o dinheiro já voltou pelo estorno), e o E2E 63 conta `contas_pagar` | A1=C1 🟠 | 1 commit |
| ~~**E242**~~ ✅ `3029efba` | O seed real não inventa índice: os 12 meses de exemplo saem do caminho da instalação nova (ficam na demo/E2E por env, ou como `IPCA-EXEMPLO` que `ipcaDaLoja` não lê); Índices gateia por `financeiro.editar` e `gravar` entra no regex da `s36` | A2 🟠, C4, C7 | 1 commit |
| ~~**E243**~~ ✅ `c4e152b1` | A mora é do dia do FATO: descrição/trilha da linha `MORA` e a sugestão/teto do `/receber` calculam em `recebidoEm`; a conciliação deriva a mora do recibo (respeita o corte do estorno); a tela diz "multa, juros e correção" onde o número inclui a correção; a data do recibo é `instanteDia`/`dataBRInstante` | A3 🟠, A4=C2, C3, C6 | 1 commit |
| ~~**E244**~~ ✅ `d880b43a` | A 16ª conta pelo que o papel manda: `fimPrevistoDaDevolucao` = `dataDevolucao` do contrato quando existe, senão a janela — uma função nos três sítios; `prazoDias` da cobrança de atraso ganha campo; o prazo vazio não vira 0 | E1 🟠 (**decisão da dona: papel ou janela**), C5, C10 | 1 commit |
| **E245** | As portas ao lado: a cobrança de atraso do E212 tranca o contrato como a avaria; o reabrir da S-O121 tranca a linha-alvo antes de ler os posteriores; o CAS do receber repete `mora_perdoada_em` e o do perdão repete `status`; o carimbo derivado exige `recebidoEm`; o `PATCH /bloqueios` repete `cancelado_em IS NULL`; a rescisão e a qualificação releem o registro inteiro sob a tranca; a ordem implícita do `PATCH /reservas` fica declarada | B1, A5=B2, B3, B4, B5, B6, B8 | 1–2 commits |
| **E246** | O E2E para de depender do dev: a fixture da reserva renovada a cada run e o `13` pelo `href`; o `07` pela busca; contrato próprio no `08` e no `15` (os 4 skipped viram medidos); o `16` num ramo só; a competência do `36` em SP; hook para o rastro por tela (`04`, `05`, `51`) e as recorrências do `34`; a data do `52` derivada de hoje | D1, D2, D3, D4, D6, D7, D8, D9 | 1 commit + E2E |
| **E247** | As réguas veem a segunda forma: `requestBody` inline no teto do texto livre; a cobertura do banco virgem exige exercício; cabines por `db.insert`; piso pelas fontes esperadas; escritores diretos por `git ls-files`; a régua de gesto prega a CHAMADA; a cena da parcela CANCELADA afirma; a bomba de calendário do `e217` (02/11/2027) desarmada; as cenas de corrida provam que a rota ESPEROU | G1–G7, G8, G10 | 1 commit |
| **E248** | Os manuais dizem o que o sistema faz: o diálogo do fecho sem "CPF da noiva" (e o recado da qualificação em "Quando o sistema diz não"), a correção pelo IPCA na prosa da vendedora, o prazo próprio fora das pendências (e o resumo das oito), a qualificação na ficha para vendedora e recepção, o reabrir do último para o primeiro, "O que ele não faz" reenquadrado, os dois recados do caixa a pagar, apagar opção/atributo | F1–F8 | 1 commit + PDFs |
| higiene 🔵 | `docs/migracoes` do E217; âncora da `DEVOLUCAO` = `ancoraDeNegocio`; ponteiro de `ACOES_AUDITORIA` no spec; UF criar×editar; o `detalhe` do 409 do console (a contagem que a porta devolve); a constante 630/1140 copiada em `config.tsx`; erro-vira-silêncio na fila de atrasos e na locação da ficha; o comentário da comissão em `reservas.ts:600`; cache da fila de atrasos com geração; `varredura-datas-nao-aceitam-nulo` aninhado; dias vedados da 17ª com `data-regua` | B7, C8, C9, C11, C12, E2, E3, E4, G9, G11–G15, A6, A7 | lote |

**Duas decisões da dona**, e nenhuma trava a fila: (1) **E244** — a 16ª cobra pelo papel (recomendado: é o que a noiva assinou) ou pela janela; (2) **E241** — sob `estornar` a conta não nasce (recomendado) ou o rádio "estornar" some quando a iniciativa é da loja.

## Como se rodou

Sete `Agent` de leitura pura em paralelo com um E2E medindo em série (as lentes só leem; a G rodou varreduras de leitura de código, sem banco). ~1,4 M tokens, 33 a 138 chamadas de ferramenta por lente, 5 a 12 min cada. Sem worktree, sem banco próprio, sem colisão de numeração — porque nada foi escrito.
