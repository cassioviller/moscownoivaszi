/**
 * O DESENHISTA de PDF do repositório — a máquina de bytes, sem saber que
 * documento está desenhando.
 *
 * E221 — ele nasceu dentro de `contrato-pdf.ts` (E100/E165) e ali esteve certo
 * enquanto o contrato era o único papel do sistema. A cláusula 7ª manda a
 * locadora fornecer **todos os recibos de pagamentos**, e o recibo é um segundo
 * documento: copiar as 60 linhas de xref/objetos/offsets para desenhá-lo seria
 * ter duas implementações do formato PDF, e a segunda envelheceria sozinha —
 * exatamente o que o E100 evitou quando tirou a montagem do contrato de dentro
 * da rota.
 *
 * O que fica aqui é o que NÃO muda de documento para documento: a paginação
 * (nenhuma linha abaixo da margem, bloco indivisível que ou cabe ou nasce na
 * página seguinte), o escape WinAnsi e a montagem do arquivo somando bytes. O
 * que cada papel DIZ é do módulo dele.
 */

type Linha = { x: number; y: number; size: number; text: string };

// A área útil da página A4 [0 0 595 842]: o texto nasce em y=800 e nenhuma
// linha desce abaixo de y=60 — é a margem que o P11 mediu como violada.
const Y_TOPO = 800;
const Y_MARGEM = 60;
const LARGURA_TEXTO = 92; // ~caracteres de Helvetica 10/11 entre as margens

