import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { db, vmsTable, clustersTable, tenantsTable, activityTable, userVmAccessTable, tenantVmAccessTable } from "@workspace/db";
import {
  ListVmsQueryParams,
  CreateVmBody,
  GetVmParams,
  UpdateVmParams,
  UpdateVmBody,
  DeleteVmParams,
  VmActionParams,
  VmActionBody,
  ListVmsResponse,
  GetVmResponse,
  UpdateVmResponse,
  VmActionResponse,
} from "@workspace/api-zod";
import { performVmAction, getVncTicket, authenticate } from "../proxmox-client";
import { createVncSession } from "../vnc-proxy";
import { getSessionUser } from "../middleware/auth";
import { requireAdmin, requireOperatorOrAdmin } from "../middleware/auth";
import { notifyVmAction } from "../notifications";
import { checkTenantQuota } from "../quota-check";
import crypto from "node:crypto";

const router: IRouter = Router();

async function enrichVm(vm: typeof vmsTable.$inferSelect) {
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, vm.clusterId));
  const tenant = vm.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, vm.tenantId)) : [];
  return {
    ...vm,
    clusterName: cluster?.name ?? "Unknown",
    clusterHost: cluster?.host ?? "Unknown",
    tenantName: tenant[0]?.name ?? null,
    createdAt: vm.createdAt.toISOString(),
    updatedAt: vm.updatedAt.toISOString(),
  };
}

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

async function canAccessVm(userId: number, tenantId: number | null, vmId: number): Promise<boolean> {
  const allowed = await getAllowedVmIds(userId, tenantId);
  return allowed.includes(vmId);
}

router.get("/vms", async (req, res): Promise<void> => {
  const query = ListVmsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const sessionUser = getSessionUser(req);
  const isAdmin = sessionUser?.userRole === "admin";

  const conditions = [];
  if (query.data.clusterId != null) conditions.push(eq(vmsTable.clusterId, query.data.clusterId));
  if (query.data.tenantId != null) conditions.push(eq(vmsTable.tenantId, query.data.tenantId));
  if (query.data.status != null) conditions.push(eq(vmsTable.status, query.data.status));

  if (!isAdmin && sessionUser) {
    const allowedIds = await getAllowedVmIds(sessionUser.userId, sessionUser.tenantId);
    if (allowedIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(vmsTable.id, allowedIds));
  }

  const rows = conditions.length > 0
    ? await db.select().from(vmsTable).where(and(...conditions)).orderBy(vmsTable.name)
    : await db.select().from(vmsTable).orderBy(vmsTable.name);

  const clusters = await db.select().from(clustersTable);
  const tenants = await db.select().from(tenantsTable);
  const clusterMap = Object.fromEntries(clusters.map(c => [c.id, { name: c.name, host: c.host }]));
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

  const result = rows.map(vm => ({
    ...vm,
    clusterName: clusterMap[vm.clusterId]?.name ?? "Unknown",
    clusterHost: clusterMap[vm.clusterId]?.host ?? "Unknown",
    tenantName: vm.tenantId ? tenantMap[vm.tenantId] ?? null : null,
    createdAt: vm.createdAt.toISOString(),
    updatedAt: vm.updatedAt.toISOString(),
  }));
  res.json(ListVmsResponse.parse(result));
});

router.post("/vms", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const parsed = CreateVmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sessionUser = getSessionUser(req);
  if (sessionUser?.userRole !== "admin") {
    parsed.data.tenantId = sessionUser?.tenantId ?? undefined;
    if (!parsed.data.tenantId) {
      res.status(403).json({ error: "You must be assigned to a tenant before creating VMs" });
      return;
    }
  }

  if (parsed.data.tenantId) {
    const quotaCheck = await checkTenantQuota(
      parsed.data.tenantId,
      parsed.data.cpus ?? 1,
      parsed.data.memoryMb ?? 1024,
      parsed.data.diskGb ?? 10,
      parsed.data.clusterId
    );
    if (!quotaCheck.allowed) {
      res.status(403).json({ error: quotaCheck.reason });
      return;
    }
  }

  const [vm] = await db.insert(vmsTable).values(parsed.data).returning();

  if (parsed.data.tenantId && vm) {
    await db.insert(tenantVmAccessTable).values({ tenantId: parsed.data.tenantId, vmId: vm.id }).catch(() => {});
  }

  const enriched = await enrichVm(vm);
  res.status(201).json(GetVmResponse.parse(enriched));

  import("../notifications").then(({ notifyVmCreated }) => {
    notifyVmCreated(vm.name, vm.vmId, vm.type, vm.node, enriched.clusterName, sessionUser?.username ?? "system").catch(() => {});
  });
});

router.get("/vms/:id", async (req, res): Promise<void> => {
  const params = GetVmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const sessionUser = getSessionUser(req);
  const isAdmin = sessionUser?.userRole === "admin";

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, params.data.id));
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }

  if (!isAdmin && sessionUser) {
    const hasAccess = await canAccessVm(sessionUser.userId, sessionUser.tenantId, vm.id);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied to this VM" });
      return;
    }
  }

  const enriched = await enrichVm(vm);
  res.json(GetVmResponse.parse(enriched));
});

