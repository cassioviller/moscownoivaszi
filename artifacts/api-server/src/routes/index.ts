import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import convitesRouter from "./convites";
import orcamentosPublicoRouter from "./orcamentos-publico";
import portalRouter from "./portal";
import captacaoRouter from "./captacao";
import lookbooksRouter from "./lookbooks";
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
// PÚBLICO (aceite de convite, orçamento da noiva) — TEM de vir antes dos
// routers de domínio: eles aplicam requireSessaoComLoja sem path, e depois
// deles isto viraria 401.
router.use(convitesRouter);
router.use(orcamentosPublicoRouter);
router.use(portalRouter);
router.use(captacaoRouter);
router.use(lookbooksRouter);
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
