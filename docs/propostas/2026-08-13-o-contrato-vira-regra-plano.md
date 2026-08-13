# O contrato vira regra — plano

**Aberto em 2026-08-13**, a pedido da dona, depois de ler o instrumento de
locação em papel ([transcrição](../revisao/2026-08-13-contrato-de-papel/A-transcricao.md)
· [auditoria](../revisao/2026-08-13-contrato-de-papel/B-auditoria.md)).
Base `02634e7`.

## O que a auditoria devolveu

De 21 cláusulas e 15 parágrafos: **4 o sistema já cumpre, 2 colidem, 22 regras
operacionais não existem nele.** A maioria das ausentes é dinheiro — multa,
juros, reajuste, taxa de limpeza, taxa de dano, extravio.

(Eram 3 colisões na primeira versão. A régua *"o contrato está certo"* obrigou a
reler o horário, e o erro era meu — está contado na auditoria e no E222.)

E o achado de maior alcance não é nenhuma cláusula isolada: **o sistema não
guarda 9 dos 13 dados que o contrato exige do LOCATÁRIO** (estado civil,
profissão, RG, data de nascimento, e-mail e o endereço inteiro). Hoje a
vendedora fecha o contrato no sistema e preenche a identificação **à mão no
papel**.

## Fase 0 — a decisão que já veio, e as duas que faltam

### A régua, decidida em 13/08/2026

> **"O contrato está certo."**

Onde papel e sistema divergirem, **é o sistema que se ajusta**. A decisão fecha
D2, D5 e D6 de uma vez — e já corrigiu um erro meu:

- **D2 — resolvida, e a pergunta estava MAL FEITA.** Eu a apresentei como escolha
  entre corrigir o papel ou estreitar o sistema. Não era: a cláusula 4ª fala de
  **retirada e devolução**, e o horário do sistema é de **atendimento** (provas,
  `routes/agenda.ts:1346`, sete dias até as 20h, vindo do caderno pela S-A8).
  **São dois expedientes, e o sistema só tem um.** Nasce o **E222**.
- **D5 — resolvida.** A cláusula de pandemia (13ª §1º) fica como está.
- **D6 — resolvida.** O aviso prévio de 365 dias (10ª) fica como está.
  Nenhuma das duas pede código.
- **D1 — resolvida em 13/08/2026: o CNPJ é o final 93**, 37.771.644/0001-93 (o da
  identificação, p. 1). O da assinatura sai do contrato.

  **A conferência dos dígitos mudou o tamanho do problema:** os DOIS números
  passam na validação de CNPJ, então a página 6 não traz um erro de digitação —
  traz o CNPJ bem-formado de **outra inscrição**. O papel precisa ser corrigido
  antes da próxima assinatura, e vale olhar os contratos já assinados com aquela
  página.

  **E nasce uma régua que ninguém tinha pedido:** o campo `cnpj` é `string`
  livre no spec (`openapi.yaml:4796`) e **nada valida CNPJ no repositório
  inteiro** — tanto que o exemplo semeado hoje, `12.345.678/0001-99`, é
  **inválido**. O número que vai impresso em todo contrato entra sem conferência.
  Entra no E220.
- **D3 — resolvida em 13/08/2026: o prazo da 18ª é CAMPO, não regra.** O
  *"até _____ dias antes"* é negociado a cada contrato, como a data e o valor.
  **Isso muda o desenho:** não é constante no código, é **coluna em
  `contratos`**, preenchida no fecho e impressa na cláusula.

  Foi correção de um engano meu: li a lacuna como frase incompleta porque ela
  mora no meio da prosa, e não numa tabela como as outras lacunas do molde. **A
  forma do documento me enganou sobre a natureza do vazio.**

### As que seguem abertas por escolha, não por impedimento

| # | pergunta |
|---|---|
| **D4** | O **PDF do sistema deve virar o instrumento com as 21 cláusulas**? A régua nova empurra para o sim — a 6ª manda entregar cópia *"do presente instrumento"*, e hoje o sistema entrega outra coisa (E220) |
| **D7** | O representante legal (Renato) e a chave PIX (CPF de Karina) devem ser guardados no cadastro da loja, para o sistema imprimir? |

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

