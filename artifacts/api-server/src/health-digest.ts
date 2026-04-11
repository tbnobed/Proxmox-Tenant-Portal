import { db, clustersTable, vmsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getNodeStatuses } from "./proxmox-client";
import { sendEmailToAdmins } from "./email";

interface NodeHealth {
  clusterName: string;
  nodeName: string;
  status: string;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

export async function sendDailyHealthDigest(): Promise<void> {
  console.log("[Health Digest] Generating daily digest...");

  const clusters = await db.select().from(clustersTable);
  const allVms = await db.select({ id: vmsTable.id, status: vmsTable.status, clusterId: vmsTable.clusterId }).from(vmsTable);
  const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.status, "active"));

  const nodeHealths: NodeHealth[] = [];
  let offlineClusters = 0;

  for (const cluster of clusters) {
    try {
      const nodes = await getNodeStatuses(
        cluster.host, cluster.port, cluster.username, cluster.passwordHash, cluster.realm
      );
      for (const n of nodes) {
        const memPercent = n.memTotal > 0 ? (n.memUsed / n.memTotal) * 100 : 0;
        const diskPercent = n.rootFsTotal > 0 ? (n.rootFsUsed / n.rootFsTotal) * 100 : 0;
        nodeHealths.push({
          clusterName: cluster.name,
          nodeName: n.node,
          status: n.status,
          cpuPercent: n.cpuUsage * 100,
          memPercent,
          diskPercent,
        });
      }
    } catch {
      offlineClusters++;
    }
  }

  const totalVms = allVms.length;
  const runningVms = allVms.filter(v => v.status === "running").length;
  const stoppedVms = allVms.filter(v => v.status === "stopped").length;
  const warningNodes = nodeHealths.filter(n => n.cpuPercent >= 75 || n.memPercent >= 80 || n.diskPercent >= 85);
  const criticalNodes = nodeHealths.filter(n => n.cpuPercent >= 90 || n.memPercent >= 95 || n.diskPercent >= 95);

  const overallColor = criticalNodes.length > 0 ? "#ef4444" : warningNodes.length > 0 ? "#eab308" : "#22c55e";
  const overallStatus = criticalNodes.length > 0 ? "CRITICAL" : warningNodes.length > 0 ? "WARNING" : "HEALTHY";

  let nodeRows = "";
  for (const n of nodeHealths) {
    const cpuColor = n.cpuPercent >= 90 ? "#ef4444" : n.cpuPercent >= 75 ? "#eab308" : "#22c55e";
    const memColor = n.memPercent >= 95 ? "#ef4444" : n.memPercent >= 80 ? "#eab308" : "#22c55e";
    const diskColor = n.diskPercent >= 95 ? "#ef4444" : n.diskPercent >= 85 ? "#eab308" : "#22c55e";
    nodeRows += `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:8px;color:#E6CAA7;">${n.clusterName}</td>
        <td style="padding:8px;color:#ccc;">${n.nodeName}</td>
        <td style="padding:8px;color:${n.status === 'online' ? '#22c55e' : '#ef4444'};text-transform:uppercase;font-size:11px;">${n.status}</td>
        <td style="padding:8px;color:${cpuColor};">${n.cpuPercent.toFixed(1)}%</td>
        <td style="padding:8px;color:${memColor};">${n.memPercent.toFixed(1)}%</td>
        <td style="padding:8px;color:${diskColor};">${n.diskPercent.toFixed(1)}%</td>
      </tr>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#E6CAA7;margin:0;font-size:22px;">Daily Health Digest</h2>
      <p style="color:#888;font-size:12px;margin:4px 0 0;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
    </div>

    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin-bottom:16px;">
      <div style="text-align:center;margin-bottom:16px;">
        <span style="color:${overallColor};font-size:18px;font-weight:700;">${overallStatus}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px;color:#888;text-align:center;">Clusters</td>
          <td style="padding:6px;color:#888;text-align:center;">Nodes</td>
          <td style="padding:6px;color:#888;text-align:center;">VMs</td>
          <td style="padding:6px;color:#888;text-align:center;">Users</td>
        </tr>
        <tr>
          <td style="padding:6px;color:#E6CAA7;text-align:center;font-size:20px;font-weight:700;">${clusters.length - offlineClusters}/${clusters.length}</td>
          <td style="padding:6px;color:#E6CAA7;text-align:center;font-size:20px;font-weight:700;">${nodeHealths.length}</td>
          <td style="padding:6px;color:#E6CAA7;text-align:center;font-size:20px;font-weight:700;">${runningVms}/${totalVms}</td>
          <td style="padding:6px;color:#E6CAA7;text-align:center;font-size:20px;font-weight:700;">${userCount?.count ?? 0}</td>
        </tr>
        <tr>
          <td style="padding:2px;color:#666;text-align:center;font-size:10px;">online</td>
          <td style="padding:2px;color:#666;text-align:center;font-size:10px;">total</td>
          <td style="padding:2px;color:#666;text-align:center;font-size:10px;">running / total</td>
          <td style="padding:2px;color:#666;text-align:center;font-size:10px;">active</td>
        </tr>
      </table>
    </div>

    ${nodeHealths.length > 0 ? `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin-bottom:16px;">
      <h3 style="color:#E6CAA7;margin:0 0 12px;font-size:14px;">Node Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="border-bottom:1px solid #444;">
          <th style="padding:8px;color:#888;text-align:left;">Cluster</th>
          <th style="padding:8px;color:#888;text-align:left;">Node</th>
          <th style="padding:8px;color:#888;text-align:left;">Status</th>
          <th style="padding:8px;color:#888;text-align:left;">CPU</th>
          <th style="padding:8px;color:#888;text-align:left;">RAM</th>
          <th style="padding:8px;color:#888;text-align:left;">Disk</th>
        </tr>
        ${nodeRows}
      </table>
    </div>` : ""}

    ${criticalNodes.length > 0 ? `
    <div style="background:#1a1a1a;border:1px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:16px;">
      <h3 style="color:#ef4444;margin:0 0 8px;font-size:14px;">Critical Nodes (${criticalNodes.length})</h3>
      ${criticalNodes.map(n => `<p style="color:#ccc;margin:4px 0;font-size:12px;">${n.clusterName} / ${n.nodeName} — CPU: ${n.cpuPercent.toFixed(1)}% | RAM: ${n.memPercent.toFixed(1)}% | Disk: ${n.diskPercent.toFixed(1)}%</p>`).join("")}
    </div>` : ""}

    ${warningNodes.length > 0 ? `
    <div style="background:#1a1a1a;border:1px solid #eab308;border-radius:8px;padding:16px;margin-bottom:16px;">
      <h3 style="color:#eab308;margin:0 0 8px;font-size:14px;">Warning Nodes (${warningNodes.length})</h3>
      ${warningNodes.map(n => `<p style="color:#ccc;margin:4px 0;font-size:12px;">${n.clusterName} / ${n.nodeName} — CPU: ${n.cpuPercent.toFixed(1)}% | RAM: ${n.memPercent.toFixed(1)}% | Disk: ${n.diskPercent.toFixed(1)}%</p>`).join("")}
    </div>` : ""}

    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:11px;margin:0;">Sent by ProxHub &mdash; Proxmox Management Portal</p>
    </div>
  </div>
</body>
</html>`;

  await sendEmailToAdmins("Daily Health Digest", html);
  console.log("[Health Digest] Sent successfully.");
}

let digestInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthDigestScheduler(): void {
  const intervalMs = parseInt(process.env.HEALTH_DIGEST_INTERVAL_MS ?? "", 10) || 24 * 60 * 60 * 1000;
  console.log(`[Health Digest] Scheduler started (interval: ${intervalMs / 1000}s)`);
  digestInterval = setInterval(() => {
    sendDailyHealthDigest().catch(err => console.error("[Health Digest] Error:", err));
  }, intervalMs);
}

export function stopHealthDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
  }
}
