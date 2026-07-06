# Spec S6 — Comissão das vendedoras (faixas · acumulado ao vivo · fechamento)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> Fecha a cadeia comercial→financeira: cada **contrato fechado** soma ao acumulado do mês
> da vendedora; **faixas configuráveis** definem o %/bônus; no **fechamento** (dia 01,
> manual) cada vendedora vira **uma `ContaPagar` tipo COMISSAO** — que a S5 já sabe pagar
> junto do salário. Tem **migração**. **Não** mexe na jornada nem no fluxo de pagamento.
> Depende de **S3 (contrato persistido)** + **S5 (conta a pagar)** — ambas prontas.

---

## 1. Problema

A `vendedoraId` já flui do orçamento ao contrato (S2/S3), e o lado **a pagar** já existe
(S5) com o tipo `COMISSAO` no enum e o gancho `origemComissaoFechamentoId`. Falta o
**motor**: medir o acumulado mensal de vendas de cada vendedora, aplicar faixas
configuráveis, mostrar o valor **ao vivo** durante o mês e, no fechamento, **gerar a
conta a pagar** de comissão. Sem isso, a vendedora não enxerga o que vai receber e o
gerente não tem o número para pagar.

## 2. O que existe hoje (e a spec usa)

- **`Contrato`** (S3): `vendedoraId`, `valorTotal` (**já líquido** — `criarContratoDoOrcamento`
  grava `calcularTotais(itens, descontoTipo, descontoValor).total`), `status` (`ATIVO|CANCELADO`),
  `fechadoEm` (data da venda → **competência** `YYYY-MM`).
- **`ContaPagar`** (S5): `tipo COMISSAO`, `colaboradorId`, `competencia`, `valorPrevisto`,
  `vencimento`, `origemComissaoFechamentoId` (rastro — preenchido aqui).
- **Pagamento** (S5): o "Pagar colaborador" já agrupa salário+comissão num pagamento só;
  `resumoPorCompetencia` já soma salário+comissão. **Nada disso muda** — a S6 só **cria**
  as contas `COMISSAO`.
- **Permissões** (`src/lib/permissoes/modulos.ts`): `MODULOS` é a fonte da verdade do shape
  (code-driven, fail-closed). Hoje o Financeiro usa o gate **provisório** `leads`.
- `src/lib/dinheiro.ts` (centavos), `src/lib/financeiro/datas.ts` (fuso), `tenantPrisma`.

## 3. Princípio: acumulado mensal + faixa retroativa

- **Gatilho:** comissão nasce do **contrato fechado** (não há "lançar comissão" à mão).
- **Base:** soma do `valorTotal` dos contratos **ATIVO** da vendedora na **competência**
  (`YYYY-MM` de `fechadoEm`). Líquido, porque `valorTotal` já tem o desconto aplicado.
- **Faixa retroativa:** a faixa em que o **acumulado final** cai manda no **mês inteiro**
  (ex.: 3% até 30k, 5% até 60k; fechou 50k → **5% sobre os 50k**).
- **Obrigação ≠ quitação** continua: a comissão é uma **previsão** (`ContaPagar`); o
  pagamento real (e o ajuste de centavos) é da S5.

## 4. Escopo

**Dentro:**
- **Migração:** `ComissaoRegra`, `ComissaoFaixa`, `ComissaoFechamento` (+ relações inversas
  em `Loja`/`Usuario`; `ContaPagar`↔`ComissaoFechamento`). Marca de reconciliação em
  `Contrato` (`comissaoEstornadaEm`) p/ o ajuste de cancelamento (§6.4).
- **Motor de cálculo** (puro, testável): resolve a regra vigente, aplica faixas
  (retroativo + bônus), calcula o acumulado por vendedora/competência. Ver §6.
- **Preview ao vivo** (não grava) + **fechamento idempotente** (grava `ComissaoFechamento`
  + `ContaPagar COMISSAO`).
- **Data layer** + **telas:** `/financeiro/comissoes` (ranking + acumulado + histórico),
  regras por vendedora, e o acumulado no perfil da vendedora (Equipe).
- **Permissão `financeiro`** (módulo dedicado) **substituindo** o gate `leads` em
  receber/pagar/comissões (decisão do dono; §9).

**Fora (YAGNI / outras fatias):**
- **Fechamento automático** (cron dia 01) → começa **manual** ("Fechar mês"); agendar depois.
- **Fluxo de caixa consolidado** → S7.
- Metas/dashboards de vendas além do ranking de comissão.
- Reabrir competência fechada → **não**; cancelamento vira **ajuste na seguinte** (§6.4).
- Comissão por item/produto, split entre vendedoras, override manual de valor de comissão.

