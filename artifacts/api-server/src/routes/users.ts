import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, tenantsTable, userVmAccessTable } from "@workspace/db";
import {
  CreateUserBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ListUsersResponse,
  GetUserResponse,
  UpdateUserResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.username);
  const tenantRows = await db.select().from(tenantsTable);
  const tenantMap = Object.fromEntries(tenantRows.map(t => [t.id, t.name]));
  const vmCounts = await db
    .select({ userId: userVmAccessTable.userId, count: sql<number>`count(*)::int` })
    .from(userVmAccessTable)
    .groupBy(userVmAccessTable.userId);
  const vcMap = Object.fromEntries(vmCounts.map(r => [r.userId, r.count]));

  const result = rows.map(u => ({
    ...u,
    fullName: u.fullName,
    tenantName: u.tenantId ? tenantMap[u.tenantId] ?? null : null,
    vmCount: vcMap[u.id] ?? 0,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
  res.json(ListUsersResponse.parse(result));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const [user] = await db.insert(usersTable).values({
    ...rest,
    passwordHash: password,
    status: "active",
  }).returning();
  const tenant = user.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)) : [];
  res.status(201).json(GetUserResponse.parse({
    ...user,
    tenantName: tenant[0]?.name ?? null,
    vmCount: 0,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const tenant = user.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)) : [];
  const [vc] = await db.select({ count: sql<number>`count(*)::int` }).from(userVmAccessTable).where(eq(userVmAccessTable.userId, user.id));
  res.json(GetUserResponse.parse({
    ...user,
    tenantName: tenant[0]?.name ?? null,
    vmCount: vc?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const update: Record<string, unknown> = {};
  if (rest.username != null) update.username = rest.username;
  if (rest.email != null) update.email = rest.email;
  if (rest.fullName !== undefined) update.fullName = rest.fullName;
  if (rest.role != null) update.role = rest.role;
  if (rest.tenantId !== undefined) update.tenantId = rest.tenantId;
  if (rest.status != null) update.status = rest.status;
  if (password != null) update.passwordHash = password;

  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const tenant = user.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)) : [];
  const [vc] = await db.select({ count: sql<number>`count(*)::int` }).from(userVmAccessTable).where(eq(userVmAccessTable.userId, user.id));
  res.json(UpdateUserResponse.parse({
    ...user,
    tenantName: tenant[0]?.name ?? null,
    vmCount: vc?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
