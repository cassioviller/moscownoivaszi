# O plano de importação — o caderno de papel entra na instalação real

O ateliê trabalhou anos num caderno. As **29 fotos** dele estão em
`docs/revisao/2026-08-04-arqueologia-legado/fotos/`, a transcrição linha a linha
está em `…/transcricao-2026-08-10.json`, e o que a loja curou a partir dela está
hoje no banco `moscow_base`. Este documento diz como esse material atravessa
para a instalação de produção do EasyPanel.

## 1. O que entra, e o que NÃO entra

**Entra** (o pacote `docs/legado/2026-08-17-caderno.json`, 157 KB, gerado em
17/08/2026):

| O quê | Quanto | De onde |
|---|---|---|
| Peças do acervo | **132**, códigos `L001`–`L132` | as 124 grafias de peça das 29 fotos, curadas peça a peça pela loja |
| Classificação por *Tipo de peça* | **131** (126 Noiva · 5 Acessório) | a decisão da S-A27, em 16/08/2026 |
| Noivas do caderno, como leads | **163** (118 com data de casamento) | os 130 nomes distintos do caderno e da agenda, mais os que a loja acrescentou |

**Não entra, e é decisão, não esquecimento:**

- **contrato, parcela, pagamento, comissão — nada de dinheiro.** O papel não tem
  preço: em 29 fotos há **um único número monetário** (*7.600*, ao lado de
  "Realuguel", e não dá para saber se é valor ou código). Inventar histórico
  financeiro é o único jeito de o sistema começar mentindo;
- **o preço das peças é PROVISÓRIO e está escrito em cada uma.** Cada peça
  carrega, no campo de observações, a frase inteira: *R$ 2.000,00 posto em
  2026-08-10 por decisão da dona, NÃO SAIU DO PAPEL… CONFERIR esta peça antes
  de fechar orçamento*. Quem abrir a ficha lê isso antes de cobrar;
- **a agenda de provas e as saídas semanais.** O caderno registra a SEMANA de
  saída, nunca o dia do casamento, e as 136 saídas são de junho a outubro de
  2026 — passado, quando a instalação subir. Passado não vira compromisso;
- **loja, perfis, cabines, horário, catálogo, escada de comissão e
  recorrências**: isso é a configuração inicial, e ela nasce sozinha na primeira
  subida do contêiner (o *seed*). O pacote não repete nada disso.

## 2. As três peças de máquina

| Peça | Onde | Papel |
|---|---|---|
| `scripts/exportar-legado.ts` | máquina de desenvolvimento | lê o banco da loja e escreve o pacote JSON. **Não escreve no banco** |
| `docs/legado/2026-08-17-caderno.json` | versionado | o pacote de hoje. Viaja dentro da imagem, em `/app/legado/` |
| `artifacts/api-server/src/scripts/importar-legado.ts` | dentro do contêiner (`dist/importar-legado.mjs`) | lê o pacote e escreve na instalação |

## 3. Como rodar, no dia

Tudo pelo **console do serviço `app`** no EasyPanel, com o sistema já no ar.

**Passo 1 — o ensaio.** Ele não escreve nada; só conta.

```sh
node dist/importar-legado.mjs /app/legado/2026-08-17-caderno.json
```

Saída esperada numa instalação recém-nascida:

```
[importar-legado] loja alvo: Moscow Noivas (84e539bd-…)
[importar-legado] peças: 132 no pacote · 0 já na loja · 132 a inserir
[importar-legado] noivas: 163 no pacote · 0 já na loja · 163 a inserir
[importar-legado] ENSAIO — nada foi escrito. Repita com --aplicar.
```

**Passo 2 — o backup, antes de escrever.** Administração → *Fazer backup agora*.
Leva segundos num banco recém-nascido e é o que torna o passo 3 reversível.

**Passo 3 — aplicar.**

```sh
node dist/importar-legado.mjs /app/legado/2026-08-17-caderno.json --aplicar
```

```
[importar-legado] aplicado. A loja tem agora 132 peças e 163 noivas.
```

**Passo 4 — conferir na tela.** *Vestidos* mostra 132 peças com código `L…`;
*Noivas* mostra o funil com 163 cartões em "Novo". Abrir uma peça mostra o aviso
do preço provisório.

## 4. Por que é seguro

- **Ensaio por default.** Sem `--aplicar`, nada é escrito;
- **só INSERE.** Não há `UPDATE` e não há `DELETE` no script inteiro. Peça cujo
  código já existe é PULADA — se a loja corrigiu um nome na tela, a correção
  dela ganha do pacote;
- **rodar duas vezes é rodar uma.** A peça vira `legado-L001` e a noiva vira
  `legado-lead-0001`: a segunda passada esbarra na chave e não escreve. A conta
  do fim prova isso — ela relê o banco depois de escrever;
- **uma transação só.** Ou entra tudo, ou não entra nada;
- **o catálogo casa por NOME** (`Tipo de peça → Noiva`), resolvido contra o que
  o seed criou NESTA instalação. Classificação sem casa é relatada e pulada: a
  peça entra, sem o atributo, e ninguém fica com um vínculo apontando para o id
  de outro banco.

## 5. Se o pacote precisar ser regerado

O de hoje já está versionado; regerar só faz sentido se a loja mexer no
`moscow_base` antes da virada.

```sh
DATABASE_URL="postgres://…/moscow_base" \
  pnpm --filter @workspace/api-server exec tsx ../../scripts/exportar-legado.ts \
  > docs/legado/2026-08-17-caderno.json
```

O script recusa exportar se o banco tiver mais de uma loja e nenhuma for
escolhida — é a lição da S-R9, em que uma consulta sem `loja_id` escreveu o
dobro num banco de duas lojas.

## 6. O que fica para a loja, depois da importação

1. **conferir o preço de cada peça** — os R$ 2.000,00 e o realuguel de
   R$ 1.500,00 são provisórios, e cada peça diz isso na própria ficha;
2. **classificar a L084** (*"Solussaia + Manga"*) — é a única sem *Tipo de
   peça*, porque o nome não decide se é vestido ou peça avulsa;
3. **completar o WhatsApp das noivas** — o caderno não tem telefone. O nome é
   tudo o que o papel dá;
4. **as semanas que faltam**: o verso da semana de 21–27/09 não foi fotografado
   e as semanas de 28/09 a 11/10 não existem em foto. **As 136 saídas são
   PISO**, e a decisão de 16/08/2026 foi que não há mais fotos.
