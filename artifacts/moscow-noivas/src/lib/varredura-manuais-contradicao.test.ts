import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerDoRepo, manuaisVersionados, rotulosDosChips } from "./manuais-do-repositorio";

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

// S-C271 — o enumerador, a leitura e o piso vêm de um lugar só.
const ler = lerDoRepo;
const manuais = manuaisVersionados;

/**
 * A negação de existência de UI. Verbos de existir/estar + até duas palavras
 * + o substantivo de tela. `gesto` ficou de fora de propósito: *"não há gesto
 * nenhum para disparar um aviso"* (vendedora) é frase VERDADEIRA sobre o
 * sistema agir sozinho, e entrava. `campo` idem, com população zero hoje.
 */
const NEGACAO_DE_UI =
  /\bnão\s+(?:tem|têm|há|existe|existem|está|estão)\s+(?:\p{L}+\s+){0,2}?(?:tela|telas|botão|botões|formulário|formulários)\b/iu;

/**
 * **A segunda forma da negação: "não MOSTRA" (15/08).**
 *
 * A grafia acima nega a EXISTÊNCIA de uma tela. A reescrita desta onda achou
 * duas frases que negam o DADO, e nenhuma delas caía nela — as duas no guia da
 * noiva, na seção *"O que o portal não faz"*, e as duas contradizendo o próprio
 * documento algumas telas acima:
 *
 * - *"**Não mostra a data de devolução.** Ela aparece no PDF do contrato […] e
 *   não na tela"* — enquanto a seção "O seu vestido" já descrevia
 *   *"Devolução combinada para …"* e *"Devolvido em …"* (E230/S-C92);
 * - *"Avaria, atraso, extravio, rescisão e peça exclusiva **não têm seção
 *   nenhuma ali**"* — enquanto o mesmo manual descrevia, duas seções antes, a
 *   seção *"O que o seu contrato prevê"*, que é exatamente as seis cláusulas.
 *
 * As duas sobreviveram à reescrita da S-C270 porque a régua procurava a palavra
 * errada. **Negar o dado é a mesma mentira que negar a tela** — a noiva que lê
 * "não mostra" não vai procurar, e é o custo do E184 pelo lado do que se
 * esconde em vez do que se ensina errado.
 *
 * O elo com o chip não serve aqui (o dado não tem botão), então esta grafia é
 * pregada pela DÍVIDA DECLARADA, como a outra: frase nova reprova até ser
 * declarada, frase declarada que sumiu reprova até a baixa.
 */
const NEGACAO_DE_DADO =
  /\bn[ãa]o\s+(?:mostra|exibe|traz|apresenta|informa)\b(?![^.]*\bo valor\b)/iu;

/**
 * Os chips do documento, crus.
 *
 * S-C271 — a extração saiu daqui e da `varredura-manuais-textos` para
 * `manuais-do-repositorio.ts`: eram DUAS cópias do mesmo regex escritas com
 * captura diferente, e a diferença não era intencional.
 */
const chipsDe = rotulosDosChips;

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

/** As frases que negam o DADO, para a dívida declarada da segunda grafia. */
const negacoesDeDadoDe = (html: string) => frasesDe(html).filter((f) => NEGACAO_DE_DADO.test(f));

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
  // S-C270 (15/08): a frase da noiva sobre a devolução ausente SAIU na
  // reescrita — o guia agora lista «Devolução combinada para …» e
  // «Devolvido em …» entre os estados do card "O seu vestido".
  // S-C270 (15/08): a frase do proprietário sobre o perdão sem tela SAIU na
  // reescrita — o bloco virou "Os dois gestos que faltavam ganharam tela".
  {
    manual: "docs/manuais/recepcao.html",
    trecho: "não há botão escondido",
    motivo: "verdade — reservar peça é do acervo, e o perfil da Recepção só consulta",
  },
  // S-C270 (15/08): as duas frases da vendedora sobre o perdão sem botão
  // SAÍRAM na reescrita — o manual agora ensina «Perdoar multa» e
  // «Restabelecer cobrança». Baixa dada no mesmo commit, como esta régua cobra.
];

