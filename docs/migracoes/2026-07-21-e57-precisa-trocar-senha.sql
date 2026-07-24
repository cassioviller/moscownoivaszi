-- E57 — marca a senha escolhida por OUTRA pessoa, para o sistema cobrar a
-- troca na primeira entrada.
--
-- Aditivo: `drizzle-kit push` aplica sozinho. Fica versionado porque um banco
-- já existente precisa da coluna antes de a rota /auth/senha rodar.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS precisa_trocar_senha boolean NOT NULL DEFAULT false;

-- Default FALSE de propósito, sem backfill. Marcar todo mundo como pendente
-- trancaria a loja inteira do lado de fora numa manhã de terça — inclusive
-- quem escolheu a própria senha. A cobrança começa a valer para os acessos
-- criados DAQUI PARA A FRENTE, que é onde o problema nasce.
