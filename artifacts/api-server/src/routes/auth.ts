import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.includes(":")) {
    const [salt, hash] = stored.split(":");
    const derived = await hashPassword(password, salt);
    return derived === hash;
  }
  return password === stored;
}

export async function createHashedPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  return `${salt}:${hash}`;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (!user.passwordHash.includes(":")) {
    const hashed = await createHashedPassword(password);
    await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, user.id));
  }

  (req.session as any).userId = user.id;
  (req.session as any).role = user.role;

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user || user.status !== "active") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
});

export default router;
