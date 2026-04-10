import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, clustersTable, vmsTable } from "@workspace/db";
import {
  CreateClusterBody,
  GetClusterParams,
  UpdateClusterParams,
  UpdateClusterBody,
  DeleteClusterParams,
  SyncClusterParams,
  ListClustersResponse,
  GetClusterResponse,
  UpdateClusterResponse,
  SyncClusterResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clusters", async (_req, res): Promise<void> => {
  const rows = await db.select().from(clustersTable).orderBy(clustersTable.name);
  const vmCounts = await db
    .select({ clusterId: vmsTable.clusterId, count: sql<number>`count(*)::int` })
    .from(vmsTable)
    .groupBy(vmsTable.clusterId);
  const countMap = Object.fromEntries(vmCounts.map(r => [r.clusterId, r.count]));

  const result = rows.map(c => ({
    ...c,
    vmCount: countMap[c.id] ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
  res.json(ListClustersResponse.parse(result));
});

router.post("/clusters", async (req, res): Promise<void> => {
  const parsed = CreateClusterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const [cluster] = await db.insert(clustersTable).values({
    ...rest,
    passwordHash: password,
    status: "unknown",
  }).returning();
  res.status(201).json(GetClusterResponse.parse({
    ...cluster,
    vmCount: 0,
    createdAt: cluster.createdAt.toISOString(),
    updatedAt: cluster.updatedAt.toISOString(),
  }));
});

router.get("/clusters/:id", async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) {
    res.status(404).json({ error: "Cluster not found" });
    return;
  }
  const [vmCount] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.clusterId, cluster.id));
  res.json(GetClusterResponse.parse({
    ...cluster,
    vmCount: vmCount?.count ?? 0,
    createdAt: cluster.createdAt.toISOString(),
    updatedAt: cluster.updatedAt.toISOString(),
  }));
});

router.patch("/clusters/:id", async (req, res): Promise<void> => {
  const params = UpdateClusterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClusterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (rest.name != null) updateData.name = rest.name;
  if (rest.host != null) updateData.host = rest.host;
  if (rest.port != null) updateData.port = rest.port;
  if (rest.username != null) updateData.username = rest.username;
  if (rest.realm != null) updateData.realm = rest.realm;
  if (rest.status != null) updateData.status = rest.status;
  if (password != null) updateData.passwordHash = password;

  const [cluster] = await db.update(clustersTable).set(updateData).where(eq(clustersTable.id, params.data.id)).returning();
  if (!cluster) {
    res.status(404).json({ error: "Cluster not found" });
    return;
  }
  const [vmCount] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.clusterId, cluster.id));
  res.json(UpdateClusterResponse.parse({
    ...cluster,
    vmCount: vmCount?.count ?? 0,
    createdAt: cluster.createdAt.toISOString(),
    updatedAt: cluster.updatedAt.toISOString(),
  }));
});

router.delete("/clusters/:id", async (req, res): Promise<void> => {
  const params = DeleteClusterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cluster] = await db.delete(clustersTable).where(eq(clustersTable.id, params.data.id)).returning();
  if (!cluster) {
    res.status(404).json({ error: "Cluster not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/clusters/:id/sync", async (req, res): Promise<void> => {
  const params = SyncClusterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) {
    res.status(404).json({ error: "Cluster not found" });
    return;
  }
  // Real Proxmox sync would happen here — for now mark cluster as online
  await db.update(clustersTable).set({ status: "online" }).where(eq(clustersTable.id, cluster.id));
  res.json(SyncClusterResponse.parse({ synced: 0, added: 0, updated: 0, message: "Sync complete. Add VMs manually or configure Proxmox API credentials." }));
});

export default router;
