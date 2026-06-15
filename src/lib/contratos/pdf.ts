// src/lib/contratos/pdf.ts
// Gera um PDF de contrato SEM biblioteca externa (PDF 1.4 mínimo, válido).
// O layout é propositalmente simples — será revisto depois. Mantido como função
// pura (sem Prisma, sem Next) para ser testável e fácil de trocar por um
// template real (ou uma lib) no futuro.

export type DadosContrato = {
  lojaNome: string;
  noivaNome: string;
  cpf?: string;
  whatsapp?: string;
  vestido?: string;
  valorTotal?: string;
  formaPagamento?: string;
  // Plano de pagamento (entrada = parcela nº0). Fonte única da entrada — substitui o campo solto.
  parcelas?: { descricao: string; valor: string; vencimento?: string; forma?: string }[];
  dataCasamento?: string;
  dataRetirada?: string;
  dataDevolucao?: string;
  dataContrato?: string;
  observacao?: string;
};

type Linha = { x: number; y: number; size: number; text: string };

// Escapa para string literal de PDF e troca caracteres fora do WinAnsi (>255) por "?".
function pdfStr(s: string): string {
  let out = "";
  for (const ch of s) {
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

function montarLinhas(d: DadosContrato): Linha[] {
  const linhas: Linha[] = [];
  let y = 800;
  const add = (text: string, size = 11) => {
    linhas.push({ x: 50, y, size, text });
    y -= size + 7;
  };
  const vazio = () => {
    y -= 8;
  };
  const dado = (rotulo: string, valor?: string) => add(`${rotulo}: ${valor && valor.trim() ? valor.trim() : "-"}`);

  add("CONTRATO DE LOCACAO DE VESTIDO", 16);
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
  vazio();

  add("VALORES E PAGAMENTO", 12);
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
  vazio();

  add("DATAS", 12);
  dado("Casamento", d.dataCasamento);
  dado("Retirada", d.dataRetirada);
  dado("Devolucao", d.dataDevolucao);
  vazio();

  add("OBSERVACOES", 12);
  add(d.observacao && d.observacao.trim() ? d.observacao.trim() : "-");

  y -= 40;
  add("__________________________________");
  add(d.noivaNome && d.noivaNome.trim() ? d.noivaNome.trim() : "Noiva");
  vazio();
  add("__________________________________");
  add(d.lojaNome);

  return linhas;
}

export function gerarContratoPdf(d: DadosContrato): Uint8Array<ArrayBuffer> {
  const linhas = montarLinhas(d);

  let content = "BT\n";
  for (const ln of linhas) {
    content += `/F1 ${ln.size} Tf\n1 0 0 1 ${ln.x} ${ln.y} Tm\n(${pdfStr(ln.text)}) Tj\n`;
  }
  content += "ET";
  const contentBuf = Buffer.from(content, "latin1");

  const objetos: Buffer[] = [];
  objetos[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1");
  objetos[2] = Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1");
  objetos[3] = Buffer.from(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "latin1",
  );
  objetos[4] = Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "latin1",
  );
  objetos[5] = Buffer.concat([
    Buffer.from(`<< /Length ${contentBuf.length} >>\nstream\n`, "latin1"),
    contentBuf,
    Buffer.from("\nendstream", "latin1"),
  ]);

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (b: Buffer) => {
    chunks.push(b);
    offset += b.length;
  };
  const offsets: number[] = [];

  push(Buffer.from("%PDF-1.4\n", "latin1"));
  for (let i = 1; i <= 5; i++) {
    offsets[i] = offset;
    push(Buffer.from(`${i} 0 obj\n`, "latin1"));
    push(objetos[i]);
    push(Buffer.from("\nendobj\n", "latin1"));
  }

  const xrefStart = offset;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(Buffer.from(xref, "latin1"));

  // Copia para um Uint8Array sobre ArrayBuffer "puro" (não SharedArrayBuffer),
  // exigido por BodyInit/BlobPart na resposta do route handler.
  const full = Buffer.concat(chunks);
  const out = new Uint8Array(full.byteLength);
  out.set(full);
  return out;
}