describe("varredura — o manual não contradiz a si mesmo (S-C222)", () => {
  it("a varredura tem o que varrer — piso de população", () => {
    // Regra 34: renomear a classe do chip ou mudar a marcação deixaria tudo
    // verde por vacuidade. Medido em 2026-08-15: 185 chips nos cinco manuais.
    const docs = manuais();
    expect(docs.length).toBe(5);
    const chips = docs.flatMap((m) => chipsDe(ler(m)));
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
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

/**
 * **A data do manual, que aparece DUAS vezes e podia divergir.**
 *
 * Todo manual abre com *"Atualizado em DD/MM/AAAA"* no cabeçalho e fecha com
 * *"descreve o sistema como ele está em DD/MM/AAAA"* no rodapé. São a mesma
 * afirmação escrita em dois lugares, e em 15/08/2026 os **cinco** estavam
 * divergindo: a reescrita da S-C270 corrigiu o rodapé e esqueceu o topo, e por
 * um dia os manuais diziam 14/08 na capa e 15/08 no pé.
 *
 * Nenhuma das quatro varreduras pegava: a de contradição procura **negação de
 * existência de UI**, não data; as outras três olham do manual para fora. É
 * contradição interna da mesma classe da S-C222, e por isso mora aqui.
 *
 * A régua não confere se a data está CERTA — isso é leitura humana, e o
 * `git log` é quem sabe. Ela confere que as duas dizem a MESMA coisa, que é o
 * que ninguém lembra de fazer duas vezes seguidas.
 */
const DATA_DO_TOPO = /Atualizado em <b>(\d{2}\/\d{2}\/\d{4})<\/b>/;
const DATA_DO_PE = /(?:descreve o sistema como ele está em) <strong>(\d{2}\/\d{2}\/\d{4})<\/strong>/;

describe("varredura — a data do manual bate consigo mesma", () => {
  it("os cinco manuais têm as duas datas, e elas são iguais", () => {
    const docs = manuais();
    expect(docs.length).toBe(5);

    const divergentes: string[] = [];
    for (const doc of docs) {
      const html = ler(doc);
      const topo = DATA_DO_TOPO.exec(html)?.[1];
      const pe = DATA_DO_PE.exec(html)?.[1];
      expect(topo, `${doc} perdeu a data do cabeçalho`).toBeTruthy();
      expect(pe, `${doc} perdeu a data do rodapé`).toBeTruthy();
      if (topo !== pe) divergentes.push(`${doc}: topo diz ${topo}, rodapé diz ${pe}`);
    }

    expect(
      divergentes,
      "o manual diz duas datas diferentes sobre si mesmo — quem lê o topo e quem lê o pé " +
        "ficam sabendo de versões diferentes. Reescreveu? mude as duas.",
    ).toEqual([]);
  });
});

/**
 * **A dívida da segunda grafia: toda frase que nega o DADO, declarada.**
 *
 * A régua de cima cruza a negação com os CHIPS do documento. Esta não tem como:
 * o dado não tem botão, e não há o que cruzar. O que ela faz é o que o
 * `comissao.ts` faz com a tranca — **obrigar a frase a estar declarada**, nas
 * duas direções: frase nova reprova até alguém escrever por que ela é verdade,
 * e frase declarada que sumiu do manual reprova até a baixa (a lição do E186,
 * de que tabela de dívida também envelhece).
 *
 * As duas primeiras entradas nasceram e morreram no mesmo dia: eram as frases
 * do guia da noiva que a reescrita da S-C270 não pegou, porque a régua daquele
 * dia só conhecia a negação de TELA. Ficam citadas no comentário porque é o
 * caso que motivou esta segunda grafia.
 */
const NEGACOES_DE_DADO_DECLARADAS: { manual: string; trecho: string; motivo: string }[] = [
  // 15/08: SAÍRAM na reescrita, e foram elas que fizeram esta régua nascer —
  //   «Não mostra a data de devolução» (o portal mostra desde o E230/S-C92);
  //   «Avaria, atraso … não têm seção nenhuma ali» (a seção "O que o seu
  //   contrato prevê" existe desde o E230).
  // A frase que ficou no lugar delas nega o VALOR, não o dado, e por isso não
  // cai nesta grafia — o `(?!… o valor)` da regex é exatamente essa distinção.
  {
    manual: "docs/manuais/noiva.html",
    trecho: "Não cobra e não recebe",
    motivo:
      "verdade e permanente — o portal é extrato, e receber dinheiro por ele seria outro produto. " +
      "Não é dívida a pagar: é fronteira do que a loja decidiu não fazer",
  },
  {
    manual: "docs/manuais/noiva.html",
    trecho: "Não avisa você",
    motivo:
      "verdade — não há e-mail nem push em lugar nenhum do sistema; aceite, confirmação e pedido " +
      "de remarcação aparecem nas filas, e é lá que se olha",
  },
  {
    manual: "docs/manuais/noiva.html",
    trecho: "Não manda mensagem para ela",
    motivo: "verdade — quem manda é a vendedora, pelo WhatsApp, com o link colado",
  },
  {
    manual: "docs/manuais/noiva.html",
    trecho: "Não mostra nada de outra noiva",
    motivo: "verdade, e é invariante de segurança: o portal resolve tudo pelo token do próprio link",
  },
  {
    manual: "docs/manuais/recepcao.html",
    trecho: "os números que a fila não mostra porque já saíram dela",
    motivo:
      "verdade, e a própria frase diz por quê — quem confirmou pelo portal, quem já foi procurada " +
      "e quem pediu remarcação saem da fila de propósito; os totais delas ficam no rodapé",
  },
  {
    manual: "docs/manuais/vendedora.html",
    trecho: "não mostra nada — e é o caso da maioria dos contratos antigos",
    motivo:
      "verdade — as duas linhas de retirada e devolução só aparecem quando há data, e o silêncio " +
      "é o certo: 775 dos 776 contratos foram fechados antes de a tela ter esses campos",
  },
  {
    manual: "docs/manuais/vendedora.html",
    trecho: "não mostra mais essa conta: registro morto não se recalcula",
    motivo:
      "verdade e DECISÃO do E217 — a rescisão do contrato cancelado não se recalcula porque ela " +
      "foi decidida noutro dia; o que ele reteve está na trilha e na conta a pagar que nasceu ali",
  },
];

describe("varredura — a negação do DADO também é declarada (15/08)", () => {
  it("toda frase que nega o dado está na lista, com motivo", () => {
    const naoDeclaradas: string[] = [];
    for (const doc of manuais()) {
      for (const frase of negacoesDeDadoDe(ler(doc))) {
        const declarada = NEGACOES_DE_DADO_DECLARADAS.some(
          (d) => d.manual === doc && frase.includes(d.trecho),
        );
        if (!declarada) naoDeclaradas.push(`${doc} · «${frase}»`);
      }
    }
    expect(
      naoDeclaradas,
      "o manual afirma que o sistema NÃO MOSTRA alguma coisa, e ninguém escreveu por que isso é " +
        "verdade. Negar o dado é a mesma mentira que negar a tela — quem lê não vai procurar. " +
        "Confira contra a tela e declare em NEGACOES_DE_DADO_DECLARADAS, ou apague a frase.",
    ).toEqual([]);
  });

  it("nenhuma declaração descreve frase que o manual já não tem — a baixa é cobrada", () => {
    // A outra direção, que é a lição do E186: a lista envelhece do lado de cá
    // também, e uma dívida paga que continua declarada faz o próximo leitor
    // procurar uma frase que não existe.
    const orfas = NEGACOES_DE_DADO_DECLARADAS.filter((d) => !ler(d.manual).includes(d.trecho));
    expect(
      orfas.map((d) => `${d.manual} · «${d.trecho}»`),
      "declaração sobre frase que o manual não tem mais — dê a baixa na lista",
    ).toEqual([]);
  });

  it("a peneira distingue negar o DADO de negar o VALOR", () => {
    // A frase que substituiu as duas removidas diz que o portal não mostra o
    // VALOR do caso dela — e isso é verdade, e é diferente de dizer que a
    // regra não está lá. A régua não pode confundir as duas.
    expect(NEGACAO_DE_DADO.test("O portal não mostra a data de devolução.")).toBe(true);
    expect(NEGACAO_DE_DADO.test("Não mostra o VALOR do que o contrato cobra além do aluguel")).toBe(false);
  });
});
