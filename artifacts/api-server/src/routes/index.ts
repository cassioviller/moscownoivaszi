import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import equipeRouter from "./equipe.js";
import lojaRouter from "./loja.js";
import orcamentosRouter from "./orcamentos.js";
import seedRouter from "./seed.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(equipeRouter);
router.use(lojaRouter);
router.use(orcamentosRouter);
router.use(seedRouter);

export default router;
