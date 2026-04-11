import type { Request, Response, NextFunction } from "express";

const PUBLIC_PATHS = ["/auth/login", "/auth/logout", "/healthz"];

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.some((p) => req.path === p)) {
    next();
    return;
  }

  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
