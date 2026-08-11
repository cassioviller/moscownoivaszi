# Ângulo 11 — consertos-de-hoje

**Rodada 2, base 89b38c8** · localizador + cético por achado

Três achados sobreviveram ao cético; nenhum foi refutado. Os dois primeiros são
a mesma forma — a janela leitura→escrita que a S-M7 fechou hoje no POST
/contratos — nascida de novo nas guardas escritas hoje, e os dois já estão
enumerados na varredura aberta S-M18. O terceiro é a tela que o conserto da
S-M4 esqueceu.

## Sobreviventes

### 1. 🟡 O DELETE de cabine da S-M1 nasceu hoje com a guarda fora da transação — a forma exata que a S-M7 fechou no mesmo dia

**Âncora:** `artifacts/api-server/src/routes/agenda.ts:268` · **enumera a sobra S-M18**

```ts
const [agenda] = await db.select({ n: count() }).from(atendimentosTable)
  .where(and(eq(atendimentosTable.cabineId, cabineId), ...));
if (agenda!.n > 0) { res.status(409)... }
...
await db.transaction(async (tx) => {
  await registrarAuditoria(tx, {... acao: "CABINE_REMOVIDA" ...});
  await tx.delete(cabinesTable)...
});
```

**Mecanismo.** A contagem que sustenta o 409 `CABINE_COM_AGENDA` roda no pool
global, FORA da transação que apaga (`agenda.ts:268` vs `:278–290`), sem
`FOR UPDATE` na linha da cabine. Em READ COMMITTED: o DELETE lê n=0; um
POST /atendimentos concorrente na mesma cabine commita na janela; o
`tx.delete` cascateia o atendimento recém-criado (`atendimentos.cabine_id` é
`ON DELETE CASCADE`) e responde 204. É a mesma janela leitura→escrita que o
commit `75882f0` (S-M7) fechou hoje no POST /contratos com `FOR UPDATE` +
reconferência como statement novo — o INSERT de atendimento toma
`FOR KEY SHARE` na linha da cabine, então a tranca fecharia. Bônus da mesma
forma: dois DELETEs simultâneos passam ambos pelo 404 e gravam DUAS linhas
`CABINE_REMOVIDA` para uma remoção, os dois com 204.

**Consequência.** A prova marcada da noiva some da agenda sem aviso e sem
rastro próprio — a trilha registra só `CABINE_REMOVIDA`; a fila de costura
pendurada no atendimento desce pelo segundo CASCADE. Gatilho raro (janela de
ms numa rota que a tela nem chama), mas o estrago é o mesmo irrecuperável que
fez a S-M1 ser 🔴. É o sítio enumerado da varredura S-M18.

**Veredito do cético — 🟡 confirmado.** Lido no run: `agenda.ts:268–276` conta
a agenda no pool e a transação (`:278–290`) apaga sem reconferir nem trancar —
e `lib/db/src/schema/atendimentos.ts:82` confirma `onDelete: "cascade"` em
`cabine_id`, então um POST /atendimentos (`agenda.ts:369`, insert sem
transação) que commite na janela é cascateado em silêncio. Não há guarda
noutra camada (o `FOR KEY SHARE` do FK só vale durante a transação do insert)
e não é duplicata: S-M1/`3f21fa7` CRIOU esta guarda, o achado é o TOCTOU dela —
sítio legítimo da varredura aberta S-M18. O bônus também confere: o
`tx.delete` de `:289` não confere linhas afetadas, dois DELETEs simultâneos
gravam duas auditorias `CABINE_REMOVIDA` com 204. Estrago irrecuperável,
janela de milissegundos numa rota destrutiva rara.

### 2. 🟡 O AJUSTE_COBRADO da S-M16 é check-then-write sem tranca: a corrida deixa a cobrança apontando o nada — o exato caso que o 409 diz impedir

**Âncora:** `artifacts/api-server/src/routes/agenda.ts:860` · **enumera a sobra S-M18**

