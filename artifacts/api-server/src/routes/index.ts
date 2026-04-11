import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/auth";
import healthRouter from "./health";
import clustersRouter from "./clusters";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import vmsRouter from "./vms";
import accessRouter from "./access";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vmsRouter);
router.use(dashboardRouter);

router.use(clustersRouter);
router.use(requireAdmin, tenantsRouter);
router.use(requireAdmin, usersRouter);
router.use(requireAdmin, accessRouter);

export default router;
