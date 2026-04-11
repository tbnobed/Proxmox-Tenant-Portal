import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, infrastructureRequestsTable, usersTable } from "@workspace/db";
import {
  ListRequestsQueryParams,
  CreateRequestBody,
  GetRequestParams,
  ReviewRequestParams,
  ReviewRequestBody,
} from "@workspace/api-zod";
import { getSessionUser, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

function formatRequest(r: typeof infrastructureRequestsTable.$inferSelect) {
  return {
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/requests", async (req, res): Promise<void> => {
  const query = ListRequestsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const sessionUser = getSessionUser(req);
  const isAdmin = sessionUser?.userRole === "admin";

  const conditions = [];
  if (query.data.status) conditions.push(eq(infrastructureRequestsTable.status, query.data.status));
  if (query.data.requestType) conditions.push(eq(infrastructureRequestsTable.requestType, query.data.requestType));

  if (!isAdmin && sessionUser) {
    conditions.push(eq(infrastructureRequestsTable.requestedById, sessionUser.userId));
  }

  const rows = await db
    .select()
    .from(infrastructureRequestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(infrastructureRequestsTable.createdAt));

  res.json(rows.map(formatRequest));
});

router.get("/requests/:id", async (req, res): Promise<void> => {
  const params = GetRequestParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessionUser = getSessionUser(req);
  const [row] = await db
    .select()
    .from(infrastructureRequestsTable)
    .where(eq(infrastructureRequestsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (sessionUser?.userRole !== "admin" && row.requestedById !== sessionUser?.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(formatRequest(row));
});

router.post("/requests", async (req, res): Promise<void> => {
  const body = CreateRequestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, sessionUser.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let tenantName: string | null = null;
  if (sessionUser.tenantId) {
    const { tenantsTable } = await import("@workspace/db");
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, sessionUser.tenantId));
    if (tenant) tenantName = tenant.name;
  }

  const validTypes = ["firewall", "proxy_host"];
  if (!validTypes.includes(body.data.requestType)) {
    res.status(400).json({ error: "Invalid request type. Must be 'firewall' or 'proxy_host'" });
    return;
  }

  const validPriorities = ["normal", "urgent"];
  if (body.data.priority && !validPriorities.includes(body.data.priority)) {
    res.status(400).json({ error: "Invalid priority. Must be 'normal' or 'urgent'" });
    return;
  }

  const [row] = await db
    .insert(infrastructureRequestsTable)
    .values({
      ...body.data,
      requestedById: sessionUser.userId,
      requestedByName: user.fullName || user.username,
      tenantId: sessionUser.tenantId ?? null,
      tenantName,
    })
    .returning();

  res.status(201).json(formatRequest(row));

  import("../notifications").then(({ notifyInfrastructureRequest }) => {
    notifyInfrastructureRequest(
      row.requestType,
      row.priority,
      row.vmName,
      row.clusterName,
      row.requestedByName,
      row.tenantName,
      row.description
    ).catch(() => {});
  });
});

router.post("/requests/:id/review", requireAdmin, async (req, res): Promise<void> => {
  const params = ReviewRequestParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReviewRequestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (!["approved", "denied", "completed"].includes(body.data.status)) {
    res.status(400).json({ error: "Status must be 'approved', 'denied', or 'completed'" });
    return;
  }

  const sessionUser = getSessionUser(req);
  const [adminUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, sessionUser!.userId));

  const [existing] = await db
    .select()
    .from(infrastructureRequestsTable)
    .where(eq(infrastructureRequestsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (body.data.status === "completed" && existing.status !== "approved") {
    res.status(400).json({ error: "Only approved requests can be marked as completed" });
    return;
  }

  if (["approved", "denied"].includes(body.data.status) && existing.status !== "pending") {
    res.status(400).json({ error: "Request has already been reviewed" });
    return;
  }

  const [updated] = await db
    .update(infrastructureRequestsTable)
    .set({
      status: body.data.status,
      adminNotes: body.data.adminNotes ?? existing.adminNotes,
      reviewedById: sessionUser!.userId,
      reviewedByName: adminUser?.fullName || adminUser?.username || "Admin",
      reviewedAt: new Date(),
    })
    .where(eq(infrastructureRequestsTable.id, params.data.id))
    .returning();

  res.json(formatRequest(updated));

  if (existing.requestedById) {
    const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, existing.requestedById));
    if (requester?.email) {
      const reviewerName = adminUser?.fullName || adminUser?.username || "Admin";
      if (body.data.status === "completed") {
        import("../notifications").then(({ notifyRequestCompleted }) => {
          notifyRequestCompleted(
            requester.email!,
            existing.requestType,
            existing.vmName,
            existing.clusterName,
            reviewerName,
            body.data.adminNotes ?? null
          ).catch(() => {});
        });
      } else {
        import("../notifications").then(({ notifyRequestReviewed }) => {
          notifyRequestReviewed(
            requester.email!,
            body.data.status as "approved" | "denied",
            existing.requestType,
            existing.vmName,
            existing.clusterName,
            reviewerName,
            body.data.adminNotes ?? null
          ).catch(() => {});
        });
      }
    }
  }
});

export default router;
