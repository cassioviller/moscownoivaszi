import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A régua (d) dos manuais — **nenhuma das três olhava para DENTRO** (S-C222).
 *
 * A `varredura-manuais` confere o MENU contra os perfis semeados, a
 * `varredura-manuais-prazos` confere os NÚMEROS contra as constantes, a
 * `varredura-manuais-textos` confere as CITAÇÕES contra a tela. As três olham
 * do manual para fora — e foi assim que o contorno do E196 sobreviveu **dez
 * épicos** no manual da costureira: a seção 5 dizia *"a confecção pura não tem
 * tela onde ser cadastrada hoje"* enquanto a seção 1 descrevia o botão
 * `Nova confecção` e a lista "O que saiu daqui" dizia *"Agora tem"*. Um
 * documento que se contradiz não contradiz fonte nenhuma, e ninguém olhava.
 *
 * ## O que se prega aqui, e o que a calibragem mediu antes de pregar
 *
 * **1. Contradição interna** — um manual que cita um chip `class="btn"` não
 * afirma, no mesmo arquivo, que a tela para aquilo não existe. A frase-alvo é
 * a **negação de existência de UI** (*"não tem tela/botão/formulário"*), e o
 * elo com o chip é a **identidade dele: as palavras que não são a ação**.
 * A primeira versão usava toda palavra ≥ 5 letras do rótulo e reprovou na
 * medição: *"noiva"*, *"prova"* e *"reserva"* estão em chip demais — nove
 * falsos positivos em cinco manuais, inclusive `Registrar retirada` acusado
 * pela palavra *"registrar"* numa frase sobre outro gesto. Descartar a
 * primeira palavra do rótulo (a ação: Registrar, Criar, Nova…) zerou os
 * falsos e manteve o achado plantado do E196 (`Nova confecção` → confecção).
 *
 * **2. Dívida declarada** — toda frase que nega existência de UI entra na
 * tabela abaixo, com o motivo. É o idioma da dívida declarada de
 * `comissao.ts`: frase nova reprova até ser declarada, e frase declarada que
 * o manual já não tem reprova até a baixa — a lição do E186 é que tabela de
 * dívida também envelhece, e aqui as duas direções são cobradas. A própria
 * calibragem provou por que isto existe: das cinco frases de hoje, **quatro
 * envelheceram** — três no E226 (o perdão da multa ganhou botão,
 * `contratos/[id].tsx:933`, e dois manuais dizem que ele não existe) e uma
 * no E230 (o portal mostra a devolução, `noiva-portal.tsx:603-615`) — todas
 * S-C270.
 *
 * ## Ponto cego declarado
 *
 * A frase que nega SEM nomear a identidade de chip nenhum (o próprio caso do
 * perdão: nenhum manual cita `Perdoar multa` ainda) não é contradição interna
 * — é possível staleness contra o SISTEMA, e quem a segura é a dívida
 * declarada, não o cruzamento com chips. Verificar a verdade dela contra a
 * tela é a quinta régua, se um dia valer o preço. O tamanho do buraco foi
 * medido na abertura: **quatro das cinco frases de hoje são falsas** — três
 * pelo E226 (o perdão tem botão) e uma pelo E230 (o portal mostra a
 * devolução) —, todas de épicos posteriores à reescrita dos manuais da manhã
 * de 14/08. É a regra do E196 outra vez: manual se reescreve depois da onda,
 * e a onda E223–E232 acabou sem a reescrita (S-C270).
 *
 * **Enumera com `git ls-files`** (regra da casa).
 */

const RAIZ = path.resolve(__dirname, "../../../..");

function porGit(padroes: string[]): string[] {
  return execFileSync("git", ["ls-files", ...padroes], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), "utf8");
const manuais = () => porGit(["docs/manuais/*.html"]).filter((f) => f.endsWith(".html"));

