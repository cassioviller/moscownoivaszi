import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
// S-O19: o teto do corpo mora em `lib/limites.ts`, ao lado do da FOTO — a conta
// do base64 que os liga estava só em comentário. S-O51/E180: e é UM só, o mesmo
// para as duas portas que recebem foto, calculado a partir de `FOTO_MAX_BYTES`.
import { CORPO_MAX_FOTO_BYTES } from "./lib/limites";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { requireSessaoComLoja, requireModulo } from "./middlewares/auth";
import router from "./routes";
import { logger } from "./lib/logger";
import { classificarErro } from "./lib/erros";

const app: Express = express();

// Atrás do proxy do Replit — necessário para o rate-limit ver o IP real. O
// mesmo `1` vale para o proxy do EasyPanel (Traefik), que é um salto só: ele
// põe o IP da internet em `X-Forwarded-For` e `https` em `X-Forwarded-Proto`,
// e é daí que o Express tira `req.ip` e `req.protocol`.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
/**
 * O `helmet()` inteiro, com UMA diretiva mexida: `img-src` ganha `blob:`.
 *
 * Até aqui o CSP só alcançava resposta de API — o HTML saía do Vite, que não
 * passa por este processo. Servindo a tela pelo mesmo Express (`FRONTEND_DIR`,
 * lá embaixo), o CSP do helmet passa a valer para a PÁGINA, e o default
 * `img-src 'self' data:` derrubaria a pré-visualização da foto do vestido:
 * `vestidos/[id]/editar.tsx:54` desenha o arquivo escolhido com
 * `URL.createObjectURL(file)`, que é uma URL `blob:`.
 *
 * O resto do default do helmet 8.3 já serve esta tela e fica como está:
 * `style-src` traz `https:` e `'unsafe-inline'` (o CSS do Google Fonts que o
 * `index.html` importa, e o `style=` que Radix e framer-motion escrevem),
 * `font-src` traz `https:` (o `fonts.gstatic.com` do mesmo import),
 * `script-src 'self'` cobre os módulos que o Vite emite, e `connect-src` cai
 * no `default-src 'self'` — que é o bastante porque a API é a MESMA origem.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { "img-src": ["'self'", "data:", "blob:"] },
    },
  }),
);

// CORS restrito: frontend e API são same-origin (Vite proxy/deploy conjunto),
// então cross-origin só é liberado para origens explicitamente listadas em
// CORS_ORIGINS (separadas por vírgula — ex.: app mobile, domínio externo).
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

app.use(cookieParser());
// O upload de foto (base64 no JSON) precisa de um teto próprio: 2MiB de foto +
// 512KiB de thumb × 4/3 do base64 + envelope. TEM de vir ANTES do parser
// global — o primeiro parser marca req._body e o segundo pula; na ordem
// inversa, o global (100kb) estoura antes e NENHUMA foto real entra (era o
// estado até aqui: upload de foto de verdade dava 500).
// B15/E104: o gate vem ANTES do parser. Este era o único ponto do servidor
// onde trabalho não trivial acontecia antes da autenticação — qualquer um podia
// fazer o processo montar 6 MB de JSON sem estar logado. O parser continua
// aqui (e não dentro do router) pelo motivo acima: o global de 100kb não pode
// vir primeiro. O que mudou é que agora ele só roda para quem passou.
app.use(
  "/api/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem",
  requireSessaoComLoja,
  requireModulo("vestidos"),
  express.json({ limit: CORPO_MAX_FOTO_BYTES }),
);
/**
 * V1/E167 — a FOTO DA AVARIA passava pela mesma porta e nunca ganhou o teto.
 *
 * A rota anuncia 2 MiB no cliente (`[bloqueioId].tsx:135`) e no servidor
 * (`reservas.ts`, `AVARIA_FOTO_MAX_BYTES`), e as duas declarações mentiam: sem
 * parser próprio, `POST /bloqueios/:id/avarias` caía no `express.json()`
 * global logo abaixo, de **100 KB**. Medido nesta árvore, com a foto de
 * celular de 1,5 MB: o corpo chega com **2.000.080 bytes contra um limite de
 * 102.400** e o servidor responde **413 PAYLOAD_MUITO_GRANDE** antes de uma
 * linha da rota rodar — 19,5× o teto real, e o teto real é 20× menor que o
 * anunciado. O 422 `FOTO_MUITO_GRANDE` era código morto, e a suíte era verde
 * porque o único teste mandava um PNG 1×1 de 70 bytes.
 *
 * A conta do limite mora em `lib/limites.ts` e é a MESMA das duas portas desde
 * o E180 (S-O51): 2 MiB de foto × 4/3 do base64 = 2,67 MiB, mais 1 MiB de
 * envelope. É o que faz o 422 (que nomeia o teto e o gesto) ser a resposta do
 * excesso, em vez do 413 mudo do parser. Mesma montagem da foto de vestido
 * acima, e pelos mesmos dois motivos: o gate vem ANTES do parser (B15/E104) e o
 * parser vem antes do global (o primeiro a rodar marca `req._body`).
 */
