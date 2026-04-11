import { Router, type IRouter } from "express";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { db, tenantsTable, tenantClusterAccessTable, clustersTable, vmsTable, tenantVmAccessTable } from "@workspace/db";
import { requireAdmin, getSessionUser } from "../middleware/auth";

const router: IRouter = Router();

router.get("/tenants/:id/quotas", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid tenant id" }); return; }
  const sessionUser = getSessionUser(req);
  if (sessionUser?.userRole !== "admin" && sessionUser?.tenantId !== id) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const directVms = await db.select({
    id: vmsTable.id,
    cpus: vmsTable.cpus,
    memoryMb: vmsTable.memoryMb,
    diskGb: vmsTable.diskGb,
  }).from(vmsTable).where(eq(vmsTable.tenantId, id));

  const accessVmIds = await db.select({ vmId: tenantVmAccessTable.vmId })
    .from(tenantVmAccessTable)
    .where(eq(tenantVmAccessTable.tenantId, id));

  const directVmIds = new Set(directVms.map(v => v.id));
  const extraVmIds = accessVmIds.map(a => a.vmId).filter(vid => !directVmIds.has(vid));

  let accessVms: { cpus: number | null; memoryMb: number | null; diskGb: number | null }[] = [];
  if (extraVmIds.length > 0) {
    accessVms = await db.select({
      cpus: vmsTable.cpus,
      memoryMb: vmsTable.memoryMb,
      diskGb: vmsTable.diskGb,
    }).from(vmsTable).where(inArray(vmsTable.id, extraVmIds));
  }

  const tenantVms = [...directVms, ...accessVms];
  let usedCpus = 0, usedMemoryMb = 0, usedDiskGb = 0;
  for (const v of tenantVms) {
    usedCpus += v.cpus ?? 0;
    usedMemoryMb += v.memoryMb ?? 0;
    usedDiskGb += v.diskGb ?? 0;
  }

  res.json({
    limits: {
      maxVms: tenant.maxVms,
      maxCpusTotal: tenant.maxCpusTotal,
      maxMemoryMbTotal: tenant.maxMemoryMbTotal,
      maxDiskGbTotal: tenant.maxDiskGbTotal,
      maxCpusPerVm: tenant.maxCpusPerVm,
      maxMemoryMbPerVm: tenant.maxMemoryMbPerVm,
      maxDiskGbPerVm: tenant.maxDiskGbPerVm,
    },
    usage: {
      vmCount: tenantVms.length,
      cpus: usedCpus,
      memoryMb: usedMemoryMb,
      diskGb: usedDiskGb,
    },
  });
});

router.patch("/tenants/:id/quotas", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid tenant id" }); return; }

  const { maxVms, maxCpusTotal, maxMemoryMbTotal, maxDiskGbTotal, maxCpusPerVm, maxMemoryMbPerVm, maxDiskGbPerVm } = req.body;

  const update: Record<string, unknown> = {};
  if (maxVms !== undefined) update.maxVms = maxVms;
  if (maxCpusTotal !== undefined) update.maxCpusTotal = maxCpusTotal;
  if (maxMemoryMbTotal !== undefined) update.maxMemoryMbTotal = maxMemoryMbTotal;
  if (maxDiskGbTotal !== undefined) update.maxDiskGbTotal = maxDiskGbTotal;
  if (maxCpusPerVm !== undefined) update.maxCpusPerVm = maxCpusPerVm;
  if (maxMemoryMbPerVm !== undefined) update.maxMemoryMbPerVm = maxMemoryMbPerVm;
  if (maxDiskGbPerVm !== undefined) update.maxDiskGbPerVm = maxDiskGbPerVm;

  const [tenant] = await db.update(tenantsTable).set(update).where(eq(tenantsTable.id, id)).returning();
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  res.json({
    maxVms: tenant.maxVms,
    maxCpusTotal: tenant.maxCpusTotal,
    maxMemoryMbTotal: tenant.maxMemoryMbTotal,
    maxDiskGbTotal: tenant.maxDiskGbTotal,
    maxCpusPerVm: tenant.maxCpusPerVm,
    maxMemoryMbPerVm: tenant.maxMemoryMbPerVm,
    maxDiskGbPerVm: tenant.maxDiskGbPerVm,
  });
});

router.get("/tenants/:id/clusters", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid tenant id" }); return; }
  const sessionUser = getSessionUser(req);
  if (sessionUser?.userRole !== "admin" && sessionUser?.tenantId !== id) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const grants = await db.select({
    id: tenantClusterAccessTable.id,
    tenantId: tenantClusterAccessTable.tenantId,
    clusterId: tenantClusterAccessTable.clusterId,
    grantedAt: tenantClusterAccessTable.grantedAt,
    clusterName: clustersTable.name,
    clusterHost: clustersTable.host,
    clusterStatus: clustersTable.status,
  }).from(tenantClusterAccessTable)
    .innerJoin(clustersTable, eq(tenantClusterAccessTable.clusterId, clustersTable.id))
    .where(eq(tenantClusterAccessTable.tenantId, id));

  res.json(grants.map(g => ({
    ...g,
    grantedAt: g.grantedAt.toISOString(),
  })));
});

router.post("/tenants/:id/clusters", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = parseInt(req.params.id, 10);
  if (isNaN(tenantId)) { res.status(400).json({ error: "Invalid tenant id" }); return; }

  const { clusterId } = req.body;
  if (!clusterId) { res.status(400).json({ error: "clusterId is required" }); return; }

  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, clusterId));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }

  const existing = await db.select().from(tenantClusterAccessTable)
    .where(and(eq(tenantClusterAccessTable.tenantId, tenantId), eq(tenantClusterAccessTable.clusterId, clusterId)));
  if (existing.length > 0) { res.status(409).json({ error: "Cluster access already granted" }); return; }

  try {
    const [row] = await db.insert(tenantClusterAccessTable).values({ tenantId, clusterId }).returning();
    res.status(201).json({
      ...row,
      clusterName: cluster.name,
      clusterHost: cluster.host,
      clusterStatus: cluster.status,
      grantedAt: row.grantedAt.toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to grant cluster access" });
  }
});

router.delete("/tenants/:tenantId/clusters/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(tenantClusterAccessTable).where(eq(tenantClusterAccessTable.id, id));
  res.sendStatus(204);
});

export default router;
