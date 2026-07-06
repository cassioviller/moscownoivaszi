import bcrypt from "bcryptjs";

const BCRYPT_COST = 10;

export async function gerarHash(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verificarSenha(plain: string, hash: string): Promise<boolean> {
  if (!plain) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // hash malformado (ex.: string vazia ou prefixo inválido) — tratamos como "não bate".
    return false;
  }
}
