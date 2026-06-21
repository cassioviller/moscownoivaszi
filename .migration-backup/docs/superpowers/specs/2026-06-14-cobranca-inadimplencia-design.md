# Spec — Cobrança / inadimplência (aging + registro de cobrança + WhatsApp)

> **Fatia 2 de 3** melhorias do financeiro escolhidas pelo dono (2026-06-14):
> (1) Projeção de caixa [feita], (2) **Cobrança/inadimplência** [esta], (3) DRE por categoria.
> Ajuda o atelier a **ver** quem está em atraso (aging por faixa), **agir** (abrir o WhatsApp
> da noiva com mensagem pronta — sem API) e **registrar** a cobrança feita (histórico por noiva).
> Cada fatia tem sua própria spec → plano → implementação.

---

## 1. Problema

O atelier registra os recebíveis (parcelas do contrato) e já sabe quais estão **atrasadas**
(`ehAtrasada` = `PREVISTA` com `vencimento < hoje`), mas não tem uma visão de **inadimplência**:
quem está devendo, **há quanto tempo** (aging 0–30 / 31–60 / 60+), nem um lugar para **acompanhar
a cobrança** (já falei com a noiva? o que ela respondeu?). Hoje a vendedora abre o WhatsApp na mão
e não fica rastro nenhum. Falta a régua de cobrança — gentil, no tom Concierge.

## 2. O que já existe (e a spec reusa, sem alterar)

- **Recebível** = `Parcela` (S4): `valorPrevisto`, `vencimento`, `status` (`PREVISTA`/`PAGA`),
  ligada a `Contrato → Lead`. Atraso derivado por `ehAtrasada(status, vencimento, hoje)`
  (`@/lib/financeiro/obrigacao`). `resumoReceber(lojaId).emAtraso` já soma os vencidos.
  `FiltroReceber` já tem `"atrasadas"` em `listarContasAReceber`.
- **Noiva** = `Lead`: tem `noivaNome` e **`whatsapp` (String?)**. **Não há e-mail** nem qualquer
  infra de mensageria (sem Twilio/WhatsApp API/SMTP) — o projeto é manual por filosofia.
- `@/lib/dinheiro` (centavos), `@/lib/tempo` (`hojeUTC`, `ymd`, `meiaNoiteUTC`), `tenantPrisma`,
  gates `financeiro:ver`/`financeiro:editar` (`exigirAcesso`/`acaoAutorizada`), helpers de form
  (`str`/`comAviso`), `AvisoFlash`.

## 3. Princípios

1. **Cobrança é manual, o sistema é o copiloto.** Sem envio automático. O sistema **mostra**
   o atraso, **abre** o WhatsApp (link `wa.me`, zero integração/custo) e **guarda** o que você
   registrou ter feito. Coerente com o resto do financeiro (ex.: salário é previsão digitada).
2. **Cobrança por noiva, não por parcela.** Você cobra a pessoa, que pode dever várias parcelas.
   O histórico é da noiva.
3. **Atraso é derivado, nunca gravado.** Reusa `ehAtrasada`/`Parcela`. A mesma fonte da Projeção
   e do `resumoReceber`. Não duplica a definição de "atrasada".
4. **Tom Concierge.** Cuidado, não régua agressiva. Bordô só na faixa 60+ e na ação principal.
   Microcopy gentil. Sem juros/multa, sem vermelho de alarme.
5. **Centavos, sem float. Dia = meia-noite UTC de SP. Multi-tenant fechado.**

## 4. Decisões travadas no brainstorming (2026-06-14)

| Pergunta | Decisão |
|---|---|
| Escopo | **Aging + registrar cobrança + abrir WhatsApp** (não só visão; não envio automático). |
| Granularidade do registro | **Por noiva** (`leadId`), cobrindo a dívida dela no momento. |
| Canal de contato | `wa.me` (link), sem API. Registro guarda o canal usado. |
| Faixas de aging | **1–30 / 31–60 / 60+** dias de atraso. |
| Template de mensagem | **Fixo**, gentil (sem config — YAGNI). |

## 5. Modelo de dados (1 tabela + 1 enum)

### `enum CobrancaCanal`
`WHATSAPP | TELEFONE | PRESENCIAL | OUTRO`.

