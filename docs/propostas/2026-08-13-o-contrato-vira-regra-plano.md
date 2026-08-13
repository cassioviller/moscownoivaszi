# O contrato vira regra — plano

**Aberto em 2026-08-13**, a pedido da dona, depois de ler o instrumento de
locação em papel ([transcrição](../revisao/2026-08-13-contrato-de-papel/A-transcricao.md)
· [auditoria](../revisao/2026-08-13-contrato-de-papel/B-auditoria.md)).
Base `02634e7`.

## O que a auditoria devolveu

De 21 cláusulas e 15 parágrafos: **4 o sistema já cumpre, 3 colidem, 21 regras
operacionais não existem nele.** A maioria das ausentes é dinheiro — multa,
juros, reajuste, taxa de limpeza, taxa de dano, extravio.

E o achado de maior alcance não é nenhuma cláusula isolada: **o sistema não
guarda 9 dos 13 dados que o contrato exige do LOCATÁRIO** (estado civil,
profissão, RG, data de nascimento, e-mail e o endereço inteiro). Hoje a
vendedora fecha o contrato no sistema e preenche a identificação **à mão no
papel**.

## Fase 0 — o que só a dona decide

**Nenhuma linha de código antes destas respostas.** Quatro delas travam trabalho
de verdade; as outras são para o contrato, não para o sistema.

| # | pergunta | por que trava |
|---|---|---|
| **D1** | **Qual é o CNPJ certo?** O papel traz **37.771.644/0001-93** na identificação e **31.897.111/0001-76** na assinatura | É o que o sistema vai imprimir em todo contrato. Imprimir o errado é pior que não imprimir |
| **D2** | O contrato promete loja **ter–sex 10:30–19:00 e sáb até 18:00**; o ateliê atende **os sete dias até as 20h** (foi o caderno que disse, S-A8). **Corrige-se o contrato, ou o sistema deve passar a distinguir horário de PROVA e horário de RETIRADA?** | Decide se isto é conserto de papel (barato) ou modelo novo (caro) |
| **D3** | **Cláusula 18ª está incompleta no papel**: *"se comunicar o cancelamento até ____ dias antes"*. Qual é o prazo? | Sem o número, a cláusula é inaplicável e não há o que programar |
| **D4** | O **PDF do sistema deve virar o instrumento com as 21 cláusulas**, ou continuar sendo o resumo financeiro e o papel seguir separado? | Decide se existe a Fase 3 inteira |
| D5 | A **13ª §1º** ainda fala em decretos da pandemia (Covid-19). Mantém, reescreve ou remove? | só papel |
| D6 | A **10ª** pede aviso prévio de **365 dias** para rescisão imotivada, num contrato de casamento. Mantém? | só papel |
| D7 | O representante legal (Renato) e a chave PIX (CPF de Karina) — o sistema deve guardá-los para imprimir? | abre um campo de cadastro |

## A ordem, e a razão dela

Primeiro **o que o sistema já sabe e não usa** — é conta em cima de fato que já
existe, e é o trabalho mais barato da lista. Depois **o que ele não sabe** —
coluna nova, migração. Por último **o documento**, que depende de tudo acima
estar no lugar.

---

## Faixa A — a conta em cima do que já existe

Nenhum destes épicos inventa dado: os três usam fato que o sistema já grava.

### E211 — a data que muda tem preço (17ª §2º e §3º)

**A mais barata e a mais rentável.** O E193 ensinou o sistema a mover a data do
casamento e a gravar `RESERVA_DATA_MOVIDA` na trilha (`routes/reservas.ts:564`).
Falta contar e cobrar:

- contar quantas vezes a data daquele contrato já mudou (a trilha responde);
- troca para o **ano seguinte** → **+10%** do valor total;
- **2ª troca → +20%**, **3ª em diante → +30%**;
- o reajuste nasce como **parcela nova** no contrato, com origem própria, para
  aparecer na cobrança e na comissão como qualquer outro dinheiro;
- a tela avisa o valor **antes** de confirmar a troca — a vendedora não pode
  descobrir o reajuste depois de prometer a data.

### E212 — o atraso na devolução tem preço (16ª e §1º)

O sistema **já enxerga** o atraso: `disponibilidade.ts:60` tem o motivo
`ATRASO_DEVOLUCAO` e `:258` o aplica. Falta a conta:

- atraso de **1 a 9 dias** → **1 diária de aluguel por dia** + multa de
  **R$ 250,00**;
- **10 dias ou mais** → **EXTRAVIO/ROUBO**: **4× o aluguel de cada peça**;
- **proporcional por peça** (§2º) — o rol de itens já existe em
  `contrato_itens.valorUnitario`;
- a cobrança nasce como parcela, e a tela da devolução mostra a conta antes de
  gerar.

### E213 — a parcela vencida tem multa e juros (9ª)

`caixa.ts:239` já define a obrigação ATRASADA e `projecao.ts` já totaliza
`emAtraso`. Falta:

- **multa de 2%** sobre o valor, uma vez;
- **juros de mora de 1% ao mês**, *pro rata die*;
- o valor atualizado aparece na fila de cobrança e no portal da noiva;
- **decisão embutida**: a multa é automática ou é a vendedora que a aplica? O
  contrato diz *"deverá incidir"* — o padrão é aplicar, com gesto de perdoar
  registrado na trilha.

### E214 — a taxa de limpeza e a de dano ganham faixa (14ª e 15ª)

`avarias.custoReparo` é campo livre. Passa a:

