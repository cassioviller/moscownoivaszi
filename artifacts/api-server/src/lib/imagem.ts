/**
 * Identificação de imagem por MAGIC BYTES — sem dependências.
 *
 * O upload de foto chegava com `mime`/`largura`/`altura` declarados pelo
 * CLIENTE e o servidor os persistia e devolvia como `Content-Type`. Um mime
 * mentiroso (text/html…) virava superfície de stored-XSS; dimensões mentirosas
 * quebravam o layout. Aqui o servidor deriva os três do próprio binário e a
 * palavra do cliente deixa de valer.
 *
 * Whitelist deliberada: JPEG, PNG e WebP — o que câmera e export de editor
 * produzem. GIF/SVG/HEIC ficam de fora (SVG é executável; HEIC o iOS já
 * transcodifica no input).
 */

export type ImagemInfo = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  largura: number;
  altura: number;
};

/** Função TOTAL: qualquer binário não reconhecido (ou truncado) → null. Nunca lança. */
export function identificarImagem(buf: Buffer): ImagemInfo | null {
  try {
    return png(buf) ?? jpeg(buf) ?? webp(buf);
  } catch {
    // Leituras fora do buffer etc. — lixo é lixo, não exceção.
    return null;
  }
}

const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(buf: Buffer): ImagemInfo | null {
  // Assinatura de 8 bytes + chunk IHDR obrigatório logo em seguida:
  // length(4) + "IHDR"(4) + largura(4 BE) + altura(4 BE).
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_ASSINATURA)) return null;
  if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
  const largura = buf.readUInt32BE(16);
  const altura = buf.readUInt32BE(20);
  if (largura === 0 || altura === 0) return null;
  return { mime: "image/png", largura, altura };
}

function jpeg(buf: Buffer): ImagemInfo | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  // Caminha os segmentos até um SOFn — as dimensões moram nele. EXIF/APP1
  // gigantes antes do SOF são normais (foto de celular); o loop os pula.
  let p = 2;
  while (p + 3 < buf.length) {
    if (buf[p] !== 0xff) return null; // estrutura corrompida
    const marcador = buf[p + 1];
    if (marcador === 0xff) { p += 1; continue; } // byte de preenchimento
    // Standalone (sem length): TEM/RSTn. EOI antes do SOF = sem dimensões.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { p += 2; continue; }
    if (marcador === 0xd9) return null;
    if (p + 4 > buf.length) return null;
    const tamanho = buf.readUInt16BE(p + 2);
    if (tamanho < 2) return null;
    // SOFn = C0–CF, exceto C4 (DHT), C8 (extensão) e CC (DAC). Inclui o C2
    // (progressivo) — export de editor cai aqui.
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      if (p + 9 > buf.length) return null;
      const altura = buf.readUInt16BE(p + 5);
      const largura = buf.readUInt16BE(p + 7);
      if (largura === 0 || altura === 0) return null;
      return { mime: "image/jpeg", largura, altura };
    }
    p += 2 + tamanho;
  }
  return null;
}

function webp(buf: Buffer): ImagemInfo | null {
  if (buf.length < 30) return null;
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("latin1", 12, 16);
  if (chunk === "VP8 ") {
    // Frame tag + sync code 9D 01 2A; dimensões em 14 bits LE.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const largura = buf.readUInt16LE(26) & 0x3fff;
    const altura = buf.readUInt16LE(28) & 0x3fff;
    if (largura === 0 || altura === 0) return null;
    return { mime: "image/webp", largura, altura };
  }
  if (chunk === "VP8L") {
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    const largura = (bits & 0x3fff) + 1;
    const altura = ((bits >> 14) & 0x3fff) + 1;
    return { mime: "image/webp", largura, altura };
  }
  if (chunk === "VP8X") {
    const largura = buf.readUIntLE(24, 3) + 1;
    const altura = buf.readUIntLE(27, 3) + 1;
    return { mime: "image/webp", largura, altura };
  }
  return null;
}
