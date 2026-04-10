import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, clustersTable, vmsTable, tenantsTable, usersTable, activityTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const [totalClusters] = await db.select({ count: sql<number>`count(*)::int` }).from(clustersTable);
  const [onlineClusters] = await db.select({ count: sql<number>`count(*)::int` }).from(clustersTable).where(eq(clustersTable.status, "online"));
  const [totalVms] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable);
  const [runningVms] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.status, "running"));
  const [stoppedVms] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.status, "stopped"));
  const [totalTenants] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantsTable);
  const [activeTenants] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantsTable).where(eq(tenantsTable.status, "active"));
  const [totalUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [activeUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.status, "active"));

  res.json(GetDashboardStatsResponse.parse({
    totalClusters: totalClusters?.count ?? 0,
    onlineClusters: onlineClusters?.count ?? 0,
    totalVms: totalVms?.count ?? 0,
    runningVms: runningVms?.count ?? 0,
    stoppedVms: stoppedVms?.count ?? 0,
    totalTenants: totalTenants?.count ?? 0,
    activeTenants: activeTenants?.count ?? 0,
    totalUsers: totalUsers?.count ?? 0,
    activeUsers: activeUsers?.count ?? 0,
  }));
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const rows = await db.select().from(activityTable).orderBy(sql`${activityTable.createdAt} DESC`).limit(20);
  const result = rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(GetRecentActivityResponse.parse(result));
});

export default router;
