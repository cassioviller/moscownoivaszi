-- E97/F22+F23 — a avaria passa a saber que já foi cobrada.
--
-- O DEFEITO. "Cobrar reparo" criava uma parcela avulsa no contrato e não
-- guardava vínculo nenhum. A tela não mudava de estado depois do clique, então
-- clicar duas vezes — o que acontece quando a rede demora e a pessoa insiste —
-- criava DUAS parcelas no carnê da noiva, cobrando o mesmo conserto duas vezes.
-- Nada no sistema sabia que eram a mesma coisa.
--
-- E o irmão: a avaria é apagada por um toque num ícone de 28px, sem
-- confirmação. A FOTO é a prova que sustenta a cobrança — some com ela —,
-- enquanto a parcela que ela gerou continua viva no carnê. A noiva fica devendo
-- por um dano que o sistema não consegue mais mostrar.
--
-- A COLUNA. `parcela_id` liga a avaria à cobrança que ela gerou:
--   - a segunda cobrança vira 409 idempotente, em vez de segunda parcela;
--   - a remoção da avaria é RECUSADA enquanto o vínculo existir;
--   - a tela mostra "Cobrado — ver parcela" e leva até lá.
--
-- ON DELETE SET NULL, e não CASCADE: a regra do `replit.md` é que perder o
-- vínculo é recuperável e perder o registro do que aconteceu não é. Se alguém
-- remover a parcela pelo caminho legítimo (que só aceita PREVISTA), a avaria e
-- a foto continuam — e ela volta a ser cobrável, que é o comportamento certo.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'avarias' AND column_name = 'parcela_id'
  ) THEN
    RAISE EXCEPTION 'E97: avarias.parcela_id já existe — migração já aplicada';
  END IF;
END $$;

ALTER TABLE avarias
  ADD COLUMN parcela_id text REFERENCES parcelas(id) ON DELETE SET NULL;

COMMENT ON COLUMN avarias.parcela_id IS
  'E97: a parcela que cobrou este reparo. Preenchida = já cobrada (2ª cobrança é 409, e a avaria não pode ser removida).';

CREATE INDEX IF NOT EXISTS avarias_parcela_id_idx ON avarias (parcela_id);

-- Sem backfill possível, e é honesto dizer por quê: as parcelas de reparo já
-- criadas têm a descrição "Reparo de avaria — <descricao>", mas casar por texto
-- adivinharia — duas avarias com a mesma descrição no mesmo contrato são
-- indistinguíveis, e é justamente o caso do duplo clique que este épico
-- conserta. As antigas ficam sem vínculo: cobráveis de novo (a loja confere no
-- carnê) e removíveis. A guarda vale para o que nasce daqui para frente.

COMMIT;