- distinguir **limpeza extraordinária** de **dano** — são cláusulas diferentes;
- limpeza: faixa de **R$ 350,00 a R$ 2.500,00**, com o piso sugerido;
- dano: teto de **5× o valor do aluguel daquela peça**, que o sistema tem em
  `contrato_itens.valorUnitario` e não usa;
- valor fora da faixa exige **justificativa escrita**, que vai para a trilha —
  a régua não impede a dona de decidir, obriga a dizer por quê.

---

## Faixa B — o que o sistema não sabe

Estes pedem **coluna nova e migração**. É a faixa que a Fase 0 mais trava.

### E215 — a ficha guarda quem assina (identificação do locatário)

Os 9 campos ausentes: estado civil, profissão, RG, data de nascimento, e-mail,
e o endereço completo (logradouro, número, complemento, bairro, CEP, cidade,
estado).

Duas decisões dentro do épico, e as duas são de LGPD tanto quanto de tela:

- **onde moram** — na ficha da noiva (`leads`) ou no contrato (`contratos`)? A
  ficha é o cadastro dela; o contrato é o retrato congelado. **Recomendo os dois
  papéis**: mora na ficha, e o contrato **congela uma cópia** no fecho, como já
  faz com o preço;
- **quando são obrigatórios** — não no primeiro contato (a captação pede o
  mínimo, de propósito), e **sim no fecho do contrato**. A porta do contrato
  recusa o que falta, com o campo nomeado.

O E77 (exportar dados) e o expurgo LGPD precisam alcançar os campos novos —
dado pessoal novo entra nas duas pontas ou nasce fora da lei.

### E216 — o vestido sabe que é exclusivo (12ª)

Atributo de **primeiro aluguel / exclusivo** na peça, e a multa integral na
rescisão. Sem ele, a 12ª não tem como ser aplicada por máquina nenhuma.

### E217 — a rescisão calcula (8ª §2º, 11ª, 12ª, 13ª e §§)

Depende do E216 e da decisão D3. O cancelamento hoje só carimba motivo e data.
Passa a calcular:

- reserva (40%) **nunca volta** (8ª §2º);
- pago além da reserva → devolve **deduzindo 60%** (11ª);
- peça exclusiva → multa **integral** (12ª);
- locadora rescinde → devolve o **não prestado** (13ª);
- prazo de devolução: **30 dias** (13ª §3º), que vira conta a pagar com
  vencimento — dívida da loja, e o financeiro já sabe representá-la.

### E218 — a entrada de 40% e o prazo de 20 dias (8ª §1º e § único do objeto)

- a entrada **sugere 40%** do total e **avisa** quando é menor (avisar, não
  bloquear: quem decide o desconto é a loja);
- o plano de parcelas **recusa vencimento depois de 20 dias antes da
  retirada** — hoje nada compara `parcelas.vencimento` com
  `contratos.dataRetirada`.

### E219 — a troca de traje tem prazo (17ª e §1º)

- sem troca **após 7 dias** da locação;
- sem troca às **sextas e sábados**;
- é guarda na porta que edita itens do contrato, com o recado dizendo a cláusula.

---

## Faixa C — o documento

### E220 — o PDF do sistema vira o INSTRUMENTO (6ª, 21ª, e o resto)

**Depende de D1, D4 e do E215.** Hoje o PDF é resumo financeiro sem uma cláusula
— e a 6ª manda entregar cópia *"do presente instrumento"*.

- as **21 cláusulas** entram no PDF, com os números vindos de constantes
  (não escritos no molde), para que mudar a regra mude o papel;
- os dados do locatário vêm do E215;
- CNPJ, endereço, representante e PIX vêm do cadastro da loja (D1 e D7);
- o foro sai da cidade da loja (21ª);
- **régua obrigatória**: a `varredura-manuais-prazos` (E184) já prega prazos de
  manual contra constantes do código. Nasce a irmã dela — **os números das
  cláusulas do PDF pregados contra as mesmas constantes**, para o contrato
  impresso não envelhecer como os manuais envelheceram.

### E221 — recibo de pagamento (7ª)

*"A LOCADORA deverá fornecer todos os recibos de pagamentos efetuados"* — hoje
não existe recibo nenhum (medido: zero ocorrências no código). O recebimento já
é registrado; falta o comprovante, e ele cabe no portal da noiva.

---

## O que este plano NÃO faz

- **A nota promissória (5ª §4º)** — é papel assinado na retirada. O sistema pode
  no máximo lembrar que ela existe; não vale épico.
- **O crédito de pandemia (13ª §1º e §2º)** — espera D5. Se a cláusula for
  reescrita como "crédito por qualquer motivo", vira épico; como está, é letra
  morta.
- **As cláusulas 2ª, 3ª, 9ª § único, 10ª, 19ª, 20ª** — direito, não software.
- **O dano constatado na ENTREGA (5ª §3º)** — o sistema só conhece avaria na
  devolução. Fica anotado como sobra, não como épico: é caso raro e a dona não
  pediu.

## A ordem sugerida, se for para começar hoje

1. **Fase 0** — as quatro decisões que travam (D1 a D4).
2. **E211** (data que muda tem preço) — não depende de decisão nenhuma, usa dado
   que já existe, e é dinheiro que o contrato já manda cobrar e ninguém cobra.
3. **E212** e **E213** — mesma natureza, mesma fonte de dado.
4. **E215** — abre a Faixa B, porque o E220 depende dele.
5. O resto, na ordem do plano.

**O E211 é o que eu faria primeiro**, e por uma razão que não é técnica: é a
única regra do contrato que o ateliê **perde dinheiro** por não ter — cada troca
de data para o ano seguinte deveria somar 10% ao contrato, e hoje some.
