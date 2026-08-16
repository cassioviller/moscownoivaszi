# As sobras que o lote das 27 fez nascer — plano

**2026-08-15, fim do dia.** A dona mandou fechar as 27 🔵 da ótica dos papéis; três
agentes em paralelo (E238 lote A · E239 lote B · E240 lote C) fecharam 26 delas (a S-O93 ficou, com a leitura feita), e
— como toda vez que se mede — abriram outras. Este plano recebe as novas na
ordem em que serão executadas, com o custo medido por quem as abriu. **A
tabela de Sobras do `EXECUCAO.md` da ótica dos papéis é a fila; este arquivo
é a ordem.** O lote B voltou (E239, `e9ecdc89`) com quatro sobras na faixa S-O130–S-O139 — uma delas, a S-O132, é a S-O93 pela segunda vez e foi fundida pelo integrador; as outras três estão na linha 6.

## A ordem, e por quê

| # | Sobra | O que é | Plano | Custo |
|---|---|---|---|---|
| 1 | ~~**S-O120**~~ 🟡 ✅ `3e6c0bac` (e a S-O144 🟡 em `6acecf85`, achada e fechada no caminho: o E2E não é portátil para duas lojas homônimas) | `quitarContas` (`financeiro.ts:332`) e o estorno do pagamento (`:578`) mudam `contas_pagar.status` **sem tranca nem CAS**. Só a UNIQUE de `pagamento_itens.conta_pagar_id` segura o pagamento duplo; o estorno concorrente ao pagamento não tem rede. Ficou visível quando o E238 tornou `contas_pagar` tabela quente | **A única com dinheiro em jogo — vai primeiro.** Cena de corrida CONSTRUÍDA (dois `quitarContas` da mesma conta ao mesmo tempo; um estorno concorrente ao pagamento) → vermelho literal → transação + `FOR UPDATE` nas linhas de `contas_pagar` + releitura do `status` sob a tranca, a disciplina do E171 — o mesmo molde que o E238 aplicou em `comissao_fechamentos`. Depois, a varredura de portas sai de `SEM_DISCIPLINA` para TRANCA nas duas | 1 commit |
| 2 | ~~**S-O140**~~ 🔵 ✅ `fd28a0b8` | O prazo próprio da confecção (E240) tem porta de `PATCH` e **nenhuma tela de edição** — a ficha só mostra | Botão "Alterar prazo" na ficha do ajuste, o mesmo diálogo da criação; E2E na cena da confecção | 1 commit |
| 3 | ~~**S-O143**~~ 🔵 ✅ `fd28a0b8` | O link sem validade cai em `CONVITE_TTL_MS` (7 dias) (`orcamentos.ts:1441`) e nenhum manual diz | Uma frase no manual da vendedora, célula `class="prazo"` anotada, a `varredura-manuais-prazos` a cobrar | mesmo commit do 2 |
| 4 | ~~**S-O121**~~ 🔵 ✅ `199cf3e7` | Reabrir um fechamento PARCIAL de comissão depois de o mês seguinte carimbar os contratos perde a absorção em série — **modelagem** | **Respondida pela dona em 15/08/2026: só o ÚLTIMO fechamento pode reabrir.** Uma guarda na porta de reabrir: 422 nomeado quando há fechamento posterior da mesma vendedora, dizendo qual reabrir antes | 1 commit |
| 5 | ~~**S-O122 · S-O123 · S-O142 · S-O141**~~ 🔵 ✅ `2ef44028` (e a S-O133 junto) | Refinos de varredura (a releitura aceita qualquer executor ≠ `db`; a conta por coluna não vê o predicado do índice parcial), `addDias`/`diaLocal` em duas casas (`disponibilidade.ts:177` × `financeiro-core/datas.ts:86`), e dois comentários que ainda dizem "72h" | Um lote de higiene, cada uma meia hora; o `addDias` some do servidor e vem do core | 1 commit |
| 6 | **S-O133 · S-O130 · S-O131** 🔵 (o lote B) | A régua da S-O118 lê `POST /contas-pagar` do `12-permissoes` como criação quando o spec só quer ouvir 403; seis specs (`15`, `33`, `32`, `41`, `62`, `40`) deixam rastro pela API sem hook; seis portas do cliente (`deleteLoja`, `deleteUsuario`, `deleteAtributo`, `deleteAtributoOpcao`, `updateComissaoRegra`, `listAuditoriaGlobal`) não têm tela | Na mesma régua do resto: **S-O133** é o detector ler o `expect(...).toBe(403)` ao lado do `.post` (higiene, entra no lote 5); **S-O130** é um `delete` por hook nos seis, e o E2E completo prova que o hook não derruba o vizinho — commit próprio, porque roda o E2E; **S-O131** espera decisão (gesto ou sair do spec) — dona | S-O133 no lote 5 · S-O130 1 commit · S-O131 decisão |
| 7 | **S-O93** 🔵 | Dois E2E simultâneos, cada um no seu banco — a receita existe (`banco-virgem.ts`), o placar não; o E239 nomeou os três sítios onde dois runs no MESMO banco se atropelam | Medição do integrador, em série com nada mais rodando: dois `playwright test` com `createdb` + `push` + seed próprios e portas 5099/5173 e 5299/5373; o placar dos dois contra os 180 em série | 1 medição, sem código |

**O que este plano NÃO faz:** reabrir sobras já riscadas, e escrever antes de medir
— cada linha acima começa por contar (`git ls-files`, um `SELECT`, a cena
que reprova) e a estimativa muda com o número, como sempre mudou.
