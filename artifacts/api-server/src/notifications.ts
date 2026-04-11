import { sendEmail, sendEmailToAdmins } from "./email";

function wrapHtml(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#E6CAA7;margin:0;font-size:20px;">${title}</h2>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;color:#ccc;font-size:14px;line-height:1.6;">
      ${body}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:11px;margin:0;">Sent by ProxHub &mdash; Proxmox Management Portal</p>
    </div>
  </div>
</body>
</html>`;
}

export async function notifyVmAction(
  vmName: string,
  vmId: number,
  action: string,
  node: string,
  performedBy: string
): Promise<void> {
  const actionColors: Record<string, string> = {
    start: "#22c55e",
    stop: "#ef4444",
    reboot: "#eab308",
    shutdown: "#f97316",
  };
  const color = actionColors[action] || "#999";
  const body = `
    <p style="margin:0 0 12px;">A VM action was performed:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">VM</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${vmName} (ID: ${vmId})</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Action</td><td style="padding:6px 0;"><span style="color:${color};font-weight:600;text-transform:uppercase;">${action}</span></td></tr>
      <tr><td style="padding:6px 0;color:#888;">Node</td><td style="padding:6px 0;color:#ccc;">${node}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Performed by</td><td style="padding:6px 0;color:#ccc;">${performedBy}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>`;
  await sendEmailToAdmins(`VM ${action.toUpperCase()}: ${vmName}`, wrapHtml(`VM ${action.charAt(0).toUpperCase() + action.slice(1)}`, body));
}

export async function notifyHealthAlert(
  clusterName: string,
  nodeName: string,
  level: "warning" | "critical",
  details: { cpu?: number; mem?: number; disk?: number }
): Promise<void> {
  const color = level === "critical" ? "#ef4444" : "#eab308";
  const label = level === "critical" ? "CRITICAL" : "WARNING";
  const metrics: string[] = [];
  if (details.cpu !== undefined) metrics.push(`<tr><td style="padding:4px 0;color:#888;">CPU</td><td style="padding:4px 0;color:#ccc;">${details.cpu.toFixed(1)}%</td></tr>`);
  if (details.mem !== undefined) metrics.push(`<tr><td style="padding:4px 0;color:#888;">RAM</td><td style="padding:4px 0;color:#ccc;">${details.mem.toFixed(1)}%</td></tr>`);
  if (details.disk !== undefined) metrics.push(`<tr><td style="padding:4px 0;color:#888;">Disk</td><td style="padding:4px 0;color:#ccc;">${details.disk.toFixed(1)}%</td></tr>`);

  const body = `
    <p style="margin:0 0 8px;"><span style="color:${color};font-weight:700;">${label}</span> — Node resource threshold exceeded</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">Cluster</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${clusterName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Node</td><td style="padding:6px 0;color:#ccc;">${nodeName}</td></tr>
      ${metrics.join("")}
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>`;
  await sendEmailToAdmins(`${label}: ${nodeName} on ${clusterName}`, wrapHtml(`Node Health ${label}`, body));
}

export async function notifyUserCreated(
  username: string,
  role: string,
  createdBy: string
): Promise<void> {
  const body = `
    <p style="margin:0 0 12px;">A new user account was created:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">Username</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${username}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Role</td><td style="padding:6px 0;color:#ccc;text-transform:capitalize;">${role}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Created by</td><td style="padding:6px 0;color:#ccc;">${createdBy}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>`;
  await sendEmailToAdmins(`New user: ${username}`, wrapHtml("User Created", body));
}

export async function notifyAccessChange(
  type: "granted" | "revoked",
  targetType: "user" | "tenant",
  targetName: string,
  vmName: string,
  performedBy: string
): Promise<void> {
  const color = type === "granted" ? "#22c55e" : "#ef4444";
  const label = type === "granted" ? "GRANTED" : "REVOKED";
  const body = `
    <p style="margin:0 0 12px;">VM access was ${type}:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">${targetType === "user" ? "User" : "Tenant"}</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${targetName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">VM</td><td style="padding:6px 0;color:#ccc;">${vmName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Action</td><td style="padding:6px 0;"><span style="color:${color};font-weight:600;">${label}</span></td></tr>
      <tr><td style="padding:6px 0;color:#888;">By</td><td style="padding:6px 0;color:#ccc;">${performedBy}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>`;
  await sendEmailToAdmins(`Access ${label}: ${targetName} → ${vmName}`, wrapHtml(`Access ${type.charAt(0).toUpperCase() + type.slice(1)}`, body));
}

export async function notifyInfrastructureRequest(
  requestType: string,
  priority: string,
  vmName: string,
  clusterName: string,
  submittedBy: string,
  tenantName: string | null,
  description: string | null
): Promise<void> {
  const isFirewall = requestType === "firewall";
  const typeLabel = isFirewall ? "Firewall Rule" : "Proxy Host";
  const typeColor = isFirewall ? "#3b82f6" : "#a855f7";
  const priorityColor = priority === "urgent" ? "#ef4444" : "#888";
  const body = `
    <p style="margin:0 0 12px;">A new infrastructure request was submitted:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">Type</td><td style="padding:6px 0;"><span style="color:${typeColor};font-weight:600;">${typeLabel}</span></td></tr>
      <tr><td style="padding:6px 0;color:#888;">Priority</td><td style="padding:6px 0;"><span style="color:${priorityColor};font-weight:600;text-transform:uppercase;">${priority}</span></td></tr>
      <tr><td style="padding:6px 0;color:#888;">VM</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${vmName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Cluster</td><td style="padding:6px 0;color:#ccc;">${clusterName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Submitted by</td><td style="padding:6px 0;color:#ccc;">${submittedBy}</td></tr>
      ${tenantName ? `<tr><td style="padding:6px 0;color:#888;">Tenant</td><td style="padding:6px 0;color:#ccc;">${tenantName}</td></tr>` : ""}
      ${description ? `<tr><td style="padding:6px 0;color:#888;">Description</td><td style="padding:6px 0;color:#ccc;">${description}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>
    <p style="margin:12px 0 0;color:#888;font-size:12px;">Log in to ProxHub to review this request.</p>`;
  await sendEmailToAdmins(`${priority === "urgent" ? "URGENT " : ""}Infrastructure Request: ${typeLabel} — ${vmName}`, wrapHtml("Infrastructure Request Submitted", body));
}

export async function notifyVmCreated(
  vmName: string,
  vmId: number,
  type: string,
  node: string,
  clusterName: string,
  createdBy: string
): Promise<void> {
  const body = `
    <p style="margin:0 0 12px;">A new virtual machine was created:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;width:120px;">VM</td><td style="padding:6px 0;color:#E6CAA7;font-weight:600;">${vmName} (VMID: ${vmId})</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Type</td><td style="padding:6px 0;color:#ccc;text-transform:uppercase;">${type}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Node</td><td style="padding:6px 0;color:#ccc;">${node}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Cluster</td><td style="padding:6px 0;color:#ccc;">${clusterName}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Created by</td><td style="padding:6px 0;color:#ccc;">${createdBy}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;color:#ccc;">${new Date().toLocaleString()}</td></tr>
    </table>`;
  await sendEmailToAdmins(`VM Created: ${vmName}`, wrapHtml("VM Created", body));
}
