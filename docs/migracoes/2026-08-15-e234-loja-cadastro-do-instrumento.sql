-- E234/S-C300 (D7, respondida SIM em 15/08/2026) — o que o instrumento imprime
-- da LOCADORA e o cadastro da loja não guardava: a cidade e a UF do foro (21ª)
-- e do fecho, quem assina pela loja (1ª página: nome, RG, CPF) e a linha do
-- PIX ao pé da assinatura. Sete colunas, todas nulas: a instalação existente
-- não muda de comportamento até alguém preencher em Configurações → Dados da
-- loja, e o papel imprime a lacuna até lá.
--
-- Aplicado no `heliumdb` (dev) em 2026-08-15. Um banco existente roda:

ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS representante_nome text,
  ADD COLUMN IF NOT EXISTS representante_rg text,
  ADD COLUMN IF NOT EXISTS representante_cpf text,
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_titular text;
