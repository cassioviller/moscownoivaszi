import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E10/E99 — **a régua da ação destrutiva**, escrita uma vez.
 *
 * ## A regra
 *
 * 1. Toda ação que **apaga, desfaz dinheiro ou tira acesso** pede confirmação.
 * 2. A confirmação **nomeia o objeto** ("o portal de Marina", "Parcela 3") **e
 *    o que se perde** — o valor em dinheiro quando houver, e o que deixa de
 *    funcionar quando não houver.
 * 3. A ação de confirmar é vermelha; o gatilho, quando exposto numa fileira,
 *    não precisa ser.
 *
 * ## O que a régua NÃO diz, e por que o backlog dizia
 *
 * O backlog pedia *"exposta só com `variant=\"destructive\"` de verdade"*.
 * **Essa grafia não existe no app** — medido: zero gatilhos a usam, e o único
 * `<Button variant="destructive">` é o de CONFIRMAR dentro de um diálogo. Pior:
 * `DropdownMenuItem` **não tem prop `variant`** (o `dropdown-menu.tsx` restaurado
 * na parte 1 é a versão antiga do shadcn), então o caminho do `…` — que a mesma
 * regra manda usar — seria incapaz de cumpri-la. Pedir uma grafia que o
 * componente não aceita é escrever uma régua que ninguém pode seguir.
 *
 * A cor mora na AÇÃO DE CONFIRMAR, que é onde o gesto acontece.
 *
 * ## O que NÃO é destrutivo, e é decisão
 *
 * **"Desfazer retirada" e "Desfazer devolução"** (`reservas/[bloqueioId].tsx`)
 * não ganham confirmação. Elas SÃO o desfazer que o E97 criou justamente para
 * que errar fosse barato; embrulhar um desfazer num diálogo devolve o custo que
 * ele existia para tirar, e o gesto é reversível pelo botão ao lado.
 *
 * ## O escopo desta varredura, dito por extenso
 *
 * A lição do D15 — dado por fechado TRÊS vezes porque o nome prometia mais do
 * que os asserts olhavam — aplicada ao próprio teste:
 *
 * ✔ cobre: `<Button>` cujo texto ou `aria-label` começa por um dos verbos da
 *   LISTA abaixo, em `src/pages/**` e `src/components/**`.
 * ✘ NÃO cobre: ação destrutiva com outro rótulo (a lista é fechada, e o
 *   `PERDOADOS` diz caso a caso por que cada exceção é exceção).
 * ✘ NÃO cobre: se a confirmação nomeia o objeto — isso é prosa, e afirmar
 *   mecanicamente que "nomeia" seria exatamente o assert que promete demais.
 *   O que dá para verificar é que a descrição **interpola algum valor**, e é só
 *   isso que o segundo caso faz.
 */

/** Os verbos que abrem uma ação destrutiva. Lista FECHADA, de propósito. */
const VERBOS = [
  "Remover",
  "Excluir",
  "Apagar",
  "Estornar",
  "Revogar",
  "Anonimizar",
  "Restaurar padrão",
];

const RAIZ = join(import.meta.dirname, "..");

/**
 * Rótulos que casam um verbo e NÃO são ações destrutivas, com o motivo ao lado.
 * Sem o motivo escrito, uma lista de perdão vira lugar onde o defeito se
 * esconde — foi o que o E96 estabeleceu ao criar a primeira.
 */
const PERDOADOS: Record<string, string> = {
  "Remover faixa":
    "mexe em estado de formulário NÃO SALVO (comissoes/index.tsx) — nada foi ao servidor",
  "Remover item":
    "linha de orçamento em rascunho; o orçamento só existe depois de enviado",
};

/**
 * A enumeração sai do versionamento, não do disco (S-D30). Caminhos relativos
 * a `src/`.
 */
function fontes(): string[] {
  return arquivosVersionados(RAIZ, ["."]).filter(
    (r) => /\.tsx$/.test(r) && !/\.test\.tsx$/.test(r),
  );
}