## 5. Migração (schema)

```prisma
model ComissaoRegra {
  id                 String   @id @default(cuid())
  lojaId             String
  vendedoraId        String
  vigenciaInicio     DateTime           // versionada: a regra vigente numa competência
  bonusAcumulaFaixas Boolean  @default(false)  // soma bônus de cada faixa atingida × só a final
  ativo              Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  loja      Loja            @relation(...)
  vendedora Usuario         @relation(...)
  faixas    ComissaoFaixa[]
}

model ComissaoFaixa {
  id           String   @id @default(cuid())
  lojaId       String   // carimbo p/ tenantPrisma
  regraId      String
  minAcumulado Decimal  @db.Decimal(10, 2)   // borda inferior INCLUSIVA
  maxAcumulado Decimal? @db.Decimal(10, 2)   // null = aberta no topo; borda superior EXCLUSIVA
  percentual   Decimal? @db.Decimal(5, 2)    // % opcional (ex.: 5.00)
  bonusFixo    Decimal? @db.Decimal(10, 2)   // bônus opcional (ambos podem coexistir; ao menos 1)

  loja  Loja          @relation(...)
  regra ComissaoRegra @relation(..., onDelete: Cascade)
}

model ComissaoFechamento {
  id                 String   @id @default(cuid())
  lojaId             String
  vendedoraId        String
  competencia        String              // "YYYY-MM"
  totalVendas        Decimal  @db.Decimal(10, 2)  // base líquida acumulada (já com estorno do §6.4)
  percentualAplicado Decimal? @db.Decimal(5, 2)
  valorComissao      Decimal  @db.Decimal(10, 2)
  valorBonus         Decimal  @db.Decimal(10, 2)
  valorTotal         Decimal  @db.Decimal(10, 2)  // = comissão + bônus (≥ 0)
  contaPagarId       String?  @unique             // a ContaPagar COMISSAO gerada
  fechadoEm          DateTime @default(now())

  loja       Loja        @relation(...)
  vendedora  Usuario     @relation(...)
  contaPagar ContaPagar? @relation(...)
  @@unique([lojaId, vendedoraId, competencia])    // idempotência do fechamento
}
```

> **`Contrato`** ganha `comissaoEstornadaEm DateTime?` (null = ainda não reconciliado; §6.4).
> `ContaPagar` ganha a relação inversa `comissaoFechamento ComissaoFechamento?`.
> Aditiva. `ComissaoRegra`, `ComissaoFaixa`, `ComissaoFechamento` em `TENANT_MODELS`.
> Operação de banco = **requer confirmação** antes de `prisma migrate` (+ **reiniciar dev**).

## 6. Motor de cálculo (`src/lib/financeiro/comissao.ts` — novo)

### 6.1 Resolução da regra
- `regraVigente(lojaId, vendedoraId, competencia)` — a `ComissaoRegra` **ativa** com
  `vigenciaInicio ≤ último dia da competência`, mais recente. Sem regra → comissão 0
  (sem faixa = sem %; o acumulado ainda aparece no ranking).

### 6.2 Acumulado
- `totalVendas(lojaId, vendedoraId, competencia)` = soma `Contrato.valorTotal` dos
  contratos **ATIVO** com `fechadoEm` na competência e `vendedoraId`. Centavos.

### 6.3 Aplicação das faixas (retroativo + bônus + borda)
- Faixa que contém o acumulado: `minAcumulado ≤ total < maxAcumulado` (min **inclusivo**,
  max **exclusivo**; `maxAcumulado` null = topo aberto). Borda exata (total = max de uma
  faixa) cai na **faixa seguinte**.
- **% retroativo:** `valorComissao = total × (faixaFinal.percentual ?? 0)`.
- **Bônus:** se `bonusAcumulaFaixas` → soma `bonusFixo` de **todas** as faixas atingidas
  (`minAcumulado ≤ total`); senão só o `bonusFixo` da faixa final. Faixas sem bônus contam 0.
- `valorTotal = valorComissao + valorBonus`.
- Casos-limite cobertos em teste: borda exata; faixa só-%; faixa só-bônus; acumulado 0;
  sem regra; topo aberto.

### 6.4 Cancelamento pós-fechamento → ajuste na competência seguinte
- **Mês fechado é imutável** (auditoria): cancelar um contrato de uma competência **já
  fechada** não reescreve aquele `ComissaoFechamento`.