### `RegistroCobranca` (em `TENANT_MODELS`)
O histórico de cobranças feitas a uma noiva.
- `id`, `lojaId`
- `leadId: String` — a noiva cobrada
- `data: DateTime` — dia da cobrança (meia-noite UTC; default hoje)
- `canal: CobrancaCanal`
- `observacao: String?` — texto livre (ex.: "prometeu pagar dia 15")
- `createdAt: DateTime @default(now())`
- Relações: `loja` (cascade), `lead` (cascade). Back-relations em `Loja` e `Lead`.
- Índice `[lojaId, leadId, data]` (para o histórico por noiva).

**Nada mais novo.** A inadimplência é derivada de `Parcela`.

## 6. Motor — `src/lib/financeiro/cobranca.ts` (novo)

Leituras Prisma na borda; helpers de classificação/formatação puros (testáveis).

### 6.1 `faixaDeAtraso` (pura)
```
type Faixa = "ate30" | "d31a60" | "mais60";
faixaDeAtraso(diasDeAtraso: number): Faixa
```
`1–30 → "ate30"`, `31–60 → "d31a60"`, `≥61 → "mais60"`. (Chamado só para `dias ≥ 1`; vencendo
hoje = 0 não é atraso e não entra no aging.)

### 6.2 `linkWhatsApp` (pura)
```
linkWhatsApp(whatsapp: string | null, mensagem: string): string | null
```
Remove não-dígitos de `whatsapp`; se vazio → `null`. Senão → `https://wa.me/55<digitos>?text=<encodeURIComponent(mensagem)>`.
(Assume DDI Brasil; o número guardado é nacional.) A mensagem-padrão é montada na tela com o nome
da noiva, tom gentil — ex.: *"Olá {nome}! Aqui é do atelier 💛 Passando com carinho para lembrar de uma parcela em aberto. Qualquer dúvida, estou à disposição."*

### 6.3 `agingDaLoja` (leitura)
```
type NoivaInadimplente = {
  leadId: string; noivaNome: string | null; whatsapp: string | null;
  totalVencido: string; qtdParcelas: number; diasMaisAntigo: number; faixaMaisAntiga: Faixa;
};
type FaixaResumo = { total: string; qtdNoivas: number };
type Aging = {
  faixas: { ate30: FaixaResumo; d31a60: FaixaResumo; mais60: FaixaResumo };
  noivas: NoivaInadimplente[]; // ordenado por diasMaisAntigo desc
};
agingDaLoja(lojaId: string): Promise<Aging>
```
- Lê `Parcela` `status=PREVISTA` com `vencimento < hoje`, `include contrato.lead` (noivaNome, whatsapp, leadId).
- Agrupa por `leadId`: soma `totalVencido` (centavos), conta parcelas, `diasMaisAntigo` = `floor((hoje − min(vencimento))/dia)`, `faixaMaisAntiga = faixaDeAtraso(diasMaisAntigo)`.
- `faixas`: cada parcela contabilizada na faixa do **seu próprio** atraso (`total`); `qtdNoivas` = nº de noivas distintas com ao menos uma parcela naquela faixa.
- `noivas` ordenadas por `diasMaisAntigo` desc (mais antigo primeiro).

### 6.4 `historicoCobranca` (leitura)
```
type CobrancaView = { id: string; data: Date; canal: CobrancaCanal; observacao: string | null };
historicoCobranca(lojaId: string, leadId: string): Promise<CobrancaView[]> // recente primeiro
```

### 6.5 `registrarCobranca` (escrita)
```
type ResultadoCobranca = { ok: true } | { ok: false; motivo: "lead_invalido" | "canal_invalido" };
registrarCobranca(lojaId, { leadId: string; canal: string; observacao?: string }): Promise<ResultadoCobranca>
```
- Valida que o `leadId` é da loja (`db.lead.findUnique`); senão `lead_invalido`.
- `canal` deve ser um valor de `CobrancaCanal`; senão `canal_invalido`.
- `data` = `hojeUTC()` sempre (a cobrança é registrada no momento; sem campo de data na tela).
- `observacao` trim → null se vazio.

## 7. Server Action — `financeiro/cobranca/actions.ts`
- **`registrarCobrancaAction`** (`acaoAutorizada("financeiro", "editar")`): lê `leadId`/`canal`/`observacao`
  do FormData, chama `registrarCobranca`, volta por `?ok/?erro` para `/financeiro/cobranca`.

## 8. Tela — `/loja/[lojaId]/financeiro/cobranca`
Server Component, `force-dynamic`, gate `financeiro:ver`. `podeEditar = podeNoModulo(..., "financeiro", "editar")`.

