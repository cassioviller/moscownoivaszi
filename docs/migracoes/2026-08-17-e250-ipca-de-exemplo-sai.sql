-- E250/S-R5 — o IPCA "de exemplo" sai do banco que já existe.
--
-- O E242 (`3029efba`) gateou o ESCRITOR: os 12 meses de índice de exemplo do
-- P4/E237 passaram a nascer só sob `SEED_IPCA_EXEMPLO=true`, que é a
-- instalação de TESTE. A instalação real passou a nascer sem índice, e a 9ª
-- fica DITA — mês sem número não corrige, e a fila diz qual falta — até a dona
-- digitar o IPCA publicado em Configurações → Índices.
--
-- **O que o E242 não fez foi olhar para trás.** Quem rodou o seed ANTES dele
-- ficou com os 12 meses inventados gravados, e a mora não distingue exemplo de
-- índice publicado: ela lê `indices_monetarios` e imprime "Correção pelo IPCA
-- de 04/2026 a 07/2026 (1,58%)" como FATO no carnê, no portal e na trilha.
--
-- Medido no `heliumdb` em 17/08/2026, antes de aplicar:
--
--     loja 84e539bd… (822 contratos, 110 parcelas vencidas em aberto)
--       13 linhas de índice = 11 de exemplo + 2 confirmadas pela dona
--     loja demo-manuais-loja (1 contrato)
--       12 linhas, marcadas 'demonstração (valor de exemplo)'
--
-- ## O que esta migração APAGA, e o que ela não toca
--
-- Apaga **só** o que a marca do seed identifica. A marca é a constante
-- `MARCA_DO_IPCA_DE_EXEMPLO` de `api-server/src/lib/configuracao-inicial.ts`,
-- e a varredura `varredura-marca-do-ipca-de-exemplo` cobra que a frase daqui e
-- a de lá sejam a MESMA — duas grafias de um seletor de DELETE é uma faxina
-- que não acha nada e não avisa.
--
-- **Mês que a dona confirmou fica.** Ao gravar pela tela, `atualizado_por`
-- passa a ser o nome de quem gravou, e a linha deixa de casar com esta marca:
-- foi o que aconteceu com as duas linhas `Super Admin` do `heliumdb`. Um
-- número conferido por gente é um IPCA publicado, venha de onde vier.
--
-- **A loja de DEMONSTRAÇÃO fica.** Ela tem marca própria
-- ('demonstração (valor de exemplo)') e é uma loja de demonstração por
-- construção: os contratos dela são inventados, e uma correção inventada sobre
-- eles é o que o print de Configurações → Índices existe para mostrar. Apagar
-- a loja apaga as linhas em cascata.
--
-- ## Por que não filtrar no LEITOR, que é o que a sobra pedia
--
-- A S-R5 escreveu *"o E242 gateou o escritor e deixou o LEITOR cego"*, e
-- prescrevia filtrar `ipcaDaLoja`. **Isso desfaria a decisão do E242**: a
-- instalação de teste existe justamente para sair com a correção da 9ª
-- FUNCIONANDO (foi pedido da dona, `bb03a0f7`), e um leitor que ignora a marca
-- do seed ignora exatamente as linhas que o `SEED_IPCA_EXEMPLO` acabou de
-- gravar. O buraco é de DADO, num banco que já existe — e dado se conserta com
-- migração, não com um `where` que muda o significado do módulo.
--
-- Idempotente por natureza: rodar duas vezes apaga zero na segunda.
BEGIN;

DELETE FROM indices_monetarios
 WHERE atualizado_por = 'seed (valor de exemplo — troque pelo IPCA publicado)';

-- Conferência: o que sobrou, por marca. Uma instalação recém-migrada deve
-- mostrar só linhas com nome de gente (e as da loja de demonstração, se ela
-- existir).
SELECT atualizado_por, count(*)
  FROM indices_monetarios
 GROUP BY atualizado_por
 ORDER BY 2 DESC;

COMMIT;
