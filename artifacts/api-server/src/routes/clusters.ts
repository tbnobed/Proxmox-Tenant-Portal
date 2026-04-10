import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, clustersTable, vmsTable } from "@workspace/db";
import { syncFromProxmox } from "../proxmox-client";
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

  try {
    const proxmoxVms = await syncFromProxmox(
      cluster.host,
      cluster.port,
      cluster.username,
      cluster.passwordHash,
      cluster.realm
    );

    let added = 0;
    let updated = 0;

    const existingVms = await db
      .select()
      .from(vmsTable)
      .where(eq(vmsTable.clusterId, cluster.id));

    const existingByVmId = new Map(existingVms.map(v => [v.vmId, v]));
    const seenVmIds = new Set<number>();

    for (const pvm of proxmoxVms) {
      seenVmIds.add(pvm.vmId);
      const existing = existingByVmId.get(pvm.vmId);

      if (existing) {
        await db
          .update(vmsTable)
          .set({
            name: pvm.name,
            node: pvm.node,
            type: pvm.type,
            status: pvm.status,
            cpus: pvm.cpus,
            memoryMb: pvm.memoryMb,
            diskGb: pvm.diskGb,
            tags: pvm.tags,
          })
          .where(eq(vmsTable.id, existing.id));
        updated++;
      } else {
        await db.insert(vmsTable).values({
          vmId: pvm.vmId,
          name: pvm.name,
          node: pvm.node,
          type: pvm.type,
          status: pvm.status,
          cpus: pvm.cpus,
          memoryMb: pvm.memoryMb,
          diskGb: pvm.diskGb,
          tags: pvm.tags,
          clusterId: cluster.id,
        });
        added++;
      }
    }

    const removed = existingVms.filter(v => !seenVmIds.has(v.vmId));
    for (const rv of removed) {
      await db.delete(vmsTable).where(eq(vmsTable.id, rv.id));
    }

    await db
      .update(clustersTable)
      .set({ status: "online" })
      .where(eq(clustersTable.id, cluster.id));

    res.json(
      SyncClusterResponse.parse({
        synced: proxmoxVms.length,
        added,
        updated,
        message: `Sync complete. ${added} added, ${updated} updated, ${removed.length} removed.`,
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(clustersTable)
      .set({ status: "offline" })
      .where(eq(clustersTable.id, cluster.id));
    res.status(502).json({ error: `Failed to sync with Proxmox: ${message}` });
  }
});

export default router;
