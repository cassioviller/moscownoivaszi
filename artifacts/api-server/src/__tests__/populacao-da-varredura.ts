import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Os dois utilitários que toda varredura de população usa para aprender sobre
 * si mesma — nascidos juntos porque respondem às duas metades da mesma
 * pergunta: *a sonda está olhando para o conjunto certo?*
 *
 * ## `diferencaNomeada` — a população se afirma por DIFERENÇA, não por tamanho (S-C79)
 *
 * O piso de população (`expect(populacao.length).toBeGreaterThan(200)`) é o
 * único número de uma varredura que NADA deriva: ele foi medido uma vez, e
 * envelhece verde. Medido em 2026-08-15: a prosa da varredura de portas dizia
 * *304 arquivos* (2026-08-13) e a população era **315** — onze arquivos em
 * dois dias, com o piso `> 200` sem sentir nenhum. O piso protege a sonda de
 * CEGAR e não protege de nada mais; em particular, ele não sente **um recorte
 * novo no enumerador**: um quarto `.filter` que apagasse `routes/` inteira
 * passaria com folga.
 *
 * A saída sem número mágico é afirmar a DIFERENÇA: o teste declara, no próprio
 * arquivo, as pastas e os recortes que o enumerador PROMETE aplicar, recomputa
 * a referência por `git ls-files`, e cobra que a diferença seja vazia — nas
 * duas direções, com os arquivos NOMEADOS. Recorte não-declarado no enumerador
 * aparece em `aMenosNaPopulacao`, com nome; pasta removida idem. O vermelho é
 * uma lista curta e legível, não um `expected 214 to be greater than 200`.
 *
 * O que ela NÃO substitui: a referência do teste e o enumerador podem esvaziar
 * JUNTOS (um `.gitignore` novo sobre a pasta inteira). `arquivosVersionados`
 * já falha alto com prefixo vazio, e quem usa a diferença mantém um
 * `toBeGreaterThan(0)` sobre a população — zero não é número mágico.
 */
export function diferencaNomeada(
  populacao: readonly string[],
  referencia: readonly string[],
): { aMaisNaPopulacao: string[]; aMenosNaPopulacao: string[] } {
  const pop = new Set(populacao);
  const ref = new Set(referencia);
  return {
    aMaisNaPopulacao: [...pop].filter((r) => !ref.has(r)).sort(),
    aMenosNaPopulacao: [...ref].filter((r) => !pop.has(r)).sort(),
  };
}

/**
 * ## `comArquivoSintetico` — a encenação do arquivo plantado, escrita uma vez (S-C182)
 *
 * Três épicos seguidos (S-C33, S-C46, S-C130) provaram uma régua criando um
 * arquivo sintético, rodando `git add`, medindo e desfazendo — cada um
 * reescrevendo o ritual de cabeça, e o ritual tem um degrau que não perdoa:
 * **o `git add` é OBRIGATÓRIO, porque a população vem de `git ls-files`.**
 * Arquivo no disco sem index não existe para a varredura: a encenação "passa"
 * em silêncio — verde por não ter olhado, de novo. Medido em 2026-08-15:
 * `git ls-files` sobre o arquivo recém-escrito devolve NADA antes do
 * `git add -N`, e o caminho completo depois.
 *
 * O que a função faz, na ordem, e o que cada passo compra:
 *
 * 1. recusa sobrescrever caminho que já exista — a limpeza do `finally` apagaria
 *    um arquivo de verdade;
 * 2. escreve o conteúdo e roda `git add -N` (intent-to-add): o arquivo entra no
 *    `git ls-files` sem levar o CONTEÚDO ao index, então o `git reset` do
 *    desfazer não tem staging para perder;
 * 3. roda a medição;
 * 4. **`finally`**: tira do index (`git reset -q --`) e apaga o arquivo — também
 *    quando a medição estoura, que é justamente quando o esquecimento acontecia.
 *
 * O conteúdo plantado deve ser INERTE para as outras varreduras (a suíte roda
 * arquivos de teste em paralelo, e o arquivo existe no index durante a
 * medição): um `export const` sem formatador, sem `z.enum`, sem escrita de
 * tabela — a não ser que a escrita seja exatamente o que se quer plantar.
 */
export function comArquivoSintetico<T>(
  raiz: string,
  relativo: string,
  conteudo: string,
  medir: () => T,
): T {
  const absoluto = join(raiz, relativo);
  if (existsSync(absoluto)) {
    throw new Error(
      `${relativo} já existe — a encenação apagaria um arquivo de verdade no finally. ` +
        `Escolha um nome sintético que não colida.`,
    );
  }
  writeFileSync(absoluto, conteudo);
  try {
    execFileSync("git", ["add", "-N", "--", relativo], { cwd: raiz });
    return medir();
  } finally {
    // Ordem inversa da montagem; cada passo engole a própria falha para que o
    // outro ainda rode — meio desfazer é melhor que nenhum.
    try {
      execFileSync("git", ["reset", "-q", "--", relativo], { cwd: raiz });
    } catch {
      /* o add pode nem ter acontecido */
    }
    rmSync(absoluto, { force: true });
  }
}