app.use(
  "/api/lojas/:lojaId/bloqueios/:bloqueioId/avarias",
  requireSessaoComLoja,
  requireModulo("vestidos"),
  express.json({ limit: CORPO_MAX_FOTO_BYTES }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Força bruta no login: 20 tentativas por IP a cada 5 minutos.
// Sob vitest o limite é pulado (a suíte loga dezenas de vezes do mesmo IP).
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => !!process.env.VITEST || !!process.env.E2E_SUITE,
  // S-D21 — CÓDIGO no campo do código. As quatro páginas públicas leem
  // `data.error` como CHAVE de mapa: com a frase aqui, a noiva que esbarra no
  // teto lia "Link inválido — confira se ele veio inteiro do WhatsApp".
  message: {
    error: "MUITAS_TENTATIVAS",
    detalhe: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  },
});
app.use("/api/auth/login", loginLimiter);

// As rotas públicas de convite (info/aceitar) são probing surface: 30 req por
// IP a cada 5 minutos cobre o uso legítimo com folga.
const conviteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => !!process.env.VITEST || !!process.env.E2E_SUITE,
  message: {
    error: "MUITAS_TENTATIVAS",
    detalhe: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});
app.use("/api/equipe/convites", conviteLimiter);
// O link público do orçamento é a mesma probing surface do convite.
app.use("/api/orcamentos/publico", conviteLimiter);
// Captação externa: além de probing surface, é porta de spam — mesmo teto.
app.use("/api/captacao", conviteLimiter);
// Lookbook público: o JSON é probing surface; as FOTOS não (uma página com 10
// vestidos × 2 fotos estouraria 30 req/5min no primeiro acesso legítimo).
const lookbookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => !!process.env.VITEST || !!process.env.E2E_SUITE,
  message: {
    error: "MUITAS_TENTATIVAS",
    detalhe: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});
app.use("/api/lookbooks/publico", lookbookLimiter);
// Portal da noiva (E78): mesma régua do lookbook — a página carrega N fotos
// pelo MESMO prefixo, e o teto de probing derrubaria o primeiro acesso.
app.use("/api/portal", lookbookLimiter);

app.use("/api", router);

app.use("/api", (_req, res) => {
  // S-D20 — o 404 de rota desconhecida é o único que o E145 não alcançou,
  // porque ele mora em `app.ts` e a varredura parava em `routes/`.
  res.status(404).json({ error: "ROTA_NAO_ENCONTRADA" });
});

/**
 * **A tela, servida pela MESMA origem que a API — só quando `FRONTEND_DIR` diz
 * onde ela está.**
 *
 * O cliente gerado chama caminho RELATIVO (`/api/…`): `custom-fetch.ts:64`
 * volta a entrada intacta enquanto ninguém chamar `setBaseUrl`, e **ninguém
 * chama** — o repositório inteiro só a exporta. Same-origin não é uma
 * conveniência do empacotamento, então: é o que faz o cookie de sessão
 * (`httpOnly`, `sameSite: "lax"`) chegar à API sem CORS e sem `SameSite=None`.
 *
 * No Replit e no E2E quem serve a tela é o Vite, e esta variável fica vazia —
 * o bloco inteiro some e nada muda. No contêiner ela aponta para o `dist` do
 * `vite build`, e um processo só atende a tela e a API na mesma porta.
 *
 * O caminho ERRADO reprova na SUBIDA, e não no primeiro acesso: sem o
 * `index.html` ali, todo pedido de tela cairia num 404 mudo depois do deploy
 * verde, que é a classe de defeito que só aparece no celular de quem usa.
 */
const frontendDir = process.env.FRONTEND_DIR;

if (frontendDir) {
  const indexHtml = path.join(frontendDir, "index.html");
  if (!existsSync(indexHtml)) {
    throw new Error(
      `FRONTEND_DIR aponta para "${frontendDir}", e não há index.html ali — ` +
        "a tela não foi construída (`vite build`) ou o caminho está errado.",
    );
  }

  // O que o Vite emite com hash no nome pode ser guardado para sempre; o
  // `index.html` NÃO — ele é o que aponta para os hashes novos a cada deploy, e
  // um navegador com a cópia velha pediria pedaços que já não existem. Por isso
  // o `index: false`: a página só sai pelo caminho abaixo, com `no-cache`.
  app.use(express.static(frontendDir, { index: false, maxAge: "1y" }));

  app.use((req, res, next) => {
    // A tela é um roteador de navegador (`App.tsx:356`): qualquer caminho que
    // não é arquivo devolve a página, e o React decide o que desenhar. Só GET e
    // HEAD — um POST para caminho inexistente é erro de cliente, não tela.
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const log = req.log ?? logger;
  const { status, body, logLevel, logMsg } = classificarErro(err);
  log[logLevel]({ err }, logMsg);
  if (res.headersSent) {
    return;
  }
  res.status(status).json(body);
});

export default app;
