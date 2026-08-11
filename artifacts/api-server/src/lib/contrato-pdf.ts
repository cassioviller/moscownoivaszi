// Gera o PDF do contrato SEM biblioteca externa (PDF 1.4 mínimo, porém válido).
// Ser função pura — sem banco, sem Express — é uma qualidade deliberada: o
// layout roda em teste unitário e pode ser trocado por um template real (ou uma
// lib) sem tocar na rota. O layout é propositalmente simples.
//
// E165 (P11): o desenhista PAGINA. A versão anterior era uma página única com o
// y descendo sem freio — a partir de 15 parcelas as assinaturas eram desenhadas
// em y NEGATIVO (medido: entrada + 18 parcelas punha o bloco de assinatura em
// y=−15..−77): o PDF saía válido, abria normalmente, e não tinha onde a noiva e
// a loja assinam. Com 24 parcelas sumia a seção de observações; `numParcelas`
// aceita até 360. Agora nenhuma linha desce abaixo da margem: acabou a página,
// nasce outra — e o bloco de assinaturas nunca se separa no meio.

export type DadosContrato = {
  lojaNome: string;
  noivaNome: string;
  /**
   * P10: a tarja do contrato cancelado — desenhada GRANDE, logo abaixo do
   * título. O papel de um contrato morto não pode parecer um vivo.
   */
  tarja?: string;
  cpf?: string;
  whatsapp?: string;
  vestido?: string;
  // Snapshot dos itens contratados; o valor já vem formatado (a formatação de
  // moeda é responsabilidade de quem monta os dados, não do desenhista).
  itens?: { descricao: string; valor: string }[];
  // Subtotal (soma bruta dos itens) e desconto só aparecem quando há desconto —
  // aí o valorTotal é o líquido e a linha explica por que itens ≠ total. Já
  // formatados por quem monta os dados.
  subtotal?: string;
  desconto?: string;
  valorTotal?: string;
  formaPagamento?: string;
  // Plano de pagamento (entrada = parcela nº 0). Fonte única da entrada.
  // P12: aqui entram SÓ as parcelas do carnê (origem PLANO) — são elas que
  // somam o valorTotal. O resto vai em `cobrancasExtras`.
  parcelas?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];
  /**
   * P12: as cobranças que nasceram DEPOIS do fecho (avaria, multa, avulsa) —
   * listadas em seção própria, com o subtotal delas, para o papel nunca somar
   * mais do que o "Valor total" sem uma linha que reconcilie. Antes, a parcela
   * de avaria entrava no plano e o PDF listava R$ 5.350,00 sob "Valor total:
   * R$ 5.000,00" — e como o PDF é regerado a cada download, o contrato
   * assinado por um valor passava a imprimir outro.
   */
  cobrancasExtras?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];
  totalExtras?: string;
  dataCasamento?: string;
  dataRetirada?: string;
  dataDevolucao?: string;
  dataContrato?: string;
  observacao?: string;
};

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
type Token =
  | { tipo: "linha"; text: string; size: number }
  | { tipo: "vazio" }
  | { tipo: "bloco"; linhas: { text: string; size: number }[]; respiroAntes: number };

function montarTokens(d: DadosContrato): Token[] {
  const tokens: Token[] = [];
  const add = (text: string, size = 11) => tokens.push({ tipo: "linha", text, size });
  const vazio = () => tokens.push({ tipo: "vazio" });
  const dado = (rotulo: string, valor?: string) =>
    add(`${rotulo}: ${valor && valor.trim() ? valor.trim() : "-"}`);

  add("CONTRATO DE LOCACAO DE VESTIDO", 16);
  // P10: a tarja vem ANTES de qualquer dado — é a primeira coisa que o papel
  // de um contrato morto tem a dizer.
  if (d.tarja) {
    add(`*** ${d.tarja} ***`, 14);
  }
  vazio();
  add(d.lojaNome, 12);
  dado("Data do contrato", d.dataContrato);
  vazio();

  add("DADOS DA NOIVA", 12);
  dado("Nome", d.noivaNome);
  dado("CPF", d.cpf);
  dado("WhatsApp", d.whatsapp);
  vazio();

  add("VESTIDO", 12);
  dado("Modelo", d.vestido);
  if (d.itens && d.itens.length > 0) {
    vazio();
    add("Itens contratados:", 11);
    for (const it of d.itens) {
      add(`  ${it.descricao}: ${it.valor}`, 10);
    }
  }
  vazio();

  add("VALORES E PAGAMENTO", 12);
  if (d.desconto) {
    dado("Subtotal", d.subtotal);
    dado("Desconto", d.desconto);
  }
  dado("Valor total", d.valorTotal);
  dado("Forma de pagamento", d.formaPagamento);
  if (d.parcelas && d.parcelas.length > 0) {
    vazio();
    add("Plano de pagamento:", 11);
    for (const p of d.parcelas) {
      const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
      const forma = p.forma ? ` · ${p.forma}` : "";
      add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
    }
  }
  // P12: o que não é carnê fica em seção própria — o plano soma o valor total,
  // e as cobranças extras têm o subtotal delas.
  if (d.cobrancasExtras && d.cobrancasExtras.length > 0) {
    vazio();
    add("Cobrancas fora do valor total (avaria, multa, avulsa):", 11);
    for (const p of d.cobrancasExtras) {
      const venc = p.vencimento ? ` · vence ${p.vencimento}` : "";
      const forma = p.forma ? ` · ${p.forma}` : "";
      add(`  ${p.descricao}: ${p.valor}${venc}${forma}`, 10);
    }
    if (d.totalExtras) add(`  Total das cobrancas extras: ${d.totalExtras}`, 10);
  }
  vazio();

  add("DATAS", 12);
  dado("Casamento", d.dataCasamento);
  dado("Retirada", d.dataRetirada);
  dado("Devolucao", d.dataDevolucao);
  vazio();

  add("OBSERVACOES", 12);
  const obs = d.observacao && d.observacao.trim() ? d.observacao.trim() : "-";
  for (const linha of quebrarTexto(obs)) add(linha || " ");

  // P11: as assinaturas são um BLOCO indivisível — ou cabem inteiras na página,
  // ou nascem na próxima. É o bloco que estava sendo desenhado em y negativo.
  tokens.push({
    tipo: "bloco",
    respiroAntes: 40,
    linhas: [
      { text: "__________________________________", size: 11 },
      { text: d.noivaNome && d.noivaNome.trim() ? d.noivaNome.trim() : "Noiva", size: 11 },
      { text: " ", size: 11 },
      { text: "__________________________________", size: 11 },
      { text: d.lojaNome, size: 11 },
    ],
  });

  return tokens;
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
    const h = alturaDe(size);
    if (y - h < Y_MARGEM) novaPagina();
    paginas[paginas.length - 1].push({ x: 50, y, size, text });
    y -= h;
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

export function gerarContratoPdf(d: DadosContrato): Uint8Array {
  const paginas = paginar(montarTokens(d));

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
