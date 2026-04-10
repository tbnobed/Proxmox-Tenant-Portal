import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, tenantsTable, usersTable, vmsTable, tenantVmAccessTable } from "@workspace/db";
import {
  CreateTenantBody,
  GetTenantParams,
  UpdateTenantParams,
  UpdateTenantBody,
  DeleteTenantParams,
  GetTenantSummaryParams,
  ListTenantsResponse,
  GetTenantResponse,
  UpdateTenantResponse,
  GetTenantSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tenants", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.name);
  const userCounts = await db
    .select({ tenantId: usersTable.tenantId, count: sql<number>`count(*)::int` })
    .from(usersTable)
    .groupBy(usersTable.tenantId);
  const vmCounts = await db
    .select({ tenantId: vmsTable.tenantId, count: sql<number>`count(*)::int` })
    .from(vmsTable)
    .groupBy(vmsTable.tenantId);
  const ucMap = Object.fromEntries(userCounts.map(r => [r.tenantId, r.count]));
  const vcMap = Object.fromEntries(vmCounts.map(r => [r.tenantId, r.count]));

  const result = rows.map(t => ({
    ...t,
    userCount: ucMap[t.id] ?? 0,
    vmCount: vcMap[t.id] ?? 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
  res.json(ListTenantsResponse.parse(result));
});

router.post("/tenants", async (req, res): Promise<void> => {
  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tenant] = await db.insert(tenantsTable).values(parsed.data).returning();
  res.status(201).json(GetTenantResponse.parse({
    ...tenant,
    userCount: 0,
    vmCount: 0,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  }));
});

router.get("/tenants/:id", async (req, res): Promise<void> => {
  const params = GetTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, params.data.id));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const [uc] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.tenantId, tenant.id));
  const [vc] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.tenantId, tenant.id));
  res.json(GetTenantResponse.parse({
    ...tenant,
    userCount: uc?.count ?? 0,
    vmCount: vc?.count ?? 0,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  }));
});

router.patch("/tenants/:id", async (req, res): Promise<void> => {
  const params = UpdateTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name != null) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.contactEmail !== undefined) update.contactEmail = parsed.data.contactEmail;
  if (parsed.data.status != null) update.status = parsed.data.status;

  const [tenant] = await db.update(tenantsTable).set(update).where(eq(tenantsTable.id, params.data.id)).returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const [uc] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.tenantId, tenant.id));
  const [vc] = await db.select({ count: sql<number>`count(*)::int` }).from(vmsTable).where(eq(vmsTable.tenantId, tenant.id));
  res.json(UpdateTenantResponse.parse({
    ...tenant,
    userCount: uc?.count ?? 0,
    vmCount: vc?.count ?? 0,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  }));
});

router.delete("/tenants/:id", async (req, res): Promise<void> => {
  const params = DeleteTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tenant] = await db.delete(tenantsTable).where(eq(tenantsTable.id, params.data.id)).returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/tenants/:id/summary", async (req, res): Promise<void> => {
  const params = GetTenantSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, params.data.id));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const vmRows = await db.select({ status: vmsTable.status, count: sql<number>`count(*)::int` })
    .from(vmsTable)
    .where(eq(vmsTable.tenantId, params.data.id))
    .groupBy(vmsTable.status);
  const statusMap = Object.fromEntries(vmRows.map(r => [r.status, r.count]));
  const totalVms = vmRows.reduce((s, r) => s + r.count, 0);
  const [uc] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.tenantId, params.data.id));

  res.json(GetTenantSummaryResponse.parse({
    tenantId: params.data.id,
    totalVms,
    runningVms: statusMap["running"] ?? 0,
    stoppedVms: statusMap["stopped"] ?? 0,
    pausedVms: statusMap["paused"] ?? 0,
    totalUsers: uc?.count ?? 0,
  }));
});

export default router;
