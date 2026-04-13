import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { db, vmsTable, clustersTable, userVmAccessTable, tenantVmAccessTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getVmCurrentStatus } from "./proxmox-client";
import { logger } from "./lib/logger";

interface SessionUser {
  userId: number;
  userRole: string;
  tenantId: number | null;
}

interface ClientSubscription {
  ws: WebSocket;
  user: SessionUser;
  vmList: boolean;
  vmIds: Set<number>;
}

const clients = new Map<WebSocket, ClientSubscription>();
let liveWss: WebSocketServer | null = null;

const VM_POLL_INTERVAL_MS = 10_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function setupLiveUpdates(): WebSocketServer {
  liveWss = new WebSocketServer({ noServer: true });

  liveWss.on("connection", (ws: WebSocket, req: IncomingMessage, user: SessionUser) => {
    const sub: ClientSubscription = { ws, user, vmList: false, vmIds: new Set() };
    clients.set(ws, sub);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(sub, msg);
      } catch {}
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "connected" }));
  });

  startPolling();

  return liveWss;
}

async function getAllowedVmIds(userId: number, tenantId: number | null): Promise<number[]> {
  const directAccess = await db
    .select({ vmId: userVmAccessTable.vmId })
    .from(userVmAccessTable)
    .where(eq(userVmAccessTable.userId, userId));

  const vmIds = new Set(directAccess.map((r) => r.vmId));

  if (tenantId) {
    const tenantAccess = await db
      .select({ vmId: tenantVmAccessTable.vmId })
      .from(tenantVmAccessTable)
      .where(eq(tenantVmAccessTable.tenantId, tenantId));
    for (const r of tenantAccess) vmIds.add(r.vmId);
  }

  return Array.from(vmIds);
}

function handleClientMessage(sub: ClientSubscription, msg: any) {
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "subscribe:vm-list":
      sub.vmList = true;
      sendVmListSnapshot(sub);
      break;
    case "unsubscribe:vm-list":
      sub.vmList = false;
      break;
    case "subscribe:vm":
      if (typeof msg.vmId === "number") {
        sub.vmIds.add(msg.vmId);
      }
      break;
    case "unsubscribe:vm":
      if (typeof msg.vmId === "number") {
        sub.vmIds.delete(msg.vmId);
      }
      break;
  }
}

async function sendVmListSnapshot(sub: ClientSubscription) {
  try {
    let vms;
    if (sub.user.userRole === "admin") {
      vms = await db.select({
        id: vmsTable.id,
        vmId: vmsTable.vmId,
        name: vmsTable.name,
        status: vmsTable.status,
        node: vmsTable.node,
        type: vmsTable.type,
      }).from(vmsTable);
    } else {
      const allowedIds = await getAllowedVmIds(sub.user.userId, sub.user.tenantId);
      if (allowedIds.length === 0) {
        if (sub.ws.readyState === WebSocket.OPEN) {
          sub.ws.send(JSON.stringify({ type: "vm-list", data: [] }));
        }
        return;
      }
      vms = await db.select({
        id: vmsTable.id,
        vmId: vmsTable.vmId,
        name: vmsTable.name,
        status: vmsTable.status,
        node: vmsTable.node,
        type: vmsTable.type,
      }).from(vmsTable).where(inArray(vmsTable.id, allowedIds));
    }

    if (sub.ws.readyState === WebSocket.OPEN) {
      sub.ws.send(JSON.stringify({ type: "vm-list", data: vms }));
    }
  } catch (err) {
    logger.error({ err }, "Failed to send VM list snapshot");
  }
}

export function broadcastVmStatusChange(vmId: number, dbId: number, status: string, name: string) {
  const msg = JSON.stringify({
    type: "vm-status",
    data: { id: dbId, vmId, status, name },
  });

  for (const [ws, sub] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (sub.vmList || sub.vmIds.has(dbId)) {
      ws.send(msg);
    }
  }
}

export function broadcastVmListUpdate() {
  for (const [, sub] of clients) {
    if (sub.ws.readyState !== WebSocket.OPEN) continue;
    if (sub.vmList) {
      sendVmListSnapshot(sub);
    }
  }
}

async function pollVmMetrics() {
  const subscribedVmIds = new Set<number>();
  for (const [, sub] of clients) {
    for (const id of sub.vmIds) {
      subscribedVmIds.add(id);
    }
  }

  if (subscribedVmIds.size === 0) return;

  const vmIds = Array.from(subscribedVmIds);
  const vms = await db.select().from(vmsTable).where(inArray(vmsTable.id, vmIds));

  if (vms.length === 0) return;

  const clusterIds = [...new Set(vms.map(v => v.clusterId))];
  const clusters = await db.select().from(clustersTable).where(inArray(clustersTable.id, clusterIds));
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  for (const vm of vms) {
    const cluster = clusterMap.get(vm.clusterId);
    if (!cluster?.passwordHash) continue;

    try {
      const currentStatus = await getVmCurrentStatus(
        cluster.host, cluster.port, cluster.username, cluster.passwordHash,
        cluster.realm, vm.node, vm.vmId, vm.type
      );

      if (currentStatus.status !== vm.status) {
        await db.update(vmsTable).set({ status: currentStatus.status }).where(eq(vmsTable.id, vm.id));
        broadcastVmStatusChange(vm.vmId, vm.id, currentStatus.status, vm.name);
      }

      const msg = JSON.stringify({
        type: "vm-metrics",
        data: {
          id: vm.id,
          vmId: vm.vmId,
          status: currentStatus.status,
          cpu: currentStatus.cpu,
          mem: currentStatus.mem,
          maxmem: currentStatus.maxmem,
          disk: currentStatus.disk,
          maxdisk: currentStatus.maxdisk,
          netin: currentStatus.netin,
          netout: currentStatus.netout,
          diskread: currentStatus.diskread,
          diskwrite: currentStatus.diskwrite,
          uptime: currentStatus.uptime,
          timestamp: Date.now(),
        },
      });

      for (const [ws, sub] of clients) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (sub.vmIds.has(vm.id)) {
          ws.send(msg);
        }
      }
    } catch (err) {
      logger.debug({ err, vmId: vm.vmId }, "Failed to poll VM metrics");
    }
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    pollVmMetrics().catch(err => {
      logger.error({ err }, "VM metrics polling error");
    });
  }, VM_POLL_INTERVAL_MS);
  logger.info({ intervalMs: VM_POLL_INTERVAL_MS }, "[Live Updates] Metrics polling started");
}

export function handleLiveUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  sessionMiddleware: any
) {
  sessionMiddleware(req as any, {} as any, () => {
    const session = (req as any).session;
    if (!session?.userId) {
      logger.warn("WebSocket upgrade rejected: no valid session");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const user: SessionUser = {
      userId: session.userId,
      userRole: session.userRole ?? "viewer",
      tenantId: session.tenantId ?? null,
    };

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });
}
