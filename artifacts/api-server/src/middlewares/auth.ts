import type { Request, Response, NextFunction } from "express";
import { buscarSessao, buscarLoja, getPermissoes, COOKIE_NOME } from "../lib/auth";
import { acaoDoMetodo, acaoDoRequest, podeNoModulo, type Acao } from "../lib/permissoes";

/**
 * O `:lojaId` da URL — o da rota quando ele existe, e o do caminho cru quando não.
 *
 * `router.use(fn)` SEM path roda com `req.params` vazio: o Express só preenche
 * os params do padrão com que o middleware foi montado, e um `use` sem path não
 * tem padrão nenhum. Os dez routers de domínio (leads, contratos, financeiro,
 * comissão, agenda, reservas, vestidos, orçamentos, catálogo, equipe) montam
 * assim, então `req.params.lojaId` era `undefined` ali e a conferência de loja
 * abaixo era pulada em SILÊNCIO — nunca falhava, nunca rodava.
 *
 * O que isso deixava passar, medido nesta árvore com uma vendedora comum da
 * loja A e a sessão em A: `GET /api/lojas/<B>/leads` respondia 200 com a ficha
 * da noiva de B, o `PATCH` renomeava, e o `DELETE` apagava. `requireModulo`
 * não segura nada disso — ele consulta as permissões de `sessao.lojaAtivaId`,
 * que é A, e aprova; o handler então consulta `where lojaId = B`. O E91 fechou
 * os ids do CORPO e deixou aberto o id do PATH.
 *
 * Ler o caminho cru é a única fonte que enxerga o id nas DUAS montagens, com
 * path e sem. Todas as rotas de loja vivem sob `/api/lojas/:lojaId/...`.
 */
export function lojaIdDaUrl(req: Request): string | undefined {
  const doParam = Array.isArray(req.params.lojaId) ? req.params.lojaId[0] : req.params.lojaId;
  if (doParam) return doParam;
  const caminho = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  const achado = /\/lojas\/([^/?#]+)/.exec(caminho)?.[1];
  if (!achado) return undefined;
  try {
    return decodeURIComponent(achado);
  } catch {
    return achado;
  }
}

export async function requireSessao(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.cookies[COOKIE_NOME];
  if (!sessionId) {
    res.status(401).json({ error: "NAO_AUTENTICADO" });
    return;
  }

  const data = await buscarSessao(sessionId);
  if (!data) {
    res.status(401).json({ error: "SESSAO_INVALIDA" });
    return;
  }

  req.sessao = data.sessao;
  req.usuario = data.usuario;
  next();
}

export async function requireSessaoComLoja(req: Request, res: Response, next: NextFunction): Promise<void> {
  // S32 — este guard é montado SEM path por onze routers em série, e o Express
  // atravessa todos até casar a rota: a MESMA request o executava até 11 vezes
  // (22 consultas sequenciais no GET /dashboard, 20 na comissão, 18 no
  // financeiro — medido na conferência de 2026-08-05). A sessão não muda entre
  // dois routers da mesma request: quem já foi autenticado AQUI (as três
  // marcas juntas — `lojaAtiva` só nasce neste guard) pula direto para a
  // checagem de URL, que é a única parte que não custa banco. O custo deixa de
  // ser função da posição do router no index.ts.
  if (req.sessao && req.usuario && req.lojaAtiva) {
    const lojaIdParam = lojaIdDaUrl(req);
    if (lojaIdParam && lojaIdParam !== req.sessao.lojaAtivaId) {
      res.status(403).json({ error: "LOJA_DIVERGE_DA_SESSAO" });
      return;
    }
    next();
    return;
  }

  const sessionId = req.cookies[COOKIE_NOME];
  if (!sessionId) {
    res.status(401).json({ error: "NAO_AUTENTICADO" });
    return;
  }

  const data = await buscarSessao(sessionId);
  if (!data) {
    res.status(401).json({ error: "SESSAO_INVALIDA" });
    return;
  }
  if (!data.sessao.lojaAtivaId) {
    res.status(401).json({ error: "SEM_LOJA_ATIVA" });
    return;
  }

  const loja = await buscarLoja(data.sessao.lojaAtivaId);
  if (!loja) {
    res.status(403).json({ error: "LOJA_ATIVA_INVALIDA" });
    return;
  }

  const lojaIdParam = lojaIdDaUrl(req);
  if (lojaIdParam && lojaIdParam !== data.sessao.lojaAtivaId) {
    res.status(403).json({ error: "LOJA_DIVERGE_DA_SESSAO" });
    return;
  }

  req.sessao = data.sessao;
  req.usuario = data.usuario;
  req.lojaAtiva = loja;
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario?.isSuperAdmin) {
    res.status(403).json({ error: "ACESSO_NEGADO_SUPERADMIN" });
    return;
  }
  next();
}

/**
 * Exige que o perfil do usuário na loja ativa possa a AÇÃO neste módulo.
 * Deve ser montado DEPOIS de requireSessaoComLoja. Superadmin sempre passa.
 *
 * Sem `acao`, ela vem do método HTTP (GET→ver, POST→criar, resto→editar), que é
 * o certo para rotas REST. Passe explicitamente quando a rota mentir sobre o
 * que faz — um POST que só consulta pede `"ver"`, não `"criar"`.
 */
export function requireModulo(modulo: string, acao?: Acao) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuario = req.usuario;
    const lojaId = req.sessao?.lojaAtivaId;
    if (!usuario || !lojaId) {
      res.status(401).json({ error: "SEM_LOJA_ATIVA" });
      return;
    }
    if (usuario.isSuperAdmin) {
      next();
      return;
    }
    // `baseUrl + path`, não `path` (E115): dentro de um `router.use(prefixo,
    // fn)` o Express DESMONTA o prefixo casado — `req.path` de
    // `POST /lojas/X/financeiro/pagamentos` chega aqui como `/pagamentos`, e
    // uma régua por caminho (`POST_QUE_MUTA_POR_CAMINHO`) nunca casaria. É a
    // mesma pegadinha do `req.params` vazio que o E111 documentou no
    // `lojaIdDaUrl`, na dimensão do caminho em vez da dos params.
    const exigida = acao ?? acaoDoRequest(req.method, req.baseUrl + req.path);
    const permissoes = await getPermissoes(usuario.id, lojaId, false);
    if (!permissoes || !podeNoModulo(permissoes, modulo, exigida)) {
      res.status(403).json({ error: "ACESSO_NEGADO_MODULO", modulo, acao: exigida });
      return;
    }
    next();
  };
}