// Escapa para string literal de PDF e troca caracteres fora do WinAnsi (>255)
// por "?" — a fonte Helvetica/WinAnsiEncoding não sabe desenhá-los.
//
// P14: os sinais tipográficos comuns são TRADUZIDOS antes do descarte — o
// U+2212 (menos matemático) virava "?" e o papel imprimia «Desconto: ?R$
// 500,00»: o abatimento sem sinal, lido como mais uma cobrança.
const TRADUZ: Record<string, string> = {
  "−": "-", // −  menos matemático
  "–": "-", // –  en-dash
  "—": "-", // —  em-dash
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
};
function pdfStr(s: string): string {
  let out = "";
  for (const ch of s) {
    const traduzido = TRADUZ[ch];
    if (traduzido !== undefined) {
      out += traduzido;
      continue;
    }
    const code = ch.codePointAt(0) ?? 63;
    if (code > 255) {
      out += "?";
    } else if (ch === "\\" || ch === "(" || ch === ")") {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * P13: quebra um texto livre em linhas que CABEM na página — por `\n` digitado
 * primeiro (a quebra da pessoa é sagrada), depois por largura, no espaço mais
 * próximo. A observação era uma única linha de `Tj`: a partir de ~95
 * caracteres o resto era desenhado FORA da página, e no exemplo medido o que
 * ficava de fora era a multa de R$ 150,00 por dia de atraso.
 */
export function quebrarTexto(texto: string, largura = LARGURA_TEXTO): string[] {
  const linhas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    let resto = bruta;
    if (resto.trim() === "") {
      linhas.push("");
      continue;
    }
    while (resto.length > largura) {
      let corte = resto.lastIndexOf(" ", largura);
      if (corte <= 0) corte = largura; // palavra maior que a linha: corta seco
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte).trimStart();
    }
    linhas.push(resto);
  }
  return linhas;
}

// O montador emite TOKENS (texto, respiro, ou bloco indivisível); o paginador
// os distribui em páginas. Separar as duas coisas é o que deixa o teste
// afirmar "nenhuma linha abaixo da margem" sem conhecer o conteúdo.
export type Token =
  | { tipo: "linha"; text: string; size: number }
  | { tipo: "vazio" }
  | { tipo: "bloco"; linhas: { text: string; size: number }[]; respiroAntes: number };

/**
 * O ajudante que todo montador de papel repete: uma linha, um respiro, um par
 * "rótulo: valor" que imprime "-" quando o valor não existe (nunca vazio — o
 * papel tem de dizer que ali não há dado, e não esconder a linha).
 */
export function montadorDeTokens() {
  const tokens: Token[] = [];
  return {
    tokens,
    add: (text: string, size = 11) => tokens.push({ tipo: "linha", text, size }),
    vazio: () => tokens.push({ tipo: "vazio" }),
    dado: (rotulo: string, valor?: string) =>
      tokens.push({
        tipo: "linha",
        size: 11,
        text: `${rotulo}: ${valor && valor.trim() ? valor.trim() : "-"}`,
      }),
    bloco: (linhas: { text: string; size: number }[], respiroAntes = 40) =>
      tokens.push({ tipo: "bloco", linhas, respiroAntes }),
  };
}

/**
 * S-C170 — a quebra por largura é DO PAGINADOR, não de cada chamador.
 *
 * O P13 (E165) ensinou a quebra ao texto livre, mas ela morava no call-site —
 * e todo call-site seguinte a esqueceu: as linhas de parcela, de cobrança
 * extra e de item chamavam `add()` cru, e a sonda da sobra mediu uma linha de
 * MORA com 240 caracteres e uma de ATRASO_DEVOLUCAO com 294 desenhadas numa
 * largura de 92 — o resto saía da página, e o que saía era justamente a conta.
 * Aqui é por onde TODA linha de TODO papel passa (contrato, recibo, o próximo);
 * régua que depende de cada chamador lembrar dela não é régua.
 *
 * A continuação herda o recuo da primeira linha: sem isso, o texto quebrado de
 * um item de lista volta à margem e se disfarça de item novo.
 */
function quebrarNaLargura(text: string, size: number): string[] {
  // 92 é calibrado para Helvetica 10/11; corpo maior leva menos por linha.
  const largura = Math.floor((LARGURA_TEXTO * 11) / Math.max(size, 11));
  if (text.length <= largura) return [text];
  const recuo = (text.match(/^ +/)?.[0] ?? "") + "  ";
  // A continuação quebra já DESCONTANDO o recuo — recuar depois de quebrar
  // faria a linha recuada passar da largura que a quebra acabou de garantir.
  const [primeira, ...resto] = quebrarTexto(text, largura);
  if (resto.length === 0) return [primeira!];
  return [
    primeira!,
    ...quebrarTexto(resto.join(" "), Math.max(largura - recuo.length, 20)).map((l) => recuo + l),
  ];
}

/** Distribui os tokens em páginas — nenhuma linha abaixo de Y_MARGEM. */
function paginar(tokens: Token[]): Linha[][] {
  const paginas: Linha[][] = [[]];
  let y = Y_TOPO;
  const alturaDe = (size: number) => size + 7;
  const novaPagina = () => {
    paginas.push([]);
    y = Y_TOPO;
  };
  const emitir = (text: string, size: number) => {
    for (const linha of quebrarNaLargura(text, size)) {
      const h = alturaDe(size);
      if (y - h < Y_MARGEM) novaPagina();
      paginas[paginas.length - 1].push({ x: 50, y, size, text: linha });
      y -= h;
    }
  };

  for (const t of tokens) {
    if (t.tipo === "linha") {
      emitir(t.text, t.size);
    } else if (t.tipo === "vazio") {
      y -= 8; // respiro no fim da página não força quebra — só some
    } else {
      const altura = t.respiroAntes + t.linhas.reduce((s, l) => s + alturaDe(l.size), 0);
      if (y - altura < Y_MARGEM) novaPagina();
      else y -= t.respiroAntes;
      for (const l of t.linhas) emitir(l.text, l.size);
    }
  }
  return paginas;
}

/** Os tokens viram um PDF 1.4 mínimo, porém válido. */
export function desenharPdf(tokens: Token[]): Uint8Array {
  const paginas = paginar(tokens);

  /**
   * Objetos: 1 Catalog · 2 Pages · 3 Font · e por página i (0-based),
   * (4+2i) Page e (5+2i) Contents. A xref exige o offset EXATO de cada objeto,
   * por isso o arquivo é montado somando bytes, nunca concatenando no fim.
   */
  const objetos: Buffer[] = [];
  const kids = paginas.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objetos[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1");
  objetos[2] = Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`, "latin1");
  objetos[3] = Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "latin1",
  );

  paginas.forEach((linhas, i) => {
    let content = "BT\n";
    for (const ln of linhas) {
      content += `/F1 ${ln.size} Tf\n1 0 0 1 ${ln.x} ${ln.y} Tm\n(${pdfStr(ln.text)}) Tj\n`;
    }
    content += "ET";
    const contentBuf = Buffer.from(content, "latin1");
    objetos[4 + 2 * i] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`,
      "latin1",
    );
    objetos[5 + 2 * i] = Buffer.concat([
      Buffer.from(`<< /Length ${contentBuf.length} >>\nstream\n`, "latin1"),
      contentBuf,
      Buffer.from("\nendstream", "latin1"),
    ]);
  });

  const total = 3 + 2 * paginas.length;
  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (b: Buffer) => {
    chunks.push(b);
    offset += b.length;
  };
  const offsets: number[] = [];

  push(Buffer.from("%PDF-1.4\n", "latin1"));
  for (let i = 1; i <= total; i++) {
    offsets[i] = offset;
    push(Buffer.from(`${i} 0 obj\n`, "latin1"));
    push(objetos[i] as Buffer);
    push(Buffer.from("\nendobj\n", "latin1"));
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(Buffer.from(xref, "latin1"));

  const full = Buffer.concat(chunks);
  const out = new Uint8Array(full.byteLength);
  out.set(full);
  return out;
}
