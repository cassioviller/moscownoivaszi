# Folha de perguntas — as 13 sobras que não têm conserto até alguém responder

**2026-08-06.** É a fase 1 do
[`plano do resto das sobras`](2026-08-06-plano-do-resto-das-sobras.md). Nenhuma
destas 13 linhas é pedido de funcionalidade: são pontos em que o sistema **já se
comporta de um jeito** e ninguém decidiu se é o certo. Regra 21: sobra fechada
por decisão se risca com a resposta escrita — decisão não registrada volta como
pergunta.

As perguntas estão na linguagem de quem responde. O que vem embaixo de cada uma
— o número medido e o que muda com cada resposta — é para quem for anotar a
resposta, não para ler em voz alta.

---

## Para a dona do ateliê (8)

### 1. A data do casamento — **S39**

> *"A senhora anota em algum lugar a data do casamento de cada noiva? No caderno,
> no WhatsApp, na cabeça? E quando anota, é no começo, quando ela chega, ou só
> quando fecha o contrato?"*

**Por que é a primeira.** O sistema tem o campo e ele está vazio: **4 de 1.351
noivas têm a data**, as quatro no mesmo dia de 2027, e `contratos.data_casamento`
está em **0 de 836**. A tela "Conversão" tem uma curva chamada *"quando faltará
vestido e quando sobrará arara"* que devolve **zero linhas para todas as lojas** e
mostra *"Nenhum casamento com data marcada nos próximos meses"*. Ela **nunca foi
desenhada com dado nenhum** — não existe nem foto dela entre as 94 capturas da
revisão de julho.

- **Se ela anota** → o buraco é de fluxo: descobrir por que a data não chega ao
  cadastro, e em que tela ela deveria entrar. O campo já existe.
- **Se ela não anota** → a curva não é uma tela quebrada, é uma tela cedo demais.
  Ou se pede a data em algum ponto do atendimento, ou se aceita que o relatório
  não tem matéria-prima e ele sai da frente.

### 2. A lavagem da peça de estoque — **S-A16**

> *"Quando a peça de estoque volta — o saiote, o véu, o bolero —, ela vai para a
> lavagem antes de sair de novo, como o vestido vai? Se sim, é a mesma semana que
> a senhora reserva para o vestido, ou é menos?"*

**Medido:** casamento em 19/09, o vestido fica comprometido até 28/09 e **o
saiote do mesmo contrato aparece livre em 22/09** — sete dias de diferença entre
peças que saíram e voltaram juntas. O sistema avisa e não bloqueia, então o custo
de hoje é um aviso que deixa de aparecer, não uma venda recusada à toa.

- **Mesma semana** → o cálculo do estoque passa a somar a lavagem, como o do
  vestido já soma.
- **Menos, ou nenhuma** → escrever o número dela na régua e fechar; hoje o
  sistema chuta zero sem dizer que está chutando.

### 3. Férias por cima de agenda cheia — **S-A18**

> *"Quando a senhora marcar férias e já houver atendimentos naquele período, o
> sistema deve avisar na hora — 'há 4 atendimentos nesse período; eles continuam
> marcados' — ou aceitar em silêncio?"*

**Medido:** o `POST /ausencias` **não consulta a agenda uma única vez**. A ausência
impede o novo agendamento e não mexe no que já estava marcado — isso foi decidido
de propósito. O que não existe é a pessoa ficar sabendo.

- **Avisar** → contar e mostrar é trabalho pequeno e não muda regra nenhuma.
- **Aceitar calado** → fica escrito que é assim de propósito, e a linha sai.

Remarcar em lote é outra conversa, e não depende desta resposta.

### 4. O domingo — **S-A24**

> *"No domingo, a senhora quer que o sistema mostre os horários livres para a
> noiva escolher sozinha? Ou domingo só deve aparecer quando a própria senhora
> marcar?"*

**Medido:** a grade oferece **20 horários por domingo por cabine**, e domingo tem
**4 atendimentos contra 90 da segunda**. Quando a senhora respondeu a pergunta
anterior, disse *"domingo com hora marcada"* — e o sistema só sabe dizer aberto ou
fechado. A resposta virou "aberto", que é o que não perde a venda.

- **Mostrar para a noiva** → está certo como está, e a linha sai.
- **Só quando a senhora marca** → é um estado novo no modelo ("sob demanda"), e
  vira épico com desenho próprio. Não é conserto.

### 5. O vestido preso antes de a noiva ter ficha — **S27**

> *"Acontece de a senhora separar um vestido para uma noiva antes de ela estar
> cadastrada — no dia em que ela vem, no telefone? Ou vestido separado sempre tem
> dona com ficha?"*

**Medido, e o repositório já decidiu uma vez:** existe um teste com o nome da
decisão — *reserva sem dona é aceita, é o contrato que lhe dá dono*. Uma proposta
de proibir chegou a ser aplicada e **caiu com 17 vermelhos**, um deles esse. As
131 reservas sem noiva que assustavam vinham **97% de um teste automático**, não
do uso: a rota permite e produziu zero delas. O defeito de verdade era outro e
está fechado (apagar a ficha da noiva deixava o vestido ocupado sem dona).

- **Acontece** → está certo como está.
- **Nunca acontece** → o sistema passa a exigir a dona, e ganha uma trava que
  hoje não pode ter.

### 6. A segunda linha de negócio — **S-A3**

> *"Festa, madrinha, dama: é o mesmo caminho que o da noiva — mesmo prazo de
> prova, mesma forma de cobrar — ou é outro? E a senhora quer separar as duas
> coisas nas telas, ou ver tudo junto?"*

