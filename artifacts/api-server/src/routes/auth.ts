import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, usersTable, tenantsTable, userSessionsTable } from "@workspace/db";
import * as otplib from "otplib";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth.js";

const { generateSecret, generateURI, verifySync } = otplib;

const ENCRYPTION_KEY = process.env.SESSION_SECRET || "proxhub-2fa-encryption-key-change-me";

function encrypt2FASecret(plainSecret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "2fa-salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plainSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt2FASecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(":");
  if (parts.length !== 2) return encryptedSecret;
  const [ivHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "2fa-salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

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
  const { username, password, totpCode } = req.body;

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

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!totpCode) {
      res.json({ requiresTwoFactor: true });
      return;
    }

    const decryptedSecret = decrypt2FASecret(user.twoFactorSecret);
    const isValid = verifySync({ token: totpCode, secret: decryptedSecret });
    if (!isValid) {
      res.status(401).json({ error: "Invalid two-factor authentication code" });
      return;
    }
  }

  const now = new Date();
  await db.update(usersTable).set({ lastLoginAt: now }).where(eq(usersTable.id, user.id));

  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
  const userAgent = req.headers["user-agent"] || null;
  const [session] = await db.insert(userSessionsTable).values({
    userId: user.id,
    loginAt: now,
    ipAddress,
    userAgent,
  }).returning();

  (req.session as any).userId = user.id;
  (req.session as any).userRole = user.role;
  (req.session as any).tenantId = user.tenantId;
  (req.session as any).sessionRecordId = session.id;

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const sessionRecordId = (req.session as any)?.sessionRecordId;
  if (sessionRecordId) {
    await db.update(userSessionsTable).set({ logoutAt: new Date() }).where(eq(userSessionsTable.id, sessionRecordId));
  }
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

  let tenantName: string | null = null;
  if (user.tenantId) {
    const [tenant] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId));
    tenantName = tenant?.name ?? null;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
    tenantName,
    twoFactorEnabled: user.twoFactorEnabled,
  });
});

router.post("/auth/2fa/setup", requireAuth, async (req, res): Promise<void> => {
  const userId = (req.session as any).userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.twoFactorEnabled) {
    res.status(400).json({ error: "Two-factor authentication is already enabled" });
    return;
  }

  const secret = generateSecret();
  const otpauth = generateURI({ issuer: "ProxHub", label: user.email || user.username, secret, type: "totp" });

  const encryptedSecret = encrypt2FASecret(secret);
  await db.update(usersTable).set({ twoFactorSecret: encryptedSecret }).where(eq(usersTable.id, userId));

  const qrDataUrl = await QRCode.toDataURL(otpauth);

  res.json({ secret, qrCode: qrDataUrl });
});

router.post("/auth/2fa/verify", requireAuth, async (req, res): Promise<void> => {
  const userId = (req.session as any).userId;
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Verification code is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.twoFactorSecret) {
    res.status(400).json({ error: "2FA setup not initiated. Please start setup first." });
    return;
  }

  const decryptedSecret = decrypt2FASecret(user.twoFactorSecret);
  const isValid = verifySync({ token: code, secret: decryptedSecret });
  if (!isValid) {
    res.status(400).json({ error: "Invalid verification code. Please try again." });
    return;
  }

  await db.update(usersTable).set({ twoFactorEnabled: true }).where(eq(usersTable.id, userId));

  res.json({ ok: true, message: "Two-factor authentication enabled successfully" });
});

router.post("/auth/2fa/disable", requireAuth, async (req, res): Promise<void> => {
  const userId = (req.session as any).userId;
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: "Password is required to disable 2FA" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  await db.update(usersTable).set({ twoFactorEnabled: false, twoFactorSecret: null }).where(eq(usersTable.id, userId));

  res.json({ ok: true, message: "Two-factor authentication disabled" });
});

export default router;
