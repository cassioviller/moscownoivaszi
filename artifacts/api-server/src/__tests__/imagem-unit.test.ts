import { describe, expect, it } from "vitest";
import { identificarImagem } from "../lib/imagem";

// Imagens 1×1 REAIS (geradas por encoders de verdade), hardcoded.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64",
);

/** IHDR sintético com dimensões escolhidas — o resto do PNG não importa para o parser. */
function pngSintetico(largura: number, altura: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // length do IHDR
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(largura, 16);
  buf.writeUInt32BE(altura, 20);
  return buf;
}

/** WebP lossy (VP8) sintético. */
function webpVP8(largura: number, altura: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "latin1");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8, "latin1");
  buf.write("VP8 ", 12, "latin1");
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a; // sync code
  buf.writeUInt16LE(largura, 26);
  buf.writeUInt16LE(altura, 28);
  return buf;
}

/** WebP lossless (VP8L) sintético — dimensões em 14 bits, valor-1. */
function webpVP8L(largura: number, altura: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "latin1");
  buf.write("WEBP", 8, "latin1");
  buf.write("VP8L", 12, "latin1");
  buf[20] = 0x2f;
  buf.writeUInt32LE((largura - 1) | ((altura - 1) << 14), 21);
  return buf;
}

/** WebP estendido (VP8X) sintético — canvas em u24 LE, valor-1. */
function webpVP8X(largura: number, altura: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "latin1");
  buf.write("WEBP", 8, "latin1");
  buf.write("VP8X", 12, "latin1");
  buf.writeUIntLE(largura - 1, 24, 3);
  buf.writeUIntLE(altura - 1, 27, 3);
  return buf;
}

describe("identificarImagem", () => {
  it("PNG real 1×1 e IHDR sintético com dimensões arbitrárias", () => {
    expect(identificarImagem(PNG_1x1)).toEqual({ mime: "image/png", largura: 1, altura: 1 });
    expect(identificarImagem(pngSintetico(800, 600))).toEqual({ mime: "image/png", largura: 800, altura: 600 });
  });

  it("JPEG real 1×1 — dimensões saem do SOF", () => {
    expect(identificarImagem(JPEG_1x1)).toEqual({ mime: "image/jpeg", largura: 1, altura: 1 });
  });

  it("JPEG com APP1/EXIF grande antes do SOF — o scan de segmentos atravessa", () => {
    // SOI + APP1 de 1000 bytes de payload + SOF0 320×240.
    const exif = Buffer.alloc(1000);
    const partes = [
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1]), Buffer.from([((exif.length + 2) >> 8) & 0xff, (exif.length + 2) & 0xff]), exif,
      Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0xf0, 0x01, 0x40, 0x01, 0x01, 0x11, 0x00]),
    ];
    expect(identificarImagem(Buffer.concat(partes))).toEqual({ mime: "image/jpeg", largura: 320, altura: 240 });
  });

  it("JPEG progressivo (SOF2) é aceito", () => {
    const partes = [
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xc2, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x01, 0x11, 0x00, 0x00]),
    ];
    expect(identificarImagem(Buffer.concat(partes))).toEqual({ mime: "image/jpeg", largura: 200, altura: 100 });
  });

  it("WebP nos três sabores: VP8, VP8L e VP8X", () => {
    expect(identificarImagem(webpVP8(640, 480))).toEqual({ mime: "image/webp", largura: 640, altura: 480 });
    expect(identificarImagem(webpVP8L(1024, 768))).toEqual({ mime: "image/webp", largura: 1024, altura: 768 });
    expect(identificarImagem(webpVP8X(2000, 1500))).toEqual({ mime: "image/webp", largura: 2000, altura: 1500 });
  });

  it("truncado, corrompido e mentiroso → null, sem lançar", () => {
    // PNG cortado antes do IHDR.
    expect(identificarImagem(PNG_1x1.subarray(0, 20))).toBeNull();
    // Assinatura PNG seguida de lixo (sem IHDR).
    const falsoPng = Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.from("nada-de-ihdr-aqui!")]);
    expect(identificarImagem(falsoPng)).toBeNull();
    // JPEG cortado antes do SOF.
    expect(identificarImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBeNull();
    // JPEG com length de segmento apontando além do buffer.
    expect(identificarImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00]))).toBeNull();
    // RIFF que não é WEBP.
    const wav = Buffer.alloc(30); wav.write("RIFF", 0, "latin1"); wav.write("WAVE", 8, "latin1");
    expect(identificarImagem(wav)).toBeNull();
  });

  it("formatos fora da whitelist e lixo genérico → null", () => {
    expect(identificarImagem(Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"))).toBeNull();
    expect(identificarImagem(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(identificarImagem(Buffer.alloc(0))).toBeNull();
    expect(identificarImagem(Buffer.from([1, 2, 3]))).toBeNull();
    // 1KB de bytes pseudo-aleatórios determinísticos.
    const lixo = Buffer.alloc(1024);
    for (let i = 0; i < lixo.length; i++) lixo[i] = (i * 197 + 91) % 256;
    expect(identificarImagem(lixo)).toBeNull();
  });
});
