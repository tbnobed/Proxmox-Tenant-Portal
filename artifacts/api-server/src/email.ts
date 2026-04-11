import sgMail from "@sendgrid/mail";

interface EmailConfig {
  apiKey: string;
  fromEmail: string;
}

async function getConfigFromReplit(): Promise<EmailConfig | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (!hostname || !xReplitToken) return null;

    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=sendgrid`,
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
    );
    const data = await res.json();
    const conn = data.items?.[0];
    if (!conn?.settings?.api_key || !conn?.settings?.from_email) return null;
    return { apiKey: conn.settings.api_key, fromEmail: conn.settings.from_email };
  } catch {
    return null;
  }
}

function getConfigFromEnv(): EmailConfig | null {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail };
}

async function getEmailConfig(): Promise<EmailConfig | null> {
  const envConfig = getConfigFromEnv();
  if (envConfig) return envConfig;
  return getConfigFromReplit();
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const config = await getEmailConfig();
  if (!config) {
    console.warn("Email not configured — skipping notification");
    return false;
  }

  try {
    sgMail.setApiKey(config.apiKey);
    await sgMail.send({
      to,
      from: config.fromEmail,
      subject: `[ProxHub] ${subject}`,
      html,
    });
    return true;
  } catch (err: any) {
    console.error("SendGrid error:", err?.response?.body || err.message);
    return false;
  }
}

export async function sendEmailToAdmins(subject: string, html: string): Promise<void> {
  const { db, usersTable } = await import("@workspace/db");
  const { eq, and } = await import("drizzle-orm");

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.role, "admin"), eq(usersTable.status, "active")));

  const adminEmails = admins.map(a => a.email).filter(Boolean) as string[];
  if (adminEmails.length === 0) return;

  for (const email of adminEmails) {
    await sendEmail(email, subject, html);
  }
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) ||
    !!process.env.REPLIT_CONNECTORS_HOSTNAME;
}