/** Comentário não é interface. (Mesma decisão de `datas-varredura`.) */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("a régua da ação destrutiva (E10)", () => {
  /**
   * O caso que vale: um gatilho destrutivo tem de ter, no MESMO arquivo, um
   * `AlertDialog` — que é como este app pede confirmação. Não prova que o
   * diálogo é daquele botão; prova que o arquivo sabe o que é confirmar. É
   * grosseiro e é honesto: o alvo são as telas que não têm confirmação
   * NENHUMA, que eram oito quando esta régua foi escrita.
   */
  it("todo arquivo com gatilho de verbo destrutivo tem AlertDialog — não prova o par, prova a ausência", () => {
    const semConfirmacao: string[] = [];

    for (const relativo of fontes()) {
      const codigo = semComentarios(readFileSync(join(RAIZ, relativo), "utf8"));
      const temGatilho = VERBOS.some((verbo) => {
        const re = new RegExp(`["'\`>]\\s*${verbo}\\b`);
        if (!re.test(codigo)) return false;
        // Perdão só vale se o rótulo perdoado for a ÚNICA ocorrência do verbo.
        const perdoado = Object.keys(PERDOADOS).filter((r) => codigo.includes(r));
        if (perdoado.length === 0) return true;
        const semPerdoados = perdoado.reduce((s, r) => s.split(r).join(""), codigo);
        return re.test(semPerdoados);
      });
      if (temGatilho && !codigo.includes("AlertDialog")) {
        semConfirmacao.push(`src/${relativo}`);
      }
    }

    expect(semConfirmacao).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 117 arquivos `.tsx` versionados em `src/`, fora os testes —
   * com folga para baixo.
   */
  it("a varredura olha os arquivos de verdade, não um conjunto vazio", () => {
    expect(fontes().length).toBeGreaterThan(100);
  });

  /**
   * ## A segunda cláusula NÃO tem teste, e recusá-lo é a decisão
   *
   * "A confirmação nomeia o objeto e o que se perde" é a metade que mais vale
   * da régua — e eu escrevi um assert para ela: *nenhuma
   * `AlertDialogDescription`, em arquivo com verbo destrutivo, é frase 100%
   * fixa* (proxy: contém `{`). Rodou, e acusou **cinco**. Nenhuma das cinco era
   * o defeito:
   *
   * - `reservas/[bloqueioId].tsx` — *"Confira agora, com a peça na mão…"*: é a
   *   confirmação de **registrar devolução**, que não é destrutiva. O arquivo
   *   tem um verbo da lista em outro lugar, e o proxy não sabe disso.
   * - `comissoes/index.tsx` ×2 — *"O estorno deixa de carregar para os próximos
   *   meses… Fica no registro quem baixou"*: fixa, e **completa**. Quem clicou
   *   já escolheu a vendedora numa linha que o título nomeia.
   * - `configuracoes/privacidade.tsx` — *"Nome, contato e local do casamento das
   *   noivas perdidas há mais de 24 meses serão removidos DE FORMA
   *   IRREVERSÍVEL"*: fixa, e diz exatamente o que se perde.
   * - `orcamentos/[id].tsx` — *"O orçamento deixa de ser editável e fica
   *   registrado como recusado"*: a tela É de um orçamento só.
   *
   * O defeito que a régua existe para pegar — *"A parcela volta para em aberto"*
   * em `receber.tsx` — não se distingue dessas cinco **pela forma**. Ele se
   * distingue pelo contexto: o diálogo abre de uma LINHA de uma lista de
   * dezenas, e sem o nome ninguém sabe qual. Interpolação é sintoma disso, não
   * causa; e um assert que confunde os dois **acusa cinco inocentes para pegar
   * um culpado**.
   *
   * Isto é o erro do D15 pelo avesso: lá o teste prometia mais do que olhava,
   * aqui ele acusaria mais do que a régua diz. Nos dois casos o custo é o mesmo
   * — **desligar a suspeita de quem vem depois**, agora por ruído em vez de por
   * silêncio.
   *
   * Fica como régua escrita, cobrada na revisão. O que sobrou de mecânico é o
   * caso acima, e ele só promete o que olha: a **ausência** de confirmação.
   */
});
