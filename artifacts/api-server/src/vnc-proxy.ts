import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import https from "node:https";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./lib/logger";

interface VncSession {
  host: string;
  port: number;
  node: string;
  vmId: number;
  type: string;
  ticket: string;
  vncTicket: string;
  vncPort: string;
  csrfToken: string;
  createdAt: number;
}

const sessions = new Map<string, VncSession>();

export function createVncSession(token: string, session: VncSession) {
  sessions.set(token, session);
  setTimeout(() => sessions.delete(token), 120_000);
}

export function setupVncProxy(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (clientWs: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      logger.warn("VNC proxy: no token provided");
      clientWs.close(4001, "No token");
      return;
    }

    const session = sessions.get(token);
    if (!session) {
      logger.warn("VNC proxy: invalid or expired token");
      clientWs.close(4002, "Invalid token");
      return;
    }

    sessions.delete(token);

    const vmType = session.type === "lxc" ? "lxc" : "qemu";
    const wsPath = `/api2/json/nodes/${session.node}/${vmType}/${session.vmId}/vncwebsocket?port=${session.vncPort}&vncticket=${encodeURIComponent(session.vncTicket)}`;
    const wsUrl = `wss://${session.host}:${session.port}${wsPath}`;

    logger.info({ wsUrl: wsUrl.split("?")[0] }, "VNC proxy: connecting to Proxmox");

    const proxmoxWs = new WebSocket(wsUrl, {
      headers: {
        Cookie: `PVEAuthCookie=${session.ticket}`,
      },
      rejectUnauthorized: false,
    });

    proxmoxWs.on("open", () => {
      logger.info("VNC proxy: connected to Proxmox VNC WebSocket");
    });

    proxmoxWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    proxmoxWs.on("close", (code, reason) => {
      logger.info({ code, reason: reason.toString() }, "VNC proxy: Proxmox WS closed");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason.toString());
      }
    });

    proxmoxWs.on("error", (err) => {
      logger.error({ err }, "VNC proxy: Proxmox WS error");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(4003, "Proxmox connection error");
      }
    });

    clientWs.on("message", (data) => {
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.send(data);
      }
    });

    clientWs.on("close", () => {
      logger.info("VNC proxy: client disconnected");
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.close();
      }
    });

    clientWs.on("error", (err) => {
      logger.error({ err }, "VNC proxy: client WS error");
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.close();
      }
    });
  });

  return wss;
}

export function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/vnc") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
}