Depende do E216. O cancelamento hoje só carimba motivo e data. Passa a calcular:

- reserva (40%) **nunca volta** (8ª §2º);
- pago além da reserva → devolve **deduzindo 60%** (11ª);
- peça exclusiva → multa **integral** (12ª);
- locadora rescinde → devolve o **não prestado** (13ª);
- prazo de devolução: **30 dias** (13ª §3º), que vira conta a pagar com
  vencimento — dívida da loja, e o financeiro já sabe representá-la;
- **nasce a coluna do prazo da 18ª** (D3): quantos dias antes da retirada o
  cancelamento ainda devolve o excedente à reserva. É **negociado por contrato**,
  então é campo do fecho, não constante — e sem valor preenchido a cláusula não
  dispara, porque o sistema não inventa prazo que ninguém acordou.

### E218 — a entrada de 40% e o prazo de 20 dias (8ª §1º e § único do objeto)

- a entrada **sugere 40%** do total e **avisa** quando é menor (avisar, não
  bloquear: quem decide o desconto é a loja);
- o plano de parcelas **recusa vencimento depois de 20 dias antes da
  retirada** — hoje nada compara `parcelas.vencimento` com
  `contratos.dataRetirada`.

### E222 — o ateliê tem DOIS expedientes, e o sistema só conhece um (4ª e 5ª)

**Nasceu da decisão de 13/08.** O horário que existe governa **atendimento** —
provas, sete dias até as 20h, medido no caderno (S-A8) e correto. A cláusula 4ª
governa **retirada e devolução**: **terça a sexta, 10:30–19:00; sábado,
10:30–18:00** — fechado domingo e segunda.

- nasce o expediente de **retirada/devolução**, ao lado do de atendimento, na
  mesma tela de "Cabines & horário";
- `contratos.dataRetirada` e `dataDevolucao` passam a ser **validadas** contra
  ele — hoje são gravadas como vierem (`routes/contratos.ts:825`), e o sistema
  aceita retirada num domingo às 23h sem uma palavra;
- os **defaults** saem do contrato (10:30 e 18:00, cláusula 5ª), configuráveis
  por loja como todo o resto;
- o recado da recusa cita o expediente, não um código.

**Cuidado que o épico tem de medir**: o E2E e o seed criam contratos com datas
arbitrárias. Estreitar a porta sem olhar a fixture reprova a suíte por dado de
teste, não por defeito — foi o que o E198 aprendeu com o `e87`.

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
- **O crédito de pandemia (13ª §1º e §2º)** — a D5 decidiu que a cláusula fica
  como está, e como está ela é de pandemia. Enquanto o gatilho for decreto de
  Covid-19, não há gesto a programar. Se um dia virar "crédito por qualquer
  motivo", vira épico.
- **As cláusulas 2ª, 3ª, 9ª § único, 10ª, 19ª, 20ª** — direito, não software.
- **O dano constatado na ENTREGA (5ª §3º)** — o sistema só conhece avaria na
  devolução. Fica anotado como sobra, não como épico: é caso raro e a dona não
  pediu.

## A ordem sugerida, se for para começar hoje

1. **Nada trava mais.** Das sete perguntas da Fase 0, seis estão respondidas, e a
   sétima (D7 — guardar representante legal e PIX) é escolha, não impedimento.
2. **E211** (a data que muda tem preço) — não depende de decisão nenhuma, usa
   dado que já existe, e é dinheiro que o contrato manda cobrar e ninguém cobra.
3. **E212** e **E213** — mesma natureza, mesma fonte de dado.
4. **E222** — o segundo expediente. Sobe na fila porque a decisão de hoje o fez
   nascer, e porque é a única cláusula em que o sistema hoje **deixa acontecer**
   o que o contrato proíbe (retirada fora do horário da loja).
5. **E215** — abre a Faixa B, porque o E220 depende dele.
6. O resto, na ordem do plano.

**O E211 continua sendo o que eu faria primeiro**, e por uma razão que não é
técnica: é a única regra do contrato que o ateliê **perde dinheiro** por não ter
— cada troca de data para o ano seguinte deveria somar 10% ao contrato, e hoje
some.
