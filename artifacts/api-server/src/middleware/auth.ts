import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PUBLIC_PATHS = ["/auth/login", "/auth/logout", "/healthz"];

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (PUBLIC_PATHS.some((p) => req.path === p)) {
    next();
    return;
  }

  const s = req.session as any;
  if (!s?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, s.userId));
  if (!user || user.status !== "active") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  s.userRole = user.role;
  s.tenantId = user.tenantId;

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req.session as any)?.userRole;
  if (role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireOperatorOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req.session as any)?.userRole;
  if (role !== "admin" && role !== "operator") {
    res.status(403).json({ error: "Operator or admin access required" });
    return;
  }
  next();
}

export function getSessionUser(req: Request): { userId: number; userRole: string; tenantId: number | null } | null {
  const s = req.session as any;
  if (!s?.userId) return null;
  return { userId: s.userId, userRole: s.userRole || "viewer", tenantId: s.tenantId ?? null };
}
