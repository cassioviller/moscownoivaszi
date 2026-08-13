# O contrato de papel × o aplicativo — auditoria cláusula a cláusula

Lê-se junto com a [transcrição](A-transcricao.md). Cada linha foi conferida
contra o código, com `arquivo:linha`; onde não há âncora, está dito que não há.

**Legenda**

| | significado |
|---|---|
| ✅ | o sistema já faz, e faz igual ao contrato |
| ⚠️ | o sistema faz **diferente** do contrato — colisão |
| ❌ | a regra do contrato **não existe** no sistema |
| ⬜ | não é regra de software (cláusula de direito) |

---

## O retrato em uma linha

**De 21 cláusulas e 15 parágrafos, o sistema implementa 4 e colide com 3. As
outras 21 regras operacionais simplesmente não existem nele** — e a maioria é
dinheiro: multa, juros, reajuste, taxa de limpeza, taxa de dano, extravio.

O documento que o sistema imprime (`lib/contrato-do-papel.ts`) **não tem uma
cláusula sequer** — medido: zero ocorrências de "cláusula" no arquivo. Ele
imprime partes, itens, desconto, entrada e plano de parcelas. Ou seja: **a noiva
assina um papel e o sistema imprime outro documento**, e a Cláusula 6ª manda
entregar cópia *"do presente instrumento"*.

---

## 1. Identificação das partes

### A LOCADORA — ✅ existe, com ressalva de dado

`lojas` guarda `nome`, `cnpj`, `endereco`, `telefone`
(`schema/loja.ts`), e o PDF os imprime.

**A ressalva não é de código:** o papel traz **dois CNPJs** (37.771.644/0001-93
na identificação, 31.897.111/0001-76 na assinatura), e o banco de dev ainda tem
o de exemplo — `12.345.678/0001-99`, `Rua das Noivas, 123, São Paulo - SP`,
`(11) 99999-9999`. O endereço real está no papel: *Rua Luis Jacinto 297, Centro,
São José dos Campos, CEP 12243-260*.

Falta no sistema o **representante legal** (nome, RG, CPF de quem assina pela
loja) e a **chave PIX** — os dois estão no contrato e não têm campo.

### O LOCATÁRIO — ❌ **o sistema não guarda 9 dos 13 campos exigidos**

Este é o achado de maior alcance da auditoria: **o aplicativo não tem os dados
para preencher o contrato que o ateliê assina.**

| campo do contrato | no sistema |
|---|---|
| Nome | ✅ `leads.noivaNome` |
| CPF | ✅ `contratos.cpf` |
| TEL | ✅ `leads.whatsapp` |
| Estado civil | ❌ |
| Profissão | ❌ |
| Carteira de Identidade (RG) | ❌ |
| Data de nascimento | ❌ |
| E-mail | ❌ |
| Rua/Av · nº · apto · bairro · CEP · Cidade · Estado | ❌ (nenhum) |

Medido em `schema/leads.ts` e `schema/contratos.ts`: não existe coluna de
`email`, `rg`, `estado_civil`, `profissao`, `nascimento`, `endereco`, `cep`,
`bairro` nem `cidade`.

**A consequência é operacional, não teórica:** a vendedora fecha o contrato no
sistema e depois preenche os dados pessoais **à mão no papel**, porque não há
onde guardá-los. Toda a informação que identifica juridicamente a contratante
vive fora do sistema.

---

## 2. Do objeto

| cláusula | regra | estado |
|---|---|---|
| **1ª** | itens e acessórios com DESCRIÇÃO e VALOR, e TOTAL | ✅ `contrato_itens` (`descricao`, `valorUnitario`, `quantidade`) e `contratos.valorTotal`; o PDF imprime a lista |
| tabela | **ENTRADA** e **RESTANTE A PAGAR** | ✅ `parcelas.numero = 0` é a entrada (`schema/financeiro.ts:15`), e o PDF imprime "Entrada" e "Parcela 0" |
| **§ único** | o restante deve ser pago **até 20 dias antes da retirada** | ❌ **nada valida isso.** As parcelas têm `vencimento` livre; ninguém o compara com `contratos.dataRetirada`. Um plano cujo último vencimento cai depois da retirada é aceito em silêncio |

---

## 3. Obrigações do locatário

| cláusula | regra | estado |
|---|---|---|
| **2ª** | fornecer informações necessárias | ⬜ |
| **3ª** | pagar na forma da 8ª | ⬜ (remissiva) |

