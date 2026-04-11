import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import crypto from "node:crypto";
import { db, inviteTokensTable, usersTable, tenantsTable } from "@workspace/db";
import { requireAdmin, getSessionUser } from "../middleware/auth";
import { createHashedPassword } from "./auth";
import { sendEmail } from "../email";

const router: IRouter = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getAppBaseUrl(req: any): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

router.post("/invites", requireAdmin, async (req, res): Promise<void> => {
  const { email, role, tenantId } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const sessionUser = getSessionUser(req);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db.insert(inviteTokensTable).values({
    token,
    email,
    role: role || "viewer",
    tenantId: tenantId || null,
    invitedBy: sessionUser?.username ?? "admin",
    expiresAt,
  }).returning();

  const baseUrl = getAppBaseUrl(req);
  const inviteUrl = `${baseUrl}/invite/${token}`;

  const tenant = tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)) : [];
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#E6CAA7;margin:0;font-size:20px;">You're Invited to ProxHub</h2>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;color:#ccc;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 16px;">You've been invited to join ProxHub — a Proxmox management portal.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#888;width:100px;">Role</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;text-transform:capitalize;">${role || "viewer"}</td></tr>
        ${tenant[0] ? `<tr><td style="padding:6px 0;color:#888;">Tenant</td><td style="padding:6px 0;color:#ccc;">${tenant[0].name}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#888;">Invited by</td><td style="padding:6px 0;color:#ccc;">${sessionUser?.username ?? "admin"}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Expires</td><td style="padding:6px 0;color:#ccc;">${expiresAt.toLocaleDateString()}</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#53561F;color:#E6CAA7;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Accept Invitation</a>
      </div>
      <p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">This link expires in 7 days.</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:11px;margin:0;">Sent by ProxHub</p>
    </div>
  </div>
</body>
</html>`;

  const sent = await sendEmail(email, "You're Invited to ProxHub", html);

  res.status(201).json({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    tenantId: invite.tenantId,
    invitedBy: invite.invitedBy,
    expiresAt: invite.expiresAt.toISOString(),
    emailSent: sent,
  });
});

router.get("/invites", requireAdmin, async (_req, res): Promise<void> => {
  const invites = await db.select().from(inviteTokensTable).orderBy(inviteTokensTable.createdAt);
  const tenants = await db.select().from(tenantsTable);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

  res.json(invites.map(i => ({
    id: i.id,
    email: i.email,
    role: i.role,
    tenantId: i.tenantId,
    tenantName: i.tenantId ? tenantMap[i.tenantId] ?? null : null,
    invitedBy: i.invitedBy,
    used: i.used,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    expired: new Date() > i.expiresAt,
  })));
});

router.post("/invites/:id/resend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid invite id" });
    return;
  }

  const [invite] = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.id, id));
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (invite.used) {
    res.status(400).json({ error: "This invite has already been accepted" });
    return;
  }

  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const newToken = invite.expiresAt < new Date() ? generateToken() : invite.token;

  await db.update(inviteTokensTable).set({
    expiresAt: newExpiry,
    ...(newToken !== invite.token ? { token: newToken } : {}),
  }).where(eq(inviteTokensTable.id, id));

  const baseUrl = getAppBaseUrl(req);
  const inviteUrl = `${baseUrl}/invite/${newToken}`;

  const tenant = invite.tenantId ? await db.select().from(tenantsTable).where(eq(tenantsTable.id, invite.tenantId)) : [];
  const sessionUser = getSessionUser(req);
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#E6CAA7;margin:0;font-size:20px;">Reminder: You're Invited to ProxHub</h2>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;color:#ccc;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 16px;">This is a reminder that you've been invited to join ProxHub — a Proxmox management portal.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#888;width:100px;">Role</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;text-transform:capitalize;">${invite.role}</td></tr>
        ${tenant[0] ? `<tr><td style="padding:6px 0;color:#888;">Tenant</td><td style="padding:6px 0;color:#ccc;">${tenant[0].name}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#888;">Invited by</td><td style="padding:6px 0;color:#ccc;">${invite.invitedBy}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Expires</td><td style="padding:6px 0;color:#ccc;">${newExpiry.toLocaleDateString()}</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#53561F;color:#E6CAA7;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Accept Invitation</a>
      </div>
      <p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">This link expires in 7 days.</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:11px;margin:0;">Sent by ProxHub</p>
    </div>
  </div>
</body>
</html>`;

  const sent = await sendEmail(invite.email, "Reminder: You're Invited to ProxHub", html);

  res.json({
    id: invite.id,
    email: invite.email,
    expiresAt: newExpiry.toISOString(),
    emailSent: sent,
  });
});

router.delete("/invites/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid invite id" });
    return;
  }
  await db.delete(inviteTokensTable).where(eq(inviteTokensTable.id, id));
  res.sendStatus(204);
});

router.get("/auth/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [invite] = await db.select().from(inviteTokensTable).where(
    and(
      eq(inviteTokensTable.token, token),
      eq(inviteTokensTable.used, false),
      gt(inviteTokensTable.expiresAt, new Date())
    )
  );

  if (!invite) {
    res.status(404).json({ error: "Invalid or expired invite link" });
    return;
  }

  res.json({
    email: invite.email,
    role: invite.role,
    tenantId: invite.tenantId,
  });
});

router.post("/auth/invite/:token/accept", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { username, password, fullName } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [invite] = await db.select().from(inviteTokensTable).where(
    and(
      eq(inviteTokensTable.token, token),
      eq(inviteTokensTable.used, false),
      gt(inviteTokensTable.expiresAt, new Date())
    )
  );

  if (!invite) {
    res.status(404).json({ error: "Invalid or expired invite link" });
    return;
  }

  const existingUser = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUser.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }
  const existingEmail = await db.select().from(usersTable).where(eq(usersTable.email, invite.email));
  if (existingEmail.length > 0) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const passwordHash = await createHashedPassword(password);
  const [user] = await db.insert(usersTable).values({
    username,
    email: invite.email,
    fullName: fullName || null,
    role: invite.role,
    tenantId: invite.tenantId,
    passwordHash,
    status: "active",
  }).returning();

  await db.update(inviteTokensTable).set({ used: true }).where(eq(inviteTokensTable.id, invite.id));

  (req.session as any).userId = user.id;
  (req.session as any).userRole = user.role;
  (req.session as any).tenantId = user.tenantId;

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
});

export default router;
