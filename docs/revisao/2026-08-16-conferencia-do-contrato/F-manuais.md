# Lente 6 — o manual diz o que o sistema faz?

**2026-08-16** · agente de leitura pura · base `090cb5d2` · escopo: os cinco manuais × as telas que mudaram entre `cd990767` e `HEAD`

## Achados

### 🟠 O manual ensina errado

1. **Vendedora — o diálogo de fechar contrato NÃO tem mais o campo "CPF da noiva"; a qualificação vem da ficha e o fecho é recusado sem ela (E215).** `docs/manuais/vendedora.html:559` lista *"CPF da noiva"* entre os campos do diálogo. Prova: `pages/orcamentos/[id].tsx:1915-1948` — o bloco `bloco-qualificacao` mostra "Quem assina" com "Editar ficha" e o recado *"O contrato qualifica quem assina, e a ficha ainda não tem: {campos}"*; o `POST /contratos` responde `422 QUALIFICACAO_INCOMPLETA`. A tabela "Quando o sistema diz não → No contrato" (`:872-885`) não traz esse recado, hoje a primeira recusa que uma noiva nova leva. Perfil: vendedora (e proprietária).
2. **Vendedora — "a correção monetária o sistema declara que não faz"** (`vendedora.html:793`) é o comportamento anterior ao E237. Prova: `lib/financeiro-core/src/mora.ts:256-260` — as frases são "Correção pelo IPCA de mm/aaaa a mm/aaaa (x%)", "Sem correção — ainda não há mês cheio", "Sem correção — o IPCA de mm/aaaa não foi informado (Configurações → Índices)". A célula pregada dez linhas acima (`:783`) já diz IPCA; a prosa contradiz a célula, e a `varredura-manuais-contradicao` não pega porque não é negação de UI. Perfil: vendedora.
3. **Proprietário — "A confecção não tem prazo próprio" listada como pendência de pé** (`proprietario.html:814`), depois do E240 (`c6235e83`) e da S-O140 (`fd28a0b8`). Prova: `pages/ajustes/prazo-proprio.tsx:89,118`, `[ajusteId].tsx:170`; o manual da costureira já ensina. E o resumo `:748` (*"São oito, e nenhuma se resolve escrevendo código"*) envelheceu junto: P4, P5, D4, D7 e a de produto estão feitas no próprio texto. Perfil: proprietária.

### 🟡 Omissão de capacidade que o perfil usa

4. **Vendedora e Recepção — a ficha da noiva tem o bloco "Para o contrato" (12 dados) e o CPF é conferido pelos dígitos; nenhum dos dois conta.** `vendedora.html:344` e `recepcao.html:517` listam os opcionais sem a qualificação. Prova: `pages/noivas/noiva-form.tsx:329-540` (seção "Para o contrato", aviso de que sem esses dados não fecha contrato) e `:67-68` (dígitos do CPF, E233). A recepção edita a ficha desde o E172. Perfis: vendedora, recepção.
5. **Proprietário — reabrir fechamento só do último para o primeiro (S-O121).** `proprietario.html:645` fala do reabrir sem a regra da ordem; a tabela "Quando o sistema diz não" (`:725-739`) não tem o recado. Prova: `pages/comissoes/index.tsx:102` (`FECHAMENTO_NAO_E_O_ULTIMO`). Perfil: proprietária.

### 🔵 Detalhe

6. `proprietario.html:518-526` — a tabela "O que o sistema não faz" abre com "Três omissões são deliberadas" e a primeira linha descreve algo que ele FAZ (corrige pelo IPCA) — a prosa foi atualizada no E237 sem mudar o enquadramento.
7. `proprietario.html:725-739` — os dois recados de corrida do caixa a pagar (S-O120: `pagar.tsx:91,98`) não estão em "Quando o sistema diz não".
8. Apagar opção/atributo do catálogo (S-O131, `editar.tsx:316,361-397`) não aparece em manual nenhum de quem tem acervo "tudo" — lacuna antiga (o manual da vendedora nunca descreveu a gestão de atributos), não prosa velha.

## Conferido e certo (por área)

Contrato e cláusulas (17ª, 16ª, 13ª, 18ª, troca de peça, expediente, 12ª); PDF-instrumento (E220/E233/E234); mora e perdão (E213/E226/E237) nos três manuais; recibo (E221) e conciliação (E235); peça sai e volta / fila de atrasos / avarias; ficha da noiva (Retirada/Devolução, leitura estreita da recepção); links e prazos (validade, piso de 1 dia, fallback de 7); costureira (prazo próprio criar e editar); manuais dentro do sistema; console/escada (S-O131); recepção (cabines, expedientes, prova sem reserva, funil, "vencendo em 3 dias").

**Nota de método:** as três 🟠 são do mesmo formato que E184/E196 nomearam — prosa que envelheceu por cima de célula pregada certa (2), pendência que continua listada depois de o épico sair (3), passo a passo de diálogo cuja tela mudou de desenho (1). Nenhuma das quatro varreduras alcança prosa desse tipo.