/**
 * A negação de existência de UI. Verbos de existir/estar + até duas palavras
 * + o substantivo de tela. `gesto` ficou de fora de propósito: *"não há gesto
 * nenhum para disparar um aviso"* (vendedora) é frase VERDADEIRA sobre o
 * sistema agir sozinho, e entrava. `campo` idem, com população zero hoje.
 */
const NEGACAO_DE_UI =
  /\bnão\s+(?:tem|têm|há|existe|existem|está|estão)\s+(?:\p{L}+\s+){0,2}?(?:tela|telas|botão|botões|formulário|formulários)\b/iu;

/** Os chips do documento, crus. */
function chipsDe(html: string): string[] {
  return [...html.matchAll(/<span class="btn"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]!.trim());
}

/**
 * A prosa AFIRMADA do documento, em frases.
 *
 * Entre aspas curvas o manual CITA (a tela, ou o conselho envelhecido que ele
 * manda ignorar — costureira.html:454) — citação sai antes de tudo. Fechamento
 * de bloco vira fim de frase: sem isso, o título `Prova de noiva sem reserva`
 * colava na frase seguinte e a calibragem achou quatro contradições que eram
 * um `<h3>` grudado num parágrafo.
 */
function frasesDe(html: string): string[] {
  return html
    .replace(/“[^”]*”/g, " ")
    .replace(/<\/(?:p|li|td|th|h[1-6]|caption|div|blockquote|figcaption)>/g, " .\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

const negacoesDe = (html: string) => frasesDe(html).filter((f) => NEGACAO_DE_UI.test(f));

/**
 * A identidade do chip: as palavras ≥ 5 letras DEPOIS da primeira — a
 * primeira é a ação (Registrar, Criar, Nova, Copiar…), e ação aparece em
 * frase demais para ligar alguma coisa. Chip de uma palavra não tem
 * identidade separável e fica fora do alcance, declarado acima.
 */
function identidadeDoChip(chip: string): string[] {
  return chip
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .slice(1)
    .filter((w) => w.length >= 5);
}

/** O par que o E196 sofreu: a negação que nomeia a identidade de um chip do MESMO documento. */
function contradicoesDe(html: string): string[] {
  // O mesmo chip citado três vezes é UMA contradição — medido no plantado.
  const chips = [...new Set(chipsDe(html))];
  const achadas: string[] = [];
  for (const frase of negacoesDe(html)) {
    for (const chip of chips) {
      const elo = identidadeDoChip(chip).filter((w) =>
        new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, "u").test(frase.toLowerCase()),
      );
      if (elo.length > 0) achadas.push(`chip «${chip}» × «${frase}» (elo: ${elo.join(", ")})`);
    }
  }
  return achadas;
}

/**
 * Toda negação de existência de UI, declarada com o motivo. As três marcadas
 * S-C270 envelheceram no E226 (o perdão da multa TEM botão desde `6d1cf08a`)
 * e esperam a reescrita do manual — quando ela vier, este teste cobra a baixa.
 */
const DIVIDA_DECLARADA: { manual: string; trecho: string; motivo: string }[] = [
  {
    manual: "docs/manuais/noiva.html",
    trecho: "A data de DEVOLUÇÃO não está nesta tela",
    motivo:
      "ENVELHECIDA (S-C270) — o portal mostra devolução prevista e feita desde o E230 (noiva-portal.tsx:603-615), quando o contrato tem a data",
  },
  {
    manual: "docs/manuais/proprietario.html",
    trecho: "o gesto não existe em tela nenhuma",
    motivo: "ENVELHECIDA (S-C270) — o perdão da 9ª tem botão desde o E226: contratos/[id].tsx:933",
  },
  {
    manual: "docs/manuais/recepcao.html",
    trecho: "não há botão escondido",
    motivo: "verdade — reservar peça é do acervo, e o perfil da Recepção só consulta",
  },
  {
    manual: "docs/manuais/vendedora.html",
    trecho: "ainda não tem botão",
    motivo: "ENVELHECIDA (S-C270) — «Perdoar multa» existe na ficha do contrato desde o E226",
  },
  {
    manual: "docs/manuais/vendedora.html",
    trecho: "ainda não está em tela nenhuma",
    motivo: "ENVELHECIDA (S-C270) — a mesma nota da vendedora, segunda frase",
  },
];

describe("varredura — o manual não contradiz a si mesmo (S-C222)", () => {
  it("a varredura tem o que varrer — piso de população", () => {
    // Regra 34: renomear a classe do chip ou mudar a marcação deixaria tudo
    // verde por vacuidade. Medido em 2026-08-15: 185 chips nos cinco manuais.
    const docs = manuais();
    expect(docs.length).toBe(5);
    const chips = docs.flatMap((m) => chipsDe(ler(m)));
    expect(chips.length).toBeGreaterThanOrEqual(150);
    for (const doc of docs) expect(chipsDe(ler(doc)).length, `${doc} ficou sem chips`).toBeGreaterThan(0);
  });

  it("nenhum manual nega a existência do que ele mesmo cita como chip", () => {
    const contradicoes = manuais().flatMap((m) => contradicoesDe(ler(m)).map((c) => `${m} · ${c}`));
    expect(
      contradicoes,
      `o manual cita o botão e diz que a tela não existe:\n${contradicoes.join("\n")}`,
    ).toEqual([]);
  });

  it("toda negação de existência de UI é dívida declarada, e toda dívida ainda existe", () => {
    const naoDeclaradas = manuais().flatMap((m) => {
      const trechos = DIVIDA_DECLARADA.filter((d) => d.manual === m).map((d) => d.trecho);
      return negacoesDe(ler(m))
        .filter((f) => !trechos.some((t) => f.includes(t)))
        .map((f) => `${m} · «${f}»`);
    });
    expect(
      naoDeclaradas,
      `frase nova negando UI sem declaração — declare-a aqui com o motivo, ou conserte o manual:\n${naoDeclaradas.join("\n")}`,
    ).toEqual([]);

    const pagas = DIVIDA_DECLARADA.filter(
      (d) => !negacoesDe(ler(d.manual)).some((f) => f.includes(d.trecho)),
    ).map((d) => `${d.manual} · «${d.trecho}»`);
    expect(
      pagas,
      `dívida declarada que o manual já não tem — dê baixa na tabela:\n${pagas.join("\n")}`,
    ).toEqual([]);
  });

  /** O par da S-C180: a peneira PROVA que acha o plantado e ignora o que não é. */
  it("acha o plantado: o par exato que o E196 sofreu", () => {
    const plantado =
      `<p>O botão <span class="btn">Nova confecção</span> fica no alto da fila.</p>` +
      `<p>A confecção pura, sem peça da loja, não tem tela onde ser cadastrada hoje.</p>`;
    const achadas = contradicoesDe(plantado);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]).toContain("Nova confecção");
    expect(achadas[0]).toContain("não tem tela onde ser cadastrada");
  });

  it("ignora o que não é: citação, negação de outra coisa, e o falso positivo medido", () => {
    // Entre aspas curvas o manual CITA — o conselho envelhecido da costureira.
    const citado =
      `<p>O botão <span class="btn">Nova confecção</span> existe.</p>` +
      `<p>Se te ensinaram que “confecção não tem tela onde ser cadastrada”, esse conselho envelheceu.</p>`;
    expect(contradicoesDe(citado)).toEqual([]);

    // "não tem janela" nega outra coisa — não é negação de UI.
    expect(negacoesDe(`<p>A lista de atendimentos não tem janela: combina-se depois.</p>`)).toEqual([]);

    // O falso positivo que a calibragem mediu: a AÇÃO do chip («registrar»)
    // aparece na frase, a identidade («retirada») não — não é contradição.
    const medido =
      `<p><span class="btn">Registrar retirada</span></p>` +
      `<p>O sistema sabe registrar quem dispensou, mas esse aviso não está em tela nenhuma.</p>`;
    expect(negacoesDe(medido)).toHaveLength(1);
    expect(contradicoesDe(medido)).toEqual([]);
  });
});