```ts
const [cobrancas] = await db.select({ n: count() }).from(orcamentoItensTable)
  .where(eq(orcamentoItensTable.ajusteId, ajusteId));
if (cobrancas!.n > 0) {
  res.status(409).json({ error: "AJUSTE_COBRADO",
    detalhe: "...ou o valor cobrado ficaria apontando o nada." });
  ...
}
await db.transaction(async (tx) => { ... await tx.delete(ajustesTable)... });
```

**Mecanismo.** A contagem de cobranças roda fora da transação do delete
(`agenda.ts:860` vs `:869–880`) e o POST /orcamentos/:orcamentoId/itens
insere o item AJUSTE após leituras puras, sem tranca comum. Corrida: DELETE
lê n=0; o POST do item commita na janela; o `tx.delete` apaga o ajuste e
`orcamento_itens.ajuste_id` é set null (`schema/orcamentos.ts:64`) — a
cobrança fica órfã em silêncio, que é literalmente a frase do detalhe do 409
escrito hoje. Na ordem inversa o POST leva 23503→409 `VINCULO_EXISTENTE`
genérico, que é seguro mas mente a causa. O conserto é o da S-M7 do mesmo
dia: tranca na linha do ajuste dentro da transação e reconferência como
statement novo.

**Consequência.** Um orçamento com item de R$ 150,00 (o valor do próprio
teste da S-M16) cobrando um trabalho que ninguém mais costura — o invariante
do E155 ("o que foi cobrado e o que alguém costura são a mesma coisa") quebra
pela janela de ms que a guarda nova deveria fechar. Sítio enumerado da
varredura S-M18.

**Veredito do cético — 🟡 confirmado.** Confirmado nas âncoras lidas neste
run: `agenda.ts:860` conta cobranças fora da transação (tx só abre em `:869`)
e o POST de itens (`orcamentos.ts:470`) insere após leituras puras sem
tranca — na janela, o `tx.delete` apaga o ajuste e a FK `onDelete: "set null"`
(`lib/db/src/schema/orcamentos.ts:64`) anula `ajuste_id` em silêncio, deixando
a cobrança de R$ 150,00 órfã, o exato estado que o 409 `AJUSTE_COBRADO` diz
impedir. Nenhuma guarda em outra camada: a FK é set null de propósito (E155),
sem trigger nem lock. Não é duplicata da S-M16 (que criou a guarda hoje) — é
defeito da guarda, sítio legítimo da varredura S-M18. Correção menor do
cético ao localizador: o insert é `orcamentos.ts:470`, não `:362`.

### 3. 🔵 A S-M4 trocou a frase em duas das três telas: a página de projeção — destino do link do sino — ainda diz "fica negativo em" sobre o vermelho de hoje

**Âncora:** `artifacts/moscow-noivas/src/pages/financeiro/projecao.tsx:329` · sem sobra a enumerar

```tsx
{curva.diaNegativo ? (<> Caixa fica{" "}
  <span className="font-semibold text-destructive">
    negativo em {diaMesLongo(curva.diaNegativo)}
  </span>.</>) : ...}
```