- Em vez disso, no **próximo** `fecharCompetencia`, o motor desconta da `totalVendas` da
  vendedora o `valorTotal` dos contratos que: estão **CANCELADO**, tinham comissão numa
  competência **já fechada**, e ainda têm `comissaoEstornadaEm = null`. Esses contratos são
  **marcados** (`comissaoEstornadaEm = now()`) na transação do fechamento (não estornam 2x).
- `valorTotal` do fechamento nunca fica negativo: piso em **0**; o estorno não consumido
  (quando excede as vendas do mês) **permanece pendente** (contrato segue sem marca) p/
  abater no mês seguinte. Coberto por teste (estorno > vendas do mês → carrega).

### 6.5 Preview vs fechamento
- `previewComissao(lojaId, competencia)` — roda 6.2+6.3 **sem gravar**; alimenta ranking e
  perfil ao vivo. Inclui o ajuste pendente do §6.4 como linha informativa.
- `fecharCompetencia(lojaId, competencia)` — **idempotente** (`@@unique` vendedora×competência):
  numa `$transaction`, para cada vendedora com vendas/regra na competência cria
  `ComissaoFechamento` + `ContaPagar` (`tipo COMISSAO`, `colaboradorId = vendedoraId`,
  `competencia`, `valorPrevisto = valorTotal`, `vencimento` = dia 05 do mês seguinte à
  competência, `origemComissaoFechamentoId = fechamento.id`), aplica as marcas do §6.4.
  Pula vendedoras já fechadas. Recusa fechar a competência **corrente/futura** (só mês ≤
  anterior). Retorna `{ fechadas, valorTotal }`.

## 7. Data layer (`comissao.ts`)

```ts
// regras
definirRegra(lojaId, vendedoraId, { vigenciaInicio, bonusAcumulaFaixas, faixas: Faixa[] }): Resultado
listarRegras(lojaId): RegraView[]
removerRegra(lojaId, regraId): Resultado
// cálculo / leitura
previewComissao(lojaId, competencia): { vendedoraId; nome; totalVendas; percentual; comissao; bonus; total; estornoPendente }[]
comissaoDaVendedora(lojaId, vendedoraId, competencia): ResumoVendedora     // p/ o perfil
// fechamento
fecharCompetencia(lojaId, competencia): { ok; fechadas; valorTotal } | { ok:false; motivo }   // idempotente, transacional
listarFechamentos(lojaId, { competencia? }): FechamentoView[]              // histórico
```

- Tudo `tenantPrisma`; dinheiro em centavos via util; faixas validadas (intervalos sem
  sobreposição/buraco no salvamento; ao menos % ou bônus por faixa; `min < max`).
- `fecharCompetencia` é o coração transacional (espelha `registrarPagamento` da S5).

## 8. Telas

- **`/financeiro/comissoes`** (ranking): seletor de competência; tabela vendedora ·
  vendas · faixa/% · comissão · bônus · total, ordenada por total; cards de resumo
  (total a pagar em comissão · nº vendedoras); **Fechar mês** (competência anterior, com
  confirmação) + aviso se já fechada; link p/ o histórico de fechamentos. Ao vivo = preview.
- **Regras por vendedora** (`/financeiro/comissoes/regras`): por vendedora, lista de faixas
  (min/max/%/bônus) + toggle `bonusAcumulaFaixas` + vigência. Form de faixas com validação.
- **Perfil da vendedora** (Equipe): bloco "Sua comissão este mês" — vendas, faixa atual,
  previsão (preview), e o próximo degrau ("faltam R$ X para 5%").
- Sidebar **Financeiro** passa a 4 itens: Receber · Pagar · **Comissões** · Fluxo de caixa.
- Tom Concierge; bordô só na ação principal (Fechar mês) e no degrau atingido.

## 9. Permissão — módulo `financeiro` (decisão do dono)

- Adicionar `"financeiro"` a `MODULOS` (e `MODULOS_VISIVEIS`) em `permissoes/modulos.ts`.
  Shape code-driven, **fail-closed**: perfis sem o módulo perdem acesso (é a intenção —
  dado sensível).
- **Substituir** o gate provisório `leads` por `financeiro` nos guards de
  `/financeiro/receber`, `/financeiro/pagar` (+ folha) e `/financeiro/comissoes`, e na
  flag da sidebar (`nav-items.ts` — remover o TODO; `layout.tsx` resolve `financeiro:ver`).
