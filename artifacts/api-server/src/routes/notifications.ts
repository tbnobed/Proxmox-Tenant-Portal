import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/auth";
import { sendEmail, isEmailConfigured } from "../email";
import { sendDailyHealthDigest } from "../health-digest";
import { getSessionUser } from "../middleware/auth";

const router: IRouter = Router();

router.get("/notifications/status", requireAdmin, async (_req, res): Promise<void> => {
  res.json({
    configured: isEmailConfigured(),
    provider: "sendgrid",
    digestIntervalMs: parseInt(process.env.HEALTH_DIGEST_INTERVAL_MS ?? "", 10) || 86400000,
  });
});

router.post("/notifications/test", requireAdmin, async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email address required" });
    return;
  }
  const html = `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;color:#ccc;font-family:sans-serif;">
      <h2 style="color:#E6CAA7;margin:0 0 12px;">Test Notification</h2>
      <p>This is a test email from ProxHub. If you received this, email notifications are working correctly.</p>
      <p style="color:#888;font-size:12px;margin-top:16px;">Sent at ${new Date().toLocaleString()}</p>
    </div>`;
  const ok = await sendEmail(email, "Test Notification", html);
  if (ok) {
    res.json({ success: true, message: `Test email sent to ${email}` });
  } else {
    res.status(500).json({ error: "Failed to send email. Check SendGrid configuration." });
  }
});

router.post("/notifications/digest", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await sendDailyHealthDigest();
    res.json({ success: true, message: "Health digest sent to all admins" });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to send digest" });
  }
});

export default router;