---

## 4. Obrigações da locadora

| cláusula | regra | estado |
|---|---|---|
| **4ª** | loja aberta **ter–sex 10:30–19:00, sáb 10:30–18:00** | ⚠️ **COLIDE, e o sistema é que está certo.** O horário gravado é `atendimentoAberturaHora: 9`, `atendimentoFechamentoHora: 20`, `diasFuncionamento: [0,1,2,3,4,5,6]` — **sete dias, 9h às 20h**. E não é chute: a decisão **S-A8** saiu do caderno de papel — 7 compromissos em 5 domingos e provas às 18:30 que o fechamento anterior recusava. **O ateliê já atende domingo e depois das 19h; o contrato promete o contrário.** Nota fina: o horário do sistema é de ATENDIMENTO (provas); o da cláusula é de RETIRADA e DEVOLUÇÃO, e essa distinção não existe no modelo |
| **5ª** | locação começa às **10:30** e termina às **18:00** | ⚠️ `contratos.dataRetirada` e `dataDevolucao` são `timestamp`, então a hora cabe — mas nenhuma régua a fixa nem a confere. Na prática o sistema trata as duas como DIA |
| **5ª §1º** | locadora não responde por traje não retirado | ⬜ |
| **5ª §2º** | entregar lavados e passados | ✅ o modelo conhece a **lavagem** como janela (`lavagemDiasDepois: 7`, `disponibilidade.ts`), que é o mecanismo que garante a peça limpa para a próxima |
| **5ª §3º** | dano constatado na locação → substituição | ❌ há `avarias` na DEVOLUÇÃO; não há registro de dano constatado na ENTREGA, nem gesto de substituir a peça |
| **5ª §4º** | **nota promissória** assinada na retirada, devolvida na devolução | ❌ não existe. É uma garantia que fica inteiramente fora do sistema |
| **6ª** | entregar ao locatário **cópia do presente instrumento** | ⚠️ o sistema gera PDF (`contrato-do-papel.ts`), mas ele é um **resumo financeiro sem nenhuma cláusula** — medido: zero "cláusula" no arquivo. Não é "o presente instrumento" |
| **7ª** | fornecer **todos os recibos** de pagamento | ❌ não existe recibo. Medido: zero ocorrências de "recibo" no código. O sistema registra o recebimento da parcela, mas não emite comprovante para a noiva |

---

## 5. Do preço e das condições de pagamento

| cláusula | regra | estado |
|---|---|---|
| **8ª** | valor total; pago em dinheiro, débito/crédito ou outra acordada | ✅ `contratos.valorTotal` e `formaPagamento` (enum com Dinheiro, Cartão de débito, Cartão de crédito, Boleto, Transferência, Outro) |
| **8ª §1º** | reserva antecipada com **40% do total** | ❌ o sistema tem entrada (parcela 0) de valor **livre**. Não conhece o percentual, não o sugere, não avisa quando a entrada é menor |
| **8ª §2º** | o valor da reserva **não é devolvido em nenhuma hipótese** | ❌ o cancelamento não calcula devolução nenhuma (`routes/contratos.ts`, rota de cancelar: registra `canceladoMotivo`/`canceladoEm`, e ponto) |

---

## 6. Do inadimplemento

| cláusula | regra | estado |
|---|---|---|
| **9ª** | multa **2%** + juros de mora **1% ao mês** + correção | ❌ **o sistema SABE que a parcela está atrasada e não cobra nada por isso.** `caixa.ts:239` define a obrigação ATRASADA e `projecao.ts` totaliza `emAtraso` — o número existe, a multa não |
| **9ª § único** | cobrança judicial: custas + **20% honorários** | ⬜ |

---

## 7. Da rescisão imotivada

| cláusula | regra | estado |
|---|---|---|
| **10ª** | aviso prévio por escrito de **365 dias** | ⬜ (e é a cláusula que o papel precisa rever — ver transcrição) |
| **11ª** | rescisão após pagamento devolve **deduzindo 60%** | ❌ nenhuma conta de devolução existe |
| **12ª** | vestido **exclusivo para primeiro aluguel** → multa = valor integral | ❌ duas ausências: não há conta, e **não há como saber que a peça é exclusiva/primeiro aluguel** — `schema/vestidos.ts` não tem o atributo |
| **13ª** | locadora rescinde → devolve o não prestado | ❌ |
| **13ª §1º** | pandemia → vira CRÉDITO por termo aditivo | ❌ não há crédito de cliente no modelo |
| **13ª §2º** | crédito vale **um ano** | ❌ |
| **13ª §3º** | devolução do valor em **30 dias** | ❌ |

