import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import crypto from "node:crypto";
import { db, passwordResetTokensTable, usersTable } from "@workspace/db";
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

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  res.json({ message: "If an account with that email exists, a reset link has been sent." });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) return;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({
    token,
    userId: user.id,
    expiresAt,
  });

  const baseUrl = getAppBaseUrl(req);
  const resetUrl = `${baseUrl}/reset-password/${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#E6CAA7;margin:0;font-size:20px;">Password Reset</h2>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;color:#ccc;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 16px;">A password reset was requested for your ProxHub account (<strong>${user.username}</strong>).</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#53561F;color:#E6CAA7;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Reset Password</a>
      </div>
      <p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:11px;margin:0;">Sent by ProxHub</p>
    </div>
  </div>
</body>
</html>`;

  await sendEmail(user.email, "Password Reset", html);
});

router.get("/auth/reset-password/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [resetToken] = await db.select().from(passwordResetTokensTable).where(
    and(
      eq(passwordResetTokensTable.token, token),
      eq(passwordResetTokensTable.used, false),
      gt(passwordResetTokensTable.expiresAt, new Date())
    )
  );

  if (!resetToken) {
    res.status(404).json({ error: "Invalid or expired reset link" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resetToken.userId));
  res.json({ username: user?.username ?? "Unknown" });
});

router.post("/auth/reset-password/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [resetToken] = await db.select().from(passwordResetTokensTable).where(
    and(
      eq(passwordResetTokensTable.token, token),
      eq(passwordResetTokensTable.used, false),
      gt(passwordResetTokensTable.expiresAt, new Date())
    )
  );

  if (!resetToken) {
    res.status(404).json({ error: "Invalid or expired reset link" });
    return;
  }

  const passwordHash = await createHashedPassword(password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, resetToken.userId));
  await db.update(passwordResetTokensTable).set({ used: true }).where(eq(passwordResetTokensTable.id, resetToken.id));

  res.json({ message: "Password reset successfully. You can now log in." });
});

export default router;
