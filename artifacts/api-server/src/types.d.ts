import type { Usuario, Sessao, Loja } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      usuario?: Usuario;
      sessao?: Sessao;
      lojaAtiva?: Loja;
    }
  }
}
