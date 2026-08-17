-- E271 — o perfil do dono deixa de estar no gênero errado.
--
-- O `manual do proprietário` já declarava o defeito e por que ele esperava:
-- *"O perfil se chama 'Proprietária' na tela, no feminino, e o proprietário do
-- ateliê é você. Corrigir mexe na semente do sistema — pede um script para as
-- instalações que já gravaram o nome antigo"*. Este é o script.
--
-- A instalação de PRODUÇÃO não precisa dele: ela nasce depois do E271 e o seed
-- já grava "Proprietário". Ele existe para os bancos que já rodaram o seed
-- antigo — o `heliumdb` do desenvolvimento, o `moscow_base` da loja, e qualquer
-- cópia de teste.
--
-- **O id NÃO muda.** `perfil-proprietaria` é chave estrangeira de
-- `usuarios_lojas.perfil_id`: renomear a chave arrastaria todo vínculo de
-- usuário com loja por nenhum ganho — o id é opaco e ninguém o lê na tela. O
-- que a tela mostra é `nome`, e é `nome` que este arquivo corrige.
--
-- Idempotente: a segunda passada não encontra linha e não faz nada
-- (`UPDATE 0`). Não apaga, não cria, não toca em permissão nenhuma.
BEGIN;

UPDATE perfis
   SET nome = 'Proprietário'
 WHERE id = 'perfil-proprietaria'
   AND nome = 'Proprietária';

COMMIT;

-- Conferência (esperado: uma linha, `perfil-proprietaria | Proprietário`):
--
--   SELECT id, nome FROM perfis WHERE id = 'perfil-proprietaria';
