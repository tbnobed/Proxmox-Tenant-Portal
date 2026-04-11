import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantVmAccessTable, userVmAccessTable, tenantsTable, usersTable, vmsTable } from "@workspace/db";
import { notifyAccessChange } from "../notifications";
import { getSessionUser } from "../middleware/auth";
import {
  GrantTenantVmAccessBody,
  RevokeTenantVmAccessParams,
  GrantUserVmAccessBody,
  RevokeUserVmAccessParams,
  ListTenantVmAccessResponse,
  ListUserVmAccessResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/access/tenant-vms", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantVmAccessTable).orderBy(tenantVmAccessTable.grantedAt);
  const tenants = await db.select().from(tenantsTable);
  const vms = await db.select().from(vmsTable);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const vmMap = Object.fromEntries(vms.map(v => [v.id, v.name]));

  const result = rows.map(r => ({
    ...r,
    tenantName: tenantMap[r.tenantId] ?? "Unknown",
    vmName: vmMap[r.vmId] ?? "Unknown",
    grantedAt: r.grantedAt.toISOString(),
  }));
  res.json(ListTenantVmAccessResponse.parse(result));
});

router.post("/access/tenant-vms", async (req, res): Promise<void> => {
  const parsed = GrantTenantVmAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(tenantVmAccessTable).values(parsed.data).returning();
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, row.tenantId));
  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, row.vmId));
  res.status(201).json({
    ...row,
    tenantName: tenant?.name ?? "Unknown",
    vmName: vm?.name ?? "Unknown",
    grantedAt: row.grantedAt.toISOString(),
  });
  const sessionUser = getSessionUser(req);
  notifyAccessChange("granted", "tenant", tenant?.name ?? "Unknown", vm?.name ?? "Unknown", sessionUser?.username ?? "system").catch(() => {});
});

router.delete("/access/tenant-vms/:id", async (req, res): Promise<void> => {
  const params = RevokeTenantVmAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(tenantVmAccessTable).where(eq(tenantVmAccessTable.id, params.data.id));
  await db.delete(tenantVmAccessTable).where(eq(tenantVmAccessTable.id, params.data.id));
  res.sendStatus(204);
  if (existing) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, existing.tenantId));
    const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, existing.vmId));
    const sessionUser = getSessionUser(req);
    notifyAccessChange("revoked", "tenant", tenant?.name ?? "Unknown", vm?.name ?? "Unknown", sessionUser?.username ?? "system").catch(() => {});
  }
});

router.get("/access/user-vms", async (_req, res): Promise<void> => {
  const rows = await db.select().from(userVmAccessTable).orderBy(userVmAccessTable.grantedAt);
  const users = await db.select().from(usersTable);
  const vms = await db.select().from(vmsTable);
  const userMap = Object.fromEntries(users.map(u => [u.id, u.fullName ?? u.username]));
  const vmMap = Object.fromEntries(vms.map(v => [v.id, v.name]));

  const result = rows.map(r => ({
    ...r,
    userName: userMap[r.userId] ?? "Unknown",
    vmName: vmMap[r.vmId] ?? "Unknown",
    grantedAt: r.grantedAt.toISOString(),
  }));
  res.json(ListUserVmAccessResponse.parse(result));
});

router.post("/access/user-vms", async (req, res): Promise<void> => {
  const parsed = GrantUserVmAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(userVmAccessTable).values(parsed.data).returning();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, row.vmId));
  res.status(201).json({
    ...row,
    userName: user ? (user.fullName ?? user.username) : "Unknown",
    vmName: vm?.name ?? "Unknown",
    grantedAt: row.grantedAt.toISOString(),
  });
  const sessionUser = getSessionUser(req);
  notifyAccessChange("granted", "user", user?.fullName ?? user?.username ?? "Unknown", vm?.name ?? "Unknown", sessionUser?.username ?? "system").catch(() => {});
});

router.delete("/access/user-vms/:id", async (req, res): Promise<void> => {
  const params = RevokeUserVmAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(userVmAccessTable).where(eq(userVmAccessTable.id, params.data.id));
  await db.delete(userVmAccessTable).where(eq(userVmAccessTable.id, params.data.id));
  res.sendStatus(204);
  if (existing) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, existing.userId));
    const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, existing.vmId));
    const sessionUser = getSessionUser(req);
    notifyAccessChange("revoked", "user", user?.fullName ?? user?.username ?? "Unknown", vm?.name ?? "Unknown", sessionUser?.username ?? "system").catch(() => {});
  }
});

export default router;
