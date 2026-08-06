/**
 * Qual loja a suíte E2E usa — e por que não é "a mais antiga" (S-D27).
 *
 * O critério era a IDADE, e ele falhava **sem vermelho**: medido em 2026-08-06,
 * o banco de dev tinha 25 lojas e 23 delas eram `Loja Teste …`/`Loja Vazia …`
 * deixadas por fixtures de API. A herdeira imediata da loja do seed era a
 * `Loja Teste 214cda2c` (2026-07-21), com 0 vestidos, 0 noivas, 0 cabines e 0
 * atributos — e a suíte rodaria contra ela em VERDE, porque desde o E147/E156
 * cada spec traz os próprios dados (46 dos 59 escrevem por API) e as fixtures
 * `e2e-*` são recriadas na loja que ganhar. A margem era zero: nenhuma loja
 * deste banco é mais velha que a do seed, então qualquer linha com `created_at`
 * anterior — um restore, um import do acervo de papel, um `INSERT` à mão —
 * levava a suíte junto.
 *
 * O que o silêncio custa, medido: dos 156 testes, **12 passam contra qualquer
 * loja por desenho** (`13-onda2-telas.spec.ts:34` e `14-onda3-financeiro.spec.ts:33`
 * geram 6 cada num laço e só afirmam que o heading monta e que nenhuma `/api`
 * responde ≥400 — lista vazia devolve `200 []`), **4 viram `skipped`** contra
 * loja sem contrato, e o único assert escrito para provar "esta loja tem dados"
 * é satisfeito por zero: `03-dashboard.spec.ts:20-22` faz
 * `expect(kpi).not.toBeEmpty()` e a tela renderiza `{total || 0}`.
 *
 * A âncora estável é o ID, e ele já existia: `LOJA_PADRAO.id` em
 * `artifacts/api-server/src/lib/configuracao-inicial.ts`, sobreponível por
 * `SEED_LOJA_ID` desde o E147. O diretório `e2e/` não alcança
 * `@workspace/api-server` (a raiz não o declara como dependência), então o
 * literal é repetido aqui e **casado por teste** — `00-loja-da-suite.spec.ts`,
 * que é a regra 26 aplicada: dois literais iguais que ninguém casa divergem em
 * silêncio.
 *
 * E o que some é o fallback: banco sem a loja da suíte passa a ser erro alto.
 * **Escolher outra é o defeito**, não a recuperação.
 */
export const LOJA_DA_SUITE_PADRAO = "84e539bd-9199-4551-8ae5-7619868f62d3";

export type LojaCandidata = { id: string; nome: string; createdAt: Date };

/** O id configurado: `E2E_LOJA_ID` > `SEED_LOJA_ID` > o default do dev. */
export function idDaLojaDaSuite(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.E2E_LOJA_ID ?? env.SEED_LOJA_ID;
  return v != null && v.trim() !== "" ? v.trim() : LOJA_DA_SUITE_PADRAO;
}

export function escolherLojaDaSuite<T extends LojaCandidata>(
  lojas: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): T {
  const id = idDaLojaDaSuite(env);
  const eleita = lojas.find((l) => l.id === id);
  if (eleita) return eleita;

  const amostra = [...lojas]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 3)
    .map((l) => `${l.nome} (${l.id})`)
    .join(", ");
  throw new Error(
    `[e2e-setup] a loja da suíte (${id}) não existe neste banco. ` +
      `A suíte NÃO elege outra: rodar contra a loja errada sai VERDE e não prova nada (S-D27). ` +
      `Rode o seed oficial — pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts — ` +
      `ou aponte E2E_LOJA_ID para a loja certa. ` +
      `As ${lojas.length} lojas deste banco começam por: ${amostra || "nenhuma"}.`,
  );
}
