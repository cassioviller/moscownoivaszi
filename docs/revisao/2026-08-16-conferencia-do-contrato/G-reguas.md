# Lente 7 — as réguas novas medem o que dizem medir?

**2026-08-16** · agente de leitura pura (com quatro sub-leitores; cada achado deles relido no fonte) · base `main` · diff `cd990767..HEAD` = **129 arquivos de teste** (63 novos na API, 33 no frontend). Nenhuma suíte rodada.

## 🟡 protege parcialmente / por letra

1. **`varredura-teto-do-texto-livre.test.ts:59-90` só lê `components.schemas` com sufixo `Input|Update|Body` — o `requestBody` INLINE fica fora.** `openapi.yaml:4021` — `createParcelaAvulsa` → `descricao: { minLength: 1 }` sem `maxLength`; `api-zod/src/generated/api.ts:7985` `zod.string().min(1)`; a porta usa (`contratos.ts:3232`). A régua promete "todo texto livre tem teto" e conta 35; este é o 36º — 100 kB entram por ele. Conserto: percorrer `paths.*.requestBody…schema.properties`.
2. **`varredura-banco-virgem-cobre-as-migracoes.test.ts:129-141` — a "cobertura" é tabela declarativa `tabela → spec`; a régua confere que o spec existe, não que EXERCITA a tabela.** Conserto: exigir `.post` numa rota que insere na tabela (o mecanismo da `varredura-fixture-do-e2e`).
3. **`varredura-cabines-do-e2e.test.ts:30-31` — `CRIA` só vê `.post(…/cabines)` e `APAGA` só `apagarCabineCriada(`.** Três specs (`23:33`, `26:40`, `45:99`) criam por `db.insert(cabinesTable)` e apagam por `db.delete` — fora do retrato de 9 e da régua de limpeza. Conserto: os dois regexes ganham `insert(cabinesTable)`/`delete(cabinesTable)`, retrato 12.
4. **`varredura-dinheiro-datado-pela-parcela.test.ts:132-141` — o piso conta FONTES, não achados da peneira**; regex envelhecido → `[]` → verde. Conserto: `arrayContaining` dos que devem aparecer.
5. **`varredura-data-de-negocio-em-fixture.test.ts:48` — `ESCRITORES_DIRETOS` é lista curada de 2**; `52:54-59` faz `db.insert(leadsTable)` fora da régua. Conserto: derivar por `git ls-files` + `insert(leadsTable|reservasTable)`.
6. **`gesto-da-locacao-varredura.test.ts:55-56, 62, 139` (frontend) — régua de LETRA (`toContain("dataRetirada")`, `"localParaISO"`, `"instanteCurto"`).** O `import` já satisfaz; trocar `[id].tsx:492-493` por `new Date(...)` mantém verde. Conserto: pregar a CHAMADA (`toMatch(/dataRetirada:\s*localParaISO\(/)`), como o arquivo já faz em `:66-73`.
7. **`e213-mora-da-parcela-api.test.ts:301-310` — a cena "parcela CANCELADA não deve mora" nunca afirma nada**: `de: hojeLocal(), ate: hojeLocal()` contra vencimento `diasAtras(30)` → `achada` sempre `undefined`, o `if` não roda. Conserto: `de: diasAtras(31)` + `expect(achada).toBeDefined()`.

## 🔵

8. **Cenas de corrida por `sleep` sem prova de bloqueio** — `e238:104-108`, `so120:88-92/124-128`, `sc242:116-126`, `sc77:97-103` (e o padrão herdado). Nenhuma afirma que a resposta NÃO chegou antes do `COMMIT`; sob máquina carregada fica verde sem tranca. Conserto barato: `let chegou=false; respostaP.then(()=>chegou=true); … expect(chegou).toBe(false); await COMMIT`.
9. `varredura-datas-nao-aceitam-nulo.test.ts:41-48` só percorre `s.shape` de primeiro nível; `CreateContratoBody.parcelas[].vencimento` não é perguntada; o comentário `:73` diz "eram 31" onde o `S-C281.md:131` mediu 113.
10. **`e217-rescisao-api.test.ts:154,163` — bomba de calendário:** `dataRetirada` fixa `2027-12-01` contra `hoje` → a partir de **02/11/2027** `aplicou18a` vira `false` e o teste reprova sem defeito. Conserto: `ancoraDeNegocio(addDias(hojeLocal(), 60))`.
11. `varredura-campo-escalar-do-spec.test.ts:87-89` — `escrito()` é `\bcampo\b` no servidor inteiro, comentários inclusos (forma grossa declarada).
12. `varredura-manuais-prazos` prega só números: os DIAS VEDADOS da 17ª (`[5,6]`, `troca.ts:66`) estão em prosa nos manuais sem `data-regua`.
13. `varredura-das-varreduras.test.ts:19-27` — heurística (qualquer `toContain(` conta como "diz o tamanho"; enumera por NOME).
14. `varredura-enums-do-banco-no-spec.test.ts:159-166` — o "plantado" reencena a lógica no próprio teste, não chama a peneira.
15. Menores conferidos: `sc140:251-252` prega alias de SQL; `dataFutura(-n)` usado como "há n dias" em 8 sítios (inertes); `e221:335` título diz 404, assert 403; `e237:66` título promete portal, confere fila e carnê; `so18:61` e `revisao-reserva-avaria:23` medem `moscow_base`; `varredura-fixture-do-e2e.postEsperaRecusa` confunde `const r` reutilizado (0 specs afetados hoje); `varredura-expurgo-lgpd:194` aceita `coluna:` em comentário.

## Conferido e mede

`e220-instrumento` (efeito puro, 16 sentinelas, "nenhum número solto"); as quatro `varredura-manuais-*` (piso, plantado, dívida nas duas direções); `varredura-fixture-do-e2e`; `so74-gesto-da-tela-unit`; `varredura-portas-sob-tranca`/`portas-de-escrita` (retrato por igualdade, população por diferença, 20+ sintéticos); `escritas-de-rota`/`e186`; `varredura-schemas-aninhados`; `varredura-teto` (fora o inline), `-codegen-em-dia`, `-espaco-duro`, `-expurgo-lgpd`, `-restricoes-do-spec`, `-reguas`, `-enums-do-banco` (fora o plantado), `-campo-escalar`; `e239-teto`, `e240-prazo-proprio` + `ajustes-prazo` (S-O119 fechada), `so142`, `so121`, `s-c281`, `sc242`/`e238`/`so120`/`sc77` (invariante lido no BANCO), `s-c170`; os épicos e211–e235 (vermelhos dos relatórios batem com os asserts); as sobras s-c*, sc*, so*; frontend `vazio-silenciado`, `telas-que-rederivam`, e os `financeiro/*.test.ts`. Nenhuma varredura nova enumera por `find`/`readdirSync`; nenhum teste depende da hora sem âncora além do item 10.