**Mecanismo.** O `7d2a6cd` fixa `diaNegativo=hoje` quando o saldo de partida
é negativo (`projecao.ts:115`) e, pelo próprio argumento do commit ("frase
falsa sobre um fato presente"), trocou o título em `alerta-caixa.tsx:117` e
`sino-notificacoes.tsx:121` para "O caixa já está negativo". A terceira
consumidora do mesmo campo ficou de fora: `projecao.tsx:325–331` segue
interpolando a data. O sino aponta href `.../financeiro/projecao` — a dona
clica em "O caixa já está negativo" e aterrissa numa página dizendo "Caixa
fica negativo em 10 de agosto". De quebra, o destaque de primeiro-negativo da
lista (`projecao.tsx:424`, `ehPrimeiroNegativo = l.dia === diaNegativo`)
nunca acende nesse caso: com `diaNegativo=hoje` e nenhum evento datado de
hoje, nenhuma linha da curva casa.

**Consequência.** Contradição visível no clique seguinte ao alerta novo: loja
R$ 2.000,00 negativa hoje lê o fato presente como previsão futura na tela
mais detalhada do caixa, e o marcador de "primeiro dia negativo" da curva não
aparece. Custo de conserto: o mesmo ternário `jaNegativo` já escrito nas duas
irmãs.

**Veredito do cético — 🔵 confirmado.** Confirmado com âncoras lidas neste
run: `projecao.tsx:325–331` interpola "negativo em
{diaMesLongo(curva.diaNegativo)}" e a página monta a curva via
`projetarCaixa` (`projecao.tsx:117–119`), que desde `7d2a6cd` fixa
`diaNegativo=hoje` quando o saldo de partida é negativo — a frase vira "fica
negativo em" sobre o vermelho de hoje. O `--stat` de `7d2a6cd` prova que o
conserto tocou só `alerta-caixa.tsx`, `sino-notificacoes.tsx` e
`projecao.ts`: esta terceira consumidora ficou de fora, então não é
duplicata. O sino aponta para /financeiro/projecao
(`sino-notificacoes.tsx:125`), materializando a contradição no clique
seguinte; e `ehPrimeiroNegativo = l.dia === diaNegativo` (CurvaLista) de fato
nunca acende quando não há evento datado de hoje. Nenhuma guarda noutra
camada — é texto de UI. 🔵 correto: sem perda de dinheiro ou de dado, e o
conserto é o mesmo ternário já escrito nas duas telas irmãs.

## Refutados

Nenhum. Os três achados do localizador passaram pelo cético e os três
sobreviveram com a severidade confirmada.

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | — |

## Cobertura

**Teto de 10 NÃO atingido: 3 achados verdadeiros, nada cortado.**

Conferido e LIMPO pelo localizador (para o cético não gastar bala):

1. **Deadlock da tranca nova da S-M7** — só há dois sítios de `FOR UPDATE` no
   app (`contratos.ts:539`, `admin.ts:177`); o de contratos tranca bloqueios
   em ordem ORDENADA e o de admin só apaga loja VAZIA (409 antes de tocar
   filho), então não existe parceiro de ordem inversa; a reconferência espelha
   exatamente a guarda de cima (mesmo predicado ATIVO).
2. **23505 do unique novo da S-M8** não sai cru: o handler global
   (`erros.ts:191`) mapeia para 409 `REGISTRO_DUPLICADO` — o perdedor da
   corrida vê a frase genérica em vez de `CONFECCAO_JA_VIROU_PECA`, mas a
   retentativa cai na guarda amigável; cosmético, abaixo de achado.
3. **S-M12:** `UpdateOrcamentoItemBody` (`api.ts:5199`) não aceita
   `vestidoId` — o POST é mesmo a única porta; nono sítio de criar×editar NÃO
   é.
4. **S-M14:** só existiam os dois sítios de `ILIKE` (`busca-lead.ts:29`,
   `leads.ts:107`), ambos na régua nova; o `LIKE` do WhatsApp opera sobre
   `replace(/\D/g,'')` e não aceita curinga.
5. **89b38c8:** E2E roda a API em :5099 e o preview em :5000 —
   `reuseExistingServer` não cruza os bancos; o opt-out `APP_DATABASE_NAME=`
   do `playwright.config.ts:57` está no lugar.
6. **S-M5:** testei os empates de cabeça-de-arquivo no código lido — o
   arquivo de vírgulas com `;` em TODAS as linhas ainda ganha por vírgula (o
   parse por `;` perde a célula de data e produz 0).
7. **Os quatro deletes novos** (cabine, ajuste, item-estoque, comissão-regra)
   repetem fielmente a forma dos cinco do E115 (conferi DELETE /atendimentos,
   `agenda.ts:499–543`: mesma leitura fora da transação) — ou seja, a
   varredura S-M18 deve cobrir a família INTEIRA, não só os sítios de hoje;
   os dois achados acima são os de hoje porque neles a janela toca
   cascata/set-null com estrago. Duplicata de auditoria no DELETE duplo (duas
   linhas `*_REMOVIDA`, dois 204) vale para os quatro — registrada aqui como
   sub-caso da mesma varredura, não como achado avulso.
