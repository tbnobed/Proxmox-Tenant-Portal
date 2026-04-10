import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, vmsTable, clustersTable, tenantsTable, activityTable } from "@workspace/db";
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

const router: IRouter = Router();

async function enrichVm(vm: typeof vmsTable.$inferSelect) {
  const [cluster] = await db.select().from(clustersTable).where(eq(clustersTable.id, vm.clusterId));
  const tenant = vm.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, vm.tenantId)) : [];
  return {
    ...vm,
    clusterName: cluster?.name ?? "Unknown",
    tenantName: tenant[0]?.name ?? null,
    createdAt: vm.createdAt.toISOString(),
    updatedAt: vm.updatedAt.toISOString(),
  };
}

router.get("/vms", async (req, res): Promise<void> => {
  const query = ListVmsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.clusterId != null) conditions.push(eq(vmsTable.clusterId, query.data.clusterId));
  if (query.data.tenantId != null) conditions.push(eq(vmsTable.tenantId, query.data.tenantId));
  if (query.data.status != null) conditions.push(eq(vmsTable.status, query.data.status));

  const rows = conditions.length > 0
    ? await db.select().from(vmsTable).where(and(...conditions)).orderBy(vmsTable.name)
    : await db.select().from(vmsTable).orderBy(vmsTable.name);

  const clusters = await db.select().from(clustersTable);
  const tenants = await db.select().from(tenantsTable);
  const clusterMap = Object.fromEntries(clusters.map(c => [c.id, c.name]));
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

  const result = rows.map(vm => ({
    ...vm,
    clusterName: clusterMap[vm.clusterId] ?? "Unknown",
    tenantName: vm.tenantId ? tenantMap[vm.tenantId] ?? null : null,
    createdAt: vm.createdAt.toISOString(),
    updatedAt: vm.updatedAt.toISOString(),
  }));
  res.json(ListVmsResponse.parse(result));
});

router.post("/vms", async (req, res): Promise<void> => {
  const parsed = CreateVmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vm] = await db.insert(vmsTable).values(parsed.data).returning();
  const enriched = await enrichVm(vm);
  res.status(201).json(GetVmResponse.parse(enriched));
});

router.get("/vms/:id", async (req, res): Promise<void> => {
  const params = GetVmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, params.data.id));
  if (!vm) {
    res.status(404).json({ error: "VM not found" });
    return;
  }
  const enriched = await enrichVm(vm);
  res.json(GetVmResponse.parse(enriched));
});

router.patch("/vms/:id", async (req, res): Promise<void> => {
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

router.delete("/vms/:id", async (req, res): Promise<void> => {
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

  await db.update(vmsTable).set({ status: newStatus }).where(eq(vmsTable.id, vm.id));

  const eventTypeMap: Record<string, string> = { start: "vm_start", stop: "vm_stop", reboot: "vm_reboot", shutdown: "vm_stop" };
  await db.insert(activityTable).values({
    eventType: eventTypeMap[action] ?? action,
    description: message,
    vmId: vm.id,
    vmName: vm.name,
  });

  res.json(VmActionResponse.parse({ success: true, message, vmId: vm.id, action }));
});

export default router;