router.patch("/vms/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateVmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name != null) update.name = parsed.data.name;
  if (parsed.data.status != null) update.status = parsed.data.status;
  if (parsed.data.cpus !== undefined) update.cpus = parsed.data.cpus;
  if (parsed.data.memoryMb !== undefined) update.memoryMb = parsed.data.memoryMb;
  if (parsed.data.diskGb !== undefined) update.diskGb = parsed.data.diskGb;
  if (parsed.data.ipAddress !== undefined) update.ipAddress = parsed.data.ipAddress;
  if (parsed.data.os !== undefined) update.os = parsed.data.os;
  if (parsed.data.tenantId !== undefined) update.tenantId = parsed.data.tenantId;
  if (parsed.data.tags !== undefined) update.tags = parsed.data.tags;

  const [vm] = await db.update(vmsTable).set(update).where(eq(vmsTable.id, params.data.id)).returning();
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }
  const enriched = await enrichVm(vm);
  res.json(UpdateVmResponse.parse(enriched));
});

router.delete("/vms/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteVmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vm] = await db.delete(vmsTable).where(eq(vmsTable.id, params.data.id)).returning();
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/vms/:id/action", async (req, res): Promise<void> => {
  const params = VmActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = VmActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, params.data.id));
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }

  const sessionUser = getSessionUser(req);
  if (sessionUser && sessionUser.userRole !== "admin") {
    const hasAccess = await canAccessVm(sessionUser.userId, sessionUser.tenantId, vm.id);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied to this VM" });
      return;
    }
    if (sessionUser.userRole === "viewer") {
      res.status(403).json({ error: "Viewers cannot perform VM actions" });
      return;
    }
  }

  const action = parsed.data.action;
  let newStatus = vm.status;
  let message = "";

  if (action === "start") {
    newStatus = "running";
    message = `VM ${vm.name} started`;
  } else if (action === "stop") {
    newStatus = "stopped";
    message = `VM ${vm.name} stopped`;
  } else if (action === "reboot") {
    newStatus = "running";
    message = `VM ${vm.name} rebooted`;
  } else if (action === "shutdown") {
    newStatus = "stopped";
    message = `VM ${vm.name} shut down`;
  } else {
    res.status(400).json({ error: "Unknown action" });
    return;
  }

  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, vm.clusterId));
  if (!cluster?.passwordHash) {
    res.status(400).json({ error: "Cluster credentials not available for this VM" });
    return;
  }

  try {
    await performVmAction(
      cluster.host,
      cluster.port,
      cluster.username,
      cluster.passwordHash,
      cluster.realm,
      vm.node,
      vm.vmId,
      vm.type,
      action
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Proxmox action failed: ${errMsg}`);
    res.status(502).json({ error: `Proxmox action failed: ${errMsg}` });
    return;
  }

  await db.update(vmsTable).set({ status: newStatus }).where(eq(vmsTable.id, vm.id));

  const eventTypeMap: Record<string, string> = { start: "vm_start", stop: "vm_stop", reboot: "vm_reboot", shutdown: "vm_stop" };
  await db.insert(activityTable).values({
    eventType: eventTypeMap[action] ?? action,
    description: message,
    vmId: vm.id,
    vmName: vm.name,
  });

  res.json(VmActionResponse.parse({ success: true, message, vmId: vm.id, action }));

  const performer = sessionUser?.username ?? "system";
  notifyVmAction(vm.name, vm.vmId, action, vm.node, performer).catch(() => {});
});

router.post("/vms/:id/console", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid VM id" });
    return;
  }

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }

  const sessionUser = getSessionUser(req);
  if (sessionUser && sessionUser.userRole !== "admin") {
    const hasAccess = await canAccessVm(sessionUser.userId, sessionUser.tenantId, vm.id);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied to this VM" });
      return;
    }
  }

  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, vm.clusterId));
  if (!cluster?.passwordHash) {
    res.status(400).json({ error: "Cluster credentials not available" });
    return;
  }

  try {
    const result = await getVncTicket(
      cluster.host,
      cluster.port,
      cluster.username,
      cluster.passwordHash,
      cluster.realm,
      vm.node,
      vm.vmId,
      vm.type
    );

    const token = crypto.randomBytes(32).toString("hex");
    createVncSession(token, {
      host: cluster.host,
      port: cluster.port,
      node: vm.node,
      vmId: vm.vmId,
      type: vm.type,
      ticket: result.auth.ticket,
      vncTicket: result.ticket,
      vncPort: result.port,
      csrfToken: result.auth.csrfToken,
      createdAt: Date.now(),
    });

    res.json({
      token,
      vmName: vm.name,
      vmId: vm.vmId,
      node: vm.node,
      type: vm.type,
      vncTicket: result.ticket,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Console ticket failed: ${errMsg}`);
    res.status(502).json({ error: `Failed to get console ticket: ${errMsg}` });
  }
});

export default router;
