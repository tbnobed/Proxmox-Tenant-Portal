import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, clustersTable, vmsTable } from "@workspace/db";
import { requireAdmin, requireOperatorOrAdmin, getSessionUser } from "../middleware/auth";
import {
  syncFromProxmox,
  getNodeStatuses,
  getNextVmId,
  getNodeList,
  getStoragePools,
  getIsoImages,
  getContainerTemplates,
  createQemuVm,
  createLxcContainer,
} from "../proxmox-client";
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

router.get("/clusters", requireOperatorOrAdmin, async (_req, res): Promise<void> => {
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

router.post("/clusters", requireAdmin, async (req, res): Promise<void> => {
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

router.get("/clusters/:id", requireOperatorOrAdmin, async (req, res): Promise<void> => {
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

router.patch("/clusters/:id", requireAdmin, async (req, res): Promise<void> => {
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

router.delete("/clusters/:id", requireAdmin, async (req, res): Promise<void> => {
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

router.get("/clusters/:id/nodes", requireOperatorOrAdmin, async (req, res): Promise<void> => {
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

  try {
    const nodeStatuses = await getNodeStatuses(
      cluster.host,
      cluster.port,
      cluster.username,
      cluster.passwordHash,
      cluster.realm
    );
    res.json(nodeStatuses);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to fetch node statuses for cluster", cluster.id, ":", message);
    res.status(502).json({ error: `Failed to connect to Proxmox: ${message}` });
  }
});

router.post("/clusters/:id/sync", requireAdmin, async (req, res): Promise<void> => {
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
    console.error("Proxmox sync error for cluster", cluster.id, cluster.host, ":", message);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    await db
      .update(clustersTable)
      .set({ status: "offline" })
      .where(eq(clustersTable.id, cluster.id));
    res.status(502).json({ error: `Failed to sync with Proxmox: ${message}` });
  }
});

router.get("/clusters/:id/nextid", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const nextId = await getNextVmId(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm);
    res.json({ vmid: nextId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to get next VM ID: ${message}` });
  }
});

router.get("/clusters/:id/resources/nodes", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const nodes = await getNodeList(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm);
    res.json(nodes);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to list nodes: ${message}` });
  }
});

router.get("/clusters/:id/resources/storage", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const node = req.query.node as string;
  if (!node) { res.status(400).json({ error: "node query parameter required" }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const pools = await getStoragePools(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm, node);
    res.json(pools);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to list storage: ${message}` });
  }
});

router.get("/clusters/:id/resources/isos", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const node = req.query.node as string;
  const storage = req.query.storage as string;
  if (!node || !storage) { res.status(400).json({ error: "node and storage query parameters required" }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const isos = await getIsoImages(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm, node, storage);
    res.json(isos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to list ISOs: ${message}` });
  }
});

router.get("/clusters/:id/resources/templates", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const node = req.query.node as string;
  const storage = req.query.storage as string;
  if (!node || !storage) { res.status(400).json({ error: "node and storage query parameters required" }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const templates = await getContainerTemplates(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm, node, storage);
    res.json(templates);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to list templates: ${message}` });
  }
});

router.get("/clusters/:id/resources/networks", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const node = req.query.node as string;
  if (!node) { res.status(400).json({ error: "node query parameter required" }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }
  try {
    const { authenticate: authFn } = await import("../proxmox-client");
    const auth = await authFn(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm);
    const https = await import("node:https");
    const url = `https://${cluster.host}:${cluster.port}/api2/json/nodes/${node}/network`;
    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request(url, {
        method: "GET",
        headers: { Cookie: `PVEAuthCookie=${auth.ticket}`, CSRFPreventionToken: auth.csrfToken },
        rejectUnauthorized: false,
      }, (r) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({}); }
        });
      });
      req.on("error", reject);
      req.end();
    });
    const networks = (result.data ?? [])
      .filter((n: any) => n.type === "bridge")
      .map((n: any) => ({
        iface: n.iface,
        type: n.type,
        active: n.active ?? 0,
        address: n.address ?? "",
        cidr: n.cidr ?? "",
        bridgePorts: n.bridge_ports ?? "",
        comments: n.comments ?? "",
      }));
    res.json(networks);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to list networks: ${message}` });
  }
});

router.post("/clusters/:id/create-vm", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const params = GetClusterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, params.data.id));
  if (!cluster) { res.status(404).json({ error: "Cluster not found" }); return; }

  const sessionUser = getSessionUser(req);
  const { type, node, vmid, name, cores, memory, diskSize, storage, iso, template, ostype, bridge, startAfterCreate, rootPassword, sockets, vcpus, balloon, description, vlan } = req.body;
  const tenantId = sessionUser?.userRole === "admin"
    ? (req.body.tenantId ?? undefined)
    : sessionUser?.tenantId ?? undefined;

  if (!type || !node || !vmid || !name || !cores || !memory || !diskSize || !storage) {
    res.status(400).json({ error: "Missing required fields: type, node, vmid, name, cores, memory, diskSize, storage" });
    return;
  }

  if (sessionUser?.userRole !== "admin" && tenantId) {
    const { tenantClusterAccessTable } = await import("@workspace/db");
    const [grant] = await db.select().from(tenantClusterAccessTable)
      .where(and(
        eq(tenantClusterAccessTable.tenantId, tenantId),
        eq(tenantClusterAccessTable.clusterId, params.data.id)
      ));
    if (!grant) {
      res.status(403).json({ error: "Your tenant does not have access to this cluster" });
      return;
    }
  }

  if (tenantId) {
    const { checkTenantQuota } = await import("../quota-check");
    const totalCpus = type === "qemu" ? cores * (sockets || 1) : cores;
    const quotaCheck = await checkTenantQuota(tenantId, totalCpus, memory, diskSize, cluster.id);
    if (!quotaCheck.allowed) {
      res.status(403).json({ error: quotaCheck.reason });
      return;
    }
  }

  try {
    if (type === "qemu") {
      const netConfig = `virtio,bridge=${bridge || "vmbr0"}${vlan ? `,tag=${vlan}` : ""}`;
      const { authenticate: authFn } = await import("../proxmox-client");
      const auth = await authFn(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm);
      const pms: Record<string, string> = {
        vmid: String(vmid),
        name,
        cores: String(cores),
        sockets: String(sockets || 1),
        memory: String(memory),
        scsihw: "virtio-scsi-single",
        scsi0: `${storage}:${diskSize}`,
        net0: netConfig,
        ostype: ostype || "l26",
        boot: "order=scsi0",
        agent: "1",
      };
      if (vcpus) pms.vcpus = String(vcpus);
      if (balloon != null) pms.balloon = String(balloon);
      if (description) pms.description = description;
      if (iso) {
        pms.ide2 = `${iso},media=cdrom`;
        pms.boot = "order=ide2;scsi0";
      }
      const body = Object.entries(pms).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      const https = await import("node:https");
      const url = `https://${cluster.host}:${cluster.port}/api2/json/nodes/${node}/qemu`;
      const result = await new Promise<any>((resolve, reject) => {
        const r = https.request(url, {
          method: "POST",
          headers: {
            Cookie: `PVEAuthCookie=${auth.ticket}`,
            CSRFPreventionToken: auth.csrfToken,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body).toString(),
          },
          rejectUnauthorized: false,
        }, (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => {
            try { resolve({ status: resp.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
            catch { resolve({ status: resp.statusCode, data: Buffer.concat(chunks).toString() }); }
          });
        });
        r.on("error", reject);
        r.write(body);
        r.end();
      });

      if (result.status !== 200) {
        const errMsg = typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data);
        throw new Error(`Proxmox returned ${result.status}: ${errMsg}`);
      }

      if (startAfterCreate) {
        try {
          const startUrl = `https://${cluster.host}:${cluster.port}/api2/json/nodes/${node}/qemu/${vmid}/status/start`;
          await new Promise<void>((resolve, reject) => {
            const r = https.request(startUrl, {
              method: "POST",
              headers: { Cookie: `PVEAuthCookie=${auth.ticket}`, CSRFPreventionToken: auth.csrfToken },
              rejectUnauthorized: false,
            }, () => resolve());
            r.on("error", reject);
            r.end();
          });
        } catch (e) { console.error("Auto-start failed:", e); }
      }

      const [createdVm] = await db.insert(vmsTable).values({
        vmId: vmid,
        name,
        node,
        type: "qemu",
        status: startAfterCreate ? "running" : "stopped",
        cpus: cores * (sockets || 1),
        memoryMb: memory,
        diskGb: diskSize,
        clusterId: cluster.id,
        ...(tenantId ? { tenantId } : {}),
      }).returning();

      if (tenantId && createdVm) {
        const { tenantVmAccessTable } = await import("@workspace/db");
        await db.insert(tenantVmAccessTable).values({ tenantId, vmId: createdVm.id }).catch(() => {});
      }

      res.json({ success: true, upid: result.data?.data, type: "qemu", vmid });
    } else if (type === "lxc") {
      const netConfig = `name=eth0,bridge=${bridge || "vmbr0"},ip=dhcp${vlan ? `,tag=${vlan}` : ""}`;
      const { authenticate: authFn } = await import("../proxmox-client");
      const auth = await authFn(cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm);
      const pms: Record<string, string> = {
        vmid: String(vmid),
        hostname: name,
        cores: String(cores),
        memory: String(memory),
        rootfs: `${storage}:${diskSize}`,
        net0: netConfig,
        ostemplate: template || "",
        unprivileged: "1",
      };
      if (rootPassword) pms.password = rootPassword;
      if (description) pms.description = description;

      const body = Object.entries(pms).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      const https = await import("node:https");
      const url = `https://${cluster.host}:${cluster.port}/api2/json/nodes/${node}/lxc`;
      const result = await new Promise<any>((resolve, reject) => {
        const r = https.request(url, {
          method: "POST",
          headers: {
            Cookie: `PVEAuthCookie=${auth.ticket}`,
            CSRFPreventionToken: auth.csrfToken,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body).toString(),
          },
          rejectUnauthorized: false,
        }, (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => {
            try { resolve({ status: resp.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
            catch { resolve({ status: resp.statusCode, data: Buffer.concat(chunks).toString() }); }
          });
        });
        r.on("error", reject);
        r.write(body);
        r.end();
      });

      if (result.status !== 200) {
        const errMsg = typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data);
        throw new Error(`Proxmox returned ${result.status}: ${errMsg}`);
      }

      if (startAfterCreate) {
        try {
          const startUrl = `https://${cluster.host}:${cluster.port}/api2/json/nodes/${node}/lxc/${vmid}/status/start`;
          await new Promise<void>((resolve, reject) => {
            const r = https.request(startUrl, {
              method: "POST",
              headers: { Cookie: `PVEAuthCookie=${auth.ticket}`, CSRFPreventionToken: auth.csrfToken },
              rejectUnauthorized: false,
            }, () => resolve());
            r.on("error", reject);
            r.end();
          });
        } catch (e) { console.error("Auto-start failed:", e); }
      }

      const [createdLxc] = await db.insert(vmsTable).values({
        vmId: vmid,
        name,
        node,
        type: "lxc",
        status: startAfterCreate ? "running" : "stopped",
        cpus: cores,
        memoryMb: memory,
        diskGb: diskSize,
        clusterId: cluster.id,
        ...(tenantId ? { tenantId } : {}),
      }).returning();

      if (tenantId && createdLxc) {
        const { tenantVmAccessTable } = await import("@workspace/db");
        await db.insert(tenantVmAccessTable).values({ tenantId, vmId: createdLxc.id }).catch(() => {});
      }

      res.json({ success: true, upid: result.data?.data, type: "lxc", vmid });
    } else {
      res.status(400).json({ error: "type must be 'qemu' or 'lxc'" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("VM creation error:", message);
    res.status(502).json({ error: `Failed to create VM: ${message}` });
  }
});

export default router;
