import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api", router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// Códigos de erro do Postgres podem vir no erro raiz ou embrulhados
// pelo driver/ORM em `cause`.
function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" ? code : undefined;
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const log = req.log ?? logger;
  const code = pgErrorCode(err);

  if (code === "23505") {
    log.warn({ err }, "Violação de unicidade");
    res.status(409).json({ error: "Registro duplicado ou conflito de dados" });
    return;
  }

  if (code === "23503") {
    log.warn({ err }, "Violação de integridade referencial");
    res.status(409).json({ error: "Operação viola vínculos existentes" });
    return;
  }

  if (code === "23P01") {
    // EXCLUDE bloqueio_vestidos_sem_sobreposicao: cinto de segurança do
    // banco contra sobreposição de ocupação física de vestido.
    log.warn({ err }, "Violação de exclusão (sobreposição de disponibilidade)");
    res.status(409).json({ error: "Conflito de disponibilidade" });
    return;
  }

  log.error({ err }, "Erro não tratado");
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Erro interno do servidor" });
});

export default app;