---

## 8. Das condições gerais

| cláusula | regra | estado |
|---|---|---|
| **14ª** | limpeza extraordinária: taxa de **R$ 350,00 a R$ 2.500,00** | ⚠️ existe `avarias.custoReparo`, campo **livre** — sem piso, sem teto, sem distinguir limpeza de dano. A vendedora pode digitar R$ 50 ou R$ 9.000 e nada reclama |
| **15ª** | dano: taxa **não excedendo 5× o aluguel da peça** | ❌ mesmo campo livre, e o teto depende do valor do aluguel **daquela peça**, que o sistema tem (`contrato_itens.valorUnitario`) e não usa |
| **16ª** | não devolvido em **10 dias** = EXTRAVIO/ROUBO → **4× o aluguel** | ⚠️ **o sistema enxerga o atraso e não o cobra.** `disponibilidade.ts:60` tem o motivo `ATRASO_DEVOLUCAO` e `:258` o aplica quando há retirada sem devolução — a peça aparece atrasada na tela, e nenhuma cobrança nasce |
| **16ª §1º** | atraso menor: **1 diária extra por dia** + multa **R$ 250,00** | ❌ |
| **16ª §2º** | os valores se aplicam **proporcionalmente** a peças avulsas | ❌ |
| **17ª** | sem troca de traje **após 7 dias** da locação | ❌ o sistema deixa editar itens do contrato sem olhar data nenhuma |
| **17ª §1º** | sem troca às **sextas e sábados** | ❌ |
| **17ª §2º** | troca de data para o ano seguinte: **+10%** no total | ❌ **e este é o mais próximo de nascer.** O E193 acabou de ensinar o sistema a mover a data (`routes/reservas.ts:564` grava `RESERVA_DATA_MOVIDA` na trilha) — o gesto existe, o rastro existe, e **ninguém conta as trocas nem reajusta** |
| **17ª §3º** | **2ª troca +20%, 3ª +30%** | ❌ o sistema não conta quantas vezes a data mudou; o dado está na trilha e nada o lê |
| **18ª** | pagamento integral no ato → devolve o excedente à reserva se cancelar até **___ dias** antes | ❌ e **a cláusula está incompleta no papel** — o prazo nunca foi preenchido. Não dá para implementar antes de a dona dizer o número |
| **19ª** | sem vínculo trabalhista | ⬜ |
| **20ª** | proibido transferir ou subcontratar | ⬜ |

## 9. Do foro

| cláusula | regra | estado |
|---|---|---|
| **21ª** | foro de **São José dos Campos** | ⬜ — mas o município precisa sair do cadastro da loja quando o instrumento for impresso pelo sistema |

---

## As três colisões, separadas do resto

Ausência é dívida; **colisão é o sistema afirmando o contrário do contrato**, e
só há três:

1. **Horário (4ª).** O contrato promete ter–sex até 19h e sábado até 18h. O
   sistema atende **os sete dias até as 20h**, e essa configuração veio da
   realidade medida no caderno. **É o papel que está errado**, e consertá-lo é
   mais barato e mais honesto que estreitar o sistema.
2. **Cópia do instrumento (6ª).** O sistema entrega um resumo financeiro no
   lugar do contrato. Quem lê a cláusula supõe que o PDF do sistema seja o
   instrumento; não é.
3. **Taxas de avaria (14ª e 15ª).** O contrato dá faixa e teto; o sistema aceita
   qualquer número. Não é ausência pura porque o campo existe — ele só não
   obedece.

## O que a auditoria mudou de opinião no meio

A leitura ingênua diria *"o sistema não sabe nada do contrato"*. Errado em dois
pontos, e os dois importam para o plano:

- **O sistema já enxerga o atraso** (`ATRASO_DEVOLUCAO`) e **já enxerga o
  vencido** (`emAtraso`). O que falta é a conta, não o fato — e conta em cima de
  fato que já existe é o trabalho mais barato da lista.
- **O gesto de trocar a data já existe e já deixa rastro** (E193). O reajuste
  da 17ª §2º/§3º está a uma contagem de distância.
