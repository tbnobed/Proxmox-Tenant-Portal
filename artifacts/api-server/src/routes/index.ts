import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clustersRouter from "./clusters";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import vmsRouter from "./vms";
import accessRouter from "./access";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clustersRouter);
router.use(tenantsRouter);
router.use(usersRouter);
router.use(vmsRouter);
router.use(accessRouter);
router.use(dashboardRouter);

export default router;
