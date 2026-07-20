import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { classificarErro } from "./lib/erros";

const app: Express = express();

// Atrás do proxy do Replit — necessário para o rate-limit ver o IP real.
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
app.use(helmet());

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
app.use("/api/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", express.json({ limit: "6mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Força bruta no login: 20 tentativas por IP a cada 5 minutos.
// Sob vitest o limite é pulado (a suíte loga dezenas de vezes do mesmo IP).
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => !!process.env.VITEST,
  message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});
app.use("/api/auth/login", loginLimiter);

// As rotas públicas de convite (info/aceitar) são probing surface: 30 req por
// IP a cada 5 minutos cobre o uso legítimo com folga.
const conviteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => !!process.env.VITEST,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});
app.use("/api/equipe/convites", conviteLimiter);
// O link público do orçamento é a mesma probing surface do convite.
app.use("/api/orcamentos/publico", conviteLimiter);

app.use("/api", router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

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
