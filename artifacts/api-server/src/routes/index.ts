import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import equipeRouter from "./equipe";
import catalogoRouter from "./catalogo";
import vestidosRouter from "./vestidos";
import leadsRouter from "./leads";
import agendaRouter from "./agenda";
import reservasRouter from "./reservas";
import orcamentosRouter from "./orcamentos";
import contratosRouter from "./contratos";
import financeiroRouter from "./financeiro";
import comissaoRouter from "./comissao";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(equipeRouter);
router.use(catalogoRouter);
router.use(vestidosRouter);
router.use(leadsRouter);
router.use(agendaRouter);
router.use(reservasRouter);
router.use(orcamentosRouter);
router.use(contratosRouter);
router.use(financeiroRouter);
router.use(comissaoRouter);
router.use(dashboardRouter);

export default router;