- **Templates/seed:** conceder `financeiro` ao perfil **Admin** (já é total) e ao template
  da **Gerente**; **não** conceder a Vendedora/Recepção por padrão (admin libera caso a
  caso na grade). Migração de dados dos perfis existentes: a normalização já preenche
  `financeiro:false` (fail-closed) — confirmar que nenhum perfil perde acesso indevidamente
  no ambiente do dono.
- Avaliar `comissao` como módulo à parte = **fora** (um módulo `financeiro` basta nesta fatia).

## 10. Decisões confirmadas (dono, 2026-06-03)

1. **Base = valor líquido** → comissão sobre `Contrato.valorTotal` (já com desconto). Soma só `ATIVO`.
2. **Cancelamento pós-fechamento = ajuste na competência seguinte** → mês fechado imutável;
   estorno abate no próximo fechamento, com carry se exceder (§6.4).
3. **Permissão = criar módulo `financeiro` agora** → substitui `leads` em receber/pagar/comissões (§9).
4. **Fechamento = manual** ("Fechar mês", idempotente) → cron automático fica p/ depois.
5. **Borda da faixa** (não perguntado): min inclusivo, max exclusivo — *recomendo* (padrão).

## 11. Testes

- **Motor** (`comissao.test.ts`, puro): faixas retroativas (50k → faixa de 60k); borda exata
  (30k → faixa de cima); faixa só-%, faixa só-bônus, faixa com os dois; `bonusAcumulaFaixas`
  on/off; sem regra → comissão 0 mas acumulado certo; topo aberto.
- **Acumulado/fechamento** (integração): `totalVendas` soma só ATIVO da competência e isola
  loja; `fecharCompetencia` gera 1 `ComissaoFechamento` + 1 `ContaPagar COMISSAO` por
  vendedora, com `origemComissaoFechamentoId`/`vencimento` certos, e é **idempotente** (2× não
  duplica); recusa competência corrente/futura.
- **Cancelamento** (§6.4): contrato cancelado após fechar X é descontado em X+1 e marcado;
  não estorna 2×; estorno > vendas do mês → `valorTotal` piso 0 e carrega p/ X+2.
- **Integração S5:** a `ContaPagar COMISSAO` gerada aparece em `resumoPorCompetencia` e é
  paga junto do salário no "Pagar colaborador" (sem mudança na S5).
- **Permissão:** quem não tem `financeiro:ver` é barrado em receber/pagar/comissões.

## 12. Plano (fatias finas, commit na `main`)

1. Migração (3 models + `comissaoEstornadaEm` + relação ContaPagar) + `prisma generate` +
   tenant (após confirmação; **reiniciar dev**).
2. Motor de cálculo puro (`comissao.ts`: regra/faixas/retroativo/bônus/borda) **+ testes** (TDD).
3. Acumulado + `previewComissao` + `comissaoDaVendedora` + `listarFechamentos` **+ testes**.
4. `fecharCompetencia` (transacional, idempotente, gera ContaPagar) + cancelamento §6.4 **+ testes**.
5. Módulo de permissão `financeiro` (MODULOS + guards receber/pagar/comissões + sidebar + seed).
6. Telas: ranking/Fechar mês + regras por vendedora + bloco no perfil + Server Actions.
7. Verificação ponta a ponta (regra → vendas → preview ao vivo → fechar → conta a pagar →
   pagar junto do salário → cancelar contrato → ajuste no mês seguinte) e gates verdes.

## 13. Riscos

- **Ajuste de cancelamento (§6.4)** é o ponto mais delicado: imutabilidade do mês fechado +
  carry do estorno. Modelar com marca em `Contrato` e cobrir o carry em teste. **Maior risco.**
- **Idempotência do fechamento:** `@@unique` vendedora×competência + transação (aprendido na S5).
- **Permissão fail-closed:** trocar `leads`→`financeiro` pode trancar quem via o Financeiro;
  confirmar templates/seed no ambiente do dono antes de mergear.
- **Regra versionada:** `regraVigente` por competência — cuidado com fuso na borda do mês.
- **Migração** em banco com dados (aditiva; confirmar ambiente; reiniciar dev).

## 14. Definição de pronto

A vendedora vê sua comissão **acumular ao vivo** (ranking + perfil) conforme fecha contratos;
o gerente configura **faixas por vendedora**, **fecha o mês** (idempotente) gerando **uma
conta a pagar de comissão por vendedora**, que é **paga junto do salário** (S5) e some no
**resumo por competência** para a contabilidade; cancelar um contrato após o fechamento
**ajusta o mês seguinte** sem reescrever o passado; o Financeiro passa a ter **permissão
própria**; motor e fechamento cobertos por testes; gates verdes.
```
