import { db, clustersTable, vmsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncFromProxmox } from "./proxmox-client";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

async function syncCluster(cluster: typeof clustersTable.$inferSelect): Promise<{ added: number; updated: number; removed: number }> {
  const proxmoxVms = await syncFromProxmox(
    cluster.host,
    cluster.port,
    cluster.username,
    cluster.passwordHash,
    cluster.realm
  );

  const existingVms = await db
    .select()
    .from(vmsTable)
    .where(eq(vmsTable.clusterId, cluster.id));

  const existingByVmId = new Map(existingVms.map(v => [v.vmId, v]));
  const seenVmIds = new Set<number>();
  let added = 0;
  let updated = 0;

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
          ipAddress: pvm.ipAddress,
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
        ipAddress: pvm.ipAddress,
        clusterId: cluster.id,
      });
      added++;
    }
  }

  const removedVms = existingVms.filter(v => !seenVmIds.has(v.vmId));
  for (const rv of removedVms) {
    await db.delete(vmsTable).where(eq(vmsTable.id, rv.id));
  }

  await db
    .update(clustersTable)
    .set({ status: "online" })
    .where(eq(clustersTable.id, cluster.id));

  return { added, updated, removed: removedVms.length };
}

async function syncAllClusters(): Promise<void> {
  if (isSyncing) {
    console.log("[Auto-Sync] Skipping — previous sync still in progress");
    return;
  }

  isSyncing = true;
  try {
    const clusters = await db.select().from(clustersTable);
    if (clusters.length === 0) return;

    console.log(`[Auto-Sync] Syncing ${clusters.length} cluster(s)...`);

    for (const cluster of clusters) {
      try {
        const result = await syncCluster(cluster);
        console.log(
          `[Auto-Sync] ${cluster.name}: ${result.added} added, ${result.updated} updated, ${result.removed} removed`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Auto-Sync] Failed to sync cluster ${cluster.name} (${cluster.host}):`, message);
        await db
          .update(clustersTable)
          .set({ status: "offline" })
          .where(eq(clustersTable.id, cluster.id));
      }
    }

    console.log("[Auto-Sync] Complete");
  } catch (err) {
    console.error("[Auto-Sync] Error:", err);
  } finally {
    isSyncing = false;
  }
}

export function startClusterAutoSync(): void {
  const intervalMs = parseInt(process.env.CLUSTER_SYNC_INTERVAL_MS ?? "", 10) || DEFAULT_INTERVAL_MS;
  console.log(`[Auto-Sync] Scheduler started (interval: ${intervalMs / 1000}s)`);

  setTimeout(() => {
    syncAllClusters().catch(err => console.error("[Auto-Sync] Initial sync error:", err));
  }, 10_000);

  syncInterval = setInterval(() => {
    syncAllClusters().catch(err => console.error("[Auto-Sync] Error:", err));
  }, intervalMs);
}

export function stopClusterAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export { syncCluster };