**Medido:** **38 compromissos** dessa linha nas 15 páginas de agenda do caderno, e
**em setembro eles passam as provas de noiva**. O sistema ganhou o vocabulário em
julho — "Tipo de peça", com Noiva, Festa, Dama, Madrinha, Debutante, Acessório —
e **496 peças do acervo, nenhuma classificada**: o ganho tem uso real zero.

- **Mesmo caminho** → falta só classificar o acervo, e é trabalho de uma tarde
  com a senhora dizendo o que é o quê.
- **Caminho diferente** → é uma rodada de diagnóstico própria, e é a maior coisa
  ainda não olhada neste sistema.

### 7. Apagar do acervo uma peça já vendida — **S-A14**

> *"Uma peça que já saiu em contrato pode ser apagada do acervo? Ou peça vendida
> fica para sempre, mesmo depois de dar baixa?"*

**Medido:** hoje o banco deixa o item do contrato ficar **órfão** — apagar a peça
transforma o item em descrição solta. Não há caso vivo (`contrato_itens` tem 0
linhas), mas 98 dos 297 itens de orçamento apontam para peça. A rota que apagava
sem guarda já foi fechada em `2912526`.

- **Fica para sempre** → o banco passa a recusar, e o vínculo deixa de evaporar.
- **Pode apagar** → fica escrito que o item vira descrição solta de propósito.

### 8. As fotos que faltam — **S-A2** *(não é pergunta, é pedido)*

> *"Faltam duas fotos do caderno: o verso da última página que a senhora
> fotografou (a semana de 21 a 27 de setembro termina com uma seta e um 'ATRÁS'),
> e as semanas de 28 de setembro a 11 de outubro."*

**Por que importa:** as **136 saídas** que a arqueologia contou são **piso, não
total**. Nenhum número dessas contagens deve virar número de negócio antes das
fotos que faltam.

---

## Para a dona do repositório (5)

### 9. O `mockup-sandbox` — **S23**

Apagar o pacote (`rm -rf`) leva junto as cópias divergentes de `ui/` **e o preview
do Canvas** que o E104 restaurou. Medido: o custo de hoje é **zero** — o grafo do
`main.tsx` alcança 3 dos 61 arquivos, e nada importa o `calendar.tsx` com o CSS
morto. A dívida são **8 divergências em 33 arquivos homônimos**, duas delas de
acessibilidade, que viram custo no primeiro mockup que importar o calendário. A
saída "vira um link para o de verdade" **está morta**: 22 dos 55 primitivos do
mockup não existem no app.

**Escolher entre:** apagar o pacote e perder o preview · manter e aceitar que as
8 divergências continuam · sincronizar as 8 à mão, uma vez.

### 10. A dependência na raiz — **S29**

`@workspace/api-client-react` está na raiz por **1 import em 1 spec**. É symlink:
**0 bytes de rede**. Ela existe para a sonda afirmar a URL que o codegen gera, em
vez de repetir uma literal que o codegen pode invalidar em silêncio.

**Escolher entre:** manter a amarração com o codegen · trocar por um assert de
`200` na URL literal, e perder a amarração.

### 11. Criar perfil de acesso pela tela — **S-D36**

O servidor tem `POST /admin/perfis` e a tela do superadmin **não o chama** — ela
lista e edita. Quem apagar um perfil não tem por onde repor.

**Escolher entre:** a tela ganha o botão · fica escrito que perfil se cria por
outro caminho, e a linha sai.

### 12. Estornar pagamento com permissão de CRIAR — **S43** *(nasceu em 2026-08-07, no fecho da S40)*

O middleware deriva a ação do método HTTP e `POST …/pagamentos/:id/estornar`
não tem override: quem tem `financeiro: criar` **sem editar** desfaz rastro de
caixa — e não pode remover uma conta PREVISTA (DELETE→editar). As duas rotas
que pagam conta também divergem entre si: `/contas-pagar/:id/pagar` exige
`editar` explícito e `POST /financeiro/pagamentos` (a única que a tela usa)
deriva `criar`. O estorno de RECEBIMENTO tem gate explícito. Nos 4 perfis
padrão nada muda (`financeiro` é TUDO ou NADA); a fresta é só de perfil
customizado.

**Escolher entre:** o estorno (e talvez o pagar) ganham `requireModulo("financeiro",
"editar")` explícito, e a tela acompanha · fica como está, escrito que criar
basta para estornar.

### 13. Ligar a formatação do codegen — **S-D48** *(nasceu em 2026-08-07, no fecho da S-D44)*

O `orval.config.ts` dizia `prettier: true` — opção que o orval 8 **ignora em
silêncio**; os `generated/` commitados são o produto sem formatação e o codegen
os reproduz byte a byte. Ligar o `formatter: "prettier"` custa **232 arquivos
reformatados (+27.888/−21.341)** que as varreduras do repositório leem por
forma (regra 13) — se ligar, é no mesmo commit que as varreduras forem
reconferidas.

**Escolher entre:** ligar e pagar o churn uma vez · deixar desligado, que é o
que a config (agora honesta) já diz.

---

## O que fazer com as respostas

Cada resposta vira **uma linha riscada na tabela de Sobras do rastreador**, com a
frase da resposta escrita junto (regra 21) — não um "resolvido". As que virarem
trabalho entram como sobra nova, já com o que foi decidido, para o próximo plano
poder ordená-las.

**Nenhuma das 11 trava as outras 32.** A fase 2 do plano — a fila do banco — roda
sem nenhuma delas.