1. **Cabeçalho** — "Cobrança" + microcopy: *"Acompanhe com delicadeza as parcelas em aberto."*
2. **Faixas de atraso** — 3 cards: `até 30 dias` · `31–60` · `60+`, cada um com total (`brl`) e
   qtd de noivas. Bordô só no `60+`.
3. **Lista de inadimplentes** (`noivas`, mais antigo primeiro) — por linha:
   - nome + tag da `faixaMaisAntiga`; `totalVencido` (tabular) + *"{qtdParcelas} parcela(s) · há {diasMaisAntigo} dias"*;
   - **Abrir WhatsApp ↗** — `<a target="_blank" rel="noopener">` para `linkWhatsApp(whatsapp, msgPadrão(noivaNome))`; só se houver whatsapp;
   - **Registrar cobrança** — `<details>` com form compacto (sem JS de cliente): select `canal`
     (WhatsApp/Telefone/Presencial/Outro) + input `observacao` + botão; só com `podeEditar`;
   - **histórico** recente da noiva via `historicoCobranca` (ex.: *"10/jun · WhatsApp · 'prometeu pagar dia 15'"*).
4. **Estado vazio** — *"Nenhuma parcela em atraso. 💛"* (a ausência é a calma).
5. Link discreto para **Contas a receber**.

**Navegação:** links para esta tela a partir de `/financeiro/receber` e do bloco "Em atraso" da
Projeção (`/financeiro/projecao`). 5º item na sidebar de Financeiro = decisão do plano (default: links).

## 9. Testes (TDD)

**Unitário puro:**
- `faixaDeAtraso`: 1→ate30, 30→ate30, 31→d31a60, 60→d31a60, 61→mais60.
- `linkWhatsApp`: número com máscara → `https://wa.me/55…` com `?text=` encodado; `null`/`""` → null.

**Integração (Postgres real, prefixo `MARK`, limpeza em `afterAll`):**
- `agingDaLoja`: parcelas vencidas em faixas distintas (ex.: 10, 40, 80 dias) agrupadas por noiva;
  parcela PAGA e parcela futura **não** entram; `faixas.*.total` e `qtdNoivas` corretos; ordenação por mais antigo.
- `registrarCobranca` grava; `historicoCobranca` lista recente-primeiro; `registrarCobranca` rejeita
  `lead_invalido` (lead de outra loja) e `canal_invalido`.
- Isolamento de loja: aging/histórico não vazam entre lojas.

## 10. Transversais
- Centavos via `@/lib/dinheiro`; dia = meia-noite UTC SP (`@/lib/tempo`, `financeiro/datas`).
- Multi-tenant: `RegistroCobranca` em `TENANT_MODELS`; queries via `tenantPrisma`.
- Gates: `financeiro:ver` (ver) / `financeiro:editar` (registrar). Migração **não destrutiva**.
- **Após mudar schema**: `node node_modules/prisma/build/index.js generate`. Gates verdes antes de commitar na `main`.

## 11. Não-objetivos (YAGNI)
- Envio automático / API de mensageria (WhatsApp Business, SMS, e-mail).
- Juros, multa ou correção por atraso.
- Template de mensagem configurável.
- "Promessa de pagamento" como entidade própria (fica no `observacao` livre).
- Projeção de caixa e DRE por categoria (fatias 1 e 3, specs próprias).

## 12. Arquivos (visão macro)

**Criar:**
- `prisma/schema` — `enum CobrancaCanal` + model `RegistroCobranca` + back-relations em `Loja` e `Lead`; migração não destrutiva.
- `src/lib/financeiro/cobranca.ts` — `faixaDeAtraso`/`linkWhatsApp` (puras), `agingDaLoja`, `historicoCobranca`, `registrarCobranca`.
- `src/lib/financeiro/__tests__/cobranca.test.ts` — unit (puras) + integração.
- `src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx` — a tela.
- `src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts` — `registrarCobrancaAction`.

**Modificar:**
- `TENANT_MODELS` (registrar `RegistroCobranca`).
- `/financeiro/receber/page.tsx` e `/financeiro/projecao/page.tsx` — link para Cobrança.

## 13. Definição de pronto
Tela `/financeiro/cobranca` com faixas de aging, lista de inadimplentes por noiva (com Abrir WhatsApp
+ Registrar cobrança + histórico) e estado vazio gentil; `RegistroCobranca` gravável com gate;
`faixaDeAtraso`/`linkWhatsApp`/`agingDaLoja`/`registrarCobranca` testados; `tsc` limpo e `vitest`
verde; commits na `main`.
