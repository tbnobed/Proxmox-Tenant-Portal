import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, clustersTable, vmsTable, tenantsTable, usersTable, activityTable, userVmAccessTable, tenantVmAccessTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { getSessionUser } from "../middleware/auth";
import { getNodeStatuses } from "../proxmox-client";

const router: IRouter = Router();

async function getAllowedVmIds(userId: number, tenantId: number | null): Promise<number[]> {
  const directAccess = await db
    .select({ vmId: userVmAccessTable.vmId })
    .from(userVmAccessTable)
    .where(eq(userVmAccessTable.userId, userId));

  const vmIds = new Set(directAccess.map((r) => r.vmId));

  if (tenantId) {
    const tenantAccess = await db
      .select({ vmId: tenantVmAccessTable.vmId })
      .from(tenantVmAccessTable)
      .where(eq(tenantVmAccessTable.tenantId, tenantId));
    for (const r of tenantAccess) vmIds.add(r.vmId);
  }

  return Array.from(vmIds);
}

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const sessionUser = getSessionUser(req);
  const isAdmin = sessionUser?.userRole === "admin";

  if (isAdmin) {
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
    return;
  }

  const allowedIds = sessionUser ? await getAllowedVmIds(sessionUser.userId, sessionUser.tenantId) : [];

  let totalVms = 0, runningVms = 0, stoppedVms = 0;
  if (allowedIds.length > 0) {
    const vms = await db.select({ status: vmsTable.status }).from(vmsTable).where(inArray(vmsTable.id, allowedIds));
    totalVms = vms.length;
    runningVms = vms.filter(v => v.status === "running").length;
    stoppedVms = vms.filter(v => v.status === "stopped").length;
  }

  res.json(GetDashboardStatsResponse.parse({
    totalClusters: 0,
    onlineClusters: 0,
    totalVms,
    runningVms,
    stoppedVms,
    totalTenants: 0,
    activeTenants: 0,
    totalUsers: 0,
    activeUsers: 0,
  }));
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const sessionUser = getSessionUser(req);
  const isAdmin = sessionUser?.userRole === "admin";

  let rows;
  if (isAdmin) {
    rows = await db.select().from(activityTable).orderBy(sql`${activityTable.createdAt} DESC`).limit(20);
  } else if (sessionUser) {
    const allowedIds = await getAllowedVmIds(sessionUser.userId, sessionUser.tenantId);
    if (allowedIds.length === 0) {
      res.json([]);
      return;
    }
    rows = await db.select().from(activityTable)
      .where(inArray(activityTable.vmId, allowedIds))
      .orderBy(sql`${activityTable.createdAt} DESC`)
      .limit(20);
  } else {
    rows = [];
  }

  const result = rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(GetRecentActivityResponse.parse(result));
});

router.get("/dashboard/health", async (req, res): Promise<void> => {
  const sessionUser = getSessionUser(req);
  if (sessionUser?.userRole !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const allClusters = await db.select().from(clustersTable);
  const allVms = await db.select({ id: vmsTable.id, status: vmsTable.status, clusterId: vmsTable.clusterId }).from(vmsTable);

  const clusterHealthResults = await Promise.allSettled(
    allClusters.map(async (cluster) => {
      try {
        const nodes = await getNodeStatuses(
          cluster.host,
          cluster.port,
          cluster.username,
          cluster.passwordHash,
          cluster.realm
        );
        const clusterVms = allVms.filter(v => v.clusterId === cluster.id);
        return {
          clusterId: cluster.id,
          clusterName: cluster.name,
          status: cluster.status,
          nodes: nodes.map(n => ({
            name: n.node,
            status: n.status,
            cpuUsage: n.cpuUsage,
            memUsed: n.memUsed,
            memTotal: n.memTotal,
            rootFsUsed: n.rootFsUsed,
            rootFsTotal: n.rootFsTotal,
            uptime: n.uptime,
          })),
          vms: {
            total: clusterVms.length,
            running: clusterVms.filter(v => v.status === "running").length,
            stopped: clusterVms.filter(v => v.status === "stopped").length,
            paused: clusterVms.filter(v => v.status === "paused").length,
          },
        };
      } catch {
        const clusterVms = allVms.filter(v => v.clusterId === cluster.id);
        return {
          clusterId: cluster.id,
          clusterName: cluster.name,
          status: "offline" as const,
          nodes: [],
          vms: {
            total: clusterVms.length,
            running: clusterVms.filter(v => v.status === "running").length,
            stopped: clusterVms.filter(v => v.status === "stopped").length,
            paused: clusterVms.filter(v => v.status === "paused").length,
          },
        };
      }
    })
  );

  const clusters = clusterHealthResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);

  res.json({ clusters });
});

export default router;
